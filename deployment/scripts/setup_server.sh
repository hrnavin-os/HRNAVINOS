#!/usr/bin/env bash
# One-time Ubuntu VPS provisioning for HRNAVINOS ERP.
# Installs: Python 3.12, Node.js 22, PostgreSQL, Nginx, Git, PM2, Certbot.
# Run once as a sudo-capable user: sudo bash deployment/scripts/setup_server.sh
set -euo pipefail

APP_USER="hrnavinos"
APP_DIR="/var/www/hrnavinos-erp"

echo "==> Updating apt packages"
apt-get update -y
apt-get upgrade -y

echo "==> Installing base packages"
apt-get install -y \
    software-properties-common \
    build-essential \
    curl \
    git \
    ufw \
    libpq-dev \
    nginx \
    postgresql \
    postgresql-contrib \
    certbot \
    python3-certbot-nginx

echo "==> Installing Python 3.12"
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.12 python3.12-venv python3.12-dev

echo "==> Installing Node.js 22 (NodeSource)"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing PM2 globally"
npm install -g pm2 serve

echo "==> Creating application user and directory"
id -u "$APP_USER" &>/dev/null || useradd --system --shell /bin/bash --create-home "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

echo "==> Configuring firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Enabling services"
systemctl enable --now postgresql
systemctl enable --now nginx

cat <<'EOF'

==> Server provisioning complete.

Next steps:
  1. Create the application database and user:
       sudo -u postgres psql -c "CREATE USER hrnavinos WITH PASSWORD 'change-me';"
       sudo -u postgres psql -c "CREATE DATABASE hrnavinos_erp OWNER hrnavinos;"
  2. Clone the repository into /var/www/hrnavinos-erp as the hrnavinos user.
  3. Copy backend/.env.example -> backend/.env and fill in real values.
  4. Run deployment/scripts/setup_nginx.sh to install the Nginx site config.
  5. Run deployment/scripts/setup_ssl.sh <domain> to obtain a Let's Encrypt certificate.
  6. Run deployment/scripts/deploy.sh for the first deployment.
EOF
