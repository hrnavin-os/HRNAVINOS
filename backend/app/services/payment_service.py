"""Business logic for the Payment / Finance Verification module."""
import uuid
from datetime import datetime, timezone

from app.exceptions.base import NotFoundError, ValidationAppError
from app.models.enums import InvoiceStatus, PaymentStatus, VerificationDecision
from app.models.finance_verification import FinanceVerification
from app.models.payment import Payment
from app.repositories.finance_verification_repository import FinanceVerificationRepository
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.payment_schema import PaymentCreate, PaymentVerify
from app.services.audit_service import AuditService


class PaymentService:
    def __init__(self) -> None:
        self.payments = PaymentRepository()
        self.invoices = InvoiceRepository()
        self.students = StudentRepository()
        self.verifications = FinanceVerificationRepository()
        self.audit = AuditService()

    async def create(self, data: PaymentCreate, *, actor_id: uuid.UUID | None) -> Payment:
        if not await self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        if data.invoice_id and not await self.invoices.get_by_id(data.invoice_id):
            raise NotFoundError("Specified invoice does not exist.")

        payment = Payment(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        await self.payments.create(payment)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Payment", entity_id=str(payment.id))
        return payment

    async def get(self, payment_id: uuid.UUID) -> Payment:
        payment = await self.payments.get_by_id(payment_id)
        if not payment:
            raise NotFoundError("Payment not found.")
        return payment

    async def list_verifications_for_payment(self, payment_id: uuid.UUID) -> list[FinanceVerification]:
        items, _ = await self.verifications.list(
            page=1, page_size=100, filters={"payment_id": payment_id}, include_deleted=True
        )
        return items

    async def list(
        self, params: PaginationParams, *, status: str | None = None, student_id: uuid.UUID | None = None
    ) -> PaginatedResponse:
        filters = {}
        if status:
            filters["status"] = status
        if student_id:
            filters["student_id"] = student_id
        items, total = await self.payments.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def verify(self, payment_id: uuid.UUID, data: PaymentVerify, *, actor_id: uuid.UUID) -> Payment:
        payment = await self.get(payment_id)
        if payment.status != PaymentStatus.PENDING:
            raise ValidationAppError("Only pending payments can be verified or rejected.")

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.VERIFIED if data.approve else PaymentStatus.REJECTED
        await payment.save()

        await self.verifications.create(
            FinanceVerification(
                payment_id=payment.id,
                decision=VerificationDecision.APPROVED if data.approve else VerificationDecision.REJECTED,
                verified_by=actor_id,
                verified_at=now,
                reason=data.rejection_reason,
                created_by=actor_id,
                updated_by=actor_id,
            )
        )

        if data.approve and payment.invoice_id:
            invoice = await self.invoices.get_by_id(payment.invoice_id)
            if invoice:
                invoice.amount_paid = invoice.amount_paid + payment.amount
                if invoice.amount_paid >= invoice.amount:
                    invoice.status = InvoiceStatus.PAID
                elif invoice.amount_paid > 0:
                    invoice.status = InvoiceStatus.PARTIALLY_PAID
                await invoice.save()

        await self.audit.record(
            user_id=actor_id,
            action="VERIFY" if data.approve else "REJECT",
            entity_type="Payment",
            entity_id=str(payment.id),
        )
        return payment
