"""HTTP routes for the Programs Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.program_schema import ProgramCreate, ProgramResponse, ProgramUpdate
from app.services.program_service import ProgramService

router = APIRouter(prefix="/programs", tags=["Programs Management"])


@router.post("", response_model=ProgramResponse, status_code=status.HTTP_201_CREATED)
async def create_program(
    payload: ProgramCreate,
    actor: User = Depends(RequirePermissions(Permissions.PROGRAMS_CREATE)),
) -> ProgramResponse:
    return ProgramResponse.model_validate(await ProgramService().create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[ProgramResponse])
async def list_programs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "order",
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.PROGRAMS_VIEW)),
) -> PaginatedResponse[ProgramResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await ProgramService().list(params)
    return PaginatedResponse[ProgramResponse].build(
        [ProgramResponse.model_validate(p) for p in result.items], result.total, result.page, result.page_size
    )


@router.get("/{program_id}", response_model=ProgramResponse)
async def get_program(
    program_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.PROGRAMS_VIEW)),
) -> ProgramResponse:
    return ProgramResponse.model_validate(await ProgramService().get(program_id))


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(
    program_id: uuid.UUID,
    payload: ProgramUpdate,
    actor: User = Depends(RequirePermissions(Permissions.PROGRAMS_UPDATE)),
) -> ProgramResponse:
    return ProgramResponse.model_validate(await ProgramService().update(program_id, payload, actor_id=actor.id))


@router.delete("/{program_id}", response_model=MessageResponse)
async def delete_program(
    program_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.PROGRAMS_DELETE)),
) -> MessageResponse:
    await ProgramService().delete(program_id, actor_id=actor.id)
    return MessageResponse(message="Program deleted successfully.")
