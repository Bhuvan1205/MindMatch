import sys
import os

# Ensure backend/ is on the path regardless of where uvicorn is launched from
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uuid

from sqlalchemy.orm import Session

from interview_module import interview_questions, validate_response
from profile_extractor import extract_profile
from embedding_generator import generate_embeddings
from vector_store import store_profile_embedding, perform_similarity
from reranker import fetch_candidate_profiles, rerank_candidates
from chat_service import send_message as chat_send_message, get_history as chat_get_history, stream_message as chat_stream_message
from memory_manager import end_session as memory_end_session
from auth import (
    hash_password, verify_password,
    create_access_token,
    verify_google_token,
    get_current_user,
)
from database import engine, get_db
from models import Base, User, UserProfile

app = FastAPI()

# =========================================================
# CREATE TABLES ON STARTUP
# =========================================================

@app.on_event('startup')
def create_tables():
    Base.metadata.create_all(bind=engine)

# =========================================================
# CORS — allows the frontend to call the API
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# IN-MEMORY SESSION STORE
# =========================================================

sessions: dict = {}

# Flatten question bank into a single ordered list (preserves category order)
ALL_QUESTIONS = [q for questions in interview_questions.values() for q in questions]

# =========================================================
# REQUEST / RESPONSE MODELS
# =========================================================

class StartResponse(BaseModel):
    session_id: str
    question: str
    question_index: int
    total_questions: int


class RespondRequest(BaseModel):
    session_id: str
    answer: str


class RespondResponse(BaseModel):
    status: str                 # "next" | "done" | "retry" | "clarify"
    message: str | None         # agent message for retry / clarify / fallback
    question: str | None        # next question (when status == "next")
    question_index: int | None
    total_questions: int
    chat_history: dict | None   # only populated when status == "done"


class ExtractProfileRequest(BaseModel):
    chat_history: dict          # the chat_history dict returned by /interview/respond when status == "done"


class SimilarityRequest(BaseModel):
    user_id: str                # ChromaDB / PostgreSQL profile UUID to find matches for


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str             # Google ID token from the frontend


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str | None
    email: str | None


# =========================================================
# ROUTES
# =========================================================


# ─────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────

@app.post('/auth/register', response_model=AuthResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new account with username + email + password.
    Returns a JWT access token on success.
    """
    # Check for duplicates
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="That username is already taken.")

    user = User(
        username        = body.username,
        email           = body.email,
        hashed_password = hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id))
    return AuthResponse(
        access_token = token,
        user_id      = str(user.id),
        username     = user.username,
        email        = user.email,
    )


@app.post('/auth/login', response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Sign in with email + password.
    Returns a JWT access token on success.
    """
    user = db.query(User).filter(User.email == body.email).first()

    if user is None or user.hashed_password is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(str(user.id))
    return AuthResponse(
        access_token = token,
        user_id      = str(user.id),
        username     = user.username,
        email        = user.email,
    )


@app.post('/auth/google', response_model=AuthResponse)
def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Verify a Google ID token from the frontend.
    Creates a new account on first sign-in, or signs in the existing account.
    Returns a JWT access token.
    """
    id_info   = verify_google_token(body.credential)
    google_id = id_info["sub"]
    email     = id_info.get("email")
    name      = id_info.get("name")

    user = db.query(User).filter(User.google_id == google_id).first()

    if user is None:
        # First Google sign-in — create the account
        # If an account already exists with this email, link them
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
        else:
            user = User(
                email     = email,
                username  = name,
                google_id = google_id,
            )
            db.add(user)

        db.commit()
        db.refresh(user)

    token = create_access_token(str(user.id))
    return AuthResponse(
        access_token = token,
        user_id      = str(user.id),
        username     = user.username,
        email        = user.email,
    )


@app.get('/auth/me')
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's details.
    Used by the frontend to hydrate auth state on page refresh.
    """
    return {
        "user_id":  str(current_user.id),
        "username": current_user.username,
        "email":    current_user.email,
    }

@app.get('/')
def home():
    return {"message": "Welcome to MindMatch"}


@app.post('/interview/start', response_model=StartResponse)
def start_interview():
    """
    Initialises a new interview session.
    Returns the session ID and the first question.
    """
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "current_index": 0,
        "retry_count": 0,
        "chat_history": {},
        "last_answer": "",
    }
    return StartResponse(
        session_id=session_id,
        question=ALL_QUESTIONS[0],
        question_index=0,
        total_questions=len(ALL_QUESTIONS),
    )


