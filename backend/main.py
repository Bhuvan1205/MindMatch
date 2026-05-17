import sys
import os

# Ensure backend/ is on the path regardless of where uvicorn is launched from
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Depends, Request, Query
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
from models import Base, DirectMessage, User, UserConnection, UserProfile, ExperienceRoutingLog, ChatSession, ConversationExchange, EpisodicMemory

app = FastAPI()

# =========================================================
# CREATE / MIGRATE TABLES ON STARTUP
# =========================================================

# Columns that SQLAlchemy create_all() cannot add to *existing* tables.
# Uses ADD COLUMN IF NOT EXISTS so it is fully idempotent on every deploy.
_SCHEMA_MIGRATIONS = [
    ("user_connections", "recipient_request_seen_at",  "TIMESTAMP"),
    ("user_connections", "requester_accepted_seen_at", "TIMESTAMP"),
]

@app.on_event('startup')
def create_tables():
    from sqlalchemy import text

    # 1. Create any tables that don't exist yet.
    Base.metadata.create_all(bind=engine)

    # 2. Add any columns introduced after the table was first created.
    with engine.begin() as conn:
        for table, column, col_type in _SCHEMA_MIGRATIONS:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type};"
            ))

# =========================================================
# CORS — allows the frontend to call the API
# Set ALLOWED_ORIGINS env var to a comma-separated list of allowed origins
# e.g. "https://mindmatch.vercel.app,https://www.mindmatch.vercel.app"
# Defaults to wildcard for local development.
# =========================================================

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
if _raw_origins == "*":
    _allow_origins = ["*"]
else:
    _allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
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
SECTION_ENTRIES = list(interview_questions.items())


def get_question_metadata(question_index: int) -> dict:
    """
    Returns section metadata for a flattened question index.
    The very first question is a pre-interview name capture, so actual
    interview progress starts from flattened index 1.
    """
    running_index = 0

    for raw_section_index, (section_name, questions) in enumerate(SECTION_ENTRIES):
        section_start = running_index
        section_end = running_index + len(questions)

        if section_start <= question_index < section_end:
            question_in_section = question_index - section_start

            # The first "Intro" question is intentionally pre-interview.
            if raw_section_index == 0:
                interview_question_in_section = max(0, question_in_section - 1)
                interview_total_in_section = max(0, len(questions) - 1)
            else:
                interview_question_in_section = question_in_section
                interview_total_in_section = len(questions)

            return {
                "section_name": section_name,
                "section_index": raw_section_index,
                "total_sections": len(SECTION_ENTRIES),
                "question_in_section": interview_question_in_section,
                "total_in_section": interview_total_in_section,
                "is_new_section": question_in_section == 0 and question_index != 0,
            }

        running_index = section_end

    raise IndexError(f"Question index out of range: {question_index}")

# =========================================================
# REQUEST / RESPONSE MODELS
# =========================================================

class StartResponse(BaseModel):
    session_id: str
    question: str
    question_index: int
    total_questions: int
    section_name: str
    section_index: int
    total_sections: int
    question_in_section: int
    total_in_section: int
    is_new_section: bool


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
    section_name: str | None
    section_index: int | None
    total_sections: int
    question_in_section: int | None
    total_in_section: int | None
    is_new_section: bool


class ExtractProfileRequest(BaseModel):
    chat_history: dict          # the chat_history dict returned by /interview/respond when status == "done"


