"""Lead document — a prospective student tracked through the CRM / Pre-Sales pipeline."""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import BaseModel, Field

from app.database.base import BaseDocument, utcnow
from app.database.types import MongoDecimal
from app.models.enums import LeadSource, LeadStatus, PaymentMethod


class FollowUpEntry(BaseModel):
    scheduled_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    created_by: uuid.UUID | None = None


class Lead(BaseDocument):
    name: str = Field(max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(max_length=20)
    source: LeadSource = LeadSource.OTHER
    status: LeadStatus = LeadStatus.NEW_LEAD
    course_interest: str | None = Field(default=None, max_length=150)
    batch_preference: str | None = Field(default=None, max_length=150)
    payment_expected: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None
    follow_up_at: datetime | None = None
    follow_up_history: list[FollowUpEntry] = Field(default_factory=list)
    # Pre Screening stage: payment proof captured before moving further down the pipeline.
    payment_image_url: str | None = Field(default=None, max_length=500)
    paid_amount: MongoDecimal | None = None
    payment_mode: PaymentMethod | None = None
    # Set for leads imported via an integration (e.g. Google Sheets) so re-syncs
    # can skip rows already imported. Format: "gsheet:{spreadsheet_id}:{tab}:{row}".
    external_ref: str | None = Field(default=None, max_length=255)
    # False for leads imported via an integration until a Pre Sales staffer checks
    # them on the Form Check page; leads created directly in the CRM need no review.
    reviewed: bool = Field(default=True)
    # Full question->answer snapshot of the source row (e.g. every Google Form
    # column), so Form Check can show fields beyond name/phone/email.
    raw_form_data: dict[str, str] | None = Field(default=None)

    class Settings:
        name = "leads"
        indexes = [
            IndexModel([("email", 1)]),
            IndexModel([("phone", 1)]),
            IndexModel([("status", 1)]),
            IndexModel([("assigned_to", 1)]),
            # Not unique: MongoDB stores this as `null` (not "missing") on every
            # regular lead, since Beanie always writes declared fields, so a
            # unique+sparse index would collide across all non-synced leads.
            # Dedup for Google Sheets sync is already enforced in application
            # code (GoogleSheetsService.sync_all checks for an existing match).
            IndexModel([("external_ref", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Lead {self.name} status={self.status}>"
