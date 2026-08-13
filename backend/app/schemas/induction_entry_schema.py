"""Request/response DTOs for the Induction Call Form."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import InductionStatus


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
    # One count per tab, so each tab shows how much is behind it without being
    # opened. Not scoped by section: it labels the tabs, which sit above the
    # section cards rather than inside one.
    by_status: dict[str, int] = {}


class InductionAnalyticsItem(BaseModel):
    """One distinct value of whichever field is being broken down.

    `moved` and `quit` sit beside the count because the useful question is not
    how many arrived under a category, it's how many of them converted and how
    many walked - a bare total answers neither.
    """

    value: str
    count: int
    moved: int
    quit: int


class InductionAnalyticsResponse(BaseModel):
    dimension: str
    total: int
    items: list[InductionAnalyticsItem]


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
    call_remark: str | None = Field(default=None, max_length=100)


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
    # Where the candidate stands after the induction call, set from the board's
    # dropdown. Open text, not an enum - see the field on the model.
    call_remark: str | None = None
    # Set by the round-robin at creation, not by the form.
    assigned_to: uuid.UUID | None = None
    assigned_to_name: str | None = None
    section: str | None = None
    qualification: InductionQualificationSchema = Field(default_factory=InductionQualificationSchema)
    placement: InductionPlacementSchema = Field(default_factory=InductionPlacementSchema)
    remarks: InductionRemarksSchema = Field(default_factory=InductionRemarksSchema)
    other_details: InductionOtherDetailsSchema = Field(default_factory=InductionOtherDetailsSchema)
    # Which tab this entry belongs to, derived from foundation_lead_id - see
    # InductionEntry.status. Sent so the row can say so without the client
    # re-deriving the same rule from the id.
    status: InductionStatus = InductionStatus.PENDING_INDUCTION
    # Set once this person submitted the Foundation Form with a matching mobile
    # number. converted_at is the Foundation move date the Moved tab shows.
    foundation_lead_id: uuid.UUID | None = None
    converted_at: datetime | None = None
    # The linked lead's pipeline stage. Resolved per page by the route, so it
    # is None on the pending tab, where there is no lead to read it from.
    foundation_status: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
