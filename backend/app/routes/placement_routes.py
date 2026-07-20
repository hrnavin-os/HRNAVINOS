"""HTTP routes for the Placement module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.placement_schema import PlacementCreate, PlacementResponse, PlacementUpdate
from app.services.placement_service import PlacementService

router = APIRouter(prefix="/placements", tags=["Placement"])


@router.post("", response_model=PlacementResponse, status_code=status.HTTP_201_CREATED)
def create_placement(
    payload: PlacementCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_CREATE)),
) -> PlacementResponse:
    return PlacementResponse.model_validate(PlacementService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[PlacementResponse])
def list_placements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    student_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_VIEW)),
) -> PaginatedResponse[PlacementResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = PlacementService(db).list(params, student_id=student_id)
    return PaginatedResponse[PlacementResponse].build(
        [PlacementResponse.model_validate(p) for p in result.items], result.total, result.page, result.page_size
    )


@router.get("/{placement_id}", response_model=PlacementResponse)
def get_placement(
    placement_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_VIEW)),
) -> PlacementResponse:
    return PlacementResponse.model_validate(PlacementService(db).get(placement_id))


@router.put("/{placement_id}", response_model=PlacementResponse)
def update_placement(
    placement_id: uuid.UUID,
    payload: PlacementUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_UPDATE)),
) -> PlacementResponse:
    return PlacementResponse.model_validate(PlacementService(db).update(placement_id, payload, actor_id=actor.id))


@router.delete("/{placement_id}", response_model=MessageResponse)
def delete_placement(
    placement_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_DELETE)),
) -> MessageResponse:
    PlacementService(db).delete(placement_id, actor_id=actor.id)
    return MessageResponse(message="Placement deleted successfully.")
