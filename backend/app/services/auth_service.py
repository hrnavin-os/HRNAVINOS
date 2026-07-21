"""Business logic for authentication: login, token refresh, logout, password changes."""
import uuid
from datetime import datetime, timezone

from app.core.security import (
    JWTError,
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.exceptions.base import UnauthorizedError
from app.models.login_history import LoginHistory
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.login_history_repository import LoginHistoryRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import TokenResponse
from app.services.audit_service import AuditService


class AuthService:
    def __init__(self) -> None:
        self.users = UserRepository()
        self.roles = RoleRepository()
        self.refresh_tokens = RefreshTokenRepository()
        self.login_history = LoginHistoryRepository()
        self.audit = AuditService()

    async def authenticate(
        self, *, email: str, password: str, ip_address: str | None, user_agent: str | None
    ) -> TokenResponse:
        user = await self.users.get_by_email(email)

        if not user or not verify_password(password, user.password_hash):
            await self.login_history.create(
                LoginHistory(
                    user_id=user.id if user else None,
                    email_attempted=email,
                    success=False,
                    failure_reason="Invalid credentials",
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )
            raise UnauthorizedError("Invalid email or password.")

        if not user.is_active:
            await self.login_history.create(
                LoginHistory(
                    user_id=user.id,
                    email_attempted=email,
                    success=False,
                    failure_reason="Account deactivated",
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )
            raise UnauthorizedError("This account has been deactivated.")

        tokens = await self._issue_tokens(user, ip_address=ip_address, user_agent=user_agent)

        user.last_login_at = datetime.now(timezone.utc)
        await user.save()

        await self.login_history.create(
            LoginHistory(
                user_id=user.id, email_attempted=email, success=True, ip_address=ip_address, user_agent=user_agent
            )
        )
        await self.audit.record(
            user_id=user.id,
            action="LOGIN",
            entity_type="User",
            entity_id=str(user.id),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return tokens

    async def refresh(self, *, refresh_token: str, ip_address: str | None, user_agent: str | None) -> TokenResponse:
        try:
            payload = decode_token(refresh_token)
        except JWTError as exc:
            raise UnauthorizedError("Invalid or expired refresh token.") from exc

        if payload.get("type") != TokenType.REFRESH.value:
            raise UnauthorizedError("Invalid token type; refresh token required.")

        jti = payload.get("jti")
        stored = await self.refresh_tokens.get_by_jti(jti) if jti else None
        if not stored or stored.revoked:
            raise UnauthorizedError("Refresh token has been revoked or is unknown.")
        if stored.expires_at < datetime.now(timezone.utc):
            raise UnauthorizedError("Refresh token has expired.")

        user = await self.users.get_by_id(stored.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("User no longer active.")

        # Rotate: revoke the old refresh token and issue a brand new pair.
        await self.refresh_tokens.revoke(stored)
        return await self._issue_tokens(user, ip_address=ip_address, user_agent=user_agent)

    async def logout(self, *, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token)
        except JWTError:
            return
        jti = payload.get("jti")
        if not jti:
            return
        stored = await self.refresh_tokens.get_by_jti(jti)
        if stored and not stored.revoked:
            await self.refresh_tokens.revoke(stored)

    async def logout_all_sessions(self, user_id: uuid.UUID) -> None:
        await self.refresh_tokens.revoke_all_for_user(user_id)

    async def change_password(self, *, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.password_hash):
            raise UnauthorizedError("Current password is incorrect.")
        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        await user.save()
        await self.refresh_tokens.revoke_all_for_user(user.id)
        await self.audit.record(
            user_id=user.id, action="PASSWORD_CHANGE", entity_type="User", entity_id=str(user.id)
        )

    async def _issue_tokens(self, user: User, *, ip_address: str | None, user_agent: str | None) -> TokenResponse:
        from app.config.settings import settings

        role = await self.roles.get_by_id(user.role_id) if user.role_id else None

        access_token, _, _ = create_access_token(
            subject=str(user.id),
            extra_claims={"role": role.name if role else None},
        )
        refresh_token, refresh_jti, refresh_expires = create_refresh_token(subject=str(user.id))

        await self.refresh_tokens.create(
            RefreshToken(
                user_id=user.id,
                jti=refresh_jti,
                expires_at=refresh_expires,
                device_info=user_agent,
                ip_address=ip_address,
            )
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
