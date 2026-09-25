"""Request/response DTOs for the app Settings module."""
import uuid
from datetime import datetime
from enum import StrEnum

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


class LeadDeleteToggle(BaseModel):
    """Whether the Admin role gets the delete option on every Induction and
    Foundation lead. Its own schema rather than a field on SettingsUpdate:
    that form is open to anyone with settings.update, and this switch is the
    Super Admin's alone."""

    enabled: bool


class ResetScope(StrEnum):
    """Which board a reset clears.

    The two boards are separate populations with separate lives - a bad import
    into Induction is not a reason to wipe the Foundation pipeline, and vice
    versa - so each can be cleared on its own. ALL is both, which is what this
    endpoint did when it was the only option.
    """

    INDUCTION = "induction"
    FOUNDATION = "foundation"
    ALL = "all"


# The exact phrase the caller must send, one per scope. A confirmation the
# client types is the only guard an API can offer against a request that was
# never meant to be sent - the destructive part of this endpoint is not
# reachable by a stray POST with an empty body.
#
# A phrase of its own per scope, rather than one phrase for all three. These
# are three buttons a few pixels apart that destroy three different things, and
# a shared phrase would make "I clicked the wrong one and typed the words I was
# told to type" a mistake the server happily carries out. Naming the board in
# the phrase means the wrong button cannot be confirmed.
RESET_LEADS_CONFIRMATIONS = {
    ResetScope.INDUCTION: "DELETE INDUCTION LEADS",
    ResetScope.FOUNDATION: "DELETE FOUNDATION LEADS",
    ResetScope.ALL: "DELETE ALL LEADS",
}

# The phrase for the everything-scope, named on its own because it is the
# default and older clients send it with no scope at all.
RESET_LEADS_CONFIRMATION = RESET_LEADS_CONFIRMATIONS[ResetScope.ALL]


class ResetLeadsRequest(BaseModel):
    confirm: str = Field(description="Must match the phrase for the chosen scope exactly.")
    # Defaulted, so a client that predates the split still means what it used
    # to mean and still has to type the phrase it always typed.
    scope: ResetScope = Field(
        default=ResetScope.ALL,
        description="Which board to clear: induction, foundation, or all.",
    )


class ResetLeadsResponse(BaseModel):
    """What the reset actually touched, counted rather than assumed.

    Reported per collection rather than as one total: on a scoped reset the
    counts are how the caller sees which board was cleared and that the other
    one was left alone.
    """

    leads_deleted: int
    allocations_deleted: int
    induction_entries_deleted: int
    # Induction entries handed back to the Induction board because the
    # Foundation lead they had moved to no longer exists. Only ever non-zero on
    # a foundation-scoped reset - see SettingsService.reset_leads.
    induction_links_cleared: int = 0
