"""Payment model — a single payment transaction, subject to finance verification."""
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import PaymentMethod, PaymentStatus

if TYPE_CHECKING:
    from app.models.invoice import Invoice
    from app.models.student import Student


class Payment(BaseModel):
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True,
    )
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="payments", foreign_keys=[invoice_id])

    def __repr__(self) -> str:
        return f"<Payment {self.id} amount={self.amount} status={self.status}>"
