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
