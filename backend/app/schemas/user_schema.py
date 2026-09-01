"""Request/response DTOs for the User Management module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.role_schema import RoleSummaryResponse


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    role_id: uuid.UUID | None = None
    is_active: bool = True

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one uppercase letter and one digit.")
        return v


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    role_id: uuid.UUID | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    first_name: str
    last_name: str
    phone: str | None
    is_active: bool
    is_verified: bool
    last_login_at: datetime | None
    role: RoleSummaryResponse | None
    created_at: datetime
    updated_at: datetime
    # Only set on the Deleted tab's rows. `deleted_by_name` is resolved for
    # the page rather than left as an id, since a list of ids is not something
    # anybody can read a decision out of.
    deleted_at: datetime | None = None
    deleted_by_name: str | None = None
    deleted_reason: str | None = None

    model_config = {"from_attributes": True}


class UserDelete(BaseModel):
    """Why a user is being removed. Required - see UserService.delete."""

    reason: str = Field(min_length=3, max_length=500)


class UserListResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    first_name: str
    last_name: str
    # Carried on the list row, not just the detail: the Deleted tab is a list,
    # and a reason you have to open a record to read is a reason nobody reads.
    deleted_at: datetime | None = None
    deleted_by_name: str | None = None
    deleted_reason: str | None = None
    is_active: bool
    role: RoleSummaryResponse | None

    model_config = {"from_attributes": True}
