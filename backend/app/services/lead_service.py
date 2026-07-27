"""Business logic for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import List

from fastapi import UploadFile

from app.exceptions.base import BadRequestError, NotFoundError
from app.models.enums import LeadSource, LeadStatus, PaymentMethod
from app.models.lead import FollowUpEntry, Lead
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.lead_schema import (
    FollowUpEntryResponse,
    LeadAssign,
    LeadCreate,
    LeadResponse,
    LeadStatsResponse,
    LeadTimelineEntryResponse,
    LeadUpdate,
)
from app.services.audit_service import AuditService
from app.services.storage_service import StorageService


class LeadService:
    def __init__(self) -> None:
        self.leads = LeadRepository()
        self.users = UserRepository()
        self.audit = AuditService()
        self.audit_logs = AuditLogRepository()
        self.storage = StorageService()

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
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )

    async def create(self, data: LeadCreate, *, actor_id: uuid.UUID | None) -> Lead:
        if data.assigned_to and not await self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        lead = Lead(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        await self.leads.create(lead)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Lead", entity_id=str(lead.id))
        return lead

    async def get(self, lead_id: uuid.UUID) -> Lead:
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        return lead

    async def list(
        self,
        params: PaginationParams,
        *,
        status: str | None = None,
        assigned_to: uuid.UUID | None = None,
        source: LeadSource | None = None,
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
            search_fields=["name", "phone", "email"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def list_pending_review(self) -> List[Lead]:
        return await self.leads.list_pending_review()

    async def review(self, lead_id: uuid.UUID, data: LeadUpdate, *, actor_id: uuid.UUID | None) -> Lead:
        """Apply the Pre Sales staffer's corrections to a Form Check submission
        and admit it into the normal pipeline (visible in Leads / New Lead)."""
        lead = await self.get(lead_id)
        if data.status is not None:
            self._validate_stage_transition(lead.status, data.status)
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

    async def stats(self) -> LeadStatsResponse:
        total = await self.leads.count_total()
        by_status = await self.leads.count_by_status()
        return LeadStatsResponse(total=total, by_status=by_status)

    def _validate_stage_transition(self, current: LeadStatus, new: LeadStatus) -> None:
        """Financial Approval and Batch Confirmation are pipeline gates: each
        can only be entered from the stage directly before it. Once a lead
        reaches Batch Confirmation it can't move back (Lost stays reachable
        as an exit)."""
        if current == new:
            return
        if current == LeadStatus.BATCH_CONFIRMATION and new != LeadStatus.LOST:
            raise BadRequestError("A lead in Batch Confirmation can't be moved back to an earlier stage.")
        if new == LeadStatus.BATCH_CONFIRMATION and current != LeadStatus.FINANCIAL_APPROVAL:
            raise BadRequestError("A lead can only move to Batch Confirmation from Financial Approval.")
        if new == LeadStatus.FINANCIAL_APPROVAL and current != LeadStatus.PRE_SCREENING:
            raise BadRequestError("A lead can only move to Financial Approval from Pre Screening.")

    async def update(self, lead_id: uuid.UUID, data: LeadUpdate, *, actor_id: uuid.UUID | None) -> Lead:
        lead = await self.get(lead_id)
        if data.status is not None:
            self._validate_stage_transition(lead.status, data.status)
        update_data = data.model_dump(exclude_unset=True)
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

    async def update_payment_info(
        self,
        lead_id: uuid.UUID,
        *,
        file: UploadFile | None,
        paid_amount: Decimal | None,
        payment_mode: PaymentMethod | None = None,
        actor_id: uuid.UUID | None,
    ) -> Lead:
        lead = await self.get(lead_id)
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

    async def timeline(self, lead_id: uuid.UUID) -> List[LeadTimelineEntryResponse]:
        await self.get(lead_id)  # 404s if the lead doesn't exist
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

    async def assign(self, lead_id: uuid.UUID, data: LeadAssign, *, actor_id: uuid.UUID | None) -> Lead:
        lead = await self.get(lead_id)
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

    async def delete(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        lead = await self.get(lead_id)
        await self.leads.delete(lead)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Lead", entity_id=str(lead.id))
