#!/usr/bin/env bash
# Backs up the Postgres database and uploaded files, keeping the last
# BACKUP_RETENTION_DAYS days. Intended to run daily via cron:
#   0 2 * * * hrnavinos /var/www/hrnavinos-erp/deployment/scripts/backup.sh >> /var/log/hrnavinos-backup.log 2>&1
set -euo pipefail

APP_DIR="/var/www/hrnavinos-erp"
BACKUP_DIR="/var/backups/hrnavinos-erp"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DB_NAME="${POSTGRES_DB:-hrnavinos_erp}"
DB_USER="${POSTGRES_USER:-hrnavinos}"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up database '$DB_NAME'"
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -U "$DB_USER" -h 127.0.0.1 -Fc "$DB_NAME" \
    > "$BACKUP_DIR/db_${TIMESTAMP}.dump"

echo "==> Backing up uploaded files"
tar -czf "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" -C "$APP_DIR/backend/app" uploads

echo "==> Pruning backups older than $BACKUP_RETENTION_DAYS days"
find "$BACKUP_DIR" -type f -mtime "+$BACKUP_RETENTION_DAYS" -name "*.dump" -delete
find "$BACKUP_DIR" -type f -mtime "+$BACKUP_RETENTION_DAYS" -name "*.tar.gz" -delete

echo "==> Backup complete: db_${TIMESTAMP}.dump, uploads_${TIMESTAMP}.tar.gz"
