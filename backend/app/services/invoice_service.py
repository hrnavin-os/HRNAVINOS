"""Business logic for the Invoice module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.invoice import Invoice
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.invoice_schema import InvoiceCreate, InvoiceUpdate
from app.services.audit_service import AuditService


class InvoiceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.invoices = InvoiceRepository(db)
        self.students = StudentRepository(db)
        self.audit = AuditService(db)

    def _generate_invoice_number(self) -> str:
        sequence = self.invoices.next_sequence()
        candidate = f"INV-{sequence:06d}"
        while self.invoices.number_exists(candidate):
            sequence += 1
            candidate = f"INV-{sequence:06d}"
        return candidate

    def create(self, data: InvoiceCreate, *, actor_id: uuid.UUID | None) -> Invoice:
        if not self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")

        invoice = Invoice(
            **data.model_dump(),
            invoice_number=self._generate_invoice_number(),
            created_by=actor_id,
            updated_by=actor_id,
        )
        self.invoices.create(invoice)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Invoice", entity_id=str(invoice.id))
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def get(self, invoice_id: uuid.UUID) -> Invoice:
        invoice = self.invoices.get_by_id(invoice_id)
        if not invoice:
            raise NotFoundError("Invoice not found.")
        return invoice

    def list(self, params: PaginationParams, *, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = self.invoices.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["invoice_number"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"student_id": student_id} if student_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, invoice_id: uuid.UUID, data: InvoiceUpdate, *, actor_id: uuid.UUID | None) -> Invoice:
        invoice = self.get(invoice_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.invoices.update(invoice, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Invoice", entity_id=str(invoice.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(invoice)
        return invoice
