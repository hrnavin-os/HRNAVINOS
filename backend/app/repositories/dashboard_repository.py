"""Read-only cross-collection aggregation queries for the Dashboard module."""
from decimal import Decimal

from app.models.batch import Batch
from app.models.enums import BatchStatus, LeadStatus, PaymentStatus, PlacementStatus, StudentStatus, TicketStatus
from app.models.lead import Lead
from app.models.payment import Payment
from app.models.placement import Placement
from app.models.student import Student
from app.models.ticket import Ticket
from app.models.tutor import Tutor


class DashboardRepository:
    async def total_students(self) -> int:
        return await Student.find({"is_deleted": False}).count()

    async def active_students(self) -> int:
        return await Student.find({"is_deleted": False, "status": StudentStatus.ACTIVE}).count()

    async def total_leads(self) -> int:
        return await Lead.find({"is_deleted": False}).count()

    async def new_leads(self) -> int:
        return await Lead.find({"is_deleted": False, "status": LeadStatus.NEW_LEAD}).count()

    async def total_batches(self) -> int:
        return await Batch.find({"is_deleted": False}).count()

    async def ongoing_batches(self) -> int:
        return await Batch.find({"is_deleted": False, "status": BatchStatus.ONGOING}).count()

    async def total_tutors(self) -> int:
        return await Tutor.find({"is_deleted": False}).count()

    async def pending_payments(self) -> int:
        return await Payment.find({"is_deleted": False, "status": PaymentStatus.PENDING}).count()

    async def total_revenue(self) -> Decimal:
        pipeline = [
            {"$match": {"is_deleted": False, "status": PaymentStatus.VERIFIED.value}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        result = await Payment.get_motor_collection().aggregate(pipeline).to_list(length=1)
        if not result:
            return Decimal("0")
        total = result[0]["total"]
        return total.to_decimal() if hasattr(total, "to_decimal") else Decimal(str(total))

    async def open_tickets(self) -> int:
        return await Ticket.find(
            {"is_deleted": False, "status": {"$in": [TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value]}}
        ).count()

    async def total_placements(self) -> int:
        return await Placement.find({"is_deleted": False}).count()

    async def students_placed(self) -> int:
        return await Placement.find({"is_deleted": False, "status": PlacementStatus.JOINED}).count()
