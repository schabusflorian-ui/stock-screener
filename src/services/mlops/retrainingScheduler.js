// src/services/mlops/retrainingScheduler.js
// Retraining Scheduler - Cron-based automated model retraining

const { WeightUpdateService } = require('./weightUpdateService');
const { ModelRegistry } = require('./modelRegistry');

/**
 * RetrainingScheduler
 *
 * Schedules and manages automated retraining jobs:
 * - Cron-based scheduling (weekly, monthly, quarterly)
 * - Manual triggers
 * - Conditional triggers (performance degradation, regime change)
 * - Job history and logging
 */
class RetrainingScheduler {
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.weightUpdateService = new WeightUpdateService(this.db, options.updateConfig);
    this.registry = new ModelRegistry(this.db);

    // Active schedules
    this.schedules = new Map();
    this.timers = new Map();

    // Ensure tables
    this._ensureTables();
    this._prepareStatements();

    // Default config
    this.config = {
      defaultSchedule: 'weekly',  // weekly, monthly, quarterly
      runOnStart: false,
      maxConcurrentJobs: 1,
      ...options
    };
  }

  _ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retraining_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        trigger_type TEXT NOT NULL DEFAULT 'scheduled',
        schedule_cron TEXT,

        -- Job execution
        status TEXT NOT NULL DEFAULT 'pending',
        started_at DATETIME,
        completed_at DATETIME,
        elapsed_seconds REAL,

        -- Results
        success INTEGER DEFAULT 0,
        model_version TEXT,
        validation_passed INTEGER,
        promoted INTEGER DEFAULT 0,
        error_message TEXT,

        -- Metrics
        result_alpha REAL,
        result_sharpe REAL,
        result_wfe REAL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retraining_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        schedule_name TEXT UNIQUE NOT NULL,
        model_name TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        config_json TEXT,
        last_run_at DATETIME,
        next_run_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_retraining_jobs_status
      ON retraining_jobs(status, created_at)
    `);
  }

  _prepareStatements() {
    // Create job
    this.stmtCreateJob = this.db.prepare(`
      INSERT INTO retraining_jobs (job_name, trigger_type, schedule_cron)
      VALUES (?, ?, ?)
    `);

    // Update job status
    this.stmtUpdateJob = this.db.prepare(`
      UPDATE retraining_jobs SET
        status = ?,
        started_at = ?,
        completed_at = ?,
        elapsed_seconds = ?,
        success = ?,
        model_version = ?,
        validation_passed = ?,
        promoted = ?,
        error_message = ?,
        result_alpha = ?,
        result_sharpe = ?,
        result_wfe = ?
      WHERE id = ?
    `);

    // Get recent jobs
    this.stmtGetRecentJobs = this.db.prepare(`
      SELECT * FROM retraining_jobs
      ORDER BY created_at DESC
      LIMIT ?
    `);

    // Get running jobs
    this.stmtGetRunningJobs = this.db.prepare(`
      SELECT * FROM retraining_jobs WHERE status = 'running'
    `);

    // Create/update schedule
    this.stmtUpsertSchedule = this.db.prepare(`
      INSERT INTO retraining_schedules (schedule_name, model_name, cron_expression, config_json, next_run_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(schedule_name) DO UPDATE SET
        cron_expression = excluded.cron_expression,
        config_json = excluded.config_json,
        next_run_at = excluded.next_run_at,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Get active schedules
    this.stmtGetSchedules = this.db.prepare(`
      SELECT * FROM retraining_schedules WHERE is_active = 1
    `);

    // Update schedule last run
    this.stmtUpdateScheduleRun = this.db.prepare(`
      UPDATE retraining_schedules SET
        last_run_at = CURRENT_TIMESTAMP,
        next_run_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE schedule_name = ?
    `);

    // Deactivate schedule
    this.stmtDeactivateSchedule = this.db.prepare(`
      UPDATE retraining_schedules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE schedule_name = ?
    `);
  }

  /**
   * Register a retraining schedule
   * @param {string} scheduleName - Unique name for the schedule
   * @param {string} modelName - Model to retrain
   * @param {string} cronExpression - Cron expression (or preset: 'weekly', 'monthly', 'quarterly')
   * @param {Object} config - Optional config overrides
   */
  registerSchedule(scheduleName, modelName, cronExpression, config = {}) {
    // Convert preset names to cron expressions
    const cronMap = {
      'weekly': '0 0 * * 0',     // Sunday at midnight
      'monthly': '0 0 1 * *',    // 1st of month at midnight
      'quarterly': '0 0 1 */3 *', // 1st of Jan/Apr/Jul/Oct
      'daily': '0 0 * * *'       // Daily at midnight (for testing)
    };

    const cron = cronMap[cronExpression] || cronExpression;
    const nextRun = this._getNextRunDate(cron);

    this.stmtUpsertSchedule.run(
      scheduleName,
      modelName,
      cron,
      JSON.stringify(config),
      nextRun.toISOString()
    );

    console.log(`Registered schedule: ${scheduleName} (${cron})`);
    console.log(`Next run: ${nextRun.toISOString()}`);

    return { scheduleName, modelName, cron, nextRun };
  }

  /**
   * Start the scheduler
   * Loads all active schedules and sets up timers
   */
  start() {
    console.log('\nStarting Retraining Scheduler...');

    const schedules = this.stmtGetSchedules.all();
    console.log(`Found ${schedules.length} active schedules`);

    for (const schedule of schedules) {
      this._activateSchedule(schedule);
    }

    // Also start the check interval (every hour)
    this.checkInterval = setInterval(() => {
      this._checkSchedules();
    }, 60 * 60 * 1000); // 1 hour

    console.log('Scheduler started');
    return { activeSchedules: schedules.length };
  }

  /**
   * Stop the scheduler
   */
  stop() {
    console.log('Stopping Retraining Scheduler...');

    // Clear all timers
    for (const [name, timer] of this.timers) {
      clearTimeout(timer);
      console.log(`Stopped timer: ${name}`);
    }
    this.timers.clear();
    this.schedules.clear();

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    console.log('Scheduler stopped');
  }

  /**
   * Trigger a retraining job manually
   * @param {string|Object} jobNameOrConfig - Job name for tracking, or config object
   * @param {Object} config - Override config (if first param is string)
   * @returns {Promise<Object>} Job result
   */
  async triggerManual(jobNameOrConfig = 'manual', config = {}) {
    // Handle both string and object parameter styles
    let jobName = 'manual';
    let triggerType = 'manual';
    let jobConfig = config;

    if (typeof jobNameOrConfig === 'object') {
      // New style: triggerManual({ type, reason, modelName, ...config })
      const { type, reason, modelName, ...restConfig } = jobNameOrConfig;

      triggerType = type || 'manual';
      jobName = type === 'drift_triggered'
        ? `drift_${modelName || 'unknown'}_${Date.now()}`
        : `manual_${Date.now()}`;

      jobConfig = {
        ...restConfig,
        modelName,
        triggerReason: reason
      };

      console.log(`[RetrainingScheduler] Drift-triggered retraining for ${modelName}: ${reason}`);
    } else {
      jobName = jobNameOrConfig;
    }

    // Check if already running
    const running = this.stmtGetRunningJobs.all();
    if (running.length >= this.config.maxConcurrentJobs) {
      return {
        success: false,
        error: `Max concurrent jobs (${this.config.maxConcurrentJobs}) already running`,
        message: `Max concurrent jobs (${this.config.maxConcurrentJobs}) already running`
      };
    }

    const result = await this._executeJob(jobName, triggerType, null, jobConfig);

    // Return consistent format with jobId
    return {
      success: result.success,
      jobId: result.jobId,
      error: result.message || null,
      result
    };
  }

  /**
   * Trigger retraining due to drift detected by ModelMonitor
   * @param {string} modelName - Model that drifted
   * @param {string} reason - Reason for drift
   * @param {Object} metrics - Drift metrics
   * @returns {Promise<Object>} Job result
   */
  async triggerOnDrift(modelName, reason, metrics = {}) {
    console.log(`[RetrainingScheduler] Drift-triggered retraining for ${modelName}`);
    console.log(`  Reason: ${reason}`);

    return this.triggerManual({
      type: 'drift_triggered',
      reason: reason,
      modelName: modelName,
      autoPromote: true,
      driftMetrics: metrics
    });
  }

  /**
   * Trigger retraining if performance degrades
   * @returns {Promise<Object>} Result
   */
  async triggerOnDegradation() {
    const check = await this.weightUpdateService.checkLivePerformance();

    if (!check.needsRollback) {
      return {
        triggered: false,
        message: check.message
      };
    }

    console.log(`Performance degradation detected: ${check.message}`);
    console.log('Triggering retraining...');

    const result = await this._executeJob(
      'degradation_triggered',
      'degradation',
      null,
      { autoPromote: true }
    );

    return {
      triggered: true,
      degradationDetails: check,
      jobResult: result
    };
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    const schedules = this.stmtGetSchedules.all();
    const recentJobs = this.stmtGetRecentJobs.all(10);
    const runningJobs = this.stmtGetRunningJobs.all();

    return {
      isRunning: this.timers.size > 0 || this.checkInterval !== undefined,
      activeSchedules: schedules.map(s => ({
        name: s.schedule_name,
        model: s.model_name,
        cron: s.cron_expression,
        lastRun: s.last_run_at,
        nextRun: s.next_run_at
      })),
      runningJobs: runningJobs.length,
      recentJobs: recentJobs.map(j => ({
        id: j.id,
        name: j.job_name,
        trigger: j.trigger_type,
        status: j.status,
        success: j.success === 1,
        promoted: j.promoted === 1,
        modelVersion: j.model_version,
        alpha: j.result_alpha,
        elapsed: j.elapsed_seconds,
        createdAt: j.created_at
      }))
    };
  }

  /**
   * Deactivate a schedule
   */
  deactivateSchedule(scheduleName) {
    this.stmtDeactivateSchedule.run(scheduleName);

    if (this.timers.has(scheduleName)) {
      clearTimeout(this.timers.get(scheduleName));
      this.timers.delete(scheduleName);
    }
    this.schedules.delete(scheduleName);

    return { deactivated: scheduleName };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Activate a schedule by setting up its timer
   */
  _activateSchedule(schedule) {
    const nextRun = new Date(schedule.next_run_at);
    const now = new Date();
    const delay = Math.max(0, nextRun - now);

    console.log(`Scheduling ${schedule.schedule_name}: next run in ${Math.round(delay / 1000 / 60)} minutes`);

    // Store schedule
    this.schedules.set(schedule.schedule_name, {
      ...schedule,
      config: JSON.parse(schedule.config_json || '{}')
    });

    // Set timer
    const timer = setTimeout(() => {
      this._runScheduledJob(schedule);
    }, delay);

    this.timers.set(schedule.schedule_name, timer);
  }

  /**
   * Run a scheduled job
   */
  async _runScheduledJob(schedule) {
    console.log(`\nRunning scheduled job: ${schedule.schedule_name}`);

    const config = JSON.parse(schedule.config_json || '{}');
    await this._executeJob(
      schedule.schedule_name,
      'scheduled',
      schedule.cron_expression,
      config
    );

    // Schedule next run
    const nextRun = this._getNextRunDate(schedule.cron_expression);
    this.stmtUpdateScheduleRun.run(nextRun.toISOString(), schedule.schedule_name);

    // Re-activate
    const updatedSchedule = {
      ...schedule,
      next_run_at: nextRun.toISOString()
    };
    this._activateSchedule(updatedSchedule);
  }

  /**
   * Execute a retraining job
   */
  async _executeJob(jobName, triggerType, cronExpression, config) {
    // Create job record
    const jobResult = this.stmtCreateJob.run(jobName, triggerType, cronExpression);
    const jobId = jobResult.lastInsertRowid;
    const startTime = Date.now();

    // Update to running
    this.stmtUpdateJob.run(
      'running',
      new Date().toISOString(),
      null, null, null, null, null, null, null, null, null, null,
      jobId
    );

    let result;
    try {
      result = await this.weightUpdateService.runUpdate(config);

      // Update job with results
      this.stmtUpdateJob.run(
        'completed',
        new Date(startTime).toISOString(),
        new Date().toISOString(),
        result.elapsed,
        result.success ? 1 : 0,
        result.version,
        result.validationResult?.valid ? 1 : 0,
        result.promoted ? 1 : 0,
        result.error,
        result.validationResult?.metrics?.alpha,
        result.validationResult?.metrics?.testSharpe,
        result.validationResult?.metrics?.wfe,
        jobId
      );

    } catch (error) {
      this.stmtUpdateJob.run(
        'failed',
        new Date(startTime).toISOString(),
        new Date().toISOString(),
        (Date.now() - startTime) / 1000,
        0, null, null, 0,
        error.message,
        null, null, null,
        jobId
      );

      result = { success: false, error: error.message };
    }

    return { jobId, ...result };
  }

  /**
   * Check schedules for missed runs
   */
  _checkSchedules() {
    const schedules = this.stmtGetSchedules.all();
    const now = new Date();

    for (const schedule of schedules) {
      const nextRun = new Date(schedule.next_run_at);

      // If next run is in the past, we missed it
      if (nextRun < now && !this.timers.has(schedule.schedule_name)) {
        console.log(`Missed schedule detected: ${schedule.schedule_name}`);
        this._activateSchedule(schedule);
      }
    }
  }

  /**
   * Parse cron expression and get next run date
   * Simple implementation - supports basic patterns
   */
  _getNextRunDate(cronExpression) {
    // Parse cron: minute hour dayOfMonth month dayOfWeek
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const next = new Date(now);

    // Set to the specified hour/minute
    next.setMinutes(parseInt(minute) || 0);
    next.setHours(parseInt(hour) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Handle day of week (0 = Sunday)
    if (dayOfWeek !== '*') {
      const targetDay = parseInt(dayOfWeek);
      const currentDay = next.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0 || (daysToAdd === 0 && next <= now)) {
        daysToAdd += 7;
      }
      next.setDate(next.getDate() + daysToAdd);
    }
    // Handle day of month
    else if (dayOfMonth !== '*') {
      const targetDate = parseInt(dayOfMonth);
      next.setDate(targetDate);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
    }
    // Handle month
    else if (month !== '*') {
      // Handle quarterly (*/3)
      if (month.startsWith('*/')) {
        const interval = parseInt(month.substring(2));
        const currentMonth = next.getMonth();
        const nextMonth = Math.ceil((currentMonth + 1) / interval) * interval;
        next.setMonth(nextMonth % 12);
        if (nextMonth >= 12) {
          next.setFullYear(next.getFullYear() + 1);
        }
        next.setDate(parseInt(dayOfMonth) || 1);
      }
    }
    // Daily - just move to next occurrence
    else if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a default weekly scheduler
 */
function createWeeklyScheduler(db, options = {}) {
  const scheduler = new RetrainingScheduler(db, options);
  scheduler.registerSchedule('weekly_weights', 'signal_weights', 'weekly', {
    autoPromote: true,
    minWFE: 0.50,
    maxDeflatedSharpeP: 0.05
  });
  return scheduler;
}

/**
 * Create a conservative monthly scheduler
 */
function createMonthlyScheduler(db, options = {}) {
  const scheduler = new RetrainingScheduler(db, options);
  scheduler.registerSchedule('monthly_weights', 'signal_weights', 'monthly', {
    autoPromote: true,
    minWFE: 0.60,        // Stricter
    maxDeflatedSharpeP: 0.01,
    rollingWindowYears: 5  // Longer history
  });
  return scheduler;
}

module.exports = {
  RetrainingScheduler,
  createWeeklyScheduler,
  createMonthlyScheduler
};
