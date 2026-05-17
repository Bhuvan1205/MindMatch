from __future__ import annotations

import os
import uuid

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import (
    ConversationExchange,
    EpisodicMemory,
    ExperienceRoutingLog,
    UserConnection,
    UserProfile,
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

_experience_model = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)


def profile_to_context(record: UserProfile) -> dict:
    return {
        "profile_id": str(record.id),
        "user_id": str(record.user_id) if record.user_id else None,
        "name": record.name,
        "interests": record.interests or [],
        "goals": record.goals or [],
        "learning_preferences": record.learning_preferences or [],
        "collaboration_preferences": record.collaboration_preferences or [],
        "execution_patterns": record.execution_patterns or [],
        "discussion_topics": record.discussion_topics or [],
    }


def get_latest_profile_for_user(user_id: uuid.UUID, db: Session) -> UserProfile | None:
    return (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .order_by(UserProfile.created_at.desc())
        .first()
    )


def is_suggested_match(asker_profile: UserProfile | None, target_profile_id: str) -> bool:
    if not asker_profile or not asker_profile.matched_profiles:
        return False

    for match in asker_profile.matched_profiles:
        if str(match.get("profile_id")) == target_profile_id:
            return True
    return False


def get_connection_between(user_a: uuid.UUID, user_b: uuid.UUID, db: Session) -> UserConnection | None:
    return (
        db.query(UserConnection)
        .filter(
            or_(
                (UserConnection.requester_id == user_a) & (UserConnection.recipient_id == user_b),
                (UserConnection.requester_id == user_b) & (UserConnection.recipient_id == user_a),
            )
        )
        .order_by(UserConnection.created_at.desc())
        .first()
    )


def can_use_target_experience(
    asker_id: uuid.UUID,
    target_profile: UserProfile,
    asker_profile: UserProfile | None,
    db: Session,
) -> bool:
    if target_profile.user_id is None:
        return False
    if target_profile.user_id == asker_id:
        return True

    connection = get_connection_between(asker_id, target_profile.user_id, db)
    if connection and connection.status == "accepted":
        return True

    return is_suggested_match(asker_profile, str(target_profile.id))


def collect_experience_context(target_profile: UserProfile, db: Session) -> dict:
    memories = (
        db.query(EpisodicMemory)
        .filter(EpisodicMemory.user_id == target_profile.user_id)
        .order_by(EpisodicMemory.created_at.desc())
        .limit(5)
        .all()
        if target_profile.user_id
        else []
    )

    exchanges = (
        db.query(ConversationExchange)
        .filter(ConversationExchange.user_id == target_profile.user_id)
        .order_by(ConversationExchange.created_at.desc())
        .limit(6)
        .all()
        if target_profile.user_id
        else []
    )

    return {
        "profile": profile_to_context(target_profile),
        "memories": [m.memory_summary for m in memories],
        "recent_exchanges": [
            {
                "user_message": ex.user_message,
                "assistant_message": ex.assistant_message,
            }
            for ex in reversed(exchanges)
        ],
    }


def answer_from_user_experience(
    asker_id: uuid.UUID,
    asker_profile: UserProfile | None,
    target_profile: UserProfile,
    question: str,
    db: Session,
) -> tuple[str, dict]:
    context = collect_experience_context(target_profile, db)
    asker_context = profile_to_context(asker_profile) if asker_profile else {}

    messages = [
        {
            "role": "system",
            "content": (
                "You are MindMatch's experience-routing assistant. "
                "Use the selected user's stored profile and experience context to give realistic, grounded advice. "
                "Do not impersonate the selected user. Do not claim they personally said something unless it appears in the provided context. "
                "Do not reveal raw private transcript details unnecessarily. Synthesize patterns, lessons, and practical advice. "
                "If the selected user appears useful for a real conversation, briefly suggest direct interaction."
            ),
        },
        {
            "role": "user",
            "content": (
                f"[Asking User Profile]\n{asker_context}\n\n"
                f"[Selected User Experience Context]\n{context}\n\n"
                f"[Question]\n{question}"
            ),
        },
    ]

    response = _experience_model.invoke(messages)
    answer = response.content.strip()

    log = ExperienceRoutingLog(
        asker_id=asker_id,
        target_user_id=target_profile.user_id,
        target_profile_id=target_profile.id,
        query=question,
        response=answer,
        context_metadata={
            "memory_count": len(context["memories"]),
            "recent_exchange_count": len(context["recent_exchanges"]),
        },
    )
    db.add(log)
    db.commit()

    return answer, context
