"""Batch document — a scheduled run of a Course, taught by a Tutor."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import BatchStatus


class Batch(BaseDocument):
    course_id: uuid.UUID
    tutor_id: uuid.UUID | None = None
    name: str = Field(max_length=100)
    start_date: date
    end_date: date
    schedule: str | None = Field(default=None, max_length=255)
    capacity: int = 30
    status: BatchStatus = BatchStatus.UPCOMING

    class Settings:
        name = "batches"
        indexes = [
            IndexModel([("course_id", 1)]),
            IndexModel([("tutor_id", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Batch {self.name}>"
