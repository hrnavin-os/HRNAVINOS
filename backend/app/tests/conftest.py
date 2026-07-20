"""Pytest configuration.

Locally, spins up a throwaway embedded Postgres (via `pgserver`) and points
the app at it *before* any `app.*` module is imported, so
`app.config.settings` picks up the test DATABASE_URL instead of the local
`.env` file. Every test runs against a real Postgres instance -- not SQLite
-- since the app relies on Postgres-specific behavior (native UUID columns,
JSON columns).

In CI, a real Postgres service container is already running and
DATABASE_URL is already set with migrations already applied, so the
embedded-server bootstrap is skipped entirely.
"""
import os
import pathlib
import subprocess
import sys

import pytest

_BACKEND_DIR = pathlib.Path(__file__).resolve().parents[2]
_server = None

os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long-xxxx")
os.environ.setdefault("FIRST_SUPERUSER_EMAIL", "admin@hrnavinos.com")
os.environ.setdefault("FIRST_SUPERUSER_PASSWORD", "ChangeMe123!")
os.environ["APP_ENV"] = "test"
os.environ["RATE_LIMIT_ENABLED"] = "false"

if not os.environ.get("DATABASE_URL"):
    import pgserver

    _data_dir = _BACKEND_DIR / "_pg_test_runtime"
    _server = pgserver.get_server(str(_data_dir))
    _server.psql("CREATE DATABASE hrnavinos_erp_test;")
    _port = _server.get_uri().split(":")[-1].split("/")[0]
    os.environ["DATABASE_URL"] = f"postgresql+psycopg2://postgres:@127.0.0.1:{_port}/hrnavinos_erp_test"

    _migrate = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
    )
    if _migrate.returncode != 0:
        raise RuntimeError(f"Test database migration failed:\n{_migrate.stdout}\n{_migrate.stderr}")

sys.path.insert(0, str(_BACKEND_DIR / "scripts"))


def pytest_sessionfinish(session, exitstatus) -> None:
    if _server is not None:
        _server.cleanup_mode = "delete"


@pytest.fixture(autouse=True)
def clean_db():
    """Truncate every table before each test so tests don't leak state."""
    from sqlalchemy import text

    from app.database.session import engine

    with engine.begin() as conn:
        tables = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'alembic_version'")
        ).scalars().all()
        if tables:
            conn.execute(text(f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def seeded(clean_db):
    """Seeds permissions, default roles, and the first Super Admin user."""
    import seed_db as seed_module

    from app.database.session import SessionLocal

    db = SessionLocal()
    try:
        permissions_by_code = seed_module.seed_permissions(db)
        roles_by_name = seed_module.seed_roles(db, permissions_by_code)
        seed_module.seed_superuser(db, roles_by_name)
    finally:
        db.close()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def superuser_token(client, seeded) -> str:
    from app.config.settings import settings

    response = client.post(
        "/api/v1/auth/login",
        json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": settings.FIRST_SUPERUSER_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def auth_headers(superuser_token: str) -> dict:
    return {"Authorization": f"Bearer {superuser_token}"}
