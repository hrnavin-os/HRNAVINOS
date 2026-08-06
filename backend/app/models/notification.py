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
    # Set when the notification is about a specific lead (e.g. a Finance
    # payment reminder). Acknowledging such a notification moves that lead to
    # the follow-up stage, so the id has to be structured rather than buried
    # in `link`. None for general notifications, which just get marked read.
    lead_id: uuid.UUID | None = None

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel([("user_id", 1)]),
            IndexModel([("is_read", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Notification {self.id} user={self.user_id} read={self.is_read}>"
