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
