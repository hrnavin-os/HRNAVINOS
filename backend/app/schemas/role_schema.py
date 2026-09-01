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
    # Only set on the Deleted tab's rows. `deleted_by_name` is resolved for
    # the page rather than left as an id, since a list of ids is not something
    # anybody can read a decision out of.
    deleted_at: datetime | None = None
    deleted_by_name: str | None = None
    deleted_reason: str | None = None

    model_config = {"from_attributes": True}


class RoleDelete(BaseModel):
    """Why a role is being removed. Required - see RoleService.delete."""

    reason: str = Field(min_length=3, max_length=500)


class RoleSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_system: bool

    model_config = {"from_attributes": True}
