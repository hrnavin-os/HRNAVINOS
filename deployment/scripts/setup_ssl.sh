#!/usr/bin/env bash
# Obtains and installs a Let's Encrypt certificate for the HRNAVINOS ERP
# Nginx site via the certbot Nginx plugin, which edits the site file in
# place to add the HTTPS server block and HTTP->HTTPS redirect.
# Usage: sudo bash deployment/scripts/setup_ssl.sh <domain> [email]
set -euo pipefail

DOMAIN="${1:?Usage: setup_ssl.sh <domain> [email]}"
EMAIL="${2:-admin@$DOMAIN}"

certbot --nginx \
    -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos \
    -m "$EMAIL" \
    --redirect

systemctl reload nginx

echo "==> SSL certificate installed for $DOMAIN. Auto-renewal is handled by certbot's systemd timer."
certbot renew --dry-run
