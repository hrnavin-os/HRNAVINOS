"""Course document — a program offered by the institute (e.g. 'Full Stack Development')."""
from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal


class Course(BaseDocument):
    name: str = Field(max_length=150)
    code: str = Field(max_length=30)
    description: str | None = None
    duration_weeks: int
    fee: MongoDecimal
    is_active: bool = True

    class Settings:
        name = "courses"
        indexes = [
            IndexModel([("code", 1)], unique=True),
            IndexModel([("name", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Course {self.code}>"
