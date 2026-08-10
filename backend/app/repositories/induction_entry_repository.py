"""Data access for InductionEntry documents."""
from app.models.induction_entry import InductionEntry
from app.repositories.base_repository import BaseRepository


class InductionEntryRepository(BaseRepository[InductionEntry]):
    model = InductionEntry

    def __init__(self) -> None:
        super().__init__(InductionEntry)