@app.post('/interview/respond', response_model=RespondResponse)
def respond_to_interview(body: RespondRequest):
    """
    Accepts the user's answer for the current question.
    Delegates validation to validate_response() in interview_module.py —
    same prompt, same logic, zero duplication.
    """
    session_id = body.session_id
    user_answer = body.answer.strip().lower()

    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    state = sessions[session_id]
    idx = state["current_index"]
    retry_count = state["retry_count"]
    current_question = ALL_QUESTIONS[idx]

    # =========================================
    # VALIDATION — delegated to interview_module
    # =========================================

    next_raw_question = ALL_QUESTIONS[idx + 1] if idx + 1 < len(ALL_QUESTIONS) else None

    try:
        response_data = validate_response(current_question, user_answer, next_raw_question)

    except Exception:
        # mirrors interview_module.py except block behaviour
        return RespondResponse(
            status="retry",
            message="Something went wrong while validating your response. Let's try again.",
            question=current_question,
            question_index=idx,
            total_questions=len(ALL_QUESTIONS),
            chat_history=None,
        )

    validation_status = response_data.get("status", "RETRY")

    # =========================================
    # HANDLE VALID — mirrors lines 235-238
    # =========================================

    if validation_status == "VALID":
        state["chat_history"][current_question] = user_answer
        state["retry_count"] = 0
        next_idx = idx + 1

        if next_idx >= len(ALL_QUESTIONS):
            result = state["chat_history"]
            del sessions[session_id]
            return RespondResponse(
                status="done",
                message="Interview complete! Thank you.",
                question=None,
                question_index=None,
                total_questions=len(ALL_QUESTIONS),
                chat_history=result,
            )

        state["current_index"] = next_idx
        # Use the conversationally formatted question from the LLM, or fallback to the raw question
        formatted_question = response_data.get("next_question", ALL_QUESTIONS[next_idx])
        return RespondResponse(
            status="next",
            message=None,
            question=formatted_question,
            question_index=next_idx,
            total_questions=len(ALL_QUESTIONS),
            chat_history=None,
        )

    # =========================================
    # HANDLE CLARIFY / RETRY — mirrors lines 244-256
    # =========================================

    retry_count += 1
    state["retry_count"] = retry_count
    state["last_answer"] = user_answer

    # Fallback after 3 failed attempts — mirrors lines 262-268
    if retry_count >= 3:
        state["chat_history"][current_question] = state["last_answer"]
        state["retry_count"] = 0
        next_idx = idx + 1

        if next_idx >= len(ALL_QUESTIONS):
            result = state["chat_history"]
            del sessions[session_id]
            return RespondResponse(
                status="done",
                message="Interview complete! Thank you.",
                question=None,
                question_index=None,
                total_questions=len(ALL_QUESTIONS),
                chat_history=result,
            )

        state["current_index"] = next_idx
        return RespondResponse(
            status="next",
            message="No worries, let's move on to the next question.",
            question=ALL_QUESTIONS[next_idx],
            question_index=next_idx,
            total_questions=len(ALL_QUESTIONS),
            chat_history=None,
        )

    return RespondResponse(
        status=validation_status.lower(),
        message=None,
        question=response_data.get("message", "Could you try answering that again?"),
        question_index=idx,
        total_questions=len(ALL_QUESTIONS),
        chat_history=None,
    )


