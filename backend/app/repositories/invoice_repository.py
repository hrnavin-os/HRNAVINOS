"""Data access for Invoice documents."""
from app.models.invoice import Invoice
from app.repositories.base_repository import BaseRepository


class InvoiceRepository(BaseRepository[Invoice]):
    model = Invoice

    def __init__(self) -> None:
        super().__init__(Invoice)

    async def number_exists(self, invoice_number: str) -> bool:
        return await Invoice.find_one({"invoice_number": invoice_number}) is not None

    async def next_sequence(self) -> int:
        return await Invoice.find({}).count() + 1
