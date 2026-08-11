"""Notification document — an in-app message delivered to a specific User."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import NotificationCategory, NotificationType


class Notification(BaseDocument):
    user_id: uuid.UUID
    title: str = Field(max_length=150)
    message: str
    type: NotificationType = NotificationType.INFO
    link: str | None = Field(default=None, max_length=500)
    is_read: bool = False
    # Set when the notification is about a specific lead (e.g. a Finance
    # payment reminder). Acknowledging such a notification opens that lead, so
    # the id has to be structured rather than buried in `link`. None for
    # general notifications, which just get marked read.
    lead_id: uuid.UUID | None = None
    # What kind of reminder this is - see NotificationCategory for why opening
    # one has to depend on it. None on every notification raised before this
    # field existed, all of which were Finance payment reminders, so None is
    # read as PAYMENT_REMINDER rather than as "unknown".
    category: NotificationCategory | None = None
    # Identity of the thing being reminded about, e.g.
    # "follow_up:{lead}:{date}:{user}". The date reminders are raised by a
    # sweep that runs on a poll, so the same due date is examined over and over
    # and this is what stops it raising the same reminder every minute.
    dedupe_key: str | None = Field(default=None, max_length=200)

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel([("user_id", 1)]),
            IndexModel([("is_read", 1)]),
            # Unique, so two workers sweeping at the same moment can't both
            # insert the same reminder - the loser gets a DuplicateKeyError,
            # which the sweep treats as "already raised".
            #
            # Partial on purpose: every notification predating this field
            # stores dedupe_key as null, and a plain unique index would see
            # them all as duplicates of each other and refuse to build.
            IndexModel(
                [("dedupe_key", 1)],
                unique=True,
                partialFilterExpression={"dedupe_key": {"$type": "string"}},
            ),
        ]

    def __repr__(self) -> str:
        return f"<Notification {self.id} user={self.user_id} read={self.is_read}>"
