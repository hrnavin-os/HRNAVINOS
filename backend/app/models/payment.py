"""Payment document — a single payment transaction, subject to finance verification.

The verification decision itself (who approved/rejected it, when, and why)
is recorded as an immutable `FinanceVerification` document rather than
mutating fields here — see app/models/finance_verification.py. `status`
stays on Payment so "pending payments" can be queried without a join.
"""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal
from app.models.enums import PaymentMethod, PaymentStatus


class Payment(BaseDocument):
    student_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    amount: MongoDecimal
    payment_date: date
    method: PaymentMethod
    reference_number: str | None = Field(default=None, max_length=100)
    status: PaymentStatus = PaymentStatus.PENDING

    class Settings:
        name = "payments"
        indexes = [
            IndexModel([("student_id", 1)]),
            IndexModel([("invoice_id", 1)]),
            IndexModel([("status", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Payment {self.id} amount={self.amount} status={self.status}>"
