"""Data access for Ticket entities."""
from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.repositories.base_repository import BaseRepository


class TicketRepository(BaseRepository[Ticket]):
    model = Ticket

    def __init__(self, db: Session) -> None:
        super().__init__(db, Ticket)
