"""Business logic for the User Management module."""
import uuid

from app.core.security import hash_password
from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.user import User
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.role_schema import RoleSummaryResponse
from app.schemas.user_schema import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.audit_service import AuditService


class UserService:
    def __init__(self) -> None:
        self.users = UserRepository()
        self.roles = RoleRepository()
        self.audit = AuditService()

    async def _role_summary(self, role_id: uuid.UUID | None) -> RoleSummaryResponse | None:
        """MongoDB has no relationship loading: resolve `role_id` -> Role
        document explicitly to embed a summary in User responses."""
        if not role_id:
            return None
        role = await self.roles.get_by_id(role_id)
        return RoleSummaryResponse.model_validate(role) if role else None

    async def to_response(self, user: User) -> UserResponse:
        return UserResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            is_active=user.is_active,
            is_verified=user.is_verified,
            last_login_at=user.last_login_at,
            role=await self._role_summary(user.role_id),
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    async def to_list_response(self, user: User) -> UserListResponse:
        return UserListResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            is_active=user.is_active,
            role=await self._role_summary(user.role_id),
        )

    async def create(self, data: UserCreate, *, actor_id: uuid.UUID | None) -> User:
        if await self.users.email_exists(data.email):
            raise AlreadyExistsError(f"A user with email '{data.email}' already exists.")
        if data.role_id and not await self.roles.get_by_id(data.role_id):
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
        await self.users.create(user)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="User", entity_id=str(user.id))
        return user

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user

    async def list(self, params: PaginationParams, *, role_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = await self.users.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["email", "first_name", "last_name"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"role_id": role_id} if role_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, user_id: uuid.UUID, data: UserUpdate, *, actor_id: uuid.UUID | None) -> User:
        user = await self.get(user_id)
        if data.role_id and not await self.roles.get_by_id(data.role_id):
            raise NotFoundError("Specified role does not exist.")

        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.users.update(user, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="User", entity_id=str(user.id), changes=update_data
        )
        return user

    async def deactivate(self, user_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> User:
        user = await self.get(user_id)
        user.is_active = False
        user.updated_by = actor_id
        await user.save()
        await self.audit.record(user_id=actor_id, action="DEACTIVATE", entity_type="User", entity_id=str(user.id))
        return user

    async def delete(self, user_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        user = await self.get(user_id)
        await self.users.delete(user)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="User", entity_id=str(user.id))
