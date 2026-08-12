"""Request/response DTOs for the Notifications module."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import NotificationCategory, NotificationType


class NotificationCreate(BaseModel):
    user_id: uuid.UUID
    title: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1)
    type: NotificationType = NotificationType.INFO
    link: str | None = Field(default=None, max_length=500)


class NotificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message: str
    type: NotificationType
    link: str | None
    is_read: bool
    lead_id: uuid.UUID | None = None
    # Lets the UI show a matching icon and, for the date reminders, skip the
    # "moves the lead to follow up" wording that only applies to Finance's.
    category: NotificationCategory | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationBulkDeleteRequest(BaseModel):
    # Bounded so a single request can't ask the database to match an unbounded
    # $in list; the panel only ever shows 20 at a time and the full page 100.
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class NotificationDeleteResponse(BaseModel):
    message: str
    deleted: int


class PaymentReminderRequest(BaseModel):
    # Which outstanding amount the reminder is about. Drives the wording only -
    # every kind lands on the same section admins and moves the same lead.
    kind: Literal["due", "emi", "after_placement"]
    note: str | None = Field(default=None, max_length=500)


class NonPaymentReportRequest(BaseModel):
    # What is still owed, so the HR Coordinator's notification names a figure
    # rather than sending them to look it up.
    amount: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=500)


class PaymentReminderResponse(BaseModel):
    message: str
    notified: int
    # Recipients skipped because they hadn't opened the last identical reminder
    # yet. Reported rather than hidden, so a suppressed double-press reads as
    # deliberate instead of as a send that silently did nothing.
    already_pending: int = 0
