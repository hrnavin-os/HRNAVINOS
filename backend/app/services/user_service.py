"""Business logic for the User Management module."""
import uuid

from app.core.security import hash_password
from app.exceptions.base import AlreadyExistsError, BadRequestError, NotFoundError
from app.models.staff_profile import AddressDetails, BankDetails, IdentityDetails
from app.models.user import User
from app.repositories.department_repository import DepartmentRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.department_schema import DepartmentSummaryResponse
from app.schemas.role_schema import RoleSummaryResponse
from app.schemas.user_schema import UserCreate, UserListResponse, UserResponse, UserUpdate
from app.services.audit_service import AuditService

# The profile sections a form sends whole (see UserUpdate).
PROFILE_SECTIONS = ("personal", "employment", "identity", "address", "bank")

# What the Users and Staffs search box matches: the name and login, and the
# things somebody looking a colleague up actually has to hand.
SEARCH_FIELDS = [
    "email",
    "first_name",
    "last_name",
    "phone",
    "employment.employee_code",
    "employment.designation",
]


def _settle_address(address: AddressDetails) -> AddressDetails:
    """The permanent address is the current one when the form says so.

    Copied rather than left for readers to resolve, so every reader of the
    record - the Staffs directory, an export, the database itself - sees the
    same address without having to know about the flag.
    """
    if address.permanent_same_as_current:
        return address.model_copy(update={"permanent": address.current.model_copy()})
    return address


