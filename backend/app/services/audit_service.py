"""Business logic for recording audit trail entries."""
import uuid
from typing import Any

from fastapi.encoders import jsonable_encoder

from app.models.audit_log import AuditLog
from app.repositories.audit_log_repository import AuditLogRepository


class AuditService:
    def __init__(self) -> None:
        self.repository = AuditLogRepository()

    async def record(
        self,
        *,
        user_id: uuid.UUID | None,
        action: str,
        entity_type: str,
        entity_id: str | None,
        changes: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=jsonable_encoder(changes) if changes is not None else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return await self.repository.create(entry)
