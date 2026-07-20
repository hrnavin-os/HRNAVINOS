"""Read-only cross-entity aggregation queries for the Dashboard module."""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.enums import BatchStatus, LeadStatus, PaymentStatus, PlacementStatus
from app.models.lead import Lead
from app.models.payment import Payment
from app.models.placement import Placement
from app.models.student import Student
from app.models.ticket import Ticket
from app.models.enums import StudentStatus, TicketStatus
from app.models.tutor import Tutor


class DashboardRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _count(self, model, *conditions) -> int:
        stmt = select(func.count()).select_from(model).where(model.is_deleted.is_(False), *conditions)
        return self.db.execute(stmt).scalar_one()

    def total_students(self) -> int:
        return self._count(Student)

    def active_students(self) -> int:
        return self._count(Student, Student.status == StudentStatus.ACTIVE)

    def total_leads(self) -> int:
        return self._count(Lead)

    def new_leads(self) -> int:
        return self._count(Lead, Lead.status == LeadStatus.NEW)

    def total_batches(self) -> int:
        return self._count(Batch)

    def ongoing_batches(self) -> int:
        return self._count(Batch, Batch.status == BatchStatus.ONGOING)

    def total_tutors(self) -> int:
        return self._count(Tutor)

    def pending_payments(self) -> int:
        return self._count(Payment, Payment.status == PaymentStatus.PENDING)

    def total_revenue(self) -> Decimal:
        stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.VERIFIED, Payment.is_deleted.is_(False)
        )
        return Decimal(self.db.execute(stmt).scalar_one())

    def open_tickets(self) -> int:
        return self._count(Ticket, Ticket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]))

    def total_placements(self) -> int:
        return self._count(Placement)

    def students_placed(self) -> int:
        return self._count(Placement, Placement.status == PlacementStatus.JOINED)
