"""Invoice document — an amount owed by a Student, optionally tied to an Admission."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal
from app.models.enums import InvoiceStatus


class Invoice(BaseDocument):
    student_id: uuid.UUID
    admission_id: uuid.UUID | None = None
    invoice_number: str = Field(max_length=50)
    amount: MongoDecimal
    amount_paid: MongoDecimal = Field(default=0)
    due_date: date
    description: str | None = Field(default=None, max_length=255)
    status: InvoiceStatus = InvoiceStatus.UNPAID

    class Settings:
        name = "invoices"
        indexes = [
            IndexModel([("invoice_number", 1)], unique=True),
            IndexModel([("student_id", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} status={self.status}>"
