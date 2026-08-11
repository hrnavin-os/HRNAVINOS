"""HTTP routes for the Notifications module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions, get_current_user
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.notification_schema import (
    NotificationBulkDeleteRequest,
    NotificationCreate,
    NotificationDeleteResponse,
    NotificationResponse,
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    actor: User = Depends(RequirePermissions(Permissions.NOTIFICATIONS_CREATE)),
) -> NotificationResponse:
    return NotificationResponse.model_validate(await NotificationService().create(payload))


@router.get("", response_model=PaginatedResponse[NotificationResponse])
async def list_my_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user),
) -> PaginatedResponse[NotificationResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = await NotificationService().list_for_user(user.id, params)
    return PaginatedResponse[NotificationResponse].build(
        [NotificationResponse.model_validate(n) for n in result.items], result.total, result.page, result.page_size
    )


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_user)) -> dict:
    return {"unread_count": await NotificationService().unread_count(user.id)}


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(notification_id: uuid.UUID, user: User = Depends(get_current_user)) -> NotificationResponse:
    return NotificationResponse.model_validate(
        await NotificationService().mark_read(notification_id, user_id=user.id)
    )


@router.post("/{notification_id}/acknowledge", response_model=NotificationResponse)
async def acknowledge(notification_id: uuid.UUID, user: User = Depends(get_current_user)) -> NotificationResponse:
    """Opening a notification. Same as mark-read, except a payment reminder
    also moves its lead to the follow-up stage so it resurfaces in the
    section admin's own queue."""
    return NotificationResponse.model_validate(
        await NotificationService().acknowledge(notification_id, user_id=user.id)
    )


@router.post("/mark-all-read", response_model=MessageResponse)
async def mark_all_read(user: User = Depends(get_current_user)) -> MessageResponse:
    await NotificationService().mark_all_read(user.id)
    return MessageResponse(message="All notifications marked as read.")


# Both delete routes are scoped to the caller rather than gated on a
# permission: a notification is addressed to one person, and dismissing your
# own is not an administrative act. Nobody can reach anybody else's.
#
# Declared before /{notification_id} so the dynamic route doesn't swallow
# "bulk-delete" and try to parse it as a UUID.
@router.post("/bulk-delete", response_model=NotificationDeleteResponse)
async def bulk_delete(
    payload: NotificationBulkDeleteRequest,
    user: User = Depends(get_current_user),
) -> NotificationDeleteResponse:
    deleted = await NotificationService().delete_many(payload.ids, user_id=user.id)
    return NotificationDeleteResponse(
        message=f"{deleted} notification{'' if deleted == 1 else 's'} deleted.", deleted=deleted
    )


@router.delete("/{notification_id}", response_model=MessageResponse)
async def delete_notification(
    notification_id: uuid.UUID, user: User = Depends(get_current_user)
) -> MessageResponse:
    await NotificationService().delete(notification_id, user_id=user.id)
    return MessageResponse(message="Notification deleted.")
