"""Data access for User entities."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self, db: Session) -> None:
        super().__init__(db, User)

    def get_by_email(self, email: str, *, include_deleted: bool = False) -> User | None:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        if not include_deleted:
            stmt = stmt.where(User.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def email_exists(self, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        stmt = select(User.id).where(func.lower(User.email) == email.lower())
        if exclude_id:
            stmt = stmt.where(User.id != exclude_id)
        return self.db.execute(stmt).first() is not None
