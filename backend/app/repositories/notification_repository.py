"""Data access for Notification documents."""
import uuid

from app.database.base import utcnow
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

    async def soft_delete_many(self, ids: list[uuid.UUID], *, user_id: uuid.UUID) -> int:
        """Removes several of this user's notifications in one write.

        `user_id` is part of the filter rather than checked beforehand, so ids
        belonging to somebody else simply don't match - a request listing
        another person's notifications deletes none of them instead of being
        trusted and then rejected.

        Soft, like every other delete in the app: the row stays for audit and
        the list queries already exclude is_deleted.
        """
        result = await Notification.find(
            {"_id": {"$in": ids}, "user_id": user_id, "is_deleted": False}
        ).update({"$set": {"is_deleted": True, "deleted_at": utcnow()}})
        return result.modified_count

    async def has_unread_reminder(self, *, user_id: uuid.UUID, lead_id: uuid.UUID, title: str) -> bool:
        """Whether this person is already sitting on an unopened reminder of
        the same kind about the same lead.

        Unread is the condition rather than a time window, because that's what
        actually decides whether a second one carries information. If they
        haven't opened the first, another copy tells them nothing they don't
        already have waiting. Once they've read it and the money still hasn't
        arrived, chasing again is a legitimate thing for Finance to do, so this
        stops suppressing it.

        Title identifies the kind: it comes from LeadService._REMINDER_COPY, so
        a due-payment reminder never masks an after-placement one.
        """
        return (
            await Notification.find_one(
                {
                    "user_id": user_id,
                    "lead_id": lead_id,
                    "title": title,
                    "is_read": False,
                    "is_deleted": False,
                }
            )
            is not None
        )
