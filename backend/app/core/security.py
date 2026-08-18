"""Password hashing and JWT token utilities."""
import uuid
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config.settings import settings

# bcrypt is slow on purpose: that cost is the defence against an offline
# attack on a stolen hash, so production keeps the library default.
#
# It is dead weight in tests, though. Nearly every test seeds a Super Admin
# and logs in, which is one hash plus one verify - 660ms measured, on a suite
# where that is most of the wall clock. Four rounds is the bcrypt minimum and
# runs in 2ms. Keyed off APP_ENV, which conftest.py pins to "test" before any
# app module is imported, so it can only ever be lowered by the test harness
# and never by configuration.
# Empty outside tests, so production stays on passlib's own default rather
# than a number pinned here that would stop tracking it.
_COST = {"bcrypt__rounds": 4} if settings.APP_ENV == "test" else {}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", **_COST)


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _create_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type.value,
        "iat": now,
        "exp": expire,
        "iss": settings.JWT_ISSUER,
        "jti": jti,
    }
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expire


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> tuple[str, str, datetime]:
    return _create_token(
        subject,
        TokenType.ACCESS,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        extra_claims,
    )


def create_refresh_token(subject: str) -> tuple[str, str, datetime]:
    return _create_token(
        subject,
        TokenType.REFRESH,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on failure (expired, bad signature, ...)."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        issuer=settings.JWT_ISSUER,
    )


__all__ = [
    "TokenType",
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "JWTError",
]
