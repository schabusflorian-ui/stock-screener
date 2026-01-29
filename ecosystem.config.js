/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js           # Start all services
 *   pm2 start ecosystem.config.js --only api  # Start API only
 *   pm2 start ecosystem.config.js --only price-scheduler  # Start scheduler only
 *   pm2 logs                                # View logs
 *   pm2 monit                               # Monitor dashboard
 */

module.exports = {
  apps: [
    {
      name: 'api',
      script: 'src/api/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'price-scheduler',
      script: 'src/jobs/priceUpdateScheduler.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      // Don't cron this - the scheduler handles its own timing
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
