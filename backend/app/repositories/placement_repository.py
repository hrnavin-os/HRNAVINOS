"""Data access for Placement documents."""
from app.models.placement import Placement
from app.repositories.base_repository import BaseRepository


class PlacementRepository(BaseRepository[Placement]):
    model = Placement

    def __init__(self) -> None:
        super().__init__(Placement)
