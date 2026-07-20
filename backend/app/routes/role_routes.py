"""HTTP routes for the Role Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.role_schema import RoleCreate, RoleResponse, RoleUpdate
from app.services.role_service import RoleService

router = APIRouter(prefix="/roles", tags=["Role Management"])


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ROLES_CREATE)),
) -> RoleResponse:
    role = RoleService(db).create(payload, actor_id=actor.id)
    return RoleResponse.model_validate(role)


@router.get("", response_model=PaginatedResponse[RoleResponse])
def list_roles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ROLES_VIEW)),
) -> PaginatedResponse[RoleResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = RoleService(db).list(params)
    return PaginatedResponse[RoleResponse].build(
        [RoleResponse.model_validate(r) for r in result.items], result.total, result.page, result.page_size
    )


@router.get("/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ROLES_VIEW)),
) -> RoleResponse:
    return RoleResponse.model_validate(RoleService(db).get(role_id))


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ROLES_UPDATE)),
) -> RoleResponse:
    role = RoleService(db).update(role_id, payload, actor_id=actor.id)
    return RoleResponse.model_validate(role)


@router.delete("/{role_id}", response_model=MessageResponse)
def delete_role(
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ROLES_DELETE)),
) -> MessageResponse:
    RoleService(db).delete(role_id, actor_id=actor.id)
    return MessageResponse(message="Role deleted successfully.")
