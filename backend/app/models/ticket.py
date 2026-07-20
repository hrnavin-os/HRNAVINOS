"""Ticket model — a support/help-desk request raised by any user (staff or student)."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import TicketPriority, TicketStatus

if TYPE_CHECKING:
    from app.models.user import User


class Ticket(BaseModel):
    raised_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=TicketStatus.OPEN,
        nullable=False,
        index=True,
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=TicketPriority.MEDIUM,
        nullable=False,
    )

    raiser: Mapped["User"] = relationship("User", foreign_keys=[raised_by])
    assignee: Mapped["User"] = relationship("User", foreign_keys=[assigned_to])

    def __repr__(self) -> str:
        return f"<Ticket {self.subject} status={self.status}>"
