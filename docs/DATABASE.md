# Database

MongoDB, accessed via Motor (async driver) and modeled with Beanie
(`backend/app/models/`). Database name: `hrnavinos_erp`.

## Conventions

Every collection's document (via `BaseDocument` in
`backend/app/database/base.py`) has:

- `id` — UUID v4, used as the document's `_id` (kept as UUID rather than
  Beanie's default ObjectId so API responses and route signatures are
  unaffected by the underlying database).
- `created_at` / `updated_at` — timezone-aware datetimes, auto-managed.
- `created_by` / `updated_by` — nullable UUID referencing `users._id`
  (nullable so system/seed-initiated writes don't require a fake user).
  MongoDB has no foreign-key constraints; referential integrity for these
  and all other cross-collection references (e.g. `Student.course_id`) is
  enforced in the service layer by checking existence before writing.
- `is_deleted` / `deleted_at` — soft delete. Repositories filter
  `is_deleted = false` by default; nothing is hard-deleted through the API.

Status/type fields (lead status, payment status, batch status, ...) are
plain Python `StrEnum`s, stored as strings — adding a new value later is a
data change, not a schema migration.

Money fields use `app.database.types.MongoDecimal`, a `Decimal` annotated
with a validator that decodes MongoDB's BSON `Decimal128` back to
`decimal.Decimal` on read (Beanie encodes `Decimal -> Decimal128`
automatically on write, but does not decode the reverse direction itself).

## Collections

| Collection | Notes |
|---|---|
| `users` | staff and student portal accounts |
| `roles` | RBAC role, holds `permission_ids` (references `permissions`) |
| `permissions` | the permission registry (`<module>.<action>` codes) |
| `refresh_tokens` | issued JWT refresh tokens, revocable |
| `login_histories` | every login attempt, success or failure |
| `audit_logs` | immutable change/action trail |
| `leads` | CRM / pre-sales pipeline |
| `admissions` | confirms a student into a course/batch |
| `students` | enrolled learners |
| `courses` | programs offered |
| `batches` | scheduled runs of a course |
| `tutors` | teaching-staff profiles (linked to `users`) |
| `attendances` | one record per student per batch per day |
| `payments` | payment transactions |
| `finance_verifications` | immutable log of payment approve/reject decisions |
| `invoices` | amounts owed by a student |
| `placements` | student job-placement pipeline |
| `companies` | placement partner organizations |
| `notifications` | in-app messages per user |
| `tickets` | help-desk requests |
| `reports` | persisted snapshots from `POST /reports/generate` |
| `settings` | singleton document of institute-wide app settings |

## Indexes

Each model declares its own indexes via Beanie's `Settings.indexes`
(`backend/app/models/*.py`), created automatically on app startup
(`init_beanie` in `backend/app/database/mongo.py`) — there is no separate
migration step. Notable ones:

- `users.email`, `roles.name`, `permissions.code`, `courses.code`,
  `students.email`, `invoices.invoice_number`, `companies.name` — unique.
- `tutors.user_id` — unique (one tutor profile per user account).
- `attendances (student_id, batch_id, date)` — unique compound index,
  named `uq_attendance_student_batch_date` (one attendance record per
  student/batch/day).
- Most foreign-reference fields (`course_id`, `batch_id`, `student_id`,
  `assigned_to`, `status`, ...) are indexed individually to keep list/filter
  queries fast without needing compound indexes at this data volume.

## Relationships

MongoDB has no joins or ORM-style lazy loading. Two patterns are used
throughout:

1. **Reference + explicit fetch** (the default): a document stores a plain
   UUID field (e.g. `Batch.course_id`), and the service layer fetches the
   related document with a second query when needed (e.g.
   `CourseRepository.get_by_id(...)`). This mirrors how the code already
   validated foreign keys before insert, so no new pattern was introduced.
2. **`$lookup` aggregation**, only where a report needs to join across
   collections in one query (`backend/app/repositories/report_aggregation_repository.py`,
   e.g. joining `admissions` to `courses` for the admissions-by-course
   report). See that file for the pipelines.

`Role.permission_ids` and `RoleService._to_response` are a representative
example: the role stores only permission UUIDs, and the service resolves
them into full `Permission` documents when building the API response, the
same way `User.role_id` is resolved into a `Role` (see
`app/core/dependencies.get_user_role`) for permission checks.

## Seeding

`backend/scripts/seed_db.py` is idempotent — safe to re-run. It populates:

1. Every permission defined in `app/permissions/permission_codes.py`.
2. The default roles and their permission grants
   (`app/permissions/role_definitions.py`).
3. The first Super Admin user, from `FIRST_SUPERUSER_EMAIL`/
   `FIRST_SUPERUSER_PASSWORD` in the environment.

## Local / Test MongoDB Without a System Install

`backend/requirements-dev.txt` includes `pymongo-inmemory`, which downloads
and manages a real `mongod` binary (not a mock) — used by
`app/tests/conftest.py` to run the test suite against genuine MongoDB
behavior, and by the same pattern in ad-hoc local dev scripts.
