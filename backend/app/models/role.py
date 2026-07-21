"""Role document — a named collection of permissions assignable to users (RBAC)."""
import uuid

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class Role(BaseDocument):
    name: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=255)
    is_system: bool = False
    # References Permission.id. MongoDB has no joins/relationships, so the
    # actual Permission documents are resolved by the service layer when needed.
    permission_ids: list[uuid.UUID] = Field(default_factory=list)

    class Settings:
        name = "roles"
        indexes = [
            IndexModel([("name", 1)], unique=True),
            IndexModel([("is_deleted", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Role {self.name}>"
