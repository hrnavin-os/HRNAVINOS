"""HTTP routes for the Staffs directory (Employee > Staffs).

Read-only: every live member of staff with their full profile. The records
are the Users menu's - adding, editing and removing staff happens there, and
the Staffs page only offers those actions to a role that holds the users.*
codes for them. Kept as its own endpoint rather than a flag on /users so the
two menus can be granted apart: see STAFFS_VIEW in permission_codes.py.
"""
import uuid

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.user_schema import UserResponse
from app.services.user_service import UserService

router = APIRouter(prefix="/staffs", tags=["Staffs"])


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_staffs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "first_name",
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    department_id: uuid.UUID | None = None,
    role_id: uuid.UUID | None = None,
    actor: User = Depends(RequirePermissions(Permissions.STAFFS_VIEW)),
) -> PaginatedResponse[UserResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    service = UserService()
    result = await service.list(params, role_id=role_id, department_id=department_id)
    items = [await service.to_response(user) for user in result.items]
    return PaginatedResponse[UserResponse].build(items, result.total, result.page, result.page_size)


@router.get("/{user_id}", response_model=UserResponse)
async def get_staff(
    user_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.STAFFS_VIEW)),
) -> UserResponse:
    service = UserService()
    return await service.to_response(await service.get(user_id))
