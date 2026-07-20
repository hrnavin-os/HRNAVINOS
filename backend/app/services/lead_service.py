"""Business logic for the Lead Management (CRM / Pre-Sales) module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.lead import Lead
from app.repositories.lead_repository import LeadRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.lead_schema import LeadAssign, LeadCreate, LeadUpdate
from app.services.audit_service import AuditService


class LeadService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.leads = LeadRepository(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    def create(self, data: LeadCreate, *, actor_id: uuid.UUID | None) -> Lead:
        if data.assigned_to and not self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        lead = Lead(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        self.leads.create(lead)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Lead", entity_id=str(lead.id))
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def get(self, lead_id: uuid.UUID) -> Lead:
        lead = self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        return lead

    def list(
        self, params: PaginationParams, *, status: str | None = None, assigned_to: uuid.UUID | None = None
    ) -> PaginatedResponse:
        filters = {}
        if status:
            filters["status"] = status
        if assigned_to:
            filters["assigned_to"] = assigned_to
        items, total = self.leads.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "phone", "email"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, lead_id: uuid.UUID, data: LeadUpdate, *, actor_id: uuid.UUID | None) -> Lead:
        lead = self.get(lead_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.leads.update(lead, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Lead", entity_id=str(lead.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def assign(self, lead_id: uuid.UUID, data: LeadAssign, *, actor_id: uuid.UUID | None) -> Lead:
        lead = self.get(lead_id)
        if not self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        lead.assigned_to = data.assigned_to
        lead.updated_by = actor_id
        self.audit.record(
            user_id=actor_id,
            action="ASSIGN",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"assigned_to": str(data.assigned_to)},
        )
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def delete(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        lead = self.get(lead_id)
        self.leads.delete(lead)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Lead", entity_id=str(lead.id))
        self.db.commit()
