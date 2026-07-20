"""Request/response DTOs for the Student Management module."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import StudentStatus


class StudentCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    course_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    admission_date: date


class StudentUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    course_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    status: StudentStatus | None = None


class StudentResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None
    course_id: uuid.UUID | None
    batch_id: uuid.UUID | None
    admission_date: date
    status: StudentStatus
    created_at: datetime

    model_config = {"from_attributes": True}
