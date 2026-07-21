"""Data access for Ticket documents."""
from app.models.ticket import Ticket
from app.repositories.base_repository import BaseRepository


class TicketRepository(BaseRepository[Ticket]):
    model = Ticket

    def __init__(self) -> None:
        super().__init__(Ticket)
