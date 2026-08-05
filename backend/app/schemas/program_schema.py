"""Request/response DTOs for the Programs Management module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProgramCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    # Pricing category code from the Foundation Form config. Required: the
    # category is what determines the payment plans and installment amounts
    # shown for this program, so a program without one has no page-2 pricing.
    category: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True
    order: int = 0


class ProgramUpdate(BaseModel):
    # `value` is deliberately absent: it is the identifier already written to
    # existing leads, so renaming a program changes its display name only.
    name: str | None = Field(default=None, min_length=2, max_length=255)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    order: int | None = None


class ProgramResponse(BaseModel):
    id: uuid.UUID
    name: str
    value: str
    category: str
    description: str | None
    is_active: bool
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
