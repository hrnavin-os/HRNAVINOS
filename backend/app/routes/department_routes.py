"""HTTP routes for the Departments module (Employee > Departments)."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequireAnyPermission, RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.department_schema import DepartmentCreate, DepartmentResponse, DepartmentUpdate
from app.services.department_service import DepartmentService

router = APIRouter(prefix="/departments", tags=["Departments"])

# Read by the Departments page itself, and by the two pages that pick or filter
# by department: the Users form (department is mandatory there) and the Staffs
# directory. Requiring departments.view of both would mean nobody could add a
# user without also being handed the Departments menu.
_CAN_READ = RequireAnyPermission(
    Permissions.DEPARTMENTS_VIEW,
    Permissions.USERS_CREATE,
    Permissions.USERS_UPDATE,
    Permissions.STAFFS_VIEW,
)


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentCreate,
    actor: User = Depends(RequirePermissions(Permissions.DEPARTMENTS_CREATE)),
) -> DepartmentResponse:
    return await DepartmentService().create(payload, actor_id=actor.id)


@router.get("", response_model=PaginatedResponse[DepartmentResponse])
async def list_departments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "name",
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    # The Users form asks for active departments only; the Departments page
    # lists all of them.
    active: bool | None = None,
    actor: User = Depends(_CAN_READ),
) -> PaginatedResponse[DepartmentResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await DepartmentService().list(params, active=active)
    return PaginatedResponse[DepartmentResponse].build(result.items, result.total, result.page, result.page_size)


@router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: uuid.UUID,
    actor: User = Depends(_CAN_READ),
) -> DepartmentResponse:
    return await DepartmentService().get(department_id)


@router.put("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdate,
    actor: User = Depends(RequirePermissions(Permissions.DEPARTMENTS_UPDATE)),
) -> DepartmentResponse:
    return await DepartmentService().update(department_id, payload, actor_id=actor.id)


@router.delete("/{department_id}", response_model=MessageResponse)
async def delete_department(
    department_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.DEPARTMENTS_DELETE)),
) -> MessageResponse:
    await DepartmentService().delete(department_id, actor_id=actor.id)
    return MessageResponse(message="Department deleted successfully.")
