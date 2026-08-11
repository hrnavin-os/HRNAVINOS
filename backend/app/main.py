"""FastAPI application entrypoint."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config.settings import settings
from app.core.logging_config import configure_logging
from app.database.backfills import run_startup_backfills
from app.database.mongo import close_mongo_connection, connect_to_mongo
from app.exceptions.handlers import register_exception_handlers
from app.middleware.rate_limiter import limiter
from app.middleware.request_context import RequestContextMiddleware
from app.routes.api_router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await connect_to_mongo()
    await run_startup_backfills()
    yield
    await close_mongo_connection()


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="Production ERP system for a Training Institute.",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ---------- Rate limiting ----------
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

    # ---------- CORS ----------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ---------- Request context / access logging ----------
    app.add_middleware(RequestContextMiddleware)

    # ---------- Exception handlers ----------
    register_exception_handlers(app)

    # ---------- Uploaded files (local storage backend) ----------
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    # ---------- Routes ----------
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/api/health", tags=["Health"])
    def health_check() -> dict:
        return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}

    app.openapi = lambda: _custom_openapi(app)

    return app


def _rate_limit_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=429,
        content={"error_code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please try again later."},
    )


def _custom_openapi(app: FastAPI) -> dict:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    }
    for path in schema["paths"].values():
        for operation in path.values():
            operation.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return app.openapi_schema


app = create_application()
