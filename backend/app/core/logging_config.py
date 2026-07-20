"""Structured JSON logging configuration."""
import logging
import logging.config
import os

from app.config.settings import settings


def configure_logging() -> None:
    os.makedirs(settings.LOG_DIR, exist_ok=True)

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                    "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
                },
                "console": {
                    "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "console" if settings.APP_ENV == "development" else "json",
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "filename": os.path.join(settings.LOG_DIR, "app.log"),
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 5,
                    "formatter": "json",
                },
            },
            "root": {
                "level": settings.LOG_LEVEL,
                "handlers": ["console", "file"],
            },
            "loggers": {
                "uvicorn.access": {"level": "WARNING", "propagate": True},
                "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
            },
        }
    )
