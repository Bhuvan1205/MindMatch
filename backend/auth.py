"""
auth.py
=======
Authentication utilities for MindMatch.

Provides:
  - Password hashing / verification  (passlib + bcrypt)
  - JWT access token creation / decoding  (python-jose)
  - Google ID-token verification  (google-auth)
  - FastAPI dependency: get_current_user
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

# =========================================================
# CONFIG  (values come from .env)
# =========================================================

SECRET_KEY                   = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
ALGORITHM                    = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES  = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days
GOOGLE_CLIENT_ID             = os.getenv("GOOGLE_CLIENT_ID", "")


# =========================================================
# PASSWORD HASHING
# =========================================================

import hashlib

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def normalize_password(password: str) -> str:
    if not password:
        raise ValueError("Password cannot be empty")
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def hash_password(plain: str) -> str:
    return _pwd_context.hash(normalize_password(plain))

def verify_password(plain: str, hashed: str) -> bool:
    try:
        # First try the new pre-hashed format
        if _pwd_context.verify(normalize_password(plain), hashed):
            return True
        # Fallback to legacy raw bcrypt verification
        return _pwd_context.verify(plain, hashed)
    except Exception as e:
        logger.warning(f"Auth verification failure: {str(e)}")
        return False


# =========================================================
# JWT
# =========================================================

def create_access_token(user_id: str) -> str:
    """Create a signed JWT that expires after ACCESS_TOKEN_EXPIRE_MINUTES."""
    expire  = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    """
    Validate a JWT and return the ``sub`` (user UUID string).
    Raises HTTP 401 if the token is invalid or expired.
    """
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise JWTError("Missing sub claim")
        return user_id
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# =========================================================
# GOOGLE ID-TOKEN VERIFICATION
# =========================================================

def verify_google_token(credential: str) -> dict:
    """
    Verify a Google ID token received from the frontend and return
    the decoded payload (contains ``sub``, ``email``, ``name``, etc.).

    Requires GOOGLE_CLIENT_ID to be set in .env.
    Install:  pip install google-auth
    """
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID is not configured on the server.",
        )

    try:
        id_info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
        return id_info
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google credential: {exc}",
        ) from exc


# =========================================================
# FASTAPI DEPENDENCY — get_current_user
# =========================================================

_bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency.  Validates the Bearer JWT and returns the User ORM record.
    Inject via  ``Depends(get_current_user)``  on any protected endpoint.

    Raises HTTP 401 if the token is missing, invalid, expired, or the user
    no longer exists in PostgreSQL.
    """
    import uuid as _uuid

    user_id = decode_access_token(credentials.credentials)

    try:
        user = db.query(User).filter(User.id == _uuid.UUID(user_id)).first()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
