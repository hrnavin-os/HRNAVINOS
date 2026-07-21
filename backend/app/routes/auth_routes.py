"""HTTP routes for the Authentication module."""
from fastapi import APIRouter, Depends, Request, status

from app.config.settings import settings
from app.core.dependencies import get_current_user, get_role_permission_codes, get_user_role
from app.middleware.rate_limiter import limiter
from app.models.user import User
from app.schemas.auth_schema import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(request: Request, payload: LoginRequest) -> TokenResponse:
    service = AuthService()
    return await service.authenticate(
        email=payload.email,
        password=payload.password,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, payload: RefreshTokenRequest) -> TokenResponse:
    service = AuthService()
    return await service.refresh(
        refresh_token=payload.refresh_token,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(payload: LogoutRequest) -> MessageResponse:
    service = AuthService()
    await service.logout(refresh_token=payload.refresh_token)
    return MessageResponse(message="Logged out successfully.")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(user: User = Depends(get_current_user)) -> MessageResponse:
    service = AuthService()
    await service.logout_all_sessions(user.id)
    return MessageResponse(message="All sessions logged out successfully.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
) -> MessageResponse:
    service = AuthService()
    await service.change_password(
        user=user, current_password=payload.current_password, new_password=payload.new_password
    )
    return MessageResponse(message="Password changed successfully. Please log in again.")


@router.get("/me", response_model=CurrentUserResponse, status_code=status.HTTP_200_OK)
async def me(user: User = Depends(get_current_user)) -> CurrentUserResponse:
    role = await get_user_role(user)
    permission_codes = await get_role_permission_codes(role)
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=role.name if role else None,
        permissions=sorted(permission_codes),
        is_active=user.is_active,
        is_verified=user.is_verified,
    )
