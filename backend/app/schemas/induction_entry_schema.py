"""Request/response DTOs for the Induction Call Form."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class InductionEntryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(min_length=6, max_length=20)
    registration_date: date
    paid_date: date | None = None
    sales_person: str | None = Field(default=None, max_length=100)
    lead_source: str | None = Field(default=None, max_length=150)
    payment_mode: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=150)


class InductionEntryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, min_length=6, max_length=20)
    registration_date: date | None = None
    paid_date: date | None = None
    sales_person: str | None = Field(default=None, max_length=100)
    lead_source: str | None = Field(default=None, max_length=150)
    payment_mode: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=150)


class InductionEntryResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str
    # Derived from registration_date, never stored and never accepted on input.
    batch: str
    registration_date: date
    paid_date: date | None
    sales_person: str | None
    lead_source: str | None
    payment_mode: str | None
    category: str | None
    # Set by the round-robin at creation, not by the form.
    assigned_to: uuid.UUID | None = None
    assigned_to_name: str | None = None
    section: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
