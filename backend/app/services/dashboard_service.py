"""Business logic for the Dashboard module."""
from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard_schema import DashboardOverview


class DashboardService:
    def __init__(self) -> None:
        self.repository = DashboardRepository()

    async def get_overview(self) -> DashboardOverview:
        repo = self.repository
        return DashboardOverview(
            total_students=await repo.total_students(),
            active_students=await repo.active_students(),
            total_leads=await repo.total_leads(),
            new_leads=await repo.new_leads(),
            total_batches=await repo.total_batches(),
            ongoing_batches=await repo.ongoing_batches(),
            total_tutors=await repo.total_tutors(),
            pending_payments=await repo.pending_payments(),
            total_revenue=await repo.total_revenue(),
            open_tickets=await repo.open_tickets(),
            total_placements=await repo.total_placements(),
            students_placed=await repo.students_placed(),
        )
