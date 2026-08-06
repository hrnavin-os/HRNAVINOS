"""Pytest configuration.

Locally, spins up a throwaway embedded MongoDB (via `pymongo-inmemory`) and
points the app at it *before* any `app.*` module is imported, so
`app.config.settings` picks up the test MONGODB_URI instead of the local
`.env` file.

Tests drive the app over an in-process ASGI transport (httpx.AsyncClient +
ASGITransport) rather than FastAPI's TestClient, and the Mongo connection is
opened/closed explicitly per test rather than via the app's lifespan --
everything then stays on the single event loop pytest-asyncio provides,
which Motor's async client requires.

In CI, a real MongoDB service container is already running and MONGODB_URI
is already set, so the embedded-server bootstrap is skipped entirely.

CI runs the suite in parallel (`pytest -n auto`). That pays off there
because every worker shares the one service container. Locally it does the
opposite: with no MONGODB_URI each worker starts its *own* embedded mongod,
so `-n auto` on a 12-core machine boots twelve of them and ends up slower
than running serially. Run plain `pytest` locally, or point MONGODB_URI at a
running MongoDB first if you want the parallel speedup.
"""
import os
import pathlib
import sys

import pytest_asyncio

_BACKEND_DIR = pathlib.Path(__file__).resolve().parents[2]
_mongo_server = None

os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long-xxxx")
os.environ.setdefault("FIRST_SUPERUSER_EMAIL", "admin@hrnavinos.com")
os.environ.setdefault("FIRST_SUPERUSER_PASSWORD", "ChangeMe123!")
os.environ["APP_ENV"] = "test"
os.environ["RATE_LIMIT_ENABLED"] = "false"

# Under `pytest -n`, every worker imports this file in its own process. They
# must not share a database: the `client` fixture drops it between tests, so
# workers would wipe each other's data mid-run and fail at random.
_WORKER = os.environ.get("PYTEST_XDIST_WORKER")  # "gw0", "gw1", ... or None

if not os.environ.get("MONGODB_URI"):
    # A port and data folder per worker, since each process starts its own
    # embedded server. In CI this whole branch is skipped - MONGODB_URI points
    # at the MongoDB service container and all workers share that one server,
    # isolated by database name below.
    _port = 27118 + (int(_WORKER.removeprefix("gw")) if _WORKER else 0)
    _mongo_data_dir = _BACKEND_DIR / "_mongo_test_runtime" / (_WORKER or "main")
    # mongod writes its log here on startup and won't create the path itself.
    _mongo_data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["PYMONGOIM__MONGOD_DATA_FOLDER"] = str(_mongo_data_dir)
    os.environ["PYMONGOIM__MONGOD_PORT"] = str(_port)

    from pymongo_inmemory.context import Context
    from pymongo_inmemory.mongod import Mongod

    _mongo_server = Mongod(Context())
    _mongo_server.start()
    os.environ["MONGODB_URI"] = f"mongodb://127.0.0.1:{_port}"

# Respects an explicitly-set name (CI sets one) and still isolates workers.
_base_db = os.environ.get("MONGODB_DB_NAME", "hrnavinos_erp_test")
os.environ["MONGODB_DB_NAME"] = f"{_base_db}_{_WORKER}" if _WORKER else _base_db

sys.path.insert(0, str(_BACKEND_DIR / "scripts"))


def pytest_sessionfinish(session, exitstatus) -> None:
    if _mongo_server is not None:
        _mongo_server.stop()


@pytest_asyncio.fixture
async def client():
    """Fresh database + a live Beanie connection + an ASGI-transport HTTP
    client, all on this test's event loop. Bypasses the app's own lifespan
    (which is only exercised for real by uvicorn/gunicorn in production)."""
    from httpx import ASGITransport, AsyncClient
    from motor.motor_asyncio import AsyncIOMotorClient

    from app.config.settings import settings
    from app.database.mongo import close_mongo_connection, connect_to_mongo
    from app.main import app

    drop_client = AsyncIOMotorClient(settings.MONGODB_URI, uuidRepresentation="standard")
    await drop_client.drop_database(settings.MONGODB_DB_NAME)
    drop_client.close()

    await connect_to_mongo()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
            yield ac
    finally:
        await close_mongo_connection()


@pytest_asyncio.fixture
async def seeded(client):
    """Seeds permissions, default roles, and the first Super Admin user."""
    import seed_db as seed_module

    await seed_module.run_seed()
    yield client


@pytest_asyncio.fixture
async def auth_headers(seeded) -> dict:
    from app.config.settings import settings

    response = await seeded.post(
        "/api/v1/auth/login",
        json={"email": settings.FIRST_SUPERUSER_EMAIL, "password": settings.FIRST_SUPERUSER_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
