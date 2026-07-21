"""Data access for LoginHistory documents."""
from app.models.login_history import LoginHistory
from app.repositories.base_repository import BaseRepository


class LoginHistoryRepository(BaseRepository[LoginHistory]):
    model = LoginHistory

    def __init__(self) -> None:
        super().__init__(LoginHistory)
