"""HTTP routes for the induction Attendance board.

Distinct from attendance_routes.py, which is the classroom register a Tutor
marks against a batch. This one is the induction programme's four markers -
terms signed, poll selection, success meet, foundation class - against the
induction roll.
"""
import uuid

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import RequirePermissions, get_actor_scope
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.attendance_board_schema import (
    AttendanceStatsResponse,
    AttendanceStudentResponse,
    MarkerKey,
    MarkerState,
    MarkUpdate,
    TermsDocumentResponse,
    TermsDocumentUpdate,
)
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.attendance_board_service import AttendanceBoardService

router = APIRouter(prefix="/induction-attendance", tags=["Induction Attendance"])


@router.get("/terms-document", response_model=TermsDocumentResponse)
async def get_terms_document(
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> TermsDocumentResponse:
    service = AttendanceBoardService()
    return await service.document_response(await service.get_document())


@router.put("/terms-document", response_model=TermsDocumentResponse)
async def update_terms_document(
    payload: TermsDocumentUpdate,
    # A stricter permission than marking: this rewrites what everyone is
    # agreeing to, which is not the same job as ticking off who agreed.
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_CONFIGURE)),
) -> TermsDocumentResponse:
    service = AttendanceBoardService()
    return await service.document_response(await service.update_document(payload, actor_id=actor.id))


# Kept distinct from the induction board's own list endpoint: that one is
# tabbed by induction status and defaults to the pending queue, while this
# board deliberately covers everyone who ever came through induction.
@router.get("/students", response_model=PaginatedResponse[AttendanceStudentResponse])
async def list_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    # Which tab, and which side of it.
    marker: MarkerKey = "terms",
    state: MarkerState = "all",
    # The filter row. Batch is derived from registration_date rather than
    # stored, so the service turns it back into the month it stands for.
    section: str | None = None,
    batch: str | None = None,
    sort_by: str = "registration_date",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> PaginatedResponse[AttendanceStudentResponse]:
    # A Section Admin's scope comes from their role, exactly as on the boards,
    # so there is no query param that could widen it.
    scope = await get_actor_scope(actor)
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    return await AttendanceBoardService().list_students(
        params, marker_key=marker, state=state, section=scope or section, batch=batch
    )


@router.get("/stats", response_model=AttendanceStatsResponse)
async def stats(
    # The same filters the list takes, so the tab counts describe the rows
    # under them rather than the whole roll.
    section: str | None = None,
    batch: str | None = None,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> AttendanceStatsResponse:
    scope = await get_actor_scope(actor)
    return await AttendanceBoardService().stats(section=scope or section, batch=batch)


@router.get("/filter-options")
async def filter_options(
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> dict:
    """The sections and batches present on the roll, so the filter row only
    offers values that actually match something. Scoped like the list is, or a
    Section Admin's filter would offer sections only other people can see."""
    scope = await get_actor_scope(actor)
    return await AttendanceBoardService().filter_options(section=scope)


@router.put("/students/{entry_id}/marks/{marker}", response_model=AttendanceStudentResponse)
async def set_mark(
    entry_id: uuid.UUID,
    marker: MarkerKey,
    payload: MarkUpdate,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_MARK)),
) -> AttendanceStudentResponse:
    """Sets one marker on one student.

    `marked: null` clears the tick rather than setting "no" - which is how a
    correction on the foundation class is undone, handing the row back to what
    the Foundation link says.
    """
    service = AttendanceBoardService()
    entry = await service.set_mark(entry_id, marker, marked=payload.marked, actor_id=actor.id)
    return service.to_response(entry)
