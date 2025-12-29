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

// Import individual job modules
const PriceUpdateScheduler = require('./priceUpdateScheduler');
const KnowledgeBaseRefresh = require('./knowledgeBaseRefresh');
const { getETFUpdateScheduler } = require('./etfUpdateScheduler');

class MasterScheduler {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.logDir = path.join(this.projectRoot, 'logs');
    this.statusFile = path.join(this.projectRoot, 'data/scheduler_status.json');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Initialize job instances
    this.priceUpdater = new PriceUpdateScheduler();
    this.knowledgeRefresher = new KnowledgeBaseRefresh();
    this.etfUpdater = getETFUpdateScheduler();

    // Track running jobs
    this.runningJobs = new Set();
    this.jobHistory = [];

    // Load existing status
    this.loadStatus();
  }

  /**
   * Log message with timestamp
   */
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    console.log(logLine);

    // Also write to log file
    const logFile = path.join(this.logDir, `scheduler-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logLine + '\n');
  }

  /**
   * Load status from file
   */
  loadStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        this.jobHistory = data.history || [];
      }
    } catch (e) {
      this.log(`Could not load status: ${e.message}`, 'WARN');
    }
  }

  /**
   * Save status to file
   */
  saveStatus() {
    try {
      const status = {
        lastUpdated: new Date().toISOString(),
        runningJobs: Array.from(this.runningJobs),
        history: this.jobHistory.slice(0, 100) // Keep last 100 entries
      };
      fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2));
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
   * Run a job with tracking
   */
  async runJob(jobName, jobFn) {
    if (this.runningJobs.has(jobName)) {
      this.log(`${jobName} is already running, skipping`, 'WARN');
      return;
    }

    this.runningJobs.add(jobName);
    this.saveStatus();

    const startTime = Date.now();
    this.log(`Starting ${jobName}...`);

    try {
      await jobFn();
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      this.log(`${jobName} completed successfully (${duration} min)`);
      this.recordJobRun(jobName, true, `${duration} min`);
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      this.log(`${jobName} failed: ${error.message}`, 'ERROR');
      this.recordJobRun(jobName, false, `${duration} min`, error.message);
    } finally {
      this.runningJobs.delete(jobName);
      this.saveStatus();
    }
  }

  /**
   * Run sentiment refresh job
   */
  async runSentimentRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'sentimentRefresh.js');
      const child = spawn('node', [script], {
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
          reject(new Error(`Sentiment refresh failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run SEC refresh job
   */
  async runSecRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'secDirectRefresh.js');
      const child = spawn('node', [script], {
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
          reject(new Error(`SEC refresh failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
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
        { name: 'ETF Update (Tier 1)', schedule: 'Weekdays 6:30 AM ET' },
        { name: 'ETF Update (Tier 2)', schedule: 'Saturday 8:00 AM ET' },
        { name: 'ETF Tier 3 Promotion', schedule: 'Sunday 7:00 AM ET' }
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

    // Every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      await this.runJob('Sentiment Refresh', async () => {
        await this.runSentimentRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Sentiment Refresh (Every 4 hours)');

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
  - Sentiment Refresh:     Scans Reddit for stock sentiment (every 4 hours)
  - Knowledge Incremental: Updates tech sources in knowledge base (daily)
  - Knowledge Full:        Full knowledge base rebuild (weekly)
  - SEC Filing Check:      Checks for new 10-K/10-Q filings (weekdays)
`);

  } else {
    // Start scheduler daemon
    scheduler.start();
  }
}

module.exports = MasterScheduler;
