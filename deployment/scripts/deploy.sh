#!/usr/bin/env bash
# Deploys the latest `main` branch to this VPS: pulls code, installs
# dependencies, builds the frontend, and restarts services. MongoDB is
# schema-less and Beanie creates/updates indexes on app startup, so there is
# no separate migration step.
# Run as the `hrnavinos` app user from anywhere; it cd's into APP_DIR itself.
# Usage: bash deployment/scripts/deploy.sh
set -euo pipefail

APP_DIR="/var/www/hrnavinos-erp"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo "==> Pulling latest code"
cd "$APP_DIR"
git fetch origin main
git reset --hard origin/main

echo "==> Installing backend dependencies"
cd "$BACKEND_DIR"
if [ ! -d .venv ]; then
    python3.12 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

echo "==> Restarting backend service"
sudo systemctl restart hrnavinos-backend
sudo systemctl is-active --quiet hrnavinos-backend || {
    echo "ERROR: backend service failed to start" >&2
    sudo journalctl -u hrnavinos-backend -n 50 --no-pager
    exit 1
}

echo "==> Building frontend"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "==> Restarting frontend process"
pm2 startOrReload "$APP_DIR/deployment/pm2/ecosystem.config.cjs"
pm2 save

echo "==> Reloading Nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Deployment complete: $(git rev-parse --short HEAD)"
