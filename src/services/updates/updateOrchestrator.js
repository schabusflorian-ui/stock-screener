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

class UpdateOrchestrator extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
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

    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Bundle queries
      getBundles: this.db.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM update_jobs WHERE bundle_id = b.id) as job_count,
          (SELECT COUNT(*) FROM update_jobs WHERE bundle_id = b.id AND status = 'running') as running_count
        FROM update_bundles b
        ORDER BY b.priority
      `),

      getBundle: this.db.prepare(`
        SELECT * FROM update_bundles WHERE name = ?
      `),

      setBundleAutomatic: this.db.prepare(`
        UPDATE update_bundles SET is_automatic = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?
      `),

      // Job queries
      getAutomaticJobs: this.db.prepare(`
        SELECT j.*, b.name as bundle_name, b.is_automatic as bundle_automatic
        FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.is_enabled = 1
          AND b.is_enabled = 1
          AND COALESCE(j.is_automatic, b.is_automatic) = 1
          AND j.cron_expression IS NOT NULL
      `),

      getAllJobs: this.db.prepare(`
        SELECT j.*, b.name as bundle_name, b.display_name as bundle_display_name
        FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        ORDER BY b.priority, j.id
      `),

      getJob: this.db.prepare(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE j.job_key = ?
      `),

      getJobsByBundle: this.db.prepare(`
        SELECT j.*, b.name as bundle_name FROM update_jobs j
        JOIN update_bundles b ON j.bundle_id = b.id
        WHERE b.name = ? AND j.is_enabled = 1
        ORDER BY j.id
      `),

      updateJobStatus: this.db.prepare(`
        UPDATE update_jobs SET
          status = ?,
          is_running = ?,
          current_progress = ?,
          current_step = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE job_key = ?
      `),

      updateJobRunResult: this.db.prepare(`
        UPDATE update_jobs SET
          last_run_at = CURRENT_TIMESTAMP,
          last_run_status = ?,
          last_run_duration_ms = ?,
          last_run_items_processed = ?,
          last_run_items_updated = ?,
          last_run_items_failed = ?,
          total_runs = total_runs + 1,
          successful_runs = successful_runs + CASE WHEN ? = 'completed' THEN 1 ELSE 0 END,
          failed_runs = failed_runs + CASE WHEN ? = 'failed' THEN 1 ELSE 0 END,
          status = 'idle',
          is_running = 0,
          current_progress = 0,
          current_step = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE job_key = ?
      `),

      updateJobError: this.db.prepare(`
        UPDATE update_jobs SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE job_key = ?
      `),

      updateNextRun: this.db.prepare(`
        UPDATE update_jobs SET next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE job_key = ?
      `),

      setJobAutomatic: this.db.prepare(`
        UPDATE update_jobs SET is_automatic = ?, updated_at = CURRENT_TIMESTAMP WHERE job_key = ?
      `),

      setJobEnabled: this.db.prepare(`
        UPDATE update_jobs SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE job_key = ?
      `),

      getJobDependencies: this.db.prepare(`
        SELECT depends_on FROM update_jobs WHERE job_key = ?
      `),

      getDependentJobs: this.db.prepare(`
        SELECT job_key FROM update_jobs
        WHERE depends_on LIKE ? AND is_enabled = 1 AND COALESCE(is_automatic, 1) = 1
      `),

      // Run queries
      createRun: this.db.prepare(`
        INSERT INTO update_runs (job_id, job_key, bundle_name, started_at, trigger_type, triggered_by, status)
        VALUES (
          (SELECT id FROM update_jobs WHERE job_key = ?),
          ?, ?, CURRENT_TIMESTAMP, ?, ?, 'running'
        )
      `),

      completeRun: this.db.prepare(`
        UPDATE update_runs SET
          completed_at = CURRENT_TIMESTAMP,
          duration_ms = ?,
          status = ?,
          items_total = ?,
          items_processed = ?,
          items_updated = ?,
          items_failed = ?,
          progress = 100
        WHERE id = ?
      `),

      failRun: this.db.prepare(`
        UPDATE update_runs SET
          completed_at = CURRENT_TIMESTAMP,
          status = 'failed',
          error_message = ?,
          error_stack = ?
        WHERE id = ?
      `),

      updateRunProgress: this.db.prepare(`
        UPDATE update_runs SET progress = ?, current_step = ? WHERE id = ?
      `),

      getRunHistory: this.db.prepare(`
        SELECT * FROM update_runs WHERE job_key = ? ORDER BY started_at DESC LIMIT ?
      `),

      getRecentRuns: this.db.prepare(`
        SELECT * FROM update_runs ORDER BY started_at DESC LIMIT ?
      `),

      // Lock queries
      acquireLock: this.db.prepare(`
        INSERT OR REPLACE INTO update_locks (job_key, locked_at, locked_by, expires_at)
        SELECT ?, CURRENT_TIMESTAMP, ?, datetime('now', '+2 hours')
        WHERE NOT EXISTS (
          SELECT 1 FROM update_locks
          WHERE job_key = ? AND expires_at > CURRENT_TIMESTAMP AND locked_by != ?
        )
      `),

      checkLock: this.db.prepare(`
        SELECT * FROM update_locks WHERE job_key = ? AND locked_by = ? AND expires_at > CURRENT_TIMESTAMP
      `),

      releaseLock: this.db.prepare(`
        DELETE FROM update_locks WHERE job_key = ? AND locked_by = ?
      `),

      cleanExpiredLocks: this.db.prepare(`
        DELETE FROM update_locks WHERE expires_at < CURRENT_TIMESTAMP
      `),

      // Queue queries
      queueJob: this.db.prepare(`
        INSERT INTO update_queue (job_key, priority, scheduled_for, trigger_type, triggered_by, options)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      getNextQueueItem: this.db.prepare(`
        SELECT * FROM update_queue
        WHERE status = 'pending' AND scheduled_for <= CURRENT_TIMESTAMP
        ORDER BY priority, scheduled_for
        LIMIT 1
      `),

      updateQueueStatus: this.db.prepare(`
        UPDATE update_queue SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
      `),

      updateQueueError: this.db.prepare(`
        UPDATE update_queue SET status = 'failed', last_error = ? WHERE id = ?
      `),

      // Settings queries
      getSetting: this.db.prepare(`
        SELECT value FROM update_settings WHERE key = ?
      `),

      setSetting: this.db.prepare(`
        INSERT OR REPLACE INTO update_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `)
    };
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

    // Clean expired locks
    this.stmts.cleanExpiredLocks.run();

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
    const jobs = this.stmts.getAutomaticJobs.all();

    for (const job of jobs) {
      if (job.cron_expression) {
        this.scheduleJob(job);
      }
    }

    this.log(`Scheduled ${this.cronJobs.size} automatic jobs`);
  }

  scheduleJob(job) {
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
        this.stmts.updateNextRun.run(nextRun.toISOString(), job.job_key);
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

    const job = this.stmts.getJob.get(jobKey);
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
    const lockAcquired = this.acquireLock(jobKey);
    if (!lockAcquired) {
      this.log(`Skipping ${jobKey} - already running`);
      return { success: false, reason: 'already_running' };
    }

    // Create run record
    const runResult = this.stmts.createRun.run(jobKey, jobKey, job.bundle_name, triggerType, triggeredBy);
    const runId = runResult.lastInsertRowid;

    const startTime = Date.now();

    try {
      // Update job status
      this.stmts.updateJobStatus.run('running', 1, 0, 'Starting...', jobKey);
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
      this.stmts.completeRun.run(
        durationMs,
        'completed',
        result.itemsTotal || 0,
        result.itemsProcessed || 0,
        result.itemsUpdated || 0,
        result.itemsFailed || 0,
        runId
      );

      this.stmts.updateJobRunResult.run(
        'completed',
        durationMs,
        result.itemsProcessed || 0,
        result.itemsUpdated || 0,
        result.itemsFailed || 0,
        'completed',
        'completed',
        jobKey
      );

      this.emit('jobCompleted', { jobKey, runId, result });
      this.log(`Completed job: ${jobKey} (${(durationMs / 1000).toFixed(1)}s)`);

      // Trigger dependent jobs
      if (triggerType === 'scheduled') {
        await this.triggerDependentJobs(jobKey);
      }

      return { success: true, result };

    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.stmts.failRun.run(error.message, error.stack, runId);
      this.stmts.updateJobError.run(error.message, jobKey);
      this.stmts.updateJobRunResult.run(
        'failed',
        durationMs,
        0, 0, 0,
        'failed',
        'failed',
        jobKey
      );

      this.emit('jobFailed', { jobKey, runId, error: error.message });
      this.log(`Failed job: ${jobKey} - ${error.message}`, 'ERROR');

      // Queue retry if applicable
      if (triggerType !== 'retry') {
        await this.queueRetry(jobKey, job, options);
      }

      return { success: false, error: error.message };

    } finally {
      this.releaseLock(jobKey);
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
        case 'maintenance':
          handler = require('./bundles/maintenanceBundle');
          break;
        case 'analytics':
          handler = require('./bundles/analyticsBundle');
          break;
        default:
          throw new Error(`Unknown bundle: ${bundleName}`);
      }

      return await handler.execute(jobKey, this.db, context);

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

  updateProgress(runId, jobKey, progress, step) {
    this.stmts.updateRunProgress.run(progress, step, runId);
    this.stmts.updateJobStatus.run('running', 1, progress, step, jobKey);
    this.emit('progress', { jobKey, runId, progress, step });
  }

  // =========================================================================
  // DEPENDENCIES
  // =========================================================================

  async checkDependencies(jobKey) {
    const result = this.stmts.getJobDependencies.get(jobKey);
    if (!result?.depends_on) return true;

    let dependsOn;
    try {
      dependsOn = JSON.parse(result.depends_on);
    } catch {
      return true;
    }

    if (!Array.isArray(dependsOn) || dependsOn.length === 0) return true;

    const today = new Date().toISOString().split('T')[0];

    for (const depKey of dependsOn) {
      const depJob = this.stmts.getJob.get(depKey);
      if (!depJob) continue;

      const lastRunDate = depJob.last_run_at?.split('T')[0];

      if (lastRunDate !== today || depJob.last_run_status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  async triggerDependentJobs(jobKey) {
    const dependents = this.stmts.getDependentJobs.all(`%"${jobKey}"%`);

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

  acquireLock(jobKey) {
    try {
      this.stmts.acquireLock.run(jobKey, this.instanceId, jobKey, this.instanceId);
      const lock = this.stmts.checkLock.get(jobKey, this.instanceId);
      return !!lock;
    } catch {
      return false;
    }
  }

  releaseLock(jobKey) {
    this.stmts.releaseLock.run(jobKey, this.instanceId);
  }

  // =========================================================================
  // QUEUE
  // =========================================================================

  async queueJobInternal(jobKey, options = {}) {
    const { triggerType = 'manual', triggeredBy = 'system', priority = 50, scheduledFor = null, jobOptions = null } = options;

    this.stmts.queueJob.run(
      jobKey,
      priority,
      scheduledFor || new Date().toISOString(),
      triggerType,
      triggeredBy,
      jobOptions ? JSON.stringify(jobOptions) : null
    );
  }

  async queueRetry(jobKey, job, originalOptions) {
    const maxRetries = job.max_retries || 3;
    const retryDelay = job.retry_delay_seconds || 300;

    // This is simplified - in production, track retry count properly
    const scheduledFor = new Date(Date.now() + retryDelay * 1000);

    await this.queueJobInternal(jobKey, {
      triggerType: 'retry',
      triggeredBy: 'system',
      priority: 20,
      scheduledFor: scheduledFor.toISOString()
    });

    this.log(`Queued retry for ${jobKey} at ${scheduledFor.toISOString()}`);
  }

  startQueueProcessor() {
    const pollInterval = parseInt(this.stmts.getSetting.get('queue_poll_interval_ms')?.value || '5000');

    this.queueInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.processQueue();
    }, pollInterval);

    this.log(`Queue processor started (poll interval: ${pollInterval}ms)`);
  }

  async processQueue() {
    const item = this.stmts.getNextQueueItem.get();
    if (!item) return;

    // Mark as processing
    this.stmts.updateQueueStatus.run('processing', item.id);

    try {
      let jobOptions = null;
      if (item.options) {
        try {
          jobOptions = JSON.parse(item.options);
        } catch {}
      }

      await this.runJob(item.job_key, {
        triggerType: item.trigger_type,
        triggeredBy: item.triggered_by,
        jobOptions
      });

      this.stmts.updateQueueStatus.run('completed', item.id);
    } catch (error) {
      this.stmts.updateQueueError.run(error.message, item.id);
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
    const jobs = this.stmts.getJobsByBundle.all(bundleName);

    for (const job of jobs) {
      await this.queueJobInternal(job.job_key, {
        triggerType: 'manual',
        triggeredBy
      });
    }
  }

  // Toggle job automatic/manual
  async setJobAutomatic(jobKey, isAutomatic) {
    this.stmts.setJobAutomatic.run(isAutomatic ? 1 : 0, jobKey);

    if (isAutomatic) {
      const job = this.stmts.getJob.get(jobKey);
      if (job?.cron_expression) {
        this.scheduleJob(job);
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
    this.stmts.setBundleAutomatic.run(isAutomatic ? 1 : 0, bundleName);
    await this.restart();
  }

  // Toggle job enabled/disabled
  async setJobEnabled(jobKey, isEnabled) {
    this.stmts.setJobEnabled.run(isEnabled ? 1 : 0, jobKey);

    if (!isEnabled && this.cronJobs.has(jobKey)) {
      this.cronJobs.get(jobKey).stop();
      this.cronJobs.delete(jobKey);
    } else if (isEnabled) {
      const job = this.stmts.getJob.get(jobKey);
      if (job?.cron_expression && job.is_automatic) {
        this.scheduleJob(job);
      }
    }
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  getBundles() {
    return this.stmts.getBundles.all();
  }

  getAllJobs() {
    return this.stmts.getAllJobs.all();
  }

  getJob(jobKey) {
    return this.stmts.getJob.get(jobKey);
  }

  getJobHistory(jobKey, limit = 20) {
    return this.stmts.getRunHistory.all(jobKey, limit);
  }

  getRecentRuns(limit = 50) {
    return this.stmts.getRecentRuns.all(limit);
  }

  getStatus() {
    const bundles = this.getBundles();
    const jobs = this.getAllJobs();
    const recentRuns = this.getRecentRuns(20);

    return {
      isRunning: this.isRunning,
      instanceId: this.instanceId,
      scheduledJobCount: this.cronJobs.size,
      bundles,
      jobs,
      recentRuns,
      globalAutomatic: this.stmts.getSetting.get('global_automatic_updates')?.value !== 'false'
    };
  }

  // Global toggle
  async setGlobalAutomatic(isAutomatic) {
    this.stmts.setSetting.run('global_automatic_updates', isAutomatic ? 'true' : 'false');

    if (isAutomatic) {
      await this.start();
    } else {
      await this.stop();
    }
  }
}

// Singleton factory
let orchestratorInstance = null;

function getUpdateOrchestrator(db) {
  if (!orchestratorInstance && db) {
    orchestratorInstance = new UpdateOrchestrator(db);
  }
  return orchestratorInstance;
}

module.exports = { UpdateOrchestrator, getUpdateOrchestrator };
