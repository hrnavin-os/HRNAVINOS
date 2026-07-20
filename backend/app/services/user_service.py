"""Business logic for the User Management module."""
import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.user import User
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.user_schema import UserCreate, UserUpdate
from app.services.audit_service import AuditService


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.roles = RoleRepository(db)
        self.audit = AuditService(db)

    def create(self, data: UserCreate, *, actor_id: uuid.UUID | None) -> User:
        if self.users.email_exists(data.email):
            raise AlreadyExistsError(f"A user with email '{data.email}' already exists.")
        if data.role_id and not self.roles.get_by_id(data.role_id):
            raise NotFoundError("Specified role does not exist.")

        user = User(
            email=data.email.lower(),
            password_hash=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            role_id=data.role_id,
            is_active=data.is_active,
            created_by=actor_id,
            updated_by=actor_id,
        )
        self.users.create(user)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="User", entity_id=str(user.id))
        self.db.commit()
        self.db.refresh(user)
        return user

    def get(self, user_id: uuid.UUID) -> User:
        user = self.users.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user

    def list(self, params: PaginationParams, *, role_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = self.users.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["email", "first_name", "last_name"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"role_id": role_id} if role_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, user_id: uuid.UUID, data: UserUpdate, *, actor_id: uuid.UUID | None) -> User:
        user = self.get(user_id)
        if data.role_id and not self.roles.get_by_id(data.role_id):
            raise NotFoundError("Specified role does not exist.")

        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.users.update(user, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="User", entity_id=str(user.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def deactivate(self, user_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> User:
        user = self.get(user_id)
        user.is_active = False
        user.updated_by = actor_id
        self.audit.record(user_id=actor_id, action="DEACTIVATE", entity_type="User", entity_id=str(user.id))
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        user = self.get(user_id)
        self.users.delete(user)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="User", entity_id=str(user.id))
        self.db.commit()
