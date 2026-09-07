"""Shared FastAPI dependencies: current user resolution and permission checks."""
import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from app.core.security import TokenType, decode_token
from app.exceptions.base import ForbiddenError, UnauthorizedError
from app.models.role import Role
from app.models.user import User
from app.repositories.permission_repository import PermissionRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> User:
    if not token:
        raise UnauthorizedError("Not authenticated.")

    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise UnauthorizedError("Invalid or expired token.") from exc

    if payload.get("type") != TokenType.ACCESS.value:
        raise UnauthorizedError("Invalid token type; access token required.")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid token payload.")

    user = await UserRepository().get_by_id(uuid.UUID(user_id))
    if not user:
        raise UnauthorizedError("User no longer exists.")
    if not user.is_active:
        raise UnauthorizedError("User account is deactivated.")

    return user


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    return user


async def get_user_role(user: User) -> Role | None:
    """MongoDB has no joins: resolve a user's role with an explicit fetch
    rather than a SQLAlchemy-style `user.role` relationship."""
    if not user.role_id:
        return None
    return await RoleRepository().get_by_id(user.role_id)


async def get_role_permission_codes(role: Role | None) -> set[str]:
    if not role or not role.permission_ids:
        return set()
    permissions = await PermissionRepository().get_by_ids(role.permission_ids)
    return {permission.code for permission in permissions}


async def get_actor_scope(user: User) -> str | None:
    """Which Form Collection section (if any) this user's role restricts them
    to. None means unscoped - sees every lead, matching every pre-existing
    role's behavior."""
    role = await get_user_role(user)
    return role.scoped_section if role else None


class RequirePermissions:
    """Dependency factory enforcing that the current user's role grants ALL given permission codes.

    Usage: `Depends(RequirePermissions("students.create"))`
    Super Admins bypass all permission checks.
    """

    def __init__(self, *permission_codes: str) -> None:
        self.permission_codes = set(permission_codes)

    async def __call__(self, user: User = Depends(get_current_user)) -> User:
        role = await get_user_role(user)
        if role and role.name == "Super Admin":
            return user

        granted = await get_role_permission_codes(role)
        missing = self.permission_codes - granted
        if missing:
            raise ForbiddenError(
                f"Missing required permission(s): {', '.join(sorted(missing))}"
            )
        return user


class RequireAnyPermission:
    """Dependency factory enforcing that the current user's role grants AT LEAST
    ONE of the given permission codes.

    For a read that more than one board legitimately makes. The Foundation Form
    config, for instance, is drawn by the Statistics board, Form Collection,
    Lead Dashboard, Programs and the role editor's section dropdown - five
    menus with five permissions of their own. Requiring one shared code there
    would mean a role granted only Statistics still needed leads.view to fill
    in its section filter, which is exactly the coupling that giving each menu
    its own permission is meant to undo.

    Usage: `Depends(RequireAnyPermission("leads.view", "lead_analytics.view"))`
    Super Admins bypass all permission checks.
    """

    def __init__(self, *permission_codes: str) -> None:
        self.permission_codes = set(permission_codes)

    async def __call__(self, user: User = Depends(get_current_user)) -> User:
        role = await get_user_role(user)
        if role and role.name == "Super Admin":
            return user

        granted = await get_role_permission_codes(role)
        if not self.permission_codes & granted:
            raise ForbiddenError(
                f"Requires one of the following permission(s): {', '.join(sorted(self.permission_codes))}"
            )
        return user


class RequireRoles:
    """Dependency factory enforcing that the current user has one of the given role names."""

    def __init__(self, *role_names: str) -> None:
        self.role_names = set(role_names)

    async def __call__(self, user: User = Depends(get_current_user)) -> User:
        role = await get_user_role(user)
        if role and role.name in self.role_names:
            return user
        raise ForbiddenError(
            f"This action requires one of the following roles: {', '.join(sorted(self.role_names))}"
        )
