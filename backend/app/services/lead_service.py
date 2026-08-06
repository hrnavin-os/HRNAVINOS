"""Business logic for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import List

from fastapi import UploadFile

from app.database.base import utcnow
from app.exceptions.base import BadRequestError, ForbiddenError, NotFoundError
from app.models.enums import InstallmentPaymentMode, LeadSource, LeadStatus, NotificationType, PaymentMethod
from app.models.lead import FollowUpEntry, Lead
from app.models.notification import Notification
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.program_repository import ProgramRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.lead_schema import (
    FollowUpEntryResponse,
    LeadAssign,
    LeadCreate,
    LeadPlanAssign,
    LeadResponse,
    LeadStatsResponse,
    LeadTimelineEntryResponse,
    LeadUpdate,
    PaymentInstallmentResponse,
)
from app.services.audit_service import AuditService
from app.services.foundation_form_pricing import build_installments, build_payment_expected_summary
from app.services.storage_service import StorageService


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

    async def to_response(self, lead: Lead) -> LeadResponse:
        assignee = await self.users.get_by_id(lead.assigned_to) if lead.assigned_to else None
        assigned_to_name = f"{assignee.first_name} {assignee.last_name}".strip() if assignee else None
        return LeadResponse(
            id=lead.id,
            name=lead.name,
            email=lead.email,
            phone=lead.phone,
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
            payment_option=lead.payment_option,
            payment_call_remarks=lead.payment_call_remarks,
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
        lead = Lead(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
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
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> PaginatedResponse:
        # See LeadRepository.count_total for why this isn't a plain "reviewed": True.
        filters = {"reviewed": {"$ne": False}}
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
        if date_from or date_to:
            created_range: dict[str, datetime] = {}
            if date_from:
                created_range["$gte"] = datetime.combine(date_from, time.min)
            if date_to:
                created_range["$lte"] = datetime.combine(date_to, time.max)
            filters["created_at"] = created_range
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
        return LeadStatsResponse(total=total, by_status=by_status, by_section=by_section)

    async def course_options(self) -> List[str]:
        return await self.leads.distinct_course_interests()

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

        hr_role = await self.roles.get_by_name("HR Coordinator")
        if hr_role:
            hr_users, _ = await self.users.list(page=1, page_size=1000, filters={"role_id": hr_role.id})
            for hr_user in hr_users:
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

    # Wording per reminder kind. The amount is filled in by the caller below,
    # since only Finance's own view knows what is actually outstanding.
    _REMINDER_COPY = {
        "due": ("Payment due", "still has an outstanding balance"),
        "emi": ("EMI payment due", "has an EMI instalment outstanding"),
        "after_placement": ("After-placement fee due", "has an after-placement fee outstanding"),
    }

    async def send_payment_reminder(
        self, lead_id: uuid.UUID, kind: str, *, note: str | None, actor_id: uuid.UUID | None
    ) -> int:
        """Finance asks this lead's section admins to chase a payment.

        Targets every user whose role is scoped to the lead's own section, so
        it reaches whoever actually owns that pipeline rather than everyone.
        Returns how many people were notified - zero is a real outcome worth
        surfacing (a lead with no section, or a section with no admin yet),
        not an error.
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

        # De-duplicated: one person holding two scoped roles should still get
        # a single notification.
        for user in {user.id: user for user in recipients}.values():
            await self.notifications.create(
                Notification(
                    user_id=user.id,
                    title=title,
                    message=message,
                    type=NotificationType.WARNING,
                    lead_id=lead.id,
                )
            )

        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"payment_reminder": kind, "notified": len(recipients)},
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
