"""Business logic for the Batch Management module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.batch import Batch
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.tutor_repository import TutorRepository
from app.schemas.batch_schema import BatchCreate, BatchUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.audit_service import AuditService


class BatchService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.batches = BatchRepository(db)
        self.courses = CourseRepository(db)
        self.tutors = TutorRepository(db)
        self.audit = AuditService(db)

    def create(self, data: BatchCreate, *, actor_id: uuid.UUID | None) -> Batch:
        if not self.courses.get_by_id(data.course_id):
            raise NotFoundError("Specified course does not exist.")
        if data.tutor_id and not self.tutors.get_by_id(data.tutor_id):
            raise NotFoundError("Specified tutor does not exist.")

        batch = Batch(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        self.batches.create(batch)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Batch", entity_id=str(batch.id))
        self.db.commit()
        self.db.refresh(batch)
        return batch

    def get(self, batch_id: uuid.UUID) -> Batch:
        batch = self.batches.get_by_id(batch_id)
        if not batch:
            raise NotFoundError("Batch not found.")
        return batch

    def list(self, params: PaginationParams, *, course_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = self.batches.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"course_id": course_id} if course_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, batch_id: uuid.UUID, data: BatchUpdate, *, actor_id: uuid.UUID | None) -> Batch:
        batch = self.get(batch_id)
        if data.tutor_id and not self.tutors.get_by_id(data.tutor_id):
            raise NotFoundError("Specified tutor does not exist.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.batches.update(batch, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Batch", entity_id=str(batch.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

    def delete(self, batch_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        batch = self.get(batch_id)
        self.batches.delete(batch)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Batch", entity_id=str(batch.id))
        self.db.commit()
