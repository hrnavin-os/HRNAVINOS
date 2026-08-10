"""InductionEntry document — one row of the Induction Call Form.

Deliberately has no `batch` field. Batch is a pure function of
registration_date (see InductionEntryService.batch_for) and is computed on
read, so it can never drift from the date, can never be edited by hand, and
historical rows keep the batch they were registered into when the month rolls
over.
"""
from datetime import date

from pydantic import Field
from pymongo import IndexModel

from app.database.base import BaseDocument


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

    class Settings:
        name = "induction_entries"
        indexes = [
            IndexModel([("registration_date", -1)]),
            IndexModel([("phone", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<InductionEntry {self.name} {self.registration_date}>"
