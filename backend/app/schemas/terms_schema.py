"""Request/response DTOs for the Terms & Conditions register."""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# Which of the register's three tabs a request is asking for. "all" is the
# whole induction roll; the other two partition it, so signed + not_signed
# always adds back up to all.
TermsFilter = Literal["all", "signed", "not_signed"]


class TermsDocumentResponse(BaseModel):
    title: str
    body: str
    updated_at: datetime | None = None
    updated_by_name: str | None = None


class TermsDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)


class TermsStudentResponse(BaseModel):
    """One row of the register: who they are, and where they stand on signing.

    Built from an induction entry rather than being its own record - the
    register is a view of the induction roll, and a parallel table would be a
    second list of the same people to keep in step.
    """

    id: uuid.UUID
    name: str
    phone: str
    email: str | None = None
    section: str | None = None
    batch: str
    registration_date: date
    # Where this candidate is on the induction board (still in induction, moved
    # to Foundation, quit). Shown so the register can be read without opening
    # the board: chasing a signature from somebody who quit is wasted effort.
    status: str
    signed: bool
    signed_at: datetime | None = None
    signed_by_name: str | None = None


class TermsStatsResponse(BaseModel):
    total: int
    signed: int
    not_signed: int
