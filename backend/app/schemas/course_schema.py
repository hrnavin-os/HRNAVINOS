"""Request/response DTOs for the Course Management module."""
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CourseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    code: str = Field(min_length=2, max_length=30)
    description: str | None = None
    duration_weeks: int = Field(gt=0)
    fee: Decimal = Field(gt=0)
    is_active: bool = True


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = None
    duration_weeks: int | None = Field(default=None, gt=0)
    fee: Decimal | None = Field(default=None, gt=0)
    is_active: bool | None = None


class CourseResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    description: str | None
    duration_weeks: int
    fee: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