@app.post('/interview/extract-profile')
def extract_profile_endpoint(
    request: Request,
    body: ExtractProfileRequest,
    db: Session = Depends(get_db),
):
    """
    Accepts the completed interview chat_history, extracts a structured
    cognitive compatibility profile via the LLM, saves it to PostgreSQL
    (linking to the authenticated user when a Bearer token is present),
    and returns the profile along with the generated record ID.
    """
    # =========================================
    # STEP 1 — LLM profile extraction
    # =========================================

    try:
        profile = extract_profile(body.chat_history)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Profile extraction failed: {str(e)}"
        )

    # =========================================
    # STEP 2 — Resolve authenticated user (optional)
    # =========================================

    linked_user_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from auth import decode_access_token
            import uuid as _uuid
            user_id_str = decode_access_token(auth_header.split(" ", 1)[1])
            linked_user_id = _uuid.UUID(user_id_str)
        except Exception:
            pass  # token invalid — save profile without user link

    # =========================================
    # STEP 3 — Persist raw profile to PostgreSQL
    # =========================================

    try:
        record = UserProfile(
            user_id                     = linked_user_id,
            name                        = profile.get('name'),
            interests                   = profile.get('interests'),
            goals                       = profile.get('goals'),
            learning_preferences        = profile.get('learning_preferences'),
            collaboration_preferences   = profile.get('collaboration_preferences'),
            execution_patterns          = profile.get('execution_patterns'),
            discussion_topics           = profile.get('discussion_topics'),
        )
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save profile to database: {str(e)}"
        )

    # =========================================
    # STEP 4 — Generate embeddings + store in ChromaDB
    # =========================================

    try:
        embeddings = generate_embeddings(profile)
        store_profile_embedding(
            profile_id = str(record.id),
            name       = profile.get('name'),
            embeddings = embeddings,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Profile saved to database (id={record.id}) but "
                f"vector storage failed: {str(e)}"
            )
        )

    return {
        "profile_id": str(record.id),
        "created_at": record.created_at.isoformat(),
        **profile
    }


