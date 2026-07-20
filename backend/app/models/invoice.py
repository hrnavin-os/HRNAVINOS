"""Invoice model — an amount owed by a Student, optionally tied to an Admission."""
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel
from app.models.enums import InvoiceStatus

if TYPE_CHECKING:
    from app.models.admission import Admission
    from app.models.payment import Payment
    from app.models.student import Student


class Invoice(BaseModel):
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    admission_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admissions.id", ondelete="SET NULL"), nullable=True
    )
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=InvoiceStatus.UNPAID,
        nullable=False,
    )

    student: Mapped["Student"] = relationship("Student", foreign_keys=[student_id])
    admission: Mapped["Admission"] = relationship("Admission", foreign_keys=[admission_id])
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="invoice")

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} status={self.status}>"
