"""Tests for the one-way export of the Induction and Foundation boards into an
admin-nominated spreadsheet (the Settings menu under Programs).

Google is replaced by an in-memory spreadsheet that behaves like the real one
as far as the export can tell: tabs are created, then read and written whole.
"""
from datetime import date

import pytest

from app.exceptions.base import BadRequestError
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.sheet_export import SheetExport
from app.schemas.induction_entry_schema import InductionEntryCreate
from app.schemas.lead_schema import LeadCreate
from app.schemas.sheet_export_schema import SheetExportUpdate
from app.services.induction_entry_service import InductionEntryService
from app.services.lead_service import LeadService
from app.services.sheet_export_service import SheetExportService, parse_spreadsheet_id

SHEET_URL = "https://docs.google.com/spreadsheets/d/1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk/edit#gid=0"
# Records made without a section land on each board's No Section tab.
INDUCTION = "Induction - No Section"
FOUNDATION = "Foundation - No Section"


class FakeSheets:
    """Starts out as a brand-new spreadsheet: one tab, neither of ours."""

    def __init__(self) -> None:
        self.tabs: dict[str, list[list[str]]] = {"Sheet1": []}
        self.writes = 0

    async def tab_titles(self):
        return list(self.tabs)

    async def ensure_tabs(self, names):
        created = [name for name in names if name not in self.tabs]
        for name in created:
            self.tabs[name] = []
        return created

    async def read_tabs(self, names):
        return {name: [list(row) for row in self.tabs.get(name, [])] for name in names}

    async def write_tab(self, name, grid, previous_rows):
        self.writes += 1
        self.tabs[name] = [list(row) for row in grid]

    def rows(self, tab):
        header, *rows = self.tabs[tab]
        return [dict(zip(header, row)) for row in rows]

    def headers(self, tab):
        return self.tabs[tab][0]


async def _configure(**overrides) -> SheetExport:
    data = {"spreadsheet_url": SHEET_URL, "enabled": True, **overrides}
    return await SheetExportService().update(SheetExportUpdate(**data), actor_id=None)


async def _export(sheets, config=None):
    service = SheetExportService()
    return await service.export_once(sheets, config or await service.get())


async def _lead(**overrides) -> Lead:
    data = {"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Recruitment", **overrides}
    return await LeadService().create(LeadCreate(**data), actor_id=None)


async def _entry(**overrides) -> InductionEntry:
    data = {"name": "Priya S", "phone": "9123456780", "registration_date": date(2026, 9, 2), **overrides}
    return await InductionEntryService().create(InductionEntryCreate(**data), actor_id=None)


# ---------------------------------------------------------------------------
# The link
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "https://docs.google.com/spreadsheets/d/ABC123_the-id/edit#gid=0",
        "https://docs.google.com/spreadsheets/d/ABC123_the-id/edit?usp=sharing",
        "  https://docs.google.com/spreadsheets/d/ABC123_the-id  ",
    ],
)
def test_the_id_is_read_out_of_whatever_the_admin_pasted(raw):
    assert parse_spreadsheet_id(raw) == "ABC123_the-id"


def test_a_bare_id_is_accepted_and_nonsense_is_not():
    assert parse_spreadsheet_id("1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk").startswith("1GuW")
    with pytest.raises(BadRequestError):
        parse_spreadsheet_id("my spreadsheet")


async def test_the_export_cannot_be_turned_on_without_a_link(client):
    with pytest.raises(BadRequestError):
        await SheetExportService().update(SheetExportUpdate(enabled=True), actor_id=None)


async def test_clearing_the_link_turns_the_export_off(client):
    await _configure()
    config = await SheetExportService().update(SheetExportUpdate(spreadsheet_url=""), actor_id=None)
    assert config.spreadsheet_id is None
    assert config.enabled is False


async def test_both_tabs_cannot_be_the_same_tab(client):
    with pytest.raises(BadRequestError):
        await _configure(induction_tab="Data", foundation_tab="Data")


async def test_the_export_cannot_be_aimed_at_the_two_way_syncs_own_tabs(client, monkeypatch):
    """Both write whole tabs, and their layouts differ - sharing one would make
    each rewrite it every cycle for ever. See the guard for the long version."""
    from app.config.settings import settings as env

    monkeypatch.setattr(env, "LEAD_SHEET_SYNC_ENABLED", True)
    monkeypatch.setattr(env, "LEAD_SHEET_SPREADSHEET_ID", "1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk")

    # Both split their board names into the same per-section tab names.
    with pytest.raises(BadRequestError, match="two-way sync"):
        await _configure()
    with pytest.raises(BadRequestError, match="two-way sync"):
        await _configure(induction_tab="Induction - A Section", foundation_tab="Other")

    # Same spreadsheet, tabs of its own: allowed, because nothing overlaps.
    config = await _configure(induction_tab="ERP Induction", foundation_tab="ERP Foundation")
    assert config.enabled is True


