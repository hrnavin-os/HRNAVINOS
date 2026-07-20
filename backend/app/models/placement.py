"""Placement model — tracks a Student's job placement pipeline post-course."""
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import PlacementStatus

if TYPE_CHECKING:
    from app.models.student import Student


class Placement(BaseModel):
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    job_role: Mapped[str] = mapped_column(String(150), nullable=False)
    package_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[PlacementStatus] = mapped_column(
        Enum(PlacementStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=PlacementStatus.APPLIED,
        nullable=False,
        index=True,
    )
    placed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    placed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])

    def __repr__(self) -> str:
        return f"<Placement student={self.student_id} company={self.company_name}>"
