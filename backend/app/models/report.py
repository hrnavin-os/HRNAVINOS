"""Report document — a persisted snapshot of a generated report, so past
report runs stay available for reference even as underlying data changes.

Live/ephemeral aggregation (for dashboards that always want current data)
is still available via GET /reports/{type}; POST /reports/generate computes
the same aggregation and additionally saves one of these."""
import uuid
from datetime import datetime
from typing import Any

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.enums import ReportType


class Report(BaseDocument):
    report_type: ReportType
    generated_by: uuid.UUID | None = None
    generated_at: datetime
    parameters: dict[str, Any] = Field(default_factory=dict)
    data: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "reports"
        indexes = [
            IndexModel([("report_type", 1)]),
            IndexModel([("generated_at", -1)]),
        ]

    def __repr__(self) -> str:
        return f"<Report {self.report_type} generated_at={self.generated_at}>"
