# Developer Guide

## Architecture

The backend is a layered (clean) architecture. Each layer only knows about
the layer directly beneath it:

| Layer | Location | Responsibility |
|---|---|---|
| Routes | `backend/app/routes/` | HTTP I/O only: parse request, call a service, shape the response. Permission checks live here as FastAPI dependencies. No business logic, no direct DB access. All handlers are `async def`. |
| Services | `backend/app/services/` | Business logic, orchestration across repositories, audit logging. Raises domain exceptions (`app/exceptions/base.py`), never `HTTPException`. |
| Repositories | `backend/app/repositories/` | Beanie/Motor queries only. Subclasses `BaseRepository` (`app/repositories/base_repository.py`) for CRUD + pagination/search/sort; add entity-specific queries as methods. |
| Models | `backend/app/models/` | Beanie `Document` subclasses (one per MongoDB collection). All inherit `BaseDocument` (`app/database/base.py`), which provides a UUID `id`, `created_at`/`updated_at`, `created_by`/`updated_by`, and soft delete (`is_deleted`/`deleted_at`). |
| Schemas | `backend/app/schemas/` | Pydantic request/response DTOs. Routes never accept or return Beanie documents directly. |

Errors flow up as `AppException` subclasses and are converted to HTTP
responses once, centrally, in `app/exceptions/handlers.py` — routes and
services never construct HTTP status codes themselves.

MongoDB has no joins or relationship loading: anywhere the old relational
model would have used `user.role` or a `JOIN`, this codebase does an
explicit second fetch instead (see "Resolving References" below). Every
service method and repository method is `async`; there is no shared
per-request session object to inject — repositories call the Beanie
`Document` classes directly, which are bound to the single global Motor
client set up in `app/database/mongo.py`.

## Adding a New Module

Follow the pattern used by every existing module (e.g. `course`):

1. **Model** — `app/models/<name>.py`, inherit `BaseDocument`, set
   `class Settings: name = "<collection>"` and any `indexes`. Register it
   in `app/models/__init__.py`'s `ALL_DOCUMENTS` list so
   `init_beanie()` picks it up on startup.
2. **Schema** — `app/schemas/<name>_schema.py`: `<Name>Create`,
   `<Name>Update`, `<Name>Response` Pydantic models.
3. **Repository** — `app/repositories/<name>_repository.py`, subclass
   `BaseRepository[<Model>]`; add only queries the generic base doesn't cover.
4. **Service** — `app/services/<name>_service.py`: `create`/`get`/`list`/
   `update`/`delete`, each calling `await AuditService.record(...)`.
5. **Permissions** — add `<module>.<action>` codes to
   `app/permissions/permission_codes.py`, and wire them into
   `app/permissions/role_definitions.py` for whichever roles should have
   them by default.
6. **Routes** — `app/routes/<name>_routes.py`, `async def` handlers,
   protect each endpoint with `Depends(RequirePermissions(Permissions.X))`.
   Register the router in `app/routes/api_router.py`.
7. **Indexes** — created automatically the next time the app starts
   (`connect_to_mongo()` -> `init_beanie()`); there is no separate
   migration command to run.
8. **Tests** — `app/tests/test_<name>.py` using the `client`/`auth_headers`
   fixtures from `conftest.py` (write `async def test_...`, `await client.get(...)`).
9. **Frontend** — for a standard CRUD module, add a service
   (`frontend/src/services/<name>Service.js` via `createResourceService`)
   and a page using `<ResourceListPage>` (see `CoursesPage.jsx` for the
   simplest example, `BatchesPage.jsx` for one with select-field options).

## RBAC Model

- `Permission` — a single grantable capability, `<module>.<action>` (e.g.
  `students.create`).
- `Role` — a named bundle of permissions, storing `permission_ids`
  (references into `permissions`). Seeded roles: Super Admin, Sales Head,
  Pre Sales Executive, Post Sales Executive, Admin Head, Admin Executive,
  Placement Head, Placement Executive, Finance, Tutor, Student.