@app.get('/profile/me')
def get_my_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns the authenticated user's most recently generated cognitive profile.
    Used by the frontend to restore profile state on login without re-running the interview.
    Returns 404 if no profile has been generated yet.
    """
    record = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == current_user.id)
        .order_by(UserProfile.created_at.desc())
        .first()
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="No profile found for this user. Complete the interview to generate one."
        )

    return {
        "profile_id":                   str(record.id),
        "created_at":                   record.created_at.isoformat(),
        "name":                         record.name,
        "interests":                    record.interests,
        "goals":                        record.goals,
        "learning_preferences":         record.learning_preferences,
        "collaboration_preferences":    record.collaboration_preferences,
        "execution_patterns":           record.execution_patterns,
        "discussion_topics":            record.discussion_topics,
    }


@app.post('/perform_similarity')
def perform_similarity_endpoint(body: SimilarityRequest, db: Session = Depends(get_db)):
    """
    Two-stage matching pipeline for the given profile UUID.

    Stage 1 — Vector search (ChromaDB)
        Retrieves the top-10 most embedding-similar user IDs.

    Stage 2 — LLM Reranking + Explicit Filter (reranker.py)
        Fetches each candidate's full profile from PostgreSQL, then asks
        the LLM to holistically score and rerank them.  Candidates that
        are semantically weak or behaviorally mismatched are excluded
        entirely — so the response may contain fewer than 10 results.

    Response shape
    --------------
    {
        "query_user_id": "<uuid>",
        "query_user":    "<name>",
        "ranked_matches": [
            {
                "user":    "<name>",
                "score":   <0-100>,
                "reason":  "<explanation>",
                "profile": { ...full profile dict... }
            }
        ]
    }
    """
    import uuid as _uuid

    # ── Stage 1: ChromaDB vector similarity (top-10) ──────────────────────
    try:
        candidate_ids, _ = perform_similarity(body.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Similarity search failed: {str(e)}"
        )

    # ── Fetch the query user's own profile from PostgreSQL ─────────────────
    try:
        query_record = db.query(UserProfile).filter(
            UserProfile.id == _uuid.UUID(body.user_id)
        ).first()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch query user profile: {str(e)}"
        )

    if query_record is None:
        raise HTTPException(
            status_code=404,
            detail=f"No PostgreSQL profile found for user_id='{body.user_id}'."
        )

    query_profile = {
        "name":                      query_record.name,
        "interests":                 query_record.interests or [],
        "goals":                     query_record.goals or [],
        "learning_preferences":      query_record.learning_preferences or [],
        "collaboration_preferences": query_record.collaboration_preferences or [],
        "execution_patterns":        query_record.execution_patterns or [],
        "discussion_topics":         query_record.discussion_topics or [],
    }

    # ── Stage 2a: Fetch candidate profiles from PostgreSQL ─────────────────
    try:
        candidate_profiles = fetch_candidate_profiles(candidate_ids, db)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch candidate profiles: {str(e)}"
        )

    # ── Stage 2b: LLM reranking + explicit filter ──────────────────────────
    try:
        reranked = rerank_candidates(query_profile, candidate_profiles)
        
        # Persist top-3 matches for future chat context
        top_matches = []
        for match in reranked.get("ranked_matches", [])[:3]:
            top_matches.append({
                "name":   match.get("user"),
                "score":  match.get("score"),
                "reason": match.get("reason")
            })
        
        query_record.matched_profiles = top_matches
        db.commit()

    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Reranking failed: {str(e)}"
        )

    return {
        "query_user_id": body.user_id,
        **reranked,
    }


# ─────────────────────────────────────────────────────────
# CHAT
# ─────────────────────────────────────────────────────────

from typing import Any

class ChatSendRequest(BaseModel):
    message: str
    temporary: bool = False
    history: list[dict[str, Any]] = []
class ChatSendResponse(BaseModel):
    response: str
    session_id: str


class ChatEndResponse(BaseModel):
    message: str
    summary: str | None


@app.post('/chat/send', response_model=ChatSendResponse)
def chat_send(
    body: ChatSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message to the MindMatch AI companion.

    Automatically:
      - loads the user's cognitive profile for context
      - retrieves relevant episodic memories
      - maintains a rolling conversation window
      - compresses memory when the threshold is reached

    Auth: Required (Bearer JWT).
    """
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty.")

    try:
        result = chat_send_message(
            user_id=str(current_user.id),
            message=body.message.strip(),
            db=db,
            temporary=body.temporary,
            history=body.history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

    return ChatSendResponse(
        response=result["response"],
        session_id=result["session_id"],
    )


@app.get('/chat/history')
def chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the active session's conversation window (ordered, oldest first).

    Auth: Required (Bearer JWT).
    """
    try:
        return chat_get_history(user_id=str(current_user.id), db=db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load history: {str(e)}")


@app.post('/chat/stream')
async def chat_stream(
    body: ChatSendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stream the assistant response token-by-token via Server-Sent Events.

    The client reads the stream and renders tokens as they arrive.
    Final event is:  data: [DONE]

    Auth: Required (Bearer JWT).
    """
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty.")

    return StreamingResponse(
        chat_stream_message(
            user_id=str(current_user.id),
            message=body.message.strip(),
            db=db,
            temporary=body.temporary,
            history=body.history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post('/chat/end-session', response_model=ChatEndResponse)
def chat_end_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Explicitly ends the current chat session.

    Compresses any remaining conversation into a long-term episodic memory,
    persists it to PostgreSQL and ChromaDB, then rolls to a fresh session.

    Auth: Required (Bearer JWT).
    """
    from memory_manager import get_or_create_session

    session_id = get_or_create_session(str(current_user.id), db)

    try:
        summary = memory_end_session(
            user_id=str(current_user.id),
            session_id=session_id,
            db=db,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")

    return ChatEndResponse(
        message="Session ended. Your conversation has been saved to memory.",
        summary=summary,
    )