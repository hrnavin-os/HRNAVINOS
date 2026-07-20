"""HTTP routes for the Notifications module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions, get_current_user
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.notification_schema import NotificationCreate, NotificationResponse
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.NOTIFICATIONS_CREATE)),
) -> NotificationResponse:
    return NotificationResponse.model_validate(NotificationService(db).create(payload))


@router.get("", response_model=PaginatedResponse[NotificationResponse])
def list_my_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PaginatedResponse[NotificationResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = NotificationService(db).list_for_user(user.id, params)
    return PaginatedResponse[NotificationResponse].build(
        [NotificationResponse.model_validate(n) for n in result.items], result.total, result.page, result.page_size
    )


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    return {"unread_count": NotificationService(db).unread_count(user.id)}


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> NotificationResponse:
    return NotificationResponse.model_validate(NotificationService(db).mark_read(notification_id, user_id=user.id))


@router.post("/mark-all-read", response_model=MessageResponse)
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> MessageResponse:
    NotificationService(db).mark_all_read(user.id)
    return MessageResponse(message="All notifications marked as read.")
