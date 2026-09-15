"""Tests for the two-way Lead Dashboard <-> Google Sheet sync.

Google is replaced by an in-memory spreadsheet that behaves like the real one
as far as the sync can tell: whole tabs are read and written as grids of text.
"""
from datetime import date
from decimal import Decimal

from app.models.enums import LeadStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.schemas.induction_entry_schema import InductionEntryCreate
from app.schemas.lead_schema import LeadCreate, LeadUpdate
from app.services.induction_entry_service import InductionEntryService
from app.services.lead_service import LeadService
from app.services.lead_sheet_sync_service import LeadSheetSyncService


class FakeSheets:
    def __init__(self) -> None:
        self.tabs: dict[str, list[list[str]]] = {"Induction": [], "Foundation": []}
        self.writes = 0

    async def read_tabs(self, names):
        return {name: [list(row) for row in self.tabs[name]] for name in names}

    async def write_tab(self, name, grid, previous_rows):
        self.writes += 1
        self.tabs[name] = [list(row) for row in grid]

    def rows(self, tab):
        header, *rows = self.tabs[tab]
        return [dict(zip(header, row)) for row in rows]

    def set_cell(self, tab, erp_id, header, value):
        grid = self.tabs[tab]
        column = grid[0].index(header)
        row = next(row for row in grid[1:] if row[0] == erp_id)
        row[column] = value

    def append(self, tab, values: dict[str, str]):
        header = self.tabs[tab][0]
        self.tabs[tab].append([values.get(name, "") for name in header])


async def sync(sheets):
    return await LeadSheetSyncService().sync_once(sheets)


async def _lead(**overrides) -> Lead:
    data = {"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Recruitment", **overrides}
    return await LeadService().create(LeadCreate(**data), actor_id=None)


async def _entry(**overrides) -> InductionEntry:
    data = {"name": "Priya S", "phone": "9123456780", "registration_date": date(2026, 9, 2), **overrides}
    return await InductionEntryService().create(InductionEntryCreate(**data), actor_id=None)


async def test_erp_records_are_written_to_their_tabs(client):
    lead = await _lead()
    entry = await _entry(category="Fresher")
    sheets = FakeSheets()

    await sync(sheets)

    foundation = sheets.rows("Foundation")
    assert [row["ERP ID"] for row in foundation] == [str(lead.id)]
    assert foundation[0]["Name"] == "Ravi Kumar"
    assert foundation[0]["Stage"] == "New Lead"
    induction = sheets.rows("Induction")
    assert induction[0]["ERP ID"] == str(entry.id)
    assert induction[0]["Category"] == "Fresher"
    assert induction[0]["Batch"] == "Batch-29"


async def test_unchanged_sheet_is_not_rewritten(client):
    await _lead()
    sheets = FakeSheets()
    await sync(sheets)
    writes = sheets.writes

    await sync(sheets)

    assert sheets.writes == writes


async def test_sheet_edits_are_saved_to_the_erp(client):
    lead = await _lead()
    entry = await _entry()
    sheets = FakeSheets()
    await sync(sheets)

    sheets.set_cell("Foundation", str(lead.id), "Paying Amount", "₹15,000")
    sheets.set_cell("Foundation", str(lead.id), "Payment Remarks", "confirmed to pay")
    sheets.set_cell("Induction", str(entry.id), "Category", "Experienced")
    sheets.set_cell("Induction", str(entry.id), "Terms Signed", "yes")
    await sync(sheets)

    lead = await Lead.get(lead.id)
    assert lead.paying_amount == Decimal("15000")
    assert lead.payment_call_remarks == "confirmed_to_pay"
    entry = await InductionEntry.get(entry.id)
    assert entry.category == "Experienced"
    assert entry.other_details.terms_form_signed is True
    # Written back in the ERP's own wording.
    assert sheets.rows("Foundation")[0]["Payment Remarks"] == "Confirmed to pay"


async def test_erp_edits_reach_the_sheet(client):
    lead = await _lead()
    sheets = FakeSheets()
    await sync(sheets)

    await LeadService().update(lead.id, LeadUpdate(qr_code="Razor pay"), actor_id=None)
    await sync(sheets)

    assert sheets.rows("Foundation")[0]["QR-Code"] == "Razor pay"


async def test_new_sheet_row_is_added_to_the_erp(client):
    sheets = FakeSheets()
    await sync(sheets)  # writes the header rows

    sheets.append("Foundation", {"Name": "Karthik", "Mobile Number": "9000011111", "Course": "Recruitment"})
    sheets.append("Induction", {"Name": "Meena", "Mobile Number": "9000022222", "Registration Date": "05/09/2026"})
    await sync(sheets)

    lead = await Lead.find_one({"phone": "9000011111"})
    assert lead is not None and lead.name == "Karthik"
    assert sheets.rows("Foundation")[0]["ERP ID"] == str(lead.id)
    entry = await InductionEntry.find_one({"phone": "9000022222"})
    assert entry.registration_date == date(2026, 9, 5)
    assert sheets.rows("Induction")[0]["ERP ID"] == str(entry.id)


async def test_refused_edit_is_reverted_and_explained(client):
    lead = await _lead()
    sheets = FakeSheets()
    await sync(sheets)

    # Batch Confirmation can only be entered from Financial Approval.
    sheets.set_cell("Foundation", str(lead.id), "Stage", "Batch Confirmation")
    await sync(sheets)

    assert (await Lead.get(lead.id)).status == LeadStatus.NEW_LEAD
    row = sheets.rows("Foundation")[0]
    assert row["Stage"] == "New Lead"
    assert "Stage:" in row["Sync Note"]
    # The note survives the next quiet run instead of flashing past.
    await sync(sheets)
    assert "Stage:" in sheets.rows("Foundation")[0]["Sync Note"]


async def test_incomplete_new_row_is_kept_with_a_note(client):
    sheets = FakeSheets()
    await sync(sheets)

    sheets.append("Foundation", {"Name": "No Number"})
    await sync(sheets)

    assert await Lead.find({}).count() == 0
    row = sheets.rows("Foundation")[0]
    assert row["Name"] == "No Number"
    assert row["Sync Note"].startswith("Not added to the ERP")


async def test_record_deleted_in_erp_leaves_the_sheet(client):
    lead = await _lead()
    await _lead(name="Second Lead", phone="9000033333")
    sheets = FakeSheets()
    await sync(sheets)

    await LeadService().delete(lead.id, actor_id=None)
    await sync(sheets)

    assert [row["Name"] for row in sheets.rows("Foundation")] == ["Second Lead"]


async def test_row_deleted_in_sheet_comes_back(client):
    lead = await _lead()
    sheets = FakeSheets()
    await sync(sheets)

    sheets.tabs["Foundation"] = sheets.tabs["Foundation"][:1]
    await sync(sheets)

    assert [row["ERP ID"] for row in sheets.rows("Foundation")] == [str(lead.id)]


async def test_only_one_worker_holds_the_lease(client):
    service = LeadSheetSyncService()

    assert await service._acquire(force=False) is True
    # A second worker - forced or not - can't start while the first is running.
    assert await service._acquire(force=False) is False
    assert await service._acquire(force=True) is False