class UserService:
    def __init__(self) -> None:
        self.users = UserRepository()
        self.roles = RoleRepository()
        self.departments = DepartmentRepository()
        self.audit = AuditService()

    async def deleter_name(self, user) -> str | None:
        """Who deleted this record, by name. None on a live one.

        Resolved per row rather than snapshotted on the document: the Deleted
        tab is short, and a name is the one thing here that should follow the
        person if they are renamed.
        """
        if not user.is_deleted or not user.deleted_by:
            return None
        actor = await self.users.get_by_id(user.deleted_by)
        return f"{actor.first_name} {actor.last_name}".strip() if actor else None

    async def _role_summary(self, role_id: uuid.UUID | None) -> RoleSummaryResponse | None:
        """MongoDB has no relationship loading: resolve `role_id` -> Role
        document explicitly to embed a summary in User responses."""
        if not role_id:
            return None
        role = await self.roles.get_by_id(role_id)
        return RoleSummaryResponse.model_validate(role) if role else None

    async def _department_summary(self, department_id: uuid.UUID | None) -> DepartmentSummaryResponse | None:
        if not department_id:
            return None
        # A deleted department still names the staff who were in it until
        # they are moved - better than the column going blank.
        department = await self.departments.get_by_id(department_id, include_deleted=True)
        return DepartmentSummaryResponse.model_validate(department) if department else None

    async def to_response(self, user: User) -> UserResponse:
        return UserResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            is_active=user.is_active,
            is_verified=user.is_verified,
            can_sign_in=user.can_sign_in,
            last_login_at=user.last_login_at,
            role=await self._role_summary(user.role_id),
            department=await self._department_summary(user.department_id),
            personal=user.personal,
            employment=user.employment,
            identity=user.identity,
            address=user.address,
            bank=user.bank,
            created_at=user.created_at,
            updated_at=user.updated_at,
            deleted_at=user.deleted_at,
            deleted_by_name=await self.deleter_name(user),
            deleted_reason=user.deleted_reason,
        )

    @staticmethod
    def without_sensitive_details(response: UserResponse) -> UserResponse:
        """The same record with its ID numbers, documents and bank account
        left out - for a reader who may see the user but not those."""
        return response.model_copy(update={"identity": IdentityDetails(), "bank": BankDetails()})

    async def to_list_response(self, user: User) -> UserListResponse:
        return UserListResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            can_sign_in=user.can_sign_in,
            department=await self._department_summary(user.department_id),
            is_active=user.is_active,
            role=await self._role_summary(user.role_id),
            deleted_at=user.deleted_at,
            deleted_by_name=await self.deleter_name(user),
            deleted_reason=user.deleted_reason,
        )

    async def _check_role(self, role_id: uuid.UUID) -> None:
        if not await self.roles.get_by_id(role_id):
            raise NotFoundError("Specified role does not exist.")

    async def _check_department(self, department_id: uuid.UUID) -> None:
        department = await self.departments.get_by_id(department_id)
        if not department:
            raise NotFoundError("Specified department does not exist.")
        if not department.is_active:
            raise BadRequestError(f"The {department.name} department is inactive. Choose an active one.")

    async def create(self, data: UserCreate, *, actor_id: uuid.UUID | None) -> User:
        email = data.email.lower() if data.email else None
        if email and await self.users.email_exists(email):
            raise AlreadyExistsError(f"A user with email '{email}' already exists.")
        await self._check_role(data.role_id)
        await self._check_department(data.department_id)

        user = User(
            email=email,
            password_hash=hash_password(data.password) if data.password else None,
            first_name=data.first_name.strip(),
            last_name=(data.last_name or "").strip(),
            phone=data.phone,
            role_id=data.role_id,
            department_id=data.department_id,
            is_active=data.is_active,
            personal=data.personal,
            employment=data.employment,
            identity=data.identity,
            address=_settle_address(data.address),
            bank=data.bank,
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

    async def list(
        self,
        params: PaginationParams,
        *,
        role_id: uuid.UUID | None = None,
        department_id: uuid.UUID | None = None,
        deleted: bool = False,
    ) -> PaginatedResponse:
        # The Deleted tab is the same query with the flag flipped, rather than
        # its own endpoint: one list, one shape, one place to change when a
        # column is added to it.
        filters: dict = {"is_deleted": deleted}
        if role_id:
            filters["role_id"] = role_id
        if department_id:
            filters["department_id"] = department_id
        items, total = await self.users.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=SEARCH_FIELDS,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            include_deleted=deleted,
            filters=filters,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, user_id: uuid.UUID, data: UserUpdate, *, actor_id: uuid.UUID | None) -> User:
        user = await self.get(user_id)
        sent = data.model_fields_set

        if data.role_id:
            await self._check_role(data.role_id)
        # Only a move is checked against the department being active: somebody
        # already in a department that has since been retired can still have
        # the rest of their record edited.
        if data.department_id and data.department_id != user.department_id:
            await self._check_department(data.department_id)

        update_data: dict = {}
        for field in ("first_name", "last_name", "phone", "role_id", "department_id", "is_active"):
            if field in sent and not (field == "is_active" and data.is_active is None):
                update_data[field] = getattr(data, field)
        if "last_name" in update_data:
            update_data["last_name"] = (update_data["last_name"] or "").strip()
        # Assigned as the section models themselves: the repository sets them
        # straight onto the document, and a plain dict there would be saved
        # fine but break every read of the same object afterwards.
        for section in PROFILE_SECTIONS:
            if section in sent and getattr(data, section) is not None:
                update_data[section] = getattr(data, section)
        if "address" in update_data:
            update_data["address"] = _settle_address(update_data["address"])

        update_data.update(await self._login_changes(user, data))

        update_data["updated_by"] = actor_id
        await self.users.update(user, update_data)
        # Field names only, not values: this now carries bank and ID numbers,
        # and the audit log is read far more widely than the record is.
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="User",
            entity_id=str(user.id),
            changes={"fields": sorted(key for key in update_data if key not in ("updated_by", "password_hash"))},
        )
        return user

    async def _login_changes(self, user: User, data: UserUpdate) -> dict:
        """A login for somebody recorded without one - and nothing else.

        An admin edit can give a member of staff their first login, but cannot
        change an existing one: a changed email locks the owner out, and an
        admin setting somebody's password is signing in as them. Those go
        through the user's own change-password.
        """
        if not data.email and not data.password:
            return {}
        if user.can_sign_in:
            if data.password or (data.email and data.email.lower() != user.email):
                raise BadRequestError("This user already has a login. Its email and password can't be changed here.")
            return {}
        if not (data.email and data.password):
            raise BadRequestError("Give both an email and a password to let this user sign in.")
        email = data.email.lower()
        if await self.users.email_exists(email, exclude_id=user.id):
            raise AlreadyExistsError(f"A user with email '{email}' already exists.")
        return {"email": email, "password_hash": hash_password(data.password)}

    async def deactivate(self, user_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> User:
        user = await self.get(user_id)
        user.is_active = False
        user.updated_by = actor_id
        await user.save()
        await self.audit.record(user_id=actor_id, action="DEACTIVATE", entity_type="User", entity_id=str(user.id))
        return user

    async def delete(self, user_id: uuid.UUID, *, reason: str, actor_id: uuid.UUID | None) -> None:
        """Soft-deletes a user, on the record.

        The reason is required rather than optional: removing somebody's
        access is a decision, and the Deleted tab exists so those decisions
        can be read back months later. An optional field would be empty on
        exactly the rows anyone eventually asks about.
        """
        user = await self.get(user_id)
        note = reason.strip()
        if not note:
            raise BadRequestError("Give a reason for deleting this user.")
        await self.users.delete(user, actor_id=actor_id, reason=note)
        await self.audit.record(
            user_id=actor_id,
            action="DELETE",
            entity_type="User",
            entity_id=str(user.id),
            changes={"reason": note},
        )
