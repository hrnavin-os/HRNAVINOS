"""Batch document — a scheduled run of a Course, taught by a Tutor."""
import uuid
from datetime import date

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import BatchStatus


class Batch(BaseDocument):
    # None, with the dates, on a batch the Student Portal opened from the
    # leads (see lead_batch): the leads name a batch, not a Course or a run.
    # The dates can be given on the Batches page once they are known.
    course_id: uuid.UUID | None = None
    tutor_id: uuid.UUID | None = None
    name: str = Field(max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    schedule: str | None = Field(default=None, max_length=255)
    capacity: int = 30
    status: BatchStatus = BatchStatus.UPCOMING

    # The batch the leads boards show ("Batch-20") when the Student Portal
    # opened this one for the leads at Batch Confirmation in it; None for a
    # batch made by hand. The key the portal finds it by again, so renaming
    # the batch doesn't split its students across two.
    lead_batch: str | None = Field(default=None, max_length=100)

    class Settings:
        name = "batches"
        indexes = [
            IndexModel([("course_id", 1)]),
            IndexModel([("tutor_id", 1)]),
            # One live batch per leads' batch, so two portal loads at once
            # can't each open their own.
            IndexModel(
                [("lead_batch", 1)],
                unique=True,
                partialFilterExpression={"lead_batch": {"$type": "string"}, "is_deleted": False},
                name="uq_batch_lead_batch",
            ),
        ]

    def __repr__(self) -> str:
        return f"<Batch {self.name}>"
