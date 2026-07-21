"""Request/response DTOs for the Company (placement partners) module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    industry: str | None = Field(default=None, max_length=100)
    contact_person: str | None = Field(default=None, max_length=150)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    notes: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    industry: str | None = Field(default=None, max_length=100)
    contact_person: str | None = Field(default=None, max_length=150)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_active: bool | None = None


class CompanyResponse(BaseModel):
    id: uuid.UUID
    name: str
    industry: str | None
    contact_person: str | None
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
