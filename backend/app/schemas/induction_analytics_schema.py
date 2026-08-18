"""Response shapes for the induction analytics dashboard.

Declared rather than returned as bare dicts so the five boards have a contract
the frontend can be written against - and so a board that stops returning a
field fails here, at the edge, rather than as an empty chart nobody notices.
"""
from pydantic import BaseModel


class BreakdownRow(BaseModel):
    """One value of a dimension - a category, a source, a person - with what
    became of the entries filed under it. The count alone is never the
    interesting number."""

    value: str
    count: int
    moved: int
    quit: int
    uncalled: int


class FunnelStage(BaseModel):
    key: str
    label: str
    count: int
    # Share of everyone registered, not of the previous stage.
    share: float


class FunnelBoard(BaseModel):
    registered: int
    called: int
    detailed: int
    moved: int
    quit: int
    in_progress: int
    stages: list[FunnelStage]


class WaitingBucket(BaseModel):
    bucket: str
    count: int


class CallsBoard(BaseModel):
    remarks: list[BreakdownRow]
    uncalled: int
    waiting: list[WaitingBucket]


class TeamBoard(BaseModel):
    sales_person: list[BreakdownRow]
    assignee: list[BreakdownRow]


class ChannelsBoard(BaseModel):
    lead_source: list[BreakdownRow]
    category: list[BreakdownRow]
    payment_mode: list[BreakdownRow]


class TrendPoint(BaseModel):
    period: str
    registered: int
    moved: int
    quit: int


class BatchRow(BaseModel):
    batch: str
    month: str
    registered: int
    moved: int
    quit: int


class TrendBoard(BaseModel):
    # day | week | month, chosen from the window rather than fixed.
    granularity: str
    points: list[TrendPoint]
    batches: list[BatchRow]


class InductionDashboardResponse(BaseModel):
    total: int
    funnel: FunnelBoard
    calls: CallsBoard
    team: TeamBoard
    channels: ChannelsBoard
    trend: TrendBoard
