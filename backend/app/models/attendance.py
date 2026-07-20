"""Attendance model — one record per student per batch per day."""
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import AttendanceStatus

if TYPE_CHECKING:
    from app.models.batch import Batch
    from app.models.student import Student


class Attendance(BaseModel):
    __table_args__ = (
        UniqueConstraint("student_id", "batch_id", "date", name="uq_attendance_student_batch_date"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    marked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    remarks: Mapped[str | None] = mapped_column(String(255), nullable=True)

    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])
    batch: Mapped["Batch"] = relationship("Batch", foreign_keys=[batch_id])

    def __repr__(self) -> str:
        return f"<Attendance student={self.student_id} date={self.date} status={self.status}>"
