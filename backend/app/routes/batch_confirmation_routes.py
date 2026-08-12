"""HTTP routes for the Batch Confirmation module (HR Coordinator dashboard)."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.enums import AllocationStatus, WhatsAppGroupStatus
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.batch_confirmation_schema import (
    AllocateRequest,
    AllocationRowResponse,
    BatchFormOptionsResponse,
    BatchNumberRequest,
    BatchReadinessDetailResponse,
    BatchReadinessResponse,
    BulkGroupAssignRequest,
    BulkGroupAssignResponse,
    ConfirmBatchResponse,
    CoordinatorSummaryResponse,
    GroupAssignRequest,
    HRStageRequest,
    HRStudentResponse,
    MarkRequest,
    PendingLeadResponse,
    WhatsAppConfigResponse,
    WhatsAppCountsResponse,
    WhatsAppHistoryEntry,
    WhatsAppInviteResponse,
    WithdrawRequest,
)
from app.schemas.batch_schema import BatchCreate, BatchResponse
from app.schemas.common import MessageResponse
from app.schemas.foundation_form_schema import WhatsAppGroupLinkResponse, WhatsAppGroupLinkUpdate
from app.services.batch_confirmation_service import BatchConfirmationService
from app.services.foundation_form_config_service import FoundationFormConfigService
from app.services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/batch-confirmation", tags=["Batch Confirmation"])


@router.get("/summary", response_model=CoordinatorSummaryResponse)
async def get_summary(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> CoordinatorSummaryResponse:
    return await BatchConfirmationService().summary()


@router.get("/options", response_model=BatchFormOptionsResponse)
async def get_form_options(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> BatchFormOptionsResponse:
    return await BatchConfirmationService().form_options()


@router.post("/batches", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch_group(
    payload: BatchCreate,
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_CREATE)),
) -> BatchResponse:
    """Lets the coordinator form a batch group without leaving the dashboard."""
    batch = await BatchConfirmationService().create_batch(payload, actor_id=actor.id)
    return BatchResponse.model_validate(batch)


@router.get("/pending-leads", response_model=list[PendingLeadResponse])
async def list_pending_leads(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[PendingLeadResponse]:
    return await BatchConfirmationService().list_pending_leads()


@router.get("/allocations", response_model=list[AllocationRowResponse])
async def list_allocations(
    status_filter: AllocationStatus | None = Query(default=None, alias="status"),
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[AllocationRowResponse]:
    return await BatchConfirmationService().list_allocations(status=status_filter)


@router.post("/leads/{lead_id}/mark", response_model=MessageResponse)
async def mark_lead(
    lead_id: uuid.UUID,
    payload: MarkRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> MessageResponse:
    await BatchConfirmationService().mark_lead(lead_id, marked=payload.marked, actor_id=actor.id)
    return MessageResponse(message="Lead marked." if payload.marked else "Mark cleared.")


@router.get("/batches", response_model=list[BatchReadinessResponse])
async def list_batches(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[BatchReadinessResponse]:
    return await BatchConfirmationService().list_batches()


@router.get("/batches/{batch_id}", response_model=BatchReadinessDetailResponse)
async def get_batch(
    batch_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> BatchReadinessDetailResponse:
    return await BatchConfirmationService().get_batch(batch_id)


@router.post("/allocations", response_model=MessageResponse)
async def allocate_lead(
    payload: AllocateRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> MessageResponse:
    await BatchConfirmationService().allocate(
        payload.lead_id, payload.batch_id, notes=payload.notes, actor_id=actor.id
    )
    return MessageResponse(message="Lead allocated to batch.")


@router.post("/allocations/{allocation_id}/withdraw", response_model=MessageResponse)
async def withdraw_allocation(
    allocation_id: uuid.UUID,
    payload: WithdrawRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> MessageResponse:
    await BatchConfirmationService().withdraw(allocation_id, reason=payload.reason, actor_id=actor.id)
    return MessageResponse(message="Seat withdrawn; the lead is back in the allocation queue.")


@router.post("/batches/{batch_id}/confirm", response_model=ConfirmBatchResponse)
async def confirm_batch(
    batch_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_CONFIRM)),
) -> ConfirmBatchResponse:
    return await BatchConfirmationService().confirm_batch(batch_id, actor_id=actor.id)


# WhatsApp group links live on the HR Coordinator's router (and behind its
# permissions) because they're part of that role's day-to-day work. Note the
# coordinator has no leads.view, so these can't be folded into the Form
# Collection config endpoints that otherwise own section settings.
@router.get("/whatsapp-links", response_model=list[WhatsAppGroupLinkResponse])
async def list_whatsapp_links(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[WhatsAppGroupLinkResponse]:
    sections = await FoundationFormConfigService().list_whatsapp_links()
    return [
        WhatsAppGroupLinkResponse(code=s.code, label=s.label, whatsapp_group_url=s.whatsapp_group_url)
        for s in sections
    ]


@router.put("/whatsapp-links/{code}", response_model=WhatsAppGroupLinkResponse)
async def update_whatsapp_link(
    code: str,
    payload: WhatsAppGroupLinkUpdate,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> WhatsAppGroupLinkResponse:
    section = await FoundationFormConfigService().set_whatsapp_link(
        code, payload.whatsapp_group_url, actor_id=actor.id
    )
    return WhatsAppGroupLinkResponse(
        code=section.code, label=section.label, whatsapp_group_url=section.whatsapp_group_url
    )


def _to_hr_student(lead, batch: str | None = None, handled_by: str | None = None) -> HRStudentResponse:
    return HRStudentResponse(
        id=lead.id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        course_interest=lead.course_interest,
        section=lead.section,
        status=lead.status,
        batch_number=lead.batch_number,
        # Derived from Induction where there is one; otherwise whatever was
        # typed by hand, so leads that never came through Induction still show
        # a batch.
        batch=batch or lead.batch_number,
        group_assigned_at=lead.group_assigned_at,
        joined_at=lead.group_assigned_at,
        whatsapp_status=lead.whatsapp_status,
        whatsapp_invite_sent_at=lead.whatsapp_invite_sent_at,
        whatsapp_invite_count=lead.whatsapp_invite_count,
        whatsapp_last_follow_up_at=lead.whatsapp_last_follow_up_at,
        whatsapp_handled_by_name=handled_by,
        lost_reason=lead.lost_reason,
        lost_at=lead.lost_at,
        created_at=lead.created_at,
    )


async def _handler_names(service: BatchConfirmationService, leads: list) -> dict:
    """{user id: display name} for whoever last worked each candidate.
    Resolved once for the page rather than per row."""
    ids = {lead.whatsapp_handled_by for lead in leads if lead.whatsapp_handled_by}
    names = {}
    for user_id in ids:
        user = await service.users.get_by_id(user_id)
        if user:
            names[user_id] = f"{user.first_name} {user.last_name}".strip()
    return names


@router.get("/students", response_model=list[HRStudentResponse])
async def list_hr_students(
    tab: str = Query(default="approved", pattern="^(approved|pending_hr|group_assigned|lost)$"),
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[HRStudentResponse]:
    service = BatchConfirmationService()
    leads = await service.list_hr_students(tab)
    # Resolved for the whole page in one query rather than per row.
    batches = await service.batches_for(leads)
    handlers = await _handler_names(service, leads)
    return [
        _to_hr_student(lead, batches.get(lead.id), handlers.get(lead.whatsapp_handled_by)) for lead in leads
    ]


# ---------------------------------------------------------------------------
# WhatsApp group onboarding
#
# The ERP cannot add anybody to a WhatsApp group. Only the person holding the
# account can accept an invite, and no WhatsApp API - Business API included -
# exposes group member management or a join event to subscribe to. So the flow
# these routes model is the one the platform actually permits:
#
#     coordinator sends the invite -> candidate joins -> coordinator records it
#
# Sending is a wa.me deep link with the invite pre-written, which needs no
# credentials and works today. If an integration that can send programmatically
# is added later it slots in at send_whatsapp_invite and nothing else changes;
# a real join event would replace only the manual mark, which is recorded under
# its own audit action so the two stay distinguishable in the history.
# ---------------------------------------------------------------------------


@router.get("/whatsapp/queue", response_model=list[HRStudentResponse])
async def list_whatsapp_queue(
    status_filter: WhatsAppGroupStatus | None = Query(default=None, alias="status"),
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[HRStudentResponse]:
    service = BatchConfirmationService()
    leads = await service.list_whatsapp_queue(status_filter)
    batches = await service.batches_for(leads)
    handlers = await _handler_names(service, leads)
    return [
        _to_hr_student(lead, batches.get(lead.id), handlers.get(lead.whatsapp_handled_by)) for lead in leads
    ]


@router.get("/whatsapp/config", response_model=WhatsAppConfigResponse)
async def whatsapp_config(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> WhatsAppConfigResponse:
    """Whether invites send by themselves. The board reads this to know whether
    pressing Send will deliver the message or hand the coordinator a
    pre-written one to send - worth saying up front rather than after."""
    return WhatsAppConfigResponse(configured=WhatsAppService().configured)


@router.get("/whatsapp/counts", response_model=WhatsAppCountsResponse)
async def whatsapp_counts(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> WhatsAppCountsResponse:
    return WhatsAppCountsResponse(**await BatchConfirmationService().whatsapp_counts())


@router.post("/whatsapp/invite/bulk", response_model=BulkGroupAssignResponse)
async def bulk_send_whatsapp_invite(
    payload: BulkGroupAssignRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> BulkGroupAssignResponse:
    """Sends the invite to a selection. Declared before the /{lead_id} routes
    so the dynamic segment doesn't swallow "invite"."""
    sent, skipped = await BatchConfirmationService().send_whatsapp_invite_bulk(
        payload.lead_ids, actor_id=actor.id
    )
    message = f"Invite sent to {sent} candidate{'' if sent == 1 else 's'}."
    if skipped:
        shown = ", ".join(skipped[:3]) + ("…" if len(skipped) > 3 else "")
        message = f"{message} Skipped {len(skipped)}: {shown}"
    return BulkGroupAssignResponse(message=message, assigned=sent, skipped=skipped)


