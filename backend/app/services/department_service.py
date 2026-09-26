"""Business logic for the Departments module."""
import uuid

from app.exceptions.base import AlreadyExistsError, BadRequestError, NotFoundError
from app.models.department import Department
from app.repositories.department_repository import DepartmentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.department_schema import DepartmentCreate, DepartmentResponse, DepartmentUpdate
from app.services.audit_service import AuditService


class DepartmentService:
    def __init__(self) -> None:
        self.departments = DepartmentRepository()
        self.audit = AuditService()

    def _to_response(self, department: Department, staff_count: int = 0) -> DepartmentResponse:
        return DepartmentResponse(
            id=department.id,
            name=department.name,
            code=department.code,
            description=department.description,
            is_active=department.is_active,
            staff_count=staff_count,
            created_at=department.created_at,
            updated_at=department.updated_at,
        )

    async def _get(self, department_id: uuid.UUID) -> Department:
        department = await self.departments.get_by_id(department_id)
        if not department:
            raise NotFoundError("Department not found.")
        return department

    async def get(self, department_id: uuid.UUID) -> DepartmentResponse:
        department = await self._get(department_id)
        counts = await self.departments.staff_counts([department.id])
        return self._to_response(department, counts.get(department.id, 0))

    async def list(self, params: PaginationParams, *, active: bool | None = None) -> PaginatedResponse:
        items, total = await self.departments.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "code", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"is_active": active},
        )
        counts = await self.departments.staff_counts([department.id for department in items])
        responses = [self._to_response(department, counts.get(department.id, 0)) for department in items]
        return PaginatedResponse.build(responses, total, params.page, params.page_size)

    async def create(self, data: DepartmentCreate, *, actor_id: uuid.UUID | None) -> DepartmentResponse:
        if await self.departments.name_exists(data.name):
            raise AlreadyExistsError(f"A department named '{data.name}' already exists.")
        department = Department(
            name=data.name,
            code=data.code,
            description=data.description,
            is_active=data.is_active,
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.departments.create(department)
        await self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="Department", entity_id=str(department.id)
        )
        return self._to_response(department)

    async def update(
        self, department_id: uuid.UUID, data: DepartmentUpdate, *, actor_id: uuid.UUID | None
    ) -> DepartmentResponse:
        department = await self._get(department_id)
        if data.name and await self.departments.name_exists(data.name, exclude_id=department.id):
            raise AlreadyExistsError(f"A department named '{data.name}' already exists.")
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and not update_data["name"]:
            raise BadRequestError("A department needs a name.")
        update_data["updated_by"] = actor_id
        await self.departments.update(department, update_data)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Department",
            entity_id=str(department.id),
            changes={key: value for key, value in update_data.items() if key != "updated_by"},
        )
        return await self.get(department.id)

    async def delete(self, department_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        """Soft-deletes an empty department.

        Refused while anybody is still in it: every member of staff must have a
        department, so deleting one out from under them would leave records the
        Users form then refuses to save. Move them first, or deactivate the
        department to stop it being offered for new staff.
        """
        department = await self._get(department_id)
        staff = (await self.departments.staff_counts([department.id])).get(department.id, 0)
        if staff:
            raise BadRequestError(
                f"{department.name} still has {staff} staff member{'s' if staff != 1 else ''}. "
                "Move them to another department first, or mark it inactive instead."
            )
        await self.departments.delete(department, actor_id=actor_id)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="Department", entity_id=str(department.id)
        )
