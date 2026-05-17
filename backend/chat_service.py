"""
chat_service.py
===============
Main orchestrator for the Matcha chat feature.
"""

from __future__ import annotations

import json
import logging
import os
import uuid

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session as DBSession

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from matcha_relay_service import (
    answer_pending_relay,
    build_chat_history_messages,
    create_relay_request,
    detect_relay_intent,
    get_pending_relay_for_target,
)
from memory_manager import check_and_compress, get_active_window, get_or_create_session
from memory_vector_store import retrieve_relevant_memories
from models import ConversationExchange, UserProfile
from prompt_builder import build_prompt
from web_search import perform_web_search, route_query

logger = logging.getLogger(__name__)

_chat_model = ChatOpenAI(model="gpt-4o-mini")


def _load_user_profile(user_id: str, db: DBSession) -> dict:
    profile_record = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == uuid.UUID(user_id))
        .order_by(UserProfile.created_at.desc())
        .first()
    )
    if not profile_record:
        return {}

    return {
        "name": profile_record.name,
        "interests": profile_record.interests or [],
        "goals": profile_record.goals or [],
        "learning_preferences": profile_record.learning_preferences or [],
        "collaboration_preferences": profile_record.collaboration_preferences or [],
        "execution_patterns": profile_record.execution_patterns or [],
        "discussion_topics": profile_record.discussion_topics or [],
        "matched_profiles": profile_record.matched_profiles or [],
    }


def _persist_exchange(
    user_id: str,
    session_id: str,
    message: str,
    assistant_reply: str,
    db: DBSession,
    temporary: bool,
) -> None:
    if temporary:
        return

    exchange = ConversationExchange(
        user_id=uuid.UUID(user_id),
        session_id=uuid.UUID(session_id),
        user_message=message,
        assistant_message=assistant_reply,
    )
    db.add(exchange)
    db.commit()


def _build_history_payload(session_id: str, exchanges: list[ConversationExchange], user_id: str, db: DBSession) -> dict:
    message_feed: list[dict] = []

    for index, ex in enumerate(exchanges):
        message_feed.append(
            {
                "id": f"history-user-{index}",
                "role": "user",
                "text": ex.user_message,
                "created_at": ex.created_at.isoformat(),
                "kind": "chat_user",
            }
        )
        message_feed.append(
            {
                "id": f"history-assistant-{index}",
                "role": "assistant",
                "text": ex.assistant_message,
                "created_at": ex.created_at.isoformat(),
                "kind": "chat_assistant",
            }
        )

    # Tag each message with its insertion position before merging relay messages.
    # User + assistant in the same exchange share identical created_at timestamps, so
    # the old id-string tiebreaker sorted "history-assistant-N" before "history-user-N"
    # (because 'a' < 'u'), putting the reply above the user message. Using a numeric
    # seq preserves insertion order for same-timestamp pairs.
    for seq, msg in enumerate(message_feed):
        msg["_seq"] = seq
    relay_messages = build_chat_history_messages(user_id, db)
    for seq, msg in enumerate(relay_messages, start=len(message_feed)):
        msg["_seq"] = seq
    message_feed.extend(relay_messages)
    message_feed.sort(key=lambda item: (item.get("created_at") or "", item["_seq"]))
    for msg in message_feed:
        msg.pop("_seq", None)

    return {
        "session_id": session_id,
        "exchanges": [
            {
                "user_message": ex.user_message,
                "assistant_message": ex.assistant_message,
                "created_at": ex.created_at.isoformat(),
            }
            for ex in exchanges
        ],
        "messages": message_feed,
    }


def _maybe_handle_matcha_relay_reply(user_id: str, message: str, db: DBSession) -> str | None:
    """
    If the user has an inbound pending relay (someone relayed a question to them through Matcha)
    AND the current message looks like a substantive reply (not a new relay creation attempt),
    save it as the relay answer and notify the user.

    Guards:
    - Message must be at least 10 characters (not just a greeting or one-liner).
    - We skip relay-creation patterns so "ask X about Y" doesn't get consumed here.
    """
    # Quick pre-check: avoid consuming relay-creation messages as relay answers
    msg_lower = message.lower().strip()
    RELAY_CREATION_MARKERS = ("ask ", "tell ", "find out", "can you ask", "can you tell", "forward this")
    if any(msg_lower.startswith(m) for m in RELAY_CREATION_MARKERS):
        return None

    # Minimum length guard — trivial messages shouldn't be relay answers
    if len(message.strip()) < 10:
        return None

    pending = get_pending_relay_for_target(user_id, db)
    if pending is None:
        return None

    # Save the raw reply as the relay answer
    answered_relay = answer_pending_relay(user_id, message, db)
    if answered_relay is None:
        return None

    return (
        "Thanks — I've passed your answer back through Matcha. "
        "They'll see it in their Matcha chat without needing to open a direct conversation with you."
    )



