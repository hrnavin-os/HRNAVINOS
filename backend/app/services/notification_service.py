"""Business logic for the Notifications module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.notification import Notification
from app.repositories.notification_repository import NotificationRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.notification_schema import NotificationCreate


class NotificationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.notifications = NotificationRepository(db)
        self.users = UserRepository(db)

    def create(self, data: NotificationCreate) -> Notification:
        if not self.users.get_by_id(data.user_id):
            raise NotFoundError("Specified user does not exist.")
        notification = Notification(**data.model_dump())
        self.notifications.create(notification)
        self.db.commit()
        self.db.refresh(notification)
        return notification

    def list_for_user(self, user_id: uuid.UUID, params: PaginationParams) -> PaginatedResponse:
        items, total = self.notifications.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"user_id": user_id},
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def unread_count(self, user_id: uuid.UUID) -> int:
        return self.notifications.unread_count(user_id)

    def mark_read(self, notification_id: uuid.UUID, *, user_id: uuid.UUID) -> Notification:
        notification = self.notifications.get_by_id(notification_id)
        if not notification or notification.user_id != user_id:
            raise NotFoundError("Notification not found.")
        notification.is_read = True
        self.db.commit()
        self.db.refresh(notification)
        return notification

    def mark_all_read(self, user_id: uuid.UUID) -> None:
        self.notifications.mark_all_read(user_id)
        self.db.commit()
