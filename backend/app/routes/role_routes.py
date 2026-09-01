"""HTTP routes for the Role Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.role_schema import RoleCreate, RoleDelete, RoleResponse, RoleUpdate
from app.services.role_service import RoleService

router = APIRouter(prefix="/roles", tags=["Role Management"])


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreate,
    actor: User = Depends(RequirePermissions(Permissions.ROLES_CREATE)),
) -> RoleResponse:
    return await RoleService().create(payload, actor_id=actor.id)


@router.get("", response_model=PaginatedResponse[RoleResponse])
async def list_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    # The Deleted tab - see the same flag on the users list.
    deleted: bool = False,
    actor: User = Depends(RequirePermissions(Permissions.ROLES_VIEW)),
) -> PaginatedResponse[RoleResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await RoleService().list(params, deleted=deleted)
    return PaginatedResponse[RoleResponse].build(result.items, result.total, result.page, result.page_size)


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.ROLES_VIEW)),
) -> RoleResponse:
    return await RoleService().get(role_id)


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    actor: User = Depends(RequirePermissions(Permissions.ROLES_UPDATE)),
) -> RoleResponse:
    return await RoleService().update(role_id, payload, actor_id=actor.id)


@router.delete("/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: uuid.UUID,
    # A body on DELETE, for the same reason the user one takes it: typed prose
    # does not belong in a URL.
    payload: RoleDelete,
    actor: User = Depends(RequirePermissions(Permissions.ROLES_DELETE)),
) -> MessageResponse:
    await RoleService().delete(role_id, reason=payload.reason, actor_id=actor.id)
    return MessageResponse(message="Role deleted successfully.")
