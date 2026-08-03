"""Data access for BatchAllocation documents."""
import uuid

from app.models.batch_allocation import BatchAllocation
from app.models.enums import AllocationStatus
from app.repositories.base_repository import BaseRepository

# A seat that still counts against a batch's capacity. Withdrawn seats are kept
# as history but free the place back up.
LIVE_STATUSES = [AllocationStatus.ALLOCATED, AllocationStatus.CONFIRMED]


class BatchAllocationRepository(BaseRepository[BatchAllocation]):
    model = BatchAllocation

    def __init__(self) -> None:
        super().__init__(BatchAllocation)

    async def list_for_batch(
        self, batch_id: uuid.UUID, *, statuses: list[AllocationStatus] | None = None
    ) -> list[BatchAllocation]:
        query = {"batch_id": batch_id, "is_deleted": False}
        if statuses:
            query["status"] = {"$in": statuses}
        return await BatchAllocation.find(query).sort("+created_at").to_list()

    async def get_live_for_lead(self, lead_id: uuid.UUID) -> BatchAllocation | None:
        """The lead's current seat, if any. Enforces 'one live seat per lead'."""
        return await BatchAllocation.find_one(
            {"lead_id": lead_id, "is_deleted": False, "status": {"$in": LIVE_STATUSES}}
        )

    async def allocated_lead_ids(self) -> set[uuid.UUID]:
        """Every lead holding a live seat, so the pending queue can exclude them."""
        rows = await BatchAllocation.find({"is_deleted": False, "status": {"$in": LIVE_STATUSES}}).to_list()
        return {row.lead_id for row in rows}

    async def count_live_for_batch(self, batch_id: uuid.UUID) -> int:
        return await BatchAllocation.find(
            {"batch_id": batch_id, "is_deleted": False, "status": {"$in": LIVE_STATUSES}}
        ).count()

    async def count_by_status(self, status: AllocationStatus) -> int:
        return await BatchAllocation.find({"is_deleted": False, "status": status}).count()
