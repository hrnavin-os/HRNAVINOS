"""Business logic for the Reports module.

Live aggregation methods (`revenue_report`, etc.) compute current data on
demand for dashboards. `generate_and_save` runs the same aggregation and
additionally persists a Report snapshot (see app/models/report.py) so past
report runs stay available for reference.
"""
import uuid
from datetime import datetime, timezone

from app.exceptions.base import NotFoundError
from app.models.enums import ReportType
from app.models.report import Report
from app.repositories.report_aggregation_repository import ReportAggregationRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.report_schema import (
    AdmissionsReportItem,
    AttendanceReportItem,
    LeadConversionReportItem,
    RevenueReportItem,
)


class ReportService:
    def __init__(self) -> None:
        self.aggregation = ReportAggregationRepository()
        self.reports = ReportRepository()

    async def revenue_report(self) -> list[RevenueReportItem]:
        return [RevenueReportItem(**row) for row in await self.aggregation.revenue_by_month()]

    async def admissions_report(self) -> list[AdmissionsReportItem]:
        return [AdmissionsReportItem(**row) for row in await self.aggregation.admissions_by_course()]

    async def attendance_report(self) -> list[AttendanceReportItem]:
        return [AttendanceReportItem(**row) for row in await self.aggregation.attendance_by_batch()]

    async def lead_conversion_report(self) -> list[LeadConversionReportItem]:
        return [LeadConversionReportItem(**row) for row in await self.aggregation.lead_conversion()]

    async def generate_and_save(self, report_type: ReportType, *, actor_id: uuid.UUID | None) -> Report:
        generators = {
            ReportType.REVENUE: self.aggregation.revenue_by_month,
            ReportType.ADMISSIONS: self.aggregation.admissions_by_course,
            ReportType.ATTENDANCE: self.aggregation.attendance_by_batch,
            ReportType.LEAD_CONVERSION: self.aggregation.lead_conversion,
        }
        data = await generators[report_type]()
        report = Report(
            report_type=report_type,
            generated_by=actor_id,
            generated_at=datetime.now(timezone.utc),
            data=[_jsonable(row) for row in data],
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.reports.create(report)
        return report

    async def list_saved(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.reports.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def get_saved(self, report_id: uuid.UUID) -> Report:
        report = await self.reports.get_by_id(report_id)
        if not report:
            raise NotFoundError("Report not found.")
        return report


def _jsonable(row: dict) -> dict:
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(row)
