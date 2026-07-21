"""Data access for Company documents."""
import uuid

from app.models.company import Company
from app.repositories.base_repository import BaseRepository


class CompanyRepository(BaseRepository[Company]):
    model = Company

    def __init__(self) -> None:
        super().__init__(Company)

    async def name_exists(self, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"name": name}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Company.find_one(query) is not None
