"""HTTP routes for the Induction Call Form.

Gated on the LEADS_* permissions rather than new INDUCTION_* ones: this form
lives on the Form Collection page, which already sits behind LEADS_VIEW, and
the rows are lead-intake records. Reusing them means nobody has to re-grant
permissions to existing roles before the tab works.
"""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.induction_entry_schema import (
    InductionEntryCreate,
    InductionEntryResponse,
    InductionEntryUpdate,
)
from app.services.induction_entry_service import InductionEntryService

router = APIRouter(prefix="/induction-entries", tags=["Induction Call Form"])


@router.post("", response_model=InductionEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    payload: InductionEntryCreate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> InductionEntryResponse:
    service = InductionEntryService()
    return await service.to_response(await service.create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[InductionEntryResponse])
async def list_entries(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "registration_date",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> PaginatedResponse[InductionEntryResponse]:
    service = InductionEntryService()
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await service.list(params)
    return PaginatedResponse[InductionEntryResponse].build(
        [await service.to_response(e) for e in result.items], result.total, result.page, result.page_size
    )


@router.get("/{entry_id}", response_model=InductionEntryResponse)
async def get_entry(
    entry_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> InductionEntryResponse:
    service = InductionEntryService()
    return await service.to_response(await service.get(entry_id))


@router.put("/{entry_id}", response_model=InductionEntryResponse)
async def update_entry(
    entry_id: uuid.UUID,
    payload: InductionEntryUpdate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> InductionEntryResponse:
    service = InductionEntryService()
    return await service.to_response(await service.update(entry_id, payload, actor_id=actor.id))


@router.delete("/{entry_id}", response_model=MessageResponse)
async def delete_entry(
    entry_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_DELETE)),
) -> MessageResponse:
    await InductionEntryService().delete(entry_id, actor_id=actor.id)
    return MessageResponse(message="Induction entry deleted successfully.")
