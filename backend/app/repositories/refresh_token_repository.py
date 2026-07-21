"""Data access for RefreshToken documents."""
import uuid
from datetime import datetime, timezone

from app.models.refresh_token import RefreshToken
from app.repositories.base_repository import BaseRepository


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    def __init__(self) -> None:
        super().__init__(RefreshToken)

    async def get_by_jti(self, jti: str) -> RefreshToken | None:
        return await RefreshToken.find_one({"jti": jti})

    async def revoke(self, token: RefreshToken) -> None:
        token.revoked = True
        token.revoked_at = datetime.now(timezone.utc)
        await token.save()

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        await RefreshToken.find({"user_id": user_id, "revoked": False}).update(
            {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}}
        )
