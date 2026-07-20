"""Response DTOs for the Reports module."""
from decimal import Decimal

from pydantic import BaseModel


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
