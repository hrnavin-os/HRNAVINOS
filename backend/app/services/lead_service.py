"""Business logic for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import List

from fastapi import UploadFile

from app.database.base import utcnow
from app.exceptions.base import BadRequestError, ForbiddenError, NotFoundError
from app.models.enums import (
    InstallmentPaymentMode,
    LeadSource,
    LeadStatus,
    NotificationCategory,
    NotificationType,
    PaymentMethod,
)
from app.models.lead import FollowUpEntry, Lead, RemarkEntry
from app.models.notification import Notification
from app.permissions.permission_codes import Permissions
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.permission_repository import PermissionRepository
from app.repositories.program_repository import ProgramRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.lead_schema import (
    FollowUpEntryResponse,
    LeadAssign,
    LeadCreate,
    LeadPlanAssign,
    LeadRemarkCreate,
    LeadRemarkResponse,
    LeadRemarkUpdate,
    LeadResponse,
    LeadStatsResponse,
    LeadTimelineEntryResponse,
    LeadUpdate,
    PaymentInstallmentResponse,
)
from app.services.audit_service import AuditService
from app.services.foundation_form_pricing import build_installments, build_payment_expected_summary
from app.services.reminder_service import ReminderService
from app.services.storage_service import StorageService
from app.utils.phone import normalize_phone


class LeadService:
    def __init__(self) -> None:
        self.leads = LeadRepository()
        self.users = UserRepository()
        self.audit = AuditService()
        self.audit_logs = AuditLogRepository()
        self.storage = StorageService()
        self.foundation_form_config = FoundationFormConfigRepository()
        self.programs = ProgramRepository()
        self.roles = RoleRepository()
        self.notifications = NotificationRepository()
        self.permissions = PermissionRepository()

    async def to_response(self, lead: Lead) -> LeadResponse:
        assignee = await self.users.get_by_id(lead.assigned_to) if lead.assigned_to else None
        assigned_to_name = f"{assignee.first_name} {assignee.last_name}".strip() if assignee else None
        return LeadResponse(
            id=lead.id,
            name=lead.name,
            email=lead.email,
            phone=lead.phone,
            induction_entry_id=lead.induction_entry_id,
            induction_matched=lead.induction_entry_id is not None,
            source=lead.source,
            status=lead.status,
            course_interest=lead.course_interest,
            batch_preference=lead.batch_preference,
            payment_expected=lead.payment_expected,
            notes=lead.notes,
            assigned_to=lead.assigned_to,
            assigned_to_name=assigned_to_name,
            follow_up_at=lead.follow_up_at,
            follow_up_history=[
                FollowUpEntryResponse(scheduled_at=entry.scheduled_at, created_at=entry.created_at)
                for entry in sorted(lead.follow_up_history, key=lambda e: e.created_at, reverse=True)
            ],
            payment_image_url=lead.payment_image_url,
            paid_amount=lead.paid_amount,
            payment_mode=lead.payment_mode,
            reviewed=lead.reviewed,
            raw_form_data=lead.raw_form_data,
            program_interest=lead.program_interest,
            payment_plan=lead.payment_plan,
            section=lead.section,
            remarks=lead.remarks,
            remark_entries=self._remark_responses(lead),
            payment_option=lead.payment_option,
            payment_call_remarks=lead.payment_call_remarks,
            paying_amount=lead.paying_amount,
            qr_code=lead.qr_code,
            batch_number=lead.batch_number,
            group_assigned_at=lead.group_assigned_at,
            lost_reason=lead.lost_reason,
            lost_at=lead.lost_at,
            installments=[
                PaymentInstallmentResponse(
                    label=installment.label,
                    amount=installment.amount,
                    mode=installment.mode,
                    transaction_id=installment.transaction_id,
                    upi_id=installment.upi_id,
                    proof_url=installment.proof_url,
                    scheduled_at=installment.scheduled_at,
                    paid=installment.paid,
                    paid_at=installment.paid_at,
                )
                for installment in lead.installments
            ],
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )

    async def create(self, data: LeadCreate, *, actor_id: uuid.UUID | None, scope: str | None = None) -> Lead:
        if data.assigned_to and not await self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        lead = Lead(
            **data.model_dump(),
            # Set here too, not just on the public form, so a hand-keyed lead
            # still participates in mobile-number matching - otherwise a later
            # Foundation Form submission would create a duplicate beside it.
            phone_normalized=normalize_phone(data.phone),
            created_by=actor_id,
            updated_by=actor_id,
        )
        # A section-scoped actor can only ever create leads in their own
        # section, regardless of what (if anything) the client sent.
        if scope is not None:
            lead.section = scope
        await self.leads.create(lead)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Lead", entity_id=str(lead.id))
        return lead

    async def get(self, lead_id: uuid.UUID, *, scope: str | None = None) -> Lead:
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        if scope is not None and lead.section != scope:
            raise ForbiddenError("This lead belongs to a different section.")
        return lead

    async def list(
        self,
        params: PaginationParams,
        *,
        status: str | None = None,
        assigned_to: uuid.UUID | None = None,
        source: LeadSource | None = None,
        section: str | None = None,
        section_scope: str | None = None,
        course_interest: str | None = None,
        payment_plan: str | None = None,
        payment_call_remarks: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        induction_matched: bool | None = None,
    ) -> PaginatedResponse:
        # See LeadRepository.count_total for why this isn't a plain "reviewed": True.
        filters = {"reviewed": {"$ne": False}}
        # Separates leads that came across from an induction call from those
        # whose number never appeared in Induction. `$eq: None` rather than a
        # bare None so it also matches leads created before the field existed,
        # where the key is absent rather than null.
        if induction_matched is not None:
            filters["induction_entry_id"] = {"$ne": None} if induction_matched else {"$eq": None}
        if status:
            filters["status"] = status
        if assigned_to:
            filters["assigned_to"] = assigned_to
        if source:
            filters["source"] = source
        # A section-scoped actor's results are always forced to their own
        # section, regardless of any section filter the client passed.
        if section_scope is not None:
            filters["section"] = section_scope
        elif section:
            filters["section"] = section
        if course_interest:
            filters["course_interest"] = course_interest
        # The two manual payment columns on the board. Both are stored on the
        # lead as plain enum values, so filtering is an equality match - a lead
        # with neither set simply never matches, which is what "show me the
        # two-shot leads" means.
        if payment_plan:
            filters["payment_plan"] = payment_plan
        if payment_call_remarks:
            filters["payment_call_remarks"] = payment_call_remarks
        if date_from or date_to:
            created_range: dict[str, datetime] = {}
            if date_from:
                created_range["$gte"] = datetime.combine(date_from, time.min)
            if date_to:
                created_range["$lte"] = datetime.combine(date_to, time.max)
            filters["created_at"] = created_range
        # Second place the reminder sweep is driven from, besides the
        # notification poll. That poll only happens while the bell is on
        # screen, which is a Section Admin on the Foundation board - so a
        # follow-up set by an Admin could sit due indefinitely with nobody in
        # that particular seat to trigger it. Anyone opening the board runs it
        # now. Throttled per worker, so the extra call sites cost nothing.
        await ReminderService().sweep_if_due()

        items, total = await self.leads.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "phone", "email", "course_interest"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def list_pending_review(self) -> List[Lead]:
        return await self.leads.list_pending_review()

    async def review(
        self, lead_id: uuid.UUID, data: LeadUpdate, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        """Apply the Pre Sales staffer's corrections to a Form Check submission
        and admit it into the normal pipeline (visible in Leads / New Lead)."""
        lead = await self.get(lead_id, scope=scope)
        if data.status is not None:
            self._validate_stage_transition(lead, data.status)
        update_data = data.model_dump(exclude_unset=True)
        update_data["reviewed"] = True
        update_data["updated_by"] = actor_id
        if update_data.get("follow_up_at"):
            lead.follow_up_history.insert(
                0, FollowUpEntry(scheduled_at=update_data["follow_up_at"], created_by=actor_id)
            )
        await self.leads.update(lead, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Lead", entity_id=str(lead.id), changes=update_data
        )
        return lead

    async def stats(self, *, section: str | None = None) -> LeadStatsResponse:
        total = await self.leads.count_total(section=section)
        by_status = await self.leads.count_by_status(section=section)
        # The section breakdown only makes sense for the unscoped "All
        # Sections" view - once a caller is already looking at one section's
        # stage counts, there's nothing else to break down by section.
        by_section = await self.leads.count_by_section_all() if section is None else {}
        return LeadStatsResponse(
            total=total,
            by_status=by_status,
            by_section=by_section,
            by_induction_match=await self.leads.count_by_induction_match(),
        )

    async def course_options(self) -> List[str]:
        return await self.leads.distinct_course_interests()

    async def course_catalog(self) -> List[str]:
        """The courses a lead can be put on: the active programs, and nothing
        else.

        Not the same list as course_options, which is the distinct values in
        use and is right for a filter - a filter offering a course nobody is on
        would return nothing. Setting one is the opposite case: the whole point
        is to be able to put somebody on a course nobody is on yet.

        Deliberately not padded with values already in the data. Programs
        Management is where the courses are decided, and a dropdown that also
        offered whatever happens to be recorded would quietly re-admit the junk
        from imports and test rows - the list would grow by being wrong rather
        than by anybody adding a course. A lead already carrying a retired
        value still shows it in the cell; it just isn't a thing you can pick.
        """
        return [program.name for program in await self.programs.list_active()]

    def _validate_stage_transition(self, lead: Lead, new: LeadStatus) -> None:
        """Financial Approval and Batch Confirmation are pipeline gates: each
        can only be entered from the stage directly before it, and only once
        the money backing it has actually arrived. Once a lead reaches Batch
        Confirmation it can't move back (Lost stays reachable as an exit)."""
        current = lead.status
        if current == new:
            return
        if current == LeadStatus.BATCH_CONFIRMATION and new != LeadStatus.LOST:
            raise BadRequestError("A lead in Batch Confirmation can't be moved back to an earlier stage.")
        if new == LeadStatus.BATCH_CONFIRMATION and current != LeadStatus.FINANCIAL_APPROVAL:
            raise BadRequestError("A lead can only move to Batch Confirmation from Financial Approval.")
        if new == LeadStatus.FINANCIAL_APPROVAL:
            if current != LeadStatus.PRE_SCREENING:
                raise BadRequestError("A lead can only move to Financial Approval from Pre Screening.")
            self._require_first_payment(lead)

    def _require_first_payment(self, lead: Lead) -> None:
        """Financial Approval means "Finance has seen money" - so at least the
        first payment must be on record before the stage can be entered.

        Deliberately only the *first* payment, not the full fee: EMI and
        two-shot leads are meant to progress mid-plan. Clearing the whole
        balance is a separate, later gate - BatchConfirmationService's
        `fees_cleared` readiness check, which blocks confirming a batch until
        every allocated lead has paid in full.

        Mirrors the two payment representations that `_is_fully_paid` in that
        service also has to handle: a structured installment plan, or the
        older single `paid_amount` field on manually-created leads.
        """
        if lead.installments:
            if not lead.installments[0].paid:
                raise BadRequestError(
                    "The first installment must be recorded as paid (amount, mode, reference and proof) "
                    "before this lead can move to Financial Approval."
                )
            return
        if lead.paid_amount is None or lead.paid_amount <= 0:
            raise BadRequestError(
                "Record a payment before moving this lead to Financial Approval - either assign a payment "
                "plan and collect its first installment, or set the amount received."
            )

    async def update(
        self, lead_id: uuid.UUID, data: LeadUpdate, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        if data.status is not None:
            self._validate_stage_transition(lead, data.status)
        update_data = data.model_dump(exclude_unset=True)
        # Correcting the number moves the match key with it, so the lead keeps
        # matching on the number it actually has.
        if update_data.get("phone"):
            update_data["phone_normalized"] = normalize_phone(update_data["phone"])
        update_data["updated_by"] = actor_id
        # Losing a lead has to say why - otherwise the Lost list records that
        # it happened with no way to tell churn reasons apart afterwards.
        if data.status == LeadStatus.LOST and lead.status != LeadStatus.LOST:
            reason = (data.lost_reason or "").strip()
            if not reason:
                raise BadRequestError("Give a reason when marking a lead as Lost.")
            update_data["lost_reason"] = reason
            update_data["lost_at"] = utcnow()
        if update_data.get("follow_up_at"):
            lead.follow_up_history.insert(
                0, FollowUpEntry(scheduled_at=update_data["follow_up_at"], created_by=actor_id)
            )
        await self.leads.update(lead, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Lead", entity_id=str(lead.id), changes=update_data
        )
        return lead

    # ------------------------------------------------------------------
    # Dated remarks
    #
    # Three mutations over one embedded list, all of which go through
    # _save_remarks so the ordering, the `remarks` mirror and the audit entry
    # can never be done by two of them and forgotten by the third.
    # ------------------------------------------------------------------

    @staticmethod
    def _sort_remarks(entries: List[RemarkEntry]) -> List[RemarkEntry]:
        """Newest day first, and within a day the most recently written first.

        created_at breaks the tie rather than insertion order because a
        back-dated note is inserted long after the notes it sits beside, and
        the list is what both the API and the UI read top-down.
        """
        return sorted(entries, key=lambda e: (e.remark_date, e.created_at), reverse=True)

    @staticmethod
    def _remark_responses(lead: Lead) -> List[LeadRemarkResponse]:
        """The lead's dated remarks, newest first.

        A lead whose only note predates dated remarks gets one synthetic,
        id-less entry so that history is still visible rather than silently
        dropped from the board. It is dated to the lead's last update - the
        closest thing to a date the old field ever carried - and is turned into
        a real, editable entry by _migrate_legacy_remark the moment anyone adds
        their next remark.
        """
        if lead.remark_entries:
            return [
                LeadRemarkResponse(
                    id=entry.id,
                    remark_date=entry.remark_date,
                    text=entry.text,
                    created_at=entry.created_at,
                    created_by=entry.created_by,
                    created_by_name=entry.created_by_name,
                    updated_at=entry.updated_at,
                )
                for entry in LeadService._sort_remarks(lead.remark_entries)
            ]
        if lead.remarks:
            stamp = lead.updated_at or lead.created_at
            return [
                LeadRemarkResponse(
                    id=None, remark_date=stamp.date(), text=lead.remarks, created_at=stamp
                )
            ]
        return []

    async def _actor_name(self, actor_id: uuid.UUID | None) -> str | None:
        if not actor_id:
            return None
        user = await self.users.get_by_id(actor_id)
        return f"{user.first_name} {user.last_name}".strip() if user else None

    def _migrate_legacy_remark(self, lead: Lead) -> List[RemarkEntry]:
        """The lead's entries, with any pre-dated-remarks note folded in first.

        Runs on the first mutation after the feature shipped, so nobody's
        existing note is stranded behind the new list. Dated to the lead's last
        update for the same reason _remark_responses shows it there, and
        attributed to whoever last touched the lead, which is the only author
        the old field ever recorded.
        """
        if lead.remark_entries or not lead.remarks:
            return list(lead.remark_entries)
        stamp = lead.updated_at or lead.created_at
        return [
            RemarkEntry(
                remark_date=stamp.date(),
                text=lead.remarks,
                created_at=stamp,
                created_by=lead.updated_by,
            )
        ]

    async def _save_remarks(
        self, lead: Lead, entries: List[RemarkEntry], *, actor_id: uuid.UUID | None, action: str
    ) -> Lead:
        ordered = self._sort_remarks(entries)
        await self.leads.update(
            lead,
            {
                "remark_entries": ordered,
                # The mirror described on Lead.remarks. Cleared along with the
                # last entry rather than left behind: any legacy note has been
                # migrated into the list by the time a delete runs, so a
                # surviving mirror would be a copy of a remark somebody just
                # deleted - and _remark_responses would show it straight back.
                "remarks": ordered[0].text if ordered else None,
                "updated_by": actor_id,
            },
        )
        await self.audit.record(
            user_id=actor_id,
            action=action,
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"remark_entries": len(ordered)},
        )
        return lead

    async def add_remark(
        self, lead_id: uuid.UUID, data: LeadRemarkCreate, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        text = data.text.strip()
        if not text:
            raise BadRequestError("Write something before saving the remark.")
        entry = RemarkEntry(
            # Today in the server's clock when the client doesn't say - the
            # overwhelmingly common case is a note about the call just made.
            remark_date=data.remark_date or utcnow().date(),
            text=text,
            created_by=actor_id,
            created_by_name=await self._actor_name(actor_id),
        )
        return await self._save_remarks(
            lead, [*self._migrate_legacy_remark(lead), entry], actor_id=actor_id, action="ADD_REMARK"
        )

    @staticmethod
    def _find_remark(entries: List[RemarkEntry], remark_id: uuid.UUID) -> RemarkEntry:
        for entry in entries:
            if entry.id == remark_id:
                return entry
        raise NotFoundError("That remark no longer exists.")

    async def update_remark(
        self,
        lead_id: uuid.UUID,
        remark_id: uuid.UUID,
        data: LeadRemarkUpdate,
        *,
        actor_id: uuid.UUID | None,
        scope: str | None = None,
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        entries = self._migrate_legacy_remark(lead)
        entry = self._find_remark(entries, remark_id)
        if data.text is not None:
            text = data.text.strip()
            if not text:
                raise BadRequestError("A remark can't be emptied - delete it instead.")
            entry.text = text
        if data.remark_date is not None:
            entry.remark_date = data.remark_date
        entry.updated_at = utcnow()
        return await self._save_remarks(lead, entries, actor_id=actor_id, action="UPDATE_REMARK")

    async def delete_remark(
        self, lead_id: uuid.UUID, remark_id: uuid.UUID, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        entries = self._migrate_legacy_remark(lead)
        self._find_remark(entries, remark_id)
        remaining = [entry for entry in entries if entry.id != remark_id]
        return await self._save_remarks(lead, remaining, actor_id=actor_id, action="DELETE_REMARK")

    async def update_payment_info(
        self,
        lead_id: uuid.UUID,
        *,
        file: UploadFile | None,
        paid_amount: Decimal | None,
        payment_mode: PaymentMethod | None = None,
        actor_id: uuid.UUID | None,
        scope: str | None = None,
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        changes: dict = {}
        if file is not None:
            lead.payment_image_url = await self.storage.save_image(file, subdir=f"leads/{lead_id}")
            changes["payment_image_url"] = lead.payment_image_url
        if paid_amount is not None:
            lead.paid_amount = paid_amount
            changes["paid_amount"] = str(paid_amount)
        if payment_mode is not None:
            lead.payment_mode = payment_mode
            changes["payment_mode"] = payment_mode
        lead.updated_by = actor_id
        lead.touch(actor_id)
        await lead.save()
        if changes:
            await self.audit.record(user_id=actor_id, action="UPDATE", entity_type="Lead", entity_id=str(lead.id), changes=changes)
        return lead

    async def assign_plan(
        self,
        lead_id: uuid.UUID,
        data: LeadPlanAssign,
        *,
        actor_id: uuid.UUID | None,
        scope: str | None = None,
    ) -> Lead:
        """Attach a Foundation Form-style payment plan to a lead that didn't
        arrive with one (e.g. created manually in the CRM), pre-populating
        its installments from the same pricing table the public form uses."""
        lead = await self.get(lead_id, scope=scope)
        config = await self.foundation_form_config.get_or_create()
        program = await self.programs.get_by_value(data.program_interest)
        if program is None or not program.is_active:
            raise BadRequestError("Selected program is not valid.")
        installments = build_installments(config, program.category, data.payment_plan)
        lead.program_interest = data.program_interest
        lead.payment_plan = data.payment_plan
        lead.installments = installments
        lead.course_interest = program.name
        lead.payment_expected = build_payment_expected_summary(config, program.category, data.payment_plan)
        lead.updated_by = actor_id
        lead.touch(actor_id)
        await lead.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"program_interest": data.program_interest, "payment_plan": data.payment_plan},
        )
        return lead

    async def update_installment(
        self,
        lead_id: uuid.UUID,
        index: int,
        *,
        file: UploadFile | None,
        amount: Decimal | None,
        mode: InstallmentPaymentMode | None,
        transaction_id: str | None,
        upi_id: str | None,
        scheduled_at: date | None,
        actor_id: uuid.UUID | None,
        scope: str | None = None,
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        if index < 0 or index >= len(lead.installments):
            raise BadRequestError("Invalid installment index for this lead's plan.")

        installment = lead.installments[index]
        if amount is not None:
            installment.amount = amount
        if mode is not None:
            installment.mode = mode
        if transaction_id is not None:
            installment.transaction_id = transaction_id
        if upi_id is not None:
            installment.upi_id = upi_id
        if scheduled_at is not None:
            installment.scheduled_at = scheduled_at
        if file is not None:
            installment.proof_url = await self.storage.save_image(file, subdir=f"leads/{lead_id}/installments")
        was_paid = installment.paid
        installment.paid = bool(installment.mode and (installment.transaction_id or installment.upi_id) and installment.proof_url)
        if installment.paid and not was_paid:
            installment.paid_at = utcnow().date()

        lead.updated_by = actor_id
        lead.touch(actor_id)
        await lead.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"installment_index": index, "paid": installment.paid},
        )
        return lead

    async def mark_lost_nonpayment(
        self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        """Finance/Admin declares a lead Lost after 2 consecutive missed EMI/
        two-shot installments - notifies every HR Coordinator so they can
        drop the candidate from their active batch-confirmation queue."""
        lead = await self.get(lead_id, scope=scope)
        lead.status = LeadStatus.LOST
        # This path has its own fixed reason rather than prompting, since the
        # button that reaches it only appears for exactly this situation.
        lead.lost_reason = "Non-payment - 2 consecutive missed EMI payments"
        lead.lost_at = utcnow()
        lead.updated_by = actor_id
        lead.touch(actor_id)
        await lead.save()

        for hr_user in await self._hr_coordinators():
            await self.notifications.create(
                Notification(
                    user_id=hr_user.id,
                    title="Lead marked Lost - non-payment",
                    message=f"{lead.name} was marked Lost after 2 consecutive missed EMI payments. Warning sign.",
                    type=NotificationType.WARNING,
                )
            )

        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"status": LeadStatus.LOST, "reason": "non_payment"},
        )
        return lead

    async def _hr_coordinators(self) -> list:
        """Everyone who can act on a batch group.

        Found by permission rather than by a role called "HR Coordinator":
        role names are editable and a site may run several roles that do the
        job, so matching the name would quietly stop notifying somebody the day
        it was renamed. What these notifications need is whoever is allowed to
        act on them, which is what holding the permission means.

        De-duplicated, since one person can hold two roles that both qualify.
        """
        permission = await self.permissions.get_by_code(Permissions.BATCH_CONFIRMATION_ALLOCATE)
        if not permission:
            return []
        recipients = []
        for role in await self.roles.list_with_permission(permission.id):
            users, _ = await self.users.list(page=1, page_size=1000, filters={"role_id": role.id})
            recipients.extend(users)
        return list({user.id: user for user in recipients}.values())

    # Wording per reminder kind. The amount is filled in by the caller below,
    # since only Finance's own view knows what is actually outstanding.
    _REMINDER_COPY = {
        "due": ("Payment due", "still has an outstanding balance"),
        "emi": ("EMI payment due", "has an EMI instalment outstanding"),
        "after_placement": ("After-placement fee due", "has an after-placement fee outstanding"),
    }

    async def send_payment_reminder(
        self, lead_id: uuid.UUID, kind: str, *, note: str | None, actor_id: uuid.UUID | None
    ) -> tuple[int, int]:
        """Finance asks this lead's section admins to chase a payment.

        Targets every user whose role is scoped to the lead's own section, so
        it reaches whoever actually owns that pipeline rather than everyone.

        Returns (notified, already_pending). Both zeros are real outcomes worth
        surfacing rather than errors: a section with no admin yet, or a button
        pressed twice.

        Anyone still holding an unopened reminder of this kind about this lead
        is skipped. Pressing the button again used to stack a second identical
        copy in their panel, which is noise, not urgency - and the disabled
        state on the button only ever covered the in-flight request, so a
        second press a moment after the first landed went straight through.
        Suppression lifts once they've read it: if the money still hasn't
        arrived, chasing again is exactly what Finance should be able to do.
        """
        lead = await self.get(lead_id)
        if not lead.section:
            raise BadRequestError(
                "This lead isn't filed under a Form Collection section, so it has no section admin to notify."
            )

        title, phrase = self._REMINDER_COPY.get(kind, self._REMINDER_COPY["due"])
        roles = await self.roles.list_by_scoped_section(lead.section)
        recipients = []
        for role in roles:
            users, _ = await self.users.list(page=1, page_size=1000, filters={"role_id": role.id})
            recipients.extend(users)

        message = f"{lead.name} {phrase}. Open to follow up."
        if note:
            message = f"{message} Note from Finance: {note}"

        notified = 0
        already_pending = 0
        # De-duplicated: one person holding two scoped roles should still get
        # a single notification.
        for user in {user.id: user for user in recipients}.values():
            if await self.notifications.has_unread_reminder(user_id=user.id, lead_id=lead.id, title=title):
                already_pending += 1
                continue
            await self.notifications.create(
                Notification(
                    user_id=user.id,
                    title=title,
                    message=message,
                    type=NotificationType.WARNING,
                    lead_id=lead.id,
                    # Stated rather than left to the None fallback, which only
                    # exists to keep reminders raised before categories did
                    # behaving as they always have.
                    category=NotificationCategory.PAYMENT_REMINDER,
                )
            )
            notified += 1

        # Only recorded when something was actually sent - an audit line per
        # suppressed double-click would bury the real ones.
        if notified:
            await self.audit.record(
                user_id=actor_id,
                action="UPDATE",
                entity_type="Lead",
                entity_id=str(lead.id),
                changes={"payment_reminder": kind, "notified": notified},
            )
        return notified, already_pending

    async def report_non_payment(
        self, lead_id: uuid.UUID, *, amount: Decimal | None, note: str | None, actor_id: uuid.UUID | None
    ) -> int:
        """Finance declares this student a non-payer, for the HR Coordinators
        to act on.

        Addressed to whoever holds batch_confirmation.allocate rather than to a
        role called "HR Coordinator": role names are editable and a site may
        run several roles that do the job, so matching on the name would
        quietly stop notifying somebody the day it was renamed. Permission is
        what the notification actually needs - the recipient has to be able to
        remove the student from the group.

        The flag is written onto the lead as well as sent. A notification is
        read once by one person; the board has to keep showing which students
        Finance has flagged after that.
        """
        lead = await self.get(lead_id)
        recipients = await self._hr_coordinators()

        await self.leads.update(
            lead,
            {
                "non_payment_reported_at": utcnow(),
                "non_payment_amount": amount,
                "updated_by": actor_id,
            },
        )

        owed = f" ₹{amount:,.0f}" if amount is not None else ""
        message = (
            f"{lead.name} has not paid{owed}. Remove them from the batch WhatsApp group "
            "and mark them lost."
        )
        if note:
            message = f"{message} Note from Finance: {note}"

        for user in {user.id: user for user in recipients}.values():
            await self.notifications.create(
                Notification(
                    user_id=user.id,
                    title="Payment not received",
                    message=message,
                    type=NotificationType.ERROR,
                    lead_id=lead.id,
                    category=NotificationCategory.NON_PAYMENT,
                )
            )

        await self.audit.record(
            user_id=actor_id,
            action="NON_PAYMENT_REPORTED",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"amount": str(amount) if amount is not None else None, "notified": len(recipients)},
        )
        return len({user.id for user in recipients})

    async def move_to_follow_up(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> Lead:
        """Reached when a section admin opens a payment reminder. PRE_SCREENING
        is the stage the UI labels "Follow up call" (constants/leadStages.js).

        This intentionally moves a lead *backwards* - the leads Finance chases
        sit at Batch Confirmation, and the whole point of the reminder is that
        someone has to call them again. Guarding against a backwards move
        would mean the feature silently did nothing for exactly the leads it
        exists for.

        Two cases are left alone: a lead already at this stage (nothing to do)
        and a Lost one, so acknowledging a stale reminder can't quietly pull a
        written-off lead back into the pipeline.
        """
        lead = await self.get(lead_id)
        if lead.status in (LeadStatus.PRE_SCREENING, LeadStatus.LOST):
            return lead

        previous = lead.status
        lead.status = LeadStatus.PRE_SCREENING
        lead.updated_by = actor_id
        lead.touch(actor_id)
        await lead.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={
                "status": LeadStatus.PRE_SCREENING,
                "from": previous,
                "reason": "payment_reminder_acknowledged",
            },
        )
        return lead

    async def timeline(self, lead_id: uuid.UUID, *, scope: str | None = None) -> List[LeadTimelineEntryResponse]:
        await self.get(lead_id, scope=scope)  # 404s / 403s if the lead doesn't exist or isn't in scope
        entries, _ = await self.audit_logs.list(
            page=1,
            page_size=100,
            sort_by="created_at",
            sort_order="desc",
            filters={"entity_type": "Lead", "entity_id": str(lead_id)},
        )
        results = []
        for entry in entries:
            user = await self.users.get_by_id(entry.user_id) if entry.user_id else None
            user_name = f"{user.first_name} {user.last_name}".strip() if user else None
            results.append(
                LeadTimelineEntryResponse(
                    id=entry.id, action=entry.action, user_name=user_name, changes=entry.changes, created_at=entry.created_at
                )
            )
        return results

    async def assign(
        self, lead_id: uuid.UUID, data: LeadAssign, *, actor_id: uuid.UUID | None, scope: str | None = None
    ) -> Lead:
        lead = await self.get(lead_id, scope=scope)
        if not await self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        lead.assigned_to = data.assigned_to
        lead.updated_by = actor_id
        await lead.save()
        await self.audit.record(
            user_id=actor_id,
            action="ASSIGN",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"assigned_to": str(data.assigned_to)},
        )
        return lead

    async def delete(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None, scope: str | None = None) -> None:
        lead = await self.get(lead_id, scope=scope)
        await self.leads.delete(lead)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Lead", entity_id=str(lead.id))
