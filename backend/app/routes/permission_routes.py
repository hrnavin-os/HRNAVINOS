"""HTTP routes for the Permission Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.permission_schema import PermissionCreate, PermissionResponse, PermissionUpdate
from app.services.permission_service import PermissionService

router = APIRouter(prefix="/permissions", tags=["Permission Management"])


@router.post("", response_model=PermissionResponse, status_code=status.HTTP_201_CREATED)
def create_permission(
    payload: PermissionCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PERMISSIONS_CREATE)),
) -> PermissionResponse:
    permission = PermissionService(db).create(payload, actor_id=actor.id)
    return PermissionResponse.model_validate(permission)


@router.get("", response_model=PaginatedResponse[PermissionResponse])
def list_permissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "module",
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PERMISSIONS_VIEW)),
) -> PaginatedResponse[PermissionResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = PermissionService(db).list(params)
    return PaginatedResponse[PermissionResponse].build(
        [PermissionResponse.model_validate(p) for p in result.items], result.total, result.page, result.page_size
    )


@router.put("/{permission_id}", response_model=PermissionResponse)
def update_permission(
    permission_id: uuid.UUID,
    payload: PermissionUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PERMISSIONS_UPDATE)),
) -> PermissionResponse:
    permission = PermissionService(db).update(permission_id, payload, actor_id=actor.id)
    return PermissionResponse.model_validate(permission)


@router.delete("/{permission_id}", response_model=MessageResponse)
def delete_permission(
    permission_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PERMISSIONS_DELETE)),
) -> MessageResponse:
    PermissionService(db).delete(permission_id, actor_id=actor.id)
    return MessageResponse(message="Permission deleted successfully.")
