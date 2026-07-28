// PM2 process definition for the built frontend static bundle.
// Requires the `serve` package installed globally on the VPS: npm install -g serve
// Deploy script builds frontend/dist, then PM2 keeps `serve` alive on :3000;
// Nginx (deployment/nginx/hrnavinos-erp.conf) reverse-proxies to it.
module.exports = {
  apps: [
    {
      name: 'hrnavinos-frontend',
      // PM2 intercepts any script whose basename is literally 'serve' and
      // routes it to its own bundled static-server module (the `pm2 serve`
      // feature) instead of exec'ing the real npm `serve` binary - even
      // with an absolute path. /usr/local/bin/static-server must be a
      // symlink to the real serve binary (see deployment/scripts/deploy.sh).
      script: '/usr/local/bin/static-server',
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
