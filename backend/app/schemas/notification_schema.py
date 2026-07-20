"""Request/response DTOs for the Notifications module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import NotificationType


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
    created_at: datetime

    model_config = {"from_attributes": True}
