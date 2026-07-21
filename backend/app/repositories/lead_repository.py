"""Data access for Lead documents."""
from app.models.lead import Lead
from app.repositories.base_repository import BaseRepository


class LeadRepository(BaseRepository[Lead]):
    model = Lead

    def __init__(self) -> None:
        super().__init__(Lead)
