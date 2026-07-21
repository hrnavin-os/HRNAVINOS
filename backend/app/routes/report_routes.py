"""HTTP routes for the Reports module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.report_schema import (
    AdmissionsReportItem,
    AttendanceReportItem,
    LeadConversionReportItem,
    ReportGenerateRequest,
    ReportSnapshotResponse,
    RevenueReportItem,
)
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/revenue", response_model=list[RevenueReportItem])
async def revenue_report(
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> list[RevenueReportItem]:
    return await ReportService().revenue_report()


@router.get("/admissions", response_model=list[AdmissionsReportItem])
async def admissions_report(
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> list[AdmissionsReportItem]:
    return await ReportService().admissions_report()


@router.get("/attendance", response_model=list[AttendanceReportItem])
async def attendance_report(
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> list[AttendanceReportItem]:
    return await ReportService().attendance_report()


@router.get("/lead-conversion", response_model=list[LeadConversionReportItem])
async def lead_conversion_report(
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> list[LeadConversionReportItem]:
    return await ReportService().lead_conversion_report()


@router.post("/generate", response_model=ReportSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    payload: ReportGenerateRequest,
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> ReportSnapshotResponse:
    report = await ReportService().generate_and_save(payload.report_type, actor_id=actor.id)
    return ReportSnapshotResponse.model_validate(report)


@router.get("/saved", response_model=PaginatedResponse[ReportSnapshotResponse])
async def list_saved_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "generated_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> PaginatedResponse[ReportSnapshotResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = await ReportService().list_saved(params)
    return PaginatedResponse[ReportSnapshotResponse].build(
        [ReportSnapshotResponse.model_validate(r) for r in result.items], result.total, result.page, result.page_size
    )


@router.get("/saved/{report_id}", response_model=ReportSnapshotResponse)
async def get_saved_report(
    report_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW)),
) -> ReportSnapshotResponse:
    return ReportSnapshotResponse.model_validate(await ReportService().get_saved(report_id))
