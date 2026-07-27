"""Data access for the singleton GoogleSheetConnection document."""
from app.models.google_sheet_connection import GoogleSheetConnection


class GoogleSheetConnectionRepository:
    async def get_or_create(self) -> GoogleSheetConnection:
        connection = await GoogleSheetConnection.find_one({})
        if connection is None:
            connection = GoogleSheetConnection()
            await connection.insert()
        return connection
