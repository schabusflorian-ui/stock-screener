// src/api/routes/system.js
/**
 * System Health and Monitoring Endpoints
 *
 * Provides comprehensive health checks for production monitoring including:
 * - Database connectivity
 * - Redis connectivity
 * - Update job status and health
 * - Queue health
 * - Lock health
 * - API quota usage
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { getDatabaseAsync, dialect, isUsingPostgres } = require('../../lib/db');

/**
 * GET /api/system/health
 * Comprehensive system health check for production monitoring
 */
router.get('/health', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const config = require('../../config');

    // Overall status (will be downgraded if any check fails)
    let overallStatus = 'healthy';

    // =============================================
    // 1. Database Health Check
    // =============================================
    let databaseHealth = {
      status: 'unknown',
      latency_ms: 0
    };

    try {
      const start = Date.now();
      await database.query('SELECT 1');
      databaseHealth = {
        status: 'healthy',
        latency_ms: Date.now() - start
      };
    } catch (error) {
      databaseHealth = {
        status: 'unhealthy',
        error: error.message
      };
      overallStatus = 'unhealthy';
    }

    // =============================================
    // 2. Redis Health Check
    // =============================================
    let redisHealth = {
      status: 'not_configured'
    };

    if (process.env.REDIS_URL) {
      try {
        const { unifiedCache } = require('../../lib/redisCache');
        const start = Date.now();
        const backend = unifiedCache.getBackend();
        redisHealth = {
          status: backend === 'redis' ? 'healthy' : 'degraded',
          backend,
          latency_ms: Date.now() - start
        };
        if (backend !== 'redis') {
          overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
        }
      } catch (error) {
        redisHealth = {
          status: 'unhealthy',
          error: error.message
        };
        overallStatus = 'degraded'; // Redis failure is degraded, not unhealthy
      }
    }

    // =============================================
    // 3. Update Jobs Health Check
    // =============================================
    let jobsHealth = {
      status: 'unknown',
      details: {}
    };

    try {
      // Get all jobs with their status
      const jobsResult = await database.query(`
        SELECT
          job_key,
          status,
          last_run_at,
          last_run_status,
          is_running,
          total_runs,
          successful_runs,
          failed_runs
        FROM update_jobs
        WHERE is_enabled = 1
      `);
      const jobs = jobsResult.rows;

      const now = new Date();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

      let healthyCount = 0;
      let failingCount = 0;
      let staleCount = 0;
      const failingJobs = [];

      for (const job of jobs) {
        const lastRun = job.last_run_at ? new Date(job.last_run_at) : null;

        // Check if job is failing (last run failed or multiple recent failures)
        const failureRate = job.total_runs > 0
          ? (job.failed_runs / job.total_runs)
          : 0;

        if (job.last_run_status === 'failed' || failureRate > 0.5) {
          failingCount++;
          failingJobs.push(job.job_key);
        } else if (!lastRun || lastRun < oneDayAgo) {
          // Job hasn't run in 24 hours (might be stale)
          staleCount++;
        } else {
          healthyCount++;
        }
      }

      // Determine overall job health status
      let jobStatus = 'healthy';
      if (failingCount > 5 || failingCount / jobs.length > 0.2) {
        jobStatus = 'unhealthy';
        overallStatus = 'unhealthy';
      } else if (failingCount > 0 || staleCount > 3) {
        jobStatus = 'degraded';
        if (overallStatus === 'healthy') overallStatus = 'degraded';
      }

      jobsHealth = {
        status: jobStatus,
        details: {
          total: jobs.length,
          healthy: healthyCount,
          failing: failingCount,
          stale: staleCount,
          failing_jobs: failingJobs
        }
      };
    } catch (error) {
      jobsHealth = {
        status: 'unknown',
        error: error.message
      };
    }

    // =============================================
    // 4. Queue Health Check
    // =============================================
    let queueHealth = {
      status: 'unknown'
    };

    try {
      const queueStatsResult = await database.query(`
        SELECT
          status,
          COUNT(*) as count,
          AVG(${isUsingPostgres ? "EXTRACT(EPOCH FROM (NOW() - scheduled_for))" : "julianday('now') - julianday(scheduled_for)) * 86400"}) as avg_latency_sec
        FROM update_queue
        WHERE status IN ('pending', 'processing')
        GROUP BY status
      `);
      const queueStats = queueStatsResult.rows;

      const pending = queueStats.find(s => s.status === 'pending')?.count || 0;
      const processing = queueStats.find(s => s.status === 'processing')?.count || 0;
      const avgLatency = queueStats.find(s => s.status === 'pending')?.avg_latency_sec || 0;

      // Check for stalled items (processing without recent heartbeat)
      const stalledResult = await database.query(`
        SELECT COUNT(*) as count
        FROM update_queue
        WHERE status = 'processing'
          AND (last_heartbeat IS NULL OR last_heartbeat < ${dialect.intervalAgo(10, 'minutes')})
      `);
      const stalled = stalledResult.rows[0].count;

      let queueStatus = 'healthy';
      if (stalled > 0) {
        queueStatus = 'degraded';
        if (overallStatus === 'healthy') overallStatus = 'degraded';
      }
      if (pending > 50 || avgLatency > 300) { // More than 50 pending or 5 min latency
        queueStatus = 'degraded';
        if (overallStatus === 'healthy') overallStatus = 'degraded';
      }

      queueHealth = {
        status: queueStatus,
        pending,
        processing,
        stalled,
        avg_latency_sec: Math.round(avgLatency)
      };
    } catch (error) {
      queueHealth = {
        status: 'unknown',
        error: error.message
      };
    }

    // =============================================
    // 5. Lock Health Check
    // =============================================
    let locksHealth = {
      status: 'unknown'
    };

    try {
      const lockStatsResult = await database.query(`
        SELECT
          COUNT(*) as active_locks,
          SUM(CASE WHEN expires_at < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) as expired_locks
        FROM update_locks
      `);
      const lockStats = lockStatsResult.rows[0];

      const lockStatus = lockStats.expired_locks > 0 ? 'degraded' : 'healthy';
      if (lockStatus === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }

      locksHealth = {
        status: lockStatus,
        active: lockStats.active_locks,
        expired: lockStats.expired_locks
      };
    } catch (error) {
      locksHealth = {
        status: 'unknown',
        error: error.message
      };
    }

    // =============================================
    // 6. API Quota Health (Phase 3.1: Cost Tracking)
    // =============================================
    let apiQuotasHealth = {};

    try {
      // Check if api_usage_daily table exists
      const tableExistsResult = await database.query(
        isUsingPostgres()
          ? `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) as exists`
          : `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        ['api_usage_daily']
      );
      const tableExists = isUsingPostgres() ? tableExistsResult.rows[0]?.exists : tableExistsResult.rows[0];

      if (tableExists) {
        const { getCostTracker } = require('../../services/costs');
        const tracker = getCostTracker();

        // Get budget status for Claude (primary cost concern)
        const claudeBudget = await tracker.checkBudget('claude');

        apiQuotasHealth = {
          claude: {
            status: claudeBudget.withinBudget ? 'healthy' : 'exceeded',
            daily: {
              used: claudeBudget.daily.used,
              limit: claudeBudget.daily.limit,
              percent: claudeBudget.daily.percent,
              exceeded: claudeBudget.daily.exceeded
            },
            monthly: {
              used: claudeBudget.monthly.used,
              limit: claudeBudget.monthly.limit,
              percent: claudeBudget.monthly.percent,
              exceeded: claudeBudget.monthly.exceeded
            }
          },
          alpha_vantage: {
            status: 'free_tier',
            message: 'Free tier - rate limited at 5 calls/min'
          }
        };

        // Degrade overall status if budget exceeded
        if (!claudeBudget.withinBudget) {
          overallStatus = 'degraded';
        }
      }
    } catch (error) {
      // API quota tracking tables not created yet
      apiQuotasHealth = {
        status: 'not_configured',
        message: 'Cost tracking not initialized. Run migration: add-cost-tracking.js'
      };
    }

    // =============================================
    // Response
    // =============================================
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseHealth,
        redis: redisHealth,
        jobs: jobsHealth,
        queue: queueHealth,
        locks: locksHealth,
        api_quotas: apiQuotasHealth
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /api/system/jobs
 * Get detailed job status for monitoring dashboard
 * Requires authentication
 */
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const jobsResult = await database.query(`
      SELECT
        j.job_key,
        j.name,
        j.status,
        j.is_running,
        j.last_run_at,
        j.last_run_status,
        j.last_run_duration_ms,
        j.last_run_items_processed,
        j.last_run_items_failed,
        j.last_error,
        j.next_run_at,
        j.total_runs,
        j.successful_runs,
        j.failed_runs,
        j.avg_duration_ms,
        b.name as bundle_name,
        b.display_name as bundle_display_name
      FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      ORDER BY b.priority, j.id
    `);
    const jobs = jobsResult.rows;

    res.json({
      jobs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Jobs status error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/system/costs
 * Get API cost tracking and budget status
 * Requires authentication
 */
router.get('/costs', requireAuth, async (req, res) => {
  try {
    const { getCostTracker } = require('../../services/costs');
    const tracker = getCostTracker();

    // Get all provider status
    const providerStatus = await tracker.getAllProviderStatus();

    res.json({
      providers: providerStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cost tracking error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/system/costs/:provider
 * Get detailed cost breakdown for a specific provider
 * Requires authentication
 */
router.get('/costs/:provider', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { period = 'month' } = req.query;
    const { getCostTracker } = require('../../services/costs');
    const tracker = getCostTracker();

    // Get provider stats
    const stats = tracker.getUsageStats(provider, period);

    // Get usage by job
    const usageByJob = tracker.getUsageByJob(provider, period);

    // Get budget status
    const budgetStatus = await tracker.checkBudget(provider);

    res.json({
      provider,
      period,
      stats,
      usage_by_job: usageByJob,
      budget: budgetStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Provider cost details error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * PUT /api/system/costs/:provider/budget
 * Update budget limits for a provider
 * Requires authentication and admin role
 */
router.put('/costs/:provider/budget', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.is_admin) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    const { provider } = req.params;
    const { daily_budget, monthly_budget } = req.body;

    const { getCostTracker } = require('../../services/costs');
    const tracker = getCostTracker();

    // Update budget
    const success = tracker.updateBudget(
      provider,
      daily_budget !== undefined ? parseFloat(daily_budget) : null,
      monthly_budget !== undefined ? parseFloat(monthly_budget) : null
    );

    if (success) {
      res.json({
        success: true,
        provider,
        daily_budget,
        monthly_budget,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Failed to update budget'
      });
    }

  } catch (error) {
    console.error('Budget update error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
