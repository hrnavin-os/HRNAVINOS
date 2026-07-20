"""Shared FastAPI dependencies: current user resolution and permission checks."""
import uuid

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import TokenType, decode_token
from app.database.session import get_db
from app.exceptions.base import ForbiddenError, UnauthorizedError
from app.models.user import User
from app.repositories.user_repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
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

    user = UserRepository(db).get_by_id(uuid.UUID(user_id))
    if not user or user.is_deleted:
        raise UnauthorizedError("User no longer exists.")
    if not user.is_active:
        raise UnauthorizedError("User account is deactivated.")

    return user


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    return user


class RequirePermissions:
    """Dependency factory enforcing that the current user's role grants ALL given permission codes.

    Usage: `Depends(RequirePermissions("students.create"))`
    Super Admins bypass all permission checks.
    """

    def __init__(self, *permission_codes: str) -> None:
        self.permission_codes = set(permission_codes)

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role and user.role.name == "Super Admin":
            return user

        granted = {perm.code for perm in (user.role.permissions if user.role else [])}
        missing = self.permission_codes - granted
        if missing:
            raise ForbiddenError(
                f"Missing required permission(s): {', '.join(sorted(missing))}"
            )
        return user


class RequireRoles:
    """Dependency factory enforcing that the current user has one of the given role names."""

    def __init__(self, *role_names: str) -> None:
        self.role_names = set(role_names)

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if user.role and user.role.name in self.role_names:
            return user
        raise ForbiddenError(
            f"This action requires one of the following roles: {', '.join(sorted(self.role_names))}"
        )
