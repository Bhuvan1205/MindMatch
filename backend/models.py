import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from database import Base


# =========================================================
# USER TABLE  (authentication identity)
# =========================================================

class User(Base):
    __tablename__ = "users"

    # ── Core identity ───────────────────────────────────────
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at      = Column(DateTime, default=datetime.utcnow)

    # ── Credentials ─────────────────────────────────────────
    username        = Column(String, unique=True, nullable=True)   # null for Google-only users
    email           = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=True)                # null for Google-only users

    # ── OAuth ────────────────────────────────────────────────
    google_id       = Column(String, unique=True, nullable=True)

    # ── Relationships ─────────────────────────────────────────
    profiles      = relationship("UserProfile", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="user")
    exchanges     = relationship("ConversationExchange", back_populates="user")
    memories      = relationship("EpisodicMemory", back_populates="user")


# =========================================================
# USER PROFILE TABLE  (cognitive compatibility profile)
# =========================================================

class UserProfile(Base):
    __tablename__ = "user_profiles"

    # ── Core identity ───────────────────────────────────────
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ── Link to authenticated user (nullable for legacy / seed profiles) ──
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    user       = relationship("User", back_populates="profiles")

    # ── Display name (from LLM extraction) ──────────────────
    name       = Column(String, nullable=True)

    # ── Raw profile features (text lists from LLM extraction) ──
    # Embeddings are NOT stored here — they live in Pinecone.
    interests                   = Column(JSONB, nullable=True)
    goals                       = Column(JSONB, nullable=True)
    learning_preferences        = Column(JSONB, nullable=True)
    collaboration_preferences   = Column(JSONB, nullable=True)
    execution_patterns          = Column(JSONB, nullable=True)
    discussion_topics           = Column(JSONB, nullable=True)
    matched_profiles            = Column(JSONB, nullable=True)


# =========================================================
# CHAT SESSION TABLE
# Tracks the active session window for each user.
# A new session is created when the previous one is summarized.
# =========================================================

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at   = Column(DateTime, nullable=True)

    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    user       = relationship("User", back_populates="chat_sessions")

    # Only one session per user should be active at a time
    is_active  = Column(Boolean, default=True, nullable=False)

    exchanges  = relationship("ConversationExchange", back_populates="session")


# =========================================================
# CONVERSATION EXCHANGE TABLE
# Ordered, timestamped log of every chat turn within a session.
# Replaces the prototype's raw {query: response} dict.
# =========================================================

class ConversationExchange(Base):
    __tablename__ = "conversation_exchanges"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at       = Column(DateTime, default=datetime.utcnow)

    user_id          = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    user             = relationship("User", back_populates="exchanges")

    session_id       = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False)
    session          = relationship("ChatSession", back_populates="exchanges")

    user_message     = Column(Text, nullable=False)
    assistant_message = Column(Text, nullable=False)


# =========================================================
# EPISODIC MEMORY TABLE
# Stores compressed long-term memory summaries.
# The row ID doubles as the Pinecone record ID in the
# 'episodic_memories' collection.
# =========================================================

class EpisodicMemory(Base):
    __tablename__ = "episodic_memories"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at     = Column(DateTime, default=datetime.utcnow)

    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    user           = relationship("User", back_populates="memories")

    # The session that was compressed to produce this memory
    session_id     = Column(UUID(as_uuid=True), nullable=False)

    # 2–4 sentence durable memory (also stored in Pinecone for semantic retrieval)
    memory_summary = Column(Text, nullable=False)

    # "episodic" by default — extensible for future memory types
    memory_type    = Column(String, default="episodic", nullable=False)


# =========================================================
# USER CONNECTION TABLE
# Tracks direct interaction permissions between matched users.
# =========================================================

class UserConnection(Base):
    __tablename__ = "user_connections"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requester_id   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recipient_id   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    requester_profile_id = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id"), nullable=True)
    recipient_profile_id = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id"), nullable=True)

    # pending | accepted | declined | blocked
    status         = Column(String, default="pending", nullable=False)
    recipient_request_seen_at = Column(DateTime, nullable=True)
    requester_accepted_seen_at = Column(DateTime, nullable=True)


# =========================================================
# DIRECT MESSAGE TABLE
# Stores user-to-user messages once a connection is accepted.
# =========================================================

class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at     = Column(DateTime, default=datetime.utcnow)

    connection_id  = Column(UUID(as_uuid=True), ForeignKey("user_connections.id"), nullable=False)
    sender_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    receiver_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    message        = Column(Text, nullable=False)
    read_at        = Column(DateTime, nullable=True)


# =========================================================
# EXPERIENCE ROUTING LOG
# Audit trail for LLM-mediated advice using another user's stored experience.
# =========================================================

class ExperienceRoutingLog(Base):
    __tablename__ = "experience_routing_logs"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at     = Column(DateTime, default=datetime.utcnow)

    asker_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_profile_id = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id"), nullable=False)

    query          = Column(Text, nullable=False)
    response       = Column(Text, nullable=False)
    context_metadata = Column(JSONB, nullable=True)


# =========================================================
# MATCHA ADVICE RELAY
# Tracks anonymous Matcha-mediated advice requests between users.
# =========================================================

class AdviceRelayRequest(Base):
    __tablename__ = "advice_relay_requests"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    requester_id   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    target_profile_id = Column(UUID(as_uuid=True), ForeignKey("user_profiles.id"), nullable=False)

    question       = Column(Text, nullable=False)
    status         = Column(String, default="pending", nullable=False)  # pending | answered | declined
    response       = Column(Text, nullable=True)
    answered_at    = Column(DateTime, nullable=True)
