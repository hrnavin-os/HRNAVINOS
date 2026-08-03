"""BatchAllocation document — a lead's provisional seat in a Batch.

Sits between the CRM and the Student record: a lead that reaches the
`batch_confirmation` stage is allocated a seat here by an HR Coordinator, but
does not become a Student until the whole batch is confirmed. That lets the
coordinator assemble and rearrange a roster without creating half-formed
Student/Admission rows that would then need cleaning up if the batch never
runs.
"""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import AllocationStatus


class BatchAllocation(BaseDocument):
    lead_id: uuid.UUID
    batch_id: uuid.UUID
    status: AllocationStatus = AllocationStatus.ALLOCATED
    # Set when the batch is confirmed and this lead becomes a Student.
    student_id: uuid.UUID | None = None
    confirmed_at: datetime | None = None
    # Why the seat was given up, for the withdrawal audit trail.
    withdrawn_reason: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)

    class Settings:
        name = "batch_allocations"
        indexes = [
            IndexModel([("batch_id", 1)]),
            # Not unique: a lead withdrawn from one batch is legitimately
            # re-allocated to another, so several rows per lead are expected.
            # "At most one live seat per lead" is enforced in the service.
            IndexModel([("lead_id", 1)]),
            IndexModel([("status", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<BatchAllocation lead={self.lead_id} batch={self.batch_id} status={self.status}>"
