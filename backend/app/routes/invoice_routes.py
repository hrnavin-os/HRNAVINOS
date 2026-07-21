"""HTTP routes for the Invoice module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.invoice_schema import InvoiceCreate, InvoiceResponse, InvoiceUpdate
from app.services.invoice_service import InvoiceService

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: InvoiceCreate,
    actor: User = Depends(RequirePermissions(Permissions.INVOICES_CREATE)),
) -> InvoiceResponse:
    return InvoiceResponse.model_validate(await InvoiceService().create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[InvoiceResponse])
async def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    student_id: uuid.UUID | None = None,
    actor: User = Depends(RequirePermissions(Permissions.INVOICES_VIEW)),
) -> PaginatedResponse[InvoiceResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await InvoiceService().list(params, student_id=student_id)
    return PaginatedResponse[InvoiceResponse].build(
        [InvoiceResponse.model_validate(i) for i in result.items], result.total, result.page, result.page_size
    )


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.INVOICES_VIEW)),
) -> InvoiceResponse:
    return InvoiceResponse.model_validate(await InvoiceService().get(invoice_id))


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceUpdate,
    actor: User = Depends(RequirePermissions(Permissions.INVOICES_UPDATE)),
) -> InvoiceResponse:
    return InvoiceResponse.model_validate(await InvoiceService().update(invoice_id, payload, actor_id=actor.id))
