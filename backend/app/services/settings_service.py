"""Business logic for the (singleton) app Settings module."""
import uuid

from app.database.base import utcnow
from app.exceptions.base import BadRequestError
from app.models.batch_allocation import BatchAllocation
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.settings import AppSettings
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings_schema import RESET_LEADS_CONFIRMATIONS, ResetScope, SettingsUpdate
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

    async def reset_leads(
        self,
        confirmation: str,
        *,
        scope: ResetScope = ResetScope.ALL,
        actor_id: uuid.UUID | None,
    ) -> dict:
        """Clears one lead pipeline, or both.

        Soft-delete, not a drop, because that is what every other delete in
        this system does and it is the difference between a reset and an
        unrecoverable mistake. It is still a real reset from the outside: the
        duplicate-submission lookups filter on is_deleted, so the same phone
        number can submit the cleared form again afterwards and come through as
        a new entry rather than merging into the old one.

        What each scope covers:

        - FOUNDATION: Foundation leads, and the batch allocations whose lead_id
          is required and which mean nothing without the lead they allocate.
          The Induction board is left standing.
        - INDUCTION: every induction entry - pending, moved to Foundation or
          otherwise. Foundation leads are left standing, including ones that
          came from an entry being deleted here: a lead whose induction record
          has gone reads as a lead nobody took a call for, which is a state the
          board already has to handle for leads created by hand.
        - ALL: both of the above, which is what this did before the scopes.

        The one repair, and the reason this isn't two independent deletes:
        clearing Foundation on its own strands every induction entry that had
        moved there. Its status is derived from foundation_lead_id, so it still
        reads as "moved to Foundation" while the lead it moved to is gone - and
        the active Induction board excludes converted entries, so the record
        would sit on neither board. Those entries are handed back to Induction
        instead, which is where a person whose Foundation lead no longer exists
        actually is. (ALL doesn't need it: the entries are deleted too.)

        Deliberately does NOT touch students, admissions or invoices in any
        scope. Those are enrolment records for people who actually joined; they
        descend from a lead but they are not one, and clearing the pipeline is
        not a reason to erase somebody's enrolment.
        """
        expected = RESET_LEADS_CONFIRMATIONS[scope]
        if confirmation != expected:
            raise BadRequestError(
                f'Confirmation phrase does not match. Send exactly "{expected}" to confirm.'
            )

        stamp = {"updated_at": utcnow(), "updated_by": actor_id}
        deleted = {"is_deleted": True, "deleted_at": utcnow(), **stamp}
        counts = {
            "leads_deleted": 0,
            "allocations_deleted": 0,
            "induction_entries_deleted": 0,
            "induction_links_cleared": 0,
        }

        if scope in (ResetScope.FOUNDATION, ResetScope.ALL):
            leads = await Lead.find({"is_deleted": False}).update({"$set": deleted})
            allocations = await BatchAllocation.find({"is_deleted": False}).update({"$set": deleted})
            counts["leads_deleted"] = leads.modified_count
            counts["allocations_deleted"] = allocations.modified_count

        if scope in (ResetScope.INDUCTION, ResetScope.ALL):
            induction = await InductionEntry.find({"is_deleted": False}).update({"$set": deleted})
            counts["induction_entries_deleted"] = induction.modified_count

        if scope is ResetScope.FOUNDATION:
            # Ordered after the lead delete on purpose: these are the entries
            # whose lead was just removed, and the board is what they come back
            # to.
            returned = await InductionEntry.find(
                {"is_deleted": False, "foundation_lead_id": {"$ne": None}}
            ).update({"$set": {"foundation_lead_id": None, "converted_at": None, **stamp}})
            counts["induction_links_cleared"] = returned.modified_count

        await self.audit.record(
            user_id=actor_id,
            action="RESET",
            entity_type="Lead",
            entity_id=None,
            changes={"scope": scope.value, **counts},
        )
        return counts
