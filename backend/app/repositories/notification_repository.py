"""Data access for Notification entities."""
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.repositories.base_repository import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    def __init__(self, db: Session) -> None:
        super().__init__(db, Notification)

    def unread_count(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False), Notification.is_deleted.is_(False)
        )
        return self.db.execute(stmt).scalar_one()

    def mark_all_read(self, user_id: uuid.UUID) -> None:
        self.db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
        self.db.flush()
