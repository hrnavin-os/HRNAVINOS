"""HTTP routes for the Tickets (Help Desk) module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions, get_current_user
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.ticket_schema import TicketAssign, TicketCreate, TicketResponse, TicketUpdate
from app.services.ticket_service import TicketService

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(payload: TicketCreate, user: User = Depends(get_current_user)) -> TicketResponse:
    return TicketResponse.model_validate(await TicketService().create(payload, actor_id=user.id))


@router.get("", response_model=PaginatedResponse[TicketResponse])
async def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    assigned_to: uuid.UUID | None = None,
    actor: User = Depends(RequirePermissions(Permissions.TICKETS_VIEW)),
) -> PaginatedResponse[TicketResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await TicketService().list(params, assigned_to=assigned_to)
    return PaginatedResponse[TicketResponse].build(
        [TicketResponse.model_validate(t) for t in result.items], result.total, result.page, result.page_size
    )


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(ticket_id: uuid.UUID, user: User = Depends(get_current_user)) -> TicketResponse:
    return TicketResponse.model_validate(await TicketService().get(ticket_id))


@router.put("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: uuid.UUID,
    payload: TicketUpdate,
    actor: User = Depends(RequirePermissions(Permissions.TICKETS_UPDATE)),
) -> TicketResponse:
    return TicketResponse.model_validate(await TicketService().update(ticket_id, payload, actor_id=actor.id))


@router.post("/{ticket_id}/assign", response_model=TicketResponse)
async def assign_ticket(
    ticket_id: uuid.UUID,
    payload: TicketAssign,
    actor: User = Depends(RequirePermissions(Permissions.TICKETS_ASSIGN)),
) -> TicketResponse:
    return TicketResponse.model_validate(await TicketService().assign(ticket_id, payload, actor_id=actor.id))
