"""Lead model — a prospective student tracked through the CRM / Pre-Sales pipeline."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import LeadSource, LeadStatus

if TYPE_CHECKING:
    from app.models.user import User


class Lead(BaseModel):
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[LeadSource] = mapped_column(
        Enum(LeadSource, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=LeadSource.OTHER,
        nullable=False,
    )
    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=LeadStatus.NEW,
        nullable=False,
        index=True,
    )
    course_interest: Mapped[str | None] = mapped_column(String(150), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    assignee: Mapped["User"] = relationship("User", foreign_keys=[assigned_to])

    def __repr__(self) -> str:
        return f"<Lead {self.name} status={self.status}>"
