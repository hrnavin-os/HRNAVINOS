"""Data access for Tutor entities."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tutor import Tutor
from app.repositories.base_repository import BaseRepository


class TutorRepository(BaseRepository[Tutor]):
    model = Tutor

    def __init__(self, db: Session) -> None:
        super().__init__(db, Tutor)

    def get_by_user_id(self, user_id) -> Tutor | None:
        stmt = select(Tutor).where(Tutor.user_id == user_id, Tutor.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()
