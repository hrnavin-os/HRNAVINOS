"""Placement document — tracks a Student's job placement pipeline post-course."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal
from app.models.enums import PlacementStatus


class Placement(BaseDocument):
    student_id: uuid.UUID
    company_id: uuid.UUID
    job_role: str = Field(max_length=150)
    package_amount: MongoDecimal | None = None
    status: PlacementStatus = PlacementStatus.APPLIED
    placed_date: date | None = None
    placed_by: uuid.UUID | None = None

    class Settings:
        name = "placements"
        indexes = [
            IndexModel([("student_id", 1)]),
            IndexModel([("company_id", 1)]),
            IndexModel([("status", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Placement student={self.student_id} company={self.company_id}>"
