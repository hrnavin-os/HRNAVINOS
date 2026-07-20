"""Business logic for the Permission Management module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.permission import Permission
from app.repositories.permission_repository import PermissionRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.permission_schema import PermissionCreate, PermissionUpdate
from app.services.audit_service import AuditService


class PermissionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.permissions = PermissionRepository(db)
        self.audit = AuditService(db)

    def create(self, data: PermissionCreate, *, actor_id: uuid.UUID | None) -> Permission:
        if self.permissions.get_by_code(data.code):
            raise AlreadyExistsError(f"Permission '{data.code}' already exists.")

        permission = Permission(
            code=data.code,
            module=data.module,
            action=data.action,
            description=data.description,
            created_by=actor_id,
            updated_by=actor_id,
        )
        self.permissions.create(permission)
        self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="Permission", entity_id=str(permission.id)
        )
        self.db.commit()
        self.db.refresh(permission)
        return permission

    def get(self, permission_id: uuid.UUID) -> Permission:
        permission = self.permissions.get_by_id(permission_id)
        if not permission:
            raise NotFoundError("Permission not found.")
        return permission

    def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = self.permissions.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["code", "module", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, permission_id: uuid.UUID, data: PermissionUpdate, *, actor_id: uuid.UUID | None) -> Permission:
        permission = self.get(permission_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.permissions.update(permission, update_data)
        self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Permission",
            entity_id=str(permission.id),
            changes=update_data,
        )
        self.db.commit()
        self.db.refresh(permission)
        return permission

    def delete(self, permission_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        permission = self.get(permission_id)
        self.permissions.delete(permission)
        self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="Permission", entity_id=str(permission.id)
        )
        self.db.commit()
