"""Data access for Admission documents."""
from app.models.admission import Admission
from app.repositories.base_repository import BaseRepository


class AdmissionRepository(BaseRepository[Admission]):
    model = Admission

    def __init__(self) -> None:
        super().__init__(Admission)
