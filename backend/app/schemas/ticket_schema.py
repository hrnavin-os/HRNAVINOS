"""Request/response DTOs for the Tickets module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import TicketPriority, TicketStatus


class TicketCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=100)
    priority: TicketPriority = TicketPriority.MEDIUM


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    category: str | None = Field(default=None, max_length=100)


class TicketAssign(BaseModel):
    assigned_to: uuid.UUID


class TicketResponse(BaseModel):
    id: uuid.UUID
    raised_by: uuid.UUID
    assigned_to: uuid.UUID | None
    subject: str
    description: str
    category: str | None
    status: TicketStatus
    priority: TicketPriority
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
