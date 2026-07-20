"""Data access for LoginHistory entities."""
from sqlalchemy.orm import Session

from app.models.login_history import LoginHistory
from app.repositories.base_repository import BaseRepository


class LoginHistoryRepository(BaseRepository[LoginHistory]):
    model = LoginHistory

    def __init__(self, db: Session) -> None:
        super().__init__(db, LoginHistory)
