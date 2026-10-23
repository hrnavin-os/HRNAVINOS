"""Data access for User documents."""
import uuid

from app.models.user import User
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def __init__(self) -> None:
        super().__init__(User)

    async def get_by_email(self, email: str, *, include_deleted: bool = False) -> User | None:
        query: dict = {"email": email.lower()}
        if not include_deleted:
            query["is_deleted"] = False
        return await User.find_one(query)

    async def names_by_id(self, user_ids) -> dict[uuid.UUID, str]:
        """"First Last" for each of these users, in one query.

        Deleted users are included: these names go against things people did,
        and who did it stays true after they have left.
        """
        ids = list({user_id for user_id in user_ids if user_id})
        if not ids:
            return {}
        users = await User.find({"_id": {"$in": ids}}).to_list()
        return {user.id: user.full_name for user in users}

    async def email_exists(self, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"email": email.lower()}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await User.find_one(query) is not None
