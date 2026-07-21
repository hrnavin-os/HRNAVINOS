#!/usr/bin/env bash
# Backs up the MongoDB database and uploaded files, keeping the last
# BACKUP_RETENTION_DAYS days. Intended to run daily via cron:
#   0 2 * * * hrnavinos /var/www/hrnavinos-erp/deployment/scripts/backup.sh >> /var/log/hrnavinos-backup.log 2>&1
set -euo pipefail

APP_DIR="/var/www/hrnavinos-erp"
BACKUP_DIR="/var/backups/hrnavinos-erp"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DB_NAME="${MONGODB_DB_NAME:-hrnavinos_erp}"
MONGO_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017}"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up database '$DB_NAME'"
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --archive="$BACKUP_DIR/db_${TIMESTAMP}.archive" --gzip

echo "==> Backing up uploaded files"
tar -czf "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" -C "$APP_DIR/backend/app" uploads

echo "==> Pruning backups older than $BACKUP_RETENTION_DAYS days"
find "$BACKUP_DIR" -type f -mtime "+$BACKUP_RETENTION_DAYS" -name "*.archive" -delete
find "$BACKUP_DIR" -type f -mtime "+$BACKUP_RETENTION_DAYS" -name "*.tar.gz" -delete

echo "==> Backup complete: db_${TIMESTAMP}.archive, uploads_${TIMESTAMP}.tar.gz"
