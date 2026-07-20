"""Business logic for the Tickets (Help Desk) module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.ticket import Ticket
from app.repositories.ticket_repository import TicketRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.ticket_schema import TicketAssign, TicketCreate, TicketUpdate
from app.services.audit_service import AuditService


class TicketService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tickets = TicketRepository(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    def create(self, data: TicketCreate, *, actor_id: uuid.UUID) -> Ticket:
        ticket = Ticket(**data.model_dump(), raised_by=actor_id, created_by=actor_id, updated_by=actor_id)
        self.tickets.create(ticket)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Ticket", entity_id=str(ticket.id))
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def get(self, ticket_id: uuid.UUID) -> Ticket:
        ticket = self.tickets.get_by_id(ticket_id)
        if not ticket:
            raise NotFoundError("Ticket not found.")
        return ticket

    def list(
        self, params: PaginationParams, *, raised_by: uuid.UUID | None = None, assigned_to: uuid.UUID | None = None
    ) -> PaginatedResponse:
        filters = {}
        if raised_by:
            filters["raised_by"] = raised_by
        if assigned_to:
            filters["assigned_to"] = assigned_to
        items, total = self.tickets.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["subject", "description"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, ticket_id: uuid.UUID, data: TicketUpdate, *, actor_id: uuid.UUID | None) -> Ticket:
        ticket = self.get(ticket_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.tickets.update(ticket, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Ticket", entity_id=str(ticket.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def assign(self, ticket_id: uuid.UUID, data: TicketAssign, *, actor_id: uuid.UUID | None) -> Ticket:
        ticket = self.get(ticket_id)
        if not self.users.get_by_id(data.assigned_to):
            raise NotFoundError("Specified assignee does not exist.")
        ticket.assigned_to = data.assigned_to
        ticket.updated_by = actor_id
        self.audit.record(
            user_id=actor_id,
            action="ASSIGN",
            entity_type="Ticket",
            entity_id=str(ticket.id),
            changes={"assigned_to": str(data.assigned_to)},
        )
        self.db.commit()
        self.db.refresh(ticket)
        return ticket
