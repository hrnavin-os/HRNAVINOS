"""Admission document — the record confirming a Student's enrollment into a Course/Batch."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal
from app.models.enums import AdmissionStatus


class Admission(BaseDocument):
    lead_id: uuid.UUID | None = None
    student_id: uuid.UUID
    course_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    total_fee: MongoDecimal
    admission_fee_paid: MongoDecimal = Field(default=0)
    status: AdmissionStatus = AdmissionStatus.PENDING
    admitted_by: uuid.UUID | None = None

    class Settings:
        name = "admissions"
        indexes = [IndexModel([("student_id", 1)])]

    def __repr__(self) -> str:
        return f"<Admission student={self.student_id} status={self.status}>"
