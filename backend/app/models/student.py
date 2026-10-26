"""Student document — an enrolled learner, optionally linked to a portal User account."""
import uuid
from datetime import date, datetime
from typing import Literal

from pymongo import IndexModel
from pydantic import BaseModel, Field

from app.database.base import BaseDocument
from app.models.enums import StudentStatus


class StudentTerms(BaseModel):
    """A student's agreement to the Terms & Conditions - the first step of the
    Student Portal, and the gate in front of everything else on it.

    A record of the agreement, not a flag. "Signed" with no name, no time and
    no wording attached is a claim; this is what can be shown back to a
    student who later says they never agreed to the refund terms.
    """

    accepted_at: datetime
    # The full name as the student typed it, which is the signature.
    signed_name: str = Field(max_length=150)
    # Which wording they agreed to. The terms document is edited in place, so
    # its title and last-edit time at the moment of signing are what tell an
    # agreement to last month's terms from one to today's.
    document_title: str = Field(max_length=200)
    document_updated_at: datetime | None = None
    # A signed copy, when there is one: a scan or photo of the paper form, or
    # the PDF the student signed. Path returned by StorageService.
    signed_copy_url: str | None = Field(default=None, max_length=500)
    # "link" when the student signed on their own private link; "staff" when a
    # member of staff recorded a signature taken some other way (on paper, on
    # WhatsApp) on the student's behalf.
    source: Literal["link", "staff"]
    recorded_by: uuid.UUID | None = None
    recorded_by_name: str | None = Field(default=None, max_length=150)
    ip: str | None = Field(default=None, max_length=64)


class Student(BaseDocument):
    user_id: uuid.UUID | None = None
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    email: str = Field(max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    course_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    admission_date: date
    status: StudentStatus = StudentStatus.ACTIVE

    # The secret in the student's private link (/s/<token>). Students never
    # log in: the link is how they sign the terms and reach their classes, so
    # whoever holds it is the student as far as that page is concerned.
    # Issued the first time staff ask for the link and replaced on request,
    # which is how a link that has been forwarded around is revoked.
    portal_token: str | None = Field(default=None, max_length=64)
    terms: StudentTerms | None = None

    class Settings:
        name = "students"
        indexes = [
            IndexModel([("email", 1)], unique=True),
            IndexModel([("course_id", 1)]),
            IndexModel([("batch_id", 1)]),
            IndexModel([("user_id", 1)]),
            # Partial rather than sparse: every student without a link carries
            # portal_token: null, and a sparse unique index still indexes nulls
            # - the second student without a link would be a duplicate.
            IndexModel(
                [("portal_token", 1)],
                unique=True,
                partialFilterExpression={"portal_token": {"$type": "string"}},
                name="uq_student_portal_token",
            ),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:
        return f"<Student {self.email}>"
