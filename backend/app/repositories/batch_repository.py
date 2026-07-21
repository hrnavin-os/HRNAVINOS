"""Data access for Batch documents."""
from app.models.batch import Batch
from app.repositories.base_repository import BaseRepository


class BatchRepository(BaseRepository[Batch]):
    model = Batch

    def __init__(self) -> None:
        super().__init__(Batch)
