/**
 * Master Scheduler
 *
 * Unified scheduler for all automated jobs in the Investment Project.
 * Runs as a single daemon process managing all scheduled tasks.
 *
 * Jobs included:
 * - Price updates (weekdays 6 PM ET)
 * - Sentiment refresh (every 4 hours)
 * - Knowledge base refresh (daily 6 AM, full weekly Sunday 3 AM)
 * - SEC filing checks (weekdays 7 PM ET)
 * - Dividend data refresh (weekly Sunday 4 AM ET)
 *
 * Usage:
 *   node src/jobs/masterScheduler.js              # Start scheduler daemon
 *   node src/jobs/masterScheduler.js --status     # Show all job statuses
 *   node src/jobs/masterScheduler.js --run-all    # Run all jobs immediately
 *   node src/jobs/masterScheduler.js --list       # List scheduled jobs
 */

const cron = require('node-cron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { jobs: logger } = require('../utils/logger');

/**
 * Distributed Lock Manager
 * Uses Redis for distributed locking when available,
 * falls back to in-memory locking for single-instance deployments.
 */
class DistributedLockManager {
  constructor() {
    this.redis = null;
    this.connected = false;
    this.localLocks = new Map(); // Fallback for non-Redis environments
    this.lockPrefix = 'job:lock:';
    this.lockTTL = 90 * 60; // 90 minutes max lock time

    this._initRedis();
  }

  _initRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log('[Lock Manager] No REDIS_URL, using local locking');
      return;
    }

    try {
      const Redis = require('ioredis');
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      this.redis.on('ready', () => {
        console.log('[Lock Manager] Connected to Redis');
        this.connected = true;
      });

      this.redis.on('error', (err) => {
        console.error('[Lock Manager] Redis error:', err.message);
        this.connected = false;
      });

      this.redis.on('close', () => {
        this.connected = false;
      });
    } catch (err) {
      console.error('[Lock Manager] Failed to initialize Redis:', err.message);
    }
  }

  /**
   * Acquire a distributed lock for a job
   * @param {string} jobName - Name of the job
   * @param {number} ttlSeconds - Lock TTL (auto-release after this time)
   * @returns {Promise<string|null>} - Lock token if acquired, null if job is already locked
   */
  async acquire(jobName, ttlSeconds = this.lockTTL) {
    const lockKey = this.lockPrefix + jobName;
    const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

    if (this.redis && this.connected) {
      try {
        // Use SET NX EX for atomic lock acquisition
        const result = await this.redis.set(lockKey, lockToken, 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
          return lockToken;
        }
        // Lock exists - check who holds it
        const holder = await this.redis.get(lockKey);
        console.log(`[Lock Manager] Job ${jobName} already locked by ${holder}`);
        return null;
      } catch (err) {
        console.error(`[Lock Manager] Redis error acquiring lock: ${err.message}`);
        // Fall through to local locking
      }
    }

    // Fallback: local locking
    if (this.localLocks.has(jobName)) {
      const existingLock = this.localLocks.get(jobName);
      if (Date.now() < existingLock.expiresAt) {
        console.log(`[Lock Manager] Job ${jobName} locally locked`);
        return null;
      }
      // Lock expired, remove it
      this.localLocks.delete(jobName);
    }

    this.localLocks.set(jobName, {
      token: lockToken,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    return lockToken;
  }

  /**
   * Release a distributed lock
   * @param {string} jobName - Name of the job
   * @param {string} lockToken - Token returned from acquire()
   * @returns {Promise<boolean>} - True if released, false if lock was held by another process
   */
  async release(jobName, lockToken) {
    const lockKey = this.lockPrefix + jobName;

    if (this.redis && this.connected) {
      try {
        // Only release if we hold the lock (compare-and-delete)
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const result = await this.redis.eval(script, 1, lockKey, lockToken);
        return result === 1;
      } catch (err) {
        console.error(`[Lock Manager] Redis error releasing lock: ${err.message}`);
      }
    }

    // Fallback: local locking
    const existingLock = this.localLocks.get(jobName);
    if (existingLock && existingLock.token === lockToken) {
      this.localLocks.delete(jobName);
      return true;
    }
    return false;
  }

  /**
   * Check if a job is currently locked
   * @param {string} jobName - Name of the job
   * @returns {Promise<boolean>}
   */
  async isLocked(jobName) {
    const lockKey = this.lockPrefix + jobName;

    if (this.redis && this.connected) {
      try {
        const result = await this.redis.exists(lockKey);
        return result === 1;
      } catch (err) {
        console.error(`[Lock Manager] Redis error checking lock: ${err.message}`);
      }
    }

    // Fallback: local locking
    const existingLock = this.localLocks.get(jobName);
    if (existingLock) {
      if (Date.now() < existingLock.expiresAt) {
        return true;
      }
      this.localLocks.delete(jobName);
    }
    return false;
  }

  /**
   * Extend lock TTL (heartbeat)
   * @param {string} jobName - Name of the job
   * @param {string} lockToken - Token returned from acquire()
   * @param {number} ttlSeconds - New TTL
   * @returns {Promise<boolean>}
   */
  async extend(jobName, lockToken, ttlSeconds = this.lockTTL) {
    const lockKey = this.lockPrefix + jobName;

    if (this.redis && this.connected) {
      try {
        // Only extend if we hold the lock
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        const result = await this.redis.eval(script, 1, lockKey, lockToken, ttlSeconds);
        return result === 1;
      } catch (err) {
        console.error(`[Lock Manager] Redis error extending lock: ${err.message}`);
      }
    }

    // Fallback: local locking
    const existingLock = this.localLocks.get(jobName);
    if (existingLock && existingLock.token === lockToken) {
      existingLock.expiresAt = Date.now() + (ttlSeconds * 1000);
      return true;
    }
    return false;
  }

  /**
   * Store job status in Redis (for distributed status sharing)
   * @param {string} jobName - Name of the job
   * @param {Object} status - Status object
   */
  async setStatus(jobName, status) {
    if (this.redis && this.connected) {
      try {
        const key = `job:status:${jobName}`;
        await this.redis.set(key, JSON.stringify(status), 'EX', 86400); // 24 hour TTL
      } catch (err) {
        console.error(`[Lock Manager] Error setting status: ${err.message}`);
      }
    }
  }

  /**
   * Get job status from Redis
   * @param {string} jobName - Name of the job
   * @returns {Promise<Object|null>}
   */
  async getStatus(jobName) {
    if (this.redis && this.connected) {
      try {
        const key = `job:status:${jobName}`;
        const result = await this.redis.get(key);
        return result ? JSON.parse(result) : null;
      } catch (err) {
        console.error(`[Lock Manager] Error getting status: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Cleanup
   */
  async destroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Singleton lock manager
let lockManager = null;
function getLockManager() {
  if (!lockManager) {
    lockManager = new DistributedLockManager();
  }
  return lockManager;
}

// Default job timeout in milliseconds (30 minutes)
const DEFAULT_JOB_TIMEOUT_MS = 30 * 60 * 1000;

// Job-specific timeouts (some jobs need more time)
const JOB_TIMEOUTS = {
  'price-update': 45 * 60 * 1000,      // 45 min - lots of API calls
  'sec-refresh': 60 * 60 * 1000,       // 60 min - parsing SEC filings
  'dividend-refresh': 30 * 60 * 1000,  // 30 min
  'sentiment-refresh': 20 * 60 * 1000, // 20 min
  'knowledge-refresh': 60 * 60 * 1000, // 60 min
  'investor-13f': 90 * 60 * 1000,      // 90 min - large data imports
  'xbrl-sync': 60 * 60 * 1000,         // 60 min
  'market-indicator': 10 * 60 * 1000,  // 10 min - calculates Buffett, P/E, MSI
  'agent-scanner': 60 * 60 * 1000,     // 60 min - scans all agents for signals
};

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} jobName - Name of the job for error messages
 * @returns {Promise} - The wrapped promise
 */
function withTimeout(promise, timeoutMs, jobName) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Job '${jobName}' timed out after ${timeoutMs / 60000} minutes`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

// Import individual job modules
const PriceUpdateScheduler = require('./priceUpdateScheduler');
const KnowledgeBaseRefresh = require('./knowledgeBaseRefresh');
const { getETFUpdateScheduler } = require('./etfUpdateScheduler');
const Investor13FRefresh = require('./investor13FRefresh');
const { refreshEarnings } = require('./earningsRefresh');
const { XBRLBulkImporter } = require('../services/xbrl/xbrlBulkImporter');
const { XBRLSyncService } = require('../services/xbrl/xbrlSyncService');
const AgentExecutor = require('./agentExecutor');
const AgentScanner = require('./agentScanner');

class MasterScheduler {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');

    // Check if we should use database/Redis for state (cloud environments)
    // Import config safely to avoid circular deps
    const config = require('../config');
    this.useDbForState = config.shouldUseDbForState ? config.shouldUseDbForState() : false;

    // Only create log directory in non-ephemeral environments
    if (!this.useDbForState) {
      this.logDir = path.join(this.projectRoot, 'logs');
      this.statusFile = path.join(this.projectRoot, 'data/scheduler_status.json');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } else {
      console.log('[Scheduler] Running in cloud mode - using stdout/Redis for state');
      this.logDir = null;
      this.statusFile = null;
    }

    // Initialize distributed lock manager for cloud deployments
    this.lockManager = getLockManager();

    // Initialize job instances
    this.priceUpdater = new PriceUpdateScheduler();
    this.knowledgeRefresher = new KnowledgeBaseRefresh();
    this.etfUpdater = getETFUpdateScheduler();
    this.investor13FRefresher = new Investor13FRefresh();
    this.agentExecutor = new AgentExecutor();
    this.agentScanner = new AgentScanner();

    // Track running jobs (local tracking + distributed locks)
    this.runningJobs = new Set();
    this.activeLocks = new Map(); // jobName -> lockToken
    this.jobHistory = [];

    // Load existing status
    this.loadStatus();
  }

  /**
   * Log message with timestamp using structured logger
   */
  log(message, level = 'INFO') {
    const logLevel = level.toLowerCase();
    if (logLevel === 'error') {
      logger.error(message);
    } else if (logLevel === 'warn' || logLevel === 'warning') {
      logger.warn(message);
    } else if (logLevel === 'debug') {
      logger.debug(message);
    } else {
      logger.info(message);
    }

    // Only write to log file if not in cloud mode
    if (this.logDir) {
      try {
        const logFile = path.join(this.logDir, `scheduler-${new Date().toISOString().split('T')[0]}.log`);
        const logLine = `[${new Date().toISOString()}] [${level}] ${message}`;
        fs.appendFileSync(logFile, logLine + '\n');
      } catch (e) {
        // Ignore file write errors in case of permission issues
      }
    }
  }

  /**
   * Load status from file or Redis
   */
  loadStatus() {
    if (this.useDbForState) {
      // In cloud mode, load from Redis asynchronously
      this._loadStatusFromRedis().catch(e => {
        this.log(`Could not load status from Redis: ${e.message}`, 'WARN');
      });
      return;
    }

    // File-based loading
    try {
      if (this.statusFile && fs.existsSync(this.statusFile)) {
        const data = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        this.jobHistory = data.history || [];
      }
    } catch (e) {
      this.log(`Could not load status: ${e.message}`, 'WARN');
    }
  }

  /**
   * Load status from Redis (cloud mode)
   */
  async _loadStatusFromRedis() {
    const status = await this.lockManager.getStatus('scheduler');
    if (status && status.history) {
      this.jobHistory = status.history;
    }
  }

  /**
   * Save status to file or Redis
   */
  saveStatus() {
    const status = {
      lastUpdated: new Date().toISOString(),
      runningJobs: Array.from(this.runningJobs),
      history: this.jobHistory.slice(0, 100) // Keep last 100 entries
    };

    if (this.useDbForState) {
      // In cloud mode, save to Redis asynchronously
      this.lockManager.setStatus('scheduler', status).catch(e => {
        // Silently ignore - status is best-effort
      });
      return;
    }

    // File-based saving
    try {
      if (this.statusFile) {
        fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2));
      }
    } catch (e) {
      this.log(`Could not save status: ${e.message}`, 'WARN');
    }
  }

  /**
   * Record job execution
   */
  recordJobRun(jobName, success, duration, message = '') {
    this.jobHistory.unshift({
      job: jobName,
      timestamp: new Date().toISOString(),
      success,
      duration,
      message
    });
    this.saveStatus();
  }

  /**
   * Run a job with distributed locking, tracking, and timeout protection
   * Uses Redis locks when available to prevent duplicate execution across instances.
   *
   * @param {string} jobName - Name of the job for tracking and logging
   * @param {Function} jobFn - Async function to execute
   * @param {number} [customTimeoutMs] - Optional custom timeout (uses JOB_TIMEOUTS or DEFAULT)
   */
  async runJob(jobName, jobFn, customTimeoutMs = null) {
    // Check local tracking first
    if (this.runningJobs.has(jobName)) {
      this.log(`${jobName} is already running locally, skipping`, 'WARN');
      return;
    }

    const timeoutMs = customTimeoutMs || JOB_TIMEOUTS[jobName] || DEFAULT_JOB_TIMEOUT_MS;
    const lockTTL = Math.ceil(timeoutMs / 1000) + 60; // Lock TTL = timeout + 1 minute buffer

    // Acquire distributed lock
    const lockToken = await this.lockManager.acquire(jobName, lockTTL);
    if (!lockToken) {
      this.log(`${jobName} is already running on another instance, skipping`, 'WARN');
      return;
    }

    // Add to local tracking
    this.runningJobs.add(jobName);
    this.activeLocks.set(jobName, lockToken);
    this.saveStatus();

    // Update distributed status
    await this.lockManager.setStatus(jobName, {
      status: 'running',
      startTime: new Date().toISOString(),
      instance: process.pid,
      host: process.env.HOSTNAME || 'local'
    });

    const startTime = Date.now();
    this.log(`Starting ${jobName} (timeout: ${timeoutMs / 60000} min, lock acquired)...`);

    // Set up heartbeat to extend lock during long-running jobs
    const heartbeatInterval = setInterval(async () => {
      const extended = await this.lockManager.extend(jobName, lockToken, lockTTL);
      if (!extended) {
        this.log(`${jobName} lock heartbeat failed - lock may have been stolen`, 'WARN');
      }
    }, 30000); // Heartbeat every 30 seconds

    try {
      // Wrap job execution with timeout protection
      await withTimeout(jobFn(), timeoutMs, jobName);
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      this.log(`${jobName} completed successfully (${duration} min)`);
      this.recordJobRun(jobName, true, `${duration} min`);

      // Update distributed status
      await this.lockManager.setStatus(jobName, {
        status: 'completed',
        endTime: new Date().toISOString(),
        duration: `${duration} min`,
        success: true
      });
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const isTimeout = error.message.includes('timed out');
      this.log(`${jobName} ${isTimeout ? 'timed out' : 'failed'}: ${error.message}`, 'ERROR');
      this.recordJobRun(jobName, false, `${duration} min`, error.message);

      // Update distributed status
      await this.lockManager.setStatus(jobName, {
        status: 'failed',
        endTime: new Date().toISOString(),
        duration: `${duration} min`,
        error: error.message
      });
    } finally {
      // Stop heartbeat
      clearInterval(heartbeatInterval);

      // Release distributed lock
      const released = await this.lockManager.release(jobName, lockToken);
      if (!released) {
        this.log(`${jobName} lock release failed - lock may have expired`, 'WARN');
      }

      // Clean up local tracking
      this.runningJobs.delete(jobName);
      this.activeLocks.delete(jobName);
      this.saveStatus();
    }
  }

  /**
   * Run sentiment refresh job with timeout protection for child process
   */
  async runSentimentRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'sentimentRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        // FIXED: Ensure child dies with parent (not detached)
        detached: false
      });

      let output = '';
      let settled = false;

      // Set up timeout for child process (15 minutes)
      const processTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          // FIXED: Kill entire process group to ensure no orphaned processes
          try {
            // Send SIGTERM to process group (negative PID)
            process.kill(-child.pid, 'SIGTERM');
          } catch (e) {
            // If process group kill fails, try killing just the process
            try { child.kill('SIGTERM'); } catch (e2) { /* ignore */ }
          }

          // Give it 5 seconds to gracefully terminate, then force kill
          setTimeout(() => {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch (e) {
              try { child.kill('SIGKILL'); } catch (e2) { /* ignore */ }
            }
          }, 5000);
          reject(new Error('Sentiment refresh child process timed out after 15 minutes'));
        }
      }, 15 * 60 * 1000);

      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(processTimeout);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Sentiment refresh failed with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(processTimeout);
        reject(err);
      });
    });
  }

  /**
   * Run SEC refresh job with timeout protection for child process
   */
  async runSecRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'secDirectRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        // FIXED: Ensure child dies with parent (not detached)
        detached: false
      });

      let output = '';
      let settled = false;

      // Set up timeout for child process (45 minutes for SEC parsing)
      const processTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          // FIXED: Kill entire process group to ensure no orphaned processes
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch (e) {
            try { child.kill('SIGTERM'); } catch (e2) { /* ignore */ }
          }

          setTimeout(() => {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch (e) {
              try { child.kill('SIGKILL'); } catch (e2) { /* ignore */ }
            }
          }, 5000);
          reject(new Error('SEC refresh child process timed out after 45 minutes'));
        }
      }, 45 * 60 * 1000);

      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(processTimeout);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`SEC refresh failed with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(processTimeout);
        reject(err);
      });
    });
  }

  /**
   * Run dividend data refresh job
   * Fetches dividend history and metrics from Yahoo Finance
   */
  async runDividendRefresh(sp500Only = true) {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'dividend_fetcher.py');
      const args = sp500Only ? ['sp500'] : ['fetch'];
      const child = spawn('python3', [script, ...args], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Dividend refresh failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Process portfolio dividends
   * Credits dividends to portfolios when stocks go ex-dividend
   */
  async processPortfolioDividends(lookbackDays = 7) {
    const { getDatabase } = require('../database');
    const { getDividendProcessor } = require('../services/portfolio/dividendProcessor');

    const db = getDatabase();
    const processor = getDividendProcessor(db);

    const result = processor.processAllDividends({ lookbackDays });

    this.log(`Portfolio dividends processed: ${result.dividendsProcessed} dividends, $${result.totalAmount.toFixed(2)} total`);
    if (result.dripShares > 0) {
      this.log(`DRIP shares purchased: ${result.dripShares.toFixed(4)}`);
    }
    if (result.errors.length > 0) {
      this.log(`Dividend processing errors: ${result.errors.length}`, 'WARN');
    }

    return result;
  }

  /**
   * Run EU/UK price update
   * Updates prices for European companies with valid tickers
   */
  async runEuropeanPriceUpdate(countries = ['GB']) {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'price_updater.py');
      // Use test-country to bypass weekend check and update all EU/UK
      const child = spawn('python3', [script, 'test-country', '-c', countries[0], '-l', '1000'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
        // Log progress
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => {
          if (line.includes('Batch') || line.includes('Summary')) {
            this.log(`EU/UK Prices: ${line}`);
          }
        });
      });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          // Parse results from output
          const successMatch = output.match(/Successful: (\d+)/);
          const failedMatch = output.match(/Failed: (\d+)/);
          resolve({
            successful: successMatch ? parseInt(successMatch[1]) : 0,
            failed: failedMatch ? parseInt(failedMatch[1]) : 0,
            output
          });
        } else {
          reject(new Error(`EU/UK price update failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run European index constituents update
   * Fetches FTSE 100, DAX 40, CAC 40 constituents and marks companies
   */
  async runEuropeanIndexUpdate() {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'european_index_fetcher.py');
      const child = spawn('python3', [script, 'all'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          this.log('European index constituents updated');
          resolve(output);
        } else {
          reject(new Error(`European index update failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run valuation calculation for EU/UK companies
   * Calculates PE, PB, PS ratios using price data and XBRL fundamentals
   */
  async runEuropeanValuationUpdate() {
    const { getDatabase } = require('../database');
    const { ValuationService } = require('../services/xbrl');

    const database = getDatabase();
    const valuationService = new ValuationService(database);

    this.log('Starting EU/UK valuation calculation...');
    const result = valuationService.updateAllValuations();
    this.log(`Valuation update complete: ${result.updated} companies updated, ${result.errors} errors`);

    return result;
  }

  /**
   * Run sector/industry enrichment for EU/UK companies
   * Fetches missing sector/industry data from Yahoo Finance
   */
  async runEuropeanEnrichment() {
    const { getDatabase } = require('../database');
    const { EnrichmentService } = require('../services/xbrl');

    const database = getDatabase();
    const enrichmentService = new EnrichmentService(database);

    this.log('Starting EU/UK sector enrichment...');
    const result = await enrichmentService.enrichAllWithoutSector({ limit: 100 });
    this.log(`Enrichment complete: ${result.enriched} companies enriched, ${result.failed} failed`);

    return result;
  }

  /**
   * Run ticker resolution for pending EU/UK companies
   * Resolves tickers via GLEIF → ISIN → OpenFIGI pipeline for new IPOs and imports
   */
  async runTickerResolution(options = {}) {
    const { getDatabase } = require('../database');
    const database = getDatabase();

    const syncService = new XBRLSyncService(database, { autoResolveTickers: true });

    const limit = options.limit || 50;
    const delayMs = options.delayMs || 500;

    this.log(`Starting ticker resolution for up to ${limit} pending companies...`);
    const result = await syncService.resolvePendingTickers(limit, delayMs);

    if (result.skipped) {
      this.log('Ticker resolution skipped - SymbolResolver not available');
    } else {
      this.log(`Ticker resolution complete: ${result.resolved} resolved, ${result.failed} failed out of ${result.processed} processed`);
    }

    return result;
  }

  /**
   * Run XBRL EU/UK bulk import
   * Imports XBRL filings from filings.xbrl.org for EU/UK companies
   */
  async runXBRLImport(options = {}) {
    const { getDatabase } = require('../database');
    const database = getDatabase();

    const importer = new XBRLBulkImporter(database, {
      startYear: options.startYear || 2021,
      batchSize: options.batchSize || 100
    });

    const countries = options.countries || ['GB', 'DE', 'FR', 'NL', 'SE'];

    this.log(`Starting EU/UK XBRL import for countries: ${countries.join(', ')}`);

    const results = await importer.importAllEuropeUK({
      countries,
      startYear: options.startYear || 2021,
      progressCallback: (progress) => {
        if (progress.stats.processed % 100 === 0) {
          this.log(`XBRL Progress: ${progress.currentCountry} - ${progress.stats.processed} processed, ${progress.stats.parsed} parsed`);
        }
      }
    });

    this.log(`XBRL Import complete: ${results.totals.processed} filings, ${results.totals.parsed} parsed, ${results.totals.errors} errors`);
    return results;
  }

  /**
   * Run EU/UK IPO prospectus check
   * Fetches prospectuses from ESMA (EU) and/or FCA NSM (UK)
   * @param {string} source - 'esma', 'fca', or 'all'
   */
  async runEUIPOCheck(source = 'all') {
    const { IPOTracker } = require('../services/ipoTracker');
    const db = require('../database');

    const database = db.getDatabase();
    const ipoTracker = new IPOTracker(database);

    const days = 7; // Check last 7 days of prospectuses

    let result;

    if (source === 'esma') {
      this.log('Fetching ESMA (EU) prospectuses...');
      result = await ipoTracker.checkForESMAFilings({ days, ipoOnly: true });
      this.log(`ESMA check complete: fetched ${result.fetched}, created ${result.created}, skipped ${result.skipped}`);
    } else if (source === 'fca') {
      this.log('Fetching FCA NSM (UK) prospectuses...');
      result = await ipoTracker.checkForFCAFilings({ days, ipoOnly: true });
      this.log(`FCA check complete: fetched ${result.fetched}, created ${result.created}, skipped ${result.skipped}`);
    } else {
      this.log('Fetching EU/UK prospectuses from all sources...');
      result = await ipoTracker.checkForEUFilings({ days });
      this.log(`EU/UK check complete: ${result.newIPOs} new IPOs, ${result.updates} fetched, ${result.skipped} skipped`);
    }

    // Try to resolve tickers for any new EU/UK IPOs
    if (result.created > 0 || result.newIPOs > 0) {
      try {
        await this.runTickerResolution({ limit: 20, delayMs: 500 });
      } catch (e) {
        this.log(`Ticker resolution after IPO check failed: ${e.message}`, 'WARN');
      }
    }

    return result;
  }

  /**
   * Run insider transactions refresh
   * Fetches recent Form 4 filings for tracked companies
   */
  async runInsiderRefresh() {
    const InsiderTracker = require('../services/insiderTracker');
    const SECFilingFetcher = require('../services/secFilingFetcher');
    const db = require('../database');

    const database = db.getDatabase();
    const secFetcher = new SECFilingFetcher();
    const insiderTracker = new InsiderTracker(secFetcher);

    // Get top companies by market cap to check for insider activity
    const companies = database.prepare(`
      SELECT id, symbol, cik
      FROM companies
      WHERE cik IS NOT NULL AND market_cap > 1000000000
      ORDER BY market_cap DESC
      LIMIT 100
    `).all();

    this.log(`Checking insider transactions for ${companies.length} companies...`);

    let processed = 0;
    let updated = 0;

    for (const company of companies) {
      try {
        const result = await insiderTracker.fetchRecentFilings(company.id, company.cik, 7);
        if (result && result.length > 0) {
          updated += result.length;
        }
        processed++;

        // Rate limiting for SEC
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        this.log(`Error fetching insider data for ${company.symbol}: ${error.message}`, 'WARN');
      }
    }

    this.log(`Insider refresh complete: ${processed} companies checked, ${updated} new transactions`);
    return { processed, updated };
  }

  /**
   * Update market indicator history for the current quarter
   * Calculates Buffett Indicator, S&P 500 P/E, MSI, and FRED MSI for recent quarters
   */
  async runMarketIndicatorUpdate() {
    const { HistoricalMarketIndicatorsService } = require('../services/historicalMarketIndicators');
    const { FREDService } = require('../services/dataProviders/fredService');
    const db = require('../database');

    const database = db.getDatabase();
    const service = new HistoricalMarketIndicatorsService(database);
    const fredService = new FREDService();

    // Determine current and previous quarter
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();
    const currentQuarter = `${currentYear}-Q${currentQ}`;

    // Also update previous quarter in case data was incomplete
    const prevQ = currentQ === 1 ? 4 : currentQ - 1;
    const prevYear = currentQ === 1 ? currentYear - 1 : currentYear;
    const prevQuarter = `${prevYear}-Q${prevQ}`;

    this.log(`Updating market indicators for ${prevQuarter} and ${currentQuarter}...`);

    // Fetch latest FRED MSI data (NCBCEPNW series)
    try {
      this.log('  Fetching latest FRED MSI data (NCBCEPNW)...');
      await fredService.fetchAndStoreSeries('NCBCEPNW');
    } catch (error) {
      this.log(`  Warning: Could not fetch FRED MSI: ${error.message}`, 'WARN');
    }

    let updated = 0;
    for (const quarter of [prevQuarter, currentQuarter]) {
      try {
        // Calculate all metrics for the quarter
        const buffett = service.calculateBuffettIndicator(quarter);
        const pe = service.getSP500PEForQuarterTTM(quarter);
        const msi = service.calculateAggregateMSI(quarter);
        const fredMSI = service.getMSIFromFRED(quarter);

        // Upsert into market_indicator_history
        database.prepare(`
          INSERT INTO market_indicator_history (
            quarter, buffett_indicator, buffett_source, sp500_pe, aggregate_msi, fred_msi, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(quarter) DO UPDATE SET
            buffett_indicator = excluded.buffett_indicator,
            buffett_source = excluded.buffett_source,
            sp500_pe = excluded.sp500_pe,
            aggregate_msi = excluded.aggregate_msi,
            fred_msi = excluded.fred_msi,
            updated_at = datetime('now')
        `).run(
          quarter,
          buffett?.value || null,
          buffett?.source || null,
          pe || null,
          msi?.value || null,
          fredMSI?.value || null
        );

        this.log(`  ${quarter}: Buffett=${buffett?.value?.toFixed(2) || 'N/A'}%, P/E=${pe?.toFixed(2) || 'N/A'}, Stock MSI=${msi?.value?.toFixed(3) || 'N/A'}, FRED MSI=${fredMSI?.value?.toFixed(3) || 'N/A'}`);
        updated++;
      } catch (error) {
        this.log(`Error updating ${quarter}: ${error.message}`, 'WARN');
      }
    }

    this.log(`Market indicator update complete: ${updated} quarters updated`);
    return { updated };
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: true,
      runningJobs: Array.from(this.runningJobs),
      recentHistory: this.jobHistory.slice(0, 20),
      scheduledJobs: [
        { name: 'Price Update', schedule: 'Weekdays 6:00 PM ET' },
        { name: 'Price Backfill', schedule: 'Weekends 12:00 PM ET' },
        { name: 'Sentiment Refresh', schedule: 'Every 4 hours' },
        { name: 'Knowledge Base (Incremental)', schedule: 'Mon-Sat 6:00 AM ET' },
        { name: 'Knowledge Base (Full)', schedule: 'Sunday 3:00 AM ET' },
        { name: 'SEC Filing Check', schedule: 'Weekdays 7:00 PM ET' },
        { name: 'EU IPO Prospectus Check (ESMA)', schedule: 'Daily 7:00 AM GMT (2:00 AM ET)' },
        { name: 'UK IPO Prospectus Check (FCA)', schedule: 'Daily 7:30 AM GMT (2:30 AM ET)' },
        { name: 'Dividend Refresh', schedule: 'Sunday 4:00 AM ET' },
        { name: 'Portfolio Dividend Processing', schedule: 'Weekdays 6:30 PM ET' },
        { name: 'ETF Update (Tier 1)', schedule: 'Weekdays 6:30 AM ET' },
        { name: 'ETF Update (Tier 2)', schedule: 'Saturday 8:00 AM ET' },
        { name: 'ETF Tier 3 Promotion', schedule: 'Sunday 7:00 AM ET' },
        { name: '13F Holdings Update', schedule: '15th of Feb/May/Aug/Nov 9 AM ET' },
        { name: '13F Holdings Check', schedule: 'Sunday 8 AM ET' },
        { name: 'Insider Transactions', schedule: 'Weekdays 7:30 PM ET' },
        { name: 'Earnings Calendar', schedule: 'Daily 5 AM ET' },
        { name: 'Agent Signal Scan', schedule: 'Weekdays 10:00 AM & 2:00 PM ET' },
        { name: 'Agent Trade Execution', schedule: 'Market hours every 30 min + 6:45 PM ET' },
        { name: 'EU/UK XBRL Import', schedule: 'Sunday 2:00 AM ET' },
        { name: 'EU/UK Price Update (GB)', schedule: 'Weekdays 12:00 PM ET (5 PM GMT)' },
        { name: 'EU/UK Price Update (EU)', schedule: 'Weekdays 11:30 AM ET (5:30 PM CET)' },
        { name: 'EU/UK Valuation Update', schedule: 'Weekdays 12:30 PM ET' },
        { name: 'European Index Update', schedule: 'Sunday 5:00 AM ET' },
        { name: 'EU/UK Sector Enrichment', schedule: 'Sunday 6:00 AM ET' },
        { name: 'EU/UK Ticker Resolution', schedule: 'Sunday 2:30 AM ET, Tuesday 3:00 AM ET' },
        { name: 'Market Indicator Update', schedule: '1st of Jan/Apr/Jul/Oct 10 AM ET, Sundays 9 AM ET' }
      ]
    };
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    this.log('=' .repeat(60));
    this.log('  Master Scheduler Started');
    this.log('='.repeat(60));
    this.log(`Project root: ${this.projectRoot}`);
    this.log(`Log directory: ${this.logDir}`);
    this.log('');

    // ============================================
    // PRICE UPDATES
    // ============================================

    // Weekdays at 6:00 PM ET - Daily price update
    cron.schedule('0 18 * * 1-5', async () => {
      await this.runJob('Price Update', async () => {
        await this.priceUpdater.runUpdate('update');
      });
    }, { timezone: 'America/New_York' });

    // Weekends at 12:00 PM ET - Backfill
    cron.schedule('0 12 * * 0,6', async () => {
      await this.runJob('Price Backfill', async () => {
        await this.priceUpdater.runUpdate('backfill');
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Price Update (Weekdays 6:00 PM ET)');
    this.log('Scheduled: Price Backfill (Weekends 12:00 PM ET)');

    // ============================================
    // SENTIMENT REFRESH
    // ============================================

    // Every hour - for more timely sentiment signals
    // Previously was every 4 hours, reduced to 1 hour for ML training requirements
    cron.schedule('0 * * * *', async () => {
      await this.runJob('Sentiment Refresh', async () => {
        await this.runSentimentRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Sentiment Refresh (Every hour)');

    // ============================================
    // KNOWLEDGE BASE
    // ============================================

    // Mon-Sat at 6:00 AM ET - Incremental refresh (tech sources)
    cron.schedule('0 6 * * 1-6', async () => {
      await this.runJob('Knowledge Base (Incremental)', async () => {
        await this.knowledgeRefresher.runIncrementalRefresh();
      });
    }, { timezone: 'America/New_York' });

    // Sunday at 3:00 AM ET - Full refresh (all sources)
    cron.schedule('0 3 * * 0', async () => {
      await this.runJob('Knowledge Base (Full)', async () => {
        await this.knowledgeRefresher.runFullRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Knowledge Base Incremental (Mon-Sat 6:00 AM ET)');
    this.log('Scheduled: Knowledge Base Full (Sunday 3:00 AM ET)');

    // ============================================
    // SEC FILING CHECKS
    // ============================================

    // Weekdays at 7:00 PM ET - Check for new filings
    cron.schedule('0 19 * * 1-5', async () => {
      await this.runJob('SEC Filing Check', async () => {
        await this.runSecRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: SEC Filing Check (Weekdays 7:00 PM ET)');

    // ============================================
    // EU/UK IPO PROSPECTUS CHECKS
    // ============================================

    // Daily at 7:00 AM GMT (2:00 AM ET) - ESMA prospectus scan (EU)
    // Runs before European market opens
    cron.schedule('0 2 * * *', async () => {
      await this.runJob('EU IPO Prospectus Check (ESMA)', async () => {
        await this.runEUIPOCheck('esma');
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU IPO Prospectus Check (Daily 7:00 AM GMT / 2:00 AM ET)');

    // Daily at 7:30 AM GMT (2:30 AM ET) - FCA NSM prospectus scan (UK)
    cron.schedule('30 2 * * *', async () => {
      await this.runJob('UK IPO Prospectus Check (FCA)', async () => {
        await this.runEUIPOCheck('fca');
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: UK IPO Prospectus Check (Daily 7:30 AM GMT / 2:30 AM ET)');

    // ============================================
    // DIVIDEND DATA REFRESH
    // ============================================

    // Sunday at 4:00 AM ET - Weekly dividend data refresh (S&P 500)
    cron.schedule('0 4 * * 0', async () => {
      await this.runJob('Dividend Refresh', async () => {
        await this.runDividendRefresh(true);
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Dividend Refresh (Sunday 4:00 AM ET)');

    // ============================================
    // PORTFOLIO DIVIDEND PROCESSING
    // ============================================

    // Weekdays at 6:30 PM ET - Process portfolio dividends (after price update)
    cron.schedule('30 18 * * 1-5', async () => {
      await this.runJob('Portfolio Dividend Processing', async () => {
        await this.processPortfolioDividends();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Portfolio Dividend Processing (Weekdays 6:30 PM ET)');

    // ============================================
    // ETF UPDATES
    // ============================================

    // Weekdays at 6:30 AM ET - Tier 1 (curated) ETF update
    cron.schedule('30 6 * * 1-5', async () => {
      await this.runJob('ETF Update (Tier 1)', async () => {
        await this.etfUpdater.updateTier1();
      });
    }, { timezone: 'America/New_York' });

    // Saturday at 8:00 AM ET - Tier 2 (indexed) ETF update
    cron.schedule('0 8 * * 6', async () => {
      await this.runJob('ETF Update (Tier 2)', async () => {
        await this.etfUpdater.updateTier2();
      });
    }, { timezone: 'America/New_York' });

    // Sunday at 7:00 AM ET - Tier 3 promotion check
    cron.schedule('0 7 * * 0', async () => {
      await this.runJob('ETF Tier 3 Promotion', async () => {
        await this.etfUpdater.promoteTier3();
        await this.etfUpdater.updateIssuerStats();
        this.etfUpdater.cleanupOldLogs();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: ETF Update Tier 1 (Weekdays 6:30 AM ET)');
    this.log('Scheduled: ETF Update Tier 2 (Saturday 8:00 AM ET)');
    this.log('Scheduled: ETF Tier 3 Promotion (Sunday 7:00 AM ET)');

    // ============================================
    // 13F INSTITUTIONAL HOLDINGS
    // ============================================

    // 15th of Feb, May, Aug, Nov at 9 AM ET - Primary 13F filing deadline
    // These are 45 days after quarter end when 13F filings are due
    cron.schedule('0 9 15 2,5,8,11 *', async () => {
      await this.runJob('13F Holdings Update', async () => {
        await this.investor13FRefresher.fetchAll();
      });
    }, { timezone: 'America/New_York' });

    // Weekly fallback check on Sundays at 8 AM ET for any missed filings
    cron.schedule('0 8 * * 0', async () => {
      await this.runJob('13F Holdings Check', async () => {
        await this.investor13FRefresher.fetchAll();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: 13F Holdings Update (15th of Feb/May/Aug/Nov 9 AM ET)');
    this.log('Scheduled: 13F Holdings Check (Sunday 8 AM ET)');

    // ============================================
    // INSIDER TRANSACTIONS
    // ============================================

    // Weekdays at 7:30 PM ET - After market close, check for new Form 4 filings
    cron.schedule('30 19 * * 1-5', async () => {
      await this.runJob('Insider Transactions', async () => {
        await this.runInsiderRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Insider Transactions (Weekdays 7:30 PM ET)');

    // ============================================
    // EARNINGS CALENDAR
    // ============================================

    // Daily at 5 AM ET - Refresh earnings calendar and momentum data
    cron.schedule('0 5 * * *', async () => {
      await this.runJob('Earnings Calendar', async () => {
        await refreshEarnings({ maxCompanies: 200, staleHours: 12 });
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Earnings Calendar (Daily 5 AM ET)');

    // ============================================
    // AGENT SIGNAL SCANNING
    // ============================================

    // Weekdays at 10:00 AM ET - Morning scan after market open
    // Generates trading signals for all active AI agents
    cron.schedule('0 10 * * 1-5', async () => {
      await this.runJob('Agent Signal Scan (Morning)', async () => {
        await this.agentScanner.scanAllAgents();
      });
    }, { timezone: 'America/New_York' });

    // Weekdays at 2:00 PM ET - Mid-day scan
    cron.schedule('0 14 * * 1-5', async () => {
      await this.runJob('Agent Signal Scan (Afternoon)', async () => {
        await this.agentScanner.scanAllAgents();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Agent Signal Scan (Weekdays 10:00 AM & 2:00 PM ET)');

    // ============================================
    // AGENT TRADE EXECUTION
    // ============================================

    // Weekdays every 30 minutes during market hours (10 AM - 4 PM ET)
    // Executes approved agent trades for portfolios with full auto-execution
    cron.schedule('0,30 10-15 * * 1-5', async () => {
      await this.runJob('Agent Trade Execution (Market Hours)', async () => {
        await this.agentExecutor.executeApprovedTrades();
      });
    }, { timezone: 'America/New_York' });

    // Market open at 9:30 AM ET
    cron.schedule('30 9 * * 1-5', async () => {
      await this.runJob('Agent Trade Execution (Market Open)', async () => {
        await this.agentExecutor.executeApprovedTrades();
      });
    }, { timezone: 'America/New_York' });

    // Market close at 4:00 PM ET
    cron.schedule('0 16 * * 1-5', async () => {
      await this.runJob('Agent Trade Execution (Market Close)', async () => {
        await this.agentExecutor.executeApprovedTrades();
      });
    }, { timezone: 'America/New_York' });

    // Post-market at 6:45 PM ET (after price updates and order executor)
    cron.schedule('45 18 * * 1-5', async () => {
      await this.runJob('Agent Trade Execution (Post-Market)', async () => {
        await this.agentExecutor.executeApprovedTrades();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Agent Trade Execution (Market hours + 6:45 PM ET)');

    // ============================================
    // XBRL EU/UK DATA IMPORT
    // ============================================

    // Sunday at 2 AM ET - EU/UK XBRL bulk import (low-traffic period)
    cron.schedule('0 2 * * 0', async () => {
      await this.runJob('EU/UK XBRL Import', async () => {
        await this.runXBRLImport({
          countries: ['GB', 'DE', 'FR', 'NL', 'SE', 'CH', 'ES', 'IT', 'BE', 'DK'],
          startYear: 2021
        });
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK XBRL Import (Sunday 2 AM ET)');

    // ============================================
    // EU/UK PRICE UPDATES
    // ============================================

    // Weekdays at 5:00 PM GMT (12:00 PM ET) - UK market close
    // Updates GB companies after LSE closes
    cron.schedule('0 12 * * 1-5', async () => {
      await this.runJob('EU/UK Price Update (GB)', async () => {
        await this.runEuropeanPriceUpdate(['GB']);
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Price Update GB (Weekdays 12:00 PM ET / 5:00 PM GMT)');

    // Weekdays at 5:30 PM CET (11:30 AM ET) - European market close
    // Updates DE, FR, NL, etc. companies after XETRA/Euronext closes
    cron.schedule('30 11 * * 1-5', async () => {
      await this.runJob('EU/UK Price Update (EU)', async () => {
        // Run for each major EU country
        for (const country of ['DE', 'FR', 'NL', 'CH', 'ES', 'IT']) {
          try {
            await this.runEuropeanPriceUpdate([country]);
          } catch (e) {
            this.log(`Price update failed for ${country}: ${e.message}`, 'WARN');
          }
        }
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Price Update EU (Weekdays 11:30 AM ET / 5:30 PM CET)');

    // ============================================
    // EU/UK VALUATION CALCULATION
    // ============================================

    // Weekdays at 12:30 PM ET - After EU/UK price updates
    cron.schedule('30 12 * * 1-5', async () => {
      await this.runJob('EU/UK Valuation Update', async () => {
        await this.runEuropeanValuationUpdate();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Valuation Update (Weekdays 12:30 PM ET)');

    // ============================================
    // EUROPEAN INDEX CONSTITUENTS
    // ============================================

    // Sunday at 5:00 AM ET - Update FTSE/DAX/CAC constituents weekly
    cron.schedule('0 5 * * 0', async () => {
      await this.runJob('European Index Update', async () => {
        await this.runEuropeanIndexUpdate();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: European Index Update (Sunday 5:00 AM ET)');

    // ============================================
    // EU/UK SECTOR ENRICHMENT
    // ============================================

    // Sunday at 6:00 AM ET - Enrich missing sector/industry data
    cron.schedule('0 6 * * 0', async () => {
      await this.runJob('EU/UK Sector Enrichment', async () => {
        await this.runEuropeanEnrichment();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Sector Enrichment (Sunday 6:00 AM ET)');

    // ============================================
    // EU/UK TICKER RESOLUTION
    // ============================================

    // Sunday at 2:30 AM ET - After XBRL import, resolve tickers for new companies
    // Handles new IPOs and newly imported companies without ticker mappings
    cron.schedule('30 2 * * 0', async () => {
      await this.runJob('EU/UK Ticker Resolution', async () => {
        await this.runTickerResolution({ limit: 100, delayMs: 500 });
      });
    }, { timezone: 'America/New_York' });

    // Also run Tuesday at 3 AM ET for any companies that may have been added mid-week
    cron.schedule('0 3 * * 2', async () => {
      await this.runJob('EU/UK Ticker Resolution (Mid-week)', async () => {
        await this.runTickerResolution({ limit: 50, delayMs: 500 });
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Ticker Resolution (Sunday 2:30 AM ET, Tuesday 3:00 AM ET)');

    // ============================================
    // MARKET INDICATOR UPDATES
    // ============================================

    // 1st of Jan, Apr, Jul, Oct at 10 AM ET - After quarter end, update market indicators
    // These quarters correspond to data for Q4, Q1, Q2, Q3 respectively
    cron.schedule('0 10 1 1,4,7,10 *', async () => {
      await this.runJob('Market Indicator Update', async () => {
        await this.runMarketIndicatorUpdate();
      });
    }, { timezone: 'America/New_York' });

    // Also run weekly on Sundays at 9 AM ET to catch any updates from new data
    cron.schedule('0 9 * * 0', async () => {
      await this.runJob('Market Indicator Update (Weekly)', async () => {
        await this.runMarketIndicatorUpdate();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Market Indicator Update (1st of Jan/Apr/Jul/Oct 10 AM ET, Sundays 9 AM ET)');

    // ============================================
    // HEALTH CHECK
    // ============================================

    // Every hour - log that scheduler is alive
    cron.schedule('0 * * * *', () => {
      this.log('Scheduler heartbeat - all systems operational');
      this.saveStatus();
    });

    this.log('');
    this.log('All jobs scheduled. Press Ctrl+C to stop.');
    this.log('='.repeat(60));

    // Graceful shutdown
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down gracefully...');
      this.saveStatus();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down gracefully...');
      this.saveStatus();
      process.exit(0);
    });
  }

  /**
   * Run all jobs immediately (for testing)
   */
  async runAll() {
    this.log('Running all jobs immediately...');

    await this.runJob('Price Update', async () => {
      await this.priceUpdater.runUpdate('update');
    });

    await this.runJob('Sentiment Refresh', async () => {
      await this.runSentimentRefresh();
    });

    await this.runJob('Knowledge Base (Incremental)', async () => {
      await this.knowledgeRefresher.runIncrementalRefresh();
    });

    await this.runJob('SEC Filing Check', async () => {
      await this.runSecRefresh();
    });

    await this.runJob('13F Holdings Update', async () => {
      await this.investor13FRefresher.fetchAll();
    });

    await this.runJob('Insider Transactions', async () => {
      await this.runInsiderRefresh();
    });

    await this.runJob('Earnings Calendar', async () => {
      await refreshEarnings({ maxCompanies: 200, staleHours: 12 });
    });

    await this.runJob('Agent Signal Scan', async () => {
      await this.agentScanner.scanAllAgents();
    });

    await this.runJob('Agent Trade Execution', async () => {
      await this.agentExecutor.executeApprovedTrades();
    });

    this.log('All jobs completed.');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const scheduler = new MasterScheduler();

  if (args.includes('--status') || args.includes('-s')) {
    const status = scheduler.getStatus();
    console.log('\n' + '='.repeat(50));
    console.log('  Master Scheduler Status');
    console.log('='.repeat(50));

    console.log('\nScheduled Jobs:');
    for (const job of status.scheduledJobs) {
      console.log(`  - ${job.name}: ${job.schedule}`);
    }

    if (status.runningJobs.length > 0) {
      console.log('\nCurrently Running:');
      for (const job of status.runningJobs) {
        console.log(`  - ${job}`);
      }
    }

    if (status.recentHistory.length > 0) {
      console.log('\nRecent History:');
      for (const entry of status.recentHistory.slice(0, 10)) {
        const marker = entry.success ? '✓' : '✗';
        console.log(`  ${marker} ${entry.job} - ${entry.timestamp} (${entry.duration})`);
      }
    }
    console.log('');

  } else if (args.includes('--list') || args.includes('-l')) {
    console.log('\nScheduled Jobs:');
    console.log('  1. Price Update         - Weekdays 6:00 PM ET');
    console.log('  2. Price Backfill       - Weekends 12:00 PM ET');
    console.log('  3. Sentiment Refresh    - Every 4 hours');
    console.log('  4. Knowledge Incremental - Mon-Sat 6:00 AM ET');
    console.log('  5. Knowledge Full       - Sunday 3:00 AM ET');
    console.log('  6. SEC Filing Check     - Weekdays 7:00 PM ET');
    console.log('  7. Dividend Refresh     - Sunday 4:00 AM ET');
    console.log('');

  } else if (args.includes('--run-all')) {
    scheduler.runAll().then(() => process.exit(0)).catch((err) => {
      console.error('Error running all jobs:', err);
      process.exit(1);
    });

  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Master Scheduler - Unified Job Scheduler

Usage:
  node src/jobs/masterScheduler.js [options]

Options:
  (none)          Start the scheduler daemon
  --status, -s    Show status of all scheduled jobs
  --list, -l      List all scheduled jobs and their times
  --run-all       Run all jobs immediately (for testing)
  --help, -h      Show this help message

Jobs:
  - Price Update:          Updates stock prices (weekdays after market close)
  - Price Backfill:        Catches up on missed price updates (weekends)
  - Sentiment Refresh:     Scans Reddit for stock sentiment (hourly)
  - Knowledge Incremental: Updates tech sources in knowledge base (daily)
  - Knowledge Full:        Full knowledge base rebuild (weekly)
  - SEC Filing Check:      Checks for new 10-K/10-Q filings (weekdays)
  - Dividend Refresh:      Updates dividend history and metrics (weekly)
`);

  } else {
    // Start scheduler daemon
    scheduler.start();
  }
}

module.exports = MasterScheduler;
