"""Data access for Payment documents."""
from app.models.payment import Payment
from app.repositories.base_repository import BaseRepository


class PaymentRepository(BaseRepository[Payment]):
    model = Payment

    def __init__(self) -> None:
        super().__init__(Payment)
