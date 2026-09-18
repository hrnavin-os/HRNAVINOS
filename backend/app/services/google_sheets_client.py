"""The small slice of the Google Sheets REST API the lead sheet sync needs:
read whole tabs, write them back.

httpx rather than Google's SDK for the same reason as google_sheets_service:
the app already depends on it, and the SDK is synchronous.
"""
import json
import time
from pathlib import Path

import httpx
from jose import jwt

from app.config.settings import settings
from app.exceptions.base import AppException
from app.repositories.google_sheet_connection_repository import GoogleSheetConnectionRepository
from app.services.google_sheets_service import GoogleSheetsService

TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets"


class SheetsError(Exception):
    """A failure talking to Google, worded for the status panel."""


def column_letter(index: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA."""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _quote_tab(tab: str) -> str:
    return "'" + tab.replace("'", "''") + "'"


def _service_account_info() -> dict | None:
    raw = settings.GOOGLE_SERVICE_ACCOUNT_JSON
    if not raw and settings.GOOGLE_SERVICE_ACCOUNT_FILE:
        raw = Path(settings.GOOGLE_SERVICE_ACCOUNT_FILE).read_text(encoding="utf-8")
    if not raw:
        return None
    info = json.loads(raw)
    if not info.get("client_email") or not info.get("private_key"):
        raise SheetsError("The Google service account JSON has no client_email/private_key.")
    return info


def service_account_email() -> str | None:
    try:
        info = _service_account_info()
    except (OSError, ValueError, SheetsError):
        return None
    return info["client_email"] if info else None


# Per worker process. A service-account token lasts an hour, and minting one
# per sync would be a token request every 30 seconds.
_cached_token: tuple[str, float] | None = None


async def _service_account_token(http: httpx.AsyncClient, info: dict) -> str:
    global _cached_token
    if _cached_token and _cached_token[1] > time.time() + 60:
        return _cached_token[0]
    now = int(time.time())
    token_uri = info.get("token_uri") or TOKEN_URL
    assertion = jwt.encode(
        {"iss": info["client_email"], "scope": WRITE_SCOPE, "aud": token_uri, "iat": now, "exp": now + 3600},
        info["private_key"],
        algorithm="RS256",
        headers={"kid": info.get("private_key_id")} if info.get("private_key_id") else None,
    )
    response = await http.post(
        token_uri,
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
    )
    if response.status_code != 200:
        raise SheetsError(f"Google refused the service account credentials: {response.text[:300]}")
    data = response.json()
    _cached_token = (data["access_token"], time.time() + data.get("expires_in", 3600))
    return data["access_token"]


async def access_token(http: httpx.AsyncClient) -> tuple[str, str]:
    """(token, which credential it came from)."""
    info = _service_account_info()
    if info:
        return await _service_account_token(http, info), f"service account {info['client_email']}"

    connection = await GoogleSheetConnectionRepository().get_or_create()
    if not connection.refresh_token:
        raise SheetsError(
            "No Google credentials. Set GOOGLE_SERVICE_ACCOUNT_FILE on the server, or connect a Google "
            "account from the Marketing Board."
        )
    try:
        token = await GoogleSheetsService()._get_valid_access_token(connection)
    except AppException as exc:
        raise SheetsError(exc.message) from exc
    return token, "Marketing Board Google account"


class SheetsClient:
    def __init__(self, http: httpx.AsyncClient, token: str, spreadsheet_id: str) -> None:
        self.http = http
        self.headers = {"Authorization": f"Bearer {token}"}
        self.url = f"{SHEETS_API_BASE}/{spreadsheet_id}"

    def _check(self, response: httpx.Response, action: str) -> dict:
        if response.status_code == 200:
            return response.json()
        detail = response.text[:300]
        if response.status_code == 403:
            raise SheetsError(
                f"Google denied access while trying to {action}. Share the spreadsheet with the syncing "
                "account as an Editor - or, if using the Marketing Board account, reconnect it so it grants "
                f"edit access. ({detail})"
            )
        if response.status_code == 404:
            raise SheetsError(
                "The spreadsheet was not found. Check the spreadsheet link (and that the syncing account "
                "can open it)."
            )
        if response.status_code == 400 and "Unable to parse range" in detail:
            raise SheetsError(
                f"A tab is missing. The spreadsheet needs tabs named '{settings.LEAD_SHEET_INDUCTION_TAB}' "
                f"and '{settings.LEAD_SHEET_FOUNDATION_TAB}'."
            )
        raise SheetsError(f"Google Sheets failed to {action} (HTTP {response.status_code}): {detail}")

    async def _sheet_properties(self) -> list[dict]:
        meta = self._check(
            await self.http.get(
                self.url, params={"fields": "sheets.properties(sheetId,title,gridProperties)"}, headers=self.headers
            ),
            "read the sheet layout",
        )
        return [sheet["properties"] for sheet in meta.get("sheets", [])]

    async def ensure_tabs(self, tabs: list[str]) -> list[str]:
        """Creates any of `tabs` the spreadsheet does not have yet.

        A brand-new spreadsheet has one tab called "Sheet1", so without this
        the first export against a freshly pasted link would fail on a missing
        tab and leave the admin to create them by hand - having already told
        the app which names it wanted. Returns the ones it created.
        """
        existing = {properties["title"] for properties in await self._sheet_properties()}
        missing = [tab for tab in tabs if tab not in existing]
        if not missing:
            return []
        self._check(
            await self.http.post(
                f"{self.url}:batchUpdate",
                json={"requests": [{"addSheet": {"properties": {"title": tab}}} for tab in missing]},
                headers=self.headers,
            ),
            "add the missing tabs",
        )
        return missing

    async def read_tabs(self, tabs: list[str]) -> dict[str, list[list[str]]]:
        # FORMATTED_VALUE: what the cell shows. The sync writes plain text, so
        # its own cells read back byte-for-byte; a date or number somebody
        # typed reads back as they see it and is parsed from there.
        response = await self.http.get(
            f"{self.url}/values:batchGet",
            params=[("ranges", f"{_quote_tab(tab)}") for tab in tabs]
            + [("valueRenderOption", "FORMATTED_VALUE"), ("majorDimension", "ROWS")],
            headers=self.headers,
        )
        data = self._check(response, "read the sheet")
        return {tab: value_range.get("values", []) for tab, value_range in zip(tabs, data.get("valueRanges", []))}

    async def write_tab(self, tab: str, grid: list[list[str]], previous_rows: int) -> None:
        width = max((len(row) for row in grid), default=1)
        sheet = next((props for props in await self._sheet_properties() if props["title"] == tab), None)
        if sheet is None:
            raise SheetsError(f"The spreadsheet has no tab named '{tab}'.")
        grid_props = sheet.get("gridProperties", {})
        requests: list[dict] = []
        # A values write can't go past the tab's grid, and a new tab has 1000
        # rows and 26 columns - grow it first when the data needs more.
        for dimension, have, need in (
            ("ROWS", grid_props.get("rowCount", 0), len(grid)),
            ("COLUMNS", grid_props.get("columnCount", 0), width),
        ):
            if need > have:
                # Rows get headroom so a growing tab isn't resized every run.
                extra = 200 if dimension == "ROWS" else 0
                requests.append(
                    {
                        "appendDimension": {
                            "sheetId": sheet["sheetId"],
                            "dimension": dimension,
                            "length": need - have + extra,
                        }
                    }
                )
        if not grid_props.get("frozenRowCount"):
            requests.append(
                {
                    "updateSheetProperties": {
                        "properties": {"sheetId": sheet["sheetId"], "gridProperties": {"frozenRowCount": 1}},
                        "fields": "gridProperties.frozenRowCount",
                    }
                }
            )
        if requests:
            self._check(
                await self.http.post(f"{self.url}:batchUpdate", json={"requests": requests}, headers=self.headers),
                "resize the sheet",
            )

        # RAW, so a mobile number stays text instead of losing its + or
        # turning into 9.88E+09, and nothing is ever evaluated as a formula.
        self._check(
            await self.http.post(
                f"{self.url}/values:batchUpdate",
                json={"valueInputOption": "RAW", "data": [{"range": f"{_quote_tab(tab)}!A1", "values": grid}]},
                headers=self.headers,
            ),
            "write the sheet",
        )
        if previous_rows > len(grid):
            clear_range = f"{_quote_tab(tab)}!A{len(grid) + 1}:{column_letter(width - 1)}{previous_rows}"
            self._check(
                await self.http.post(
                    f"{self.url}/values:batchClear", json={"ranges": [clear_range]}, headers=self.headers
                ),
                "clear removed rows",
            )

