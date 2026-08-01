"""Request/response DTOs for the Role module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.permission_schema import PermissionResponse


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    permission_ids: list[uuid.UUID] = Field(default_factory=list)
    # Restricts members of this role to one Form Collection section's leads
    # (see app/core/dependencies.py:get_actor_scope). None = unscoped.
    scoped_section: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    permission_ids: list[uuid.UUID] | None = None
    scoped_section: str | None = None


class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_system: bool
    scoped_section: str | None = None
    permissions: list[PermissionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RoleSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_system: bool

    model_config = {"from_attributes": True}
