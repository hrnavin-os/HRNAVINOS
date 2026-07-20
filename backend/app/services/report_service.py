"""Business logic for the Reports module."""
from sqlalchemy.orm import Session

from app.repositories.report_repository import ReportRepository
from app.schemas.report_schema import (
    AdmissionsReportItem,
    AttendanceReportItem,
    LeadConversionReportItem,
    RevenueReportItem,
)


class ReportService:
    def __init__(self, db: Session) -> None:
        self.repository = ReportRepository(db)

    def revenue_report(self) -> list[RevenueReportItem]:
        return [RevenueReportItem(**row) for row in self.repository.revenue_by_month()]

    def admissions_report(self) -> list[AdmissionsReportItem]:
        return [AdmissionsReportItem(**row) for row in self.repository.admissions_by_course()]

    def attendance_report(self) -> list[AttendanceReportItem]:
        return [AttendanceReportItem(**row) for row in self.repository.attendance_by_batch()]

    def lead_conversion_report(self) -> list[LeadConversionReportItem]:
        return [LeadConversionReportItem(**row) for row in self.repository.lead_conversion()]
