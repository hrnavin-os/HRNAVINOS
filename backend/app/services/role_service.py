"""Business logic for the Role Management module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import AlreadyExistsError, ForbiddenError, NotFoundError
from app.models.role import Role
from app.repositories.permission_repository import PermissionRepository
from app.repositories.role_repository import RoleRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.role_schema import RoleCreate, RoleUpdate
from app.services.audit_service import AuditService


class RoleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.roles = RoleRepository(db)
        self.permissions = PermissionRepository(db)
        self.audit = AuditService(db)

    def create(self, data: RoleCreate, *, actor_id: uuid.UUID | None) -> Role:
        if self.roles.name_exists(data.name):
            raise AlreadyExistsError(f"A role named '{data.name}' already exists.")

        role = Role(
            name=data.name, description=data.description, created_by=actor_id, updated_by=actor_id
        )
        if data.permission_ids:
            role.permissions = self.permissions.get_by_ids(data.permission_ids)

        self.roles.create(role)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Role", entity_id=str(role.id))
        self.db.commit()
        self.db.refresh(role)
        return role

    def get(self, role_id: uuid.UUID) -> Role:
        role = self.roles.get_by_id(role_id)
        if not role:
            raise NotFoundError("Role not found.")
        return role

    def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = self.roles.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, role_id: uuid.UUID, data: RoleUpdate, *, actor_id: uuid.UUID | None) -> Role:
        role = self.get(role_id)
        if role.is_system:
            raise ForbiddenError("System roles cannot be modified.")
        if data.name and self.roles.name_exists(data.name, exclude_id=role.id):
            raise AlreadyExistsError(f"A role named '{data.name}' already exists.")

        update_data = data.model_dump(exclude_unset=True, exclude={"permission_ids"})
        update_data["updated_by"] = actor_id
        self.roles.update(role, update_data)

        if data.permission_ids is not None:
            role.permissions = self.permissions.get_by_ids(data.permission_ids)

        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Role", entity_id=str(role.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(role)
        return role

    def delete(self, role_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        role = self.get(role_id)
        if role.is_system:
            raise ForbiddenError("System roles cannot be deleted.")
        self.roles.delete(role)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Role", entity_id=str(role.id))
        self.db.commit()