- `User.role_id` — each user has exactly one role.
- **Super Admin bypasses all permission checks** (see
  `RequirePermissions.__call__` in `app/core/dependencies.py`) — it does not
  need every permission explicitly granted, though the seed script grants
  them all anyway for consistency in the `/roles` UI.
- Adjust default grants in `app/permissions/role_definitions.py` and re-run
  `python scripts/seed_db.py` (idempotent — safe to re-run).

## Resolving References (no joins)

Where SQLAlchemy would auto-load a relationship, this codebase resolves it
explicitly:

- `app/core/dependencies.get_user_role(user)` fetches the `Role` for a
  `User.role_id`; `get_role_permission_codes(role)` then resolves that
  role's `permission_ids` into `Permission` documents to get the actual
  codes. `RequirePermissions`/`RequireRoles` and the `/auth/me` and
  `/auth/login` (JWT `role` claim) code paths all call these instead of
  expecting a pre-loaded `user.role`.
- `RoleService._to_response(role)` and `UserService.to_response(user)` /
  `to_list_response(user)` resolve `permission_ids` / `role_id` into the
  nested `permissions` / `role` objects the API response shape requires —
  call these instead of `Response.model_validate(document)` directly for
  `Role` and `User`.
- Cross-collection reports (e.g. admissions-by-course, needing course
  names) use a MongoDB `$lookup` aggregation stage instead —see
  `app/repositories/report_aggregation_repository.py`.

## MongoDecimal

Money fields (`fee`, `amount`, `total_fee`, ...) are typed as
`app.database.types.MongoDecimal`, not plain `decimal.Decimal`. Beanie
encodes `Decimal -> Decimal128` automatically when writing, but does not
decode `Decimal128 -> Decimal` when reading a document back — `MongoDecimal`
adds a `BeforeValidator` that does. Use it for any new money/precision
field on a `BaseDocument` subclass; plain Pydantic schemas (DTOs, not
documents) can keep using plain `Decimal`.

## Frontend Architecture

- `services/apiClient.js` — a single Axios instance with a request
  interceptor (attaches the bearer token) and a response interceptor (on a
  401, refreshes the access token once and retries; on refresh failure,
  clears tokens and redirects to `/login`).
- `services/resourceService.js` — factory for the standard paginated-CRUD
  REST pattern (`list`/`get`/`create`/`update`/`remove`); every simple
  module service is one line: `createResourceService('/courses')`.
- `contexts/AuthContext.jsx` + `hooks/useAuth.js` — current user, login/
  logout, and `hasPermission(code)` used to gate both routes
  (`routes/ProtectedRoute.jsx`) and individual UI elements (buttons, nav
  items).
- `components/resource/ResourceListPage.jsx` — shared "list + search +
  paginate + create modal" page shell used by most modules; module pages
  are mostly just column/field configuration (see `pages/courses/`,
  `pages/batches/`).
- Modules with non-CRUD behavior (attendance bulk-marking, payment
  verification, lead assignment, reports) have bespoke pages/components
  instead of forcing them into the generic shell.

## Local Testing Without a Local MongoDB Install

`backend/requirements-dev.txt` includes `pymongo-inmemory`, which downloads
and manages a real `mongod` binary (not a mock). `app/tests/conftest.py`
uses it to spin up a throwaway MongoDB instance for `pytest` runs (and
skips this entirely if `MONGODB_URI` is already set in the environment,
e.g. in CI, where a real MongoDB service container is provided instead).

Tests drive the app over `httpx.AsyncClient` + `ASGITransport` rather than
FastAPI's `TestClient`, connecting/disconnecting Beanie explicitly per test
(see the `client` fixture) instead of relying on the app's lifespan — this
keeps everything on the single event loop pytest-asyncio provides, which
Motor's async client requires. All test functions are `async def`
(`pytest.ini` sets `asyncio_mode = auto`, so no `@pytest.mark.asyncio`
decorators are needed).
