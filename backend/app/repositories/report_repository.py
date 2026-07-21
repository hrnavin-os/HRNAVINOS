"""Data access for persisted Report snapshots (see app/models/report.py)."""
from app.models.report import Report
from app.repositories.base_repository import BaseRepository


class ReportRepository(BaseRepository[Report]):
    model = Report

    def __init__(self) -> None:
        super().__init__(Report)
