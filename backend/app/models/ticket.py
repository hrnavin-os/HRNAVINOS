"""Ticket document — a support/help-desk request raised by any user (staff or student)."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import TicketPriority, TicketStatus


class Ticket(BaseDocument):
    raised_by: uuid.UUID
    assigned_to: uuid.UUID | None = None
    subject: str = Field(max_length=200)
    description: str
    category: str | None = Field(default=None, max_length=100)
    status: TicketStatus = TicketStatus.OPEN
    priority: TicketPriority = TicketPriority.MEDIUM

    class Settings:
        name = "tickets"
        indexes = [
            IndexModel([("raised_by", 1)]),
            IndexModel([("assigned_to", 1)]),
            IndexModel([("status", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Ticket {self.subject} status={self.status}>"
