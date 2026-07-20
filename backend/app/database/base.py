"""Declarative base and shared mixins for all ORM models."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, declared_attr


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _pluralize(word: str) -> str:
    if word.endswith(("s", "x", "z", "ch", "sh")):
        return word + "es"
    if word.endswith("y") and word[-2:-1] not in "aeiou":
        return word[:-1] + "ies"
    return word + "s"


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    @declared_attr.directive
    def __tablename__(cls) -> str:  # noqa: N805
        snake_case = "".join(
            f"_{c.lower()}" if c.isupper() else c for c in cls.__name__
        ).lstrip("_")
        return _pluralize(snake_case)


class UUIDPrimaryKeyMixin:
    """Adds a UUID (v4) primary key to a model."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False,
    )


class TimestampMixin:
    """Adds created_at / updated_at timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class AuditMixin:
    """Adds created_by / updated_by user references (nullable for system actions)."""

    @declared_attr
    def created_by(cls) -> Mapped[uuid.UUID | None]:  # noqa: N805
        return mapped_column(
            UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        )

    @declared_attr
    def updated_by(cls) -> Mapped[uuid.UUID | None]:  # noqa: N805
        return mapped_column(
            UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        )


class SoftDeleteMixin:
    """Adds soft-delete support instead of hard row deletion."""

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = utcnow()

    def restore(self) -> None:
        self.is_deleted = False
        self.deleted_at = None


class BaseModel(UUIDPrimaryKeyMixin, TimestampMixin, AuditMixin, SoftDeleteMixin, Base):
    """Standard base for all business entity models: UUID PK + audit + soft delete."""

    __abstract__ = True
