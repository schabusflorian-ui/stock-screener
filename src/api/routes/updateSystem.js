/**
 * Update System API Routes
 *
 * Centralized update system management endpoints.
 * Handles bundles, jobs, manual triggers, and status monitoring.
 */

const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

// Lazy load dependencies
let db = null;
let orchestrator = null;

/**
 * Initialize the orchestrator with database connection
 */
async function getDb() {
  if (!db) {
    db = await getDatabaseAsync();
  }
  return db;
}

async function getOrchestrator() {
  if (!orchestrator) {
    const { getUpdateOrchestrator } = require('../../services/updates/updateOrchestrator');
    orchestrator = getUpdateOrchestrator();
  }

  return orchestrator;
}

// ============================================
// BUNDLES
// ============================================

/**
 * GET /api/update-system/bundles
 * List all update bundles with their status
 */
router.get('/bundles', async (req, res) => {
  try {
    await getOrchestrator();
    const database = await getDb();

    const bundlesResult = await database.query(`
      SELECT
        b.id,
        b.name,
        b.display_name,
        b.description,
        b.is_enabled,
        b.is_automatic,
        b.priority,
        b.created_at,
        b.updated_at,
        (
          SELECT COUNT(*) FROM update_jobs j
          WHERE j.bundle_id = b.id
        ) as job_count,
        (
          SELECT COUNT(*) FROM update_jobs j
          WHERE j.bundle_id = b.id AND j.status = 'running'
        ) as running_jobs
      FROM update_bundles b
      ORDER BY b.priority ASC, b.name ASC
    `);
    const bundles = bundlesResult.rows;

    res.json({ bundles });
  } catch (error) {
    console.error('Error listing bundles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/update-system/bundles/:name
 * Toggle bundle automatic mode
 */
router.patch('/bundles/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { automatic } = req.body;

    if (typeof automatic !== 'boolean') {
      return res.status(400).json({ error: 'automatic must be a boolean' });
    }

    const database = await getDb();
    const result = await database.query(`
      UPDATE update_bundles
      SET is_automatic = ?, updated_at = datetime('now')
      WHERE name = ?
    `, [automatic ? 1 : 0, name]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Get bundle id for updating jobs
    const bundleResult = await database.query(
      'SELECT id FROM update_bundles WHERE name = ?',
      [name]
    );
    const bundle = bundleResult.rows[0];
    if (bundle) {
      await database.query(`
        UPDATE update_jobs
        SET is_automatic = ?, updated_at = datetime('now')
        WHERE bundle_id = ?
      `, [automatic ? 1 : 0, bundle.id]);
    }

    res.json({
      success: true,
      message: `Bundle ${name} ${automatic ? 'enabled' : 'disabled'}`,
      automatic
    });
  } catch (error) {
    console.error('Error updating bundle:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// JOBS
// ============================================

/**
 * GET /api/update-system/jobs
 * List all update jobs with current status
 */
router.get('/jobs', async (req, res) => {
  try {
    const { bundle, status, automatic } = req.query;
    const database = await getDb();
    const isPostgres = isUsingPostgres();

    // Use dialect-appropriate JSON object function
    const jsonObjFunc = isPostgres ? 'json_build_object' : 'json_object';

    let sql = `
      SELECT
        j.id,
        j.job_key,
        j.name as display_name,
        j.description,
        j.cron_expression,
        j.is_enabled,
        j.is_automatic,
        j.status,
        j.is_running,
        j.current_progress,
        j.current_step,
        j.last_run_at,
        j.last_run_status,
        j.last_error,
        j.total_runs,
        j.successful_runs,
        j.failed_runs,
        j.bundle_id,
        b.name as bundle_name,
        b.display_name as bundle_display_name,
        (
          SELECT ${jsonObjFunc}(
            'id', r.id,
            'status', r.status,
            'started_at', r.started_at,
            'completed_at', r.completed_at,
            'progress', r.progress,
            'current_step', r.current_step
          )
          FROM update_runs r
          WHERE r.job_key = j.job_key
          ORDER BY r.started_at DESC
          LIMIT 1
        ) as last_run
      FROM update_jobs j
      LEFT JOIN update_bundles b ON b.id = j.bundle_id
      WHERE 1=1
    `;

    const params = [];

    if (bundle) {
      sql += ' AND b.name = ?';
      params.push(bundle);
    }

    if (status) {
      sql += ' AND j.status = ?';
      params.push(status);
    }

    if (automatic !== undefined) {
      sql += ' AND j.is_automatic = ?';
      params.push(automatic === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY b.priority ASC, j.job_key ASC';

    const jobsResult = await database.query(sql, params);
    const jobs = jobsResult.rows;

    // Parse JSON fields (PostgreSQL returns object, SQLite returns string)
    const parsedJobs = jobs.map(job => ({
      ...job,
      last_run: job.last_run
        ? (typeof job.last_run === 'string' ? JSON.parse(job.last_run) : job.last_run)
        : null
    }));

    res.json({ jobs: parsedJobs });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/update-system/jobs/:key
 * Get a single job's details
 */
router.get('/jobs/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const database = await getDb();

    const jobResult = await database.query(`
      SELECT j.*, b.name as bundle_name, b.display_name as bundle_display_name
      FROM update_jobs j
      LEFT JOIN update_bundles b ON b.id = j.bundle_id
      WHERE j.job_key = ?
    `, [key]);
    const job = jobResult.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get recent runs
    const runsResult = await database.query(`
      SELECT * FROM update_runs
      WHERE job_key = ?
      ORDER BY started_at DESC
      LIMIT 10
    `, [key]);
    const runs = runsResult.rows;

    res.json({
      job: {
        ...job,
        display_name: job.name
      },
      runs
    });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/update-system/jobs/:key
 * Update job settings (automatic toggle, cron, etc.)
 */
router.patch('/jobs/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { automatic, cron_expression, priority } = req.body;
    const database = await getDb();

    const updates = [];
    const params = [];

    if (typeof automatic === 'boolean') {
      updates.push('is_automatic = ?');
      params.push(automatic ? 1 : 0);
    }

    if (cron_expression !== undefined) {
      updates.push('cron_expression = ?');
      params.push(cron_expression);
    }

    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = datetime(\'now\')');
    params.push(key);

    const result = await database.query(`
      UPDATE update_jobs
      SET ${updates.join(', ')}
      WHERE job_key = ?
    `, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // If changing automatic, might need to reschedule
    const orch = await getOrchestrator();
    if (typeof automatic === 'boolean' && orch.isRunning) {
      // Re-schedule this job
      orch.scheduleJob(key);
    }

    res.json({ success: true, message: 'Job updated' });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/update-system/jobs/:key/run
 * Trigger a manual run of a job
 */
router.post('/jobs/:key/run', async (req, res) => {
  try {
    const { key } = req.params;
    const { force = false, priority = 'normal' } = req.body;

    const database = await getDb();
    const orch = await getOrchestrator();

    // Check if job exists
    const jobResult = await database.query(
      'SELECT * FROM update_jobs WHERE job_key = ?',
      [key]
    );
    const job = jobResult.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check if already running
    if (job.status === 'running' && !force) {
      // Get current run info from database
      const runResult = await database.query(`
        SELECT id, started_at, progress, current_step
        FROM update_runs
        WHERE job_key = $1 AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      `, [key]);
      return res.status(409).json({
        error: 'Job already running',
        currentRun: runResult.rows[0] || null
      });
    }

    // Queue the job
    const queueResult = await database.query(`
      INSERT INTO update_queue (job_key, priority, trigger_type, created_at)
      VALUES (?, ?, 'manual', datetime('now'))
      RETURNING id
    `, [key, priority === 'high' ? 0 : priority === 'low' ? 20 : 10]);
    const queueEntry = queueResult.rows[0];

    // Return immediately, job runs async
    res.json({
      success: true,
      message: `Job ${key} queued for execution`,
      queueId: queueEntry?.id || null
    });

    // Trigger job execution in background
    orch.runJob(key, { manual: true, force }).catch(err => {
      console.error(`Background job ${key} failed:`, err.message);
    });

  } catch (error) {
    console.error('Error triggering job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RUNS (Execution History)
// ============================================

/**
 * GET /api/update-system/runs
 * Get execution history
 */
router.get('/runs', async (req, res) => {
  try {
    const { job_key, status, limit = 50, offset = 0 } = req.query;
    const database = await getDb();

    let sql = `
      SELECT
        r.*,
        j.name as job_display_name,
        b.name as bundle_name
      FROM update_runs r
      LEFT JOIN update_jobs j ON j.job_key = r.job_key
      LEFT JOIN update_bundles b ON b.id = j.bundle_id
      WHERE 1=1
    `;

    const params = [];

    if (job_key) {
      sql += ' AND r.job_key = ?';
      params.push(job_key);
    }

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY r.started_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const runsResult = await database.query(sql, params);
    const runs = runsResult.rows;

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM update_runs WHERE 1=1';
    const countParams = [];

    if (job_key) {
      countSql += ' AND job_key = ?';
      countParams.push(job_key);
    }
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }

    const countResult = await database.query(countSql, countParams);
    const total = countResult.rows[0]?.total || 0;

    res.json({
      runs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error listing runs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/update-system/runs/:id
 * Get a single run's details
 */
router.get('/runs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await getDb();

    const runResult = await database.query(`
      SELECT
        r.*,
        j.name as job_display_name,
        b.name as bundle_name
      FROM update_runs r
      LEFT JOIN update_jobs j ON j.job_key = r.job_key
      LEFT JOIN update_bundles b ON b.id = j.bundle_id
      WHERE r.id = ?
    `, [id]);
    const run = runResult.rows[0];

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ run });
  } catch (error) {
    console.error('Error getting run:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// QUEUE
// ============================================

/**
 * GET /api/update-system/queue
 * Get current queue status
 */
router.get('/queue', async (req, res) => {
  try {
    const database = await getDb();
    const queueResult = await database.query(`
      SELECT
        q.*,
        j.name as job_display_name,
        b.name as bundle_name
      FROM update_queue q
      LEFT JOIN update_jobs j ON j.job_key = q.job_key
      LEFT JOIN update_bundles b ON b.id = j.bundle_id
      WHERE q.status IN ('pending', 'running')
      ORDER BY q.priority ASC, q.created_at ASC
    `);
    const queue = queueResult.rows;

    res.json({ queue });
  } catch (error) {
    console.error('Error getting queue:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/update-system/queue/:id
 * Cancel a queued job
 */
router.delete('/queue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await getDb();

    const result = await database.query(`
      UPDATE update_queue
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Queue entry not found or not pending' });
    }

    res.json({ success: true, message: 'Queue entry cancelled' });
  } catch (error) {
    console.error('Error cancelling queue entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATUS & CONTROL
// ============================================

/**
 * GET /api/update-system/status
 * Get overall system status
 */
router.get('/status', async (req, res) => {
  try {
    const orch = await getOrchestrator();
    const database = await getDb();

    // Get running jobs count
    const runningResult = await database.query(`
      SELECT COUNT(*) as running_count FROM update_jobs WHERE status = 'running'
    `);
    const running_count = runningResult.rows[0]?.running_count || 0;

    // Get pending queue count
    const pendingResult = await database.query(`
      SELECT COUNT(*) as pending_count FROM update_queue WHERE status = 'pending'
    `);
    const pending_count = pendingResult.rows[0]?.pending_count || 0;

    // Get recent failures
    const recentFailuresResult = await database.query(`
      SELECT job_key, started_at, error_message
      FROM update_runs
      WHERE status = 'failed'
      AND started_at > datetime('now', '-24 hours')
      ORDER BY started_at DESC
      LIMIT 5
    `);
    const recent_failures = recentFailuresResult.rows;

    // Get last successful runs per bundle
    const bundleStatusResult = await database.query(`
      SELECT
        b.name,
        b.display_name,
        b.is_automatic,
        (
          SELECT MAX(r.completed_at)
          FROM update_runs r
          JOIN update_jobs j ON j.job_key = r.job_key
          WHERE j.bundle_id = b.id AND r.status = 'completed'
        ) as last_success,
        (
          SELECT COUNT(*)
          FROM update_jobs j
          WHERE j.bundle_id = b.id AND j.status = 'running'
        ) as running_jobs
      FROM update_bundles b
      ORDER BY b.priority ASC
    `);
    const bundle_status = bundleStatusResult.rows;

    res.json({
      scheduler_running: orch.isRunning,
      running_jobs: running_count,
      pending_queue: pending_count,
      recent_failures,
      bundle_status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/update-system/start
 * Start the scheduler
 */
router.post('/start', async (req, res) => {
  try {
    const orch = await getOrchestrator();

    if (orch.isRunning) {
      return res.json({ message: 'Scheduler already running' });
    }

    await orch.start();

    res.json({
      success: true,
      message: 'Scheduler started'
    });
  } catch (error) {
    console.error('Error starting scheduler:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/update-system/stop
 * Stop the scheduler
 */
router.post('/stop', async (req, res) => {
  try {
    const orch = await getOrchestrator();

    if (!orch.isRunning) {
      return res.json({ message: 'Scheduler already stopped' });
    }

    await orch.stop();

    res.json({
      success: true,
      message: 'Scheduler stopped'
    });
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SETTINGS
// ============================================

/**
 * GET /api/update-system/settings
 * Get update system settings
 */
router.get('/settings', async (req, res) => {
  try {
    const database = await getDb();
    const settingsResult = await database.query(`
      SELECT key, value, description FROM update_settings
    `);
    const settings = settingsResult.rows;

    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = {
        value: s.value,
        description: s.description
      };
    }

    res.json({ settings: settingsObj });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/update-system/settings/:key
 * Update a setting
 */
router.patch('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    const database = await getDb();
    const result = await database.query(`
      UPDATE update_settings
      SET value = ?, updated_at = datetime('now')
      WHERE key = ?
    `, [String(value), key]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RUN ALL / BUNDLE TRIGGERS
// ============================================

/**
 * POST /api/update-system/bundles/:name/run
 * Run all jobs in a bundle
 */
router.post('/bundles/:name/run', async (req, res) => {
  try {
    const { name } = req.params;
    const { sequential = true } = req.body;
    const database = await getDb();

    // Get bundle
    const bundleResult = await database.query(
      'SELECT * FROM update_bundles WHERE name = ?',
      [name]
    );
    const bundle = bundleResult.rows[0];
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Get all jobs in bundle
    const jobsResult = await database.query(`
      SELECT job_key FROM update_jobs
      WHERE bundle_id = ?
      ORDER BY id ASC
    `, [bundle.id]);
    const jobs = jobsResult.rows;

    if (jobs.length === 0) {
      return res.status(400).json({ error: 'Bundle has no jobs' });
    }

    const orch = await getOrchestrator();

    // Queue all jobs
    for (const job of jobs) {
      await database.query(`
        INSERT INTO update_queue (job_key, priority, trigger_type, created_at)
        VALUES (?, 10, 'bundle', datetime('now'))
      `, [job.job_key]);
    }

    res.json({
      success: true,
      message: `Queued ${jobs.length} jobs from bundle ${name}`,
      jobs: jobs.map(j => j.job_key)
    });

    // Run jobs in background
    if (sequential) {
      // Run sequentially
      for (const job of jobs) {
        try {
          await orch.runJob(job.job_key, { manual: true });
        } catch (err) {
          console.error(`Job ${job.job_key} failed:`, err.message);
        }
      }
    } else {
      // Run in parallel
      Promise.all(
        jobs.map(job =>
          orch.runJob(job.job_key, { manual: true }).catch(err => {
            console.error(`Job ${job.job_key} failed:`, err.message);
          })
        )
      );
    }

  } catch (error) {
    console.error('Error running bundle:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN: ENSURE PRICES.ALPHA JOB EXISTS
// ============================================

/**
 * POST /api/update-system/admin/ensure-alpha-job
 * Creates the prices.alpha job if it doesn't exist
 * Temporary endpoint for migration repair
 */
router.post('/admin/ensure-alpha-job', async (req, res) => {
  try {
    const database = await getDb();
    const isPostgres = database.constructor.name === 'PgDatabase' ||
                       (database.query && database.query.toString().includes('$'));

    // Get prices bundle ID
    const bundleQuery = isPostgres
      ? "SELECT id FROM update_bundles WHERE name = $1"
      : "SELECT id FROM update_bundles WHERE name = ?";
    const bundleResult = await database.query(bundleQuery, ['prices']);
    const bundleId = bundleResult.rows?.[0]?.id || bundleResult[0]?.id;

    if (!bundleId) {
      return res.status(404).json({ error: 'prices bundle not found' });
    }

    // Check if job already exists
    const checkQuery = isPostgres
      ? "SELECT id FROM update_jobs WHERE job_key = $1"
      : "SELECT id FROM update_jobs WHERE job_key = ?";
    const existingJob = await database.query(checkQuery, ['prices.alpha']);
    const existing = existingJob.rows?.[0] || existingJob[0];

    if (existing) {
      return res.json({ success: true, message: 'Job already exists', jobId: existing.id });
    }

    // Insert the job
    const insertQuery = isPostgres ? `
      INSERT INTO update_jobs (
        bundle_id, job_key, name, description, cron_expression,
        is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
      ) VALUES (
        $1, 'prices.alpha', 'Alpha Vantage Critical Update',
        'Update critical stocks (indices + top 12) via Alpha Vantage API',
        '0 18 * * 1-5',
        1, 1, 20, 2000, 600
      )
      RETURNING id
    ` : `
      INSERT INTO update_jobs (
        bundle_id, job_key, name, description, cron_expression,
        is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
      ) VALUES (
        ?, 'prices.alpha', 'Alpha Vantage Critical Update',
        'Update critical stocks (indices + top 12) via Alpha Vantage API',
        '0 18 * * 1-5',
        1, 1, 20, 2000, 600
      )
    `;

    const insertResult = await database.query(insertQuery, [bundleId]);
    const newId = insertResult.rows?.[0]?.id || insertResult.lastInsertRowid;

    res.json({
      success: true,
      message: 'Job created successfully',
      jobId: newId,
      bundleId: bundleId
    });

  } catch (error) {
    console.error('Error creating alpha job:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
