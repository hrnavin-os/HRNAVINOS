"""Data access for FinanceVerification documents."""
from app.models.finance_verification import FinanceVerification
from app.repositories.base_repository import BaseRepository


class FinanceVerificationRepository(BaseRepository[FinanceVerification]):
    model = FinanceVerification

    def __init__(self) -> None:
        super().__init__(FinanceVerification)
