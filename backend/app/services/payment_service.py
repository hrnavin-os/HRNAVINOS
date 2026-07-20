"""Business logic for the Payment / Finance Verification module."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError, ValidationAppError
from app.models.enums import InvoiceStatus, PaymentStatus
from app.models.payment import Payment
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.payment_schema import PaymentCreate, PaymentVerify
from app.services.audit_service import AuditService


class PaymentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.payments = PaymentRepository(db)
        self.invoices = InvoiceRepository(db)
        self.students = StudentRepository(db)
        self.audit = AuditService(db)

    def create(self, data: PaymentCreate, *, actor_id: uuid.UUID | None) -> Payment:
        if not self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        if data.invoice_id and not self.invoices.get_by_id(data.invoice_id):
            raise NotFoundError("Specified invoice does not exist.")

        payment = Payment(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        self.payments.create(payment)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Payment", entity_id=str(payment.id))
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def get(self, payment_id: uuid.UUID) -> Payment:
        payment = self.payments.get_by_id(payment_id)
        if not payment:
            raise NotFoundError("Payment not found.")
        return payment

    def list(self, params: PaginationParams, *, status: str | None = None, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        filters = {}
        if status:
            filters["status"] = status
        if student_id:
            filters["student_id"] = student_id
        items, total = self.payments.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def verify(self, payment_id: uuid.UUID, data: PaymentVerify, *, actor_id: uuid.UUID | None) -> Payment:
        payment = self.get(payment_id)
        if payment.status != PaymentStatus.PENDING:
            raise ValidationAppError("Only pending payments can be verified or rejected.")

        payment.status = PaymentStatus.VERIFIED if data.approve else PaymentStatus.REJECTED
        payment.verified_by = actor_id
        payment.verified_at = datetime.now(timezone.utc)
        if not data.approve:
            payment.rejection_reason = data.rejection_reason

        if data.approve and payment.invoice_id:
            invoice = self.invoices.get_by_id(payment.invoice_id)
            if invoice:
                invoice.amount_paid = float(invoice.amount_paid) + float(payment.amount)
                if invoice.amount_paid >= float(invoice.amount):
                    invoice.status = InvoiceStatus.PAID
                elif invoice.amount_paid > 0:
                    invoice.status = InvoiceStatus.PARTIALLY_PAID

        self.audit.record(
            user_id=actor_id,
            action="VERIFY" if data.approve else "REJECT",
            entity_type="Payment",
            entity_id=str(payment.id),
        )
        self.db.commit()
        self.db.refresh(payment)
        return payment
