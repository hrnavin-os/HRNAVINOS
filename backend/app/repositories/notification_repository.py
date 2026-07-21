"""Data access for Notification documents."""
import uuid

from app.models.notification import Notification
from app.repositories.base_repository import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    def __init__(self) -> None:
        super().__init__(Notification)

    async def unread_count(self, user_id: uuid.UUID) -> int:
        return await Notification.find(
            {"user_id": user_id, "is_read": False, "is_deleted": False}
        ).count()

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await Notification.find({"user_id": user_id, "is_read": False}).update({"$set": {"is_read": True}})
