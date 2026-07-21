"""Request/response DTOs for the Reports module."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.models.enums import ReportType


class ReportGenerateRequest(BaseModel):
    report_type: ReportType


class ReportSnapshotResponse(BaseModel):
    id: uuid.UUID
    report_type: ReportType
    generated_by: uuid.UUID | None
    generated_at: datetime
    parameters: dict[str, Any]
    data: list[dict[str, Any]]

    model_config = {"from_attributes": True}


class RevenueReportItem(BaseModel):
    month: str
    total_collected: Decimal
    payment_count: int


class AdmissionsReportItem(BaseModel):
    course_name: str
    admissions_count: int
    total_revenue: Decimal


class AttendanceReportItem(BaseModel):
    batch_name: str
    total_sessions: int
    present_count: int
    absent_count: int
    attendance_rate: float


class LeadConversionReportItem(BaseModel):
    status: str
    count: int
