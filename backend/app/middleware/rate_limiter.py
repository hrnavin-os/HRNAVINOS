"""Rate limiting setup using slowapi (Redis-backed if configured, in-memory otherwise)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config.settings import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT] if settings.RATE_LIMIT_ENABLED else [],
    storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://",
    enabled=settings.RATE_LIMIT_ENABLED,
)
