"""Base Beanie document with shared audit / soft-delete fields.

Every collection's document inherits `BaseDocument`, giving it a UUID `id`
(kept as UUID rather than Beanie's default ObjectId so API responses and
route signatures are unaffected by the underlying database), created/updated
timestamps, created_by/updated_by actor references, and soft delete.
"""
import uuid
from datetime import datetime, timezone

from beanie import Document
from pydantic import Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BaseDocument(Document):
    """Base class for all MongoDB documents: UUID id + audit + soft delete."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None
    is_deleted: bool = Field(default=False)
    deleted_at: datetime | None = None

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = utcnow()

    def restore(self) -> None:
        self.is_deleted = False
        self.deleted_at = None

    def touch(self, actor_id: uuid.UUID | None = None) -> None:
        """Bump updated_at (and updated_by, if given) before a save()."""
        self.updated_at = utcnow()
        if actor_id is not None:
            self.updated_by = actor_id