@router.post("/whatsapp/{lead_id}/invite", response_model=WhatsAppInviteResponse)
async def send_whatsapp_invite(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> WhatsAppInviteResponse:
    """Sends the invite and records that it went out. Does NOT mark anybody as
    joined - the candidate still has to accept it themselves.

    `delivered` tells the board whether the Cloud API actually sent the
    message. False means credentials aren't configured (or Meta refused), and
    the board opens a pre-written wa.me message instead - so the button works
    either way and the coordinator can see which happened.
    """
    lead, delivered = await BatchConfirmationService().send_whatsapp_invite(lead_id, actor_id=actor.id)
    return WhatsAppInviteResponse(student=_to_hr_student(lead), delivered=delivered)


@router.post("/whatsapp/{lead_id}/joined", response_model=HRStudentResponse)
async def mark_whatsapp_joined(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> HRStudentResponse:
    lead = await BatchConfirmationService().mark_whatsapp_joined(lead_id, actor_id=actor.id)
    return _to_hr_student(lead)


@router.post("/whatsapp/{lead_id}/follow-up", response_model=HRStudentResponse)
async def log_whatsapp_follow_up(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> HRStudentResponse:
    lead = await BatchConfirmationService().log_whatsapp_follow_up(lead_id, actor_id=actor.id)
    return _to_hr_student(lead)


@router.get("/whatsapp/{lead_id}/history", response_model=list[WhatsAppHistoryEntry])
async def whatsapp_history(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[WhatsAppHistoryEntry]:
    history = await BatchConfirmationService().whatsapp_history(lead_id)
    return [
        WhatsAppHistoryEntry(action=action, user_name=user_name, created_at=created_at)
        for action, user_name, created_at in history
    ]


@router.put("/students/{lead_id}/batch-number", response_model=HRStudentResponse)
async def set_batch_number(
    lead_id: uuid.UUID,
    payload: BatchNumberRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> HRStudentResponse:
    lead = await BatchConfirmationService().set_batch_number(
        lead_id, batch_number=payload.batch_number, actor_id=actor.id
    )
    return _to_hr_student(lead)


@router.post("/students/{lead_id}/group-assigned", response_model=HRStudentResponse)
async def mark_group_assigned(
    lead_id: uuid.UUID,
    payload: GroupAssignRequest | None = None,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> HRStudentResponse:
    lead = await BatchConfirmationService().set_group_assigned(
        lead_id, assigned=payload.assigned if payload else True, actor_id=actor.id
    )
    return _to_hr_student(lead)


@router.post("/students/{lead_id}/stage", response_model=HRStudentResponse)
async def set_hr_stage(
    lead_id: uuid.UUID,
    payload: HRStageRequest,
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_ALLOCATE)),
) -> HRStudentResponse:
    lead = await BatchConfirmationService().set_hr_stage(
        lead_id, status=payload.status, lost_reason=payload.lost_reason, actor_id=actor.id
    )
    return _to_hr_student(lead)
