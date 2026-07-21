"""Business logic for the Role Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, ForbiddenError, NotFoundError
from app.models.role import Role
from app.repositories.permission_repository import PermissionRepository
from app.repositories.role_repository import RoleRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.permission_schema import PermissionResponse
from app.schemas.role_schema import RoleCreate, RoleResponse, RoleUpdate
from app.services.audit_service import AuditService


class RoleService:
    def __init__(self) -> None:
        self.roles = RoleRepository()
        self.permissions = PermissionRepository()
        self.audit = AuditService()

    async def _to_response(self, role: Role) -> RoleResponse:
        """MongoDB has no relationship loading: resolve `permission_ids` ->
        Permission documents explicitly to build the API response."""
        permissions = await self.permissions.get_by_ids(role.permission_ids)
        return RoleResponse(
            id=role.id,
            name=role.name,
            description=role.description,
            is_system=role.is_system,
            permissions=[PermissionResponse.model_validate(p) for p in permissions],
            created_at=role.created_at,
            updated_at=role.updated_at,
        )

    async def create(self, data: RoleCreate, *, actor_id: uuid.UUID | None) -> RoleResponse:
        if await self.roles.name_exists(data.name):
            raise AlreadyExistsError(f"A role named '{data.name}' already exists.")

        role = Role(
            name=data.name,
            description=data.description,
            permission_ids=data.permission_ids,
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.roles.create(role)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Role", entity_id=str(role.id))
        return await self._to_response(role)

    async def get(self, role_id: uuid.UUID) -> RoleResponse:
        role = await self.roles.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role not found.")
        return await self._to_response(role)

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.roles.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        responses = [await self._to_response(role) for role in items]
        return PaginatedResponse.build(responses, total, params.page, params.page_size)

    async def update(self, role_id: uuid.UUID, data: RoleUpdate, *, actor_id: uuid.UUID | None) -> RoleResponse:
        role = await self.roles.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role not found.")
        if role.is_system:
            raise ForbiddenError("System roles cannot be modified.")
        if data.name and await self.roles.name_exists(data.name, exclude_id=role.id):
            raise AlreadyExistsError(f"A role named '{data.name}' already exists.")

        update_data = data.model_dump(exclude_unset=True, exclude={"permission_ids"})
        update_data["updated_by"] = actor_id
        await self.roles.update(role, update_data)

        if data.permission_ids is not None:
            role.permission_ids = data.permission_ids
            await role.save()

        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Role", entity_id=str(role.id), changes=update_data
        )
        return await self._to_response(role)

    async def delete(self, role_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        role = await self.roles.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role not found.")
        if role.is_system:
            raise ForbiddenError("System roles cannot be deleted.")
        await self.roles.delete(role)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Role", entity_id=str(role.id))
