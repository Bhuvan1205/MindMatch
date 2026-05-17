"""
memory_manager.py
=================
Controls the full lifecycle of a user's active session memory.

Responsibilities:
  - Retrieve the rolling active conversation window from PostgreSQL.
  - Check if the exchange threshold has been reached.
  - When threshold is reached: summarize → persist EpisodicMemory →
    embed in Pinecone → clear active window → roll to new session_id.
  - Provide/create the current active session_id for a user.

The threshold is configurable via the CHAT_MEMORY_THRESHOLD env var (default: 12).
Session isolation is guaranteed: each session_id scopes its own exchanges.
"""

from __future__ import annotations

import logging
import os
import uuid

from sqlalchemy.orm import Session as DBSession

from models import ConversationExchange, EpisodicMemory, ChatSession
from summarization_service import summarize_exchanges
from memory_vector_store import store_memory_embedding

logger = logging.getLogger(__name__)

MEMORY_THRESHOLD = int(os.getenv("CHAT_MEMORY_THRESHOLD", "12"))


# ── Session management ────────────────────────────────────────────────────────

def get_or_create_session(user_id: str, db: DBSession) -> str:
    """
    Return the active session_id for the user.
    Creates a new ChatSession row if none exists.

    Parameters
    ----------
    user_id : str
        UUID string of the authenticated user.
    db : DBSession
        SQLAlchemy database session.

    Returns
    -------
    str
        The active session_id UUID string.
    """
    session = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == uuid.UUID(user_id), ChatSession.is_active == True)
        .order_by(ChatSession.created_at.desc())
        .first()
    )

    if session is None:
        session = ChatSession(
            user_id=uuid.UUID(user_id),
            is_active=True,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info("memory_manager: created new session %s for user %s", session.id, user_id)

    return str(session.id)


def roll_new_session(user_id: str, old_session_id: str, db: DBSession) -> str:
    """
    Close the current session and open a fresh one.
    Called automatically after summarization or manual end-session.
    """
    # Mark old session inactive
    old = db.query(ChatSession).filter(
        ChatSession.id == uuid.UUID(old_session_id)
    ).first()
    if old:
        old.is_active = False
        db.commit()

    # Create fresh session
    new_session = ChatSession(
        user_id=uuid.UUID(user_id),
        is_active=True,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    logger.info(
        "memory_manager: rolled session for user %s → new session %s",
        user_id, new_session.id,
    )
    return str(new_session.id)


# ── Active window ─────────────────────────────────────────────────────────────

def get_active_window(session_id: str, db: DBSession) -> list[ConversationExchange]:
    """
    Return the ordered list of ConversationExchange rows for this session.
    """
    return (
        db.query(ConversationExchange)
        .filter(ConversationExchange.session_id == uuid.UUID(session_id))
        .order_by(ConversationExchange.created_at.asc())
        .all()
    )


# ── Threshold check + summarization ──────────────────────────────────────────

def check_and_compress(user_id: str, session_id: str, db: DBSession) -> str:
    """
    Check if the active window has reached the threshold.
    If so: summarize → persist EpisodicMemory → embed → clear window → new session.

    Returns the (possibly new) active session_id.
    Callers should update their session_id reference with the return value.
    """
    exchanges = get_active_window(session_id, db)

    if len(exchanges) < MEMORY_THRESHOLD:
        return session_id  # Nothing to do

    logger.info(
        "memory_manager: threshold reached (%d/%d) for session %s — compressing.",
        len(exchanges), MEMORY_THRESHOLD, session_id,
    )

    # 1. Summarize
    try:
        summary_text = summarize_exchanges(exchanges)
    except Exception as e:
        logger.error("memory_manager: summarization failed — %s", e)
        return session_id  # Don't crash the chat; just skip compression this turn

    # 2. Persist EpisodicMemory to PostgreSQL
    try:
        memory_record = EpisodicMemory(
            user_id=uuid.UUID(user_id),
            session_id=uuid.UUID(session_id),
            memory_summary=summary_text,
            memory_type="episodic",
        )
        db.add(memory_record)
        db.commit()
        db.refresh(memory_record)
    except Exception as e:
        db.rollback()
        logger.error("memory_manager: failed to persist EpisodicMemory — %s", e)
        return session_id

    # 3. Embed and store in Pinecone
    try:
        store_memory_embedding(
            memory_id=str(memory_record.id),
            user_id=user_id,
            summary_text=summary_text,
        )
    except Exception as e:
        logger.error("memory_manager: Pinecone storage failed — %s", e)
        # Non-fatal: SQL record exists; retrieval will miss this one until fixed.

    # 4. Roll to a new session (clears active window implicitly via new session_id)
    new_session_id = roll_new_session(user_id, session_id, db)
    return new_session_id


# ── Explicit end-session ──────────────────────────────────────────────────────

def end_session(user_id: str, session_id: str, db: DBSession) -> str | None:
    """
    Explicitly close a session: summarize whatever is in the window (if anything),
    persist it, and roll to a new session.

    Called by POST /chat/end-session.

    Returns the summary text or None if the window was empty.
    """
    exchanges = get_active_window(session_id, db)

    summary_text: str | None = None

    if exchanges:
        try:
            summary_text = summarize_exchanges(exchanges)
            memory_record = EpisodicMemory(
                user_id=uuid.UUID(user_id),
                session_id=uuid.UUID(session_id),
                memory_summary=summary_text,
                memory_type="episodic",
            )
            db.add(memory_record)
            db.commit()
            db.refresh(memory_record)

            store_memory_embedding(
                memory_id=str(memory_record.id),
                user_id=user_id,
                summary_text=summary_text,
            )
        except Exception as e:
            db.rollback()
            logger.error("memory_manager: end_session summarization failed — %s", e)

    roll_new_session(user_id, session_id, db)
    return summary_text
