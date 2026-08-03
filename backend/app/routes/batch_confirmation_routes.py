"""HTTP routes for the Batch Confirmation module (HR Coordinator dashboard)."""
import uuid

from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.batch_confirmation_schema import (
    AllocateRequest,
    BatchReadinessDetailResponse,
    BatchReadinessResponse,
    ConfirmBatchResponse,
    CoordinatorSummaryResponse,
    PendingLeadResponse,
    WithdrawRequest,
)
from app.schemas.common import MessageResponse
from app.services.batch_confirmation_service import BatchConfirmationService

router = APIRouter(prefix="/batch-confirmation", tags=["Batch Confirmation"])


@router.get("/summary", response_model=CoordinatorSummaryResponse)
async def get_summary(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> CoordinatorSummaryResponse:
    return await BatchConfirmationService().summary()


@router.get("/pending-leads", response_model=list[PendingLeadResponse])
async def list_pending_leads(
    actor: User = Depends(RequirePermissions(Permissions.BATCH_CONFIRMATION_VIEW)),
) -> list[PendingLeadResponse]:
    return await BatchConfirmationService().list_pending_leads()


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
