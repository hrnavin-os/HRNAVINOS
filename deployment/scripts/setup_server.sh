#!/usr/bin/env bash
# One-time Ubuntu VPS provisioning for HRNAVINOS ERP.
# Installs: Python 3.12, Node.js 22, MongoDB 7, Nginx, Git, PM2, Certbot.
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
    gnupg \
    git \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx

echo "==> Installing MongoDB 7"
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt-get update -y
apt-get install -y mongodb-org

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
systemctl enable --now mongod
systemctl enable --now nginx

cat <<'EOF'

==> Server provisioning complete.

Next steps:
  1. (Optional but recommended) Enable MongoDB auth and create an app user:
       mongosh --eval '
         db.getSiblingDB("admin").createUser({
           user: "hrnavinos", pwd: "change-me",
           roles: [{ role: "readWrite", db: "hrnavinos_erp" }]
         })'
     then set `security.authorization: enabled` in /etc/mongod.conf and
     restart mongod, and use a MONGODB_URI with credentials in backend/.env.
  2. Clone the repository into /var/www/hrnavinos-erp as the hrnavinos user.
  3. Copy backend/.env.example -> backend/.env and fill in real values
     (MONGODB_URI, MONGODB_DB_NAME=hrnavinos_erp, SECRET_KEY, ...).
  4. Run deployment/scripts/setup_nginx.sh to install the Nginx site config.
  5. Run deployment/scripts/setup_ssl.sh <domain> to obtain a Let's Encrypt certificate.
  6. Run deployment/scripts/deploy.sh for the first deployment.
EOF
