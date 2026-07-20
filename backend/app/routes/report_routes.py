"""HTTP routes for the Reports module."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.report_schema import (
    AdmissionsReportItem,
    AttendanceReportItem,
    LeadConversionReportItem,
    RevenueReportItem,
)
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/revenue", response_model=list[RevenueReportItem])
def revenue_report(
    db: Session = Depends(get_db), actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW))
) -> list[RevenueReportItem]:
    return ReportService(db).revenue_report()


@router.get("/admissions", response_model=list[AdmissionsReportItem])
def admissions_report(
    db: Session = Depends(get_db), actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW))
) -> list[AdmissionsReportItem]:
    return ReportService(db).admissions_report()


@router.get("/attendance", response_model=list[AttendanceReportItem])
def attendance_report(
    db: Session = Depends(get_db), actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW))
) -> list[AttendanceReportItem]:
    return ReportService(db).attendance_report()


@router.get("/lead-conversion", response_model=list[LeadConversionReportItem])
def lead_conversion_report(
    db: Session = Depends(get_db), actor: User = Depends(RequirePermissions(Permissions.REPORTS_VIEW))
) -> list[LeadConversionReportItem]:
    return ReportService(db).lead_conversion_report()
