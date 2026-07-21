"""Attendance document — one record per student per batch per day."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import AttendanceStatus


class Attendance(BaseDocument):
    student_id: uuid.UUID
    batch_id: uuid.UUID
    date: date
    status: AttendanceStatus
    marked_by: uuid.UUID | None = None
    remarks: str | None = Field(default=None, max_length=255)

    class Settings:
        name = "attendances"
        indexes = [
            IndexModel([("student_id", 1)]),
            IndexModel([("batch_id", 1)]),
            IndexModel([("date", 1)]),
            IndexModel(
                [("student_id", 1), ("batch_id", 1), ("date", 1)],
                unique=True,
                name="uq_attendance_student_batch_date",
            ),
        ]

    def __repr__(self) -> str:
        return f"<Attendance student={self.student_id} date={self.date} status={self.status}>"
