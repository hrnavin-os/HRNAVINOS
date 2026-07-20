#!/usr/bin/env bash
# Installs the HRNAVINOS ERP Nginx site config. Run as sudo.
# Usage: sudo bash deployment/scripts/setup_nginx.sh <domain>
set -euo pipefail

DOMAIN="${1:?Usage: setup_nginx.sh <domain>}"
APP_DIR="/var/www/hrnavinos-erp"
CONF_SRC="$APP_DIR/deployment/nginx/hrnavinos-erp.conf"
CONF_DST="/etc/nginx/sites-available/hrnavinos-erp.conf"

echo "==> Installing Nginx config for $DOMAIN"
sed "s/example\.com/$DOMAIN/g" "$CONF_SRC" > "$CONF_DST"

ln -sf "$CONF_DST" /etc/nginx/sites-enabled/hrnavinos-erp.conf
rm -f /etc/nginx/sites-enabled/default

mkdir -p /var/www/certbot

nginx -t
systemctl reload nginx

echo "==> Nginx site installed. Run setup_ssl.sh $DOMAIN next to enable HTTPS."
