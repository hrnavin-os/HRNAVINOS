"""Request/response DTOs for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import LeadSource, LeadStatus


class LeadCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str = Field(min_length=6, max_length=20)
    source: LeadSource = LeadSource.OTHER
    course_interest: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None


class LeadUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=6, max_length=20)
    source: LeadSource | None = None
    status: LeadStatus | None = None
    course_interest: str | None = Field(default=None, max_length=150)
    notes: str | None = None


class LeadAssign(BaseModel):
    assigned_to: uuid.UUID


class LeadResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr | None
    phone: str
    source: LeadSource
    status: LeadStatus
    course_interest: str | None
    notes: str | None
    assigned_to: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
