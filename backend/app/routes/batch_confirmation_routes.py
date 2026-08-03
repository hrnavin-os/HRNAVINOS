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
    BatchReadinessDetailResponse,
    BatchReadinessResponse,
    ConfirmBatchResponse,
    CoordinatorSummaryResponse,
    MarkRequest,
    PendingLeadResponse,
    WithdrawRequest,
)
from app.schemas.batch_schema import BatchCreate, BatchResponse
from app.schemas.common import MessageResponse
from app.services.batch_confirmation_service import BatchConfirmationService

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
