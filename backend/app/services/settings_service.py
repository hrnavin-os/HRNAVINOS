"""Business logic for the (singleton) app Settings module."""
import uuid

from app.models.settings import AppSettings
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings_schema import SettingsUpdate
from app.services.audit_service import AuditService


class SettingsService:
    def __init__(self) -> None:
        self.settings = SettingsRepository()
        self.audit = AuditService()

    async def get(self) -> AppSettings:
        return await self.settings.get_or_create()

    async def update(self, data: SettingsUpdate, *, actor_id: uuid.UUID | None) -> AppSettings:
        settings = await self.settings.get_or_create()
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.settings.update(settings, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Settings", entity_id=str(settings.id), changes=update_data
        )
        return settings
