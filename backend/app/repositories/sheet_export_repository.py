"""Data access for the singleton SheetExport document."""
from pymongo.errors import DuplicateKeyError

from app.models.sheet_export import SheetExport


class SheetExportRepository:
    async def get_or_create(self) -> SheetExport:
        config = await SheetExport.find_one({"key": "sheet_export"})
        if config is None:
            try:
                config = SheetExport()
                await config.insert()
            except DuplicateKeyError:  # another worker created it first
                config = await SheetExport.find_one({"key": "sheet_export"})
        return config

    async def update(self, config: SheetExport, data: dict) -> SheetExport:
        for field, value in data.items():
            if hasattr(config, field):
                setattr(config, field, value)
        config.touch()
        await config.save()
        return config
