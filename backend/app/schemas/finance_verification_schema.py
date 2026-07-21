"""Response DTOs for the Finance Verification module."""
import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import VerificationDecision


class FinanceVerificationResponse(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    decision: VerificationDecision
    verified_by: uuid.UUID
    verified_at: datetime
    reason: str | None

    model_config = {"from_attributes": True}