async def test_a_target_that_only_clashes_later_is_caught_at_run_time(client, monkeypatch):
    """Saved on a laptop with the two-way sync off, the same target clashes in
    production where it is on - so the save is not the only place to check."""
    from app.config.settings import settings as env

    # Sync off: the default tab names against the sync's own spreadsheet save
    # without complaint.
    monkeypatch.setattr(env, "LEAD_SHEET_SYNC_ENABLED", False)
    await _configure()

    # Same config, a server where the sync runs.
    monkeypatch.setattr(env, "LEAD_SHEET_SYNC_ENABLED", True)
    monkeypatch.setattr(env, "LEAD_SHEET_SPREADSHEET_ID", "1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk")

    service = SheetExportService()
    assert "two-way sync" in (await service.status()).blocked_reason
    assert await service.run(force=True) is True
    assert "two-way sync" in (await service.get()).last_error


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


async def test_missing_tabs_are_created_before_the_first_export(client):
    await _configure()
    sheets = FakeSheets()

    await _export(sheets)

    # One per configured section, whether or not anyone is filed under it yet.
    assert {"Induction - A Section", "Induction - C Section", "Foundation - B Section"} <= set(sheets.tabs)


async def test_each_section_is_written_to_its_own_tab(client):
    in_a = await _entry(section="a", group="Group 2")
    await _entry(name="Kavya", phone="9000044444", section="b")
    await _lead(section="b")
    await _configure()
    sheets = FakeSheets()

    await _export(sheets)

    a_rows = sheets.rows("Induction - A Section")
    assert [row["Name"] for row in a_rows] == [in_a.name]
    assert a_rows[0]["Section"] == "A Section"
    assert a_rows[0]["Group"] == "Group 2"
    assert [row["Name"] for row in sheets.rows("Induction - B Section")] == ["Kavya"]
    assert [row["Name"] for row in sheets.rows("Foundation - B Section")] == ["Ravi Kumar"]
    assert sheets.rows("Foundation - A Section") == []


async def test_the_boards_are_written_under_their_own_headers(client):
    lead = await _lead()
    entry = await _entry(category="Fresher", batch=29)
    await _configure()
    sheets = FakeSheets()

    stats = await _export(sheets)

    induction = sheets.rows(INDUCTION)
    assert induction[0]["Name"] == "Priya S"
    assert induction[0]["Mobile Number"] == "9123456780"
    assert induction[0]["Category"] == "Fresher"
    assert induction[0]["Batch"] == "Batch-29"
    foundation = sheets.rows(FOUNDATION)
    assert foundation[0]["Name"] == "Ravi Kumar"
    assert foundation[0]["Course"] == "Recruitment"
    assert foundation[0]["Stage"] == "New Lead"
    assert stats["induction:-"].rows == 1
    assert stats["foundation:-"].rows == 1
    # Nothing of the two-way sync's bookkeeping leaks into a mirror.
    assert "ERP ID" not in sheets.headers(INDUCTION)
    assert "Sync Note" not in sheets.headers(FOUNDATION)
    assert lead and entry  # created above; the rows above are theirs


async def test_custom_tab_names_are_honoured(client):
    await _lead()
    config = await _configure(induction_tab="Induction Data", foundation_tab="Foundation Data")
    sheets = FakeSheets()

    await _export(sheets, config)

    assert sheets.rows("Foundation Data - No Section")[0]["Name"] == "Ravi Kumar"
    assert sheets.tabs["Induction Data - A Section"][0][0] == "Name"


async def test_an_erp_change_reaches_the_sheet(client):
    entry = await _entry()
    await _configure()
    sheets = FakeSheets()
    await _export(sheets)

    await InductionEntry.find_one({"_id": entry.id}).update({"$set": {"category": "Career Gap"}})
    await _export(sheets)

    assert sheets.rows(INDUCTION)[0]["Category"] == "Career Gap"


async def test_an_unchanged_board_is_not_rewritten(client):
    await _lead()
    await _configure()
    sheets = FakeSheets()
    await _export(sheets)
    writes = sheets.writes

    stats = await _export(sheets)

    assert sheets.writes == writes
    assert stats["foundation:-"].written is False


async def test_a_sheet_edit_is_overwritten_rather_than_saved(client):
    """The whole point of one-way: the spreadsheet is a copy, so typing in it
    changes nothing in the ERP and does not survive the next run."""
    lead = await _lead()
    await _configure()
    sheets = FakeSheets()
    await _export(sheets)

    name_column = sheets.headers(FOUNDATION).index("Name")
    sheets.tabs[FOUNDATION][1][name_column] = "Typed Over"
    await _export(sheets)

    assert sheets.rows(FOUNDATION)[0]["Name"] == "Ravi Kumar"
    assert (await Lead.find_one({"_id": lead.id})).name == "Ravi Kumar"


