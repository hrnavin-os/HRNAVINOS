"""HTTP routes for the Lead Management (CRM / Pre-Sales) module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.lead_schema import LeadAssign, LeadCreate, LeadResponse, LeadUpdate
from app.services.lead_service import LeadService

router = APIRouter(prefix="/leads", tags=["Lead Management"])


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> LeadResponse:
    return LeadResponse.model_validate(LeadService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[LeadResponse])
def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    assigned_to: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> PaginatedResponse[LeadResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = LeadService(db).list(params, status=status_filter, assigned_to=assigned_to)
    return PaginatedResponse[LeadResponse].build(
        [LeadResponse.model_validate(lead) for lead in result.items], result.total, result.page, result.page_size
    )


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> LeadResponse:
    return LeadResponse.model_validate(LeadService(db).get(lead_id))


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    return LeadResponse.model_validate(LeadService(db).update(lead_id, payload, actor_id=actor.id))


@router.post("/{lead_id}/assign", response_model=LeadResponse)
def assign_lead(
    lead_id: uuid.UUID,
    payload: LeadAssign,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_ASSIGN)),
) -> LeadResponse:
    return LeadResponse.model_validate(LeadService(db).assign(lead_id, payload, actor_id=actor.id))


@router.delete("/{lead_id}", response_model=MessageResponse)
def delete_lead(
    lead_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_DELETE)),
) -> MessageResponse:
    LeadService(db).delete(lead_id, actor_id=actor.id)
    return MessageResponse(message="Lead deleted successfully.")
