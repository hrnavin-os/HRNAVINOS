"""Request/response DTOs for the Notifications module."""
import uuid
from datetime import datetime
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


class PaymentReminderRequest(BaseModel):
    # Which outstanding amount the reminder is about. Drives the wording only -
    # every kind lands on the same section admins and moves the same lead.
    kind: Literal["due", "emi", "after_placement"]
    note: str | None = Field(default=None, max_length=500)


class PaymentReminderResponse(BaseModel):
    message: str
    notified: int
