"""HTTP routes for the Batch Confirmation module (HR Coordinator dashboard)."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.enums import AllocationStatus
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.batch_confirmation_schema import (
    AllocateRequest,
    AllocationRowResponse,
    BatchFormOptionsResponse,
    BatchNumberRequest,
    BatchReadinessDetailResponse,
    BatchReadinessResponse,
    ConfirmBatchResponse,
    CoordinatorSummaryResponse,
    GroupAssignRequest,
    HRStageRequest,
    HRStudentResponse,
    MarkRequest,
    PendingLeadResponse,
    WithdrawRequest,
)
from app.schemas.batch_schema import BatchCreate, BatchResponse
from app.schemas.common import MessageResponse
from app.schemas.foundation_form_schema import WhatsAppGroupLinkResponse, WhatsAppGroupLinkUpdate
from app.services.batch_confirmation_service import BatchConfirmationService
from app.services.foundation_form_config_service import FoundationFormConfigService

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


def _to_hr_student(lead) -> HRStudentResponse:
    return HRStudentResponse(
        id=lead.id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        course_interest=lead.course_interest,
        section=lead.section,
        status=lead.status,
        batch_number=lead.batch_number,
        group_assigned_at=lead.group_assigned_at,
        lost_reason=lead.lost_reason,
        lost_at=lead.lost_at,
        created_at=lead.created_at,
    )


@router.get("/students", response_model=list[HRStudentResponse])
async def list_hr_students(
    tab: str = Query(default="approved", pattern="^(approved|pending_hr|group_assigned|lost)$"),
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[HRStudentResponse]:
    leads = await BatchConfirmationService().list_hr_students(tab)
    return [_to_hr_student(lead) for lead in leads]


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
