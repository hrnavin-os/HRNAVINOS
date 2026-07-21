"""Business logic for the Tutor Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.tutor import Tutor
from app.repositories.tutor_repository import TutorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.tutor_schema import TutorCreate, TutorUpdate
from app.services.audit_service import AuditService


class TutorService:
    def __init__(self) -> None:
        self.tutors = TutorRepository()
        self.users = UserRepository()
        self.audit = AuditService()

    async def create(self, data: TutorCreate, *, actor_id: uuid.UUID | None) -> Tutor:
        if not await self.users.get_by_id(data.user_id):
            raise NotFoundError("Specified user does not exist.")
        if await self.tutors.get_by_user_id(data.user_id):
            raise AlreadyExistsError("This user already has a tutor profile.")

        tutor = Tutor(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        await self.tutors.create(tutor)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Tutor", entity_id=str(tutor.id))
        return tutor

    async def get(self, tutor_id: uuid.UUID) -> Tutor:
        tutor = await self.tutors.get_by_id(tutor_id)
        if not tutor:
            raise NotFoundError("Tutor not found.")
        return tutor

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.tutors.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["specialization"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, tutor_id: uuid.UUID, data: TutorUpdate, *, actor_id: uuid.UUID | None) -> Tutor:
        tutor = await self.get(tutor_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.tutors.update(tutor, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Tutor", entity_id=str(tutor.id), changes=update_data
        )
        return tutor

    async def delete(self, tutor_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        tutor = await self.get(tutor_id)
        await self.tutors.delete(tutor)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Tutor", entity_id=str(tutor.id))
