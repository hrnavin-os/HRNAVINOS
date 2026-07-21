"""HTTP routes for the User Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.user_schema import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["User Management"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    actor: User = Depends(RequirePermissions(Permissions.USERS_CREATE)),
) -> UserResponse:
    service = UserService()
    user = await service.create(payload, actor_id=actor.id)
    return await service.to_response(user)


@router.get("", response_model=PaginatedResponse[UserListResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    role_id: uuid.UUID | None = None,
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> PaginatedResponse[UserListResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    service = UserService()
    result = await service.list(params, role_id=role_id)
    items = [await service.to_list_response(u) for u in result.items]
    return PaginatedResponse[UserListResponse].build(items, result.total, result.page, result.page_size)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.USERS_VIEW)),
) -> UserResponse:
    service = UserService()
    return await service.to_response(await service.get(user_id))


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    service = UserService()
    user = await service.update(user_id, payload, actor_id=actor.id)
    return await service.to_response(user)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.USERS_UPDATE)),
) -> UserResponse:
    service = UserService()
    user = await service.deactivate(user_id, actor_id=actor.id)
    return await service.to_response(user)


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.USERS_DELETE)),
) -> MessageResponse:
    await UserService().delete(user_id, actor_id=actor.id)
    return MessageResponse(message="User deleted successfully.")
