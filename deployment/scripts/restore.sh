#!/usr/bin/env bash
# Restores the database and uploaded files from a backup produced by backup.sh.
# Usage: bash deployment/scripts/restore.sh <db_backup.dump> [uploads_backup.tar.gz]
set -euo pipefail

DB_BACKUP="${1:?Usage: restore.sh <db_backup.dump> [uploads_backup.tar.gz]}"
UPLOADS_BACKUP="${2:-}"

APP_DIR="/var/www/hrnavinos-erp"
DB_NAME="${POSTGRES_DB:-hrnavinos_erp}"
DB_USER="${POSTGRES_USER:-hrnavinos}"

if [ ! -f "$DB_BACKUP" ]; then
    echo "ERROR: backup file not found: $DB_BACKUP" >&2
    exit 1
fi

read -r -p "This will DROP and recreate database '$DB_NAME'. Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 1
fi

echo "==> Stopping backend service"
sudo systemctl stop hrnavinos-backend || true

echo "==> Restoring database from $DB_BACKUP"
PGPASSWORD="${POSTGRES_PASSWORD:-}" dropdb -U "$DB_USER" -h 127.0.0.1 --if-exists "$DB_NAME"
PGPASSWORD="${POSTGRES_PASSWORD:-}" createdb -U "$DB_USER" -h 127.0.0.1 "$DB_NAME"
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_restore -U "$DB_USER" -h 127.0.0.1 -d "$DB_NAME" "$DB_BACKUP"

if [ -n "$UPLOADS_BACKUP" ]; then
    if [ ! -f "$UPLOADS_BACKUP" ]; then
        echo "ERROR: uploads backup file not found: $UPLOADS_BACKUP" >&2
        exit 1
    fi
    echo "==> Restoring uploaded files from $UPLOADS_BACKUP"
    tar -xzf "$UPLOADS_BACKUP" -C "$APP_DIR/backend/app"
fi

echo "==> Starting backend service"
sudo systemctl start hrnavinos-backend

echo "==> Restore complete."
