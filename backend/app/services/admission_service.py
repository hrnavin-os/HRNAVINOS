"""Business logic for the Admissions module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.admission import Admission
from app.models.enums import LeadStatus
from app.repositories.admission_repository import AdmissionRepository
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.admission_schema import AdmissionCreate, AdmissionUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.audit_service import AuditService


class AdmissionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.admissions = AdmissionRepository(db)
        self.students = StudentRepository(db)
        self.courses = CourseRepository(db)
        self.batches = BatchRepository(db)
        self.leads = LeadRepository(db)
        self.audit = AuditService(db)

    def create(self, data: AdmissionCreate, *, actor_id: uuid.UUID | None) -> Admission:
        if not self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        if not self.courses.get_by_id(data.course_id):
            raise NotFoundError("Specified course does not exist.")
        if data.batch_id and not self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")

        admission = Admission(
            **data.model_dump(), admitted_by=actor_id, created_by=actor_id, updated_by=actor_id
        )
        self.admissions.create(admission)

        if data.lead_id:
            lead = self.leads.get_by_id(data.lead_id)
            if lead:
                lead.status = LeadStatus.CONVERTED
                lead.updated_by = actor_id

        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Admission", entity_id=str(admission.id))
        self.db.commit()
        self.db.refresh(admission)
        return admission

    def get(self, admission_id: uuid.UUID) -> Admission:
        admission = self.admissions.get_by_id(admission_id)
        if not admission:
            raise NotFoundError("Admission not found.")
        return admission

    def list(self, params: PaginationParams, *, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = self.admissions.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"student_id": student_id} if student_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, admission_id: uuid.UUID, data: AdmissionUpdate, *, actor_id: uuid.UUID | None) -> Admission:
        admission = self.get(admission_id)
        if data.batch_id and not self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.admissions.update(admission, update_data)
        self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Admission",
            entity_id=str(admission.id),
            changes=update_data,
        )
        self.db.commit()
        self.db.refresh(admission)
        return admission

    def delete(self, admission_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        admission = self.get(admission_id)
        self.admissions.delete(admission)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Admission", entity_id=str(admission.id))
        self.db.commit()
