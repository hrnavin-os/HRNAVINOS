"""User document — every human actor in the ERP (staff and students alike)."""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class User(BaseDocument):
    """A user account. Business-role-specific data (Student, Tutor, ...) lives in
    dedicated profile documents that link back to this via `user_id`."""

    email: str = Field(max_length=255)
    password_hash: str = Field(max_length=255)
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    avatar_url: str | None = Field(default=None, max_length=500)

    role_id: uuid.UUID | None = None

    is_active: bool = True
    is_verified: bool = False
    must_change_password: bool = False
    last_login_at: datetime | None = None

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", 1)], unique=True),
            IndexModel([("role_id", 1)]),
            IndexModel([("is_deleted", 1)]),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:
        return f"<User {self.email}>"