class SimilarityRequest(BaseModel):
    user_id: str                # Pinecone / PostgreSQL profile UUID to find matches for


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
    metadata = get_question_metadata(0)
    return StartResponse(
        session_id=session_id,
        question=ALL_QUESTIONS[0],
        question_index=0,
        total_questions=len(ALL_QUESTIONS),
        **metadata,
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
            **get_question_metadata(idx),
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
                section_name=None,
                section_index=None,
                total_sections=len(SECTION_ENTRIES),
                question_in_section=None,
                total_in_section=None,
                is_new_section=False,
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
            **get_question_metadata(next_idx),
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
                section_name=None,
                section_index=None,
                total_sections=len(SECTION_ENTRIES),
                question_in_section=None,
                total_in_section=None,
                is_new_section=False,
            )

        state["current_index"] = next_idx
        return RespondResponse(
            status="next",
            message="No worries, let's move on to the next question.",
            question=ALL_QUESTIONS[next_idx],
            question_index=next_idx,
            total_questions=len(ALL_QUESTIONS),
            chat_history=None,
            **get_question_metadata(next_idx),
        )

    return RespondResponse(
        status=validation_status.lower(),
        message=None,
        question=response_data.get("message", "Could you try answering that again?"),
        question_index=idx,
        total_questions=len(ALL_QUESTIONS),
        chat_history=None,
        **get_question_metadata(idx),
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
    # STEP 4 — Generate embeddings + store in Pinecone
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

    Stage 1 — Vector search (Pinecone)
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

    # ── Stage 1: Pinecone vector similarity (top-10) ──────────────────────
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
            profile = match.get("profile") or {}
            top_matches.append({
                "profile_id": profile.get("profile_id"),
                "user_id": profile.get("user_id"),
                "name":   match.get("user"),
                "score":  match.get("score"),
                "reason": match.get("reason"),
                "profile": profile,
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

# =========================================================
# CONNECTION REQUEST / RESPONSE MODELS
# =========================================================

class ConnectionRequest(BaseModel):
    target_profile_id: str


class ConnectionActionRequest(BaseModel):
    connection_id: str


class DirectMessageRequest(BaseModel):
    connection_id: str
    message: str


class ExperienceAskRequest(BaseModel):
    target_profile_id: str
    question: str


class MarkNotificationReadRequest(BaseModel):
    message_id: str | None = None
    connection_id: str | None = None
    notification_kind: str | None = None


class MarkAllNotificationsReadResponse(BaseModel):
    updated_count: int


# =========================================================
# CONNECTIONS + DIRECT MESSAGES + EXPERIENCE ROUTING
# =========================================================

def _serialize_connection(connection: UserConnection, current_user_id: str, db: Session = None) -> dict:
    target_user_id = connection.requester_id if str(connection.recipient_id) == current_user_id else connection.recipient_id
    target_name = _latest_profile_name(target_user_id, db) if db else None
    return {
        "connection_id": str(connection.id),
        "requester_id": str(connection.requester_id),
        "recipient_id": str(connection.recipient_id),
        "requester_profile_id": str(connection.requester_profile_id) if connection.requester_profile_id else None,
        "recipient_profile_id": str(connection.recipient_profile_id) if connection.recipient_profile_id else None,
        "status": connection.status,
        "created_at": connection.created_at.isoformat(),
        "updated_at": connection.updated_at.isoformat(),
        "is_incoming": str(connection.recipient_id) == current_user_id,
        "target_name": target_name,
    }


def _latest_profile_name(user_id, db: Session) -> str | None:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .order_by(UserProfile.created_at.desc())
        .first()
    )
    return profile.name if profile else None


@app.get('/users/search')
def search_users(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    search_term = q.strip()
    if not search_term:
        return {"query": q, "results": []}

    lowered = search_term.lower()
    profiles = (
        db.query(UserProfile)
        .filter(UserProfile.user_id.isnot(None), UserProfile.user_id != current_user.id)
        .order_by(UserProfile.created_at.desc())
        .all()
    )

    latest_by_user: dict = {}
    for profile in profiles:
        if profile.user_id in latest_by_user:
            continue
        latest_by_user[profile.user_id] = profile

    results = []
    for profile in latest_by_user.values():
        haystacks = [
            profile.name or "",
            " ".join(profile.interests or []),
            " ".join(profile.goals or []),
            " ".join(profile.discussion_topics or []),
        ]
        if lowered not in " ".join(haystacks).lower():
            continue

        connection = (
            db.query(UserConnection)
            .filter(
                ((UserConnection.requester_id == current_user.id) & (UserConnection.recipient_id == profile.user_id))
                | ((UserConnection.requester_id == profile.user_id) & (UserConnection.recipient_id == current_user.id))
            )
            .order_by(UserConnection.created_at.desc())
            .first()
        )

        results.append(
            {
                "profile_id": str(profile.id),
                "user_id": str(profile.user_id),
                "created_at": profile.created_at.isoformat(),
                "name": profile.name,
                "interests": profile.interests or [],
                "goals": profile.goals or [],
                "learning_preferences": profile.learning_preferences or [],
                "collaboration_preferences": profile.collaboration_preferences or [],
                "execution_patterns": profile.execution_patterns or [],
                "discussion_topics": profile.discussion_topics or [],
                "connection": _serialize_connection(connection, str(current_user.id), db) if connection else None,
            }
        )

    results.sort(key=lambda item: ((item.get("name") or "").lower().find(lowered) if (item.get("name") or "").lower().find(lowered) >= 0 else 9999, item.get("name") or ""))
    return {"query": search_term, "results": results[:24]}


@app.post('/connections/request')
def request_connection(
    body: ConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid

    target_profile = db.query(UserProfile).filter(UserProfile.id == _uuid.UUID(body.target_profile_id)).first()
    if target_profile is None or target_profile.user_id is None:
        raise HTTPException(status_code=404, detail="Target matched user is not available for direct interaction.")
    if target_profile.user_id == current_user.id:
        raise HTTPException(status_code=422, detail="You cannot request a connection with yourself.")

    requester_profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == current_user.id)
        .order_by(UserProfile.created_at.desc())
        .first()
    )

    existing = (
        db.query(UserConnection)
        .filter(
            ((UserConnection.requester_id == current_user.id) & (UserConnection.recipient_id == target_profile.user_id))
            | ((UserConnection.requester_id == target_profile.user_id) & (UserConnection.recipient_id == current_user.id))
        )
        .order_by(UserConnection.created_at.desc())
        .first()
    )
    if existing:
        return _serialize_connection(existing, str(current_user.id), db)

    connection = UserConnection(
        requester_id=current_user.id,
        recipient_id=target_profile.user_id,
        requester_profile_id=requester_profile.id if requester_profile else None,
        recipient_profile_id=target_profile.id,
        status="pending",
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return _serialize_connection(connection, str(current_user.id), db)


@app.get('/connections')
def list_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connections = (
        db.query(UserConnection)
        .filter(
            (UserConnection.requester_id == current_user.id)
            | (UserConnection.recipient_id == current_user.id)
        )
        .order_by(UserConnection.updated_at.desc())
        .all()
    )
    return {"connections": [_serialize_connection(c, str(current_user.id), db) for c in connections]}


@app.get('/notifications')
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incoming_requests = (
        db.query(UserConnection)
        .filter(
            UserConnection.recipient_id == current_user.id,
            UserConnection.status == "pending",
            UserConnection.recipient_request_seen_at.is_(None),
        )
        .order_by(UserConnection.created_at.desc())
        .limit(10)
        .all()
    )

    received_messages = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .order_by(DirectMessage.created_at.desc())
        .limit(20)
        .all()
    )

    unread_message_count = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .count()
    )

    accepted_requests = (
        db.query(UserConnection)
        .filter(
            UserConnection.requester_id == current_user.id,
            UserConnection.status == "accepted",
            UserConnection.requester_accepted_seen_at.is_(None),
        )
        .order_by(UserConnection.updated_at.desc())
        .limit(10)
        .all()
    )

    return {
        "pending_request_count": len(incoming_requests),
        "unread_message_count": unread_message_count,
        "requests": [
            {
                "connection_id": str(connection.id),
                "requester_id": str(connection.requester_id),
                "requester_name": _latest_profile_name(connection.requester_id, db),
                "created_at": connection.created_at.isoformat(),
            }
            for connection in incoming_requests
        ],
        "messages": [
            {
                "message_id": str(message.id),
                "connection_id": str(message.connection_id),
                "sender_id": str(message.sender_id),
                "sender_name": _latest_profile_name(message.sender_id, db),
                "message": message.message,
                "created_at": message.created_at.isoformat(),
                "read_at": message.read_at.isoformat() if message.read_at else None,
            }
            for message in received_messages
        ],
        "accepted_requests": [
            {
                "connection_id": str(connection.id),
                "recipient_id": str(connection.recipient_id),
                "recipient_name": _latest_profile_name(connection.recipient_id, db),
                "accepted_at": connection.updated_at.isoformat(),
            }
            for connection in accepted_requests
        ],
    }


@app.post('/notifications/read')
def mark_notification_read(
    body: MarkNotificationReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid
    from datetime import datetime

    if body.message_id:
        message = db.query(DirectMessage).filter(DirectMessage.id == _uuid.UUID(body.message_id)).first()
        if message is None or message.receiver_id != current_user.id:
            raise HTTPException(status_code=404, detail="Notification not found.")

        if message.read_at is None:
            message.read_at = datetime.utcnow()
            db.commit()
            db.refresh(message)

        return {"message_id": str(message.id), "read_at": message.read_at.isoformat() if message.read_at else None}

    if body.connection_id and body.notification_kind:
        connection = db.query(UserConnection).filter(UserConnection.id == _uuid.UUID(body.connection_id)).first()
        if connection is None:
            raise HTTPException(status_code=404, detail="Notification not found.")

        if body.notification_kind == "request":
            if connection.recipient_id != current_user.id:
                raise HTTPException(status_code=403, detail="Not allowed to dismiss this notification.")
            if connection.recipient_request_seen_at is None:
                connection.recipient_request_seen_at = datetime.utcnow()
                db.commit()
        elif body.notification_kind == "accepted":
            if connection.requester_id != current_user.id:
                raise HTTPException(status_code=403, detail="Not allowed to dismiss this notification.")
            if connection.requester_accepted_seen_at is None:
                connection.requester_accepted_seen_at = datetime.utcnow()
                db.commit()
        else:
            raise HTTPException(status_code=422, detail="Unsupported notification kind.")

        return {"message_id": None, "read_at": datetime.utcnow().isoformat()}

    raise HTTPException(status_code=422, detail="A message_id or connection notification payload is required.")


@app.post('/notifications/read-all', response_model=MarkAllNotificationsReadResponse)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import datetime

    now = datetime.utcnow()
    updated = 0

    # 1. Mark all unread direct messages as read
    unread_messages = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .all()
    )
    for message in unread_messages:
        message.read_at = now
        updated += 1

    # 2. Dismiss pending incoming connection-request notifications
    pending_requests = (
        db.query(UserConnection)
        .filter(
            UserConnection.recipient_id == current_user.id,
            UserConnection.status == "pending",
            UserConnection.recipient_request_seen_at.is_(None),
        )
        .all()
    )
    for conn in pending_requests:
        conn.recipient_request_seen_at = now
        updated += 1

    # 3. Dismiss accepted-request notifications (requester side)
    accepted_conns = (
        db.query(UserConnection)
        .filter(
            UserConnection.requester_id == current_user.id,
            UserConnection.status == "accepted",
            UserConnection.requester_accepted_seen_at.is_(None),
        )
        .all()
    )
    for conn in accepted_conns:
        conn.requester_accepted_seen_at = now
        updated += 1

    db.commit()
    return MarkAllNotificationsReadResponse(updated_count=updated)


@app.post('/connections/accept')
def accept_connection(
    body: ConnectionActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid
    from datetime import datetime

    connection = db.query(UserConnection).filter(UserConnection.id == _uuid.UUID(body.connection_id)).first()
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection request not found.")
    if connection.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept this connection.")

    connection.status = "accepted"
    connection.recipient_request_seen_at = datetime.utcnow()
    connection.requester_accepted_seen_at = None
    db.commit()
    db.refresh(connection)
    return _serialize_connection(connection, str(current_user.id), db)


@app.post('/direct-messages/send')
def send_direct_message(
    body: DirectMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid

    if not body.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty.")

    connection = db.query(UserConnection).filter(UserConnection.id == _uuid.UUID(body.connection_id)).first()
    if connection is None or connection.status != "accepted":
        raise HTTPException(status_code=403, detail="Direct messages require an accepted connection.")
    if current_user.id not in {connection.requester_id, connection.recipient_id}:
        raise HTTPException(status_code=403, detail="You are not part of this connection.")

    receiver_id = connection.recipient_id if current_user.id == connection.requester_id else connection.requester_id
    message = DirectMessage(
        connection_id=connection.id,
        sender_id=current_user.id,
        receiver_id=receiver_id,
        message=body.message.strip(),
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    return {
        "message_id": str(message.id),
        "connection_id": str(message.connection_id),
        "sender_id": str(message.sender_id),
        "receiver_id": str(message.receiver_id),
        "message": message.message,
        "created_at": message.created_at.isoformat(),
    }


@app.get('/direct-messages/{connection_id}')
def list_direct_messages(
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid

    connection = db.query(UserConnection).filter(UserConnection.id == _uuid.UUID(connection_id)).first()
    if connection is None or current_user.id not in {connection.requester_id, connection.recipient_id}:
        raise HTTPException(status_code=404, detail="Connection not found.")
    if connection.status != "accepted":
        raise HTTPException(status_code=403, detail="Direct messages require an accepted connection.")

    messages = (
        db.query(DirectMessage)
        .filter(DirectMessage.connection_id == connection.id)
        .order_by(DirectMessage.created_at.asc())
        .all()
    )
    return {
        "connection": _serialize_connection(connection, str(current_user.id), db),
        "messages": [
            {
                "message_id": str(m.id),
                "sender_id": str(m.sender_id),
                "receiver_id": str(m.receiver_id),
                "message": m.message,
                "created_at": m.created_at.isoformat(),
                "read_at": m.read_at.isoformat() if m.read_at else None,
            }
            for m in messages
        ],
    }


@app.post('/experience/ask')
def ask_from_matched_user_experience(
    body: ExperienceAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid as _uuid
    from experience_service import (
        answer_from_user_experience,
        can_use_target_experience,
        get_latest_profile_for_user,
        profile_to_context,
    )

    if not body.question.strip():
        raise HTTPException(status_code=422, detail="Question cannot be empty.")

    target_profile = db.query(UserProfile).filter(UserProfile.id == _uuid.UUID(body.target_profile_id)).first()
    if target_profile is None or target_profile.user_id is None:
        raise HTTPException(status_code=404, detail="Selected user's profile is not available.")

    asker_profile = get_latest_profile_for_user(current_user.id, db)
    if not can_use_target_experience(current_user.id, target_profile, asker_profile, db):
        raise HTTPException(status_code=403, detail="This user's experience is not available for your current match state.")

    answer, context = answer_from_user_experience(
        asker_id=current_user.id,
        asker_profile=asker_profile,
        target_profile=target_profile,
        question=body.question.strip(),
        db=db,
    )

    return {
        "target_user": profile_to_context(target_profile),
        "answer": answer,
        "context_summary": {
            "memory_count": len(context["memories"]),
            "recent_exchange_count": len(context["recent_exchanges"]),
        },
    }


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
    request: Request,
    token: str | None = Query(default=None),
    current_user: User | None = None,
    db: Session = Depends(get_db),
):
    """
    Explicitly ends the current chat session.

    Compresses any remaining conversation into a long-term episodic memory,
    persists it to PostgreSQL and Pinecone, then rolls to a fresh session.

    Auth: Required — either via Authorization header (normal) or
          ?token=<jwt> query param (used by sendBeacon on tab close).
    """
    import uuid as _uuid
    from auth import decode_access_token
    from memory_manager import get_or_create_session

    # Resolve user from either the Authorization header or the ?token= query param.
    auth_header = request.headers.get("Authorization", "")
    resolved_user: User | None = None

    if auth_header.startswith("Bearer "):
        try:
            user_id_str = decode_access_token(auth_header.split(" ", 1)[1])
            resolved_user = db.query(User).filter(User.id == _uuid.UUID(user_id_str)).first()
        except Exception:
            pass
    elif token:
        try:
            user_id_str = decode_access_token(token)
            resolved_user = db.query(User).filter(User.id == _uuid.UUID(user_id_str)).first()
        except Exception:
            pass

    if resolved_user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")

    session_id = get_or_create_session(str(resolved_user.id), db)

    try:
        summary = memory_end_session(
            user_id=str(resolved_user.id),
            session_id=session_id,
            db=db,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end session: {str(e)}")

    return ChatEndResponse(
        message="Session ended. Your conversation has been saved to memory.",
        summary=summary,
    )
