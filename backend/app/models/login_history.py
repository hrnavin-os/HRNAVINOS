"""Login history document — records every authentication attempt for security auditing."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class LoginHistory(BaseDocument):
    """Records every login attempt (successful or not) for security auditing."""

    user_id: uuid.UUID | None = None
    email_attempted: str = Field(max_length=255)
    success: bool
    failure_reason: str | None = Field(default=None, max_length=255)
    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)

    class Settings:
        name = "login_histories"
        indexes = [IndexModel([("user_id", 1)])]

    def __repr__(self) -> str:
        return f"<LoginHistory {self.email_attempted} success={self.success}>"
