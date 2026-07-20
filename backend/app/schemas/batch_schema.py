"""Request/response DTOs for the Batch Management module."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models.enums import BatchStatus


class BatchCreate(BaseModel):
    course_id: uuid.UUID
    tutor_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=100)
    start_date: date
    end_date: date
    schedule: str | None = None
    capacity: int = Field(default=30, gt=0)

    @model_validator(mode="after")
    def validate_dates(self) -> "BatchCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date.")
        return self


class BatchUpdate(BaseModel):
    tutor_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=2, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    schedule: str | None = None
    capacity: int | None = Field(default=None, gt=0)
    status: BatchStatus | None = None


class BatchResponse(BaseModel):
    id: uuid.UUID
    course_id: uuid.UUID
    tutor_id: uuid.UUID | None
    name: str
    start_date: date
    end_date: date
    schedule: str | None
    capacity: int
    status: BatchStatus
    created_at: datetime

    model_config = {"from_attributes": True}
