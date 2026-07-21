"""FinanceVerification document — an immutable log of payment verification decisions.

Separate from Payment so a payment's approval/rejection history is
auditable on its own, the same way AuditLog tracks entity changes generally
but scoped specifically to the finance-verification workflow.
"""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import VerificationDecision


class FinanceVerification(BaseDocument):
    payment_id: uuid.UUID
    decision: VerificationDecision
    verified_by: uuid.UUID
    verified_at: datetime
    reason: str | None = Field(default=None, max_length=255)

    class Settings:
        name = "finance_verifications"
        indexes = [
            IndexModel([("payment_id", 1)]),
            IndexModel([("verified_by", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<FinanceVerification payment={self.payment_id} decision={self.decision}>"
