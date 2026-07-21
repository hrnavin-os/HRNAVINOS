"""Tutor document — the teaching-staff profile linked to a User account."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import TutorStatus


class Tutor(BaseDocument):
    user_id: uuid.UUID
    specialization: str = Field(max_length=255)
    bio: str | None = None
    joining_date: date
    status: TutorStatus = TutorStatus.ACTIVE

    class Settings:
        name = "tutors"
        indexes = [IndexModel([("user_id", 1)], unique=True)]

    def __repr__(self) -> str:
        return f"<Tutor {self.id} user={self.user_id}>"
