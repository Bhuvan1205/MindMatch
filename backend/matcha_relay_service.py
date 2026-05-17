from __future__ import annotations

import json
import os
import uuid
from datetime import datetime

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from experience_service import can_use_target_experience, get_latest_profile_for_user
from models import AdviceRelayRequest, UserProfile

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

_relay_model = ChatOpenAI(model="gpt-4o-mini", temperature=0)


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return stripped


_RELAY_KEYWORDS = (
    "ask ",
    "tell ",
    "find out",
    "can you ask",
    "can you tell",
    "pass this",
    "forward this",
    "what's ",
    "whats ",
    "relay",
)


def _looks_like_relay_intent(message: str) -> bool:
    """Fast keyword pre-filter — skips the LLM call for clearly non-relay messages."""
    lowered = message.lower()
    return any(kw in lowered for kw in _RELAY_KEYWORDS)


def detect_relay_intent(
    user_id: str,
    message: str,
    matched_profiles: list[dict] | None,
    active_window: list | None = None,
) -> dict | None:
    if not matched_profiles:
        return None
    if not _looks_like_relay_intent(message):
        return None

    matches_context = [
        {
            "profile_id": str(match.get("profile_id") or ""),
            "user_id": str(match.get("user_id") or ""),
            "name": match.get("name") or match.get("user") or "Unknown",
            "reason": match.get("reason") or "",
            "interests": match.get("interests") or [],
            "goals": match.get("goals") or [],
            "discussion_topics": match.get("discussion_topics") or [],
        }
        for match in matched_profiles
        if match.get("profile_id")
    ]
    if not matches_context:
        return None

    # Build a concise recent-context snippet so the LLM can resolve references like "that"
    context_lines = []
    for ex in (active_window or [])[-6:]:  # last 6 turns
        if isinstance(ex, dict):
            context_lines.append(f"User: {ex.get('user_message', '')}")
            context_lines.append(f"Matcha: {ex.get('assistant_message', '')}")
    recent_context_str = "\n".join(context_lines) if context_lines else "(none)"

    prompt = [
        {
            "role": "system",
            "content": (
                "You are a relay-intent detector for MindMatch's Matcha AI. "
                "Decide if the user wants Matcha to forward a question or request to one of their named matches or connections.\n\n"
                "Trigger relay (should_relay: true) when the user:\n"
                "  - Names or refers to a person in the candidate list (e.g. 'ask Bhagya', 'tell Rahul', 'what is X doing')\n"
                "  - Asks about that person's current activities, learning, projects, goals, opinions, advice, or experience\n"
                "  - Uses phrasing like 'can you ask', 'find out from', 'ask them', 'what does X think', 'what is X learning'\n\n"
                "IMPORTANT: Use the [Recent Conversation] to resolve vague references like 'that', 'this', 'it', 'the same thing'.\n"
                "Rewrite the question to be self-contained and explicit — do not include pronouns or vague references.\n\n"
                "Do NOT trigger relay for general questions not directed at a specific person in the list.\n\n"
                "Return ONLY a raw JSON object — no markdown fences, no explanation — with exactly these keys:\n"
                "  should_relay (bool), target_profile_id (string or null), rewritten_question (string), confidence (float 0-1)"
            ),
        },
        {
            "role": "user",
            "content": (
                f"[User ID]\n{user_id}\n\n"
                f"[Candidates (similarity matches + connections)]\n{json.dumps(matches_context)}\n\n"
                f"[Recent Conversation]\n{recent_context_str}\n\n"
                f"[User Message]\n{message}"
            ),
        },
    ]

    response = _relay_model.invoke(prompt)
    try:
        parsed = json.loads(_strip_code_fences(response.content))
    except Exception:
        return None

    if not parsed.get("should_relay"):
        return None

    target_profile_id = str(parsed.get("target_profile_id") or "").strip()
    rewritten_question = str(parsed.get("rewritten_question") or message).strip()
    if not target_profile_id or not rewritten_question:
        return None

    return {
        "target_profile_id": target_profile_id,
        "rewritten_question": rewritten_question,
        "confidence": parsed.get("confidence"),
    }


