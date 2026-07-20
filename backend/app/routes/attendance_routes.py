"""HTTP routes for the Attendance module."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.attendance_schema import AttendanceBulkMark, AttendanceResponse, AttendanceUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.post("/mark", response_model=list[AttendanceResponse])
def mark_attendance(
    payload: AttendanceBulkMark,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ATTENDANCE_MARK)),
) -> list[AttendanceResponse]:
    records = AttendanceService(db).bulk_mark(payload, actor_id=actor.id)
    return [AttendanceResponse.model_validate(r) for r in records]


@router.get("", response_model=PaginatedResponse[AttendanceResponse])
def list_attendance(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "date",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    student_id: uuid.UUID | None = None,
    batch_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ATTENDANCE_VIEW)),
) -> PaginatedResponse[AttendanceResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = AttendanceService(db).list(params, student_id=student_id, batch_id=batch_id)
    return PaginatedResponse[AttendanceResponse].build(
        [AttendanceResponse.model_validate(a) for a in result.items], result.total, result.page, result.page_size
    )


@router.get("/batch/{batch_id}/date/{day}", response_model=list[AttendanceResponse])
def get_attendance_for_batch_day(
    batch_id: uuid.UUID,
    day: date,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ATTENDANCE_VIEW)),
) -> list[AttendanceResponse]:
    records = AttendanceService(db).list_by_batch_date(batch_id, day)
    return [AttendanceResponse.model_validate(r) for r in records]


@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    attendance_id: uuid.UUID,
    payload: AttendanceUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ATTENDANCE_UPDATE)),
) -> AttendanceResponse:
    return AttendanceResponse.model_validate(AttendanceService(db).update(attendance_id, payload, actor_id=actor.id))
