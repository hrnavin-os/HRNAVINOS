"""Data access for Payment entities."""
from sqlalchemy.orm import Session

from app.models.payment import Payment
from app.repositories.base_repository import BaseRepository


class PaymentRepository(BaseRepository[Payment]):
    model = Payment

    def __init__(self, db: Session) -> None:
        super().__init__(db, Payment)
