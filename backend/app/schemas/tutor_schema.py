"""Request/response DTOs for the Tutor Management module."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import TutorStatus


class TutorCreate(BaseModel):
    user_id: uuid.UUID
    specialization: str = Field(min_length=2, max_length=255)
    bio: str | None = None
    joining_date: date


class TutorUpdate(BaseModel):
    specialization: str | None = Field(default=None, min_length=2, max_length=255)
    bio: str | None = None
    status: TutorStatus | None = None


class TutorResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    specialization: str
    bio: str | None
    joining_date: date
    status: TutorStatus
    created_at: datetime

    model_config = {"from_attributes": True}
