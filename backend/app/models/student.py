"""Student document — an enrolled learner, optionally linked to a portal User account."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import StudentStatus


class Student(BaseDocument):
    user_id: uuid.UUID | None = None
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    email: str = Field(max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    course_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    admission_date: date
    status: StudentStatus = StudentStatus.ACTIVE

    class Settings:
        name = "students"
        indexes = [
            IndexModel([("email", 1)], unique=True),
            IndexModel([("course_id", 1)]),
            IndexModel([("batch_id", 1)]),
            IndexModel([("user_id", 1)]),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:
        return f"<Student {self.email}>"
