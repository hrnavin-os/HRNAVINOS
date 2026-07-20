# Folder Structure

```
hrnavinos-erp/
│
├── backend/
│   ├── app/
│   │   ├── core/               Cross-cutting: security (JWT/hashing), logging config, current-user/permission dependencies
│   │   ├── config/              Pydantic settings (env-var driven)
│   │   ├── database/            Declarative Base, mixins (UUID PK, timestamps, audit, soft delete), session/engine
│   │   ├── auth/                 (reserved for auth-specific helpers beyond core/security.py)
│   │   ├── models/               SQLAlchemy ORM entities, one file per entity + enums.py + __init__.py (imports all)
│   │   ├── schemas/              Pydantic request/response DTOs, one file per module
│   │   ├── repositories/         Data access layer; base_repository.py + one file per entity
│   │   ├── services/             Business logic layer; one file per module
│   │   ├── routes/                FastAPI routers; one file per module + api_router.py (aggregator)
│   │   ├── middleware/           Request ID/access logging, rate limiter setup
│   │   ├── permissions/          Permission code registry + default role→permission mapping
│   │   ├── validators/           (reserved for cross-field/cross-entity validation helpers)
│   │   ├── exceptions/           Domain exception hierarchy + centralized HTTP exception handlers
│   │   ├── utils/                 (reserved for generic helpers)
│   │   ├── tests/                 pytest suite + conftest.py (embedded-Postgres test harness)
│   │   ├── uploads/               local file storage (STORAGE_BACKEND=local)
│   │   ├── logs/                  rotating file logs (JSON in prod, console in dev)
│   │   └── main.py                FastAPI app factory: middleware, CORS, exception handlers, routers
│   ├── migrations/                Alembic environment + versioned migration scripts
│   ├── scripts/                   seed_db.py (idempotent permissions/roles/superuser seed)
│   ├── requirements.txt           Runtime dependencies
│   ├── requirements-dev.txt       + test-only deps (pgserver)
│   ├── pytest.ini
│   ├── alembic.ini
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   └── src/
│       ├── assets/                static assets
│       ├── components/
│       │   ├── ui/                Generic primitives: Button, Input, Select, Modal, DataTable, Pagination, Badge, ...
│       │   ├── layout/            Sidebar, Topbar
│       │   ├── dashboard/         StatCard
│       │   └── resource/          ResourceListPage + ResourceForm — the shared CRUD page shell
│       ├── layouts/               AuthLayout, DashboardLayout (React Router layout routes)
│       ├── pages/                 One folder per module (auth, dashboard, courses, students, leads, ...)
│       ├── hooks/                 useAuth, usePaginatedQuery
│       ├── services/               Axios instance + interceptors, one file per module (thin REST clients)
│       ├── contexts/               AuthContext (current user, login/logout, hasPermission)
│       ├── routes/                 AppRoutes, ProtectedRoute
│       ├── utils/                  formatters, tokenStorage
│       ├── constants/              config, permissions (mirrors backend), navigation
│       └── styles/                 Tailwind entrypoint
│   ├── Dockerfile                  multi-stage: node build -> nginx serve
│   ├── nginx.conf                  container-internal nginx (SPA fallback + /api proxy for docker-compose)
│   └── .env.example
│
├── deployment/
│   ├── nginx/hrnavinos-erp.conf    Host-level reverse proxy (VPS)
│   ├── systemd/hrnavinos-backend.service
│   ├── pm2/ecosystem.config.cjs
│   └── scripts/                    setup_server.sh, setup_nginx.sh, setup_ssl.sh, deploy.sh, backup.sh, restore.sh
│
├── docker/
│   └── docker-compose.prod.yml     Production compose variant (Postgres not host-exposed, resource limits)
│
├── docs/                            This documentation set
│
├── .github/workflows/
│   ├── ci.yml                       Lint + test + build, on every push/PR
│   └── deploy.yml                   SSH deploy to VPS, on CI success on main
│
├── docker-compose.yml               Local full-stack dev environment
├── .env.example                     docker-compose env vars
├── .gitignore
└── README.md
```
