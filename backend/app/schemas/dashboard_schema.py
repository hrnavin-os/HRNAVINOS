"""Response DTOs for the Dashboard module."""
from decimal import Decimal

from pydantic import BaseModel


class DashboardOverview(BaseModel):
    total_students: int
    active_students: int
    total_leads: int
    new_leads: int
    total_batches: int
    ongoing_batches: int
    total_tutors: int
    pending_payments: int
    total_revenue: Decimal
    open_tickets: int
    total_placements: int
    students_placed: int


# ---------------------------------------------------------------------------
# The Super Admin dashboard: the institute's real funnel - Induction calls,
# Foundation leads through their stages, and the fees collected against them.
# ---------------------------------------------------------------------------


class MonthCount(BaseModel):
    """A figure this calendar month beside the same figure last month, so a
    tile can say which way it is moving without the page doing date maths."""

    total: int
    this_month: int
    last_month: int


class DashboardKpis(BaseModel):
    induction: MonthCount
    foundation: MonthCount
    # Induction entries that went on to fill the Foundation Form.
    moved_to_foundation: int
    batch_confirmed: int
    quit: int
    # Money actually received across every lead's payment collection.
    collected: Decimal
    # Fees still owed on leads that are in play (not Quit).
    outstanding: Decimal
    # Balances whose promised date has already gone by.
    overdue_count: int
    overdue_amount: Decimal


class StageCount(BaseModel):
    status: str
    count: int


class DailyCount(BaseModel):
    day: str
    induction: int
    foundation: int


class CourseRow(BaseModel):
    course: str
    leads: int
    confirmed: int


class DueRow(BaseModel):
    lead_id: str
    name: str
    label: str
    amount: Decimal
    due: str
    overdue: bool


class RecentLead(BaseModel):
    lead_id: str
    name: str
    course: str | None
    status: str
    created_at: str


class DashboardInsights(BaseModel):
    kpis: DashboardKpis
    pipeline: list[StageCount]
    trend: list[DailyCount]
    top_courses: list[CourseRow]
    upcoming_dues: list[DueRow]
    recent_leads: list[RecentLead]
