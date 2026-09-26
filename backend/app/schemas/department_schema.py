"""Request/response DTOs for the Departments module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class _Cleaned(BaseModel):
    @field_validator("name", "code", "description", mode="before", check_fields=False)
    @classmethod
    def strip_blank(cls, value):
        """Blank text is "not given", not a department called " "."""
        if not isinstance(value, str):
            return value
        return value.strip() or None


class DepartmentCreate(_Cleaned):
    name: str = Field(min_length=2, max_length=100)
    code: str | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class DepartmentUpdate(_Cleaned):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    code: str | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str | None
    description: str | None
    is_active: bool
    # Live staff in the department - what the Departments list is read for,
    # and why one can't be deleted.
    staff_count: int = 0
    created_at: datetime
    updated_at: datetime


class DepartmentSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}
