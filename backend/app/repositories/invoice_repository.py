"""Data access for Invoice entities."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.repositories.base_repository import BaseRepository


class InvoiceRepository(BaseRepository[Invoice]):
    model = Invoice

    def __init__(self, db: Session) -> None:
        super().__init__(db, Invoice)

    def number_exists(self, invoice_number: str) -> bool:
        stmt = select(Invoice.id).where(Invoice.invoice_number == invoice_number)
        return self.db.execute(stmt).first() is not None

    def next_sequence(self) -> int:
        stmt = select(func.count()).select_from(Invoice)
        return self.db.execute(stmt).scalar_one() + 1
