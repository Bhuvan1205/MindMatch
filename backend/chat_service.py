"""
chat_service.py
===============
Main orchestrator for the chat feature. Called directly by FastAPI routes.

Execution flow for each chat turn:
    1.  Load user's CognitiveProfile from PostgreSQL (static context).
    2.  Get or create the active session_id for this user.
    3.  Check threshold — compress + roll session if needed.
    4.  Retrieve top-k semantically relevant episodic memories.
    5.  Fetch the active rolling conversation window.
    6.  Build the LLM prompt via prompt_builder.
    7.  Invoke the LLM and capture the response.
    8.  Persist the new exchange to ConversationExchange table.
    9.  Return the assistant response + session metadata to the route.
"""

from __future__ import annotations

import logging
import os
import uuid

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session as DBSession

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from models import ConversationExchange, UserProfile
from memory_manager import get_or_create_session, check_and_compress, get_active_window
from memory_vector_store import retrieve_relevant_memories
from prompt_builder import build_prompt
from web_search import route_query, perform_web_search

logger = logging.getLogger(__name__)

# ── Singleton LLM ─────────────────────────────────────────────────────────────
_chat_model = ChatOpenAI(model="gpt-4o-mini")


# ── Public API ────────────────────────────────────────────────────────────────

def send_message(user_id: str, message: str, db: DBSession, temporary: bool = False, history: list = None) -> dict:
    """
    Process a single user chat message end-to-end.

    Parameters
    ----------
    user_id : str
        UUID string of the authenticated user.
    message : str
        The user's current message text.
    db : DBSession
        SQLAlchemy database session.

    Returns
    -------
    dict
        {
            "response": str,       # Assistant's reply
            "session_id": str,     # Active session UUID
        }
    """
    # ── Step 1: Load user profile ─────────────────────────────────────────────
    profile_record = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == uuid.UUID(user_id))
        .order_by(UserProfile.created_at.desc())
        .first()
    )
    user_profile: dict = {}
    if profile_record:
        user_profile = {
            "name":                       profile_record.name,
            "interests":                  profile_record.interests or [],
            "goals":                      profile_record.goals or [],
            "learning_preferences":       profile_record.learning_preferences or [],
            "collaboration_preferences":  profile_record.collaboration_preferences or [],
            "execution_patterns":         profile_record.execution_patterns or [],
            "discussion_topics":          profile_record.discussion_topics or [],
            "matched_profiles":           profile_record.matched_profiles or [],
        }

    # ── Step 2: Get/create active session ────────────────────────────────────
    session_id = get_or_create_session(user_id, db)

    # ── Step 3: Threshold check — may roll to a new session ───────────────────
    session_id = check_and_compress(user_id, session_id, db)

    # ── Step 4: Retrieve relevant episodic memories ───────────────────────────
    retrieved_memories = retrieve_relevant_memories(user_id, message, top_k=3)

    # ── Step 5: Fetch active conversation window ──────────────────────────────
    if temporary:
        session_id = "temp-session"
        active_window = history or []
    else:
        exchanges = get_active_window(session_id, db)
        active_window = [
            {
                "user_message":      ex.user_message,
                "assistant_message": ex.assistant_message,
            }
            for ex in exchanges
        ]

    # ── Step 5.5: Web Search Routing ──────────────────────────────────────────
    web_context = None
    if route_query(message):
        web_context = perform_web_search(message, max_results=3)

    # ── Step 6: Build prompt ──────────────────────────────────────────────────
    prompt_messages = build_prompt(
        user_profile=user_profile,
        active_exchanges=active_window,
        current_query=message,
        retrieved_memories=retrieved_memories or None,
        web_context=web_context,
        retrieved_similar_profiles=user_profile.get("matched_profiles"),
    )

    # ── Step 7: Invoke LLM ────────────────────────────────────────────────────
    llm_response = _chat_model.invoke(prompt_messages)
    assistant_reply: str = llm_response.content.strip()

    # ── Step 8: Persist exchange ──────────────────────────────────────────────
    if not temporary:
        exchange = ConversationExchange(
            user_id=uuid.UUID(user_id),
            session_id=uuid.UUID(session_id),
            user_message=message,
            assistant_message=assistant_reply,
        )
        db.add(exchange)
        db.commit()

    logger.info(
        "chat_service: processed message for user=%s session=%s temporary=%s",
        user_id, session_id, temporary
    )

    return {
        "response":   assistant_reply,
        "session_id": session_id,
    }


