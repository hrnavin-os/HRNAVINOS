"""Data access for Batch entities."""
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.repositories.base_repository import BaseRepository


class BatchRepository(BaseRepository[Batch]):
    model = Batch

    def __init__(self, db: Session) -> None:
        super().__init__(db, Batch)
