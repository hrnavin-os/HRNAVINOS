"""Data access for Placement entities."""
from sqlalchemy.orm import Session

from app.models.placement import Placement
from app.repositories.base_repository import BaseRepository


class PlacementRepository(BaseRepository[Placement]):
    model = Placement

    def __init__(self, db: Session) -> None:
        super().__init__(db, Placement)
