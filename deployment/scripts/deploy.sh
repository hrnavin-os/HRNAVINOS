#!/usr/bin/env bash
# Deploys the latest `main` branch to this VPS: pulls code, installs
# dependencies, builds the frontend, and restarts services. MongoDB is
# schema-less and Beanie creates/updates indexes on app startup, so there is
# no separate migration step.
# Run as the `hrnavinos` app user from anywhere; it cd's into APP_DIR itself.
# Usage: bash deployment/scripts/deploy.sh
set -euo pipefail

# True when a dependency install is actually needed: the lock file's checksum
# differs from the one recorded at the last successful install, or the
# installed tree is missing entirely. Most deploys change only app code, and
# both installers below were paying full price on every one of them - npm ci
# especially, since it deletes node_modules before it starts.
#   $1 lock file   $2 stamp file   $3 directory that must exist
needs_install() {
    [ -d "$3" ] || return 0
    [ -f "$2" ] || return 0
    [ "$(cat "$2")" != "$(sha256sum "$1" | cut -d' ' -f1)" ]
}

stamp_install() {
    sha256sum "$1" | cut -d' ' -f1 > "$2"
}

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
if needs_install requirements.txt .venv/.requirements-sha .venv/lib; then
    pip install --upgrade pip -q
    pip install -r requirements.txt -q
    stamp_install requirements.txt .venv/.requirements-sha
else
    echo "    requirements.txt unchanged, skipping"
fi

echo "==> Restarting backend service"
sudo systemctl restart hrnavinos-backend
sudo systemctl is-active --quiet hrnavinos-backend || {
    echo "ERROR: backend service failed to start" >&2
    sudo journalctl -u hrnavinos-backend -n 50 --no-pager
    exit 1
}

echo "==> Building frontend"
cd "$FRONTEND_DIR"
if needs_install package-lock.json node_modules/.package-lock-sha node_modules; then
    npm ci
    # Stamped after, not before: npm ci empties node_modules first, which
    # would take the stamp with it.
    stamp_install package-lock.json node_modules/.package-lock-sha
else
    echo "    package-lock.json unchanged, skipping npm ci"
fi
npm run build

echo "==> Restarting frontend process"
# PM2 intercepts any script literally named `serve` into its own bundled
# static-server module instead of the real npm `serve` binary, so the
# ecosystem file points at this symlink under a different name.
ln -sf "$(command -v serve)" /usr/local/bin/static-server
pm2 startOrReload "$APP_DIR/deployment/pm2/ecosystem.config.cjs"
pm2 save

echo "==> Reloading Nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Deployment complete: $(git rev-parse --short HEAD)"
