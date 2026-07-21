"""Request/response DTOs for the app Settings module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SettingsUpdate(BaseModel):
    institute_name: str | None = Field(default=None, min_length=1, max_length=150)
    institute_email: EmailStr | None = None
    institute_phone: str | None = Field(default=None, max_length=20)
    institute_address: str | None = Field(default=None, max_length=255)
    currency: str | None = Field(default=None, max_length=10)
    timezone: str | None = Field(default=None, max_length=50)
    invoice_prefix: str | None = Field(default=None, max_length=20)
    logo_url: str | None = Field(default=None, max_length=500)


class SettingsResponse(BaseModel):
    id: uuid.UUID
    institute_name: str
    institute_email: str | None
    institute_phone: str | None
    institute_address: str | None
    currency: str
    timezone: str
    invoice_prefix: str
    logo_url: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}
