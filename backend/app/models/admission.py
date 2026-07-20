"""Admission model — the record confirming a Student's enrollment into a Course/Batch."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import AdmissionStatus

if TYPE_CHECKING:
    from app.models.batch import Batch
    from app.models.course import Course
    from app.models.lead import Lead
    from app.models.student import Student


class Admission(BaseModel):
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True
    )
    total_fee: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    admission_fee_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    status: Mapped[AdmissionStatus] = mapped_column(
        Enum(AdmissionStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=AdmissionStatus.PENDING,
        nullable=False,
    )
    admitted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])
    course: Mapped["Course"] = relationship("Course", foreign_keys=[course_id])
    batch: Mapped["Batch"] = relationship("Batch", foreign_keys=[batch_id])
    lead: Mapped["Lead"] = relationship("Lead", foreign_keys=[lead_id])

    def __repr__(self) -> str:
        return f"<Admission student={self.student_id} status={self.status}>"
