"""Data access for AuditLog documents."""
from app.models.audit_log import AuditLog
from app.repositories.base_repository import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog

    def __init__(self) -> None:
        super().__init__(AuditLog)
