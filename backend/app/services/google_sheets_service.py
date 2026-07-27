"""Business logic for the Marketing Board's Google Sheets integration.

Uses plain OAuth 2.0 + the Sheets REST API via httpx rather than Google's
client SDKs, since the app already depends on httpx and this avoids pulling
in the (synchronous) google-api-python-client for a handful of endpoints.
"""
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

import httpx

from app.config.settings import settings
from app.exceptions.base import BadRequestError
from app.models.enums import LeadSource
from app.models.google_sheet_connection import ConnectedSheet, GoogleSheetConnection, SheetTab
from app.models.lead import Lead
from app.repositories.google_sheet_connection_repository import GoogleSheetConnectionRepository
from app.schemas.google_sheets_schema import (
    ConnectedSheetResponse,
    GoogleCredentialsResponse,
    GoogleSheetsStatusResponse,
    SheetTabResponse,
    UpdateCredentialsRequest,
)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

SPREADSHEET_ID_PATTERN = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GoogleSheetsService:
    def __init__(self) -> None:
        self.repo = GoogleSheetConnectionRepository()

    def _to_response(self, sheet: ConnectedSheet) -> ConnectedSheetResponse:
        return ConnectedSheetResponse(
            id=sheet.spreadsheet_id,
            url=sheet.url,
            name=sheet.name,
            tabs=[SheetTabResponse(name=tab.name, row_count=tab.row_count) for tab in sheet.tabs],
            last_sync_at=sheet.last_sync_at,
        )

    async def status(self) -> GoogleSheetsStatusResponse:
        connection = await self.repo.get_or_create()
        return GoogleSheetsStatusResponse(
            connected=bool(connection.refresh_token),
            sheets=[self._to_response(sheet) for sheet in connection.sheets],
        )

    def _client_id(self, connection: GoogleSheetConnection) -> str | None:
        return connection.client_id or settings.GOOGLE_OAUTH_CLIENT_ID

    def _client_secret(self, connection: GoogleSheetConnection) -> str | None:
        return connection.client_secret or settings.GOOGLE_OAUTH_CLIENT_SECRET

    def _redirect_uri(self, connection: GoogleSheetConnection) -> str:
        return connection.redirect_uri or settings.GOOGLE_OAUTH_REDIRECT_URI

    def _require_oauth_config(self, connection: GoogleSheetConnection) -> None:
        if not self._client_id(connection) or not self._client_secret(connection):
            raise BadRequestError(
                "Google OAuth is not configured. Add a Client ID and Client Secret from the "
                "Settings button on the Marketing Board."
            )

    async def get_credentials(self) -> GoogleCredentialsResponse:
        connection = await self.repo.get_or_create()
        client_id = self._client_id(connection)
        if connection.client_id:
            source = "database"
        elif settings.GOOGLE_OAUTH_CLIENT_ID:
            source = "environment"
        else:
            source = "none"
        return GoogleCredentialsResponse(client_id=client_id, redirect_uri=self._redirect_uri(connection), source=source)

    async def update_credentials(self, data: UpdateCredentialsRequest) -> GoogleCredentialsResponse:
        connection = await self.repo.get_or_create()
        connection.client_id = data.client_id.strip()
        if data.client_secret and data.client_secret.strip():
            connection.client_secret = data.client_secret.strip()
        connection.redirect_uri = data.redirect_uri.strip()
        await connection.save()
        return await self.get_credentials()

    async def get_auth_url(self, *, actor_id: uuid.UUID | None) -> str:
        connection = await self.repo.get_or_create()
        self._require_oauth_config(connection)
        state = secrets.token_urlsafe(24)
        connection.pending_state = state
        connection.pending_state_expires_at = utcnow() + timedelta(minutes=10)
        await connection.save()

        params = {
            "client_id": self._client_id(connection),
            "redirect_uri": self._redirect_uri(connection),
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    async def handle_callback(self, *, code: str, state: str, actor_id: uuid.UUID | None) -> None:
        connection = await self.repo.get_or_create()
        self._require_oauth_config(connection)
        if (
            not connection.pending_state
            or connection.pending_state != state
            or not connection.pending_state_expires_at
            or utcnow() > connection.pending_state_expires_at
        ):
            raise BadRequestError("Invalid or expired Google OAuth state.")

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self._client_id(connection),
                    "client_secret": self._client_secret(connection),
                    "redirect_uri": self._redirect_uri(connection),
                    "grant_type": "authorization_code",
                },
            )
        if response.status_code != 200:
            raise BadRequestError("Google rejected the authorization code.", details=response.text)
        data = response.json()

        connection.access_token = data["access_token"]
        if data.get("refresh_token"):
            connection.refresh_token = data["refresh_token"]
        connection.token_expires_at = utcnow() + timedelta(seconds=data.get("expires_in", 3600))
        connection.connected_by = actor_id
        connection.connected_at = utcnow()
        connection.pending_state = None
        connection.pending_state_expires_at = None
        await connection.save()

    async def _get_valid_access_token(self, connection: GoogleSheetConnection) -> str:
        if not connection.refresh_token:
            raise BadRequestError("Google Sheets is not connected yet.")
        if connection.access_token and connection.token_expires_at and connection.token_expires_at > utcnow() + timedelta(seconds=30):
            return connection.access_token

        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "refresh_token": connection.refresh_token,
                    "client_id": self._client_id(connection),
                    "client_secret": self._client_secret(connection),
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code != 200:
            raise BadRequestError("Failed to refresh the Google access token. Try reconnecting.", details=response.text)
        data = response.json()
        connection.access_token = data["access_token"]
        connection.token_expires_at = utcnow() + timedelta(seconds=data.get("expires_in", 3600))
        await connection.save()
        return connection.access_token

    def _parse_spreadsheet_id(self, url: str) -> str:
        match = SPREADSHEET_ID_PATTERN.search(url)
        if not match:
            raise BadRequestError("That doesn't look like a Google Sheets URL.")
        return match.group(1)

    async def fetch_tabs(self, url: str) -> ConnectedSheetResponse:
        spreadsheet_id = self._parse_spreadsheet_id(url)
        connection = await self.repo.get_or_create()
        token = await self._get_valid_access_token(connection)

        async with httpx.AsyncClient(timeout=20) as client:
            meta_response = await client.get(
                f"{SHEETS_API_BASE}/{spreadsheet_id}",
                params={"fields": "properties.title,sheets.properties.title"},
                headers={"Authorization": f"Bearer {token}"},
            )
            if meta_response.status_code != 200:
                raise BadRequestError(
                    "Could not read that spreadsheet. Make sure the URL is correct and the connected "
                    "Google account has access to it.",
                    details=meta_response.text,
                )
            meta = meta_response.json()
            title = meta.get("properties", {}).get("title", "Untitled sheet")
            tab_names = [sheet["properties"]["title"] for sheet in meta.get("sheets", [])]

            tabs: list[SheetTab] = []
            for tab_name in tab_names:
                range_expr = quote(f"'{tab_name}'!A:A")
                values_response = await client.get(
                    f"{SHEETS_API_BASE}/{spreadsheet_id}/values/{range_expr}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                values_response.raise_for_status()
                rows = values_response.json().get("values", [])
                tabs.append(SheetTab(name=tab_name, row_count=max(len(rows) - 1, 0), last_synced_row=1))

        connection.sheets = [sheet for sheet in connection.sheets if sheet.spreadsheet_id != spreadsheet_id]
        connected_sheet = ConnectedSheet(spreadsheet_id=spreadsheet_id, url=url, name=title, tabs=tabs)
        connection.sheets.append(connected_sheet)
        await connection.save()
        return self._to_response(connected_sheet)

    @staticmethod
    def _find_column(headers: list[str], *keywords: str) -> int | None:
        for index, header in enumerate(headers):
            normalized = header.strip().lower()
            if any(keyword in normalized for keyword in keywords):
                return index
        return None

    async def sync_all(self) -> tuple[list[ConnectedSheetResponse], int]:
        connection = await self.repo.get_or_create()
        token = await self._get_valid_access_token(connection)
        total_created = 0

        async with httpx.AsyncClient(timeout=30) as client:
            for sheet in connection.sheets:
                for tab in sheet.tabs:
                    range_expr = quote(f"'{tab.name}'!A:Z")
                    values_response = await client.get(
                        f"{SHEETS_API_BASE}/{sheet.spreadsheet_id}/values/{range_expr}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    values_response.raise_for_status()
                    rows = values_response.json().get("values", [])
                    if not rows:
                        continue

                    headers = rows[0]
                    name_idx = self._find_column(headers, "name")
                    phone_idx = self._find_column(headers, "phone", "mobile", "contact")
                    email_idx = self._find_column(headers, "email")

                    for row_number, row in enumerate(rows[1:], start=2):
                        if row_number <= tab.last_synced_row:
                            continue
                        phone = row[phone_idx].strip() if phone_idx is not None and phone_idx < len(row) else ""
                        if not phone:
                            continue
                        external_ref = f"gsheet:{sheet.spreadsheet_id}:{tab.name}:{row_number}"
                        if await Lead.find_one({"external_ref": external_ref}):
                            continue
                        name = (
                            row[name_idx].strip()
                            if name_idx is not None and name_idx < len(row) and row[name_idx].strip()
                            else "Unknown"
                        )
                        email = row[email_idx].strip() if email_idx is not None and email_idx < len(row) else None
                        raw_form_data = {
                            header.strip(): row[index].strip()
                            for index, header in enumerate(headers)
                            if header.strip() and index < len(row) and row[index].strip()
                        }
                        lead = Lead(
                            name=name,
                            phone=phone,
                            email=email or None,
                            source=LeadSource.OTHER,
                            notes=f"Imported from Google Sheet tab '{tab.name}'.",
                            external_ref=external_ref,
                            reviewed=False,
                            raw_form_data=raw_form_data or None,
                        )
                        await lead.insert()
                        total_created += 1

                    tab.last_synced_row = max(len(rows), tab.last_synced_row)
                    tab.row_count = len(rows) - 1

                sheet.last_sync_at = utcnow()

        await connection.save()
        return [self._to_response(sheet) for sheet in connection.sheets], total_created

    async def disconnect(self) -> None:
        connection = await self.repo.get_or_create()
        connection.access_token = None
        connection.refresh_token = None
        connection.token_expires_at = None
        connection.connected_at = None
        connection.connected_by = None
        connection.sheets = []
        await connection.save()

    async def remove_sheet(self, spreadsheet_id: str) -> None:
        connection = await self.repo.get_or_create()
        connection.sheets = [sheet for sheet in connection.sheets if sheet.spreadsheet_id != spreadsheet_id]
        await connection.save()
