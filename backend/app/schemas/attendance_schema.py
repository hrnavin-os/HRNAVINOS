"""Request/response DTOs for the Attendance module."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import AttendanceStatus


class AttendanceMarkEntry(BaseModel):
    student_id: uuid.UUID
    status: AttendanceStatus
    remarks: str | None = Field(default=None, max_length=255)


class AttendanceBulkMark(BaseModel):
    batch_id: uuid.UUID
    date: date
    entries: list[AttendanceMarkEntry] = Field(min_length=1)


class AttendanceUpdate(BaseModel):
    status: AttendanceStatus
    remarks: str | None = Field(default=None, max_length=255)


class AttendanceResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    batch_id: uuid.UUID
    date: date
    status: AttendanceStatus
    remarks: str | None
    marked_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
