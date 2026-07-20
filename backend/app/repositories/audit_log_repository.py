"""Data access for AuditLog entities."""
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.repositories.base_repository import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    model = AuditLog

    def __init__(self, db: Session) -> None:
        super().__init__(db, AuditLog)
