"""HTTP routes for the User Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.user_schema import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_CREATE)),
) -> UserResponse:
    user = UserService(db).create(payload, actor_id=actor.id)
    return UserResponse.model_validate(user)


@router.get("", response_model=PaginatedResponse[UserListResponse])
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    role_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> PaginatedResponse[UserListResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = UserService(db).list(params, role_id=role_id)
    return PaginatedResponse[UserListResponse].build(
        [UserListResponse.model_validate(u) for u in result.items], result.total, result.page, result.page_size
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> UserResponse:
    return UserResponse.model_validate(UserService(db).get(user_id))


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    user = UserService(db).update(user_id, payload, actor_id=actor.id)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    user = UserService(db).deactivate(user_id, actor_id=actor.id)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.USERS_DELETE)),
) -> MessageResponse:
    UserService(db).delete(user_id, actor_id=actor.id)
    return MessageResponse(message="User deleted successfully.")
