"""Business logic for the Permission Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.permission import Permission
from app.repositories.permission_repository import PermissionRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.permission_schema import PermissionCreate, PermissionUpdate
from app.services.audit_service import AuditService


class PermissionService:
    def __init__(self) -> None:
        self.permissions = PermissionRepository()
        self.audit = AuditService()

    async def create(self, data: PermissionCreate, *, actor_id: uuid.UUID | None) -> Permission:
        if await self.permissions.get_by_code(data.code):
            raise AlreadyExistsError(f"Permission '{data.code}' already exists.")

        permission = Permission(
            code=data.code,
            module=data.module,
            action=data.action,
            description=data.description,
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.permissions.create(permission)
        await self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="Permission", entity_id=str(permission.id)
        )
        return permission

    async def get(self, permission_id: uuid.UUID) -> Permission:
        permission = await self.permissions.get_by_id(permission_id)
        if not permission:
            raise NotFoundError("Permission not found.")
        return permission

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.permissions.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["code", "module", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, permission_id: uuid.UUID, data: PermissionUpdate, *, actor_id: uuid.UUID | None) -> Permission:
        permission = await self.get(permission_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.permissions.update(permission, update_data)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Permission",
            entity_id=str(permission.id),
            changes=update_data,
        )
        return permission

    async def delete(self, permission_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        permission = await self.get(permission_id)
        await self.permissions.delete(permission)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="Permission", entity_id=str(permission.id)
        )
