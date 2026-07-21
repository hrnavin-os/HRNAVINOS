"""Notification document — an in-app message delivered to a specific User."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import NotificationType


class Notification(BaseDocument):
    user_id: uuid.UUID
    title: str = Field(max_length=150)
    message: str
    type: NotificationType = NotificationType.INFO
    link: str | None = Field(default=None, max_length=500)
    is_read: bool = False

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel([("user_id", 1)]),
            IndexModel([("is_read", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Notification {self.id} user={self.user_id} read={self.is_read}>"
