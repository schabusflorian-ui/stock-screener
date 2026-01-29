// src/middleware/healthCheck.js
// Enhanced health check endpoint with detailed system checks

const os = require('os');

/**
 * Create health check router
 * @param {Object} options - Configuration options
 * @param {Object} options.db - Database instance
 * @param {Object} options.redis - Redis client (optional)
 */
function createHealthCheckRouter(options = {}) {
  const express = require('express');
  const router = express.Router();

  const { db, redis } = options;

  /**
   * Basic health check (for load balancer / k8s liveness probe)
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Liveness probe - is the process alive?
   */
  router.get('/health/live', (req, res) => {
    res.status(200).send('OK');
  });

  /**
   * Readiness probe - is the service ready to handle requests?
   */
  router.get('/health/ready', async (req, res) => {
    try {
      // Check database connection
      if (db) {
        if (db.type === 'postgres') {
          await db.query('SELECT 1');
        } else {
          db.prepare('SELECT 1').get();
        }
      }

      res.status(200).send('OK');
    } catch (err) {
      res.status(503).send('Not Ready');
    }
  });

  /**
   * Detailed health check (for monitoring dashboards)
   */
  router.get('/health/detailed', async (req, res) => {
    const startTime = Date.now();
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      checks: {},
      system: {},
    };

    // Database check
    if (db) {
      try {
        const dbStart = Date.now();
        if (db.type === 'postgres') {
          await db.query('SELECT 1');
        } else {
          db.prepare('SELECT 1').get();
        }
        health.checks.database = {
          status: 'ok',
          type: db.type || 'sqlite',
          latency: Date.now() - dbStart,
        };
      } catch (err) {
        health.checks.database = {
          status: 'error',
          type: db.type || 'sqlite',
          error: err.message,
        };
        health.status = 'degraded';
      }
    }

    // Redis check
    if (redis) {
      try {
        const redisStart = Date.now();
        await redis.ping();
        health.checks.redis = {
          status: 'ok',
          latency: Date.now() - redisStart,
        };
      } catch (err) {
        health.checks.redis = {
          status: 'error',
          error: err.message,
        };
        health.status = 'degraded';
      }
    }

    // Memory usage
    const mem = process.memoryUsage();
    health.system.memory = {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      unit: 'MB',
    };

    // CPU usage
    const cpus = os.cpus();
    health.system.cpu = {
      cores: cpus.length,
      model: cpus[0]?.model,
      load: os.loadavg(),
    };

    // System info
    health.system.os = {
      platform: os.platform(),
      release: os.release(),
      uptime: os.uptime(),
      totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
    };

    // Node.js info
    health.system.node = {
      version: process.version,
      pid: process.pid,
    };

    // Response time
    health.responseTime = Date.now() - startTime;

    // Set status code based on health
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  /**
   * Metrics endpoint (Prometheus-compatible format)
   */
  router.get('/metrics', async (req, res) => {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    const metrics = [
      '# HELP process_uptime_seconds Process uptime in seconds',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime}`,
      '',
      '# HELP process_memory_heap_bytes Process heap memory usage',
      '# TYPE process_memory_heap_bytes gauge',
      `process_memory_heap_bytes ${mem.heapUsed}`,
      '',
      '# HELP process_memory_rss_bytes Process RSS memory usage',
      '# TYPE process_memory_rss_bytes gauge',
      `process_memory_rss_bytes ${mem.rss}`,
      '',
      '# HELP nodejs_version_info Node.js version info',
      '# TYPE nodejs_version_info gauge',
      `nodejs_version_info{version="${process.version}"} 1`,
    ];

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  });

  return router;
}

module.exports = { createHealthCheckRouter };