def _build_relay_candidates(user_id: str, user_profile: dict, db: DBSession) -> list[dict]:
    """
    Build a unified candidate list for relay intent detection from:
      1. Similarity matches stored in the user's matched_profiles JSONB column.
      2. Accepted direct connections — so relay also works between connected users.
    Deduplicates by profile_id.
    """
    from models import UserConnection, UserProfile as UP

    candidates: dict[str, dict] = {}

    # -- Source 1: similarity matches (top-3 stored from /perform_similarity) --
    for match in user_profile.get("matched_profiles") or []:
        pid = str(match.get("profile_id") or "")
        if pid:
            candidates[pid] = {
                "profile_id": pid,
                "user_id": str(match.get("user_id") or ""),
                "name": match.get("name") or match.get("user") or "Unknown",
                "source": "similarity",
            }

    # -- Source 2: accepted connections --
    user_uuid = uuid.UUID(user_id)
    connections = (
        db.query(UserConnection)
        .filter(
            (UserConnection.requester_id == user_uuid) | (UserConnection.recipient_id == user_uuid),
            UserConnection.status == "accepted",
        )
        .all()
    )
    for conn in connections:
        # Determine the other party's user_id and their profile
        other_user_id = conn.recipient_id if conn.requester_id == user_uuid else conn.requester_id
        other_profile_id = conn.recipient_profile_id if conn.requester_id == user_uuid else conn.requester_profile_id

        if not other_profile_id:
            # Fall back to querying the latest profile for that user
            profile_rec = (
                db.query(UP)
                .filter(UP.user_id == other_user_id)
                .order_by(UP.created_at.desc())
                .first()
            )
            if profile_rec:
                other_profile_id = profile_rec.id
                name = profile_rec.name or "Unknown"
            else:
                continue
        else:
            profile_rec = db.query(UP).filter(UP.id == other_profile_id).first()
            name = profile_rec.name if profile_rec else "Unknown"

        pid = str(other_profile_id)
        if pid not in candidates:
            candidates[pid] = {
                "profile_id": pid,
                "user_id": str(other_user_id),
                "name": name or "Unknown",
                "source": "connection",
            }

    return list(candidates.values())


def _maybe_create_matcha_relay(
    user_id: str,
    message: str,
    db: DBSession,
    user_profile: dict,
    active_window: list | None = None,
) -> dict | None:
    candidates = _build_relay_candidates(user_id, user_profile, db)
    relay_intent = detect_relay_intent(user_id, message, candidates, active_window or [])
    if relay_intent is None:
        return None

    try:
        relay, target_profile = create_relay_request(
            requester_id=user_id,
            target_profile_id=relay_intent["target_profile_id"],
            question=relay_intent["rewritten_question"],
            db=db,
        )
    except ValueError as exc:
        return {"notice": str(exc), "created": False}

    target_name = target_profile.name or "that match"
    return {
        "created": True,
        "relay_id": str(relay.id),
        "target_name": target_name,
        "question": relay.question,
        "notice": (
            f"I've sent your question to {target_name} through Matcha.\n\n"
            "If they're offline or reply later, I'll post their answer here in your personal Matcha chat as soon as I receive it.\n\n"
            f"Question sent: {relay.question}"
        ),
    }



