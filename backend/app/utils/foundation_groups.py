"""Which of a batch's two foundation classes somebody came through.

The foundation class runs twice a month, a fortnight apart. Everyone who comes
through the first sitting is Group 1; everyone through the second is Group 2.
Both halves belong to the *same* batch - the batch is the month (see `batch_for`
in app/services/induction_entry_service.py) and the group is the split inside
it, so "Batch-28 / Group 2" reads as "the second foundation class of August".

Derived from a date rather than stored, exactly as the batch is: which sitting
somebody came through is a fact about when, not a decision anybody makes. So
there is no field to migrate, nothing that can drift out of sync with the date
beside it, and every row that already exists carries a group the moment this
ships.

Which date, per collection:

    InductionEntry -> registration_date, the same date its batch comes from, so
                      the pair always describes one month.
    Lead           -> created_at. A Foundation lead exists because somebody sat
                      the foundation class and filled the form there, so its own
                      date is the direct record of which sitting that was - and
                      it is the date the board already prints beside the group.

Day-of-month is read in UTC, both here and in the Mongo filter below, which is
how every other date filter in the app treats stored timestamps.
"""
from datetime import date, datetime

# The day the month is cut on: 1st-15th is the first sitting, 16th onward the
# second. A single constant because the two halves have to be defined by one
# boundary - two independent numbers could leave a day in both groups or in
# neither.
GROUP_SPLIT_DAY = 15

# Every group there is. Two, because there are two classes a month; the filter
# dropdowns are built from this rather than from a hardcoded pair.
FOUNDATION_GROUPS = (1, 2)


def foundation_group_for(value: date | datetime) -> int:
    """1 or 2 - which half of its month `value` falls in."""
    return 1 if value.day <= GROUP_SPLIT_DAY else 2


def foundation_group_label(group: int) -> str:
    return f"Group {group}"


def foundation_group_query(group: int, *, field: str) -> dict:
    """The Mongo filter selecting one group, on a date/datetime field.

    `$expr` rather than a date range: a group is a day-of-month rule that holds
    in every month at once, so there is no single window to test against. The
    `$type` guard keeps documents with a missing or null date out - `$dayOfMonth`
    of null is null, and null sorts below every number, which would otherwise
    sweep them all into Group 1.
    """
    day = {"$dayOfMonth": f"${field}"}
    comparison = {"$lte": [day, GROUP_SPLIT_DAY]} if group == 1 else {"$gt": [day, GROUP_SPLIT_DAY]}
    return {field: {"$type": "date"}, "$expr": comparison}
