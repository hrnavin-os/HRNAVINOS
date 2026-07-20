"""Business logic for the Dashboard module."""
from sqlalchemy.orm import Session

from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard_schema import DashboardOverview


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.repository = DashboardRepository(db)

    def get_overview(self) -> DashboardOverview:
        repo = self.repository
        return DashboardOverview(
            total_students=repo.total_students(),
            active_students=repo.active_students(),
            total_leads=repo.total_leads(),
            new_leads=repo.new_leads(),
            total_batches=repo.total_batches(),
            ongoing_batches=repo.ongoing_batches(),
            total_tutors=repo.total_tutors(),
            pending_payments=repo.pending_payments(),
            total_revenue=repo.total_revenue(),
            open_tickets=repo.open_tickets(),
            total_placements=repo.total_placements(),
            students_placed=repo.students_placed(),
        )
