"""Data access for Lead entities."""
from sqlalchemy.orm import Session

from app.models.lead import Lead
from app.repositories.base_repository import BaseRepository


class LeadRepository(BaseRepository[Lead]):
    model = Lead

    def __init__(self, db: Session) -> None:
        super().__init__(db, Lead)