def create_relay_request(
    requester_id: str,
    target_profile_id: str,
    question: str,
    db: Session,
) -> tuple[AdviceRelayRequest, UserProfile]:
    target_profile = (
        db.query(UserProfile)
        .filter(UserProfile.id == uuid.UUID(target_profile_id))
        .first()
    )
    if target_profile is None or target_profile.user_id is None:
        raise ValueError("That match is not available for Matcha relay.")

    requester_uuid = uuid.UUID(requester_id)
    requester_profile = get_latest_profile_for_user(requester_uuid, db)
    if not can_use_target_experience(requester_uuid, target_profile, requester_profile, db):
        raise ValueError("That person's advice is not available from your current match context.")

    relay = AdviceRelayRequest(
        requester_id=requester_uuid,
        target_user_id=target_profile.user_id,
        target_profile_id=target_profile.id,
        question=question,
        status="pending",
    )
    db.add(relay)
    db.commit()
    db.refresh(relay)
    return relay, target_profile


def get_pending_relay_for_target(user_id: str, db: Session) -> AdviceRelayRequest | None:
    return (
        db.query(AdviceRelayRequest)
        .filter(
            AdviceRelayRequest.target_user_id == uuid.UUID(user_id),
            AdviceRelayRequest.status == "pending",
        )
        .order_by(AdviceRelayRequest.created_at.asc())
        .first()
    )


def answer_pending_relay(user_id: str, message: str, db: Session) -> AdviceRelayRequest | None:
    relay = get_pending_relay_for_target(user_id, db)
    if relay is None:
        return None

    relay.status = "answered"
    relay.response = message.strip()
    relay.answered_at = datetime.utcnow()
    db.commit()
    db.refresh(relay)
    return relay


def build_chat_history_messages(user_id: str, db: Session) -> list[dict]:
    user_uuid = uuid.UUID(user_id)

    pending_outbound_relays = (
        db.query(AdviceRelayRequest, UserProfile.name)
        .join(UserProfile, UserProfile.id == AdviceRelayRequest.target_profile_id)
        .filter(
            AdviceRelayRequest.requester_id == user_uuid,
            AdviceRelayRequest.status == "pending",
        )
        .order_by(AdviceRelayRequest.created_at.asc())
        .all()
    )

    incoming_prompts = (
        db.query(AdviceRelayRequest, UserProfile.name)
        .join(UserProfile, UserProfile.id == AdviceRelayRequest.target_profile_id)
        .filter(
            AdviceRelayRequest.target_user_id == user_uuid,
            AdviceRelayRequest.status == "pending",
        )
        .order_by(AdviceRelayRequest.created_at.asc())
        .all()
    )

    answered_relays = (
        db.query(AdviceRelayRequest, UserProfile.name)
        .join(UserProfile, UserProfile.id == AdviceRelayRequest.target_profile_id)
        .filter(
            AdviceRelayRequest.requester_id == user_uuid,
            AdviceRelayRequest.status == "answered",
            AdviceRelayRequest.response.isnot(None),
        )
        .order_by(AdviceRelayRequest.answered_at.asc(), AdviceRelayRequest.created_at.asc())
        .all()
    )

    messages: list[dict] = []

    for relay, target_name in pending_outbound_relays:
        messages.append(
            {
                "id": f"relay-pending-{relay.id}",
                "role": "assistant",
                "text": (
                    f"Waiting on {target_name or 'your match'}'s advice.\n\n"
                    "Their reply will appear here in your personal Matcha chat as soon as they answer."
                ),
                "created_at": relay.created_at.isoformat(),
                "kind": "relay_pending",
                "relay_id": str(relay.id),
                "target_name": target_name,
                "question": relay.question,
            }
        )

    for relay, target_name in incoming_prompts:
        messages.append(
            {
                "id": f"relay-inbound-{relay.id}",
                "role": "assistant",
                "text": (
                    "A match wants advice through Matcha, so they do not have to message you directly.\n\n"
                    f"Question about your experience: {relay.question}\n\n"
                    "Reply here and I will pass your answer back anonymously."
                ),
                "created_at": relay.created_at.isoformat(),
                "kind": "relay_inbound_prompt",
                "relay_id": str(relay.id),
                "target_name": target_name,
                "question": relay.question,
            }
        )

    for relay, target_name in answered_relays:
        messages.append(
            {
                "id": f"relay-answer-{relay.id}",
                "role": "assistant",
                "text": (
                    f"{target_name or 'Your match'} replied through Matcha:\n\n"
                    f"{relay.response}"
                ),
                "created_at": (relay.answered_at or relay.updated_at).isoformat(),
                "kind": "relay_answer",
                "relay_id": str(relay.id),
                "target_name": target_name,
                "question": relay.question,
            }
        )

    return messages
