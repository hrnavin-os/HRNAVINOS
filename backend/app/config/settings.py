"""Application configuration loaded from environment variables."""
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Application ----------
    APP_NAME: str = "HRNAVINOS ERP"
    APP_ENV: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = Field(..., min_length=32)

    # ---------- Server ----------
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ---------- Database (MongoDB) ----------
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "hrnavinos_erp"

    # ---------- JWT ----------
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "hrnavinos-erp"

    # ---------- CORS ----------
    CORS_ORIGINS: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]

    # ---------- Frontend (for post-OAuth redirects) ----------
    FRONTEND_URL: str = "http://localhost:5173"

    # ---------- Google OAuth (Marketing Board / Sheets integration) ----------
    GOOGLE_OAUTH_CLIENT_ID: str | None = None
    GOOGLE_OAUTH_CLIENT_SECRET: str | None = None
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/v1/integrations/google-sheets/callback"

    # ---------- Lead sheet sync (Admin Portal Backup spreadsheet) ----------
    # Two-way sync between the Lead Dashboard and one spreadsheet: every
    # induction entry on the INDUCTION tab, every Foundation lead on the
    # FOUNDATION tab. See app/services/lead_sheet_sync_service.py.
    #
    # Off unless APP_ENV is production, or LEAD_SHEET_SYNC_ENABLED says
    # otherwise. The sync treats the sheet as a mirror of *this* database, so a
    # laptop's dev data pointed at the live sheet would be written straight
    # into it.
    LEAD_SHEET_SYNC_ENABLED: bool | None = None
    LEAD_SHEET_SPREADSHEET_ID: str | None = "1GuW1RzWnA1SsKIwmzRFXdIa7ERSb3EELnrWABkPSHnk"
    LEAD_SHEET_INDUCTION_TAB: str = "Induction"
    LEAD_SHEET_FOUNDATION_TAB: str = "Foundation"
    LEAD_SHEET_SYNC_INTERVAL_SECONDS: int = Field(default=30, ge=10)
    # A Google service account is the credential the sync prefers: it never
    # expires and belongs to no staff member. Give either the path to its JSON
    # key file or the JSON itself, then share the spreadsheet with the
    # account's client_email as an Editor. Without one, the sync falls back to
    # the Google account connected on the Marketing Board.
    GOOGLE_SERVICE_ACCOUNT_FILE: str | None = None
    GOOGLE_SERVICE_ACCOUNT_JSON: str | None = None

    @property
    def lead_sheet_sync_enabled(self) -> bool:
        enabled = self.is_production if self.LEAD_SHEET_SYNC_ENABLED is None else self.LEAD_SHEET_SYNC_ENABLED
        return bool(enabled and self.LEAD_SHEET_SPREADSHEET_ID)

    # ---------- WhatsApp Cloud API (group invites) ----------
    # Unset by default, and the app runs perfectly well that way: the HR board
    # falls back to opening a pre-written wa.me message for the coordinator to
    # send by hand. Fill these in and the same button sends by itself.
    #
    # From Meta: WhatsApp > API Setup gives the phone number id and a token;
    # the template must be created under Message Templates and approved before
    # it can be used. A template is required, not optional - WhatsApp only
    # allows a business to open a conversation with an approved template, and
    # an invite is always the business speaking first.
    WHATSAPP_PHONE_NUMBER_ID: str | None = None
    WHATSAPP_ACCESS_TOKEN: str | None = None
    WHATSAPP_TEMPLATE_NAME: str | None = None
    WHATSAPP_TEMPLATE_LANG: str = "en"
    WHATSAPP_API_VERSION: str = "v21.0"
    # Default country code for numbers stored without one, as Indian mobiles
    # are throughout this system.
    WHATSAPP_DEFAULT_COUNTRY_CODE: str = "91"

    @property
    def whatsapp_configured(self) -> bool:
        return bool(self.WHATSAPP_PHONE_NUMBER_ID and self.WHATSAPP_ACCESS_TOKEN and self.WHATSAPP_TEMPLATE_NAME)

    # ---------- Rate Limiting ----------
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_PUBLIC_FORM: str = "10/minute"

    # ---------- Redis (optional cache / rate limit backend) ----------
    REDIS_URL: str | None = None

    # ---------- File Storage ----------
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    UPLOAD_DIR: str = "app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # AWS S3 (used when STORAGE_BACKEND=s3)
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_S3_BUCKET: str | None = None
    AWS_S3_REGION: str | None = None
    AWS_S3_ENDPOINT_URL: str | None = None

    # ---------- Logging ----------
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "app/logs"

    # ---------- Superuser bootstrap (used by seed script) ----------
    FIRST_SUPERUSER_EMAIL: str = "admin@hrnavinos.com"
    FIRST_SUPERUSER_PASSWORD: str = Field(default="ChangeMe123!", min_length=8)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
