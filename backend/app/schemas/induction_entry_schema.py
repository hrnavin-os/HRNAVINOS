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


class InductionFormSubmitResponse(BaseModel):
    message: str


class InductionEntryStatsResponse(BaseModel):
    total: int
    by_section: dict[str, int]


class InductionQualificationSchema(BaseModel):
    ug_degree: str | None = Field(default=None, max_length=150)
    ug_passed_out_year: str | None = Field(default=None, max_length=10)
    pg_degree: str | None = Field(default=None, max_length=150)
    pg_passed_out_year: str | None = Field(default=None, max_length=10)


class InductionPlacementSchema(BaseModel):
    work_experience: str | None = Field(default=None, max_length=500)
    training_or_extra_course: str | None = Field(default=None, max_length=500)
    current_location: str | None = Field(default=None, max_length=200)
    preferred_location: str | None = Field(default=None, max_length=200)


class InductionRemarksSchema(BaseModel):
    session_preference: str | None = Field(default=None, max_length=50)
    requirements: str | None = Field(default=None, max_length=1000)
    details: str | None = Field(default=None, max_length=1000)
    doubts_clarified: str | None = Field(default=None, max_length=1000)


class InductionOtherDetailsSchema(BaseModel):
    induction_call_date: date | None = None
    scheduled_time: str | None = Field(default=None, max_length=20)
    terms_form_signed: bool | None = None
    whatsapp_group_added: bool | None = None
    call_recording_url: str | None = Field(default=None, max_length=500)
    confidence: str | None = Field(default=None, max_length=50)


class InductionDetailsUpdate(BaseModel):
    """The four pages of the post-call update form. Each page is optional, so
    a partially-completed form saves what it has rather than being rejected."""

    qualification: InductionQualificationSchema | None = None
    placement: InductionPlacementSchema | None = None
    remarks: InductionRemarksSchema | None = None
    other_details: InductionOtherDetailsSchema | None = None


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
    qualification: InductionQualificationSchema = Field(default_factory=InductionQualificationSchema)
    placement: InductionPlacementSchema = Field(default_factory=InductionPlacementSchema)
    remarks: InductionRemarksSchema = Field(default_factory=InductionRemarksSchema)
    other_details: InductionOtherDetailsSchema = Field(default_factory=InductionOtherDetailsSchema)
    # Set once this person submitted the Foundation Form with a matching mobile
    # number. Present on the response even though a converted entry never
    # appears in the board's list, because the lead's detail view fetches the
    # entry directly to show where it came from.
    foundation_lead_id: uuid.UUID | None = None
    converted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