async def test_a_record_deleted_in_the_erp_leaves_the_sheet(client):
    entry = await _entry()
    await _configure()
    sheets = FakeSheets()
    await _export(sheets)
    assert len(sheets.rows(INDUCTION)) == 1

    await InductionEntry.find_one({"_id": entry.id}).update({"$set": {"is_deleted": True}})
    await _export(sheets)

    assert sheets.rows(INDUCTION) == []


async def test_only_one_worker_holds_the_lease(client):
    await _configure()
    service = SheetExportService()

    assert await service._acquire(force=True) is True
    assert await service._acquire(force=True) is False


async def test_a_disabled_export_never_acquires_the_lease(client):
    await _configure()
    await SheetExportService().update(SheetExportUpdate(enabled=False), actor_id=None)

    assert await SheetExportService()._acquire(force=True) is False


# ---------------------------------------------------------------------------
# What the page is told
# ---------------------------------------------------------------------------


async def test_status_describes_both_tabs_with_their_headers(client):
    await _lead()
    await _entry()
    await _configure()

    status = await SheetExportService().status()

    assert status.ready is True
    assert status.blocked_reason is None
    by_key = {tab.key: tab for tab in status.tabs}
    assert by_key["induction:-"].record_count == 1
    assert by_key["foundation:-"].record_count == 1
    assert by_key["induction:-"].headers[:2] == ["Name", "Mobile Number"]
    assert "Course" in by_key["foundation:-"].headers


async def test_status_explains_why_it_cannot_run_yet(client):
    status = await SheetExportService().status()
    assert status.ready is False
    assert "No spreadsheet linked" in status.blocked_reason


# ---------------------------------------------------------------------------
# The endpoints
# ---------------------------------------------------------------------------


async def test_the_settings_page_reads_its_own_status(client, auth_headers):
    await _lead()

    response = await client.get("/api/v1/integrations/sheet-export", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["induction_tab"] == "Induction"
    keys = [tab["key"] for tab in body["tabs"]]
    assert keys[:3] == ["induction:a", "induction:b", "induction:c"]
    assert "foundation:-" in keys  # the lead above has no section


async def test_the_link_is_saved_through_the_endpoint(client, auth_headers):
    response = await client.put(
        "/api/v1/integrations/sheet-export",
        headers=auth_headers,
        json={"spreadsheet_url": SHEET_URL},
    )

    assert response.status_code == 200
    assert response.json()["spreadsheet_id"] == "1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk"


async def test_a_bad_link_is_refused_with_an_explanation(client, auth_headers):
    response = await client.put(
        "/api/v1/integrations/sheet-export",
        headers=auth_headers,
        json={"spreadsheet_url": "not a link"},
    )

    assert response.status_code == 400
    assert "Google Sheets link" in response.json()["message"]


async def test_running_is_refused_before_a_link_is_set(client, auth_headers):
    response = await client.post("/api/v1/integrations/sheet-export/run", headers=auth_headers)

    assert response.status_code == 400


async def test_the_page_is_closed_to_a_role_without_the_permission(client, auth_headers):
    from app.tests.test_rbac import _create_user_with_role, _login

    await _create_user_with_role(client, auth_headers, "Tutor", "tutor-sheets@hrnavinos.com")
    tutor_headers = await _login(client, "tutor-sheets@hrnavinos.com", "TutorPass123")

    response = await client.get("/api/v1/integrations/sheet-export", headers=tutor_headers)

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# The credential
# ---------------------------------------------------------------------------


def test_a_named_but_missing_key_file_says_which_path_was_wrong(monkeypatch, tmp_path):
    """The env var is set before the key is copied across, so this is the state
    a half-finished setup sits in - and "[Errno 2]" names no path."""
    from app.config.settings import settings as env
    from app.services import google_sheets_client as client

    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_JSON", None)
    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_FILE", str(tmp_path / "absent.json"))

    with pytest.raises(client.SheetsError, match="absent.json"):
        client._service_account_info()
    # The status panel asks for the address separately and must not blow up.
    assert client.service_account_email() is None


def test_a_mangled_key_file_is_named_as_such(monkeypatch, tmp_path):
    from app.config.settings import settings as env
    from app.services import google_sheets_client as client

    key = tmp_path / "key.json"
    key.write_text("not json at all", encoding="utf-8")
    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_JSON", None)
    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_FILE", str(key))

    with pytest.raises(client.SheetsError, match="valid JSON"):
        client._service_account_info()


def test_a_good_key_file_is_read(monkeypatch, tmp_path):
    import json as jsonlib

    from app.config.settings import settings as env
    from app.services import google_sheets_client as client

    key = tmp_path / "key.json"
    key.write_text(
        jsonlib.dumps({"client_email": "export@proj.iam.gserviceaccount.com", "private_key": "x"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_JSON", None)
    monkeypatch.setattr(env, "GOOGLE_SERVICE_ACCOUNT_FILE", str(key))

    assert client.service_account_email() == "export@proj.iam.gserviceaccount.com"
