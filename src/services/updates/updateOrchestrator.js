// src/services/updates/updateOrchestrator.js
/**
 * Update Orchestrator
 *
 * Central coordinator for all data update jobs.
 * Manages job scheduling, execution, dependencies, and status tracking.
 */

const cron = require('node-cron');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const sentry = require('../../lib/sentry'); // PHASE 2.4: Sentry integration for job failures
const { getDatabaseAsync, dialect } = require('../../lib/db');

class UpdateOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.cronJobs = new Map();
    this.bundles = new Map();
    this.isRunning = false;
    this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.queueInterval = null;
    this.logDir = path.join(__dirname, '../../..', 'logs');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }


  // =========================================================================
  // LOGGING
  // =========================================================================

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [UpdateOrchestrator] [${level}] ${message}`;
    console.log(logLine);

    const logFile = path.join(this.logDir, `orchestrator-${new Date().toISOString().split('T')[0]}.log`);
    try {
      fs.appendFileSync(logFile, logLine + '\n');
    } catch (e) {
      // Ignore log write errors
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  async start() {
    if (this.isRunning) return;

    this.log('Starting Update Orchestrator...');
    this.isRunning = true;
    const database = await getDatabaseAsync();

    // Clean expired locks
    await database.query('DELETE FROM update_locks WHERE expires_at < CURRENT_TIMESTAMP');

    // RESILIENCE: Recover stalled queue items from previous crashes
    await this.recoverStalledQueueItems();

    // Schedule all automatic jobs
    await this.scheduleAllJobs();

    // Start queue processor
    this.startQueueProcessor();

    this.log(`Started successfully - ${this.cronJobs.size} jobs scheduled`);
    this.emit('started');
  }

  async stop() {
    if (!this.isRunning) return;

    this.log('Stopping Update Orchestrator...');
    this.isRunning = false;

    // Stop all cron jobs
    for (const [key, job] of this.cronJobs) {
      job.stop();
      this.log(`Stopped cron job: ${key}`);
    }
    this.cronJobs.clear();

    // Stop queue processor
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }

    this.log('Stopped');
    this.emit('stopped');
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  // =========================================================================
  // JOB SCHEDULING
  // =========================================================================

  async scheduleAllJobs() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT j.*, b.name as bundle_name, b.is_automatic as bundle_automatic
      FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      WHERE j.is_enabled = true
        AND b.is_enabled = true
        AND COALESCE(j.is_automatic, b.is_automatic) = true
        AND j.cron_expression IS NOT NULL
    `);
    const jobs = result.rows;

    for (const job of jobs) {
      if (job.cron_expression) {
        this.scheduleJob(job);
      }
    }

    this.log(`Scheduled ${this.cronJobs.size} automatic jobs`);
  }

  async scheduleJob(job) {
    if (this.cronJobs.has(job.job_key)) {
      this.cronJobs.get(job.job_key).stop();
    }

    try {
      // Validate cron expression
      if (!cron.validate(job.cron_expression)) {
        this.log(`Invalid cron expression for ${job.job_key}: ${job.cron_expression}`, 'ERROR');
        return;
      }

      const cronJob = cron.schedule(
        job.cron_expression,
        async () => {
          await this.runJob(job.job_key, { triggerType: 'scheduled' });
        },
        {
          timezone: job.timezone || 'America/New_York',
          scheduled: true
        }
      );

      this.cronJobs.set(job.job_key, cronJob);

      // Calculate next run time (approximate)
      const nextRun = this.getNextRunTime(job.cron_expression, job.timezone);
      if (nextRun) {
        const database = await getDatabaseAsync();
        await database.query('UPDATE update_jobs SET next_run_at = $1, updated_at = CURRENT_TIMESTAMP WHERE job_key = $2',
          [nextRun.toISOString(), job.job_key]);
      }

      this.log(`Scheduled ${job.job_key} - cron: ${job.cron_expression}`);
    } catch (error) {
      this.log(`Failed to schedule ${job.job_key}: ${error.message}`, 'ERROR');
    }
  }

  getNextRunTime(cronExpression, timezone) {
    // Simple approximation - returns null if can't determine
    // In production, use a library like cron-parser
    try {
      const now = new Date();
      // Return approximate next occurrence (this is simplified)
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } catch {
      return null;
    }
  }

  // =========================================================================
  // JOB EXECUTION
  // =========================================================================

  async runJob(jobKey, options = {}) {
    const { triggerType = 'manual', triggeredBy = 'system', jobOptions = {} } = options;
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT j.*, b.name as bundle_name FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      WHERE j.job_key = $1
    `, [jobKey]);
    const job = result.rows[0];

    if (!job) {
      throw new Error(`Job not found: ${jobKey}`);
    }

    // Check dependencies for scheduled runs
    if (triggerType === 'scheduled') {
      const depsOk = await this.checkDependencies(jobKey);
      if (!depsOk) {
        this.log(`Skipping ${jobKey} - dependencies not met`);
        return { success: false, reason: 'dependencies_not_met' };
      }
    }

    // Acquire lock
    const lockAcquired = await this.acquireLock(jobKey);
    if (!lockAcquired) {
      this.log(`Skipping ${jobKey} - already running`);
      return { success: false, reason: 'already_running' };
    }

    // Create run record
    const runResult = await database.query(`
      INSERT INTO update_runs (job_id, job_key, bundle_name, started_at, trigger_type, triggered_by, status)
      VALUES (
        (SELECT id FROM update_jobs WHERE job_key = $1),
        $2, $3, CURRENT_TIMESTAMP, $4, $5, 'running'
      )
      RETURNING id
    `, [jobKey, jobKey, job.bundle_name, triggerType, triggeredBy]);
    const runId = runResult.rows[0].id;

    const startTime = Date.now();

    try {
      // Update job status
      await database.query(`
        UPDATE update_jobs SET
          status = $1,
          is_running = $2,
          current_progress = $3,
          current_step = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE job_key = $5
      `, ['running', 1, 0, 'Starting...', jobKey]);

      this.emit('jobStarted', { jobKey, runId });
      this.log(`Starting job: ${jobKey} (${triggerType})`);

      // Execute the job
      const result = await this.executeJobHandler(jobKey, job, {
        runId,
        options: jobOptions,
        onProgress: (progress, step) => this.updateProgress(runId, jobKey, progress, step)
      });

      const durationMs = Date.now() - startTime;

      // Complete the run
      await database.query(`
        UPDATE update_runs SET
          completed_at = CURRENT_TIMESTAMP,
          duration_ms = $1,
          status = $2,
          items_total = $3,
          items_processed = $4,
          items_updated = $5,
          items_failed = $6,
          progress = 100
        WHERE id = $7
      `, [durationMs, 'completed', result.itemsTotal || 0, result.itemsProcessed || 0, result.itemsUpdated || 0, result.itemsFailed || 0, runId]);

      await database.query(`
        UPDATE update_jobs SET
          last_run_at = CURRENT_TIMESTAMP,
          last_run_status = $1,
          last_run_duration_ms = $2,
          last_run_items_processed = $3,
          last_run_items_updated = $4,
          last_run_items_failed = $5,
          total_runs = total_runs + 1,
          successful_runs = successful_runs + CASE WHEN $6 = 'completed' THEN 1 ELSE 0 END,
          failed_runs = failed_runs + CASE WHEN $7 = 'failed' THEN 1 ELSE 0 END,
          status = 'idle',
          is_running = 0,
          current_progress = 0,
          current_step = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE job_key = $8
      `, ['completed', durationMs, result.itemsProcessed || 0, result.itemsUpdated || 0, result.itemsFailed || 0, 'completed', 'completed', jobKey]);

      this.emit('jobCompleted', { jobKey, runId, result });
      this.log(`Completed job: ${jobKey} (${(durationMs / 1000).toFixed(1)}s)`);

      // Trigger dependent jobs
      if (triggerType === 'scheduled') {
        await this.triggerDependentJobs(jobKey);
      }

      return { success: true, result };

    } catch (error) {
      const durationMs = Date.now() - startTime;

      await database.query(`
        UPDATE update_runs SET
          completed_at = CURRENT_TIMESTAMP,
          status = 'failed',
          error_message = $1,
          error_stack = $2
        WHERE id = $3
      `, [error.message, error.stack, runId]);

      await database.query('UPDATE update_jobs SET last_error = $1, updated_at = CURRENT_TIMESTAMP WHERE job_key = $2',
        [error.message, jobKey]);

      await database.query(`
        UPDATE update_jobs SET
          last_run_at = CURRENT_TIMESTAMP,
          last_run_status = $1,
          last_run_duration_ms = $2,
          last_run_items_processed = $3,
          last_run_items_updated = $4,
          last_run_items_failed = $5,
          total_runs = total_runs + 1,
          successful_runs = successful_runs + CASE WHEN $6 = 'completed' THEN 1 ELSE 0 END,
          failed_runs = failed_runs + CASE WHEN $7 = 'failed' THEN 1 ELSE 0 END,
          status = 'idle',
          is_running = 0,
          current_progress = 0,
          current_step = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE job_key = $8
      `, ['failed', durationMs, 0, 0, 0, 'failed', 'failed', jobKey]);

      this.emit('jobFailed', { jobKey, runId, error: error.message });
      this.log(`Failed job: ${jobKey} - ${error.message}`, 'ERROR');

      // Queue retry if applicable
      if (triggerType !== 'retry') {
        await this.queueRetry(jobKey, job, options);
      }

      return { success: false, error: error.message };

    } finally {
      await this.releaseLock(jobKey);
    }
  }

  async executeJobHandler(jobKey, job, context) {
    // Import and execute the appropriate job handler
    const [bundleName, action] = jobKey.split('.');

    // Dynamic import of job handlers based on bundle
    let handler;

    try {
      switch (bundleName) {
        case 'prices':
          handler = require('./bundles/priceBundle');
          break;
        case 'fundamentals':
          handler = require('./bundles/fundamentalsBundle');
          break;
        case 'etf':
          handler = require('./bundles/etfBundle');
          break;
        case 'market':
          handler = require('./bundles/marketBundle');
          break;
        case 'sentiment':
          handler = require('./bundles/sentimentBundle');
          break;
        case 'knowledge':
          handler = require('./bundles/knowledgeBundle');
          break;
        case 'sec':
          handler = require('./bundles/secBundle');
          break;
        case 'ipo':
          handler = require('./bundles/ipoBundle');
          break;
        case 'maintenance':
          handler = require('./bundles/maintenanceBundle');
          break;
        case 'analytics':
          handler = require('./bundles/analyticsBundle');
          break;
        default:
          throw new Error(`Unknown bundle: ${bundleName}`);
      }

      const database = await getDatabaseAsync();
      return await handler.execute(jobKey, database, context);

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        this.log(`Handler not implemented for ${jobKey}, using stub`, 'WARN');
        // Return stub result for unimplemented handlers
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0
        };
      }
      throw error;
    }
  }

  async updateProgress(runId, jobKey, progress, step) {
    const database = await getDatabaseAsync();
    await database.query('UPDATE update_runs SET progress = $1, current_step = $2 WHERE id = $3',
      [progress, step, runId]);
    await database.query(`
      UPDATE update_jobs SET
        status = $1,
        is_running = $2,
        current_progress = $3,
        current_step = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE job_key = $5
    `, ['running', 1, progress, step, jobKey]);
    this.emit('progress', { jobKey, runId, progress, step });
  }

  // =========================================================================
  // DEPENDENCIES
  // =========================================================================

  async checkDependencies(jobKey) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT depends_on FROM update_jobs WHERE job_key = $1', [jobKey]);
    const row = result.rows[0];

    if (!row?.depends_on) return true;

    let dependsOn;
    try {
      dependsOn = JSON.parse(row.depends_on);
    } catch {
      return true;
    }

    if (!Array.isArray(dependsOn) || dependsOn.length === 0) return true;

    const today = new Date().toISOString().split('T')[0];

    for (const depKey of dependsOn) {
      const depResult = await database.query(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.job_key = $1
      `, [depKey]);
      const depJob = depResult.rows[0];
      if (!depJob) continue;

      const lastRunDate = depJob.last_run_at?.split('T')[0];

      if (lastRunDate !== today || depJob.last_run_status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  async triggerDependentJobs(jobKey) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT job_key FROM update_jobs
      WHERE depends_on LIKE $1 AND is_enabled = true AND COALESCE(is_automatic, true) = true
    `, [`%"${jobKey}"%`]);
    const dependents = result.rows;

    for (const dep of dependents) {
      await this.queueJobInternal(dep.job_key, {
        triggerType: 'dependency',
        triggeredBy: 'system',
        priority: 20
      });
    }
  }

  // =========================================================================
  // LOCKING
  // =========================================================================

  async acquireLock(jobKey) {
    try {
      const database = await getDatabaseAsync();
      const expiresAt = dialect.intervalFromNow(2, 'hours');
      // FIXED: Use atomic INSERT...ON CONFLICT for atomic lock acquisition
      // If we successfully insert, we acquired the lock
      // This prevents race condition where two instances could both think they acquired the lock
      const result = await database.query(`
        INSERT INTO update_locks (job_key, locked_at, locked_by, expires_at)
        SELECT $1, CURRENT_TIMESTAMP, $2, ${expiresAt}
        WHERE NOT EXISTS (
          SELECT 1 FROM update_locks
          WHERE job_key = $3 AND expires_at > CURRENT_TIMESTAMP
        )
        ON CONFLICT (job_key) DO NOTHING
        RETURNING id
      `, [jobKey, this.instanceId, jobKey]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Lock acquisition failed:', { jobKey, instanceId: this.instanceId, error: error.message });
      return false;
    }
  }

  async releaseLock(jobKey) {
    try {
      const database = await getDatabaseAsync();
      await database.query('DELETE FROM update_locks WHERE job_key = $1 AND locked_by = $2',
        [jobKey, this.instanceId]);
    } catch (error) {
      // FIXED: Handle potential database errors when releasing locks
      this.log(`Failed to release lock for ${jobKey}: ${error.message}`, 'ERROR');
    }
  }

  // =========================================================================
  // QUEUE RESILIENCE
  // =========================================================================

  /**
   * Recover stalled queue items from crashed processes
   * Called on startup to resume any items that were being processed when the system crashed
   */
  async recoverStalledQueueItems() {
    try {
      const database = await getDatabaseAsync();
      const staleCutoff = dialect.intervalAgo(10, 'minutes');
      // Find items stuck in 'processing' state for >10 minutes without heartbeat
      const result = await database.query(`
        UPDATE update_queue
        SET status = 'pending',
            attempt = attempt + 1
        WHERE status = 'processing'
          AND (last_heartbeat IS NULL OR last_heartbeat < ${staleCutoff})
          AND attempt < max_attempts
        RETURNING id, job_key, attempt
      `);
      const stalled = result.rows;

      if (stalled.length > 0) {
        this.log(`RECOVERY: Found ${stalled.length} stalled queue items, resetting to pending`, 'WARN');
        for (const item of stalled) {
          this.log(`  - ${item.job_key} (attempt ${item.attempt})`, 'WARN');
        }
      } else {
        this.log('No stalled queue items found');
      }

      // FIXED: Clean up old completed/failed entries to prevent queue table bloat
      const completedCutoff = dialect.intervalAgo(1, 'days');
      const failedCutoff = dialect.intervalAgo(7, 'days');

      const cleanupResult = await database.query(`
        DELETE FROM update_queue
        WHERE (status = 'completed' AND processed_at < ${completedCutoff})
           OR (status = 'failed' AND processed_at < ${failedCutoff})
      `);

      if (cleanupResult.rowCount > 0) {
        this.log(`CLEANUP: Removed ${cleanupResult.rowCount} old queue entries`);
      }

      // FIXED: Remove duplicate pending entries (keep only oldest per job_key)
      const dedupResult = await database.query(`
        DELETE FROM update_queue
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY job_key ORDER BY scheduled_for ASC) as rn
            FROM update_queue
            WHERE status = 'pending'
          ) ranked
          WHERE rn > 1
        )
      `);

      if (dedupResult.rowCount > 0) {
        this.log(`DEDUP: Removed ${dedupResult.rowCount} duplicate pending queue entries`, 'WARN');
      }

      return stalled;
    } catch (error) {
      this.log(`Failed to recover stalled queue items: ${error.message}`, 'ERROR');
      return [];
    }
  }

  // =========================================================================
  // QUEUE
  // =========================================================================

  async queueJobInternal(jobKey, options = {}) {
    const { triggerType = 'manual', triggeredBy = 'system', priority = 50, scheduledFor = null, jobOptions = null } = options;
    const database = await getDatabaseAsync();

    // FIXED: Check for existing pending entry to prevent duplicate queue items
    // This prevents the queue from filling up with duplicate entries for the same job
    const existingResult = await database.query(`
      SELECT id FROM update_queue
      WHERE job_key = $1 AND status = 'pending'
      LIMIT 1
    `, [jobKey]);

    if (existingResult.rows.length > 0) {
      this.log(`Job ${jobKey} already queued (pending), skipping duplicate`, 'DEBUG');
      return;
    }

    await database.query(`
      INSERT INTO update_queue (job_key, priority, scheduled_for, trigger_type, triggered_by, options)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [jobKey, priority, scheduledFor || new Date().toISOString(), triggerType, triggeredBy, jobOptions ? JSON.stringify(jobOptions) : null]);
  }

  async queueRetry(jobKey, job, originalOptions, attempt = 0) {
    const maxRetries = job.max_retries || 3;

    // FIXED: Check max retries and log if exceeded
    if (attempt >= maxRetries) {
      this.log(`Job ${jobKey} exceeded max retries (${maxRetries}). Not queuing retry.`, 'ERROR');

      // PHASE 2.4: Report to Sentry for monitoring
      if (sentry.isEnabled()) {
        sentry.captureMessage(`Update job exceeded max retries: ${jobKey}`, {
          level: 'error',
          tags: {
            job_key: jobKey,
            job_type: 'update',
            failure_type: 'max_retries_exceeded'
          },
          extra: {
            maxRetries,
            lastError: originalOptions?.lastError || 'Unknown'
          }
        });
      }

      return;
    }

    // FIXED: Implement exponential backoff with jitter
    // Formula: delay = baseDelay × 3^(attempt) + random jitter
    // Results: ~5min, ~15min, ~45min, ~135min
    const baseDelaySeconds = 300; // 5 minutes
    const exponentialDelay = baseDelaySeconds * Math.pow(3, attempt);
    const jitter = Math.random() * baseDelaySeconds; // Add randomness to prevent thundering herd
    const totalDelaySeconds = exponentialDelay + jitter;

    const scheduledFor = new Date(Date.now() + totalDelaySeconds * 1000);

    await this.queueJobInternal(jobKey, {
      triggerType: 'retry',
      triggeredBy: 'system',
      priority: 20,
      scheduledFor: scheduledFor.toISOString(),
      jobOptions: originalOptions
    });

    this.log(`Queued retry ${attempt + 1}/${maxRetries} for ${jobKey} (delay: ${Math.round(totalDelaySeconds / 60)}min) at ${scheduledFor.toISOString()}`);
  }

  async startQueueProcessor() {
    const database = await getDatabaseAsync();
    const settingResult = await database.query('SELECT value FROM update_settings WHERE key = $1', ['queue_poll_interval_ms']);
    const pollInterval = parseInt(settingResult.rows[0]?.value || '5000');

    // FIXED: Wrap processQueue in error handler to prevent queue processor from crashing
    this.queueInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.processQueue();
      } catch (error) {
        this.log(`Queue processing error: ${error.message}`, 'ERROR');
        // Don't crash - continue processing on next interval
      }
    }, pollInterval);

    this.log(`Queue processor started (poll interval: ${pollInterval}ms)`);
  }

  async processQueue() {
    const database = await getDatabaseAsync();
    const itemResult = await database.query(`
      SELECT * FROM update_queue
      WHERE status = 'pending' AND scheduled_for <= CURRENT_TIMESTAMP
      ORDER BY priority, scheduled_for
      LIMIT 1
    `);
    const item = itemResult.rows[0];
    if (!item) return;

    // Mark as processing and set initial heartbeat
    await database.query('UPDATE update_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['processing', item.id]);
    await database.query('UPDATE update_queue SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1', [item.id]);

    // RESILIENCE: Update heartbeat every 30 seconds during processing
    const heartbeatInterval = setInterval(async () => {
      try {
        const db = await getDatabaseAsync();
        await db.query('UPDATE update_queue SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1', [item.id]);
      } catch (error) {
        this.log(`Failed to update heartbeat for queue item ${item.id}: ${error.message}`, 'WARN');
      }
    }, 30000);

    try {
      let jobOptions = null;
      if (item.options) {
        try {
          jobOptions = JSON.parse(item.options);
        } catch (parseError) {
          this.log(`Failed to parse job options for ${item.job_key}: ${parseError.message}`, 'WARN');
        }
      }

      await this.runJob(item.job_key, {
        triggerType: item.trigger_type,
        triggeredBy: item.triggered_by,
        jobOptions
      });

      await database.query('UPDATE update_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', item.id]);
    } catch (error) {
      this.log(`Queue item ${item.job_key} failed: ${error.message}`, 'ERROR');
      await database.query('UPDATE update_queue SET status = $1, last_error = $2 WHERE id = $3',
        ['failed', error.message, item.id]);

      // PHASE 2.4: Report to Sentry if it's a recurring failure
      const isLastAttempt = item.attempt >= (item.max_attempts - 1);
      if (sentry.isEnabled() && isLastAttempt) {
        sentry.captureException(error, {
          tags: {
            job_key: item.job_key,
            job_type: 'update',
            attempt: item.attempt + 1,
            max_attempts: item.max_attempts
          },
          extra: {
            trigger_type: item.trigger_type,
            triggered_by: item.triggered_by,
            job_options: jobOptions
          }
        });
      }

      // Check if should retry
      const jobResult = await database.query(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.job_key = $1
      `, [item.job_key]);
      const job = jobResult.rows[0];
      if (job && item.attempt < item.max_attempts) {
        await this.queueRetry(item.job_key, job, jobOptions, item.attempt);
      }
    } finally {
      // CRITICAL: Always clear the heartbeat interval
      clearInterval(heartbeatInterval);
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  // Trigger a job manually
  async triggerJob(jobKey, triggeredBy = 'user') {
    await this.queueJobInternal(jobKey, {
      triggerType: 'manual',
      triggeredBy,
      priority: 10 // High priority for manual triggers
    });

    // Also process queue immediately
    await this.processQueue();
  }

  // Trigger all jobs in a bundle
  async triggerBundle(bundleName, triggeredBy = 'user') {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT j.*, b.name as bundle_name FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      WHERE b.name = $1 AND j.is_enabled = true
      ORDER BY j.id
    `, [bundleName]);
    const jobs = result.rows;

    for (const job of jobs) {
      await this.queueJobInternal(job.job_key, {
        triggerType: 'manual',
        triggeredBy
      });
    }
  }

  // Toggle job automatic/manual
  async setJobAutomatic(jobKey, isAutomatic) {
    const database = await getDatabaseAsync();
    await database.query('UPDATE update_jobs SET is_automatic = $1, updated_at = CURRENT_TIMESTAMP WHERE job_key = $2',
      [isAutomatic, jobKey]);

    if (isAutomatic) {
      const result = await database.query(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.job_key = $1
      `, [jobKey]);
      const job = result.rows[0];
      if (job?.cron_expression) {
        await this.scheduleJob(job);
      }
    } else {
      if (this.cronJobs.has(jobKey)) {
        this.cronJobs.get(jobKey).stop();
        this.cronJobs.delete(jobKey);
      }
    }
  }

  // Toggle bundle automatic/manual
  async setBundleAutomatic(bundleName, isAutomatic) {
    const database = await getDatabaseAsync();
    await database.query('UPDATE update_bundles SET is_automatic = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2',
      [isAutomatic, bundleName]);
    await this.restart();
  }

  // Toggle job enabled/disabled
  async setJobEnabled(jobKey, isEnabled) {
    const database = await getDatabaseAsync();
    await database.query('UPDATE update_jobs SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE job_key = $2',
      [isEnabled, jobKey]);

    if (!isEnabled && this.cronJobs.has(jobKey)) {
      this.cronJobs.get(jobKey).stop();
      this.cronJobs.delete(jobKey);
    } else if (isEnabled) {
      const result = await database.query(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.job_key = $1
      `, [jobKey]);
      const job = result.rows[0];
      if (job?.cron_expression && job.is_automatic) {
        await this.scheduleJob(job);
      }
    }
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  async getBundles() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM update_jobs WHERE bundle_id = b.id) as job_count,
        (SELECT COUNT(*) FROM update_jobs WHERE bundle_id = b.id AND status = 'running') as running_count
      FROM update_bundles b
      ORDER BY b.priority
    `);
    return result.rows;
  }

  async getAllJobs() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT j.*, b.name as bundle_name, b.display_name as bundle_display_name
      FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      ORDER BY b.priority, j.id
    `);
    return result.rows;
  }

  async getJob(jobKey) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT j.*, b.name as bundle_name FROM update_jobs j
      JOIN update_bundles b ON j.bundle_id = b.id
      WHERE j.job_key = $1
    `, [jobKey]);
    return result.rows[0];
  }

  async getJobHistory(jobKey, limit = 20) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM update_runs WHERE job_key = $1 ORDER BY started_at DESC LIMIT $2
    `, [jobKey, limit]);
    return result.rows;
  }

  async getRecentRuns(limit = 50) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM update_runs ORDER BY started_at DESC LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async getStatus() {
    const bundles = await this.getBundles();
    const jobs = await this.getAllJobs();
    const recentRuns = await this.getRecentRuns(20);
    const database = await getDatabaseAsync();
    const settingResult = await database.query('SELECT value FROM update_settings WHERE key = $1', ['global_automatic_updates']);

    return {
      isRunning: this.isRunning,
      instanceId: this.instanceId,
      scheduledJobCount: this.cronJobs.size,
      bundles,
      jobs,
      recentRuns,
      globalAutomatic: settingResult.rows[0]?.value !== 'false'
    };
  }

  // Global toggle
  async setGlobalAutomatic(isAutomatic) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO update_settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `, ['global_automatic_updates', isAutomatic ? 'true' : 'false']);

    if (isAutomatic) {
      await this.start();
    } else {
      await this.stop();
    }
  }
}

// Singleton factory
let orchestratorInstance = null;

function getUpdateOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = new UpdateOrchestrator();
  }
  return orchestratorInstance;
}

module.exports = { UpdateOrchestrator, getUpdateOrchestrator };
