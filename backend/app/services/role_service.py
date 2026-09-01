"""Business logic for the Role Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, BadRequestError, ForbiddenError, NotFoundError
from app.models.role import Role
from app.repositories.permission_repository import PermissionRepository
from app.repositories.user_repository import UserRepository
from app.repositories.role_repository import RoleRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.permission_schema import PermissionResponse
from app.schemas.role_schema import RoleCreate, RoleResponse, RoleUpdate
from app.services.audit_service import AuditService


class RoleService:
    def __init__(self) -> None:
        self.roles = RoleRepository()
        self.permissions = PermissionRepository()
        # Only to put a name against a deletion; roles otherwise know nothing
        # about users.
        self.users = UserRepository()
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
            scoped_section=role.scoped_section,
            permissions=[PermissionResponse.model_validate(p) for p in permissions],
            created_at=role.created_at,
            updated_at=role.updated_at,
            deleted_at=role.deleted_at,
            deleted_by_name=await self._deleter_name(role),
            deleted_reason=role.deleted_reason,
        )

    async def _deleter_name(self, role: Role) -> str | None:
        """Who deleted this role, by name. None on a live one."""
        if not role.is_deleted or not role.deleted_by:
            return None
        actor = await self.users.get_by_id(role.deleted_by)
        return f"{actor.first_name} {actor.last_name}".strip() if actor else None

    async def create(self, data: RoleCreate, *, actor_id: uuid.UUID | None) -> RoleResponse:
        if await self.roles.name_exists(data.name):
            raise AlreadyExistsError(f"A role named '{data.name}' already exists.")

        role = Role(
            name=data.name,
            description=data.description,
            permission_ids=data.permission_ids,
            scoped_section=data.scoped_section,
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

    async def list(self, params: PaginationParams, *, deleted: bool = False) -> PaginatedResponse:
        # The Deleted tab is the same query with the flag flipped - see the
        # note on UserService.list.
        items, total = await self.roles.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            include_deleted=deleted,
            filters={"is_deleted": deleted},
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

    async def delete(self, role_id: uuid.UUID, *, reason: str, actor_id: uuid.UUID | None) -> None:
        """Soft-deletes a role, on the record.

        The reason is required for the same read-it-back-later reason a user's
        is: a role is a set of decisions about who may do what, and its
        removal is one more of them.
        """
        role = await self.roles.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role not found.")
        if role.is_system:
            raise ForbiddenError("System roles cannot be deleted.")
        note = reason.strip()
        if not note:
            raise BadRequestError("Give a reason for deleting this role.")
        await self.roles.delete(role, actor_id=actor_id, reason=note)
        await self.audit.record(
            user_id=actor_id,
            action="DELETE",
            entity_type="Role",
            entity_id=str(role.id),
            changes={"reason": note},
        )
