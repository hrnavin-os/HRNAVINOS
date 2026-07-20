# Deployment Guide

Two supported paths to production on an Ubuntu VPS:

- **A. Traditional** — Nginx + systemd (Gunicorn/Uvicorn) + PM2, no Docker
  on the VPS. This is what `deployment/scripts/deploy.sh` automates and what
  the CD workflow (`.github/workflows/deploy.yml`) drives over SSH.
- **B. Docker Compose** — `docker/docker-compose.prod.yml`, if you'd rather
  run everything in containers. Nginx still runs on the host as the
  SSL-terminating reverse proxy either way (see below).

Both paths converge on the same Nginx config
(`deployment/nginx/hrnavinos-erp.conf`): it always proxies to
`127.0.0.1:8000` (backend) and `127.0.0.1:3000` (frontend), regardless of
whether those ports are served by systemd/PM2 or by Docker containers with
published ports.

## A. Traditional Deployment (Nginx + systemd + PM2)

### 1. Provision the server (once)

```bash
git clone <your-repo-url> /tmp/hrnavinos-erp
sudo bash /tmp/hrnavinos-erp/deployment/scripts/setup_server.sh
```

Installs Python 3.12, Node 22, PostgreSQL, Nginx, PM2, Certbot; creates the
`hrnavinos` system user and `/var/www/hrnavinos-erp`.

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE USER hrnavinos WITH PASSWORD 'a-real-password';"
sudo -u postgres psql -c "CREATE DATABASE hrnavinos_erp OWNER hrnavinos;"
```

### 3. Clone the app and configure environment

```bash
sudo -u hrnavinos git clone <your-repo-url> /var/www/hrnavinos-erp
cd /var/www/hrnavinos-erp/backend
sudo -u hrnavinos cp .env.example .env
# edit .env: DATABASE_URL, SECRET_KEY (openssl rand -base64 48), CORS_ORIGINS, FIRST_SUPERUSER_*
```

### 4. Install the systemd service

```bash
sudo cp /var/www/hrnavinos-erp/deployment/systemd/hrnavinos-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hrnavinos-backend
```

### 5. Nginx + SSL

```bash
sudo bash /var/www/hrnavinos-erp/deployment/scripts/setup_nginx.sh yourdomain.com
sudo bash /var/www/hrnavinos-erp/deployment/scripts/setup_ssl.sh yourdomain.com you@yourdomain.com
```

`setup_ssl.sh` uses `certbot --nginx`, which edits the installed site file
in place to add the HTTPS server block and HTTP→HTTPS redirect, and sets up
auto-renewal via certbot's systemd timer.

### 6. First deploy

```bash
sudo -u hrnavinos bash /var/www/hrnavinos-erp/deployment/scripts/deploy.sh
```

Pulls `main`, installs backend deps, runs `alembic upgrade head`, restarts
the `hrnavinos-backend` systemd service, builds the frontend, and
(re)starts it under PM2 (`deployment/pm2/ecosystem.config.cjs`).

Seed the database once, after the first successful deploy:

```bash
cd /var/www/hrnavinos-erp/backend && source .venv/bin/activate
python scripts/seed_db.py
```

### Subsequent deploys (CI/CD)

`.github/workflows/deploy.yml` runs `deployment/scripts/deploy.sh` over SSH
automatically after `CI` succeeds on `main`. Required repo secrets:

| Secret | Description |
|---|---|
| `VPS_HOST` | server IP or hostname |
| `VPS_USER` | SSH user (must be able to `sudo systemctl restart hrnavinos-backend` and reload Nginx passwordlessly — see note below) |
| `VPS_SSH_KEY` | private key matching a public key in that user's `~/.ssh/authorized_keys` |
| `VPS_SSH_PORT` | optional, defaults to 22 |

The deploy user needs passwordless `sudo` for exactly `systemctl restart
hrnavinos-backend`, `systemctl reload nginx`, and `nginx -t` — add a
`/etc/sudoers.d/hrnavinos-deploy` entry scoped to those commands rather than
granting broad sudo.

## B. Docker Compose Deployment

```bash
cd /var/www/hrnavinos-erp
cp .env.example .env.prod   # POSTGRES_*, SECRET_KEY, CORS_ORIGINS, VITE_API_BASE_URL
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d --build
```

Postgres is not exposed to the host; backend binds `127.0.0.1:8000` and
frontend `127.0.0.1:3000` — install the same host-level Nginx config
(`deployment/scripts/setup_nginx.sh` + `setup_ssl.sh`) in front of them as
in path A. Seed once: `docker compose -f docker/docker-compose.prod.yml exec backend python scripts/seed_db.py`.

## Local Development

```bash
docker compose up --build
```

See the root [README.md](../README.md#quick-start-local-development) for
both the Docker and native local-dev paths.

## Backups & Restore

```bash
# Daily via cron (see crontab line in the script header)
bash deployment/scripts/backup.sh

# Restore
bash deployment/scripts/restore.sh /var/backups/hrnavinos-erp/db_20260101_020000.dump \
                                    /var/backups/hrnavinos-erp/uploads_20260101_020000.tar.gz
```

`backup.sh` `pg_dump`s the database and tars `backend/app/uploads/`, pruning
backups older than `BACKUP_RETENTION_DAYS` (default 14). `restore.sh` prompts
for confirmation before dropping/recreating the database.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`/`develop`:
backend lint (`ruff`) → backend tests (`pytest`, against a real Postgres
service container) → frontend lint (`oxlint`) + build. `deploy.yml` only
fires after `CI` succeeds on `main`.
