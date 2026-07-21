"""Business logic for the Placement module."""
import uuid

from app.exceptions.base import NotFoundError
from app.models.placement import Placement
from app.repositories.company_repository import CompanyRepository
from app.repositories.placement_repository import PlacementRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.placement_schema import PlacementCreate, PlacementUpdate
from app.services.audit_service import AuditService


class PlacementService:
    def __init__(self) -> None:
        self.placements = PlacementRepository()
        self.students = StudentRepository()
        self.companies = CompanyRepository()
        self.audit = AuditService()

    async def create(self, data: PlacementCreate, *, actor_id: uuid.UUID | None) -> Placement:
        if not await self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        if not await self.companies.get_by_id(data.company_id):
            raise NotFoundError("Specified company does not exist.")
        placement = Placement(
            **data.model_dump(), placed_by=actor_id, created_by=actor_id, updated_by=actor_id
        )
        await self.placements.create(placement)
        await self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="Placement", entity_id=str(placement.id)
        )
        return placement

    async def get(self, placement_id: uuid.UUID) -> Placement:
        placement = await self.placements.get_by_id(placement_id)
        if not placement:
            raise NotFoundError("Placement not found.")
        return placement

    async def list(self, params: PaginationParams, *, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = await self.placements.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"student_id": student_id} if student_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, placement_id: uuid.UUID, data: PlacementUpdate, *, actor_id: uuid.UUID | None) -> Placement:
        placement = await self.get(placement_id)
        if data.company_id and not await self.companies.get_by_id(data.company_id):
            raise NotFoundError("Specified company does not exist.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.placements.update(placement, update_data)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Placement",
            entity_id=str(placement.id),
            changes=update_data,
        )
        return placement

    async def delete(self, placement_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        placement = await self.get(placement_id)
        await self.placements.delete(placement)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="Placement", entity_id=str(placement.id)
        )
