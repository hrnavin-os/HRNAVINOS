"""Request/response DTOs for the app Settings module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SettingsUpdate(BaseModel):
    institute_name: str | None = Field(default=None, min_length=1, max_length=150)
    institute_email: EmailStr | None = None
    institute_phone: str | None = Field(default=None, max_length=20)
    institute_address: str | None = Field(default=None, max_length=255)
    currency: str | None = Field(default=None, max_length=10)
    timezone: str | None = Field(default=None, max_length=50)
    invoice_prefix: str | None = Field(default=None, max_length=20)
    logo_url: str | None = Field(default=None, max_length=500)


class SettingsResponse(BaseModel):
    id: uuid.UUID
    institute_name: str
    institute_email: str | None
    institute_phone: str | None
    institute_address: str | None
    currency: str
    timezone: str
    invoice_prefix: str
    logo_url: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# The exact phrase the caller must send to reset leads. A confirmation the
# client types is the only guard an API can offer against a request that was
# never meant to be sent - the destructive part of this endpoint is not
# reachable by a stray POST with an empty body.
RESET_LEADS_CONFIRMATION = "DELETE ALL LEADS"


class ResetLeadsRequest(BaseModel):
    confirm: str = Field(description=f'Must be exactly "{RESET_LEADS_CONFIRMATION}".')


class ResetLeadsResponse(BaseModel):
    """What the reset actually touched, counted rather than assumed.

    Reported per collection because the three are not the same kind of change:
    leads and their allocations are removed, while induction entries are only
    unlinked - the induction record survives, which is the whole point of it
    being a separate document.
    """

    leads_deleted: int
    allocations_deleted: int
    induction_entries_unlinked: int
