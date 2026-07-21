"""Audit log document — immutable record of who changed what, where, and when."""
import uuid
from typing import Any

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class AuditLog(BaseDocument):
    """An immutable audit trail entry. Never updated or soft-deleted in practice."""

    user_id: uuid.UUID | None = None
    action: str = Field(max_length=50)  # CREATE, UPDATE, DELETE, LOGIN...
    entity_type: str = Field(max_length=100)
    entity_id: str | None = Field(default=None, max_length=100)
    changes: dict[str, Any] | None = None
    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)

    class Settings:
        name = "audit_logs"
        indexes = [
            IndexModel([("user_id", 1)]),
            IndexModel([("action", 1)]),
            IndexModel([("entity_type", 1)]),
            IndexModel([("entity_id", 1)]),
            IndexModel([("created_at", -1)]),
        ]

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.entity_type}:{self.entity_id}>"
