"""Data access for the singleton AppSettings document."""
from app.models.settings import AppSettings


class SettingsRepository:
    async def get_or_create(self) -> AppSettings:
        settings = await AppSettings.find_one({})
        if settings is None:
            settings = AppSettings()
            await settings.insert()
        return settings

    async def update(self, settings: AppSettings, data: dict) -> AppSettings:
        for field, value in data.items():
            if hasattr(settings, field):
                setattr(settings, field, value)
        settings.touch()
        await settings.save()
        return settings
