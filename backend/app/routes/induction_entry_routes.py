"""HTTP routes for the Induction Call Form.

Gated on the LEADS_* permissions rather than new INDUCTION_* ones: this form
lives on the Form Collection page, which already sits behind LEADS_VIEW, and
the rows are lead-intake records. Reusing them means nobody has to re-grant
permissions to existing roles before the tab works.
"""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions, get_actor_scope
from app.models.enums import InductionStatus
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.induction_entry_schema import (
    InductionAnalyticsResponse,
    InductionDetailsUpdate,
    InductionEntryCreate,
    InductionEntryResponse,
    InductionEntryStatsResponse,
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
    section: str | None = None,
    sales_person: str | None = None,
    lead_source: str | None = None,
    payment_mode: str | None = None,
    category: str | None = None,
    assigned_to: uuid.UUID | None = None,
    batch: str | None = None,
    # Which tab. Defaults to the pending one, so any caller that predates the
    # tabs still gets the active queue rather than everything.
    status: InductionStatus = InductionStatus.PENDING_INDUCTION,
    sort_by: str = "registration_date",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> PaginatedResponse[InductionEntryResponse]:
    service = InductionEntryService()
    # A Section Admin's scope comes from their role and overrides whatever the
    # client sent, so dropping the query param can't widen what they see.
    scope = await get_actor_scope(actor)
    filters = {
        key: value
        for key, value in {
            "section": scope or section,
            "sales_person": sales_person,
            "lead_source": lead_source,
            "payment_mode": payment_mode,
            "category": category,
            "assigned_to": assigned_to,
        }.items()
        if value
    }
    # Batch is derived from registration_date rather than stored, so filtering
    # by it becomes a range query over the month it represents.
    if batch:
        window = service.batch_date_range(batch)
        if window:
            filters["registration_date"] = {"$gte": window[0], "$lte": window[1]}

    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await service.list(params, filters=filters, status=status)
    # Resolved for the whole page in one query; empty on the pending tab, where
    # no row has a lead to read a stage from.
    foundation = await service.foundation_statuses(result.items)
    return PaginatedResponse[InductionEntryResponse].build(
        [await service.to_response(e, foundation_status=foundation.get(e.id)) for e in result.items],
        result.total,
        result.page,
        result.page_size,
    )


# Declared before /{entry_id}: FastAPI matches in order, so the dynamic route
# would otherwise swallow "stats" and try to parse it as a UUID.
@router.get("/stats", response_model=InductionEntryStatsResponse)
async def entry_stats(
    status: InductionStatus = InductionStatus.PENDING_INDUCTION,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> InductionEntryStatsResponse:
    # Scope comes from the actor's role, not a query param, so a Section Admin
    # can't widen it - same rule the lead stats endpoint follows.
    scope = await get_actor_scope(actor)
    return InductionEntryStatsResponse(**await InductionEntryService().stats(section=scope, status=status))


@router.get("/filter-options")
async def filter_options(
    status: InductionStatus = InductionStatus.PENDING_INDUCTION,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> dict:
    """Distinct values present in the data, so the filter row only ever offers
    options that actually match something. Scoped like the list is, or a
    Section Admin's filters would offer values only other sections have - and
    narrowed to the open tab, or the pending tab would offer values that only
    moved entries carry."""
    scope = await get_actor_scope(actor)
    return await InductionEntryService().filter_options(section=scope, status=status)


@router.get("/analytics", response_model=InductionAnalyticsResponse)
async def analytics(
    dimension: Literal["category", "call_remark", "sales_person", "lead_source"] = "category",
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> InductionAnalyticsResponse:
    """Counts per distinct value of one induction-form field, for the analytics
    board.

    The Literal is the outer half of the guard on which fields are groupable -
    it turns an unknown dimension into a 422 at the edge rather than letting it
    reach the service. The service keeps its own closed map regardless, since it
    is callable from elsewhere.

    Declared before /{entry_id}, like the other fixed segments, or the dynamic
    route swallows "analytics" and tries to parse it as a UUID. Scoped from the
    actor's role for the same reason the list is - a Section Admin's numbers
    must cover their own section, not everyone's.
    """
    scope = await get_actor_scope(actor)
    return InductionAnalyticsResponse(**await InductionEntryService().analytics(dimension, section=scope))


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


@router.put("/{entry_id}/details", response_model=InductionEntryResponse)
async def update_entry_details(
    entry_id: uuid.UUID,
    payload: InductionDetailsUpdate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> InductionEntryResponse:
    """The post-call update form. Separate from PUT /{entry_id}, which edits
    the entry's own fields - these are the four extra pages and they save
    independently of them."""
    service = InductionEntryService()
    return await service.to_response(await service.update_details(entry_id, payload, actor_id=actor.id))


@router.delete("/{entry_id}", response_model=MessageResponse)
async def delete_entry(
    entry_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_DELETE)),
) -> MessageResponse:
    await InductionEntryService().delete(entry_id, actor_id=actor.id)
    return MessageResponse(message="Induction entry deleted successfully.")
