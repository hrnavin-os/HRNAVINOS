"""Refresh token document — enables logout / revocation and session management."""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class RefreshToken(BaseDocument):
    """A single issued refresh token (identified by its JWT `jti`), trackable and revocable."""

    user_id: uuid.UUID
    jti: str = Field(max_length=64)
    expires_at: datetime
    revoked: bool = False
    revoked_at: datetime | None = None
    device_info: str | None = Field(default=None, max_length=255)
    ip_address: str | None = Field(default=None, max_length=45)

    class Settings:
        name = "refresh_tokens"
        indexes = [
            IndexModel([("jti", 1)], unique=True),
            IndexModel([("user_id", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<RefreshToken {self.jti} user={self.user_id}>"
