"""Request/response DTOs for the Placement module."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import PlacementStatus


class PlacementCreate(BaseModel):
    student_id: uuid.UUID
    company_name: str = Field(min_length=2, max_length=150)
    job_role: str = Field(min_length=2, max_length=150)
    package_amount: Decimal | None = Field(default=None, ge=0)


class PlacementUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=150)
    job_role: str | None = Field(default=None, min_length=2, max_length=150)
    package_amount: Decimal | None = Field(default=None, ge=0)
    status: PlacementStatus | None = None
    placed_date: date | None = None


class PlacementResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    company_name: str
    job_role: str
    package_amount: Decimal | None
    status: PlacementStatus
    placed_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