def get_history(user_id: str, db: DBSession) -> dict:
    """
    Return the current session's active conversation window.

    Returns
    -------
    dict
        {
            "session_id": str,
            "exchanges": [ { "user_message", "assistant_message", "created_at" }, ... ]
        }
    """
    session_id = get_or_create_session(user_id, db)
    exchanges = get_active_window(session_id, db)

    return {
        "session_id": session_id,
        "exchanges": [
            {
                "user_message":      ex.user_message,
                "assistant_message": ex.assistant_message,
                "created_at":        ex.created_at.isoformat(),
            }
            for ex in exchanges
        ],
    }


async def stream_message(user_id: str, message: str, db: DBSession, temporary: bool = False, history: list = None):
    """
    Async generator that streams the assistant response token-by-token as
    Server-Sent Events (SSE), then persists the full exchange to the DB.

    Yields
    ------
    str
        SSE lines in the format:  data: <token>\\n\\n
        Sends a final termination event: data: [DONE]\\n\\n
    """
    # ── Step 1: Load user profile ─────────────────────────────────────────────
    profile_record = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == uuid.UUID(user_id))
        .order_by(UserProfile.created_at.desc())
        .first()
    )
    user_profile: dict = {}
    if profile_record:
        user_profile = {
            "name":                       profile_record.name,
            "interests":                  profile_record.interests or [],
            "goals":                      profile_record.goals or [],
            "learning_preferences":       profile_record.learning_preferences or [],
            "collaboration_preferences":  profile_record.collaboration_preferences or [],
            "execution_patterns":         profile_record.execution_patterns or [],
            "discussion_topics":          profile_record.discussion_topics or [],
            "matched_profiles":           profile_record.matched_profiles or [],
        }

    # ── Step 2: Session management ────────────────────────────────────────────
    session_id = get_or_create_session(user_id, db)
    session_id = check_and_compress(user_id, session_id, db)

    # ── Step 3: Retrieve memories + window ───────────────────────────────────
    retrieved_memories = retrieve_relevant_memories(user_id, message, top_k=3)
    
    if temporary:
        session_id = "temp-session"
        active_window = history or []
    else:
        exchanges = get_active_window(session_id, db)
        active_window = [
            {"user_message": ex.user_message, "assistant_message": ex.assistant_message}
            for ex in exchanges
        ]

    # ── Step 3.5: Web Search Routing ──────────────────────────────────────────
    web_context = None
    if route_query(message):
        web_context = perform_web_search(message, max_results=3)

    # ── Step 4: Build prompt ──────────────────────────────────────────────────
    prompt_messages = build_prompt(
        user_profile=user_profile,
        active_exchanges=active_window,
        current_query=message,
        retrieved_memories=retrieved_memories or None,
        web_context=web_context,
        retrieved_similar_profiles=user_profile.get("matched_profiles"),
    )

    # ── Step 5: Stream tokens ─────────────────────────────────────────────────
    full_response_parts: list[str] = []

    import json as _json

    try:
        async for chunk in _chat_model.astream(prompt_messages):
            token: str = chunk.content
            if token:
                full_response_parts.append(token)
                # Encode token as JSON so any special chars/newlines survive transport
                yield f"data: {_json.dumps(token)}\n\n"
    except Exception as e:
        logger.error("chat_service: streaming error — %s", e)
        yield f"data: {_json.dumps('[ERROR] Something went wrong.')}\n\n"

    # ── Step 6: Persist full response ─────────────────────────────────────────
    full_response = "".join(full_response_parts)
    if full_response.strip() and not temporary:
        try:
            exchange = ConversationExchange(
                user_id=uuid.UUID(user_id),
                session_id=uuid.UUID(session_id),
                user_message=message,
                assistant_message=full_response,
            )
            db.add(exchange)
            db.commit()
        except Exception as e:
            logger.error("chat_service: failed to persist streamed exchange — %s", e)

    yield "data: [DONE]\n\n"

