"""Data access for Admission entities."""
from sqlalchemy.orm import Session

from app.models.admission import Admission
from app.repositories.base_repository import BaseRepository


class AdmissionRepository(BaseRepository[Admission]):
    model = Admission

    def __init__(self, db: Session) -> None:
        super().__init__(db, Admission)
