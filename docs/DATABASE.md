# Database

PostgreSQL, managed via SQLAlchemy 2.0 models and Alembic migrations
(`backend/migrations/`).

## Conventions

Every table (via `BaseModel` in `backend/app/database/base.py`) has:

- `id` — UUID v4 primary key.
- `created_at` / `updated_at` — timestamptz, auto-managed.
- `created_by` / `updated_by` — nullable FK to `users.id` (nullable so
  system/seed-initiated writes don't require a fake user).
- `is_deleted` / `deleted_at` — soft delete. Repositories filter
  `is_deleted = false` by default; nothing is hard-deleted through the API.

Status/type fields (lead status, payment status, batch status, ...) are
stored as `VARCHAR` (`Enum(..., native_enum=False)`), not native Postgres
enum types — adding a new status value later is a data change, not a schema
migration against a Postgres type.

## Entity-Relationship Diagram

```mermaid
erDiagram
    ROLE ||--o{ USER : "has many"
    ROLE }o--o{ PERMISSION : "role_permissions"
    USER ||--o| TUTOR : "profile"
    USER ||--o| STUDENT : "portal login (optional)"
    USER ||--o{ REFRESH_TOKEN : "sessions"
    USER ||--o{ LOGIN_HISTORY : "attempts"
    USER ||--o{ AUDIT_LOG : "actor"
    USER ||--o{ LEAD : "assigned_to"
    USER ||--o{ TICKET : "raised_by / assigned_to"
    USER ||--o{ NOTIFICATION : "recipient"

    COURSE ||--o{ BATCH : "runs"
    TUTOR ||--o{ BATCH : "teaches"
    BATCH ||--o{ STUDENT : "enrolled in"
    COURSE ||--o{ STUDENT : "enrolled in"

    LEAD ||--o| ADMISSION : "converts to"
    STUDENT ||--o{ ADMISSION : "has"
    COURSE ||--o{ ADMISSION : "for"
    BATCH ||--o{ ADMISSION : "into"

    STUDENT ||--o{ ATTENDANCE : "marked for"
    BATCH ||--o{ ATTENDANCE : "session in"

    STUDENT ||--o{ INVOICE : "billed"
    ADMISSION ||--o| INVOICE : "generates"
    STUDENT ||--o{ PAYMENT : "pays"
    INVOICE ||--o{ PAYMENT : "settles"

    STUDENT ||--o{ PLACEMENT : "placed via"

    ROLE {
        uuid id PK
        string name
        bool is_system
    }
    PERMISSION {
        uuid id PK
        string code
        string module
        string action
    }
    USER {
        uuid id PK
        string email
        string password_hash
        uuid role_id FK
        bool is_active
    }
    COURSE {
        uuid id PK
        string name
        string code
        numeric fee
    }
    BATCH {
        uuid id PK
        uuid course_id FK
        uuid tutor_id FK
        date start_date
        date end_date
        string status
    }
    TUTOR {
        uuid id PK
        uuid user_id FK
        string specialization
    }
    STUDENT {
        uuid id PK
        uuid user_id FK
        uuid course_id FK
        uuid batch_id FK
        string status
    }
    LEAD {
        uuid id PK
        string name
        string phone
        string status
        uuid assigned_to FK
    }
    ADMISSION {
        uuid id PK
        uuid lead_id FK
        uuid student_id FK
        uuid course_id FK
        uuid batch_id FK
        numeric total_fee
        string status
    }
    ATTENDANCE {
        uuid id PK
        uuid student_id FK
        uuid batch_id FK
        date date
        string status
    }
    INVOICE {
        uuid id PK
        uuid student_id FK
        uuid admission_id FK
        string invoice_number
        numeric amount
        string status
    }
    PAYMENT {
        uuid id PK
        uuid student_id FK
        uuid invoice_id FK
        numeric amount
        string status
    }
    PLACEMENT {
        uuid id PK
        uuid student_id FK
        string company_name
        string status
    }
    TICKET {
        uuid id PK
        uuid raised_by FK
        uuid assigned_to FK
        string status
        string priority
    }
    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        string type
        bool is_read
    }
    AUDIT_LOG {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        json changes
    }
```

## Migrations

```bash
cd backend
alembic revision --autogenerate -m "describe the change"
# review the generated file in migrations/versions/ before applying
alembic upgrade head
```

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#alembic-the-rolesusers-circular-fk)
for the one structural gotcha in the initial migration (the roles/users
circular foreign key).

## Seeding

`backend/scripts/seed_db.py` is idempotent — safe to re-run. It populates:

1. Every permission defined in `app/permissions/permission_codes.py`.
2. The default roles and their permission grants
   (`app/permissions/role_definitions.py`).
3. The first Super Admin user, from `FIRST_SUPERUSER_EMAIL`/
   `FIRST_SUPERUSER_PASSWORD` in the environment.
