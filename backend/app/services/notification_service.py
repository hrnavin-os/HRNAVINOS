"""Business logic for the Notifications module."""
import uuid

from app.exceptions.base import NotFoundError
from app.models.enums import NotificationCategory
from app.models.notification import Notification
from app.repositories.notification_repository import NotificationRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.notification_schema import NotificationCreate
from app.services.reminder_service import ReminderService


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
        # The date-driven reminders are raised here rather than by a scheduler -
        # see ReminderService for why. Throttled per worker, and it swallows
        # its own failures so a broken sweep can't take the badge down with it.
        await ReminderService().sweep_if_due()
        return await self.notifications.unread_count(user_id)

    async def mark_read(self, notification_id: uuid.UUID, *, user_id: uuid.UUID) -> Notification:
        notification = await self.notifications.get_by_id(notification_id)
        if not notification or notification.user_id != user_id:
            raise NotFoundError("Notification not found.")
        notification.is_read = True
        await notification.save()
        return notification

    async def acknowledge(self, notification_id: uuid.UUID, *, user_id: uuid.UUID) -> Notification:
        """Marks read and, for a Finance payment reminder, moves that lead to
        the follow-up stage - opening that reminder *is* the acknowledgement
        that someone will chase the money again.

        Only that kind. A follow-up or installment date coming round says
        nothing about where the lead belongs in the pipeline, so moving it
        would rewrite the board behind the admin's back every time they read
        their notifications. Category is None on every reminder raised before
        categories existed, all of which were payment reminders, so None keeps
        the old behaviour.

        Imported inside the method: LeadService already constructs a
        NotificationRepository, so importing it at module scope would make
        these two modules import each other.
        """
        notification = await self.mark_read(notification_id, user_id=user_id)
        moves_stage = notification.category in (None, NotificationCategory.PAYMENT_REMINDER)
        if notification.lead_id and moves_stage:
            from app.services.lead_service import LeadService

            await LeadService().move_to_follow_up(notification.lead_id, actor_id=user_id)
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.notifications.mark_all_read(user_id)