def send_message(user_id: str, message: str, db: DBSession, temporary: bool = False, history: list | None = None) -> dict:
    user_profile = _load_user_profile(user_id, db)

    session_id = get_or_create_session(user_id, db)
    session_id = check_and_compress(user_id, session_id, db)

    retrieved_memories = retrieve_relevant_memories(user_id, message, top_k=3)

    if temporary:
        session_id = "temp-session"
        active_window = history or []
    else:
        exchanges = get_active_window(session_id, db)
        active_window = [
            {
                "user_message": ex.user_message,
                "assistant_message": ex.assistant_message,
            }
            for ex in exchanges
        ]

    # Relay detection runs even in temp-chat — only *persistence* is skipped.
    relay_reply = _maybe_handle_matcha_relay_reply(user_id, message, db)
    if relay_reply is not None:
        _persist_exchange(user_id, session_id, message, relay_reply, db, temporary)
        return {"response": relay_reply, "session_id": session_id}

    relay_request = _maybe_create_matcha_relay(user_id, message, db, user_profile, active_window)
    relay_notice = relay_request["notice"] if relay_request else None
    if relay_request:
        # Do NOT persist relay creation notices — relay cards from build_chat_history_messages
        # are the canonical history representation; persisting here would create duplicates.
        return {"response": relay_notice, "session_id": session_id}

    web_context = None
    if route_query(message):
        web_context = perform_web_search(message, max_results=3)

    prompt_messages = build_prompt(
        user_profile=user_profile,
        active_exchanges=active_window,
        current_query=message,
        retrieved_memories=retrieved_memories or None,
        web_context=web_context,
        retrieved_similar_profiles=user_profile.get("matched_profiles"),
    )

    llm_response = _chat_model.invoke(prompt_messages)
    assistant_reply = llm_response.content.strip()

    _persist_exchange(user_id, session_id, message, assistant_reply, db, temporary)

    logger.info(
        "chat_service: processed message for user=%s session=%s temporary=%s",
        user_id,
        session_id,
        temporary,
    )

    return {
        "response": assistant_reply,
        "session_id": session_id,
    }


def get_history(user_id: str, db: DBSession) -> dict:
    session_id = get_or_create_session(user_id, db)
    exchanges = get_active_window(session_id, db)
    return _build_history_payload(session_id, exchanges, user_id, db)


async def stream_message(
    user_id: str,
    message: str,
    db: DBSession,
    temporary: bool = False,
    history: list | None = None,
):
    user_profile = _load_user_profile(user_id, db)

    session_id = get_or_create_session(user_id, db)
    session_id = check_and_compress(user_id, session_id, db)

    retrieved_memories = retrieve_relevant_memories(user_id, message, top_k=3)

    if temporary:
        session_id = "temp-session"
        active_window = history or []
    else:
        exchanges = get_active_window(session_id, db)
        active_window = [
            {
                "user_message": ex.user_message,
                "assistant_message": ex.assistant_message,
            }
            for ex in exchanges
        ]

    # Relay detection runs even in temp-chat — only *persistence* is skipped.
    relay_reply = _maybe_handle_matcha_relay_reply(user_id, message, db)
    if relay_reply is not None:
        _persist_exchange(user_id, session_id, message, relay_reply, db, temporary)
        yield f"data: {json.dumps(relay_reply)}\n\n"
        yield "data: [DONE]\n\n"
        return

    relay_request = _maybe_create_matcha_relay(user_id, message, db, user_profile, active_window)
    relay_notice = relay_request["notice"] if relay_request else None
    if relay_request:
        # Do NOT persist relay creation notices — relay cards are the canonical history.
        yield f"data: {json.dumps(relay_notice)}\n\n"
        yield "data: [DONE]\n\n"
        return

    web_context = None
    if route_query(message):
        web_context = perform_web_search(message, max_results=3)

    prompt_messages = build_prompt(
        user_profile=user_profile,
        active_exchanges=active_window,
        current_query=message,
        retrieved_memories=retrieved_memories or None,
        web_context=web_context,
        retrieved_similar_profiles=user_profile.get("matched_profiles"),
    )

    full_response_parts: list[str] = []

    try:
        async for chunk in _chat_model.astream(prompt_messages):
            token = chunk.content
            if token:
                full_response_parts.append(token)
                yield f"data: {json.dumps(token)}\n\n"
    except Exception as e:
        logger.error("chat_service: streaming error - %s", e)
        yield f"data: {json.dumps('[ERROR] Something went wrong.')}\n\n"

    full_response = "".join(full_response_parts)
    if full_response.strip():
        try:
            _persist_exchange(user_id, session_id, message, full_response, db, temporary)
        except Exception as e:
            logger.error("chat_service: failed to persist streamed exchange - %s", e)

    yield "data: [DONE]\n\n"
