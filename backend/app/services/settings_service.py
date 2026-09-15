"""Business logic for the (singleton) app Settings module."""
import uuid

from app.database.base import utcnow
from app.exceptions.base import BadRequestError
from app.models.batch_allocation import BatchAllocation
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.settings import AppSettings
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings_schema import RESET_LEADS_CONFIRMATION, SettingsUpdate
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

    async def reset_leads(self, confirmation: str, *, actor_id: uuid.UUID | None) -> dict:
        """Clears both lead pipelines: the Induction board and the Foundation board.

        Soft-delete, not a drop, because that is what every other delete in
        this system does and it is the difference between a reset and an
        unrecoverable mistake. It is still a real reset from the outside: the
        duplicate-submission lookups filter on is_deleted, so the same phone
        number can submit either form again afterwards and come through as a
        new entry rather than merging into the old one.

        Three collections, because leaving any of them would leave the system
        describing something that is no longer there:

        - Foundation leads.
        - Batch allocations, whose lead_id is required and which mean nothing
          without the lead they allocate.
        - Induction entries, every one of them - pending, moved to Foundation
          or otherwise.

        Deliberately does NOT touch students, admissions or invoices. Those are
        enrolment records for people who actually joined; they descend from a
        lead but they are not one, and clearing the pipeline is not a reason to
        erase somebody's enrolment.
        """
        if confirmation != RESET_LEADS_CONFIRMATION:
            raise BadRequestError(
                f'Confirmation phrase does not match. Send exactly "{RESET_LEADS_CONFIRMATION}" to confirm.'
            )

        deleted = {"is_deleted": True, "deleted_at": utcnow(), "updated_at": utcnow(), "updated_by": actor_id}

        leads = await Lead.find({"is_deleted": False}).update({"$set": deleted})
        allocations = await BatchAllocation.find({"is_deleted": False}).update({"$set": deleted})
        induction = await InductionEntry.find({"is_deleted": False}).update({"$set": deleted})

        counts = {
            "leads_deleted": leads.modified_count,
            "allocations_deleted": allocations.modified_count,
            "induction_entries_deleted": induction.modified_count,
        }
        await self.audit.record(
            user_id=actor_id, action="RESET", entity_type="Lead", entity_id=None, changes=counts
        )
        return counts
