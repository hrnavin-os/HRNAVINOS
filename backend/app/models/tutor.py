"""Tutor model — the teaching-staff profile linked to a User account."""
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import TutorStatus

if TYPE_CHECKING:
    from app.models.batch import Batch
    from app.models.user import User


class Tutor(BaseModel):
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    specialization: Mapped[str] = mapped_column(String(255), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[TutorStatus] = mapped_column(
        Enum(TutorStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=TutorStatus.ACTIVE,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    batches: Mapped[list["Batch"]] = relationship("Batch", back_populates="tutor")

    def __repr__(self) -> str:
        return f"<Tutor {self.id} user={self.user_id}>"
