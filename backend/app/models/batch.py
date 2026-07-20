"""Batch model — a scheduled run of a Course, taught by a Tutor."""
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import BatchStatus

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.student import Student
    from app.models.tutor import Tutor


class Batch(BaseModel):
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tutor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tutors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    schedule: Mapped[str | None] = mapped_column(String(255), nullable=True)
    capacity: Mapped[int] = mapped_column(nullable=False, default=30)
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=BatchStatus.UPCOMING,
        nullable=False,
    )

    course: Mapped["Course"] = relationship("Course", back_populates="batches")
    tutor: Mapped["Tutor"] = relationship("Tutor", back_populates="batches")
    students: Mapped[list["Student"]] = relationship("Student", back_populates="batch")

    def __repr__(self) -> str:
        return f"<Batch {self.name}>"
