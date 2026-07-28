// PM2 process definition for the built frontend static bundle.
// Requires the `serve` package installed globally on the VPS: npm install -g serve
// Deploy script builds frontend/dist, then PM2 keeps `serve` alive on :3000;
// Nginx (deployment/nginx/hrnavinos-erp.conf) reverse-proxies to it.
module.exports = {
  apps: [
    {
      name: 'hrnavinos-frontend',
      script: 'serve',
      args: '-s dist -l 3000 -n',
      cwd: '/var/www/hrnavinos-erp/frontend',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
}
