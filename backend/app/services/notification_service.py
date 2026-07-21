"""Business logic for the Notifications module."""
import uuid

from app.exceptions.base import NotFoundError
from app.models.notification import Notification
from app.repositories.notification_repository import NotificationRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.notification_schema import NotificationCreate


class NotificationService:
    def __init__(self) -> None:
        self.notifications = NotificationRepository()
        self.users = UserRepository()

    async def create(self, data: NotificationCreate) -> Notification:
        if not await self.users.get_by_id(data.user_id):
            raise NotFoundError("Specified user does not exist.")
        notification = Notification(**data.model_dump())
        await self.notifications.create(notification)
        return notification

    async def list_for_user(self, user_id: uuid.UUID, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.notifications.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"user_id": user_id},
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def unread_count(self, user_id: uuid.UUID) -> int:
        return await self.notifications.unread_count(user_id)

    async def mark_read(self, notification_id: uuid.UUID, *, user_id: uuid.UUID) -> Notification:
        notification = await self.notifications.get_by_id(notification_id)
        if not notification or notification.user_id != user_id:
            raise NotFoundError("Notification not found.")
        notification.is_read = True
        await notification.save()
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.notifications.mark_all_read(user_id)
