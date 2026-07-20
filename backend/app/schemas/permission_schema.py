"""Request/response DTOs for the Permission module."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PermissionCreate(BaseModel):
    code: str = Field(min_length=3, max_length=100, pattern=r"^[a-z0-9_]+\.[a-z0-9_]+$")
    module: str = Field(min_length=2, max_length=100)
    action: str = Field(min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=255)


class PermissionUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=255)


class PermissionResponse(BaseModel):
    id: uuid.UUID
    code: str
    module: str
    action: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
