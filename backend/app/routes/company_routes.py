"""HTTP routes for the Company (placement partners) module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.company_schema import CompanyCreate, CompanyResponse, CompanyUpdate
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["Companies"])


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_CREATE)),
) -> CompanyResponse:
    return CompanyResponse.model_validate(await CompanyService().create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[CompanyResponse])
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "name",
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_VIEW)),
) -> PaginatedResponse[CompanyResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await CompanyService().list(params)
    return PaginatedResponse[CompanyResponse].build(
        [CompanyResponse.model_validate(c) for c in result.items], result.total, result.page, result.page_size
    )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_VIEW)),
) -> CompanyResponse:
    return CompanyResponse.model_validate(await CompanyService().get(company_id))


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_UPDATE)),
) -> CompanyResponse:
    return CompanyResponse.model_validate(await CompanyService().update(company_id, payload, actor_id=actor.id))


@router.delete("/{company_id}", response_model=MessageResponse)
async def delete_company(
    company_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.PLACEMENTS_DELETE)),
) -> MessageResponse:
    await CompanyService().delete(company_id, actor_id=actor.id)
    return MessageResponse(message="Company deleted successfully.")
