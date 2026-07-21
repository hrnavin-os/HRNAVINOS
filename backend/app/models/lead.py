"""Lead document — a prospective student tracked through the CRM / Pre-Sales pipeline."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import LeadSource, LeadStatus


class Lead(BaseDocument):
    name: str = Field(max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(max_length=20)
    source: LeadSource = LeadSource.OTHER
    status: LeadStatus = LeadStatus.NEW
    course_interest: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None

    class Settings:
        name = "leads"
        indexes = [
            IndexModel([("email", 1)]),
            IndexModel([("phone", 1)]),
            IndexModel([("status", 1)]),
            IndexModel([("assigned_to", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Lead {self.name} status={self.status}>"
