"""Business logic for the Placement module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.placement import Placement
from app.repositories.placement_repository import PlacementRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.placement_schema import PlacementCreate, PlacementUpdate
from app.services.audit_service import AuditService


class PlacementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.placements = PlacementRepository(db)
        self.students = StudentRepository(db)
        self.audit = AuditService(db)

    def create(self, data: PlacementCreate, *, actor_id: uuid.UUID | None) -> Placement:
        if not self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        placement = Placement(
            **data.model_dump(), placed_by=actor_id, created_by=actor_id, updated_by=actor_id
        )
        self.placements.create(placement)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Placement", entity_id=str(placement.id))
        self.db.commit()
        self.db.refresh(placement)
        return placement

    def get(self, placement_id: uuid.UUID) -> Placement:
        placement = self.placements.get_by_id(placement_id)
        if not placement:
            raise NotFoundError("Placement not found.")
        return placement

    def list(self, params: PaginationParams, *, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = self.placements.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["company_name", "job_role"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"student_id": student_id} if student_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, placement_id: uuid.UUID, data: PlacementUpdate, *, actor_id: uuid.UUID | None) -> Placement:
        placement = self.get(placement_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.placements.update(placement, update_data)
        self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Placement",
            entity_id=str(placement.id),
            changes=update_data,
        )
        self.db.commit()
        self.db.refresh(placement)
        return placement

    def delete(self, placement_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        placement = self.get(placement_id)
        self.placements.delete(placement)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Placement", entity_id=str(placement.id))
        self.db.commit()
