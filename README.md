# HRNAVINOS ERP

A production-oriented ERP system for a Training Institute — covering CRM/lead
management, admissions, student and batch management, attendance, finance
(payments/invoices), placement, and role-based staff/student administration.

## Tech Stack

**Frontend** — React 19, Vite, Tailwind CSS v4, React Router, Axios, React
Hook Form, TanStack Query, Context API.

**Backend** — Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL,
Pydantic v2, JWT authentication, slowapi (rate limiting).

**DevOps** — Docker / Docker Compose, GitHub Actions CI/CD, Nginx, Gunicorn +
Uvicorn workers, PM2, Let's Encrypt.

## Repository Layout

```
hrnavinos-erp/
├── backend/          FastAPI application (see backend section below)
├── frontend/         React SPA (Vite)
├── deployment/       Nginx config, systemd unit, PM2 config, VPS scripts
├── docker/           Production docker-compose variant
├── docs/             Architecture, API, deployment, database documentation
├── .github/workflows/  CI (lint/test/build) and CD (deploy) pipelines
└── docker-compose.yml  Local full-stack dev environment
```

See [docs/FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md) for the full breakdown.

## Backend Architecture

The backend follows a strict layered (clean) architecture — routes never
contain business logic:

```
Route (HTTP I/O, permission checks)
  -> Service (business logic, transactions, audit logging)
    -> Repository (data access, SQLAlchemy queries)
      -> Model (ORM entity)
```

Every module ships with a Model, Pydantic Schemas (DTOs), a Repository, a
Service, a Router, and (for the core modules) tests. See
[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for the full pattern and
how to add a new module.

## Quick Start (Local Development)

### Option A — Docker Compose (recommended, fewest moving parts)

```bash
cp .env.example .env               # fill in a real SECRET_KEY
docker compose up --build
```

- Backend: http://localhost:8000/api/docs (Swagger UI)
- Frontend: http://localhost:5173

Then seed the database (first run only):

```bash
docker compose exec backend python scripts/seed_db.py
```

Log in with the seeded Super Admin: `admin@hrnavinos.com` /
`ChangeMe123!` (change this immediately — see `FIRST_SUPERUSER_PASSWORD`
in `backend/.env`).

### Option B — Run natively

**Backend**

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env     # point DATABASE_URL at a real local Postgres
alembic upgrade head
python scripts/seed_db.py
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Running Tests

```bash
cd backend
pip install -r requirements-dev.txt   # adds pgserver, an embedded Postgres for tests
pytest
```

Tests run against a real (throwaway, embedded) PostgreSQL instance rather
than SQLite, since the app relies on Postgres-specific column types.

## Documentation

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) — architecture, module pattern, RBAC
- [docs/API.md](docs/API.md) — API conventions and module/endpoint map (full interactive docs at `/api/docs`)
- [docs/DATABASE.md](docs/DATABASE.md) — schema, ER diagram, conventions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — VPS + Docker deployment guide
- [docs/FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md) — full repository layout

## License

Proprietary — internal use only.
