"""AppSettings document — a singleton holding institute-wide configuration
editable by admins at runtime (as opposed to deployment-time env vars in
app/config/settings.py)."""
from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class AppSettings(BaseDocument):
    institute_name: str = Field(default="HRNAVINOS ERP", max_length=150)
    institute_email: str | None = Field(default=None, max_length=255)
    institute_phone: str | None = Field(default=None, max_length=20)
    institute_address: str | None = Field(default=None, max_length=255)
    currency: str = Field(default="INR", max_length=10)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    invoice_prefix: str = Field(default="INV", max_length=20)
    logo_url: str | None = Field(default=None, max_length=500)

    class Settings:
        name = "settings"
        indexes = [IndexModel([("created_at", 1)])]

    def __repr__(self) -> str:
        return f"<AppSettings {self.institute_name}>"
