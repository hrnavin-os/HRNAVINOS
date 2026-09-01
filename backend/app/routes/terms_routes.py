"""HTTP routes for the Terms & Conditions register."""
import uuid

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import RequirePermissions, get_actor_scope
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.terms_schema import (
    TermsDocumentResponse,
    TermsDocumentUpdate,
    TermsFilter,
    TermsStatsResponse,
    TermsStudentResponse,
)
from app.services.terms_service import TermsService

router = APIRouter(prefix="/terms", tags=["Terms & Conditions"])


@router.get("/document", response_model=TermsDocumentResponse)
async def get_terms_document(
    actor: User = Depends(RequirePermissions(Permissions.TERMS_VIEW)),
) -> TermsDocumentResponse:
    service = TermsService()
    return await service.document_response(await service.get_document())


@router.put("/document", response_model=TermsDocumentResponse)
async def update_terms_document(
    payload: TermsDocumentUpdate,
    # A stricter permission than signing: this rewrites what everyone is
    # agreeing to, which is not the same job as ticking off who agreed.
    actor: User = Depends(RequirePermissions(Permissions.TERMS_CONFIGURE)),
) -> TermsDocumentResponse:
    service = TermsService()
    return await service.document_response(await service.update_document(payload, actor_id=actor.id))


# Declared before /students/{entry_id}/... would be matched, and kept distinct
# from the induction board's own list endpoint: that one is tabbed by induction
# status and defaults to the pending queue, while the register deliberately
# covers everyone who ever came through induction.
@router.get("/students", response_model=PaginatedResponse[TermsStudentResponse])
async def list_terms_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    # Which tab: the whole roll, or one side of the signed split.
    filter: TermsFilter = "all",
    sort_by: str = "registration_date",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.TERMS_VIEW)),
) -> PaginatedResponse[TermsStudentResponse]:
    # A Section Admin's scope comes from their role, exactly as on the boards,
    # so there is no query param that could widen it.
    scope = await get_actor_scope(actor)
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    return await TermsService().list_students(params, terms_filter=filter, section=scope)


@router.get("/students/stats", response_model=TermsStatsResponse)
async def terms_stats(
    actor: User = Depends(RequirePermissions(Permissions.TERMS_VIEW)),
) -> TermsStatsResponse:
    scope = await get_actor_scope(actor)
    return await TermsService().stats(section=scope)


@router.post("/students/{entry_id}/sign", response_model=TermsStudentResponse)
async def mark_signed(
    entry_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.TERMS_SIGN)),
) -> TermsStudentResponse:
    service = TermsService()
    return service.to_response(await service.set_signed(entry_id, signed=True, actor_id=actor.id))


@router.delete("/students/{entry_id}/sign", response_model=TermsStudentResponse)
async def mark_not_signed(
    entry_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.TERMS_SIGN)),
) -> TermsStudentResponse:
    """Undo. A tick on the wrong row has to be reversible by the person who
    made it, or the register becomes a list of mistakes nobody can correct."""
    service = TermsService()
    return service.to_response(await service.set_signed(entry_id, signed=False, actor_id=actor.id))
