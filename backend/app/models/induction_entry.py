"""InductionEntry document — one row of the Induction Call Form.

Deliberately has no `batch` field. Batch is a pure function of
registration_date (see InductionEntryService.batch_for) and is computed on
read, so it can never drift from the date, can never be edited by hand, and
historical rows keep the batch they were registered into when the month rolls
over.
"""
import uuid
from datetime import date

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument


# The four pages of the post-call update form. Grouped rather than flattened
# onto the document so a page maps to one object: the form fills them in order,
# and every one is optional because the call may not have happened yet.
class InductionQualification(BaseModel):
    ug_degree: str | None = Field(default=None, max_length=150)
    ug_passed_out_year: str | None = Field(default=None, max_length=10)
    pg_degree: str | None = Field(default=None, max_length=150)
    pg_passed_out_year: str | None = Field(default=None, max_length=10)


class InductionPlacement(BaseModel):
    work_experience: str | None = Field(default=None, max_length=500)
    training_or_extra_course: str | None = Field(default=None, max_length=500)
    current_location: str | None = Field(default=None, max_length=200)
    preferred_location: str | None = Field(default=None, max_length=200)


class InductionRemarks(BaseModel):
    session_preference: str | None = Field(default=None, max_length=50)  # Live | Recorded
    requirements: str | None = Field(default=None, max_length=1000)
    details: str | None = Field(default=None, max_length=1000)
    doubts_clarified: str | None = Field(default=None, max_length=1000)


class InductionOtherDetails(BaseModel):
    induction_call_date: date | None = None
    scheduled_time: str | None = Field(default=None, max_length=20)
    terms_form_signed: bool | None = None
    whatsapp_group_added: bool | None = None
    # Path returned by the upload endpoint, not the file itself.
    call_recording_url: str | None = Field(default=None, max_length=500)
    confidence: str | None = Field(default=None, max_length=50)


class InductionEntry(BaseDocument):
    name: str = Field(max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(max_length=20)
    registration_date: date
    paid_date: date | None = None
    # Open-ended on purpose: each of these is a dropdown in the UI that also
    # accepts a typed value, so a closed enum would reject exactly the custom
    # entries the form is meant to allow.
    sales_person: str | None = Field(default=None, max_length=100)
    lead_source: str | None = Field(default=None, max_length=150)
    payment_mode: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=150)

    # Set once, on create, by the round-robin in InductionEntryService. Both
    # are stored rather than derived: who owns a row must not change when
    # someone is added to or removed from the Section Admin rota afterwards.
    assigned_to: uuid.UUID | None = None
    section: str | None = Field(default=None, max_length=50)

    # Filled in after the induction call, through the multi-page update form.
    # Default to empty objects rather than None so existing rows read back
    # without a migration and the UI never has to null-check a whole group.
    qualification: InductionQualification = Field(default_factory=InductionQualification)
    placement: InductionPlacement = Field(default_factory=InductionPlacement)
    remarks: InductionRemarks = Field(default_factory=InductionRemarks)
    other_details: InductionOtherDetails = Field(default_factory=InductionOtherDetails)

    class Settings:
        name = "induction_entries"
        indexes = [
            IndexModel([("registration_date", -1)]),
            IndexModel([("phone", 1)]),
            IndexModel([("assigned_to", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<InductionEntry {self.name} {self.registration_date}>"
