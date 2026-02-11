/**
 * Price Update Scheduler
 * Runs daily price updates automatically using node-cron
 *
 * Schedule: Every weekday at 6:00 PM ET (after market close)
 *
 * Usage:
 *   node src/jobs/priceUpdateScheduler.js          # Run scheduler daemon
 *   node src/jobs/priceUpdateScheduler.js --now    # Run update immediately
 *   node src/jobs/priceUpdateScheduler.js --status # Check status
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

class PriceUpdateScheduler {
  constructor() {
    this.pythonScript = path.join(__dirname, '../../python-services/price_updater.py');
    this.dbPath = path.join(__dirname, '../../data/stocks.db');
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Run the Python price updater
   */
  runUpdate(command = 'update') {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        reject(new Error('Update already in progress'));
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] Starting price update (${command})...`);
      console.log('='.repeat(60));

      const pythonProcess = spawn('python3', [
        this.pythonScript,
        '--db', this.dbPath,
        command
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      pythonProcess.on('close', (code) => {
        this.isRunning = false;
        this.lastRun = new Date();

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        const result = {
          success: code === 0,
          exitCode: code,
          duration: `${duration} minutes`,
          timestamp: this.lastRun.toISOString(),
          output: stdout,
          errors: stderr
        };

        this.lastResult = result;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${this.lastRun.toISOString()}] Update completed`);
        console.log(`  Exit code: ${code}`);
        console.log(`  Duration: ${duration} minutes`);
        console.log('='.repeat(60) + '\n');

        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      pythonProcess.on('error', (error) => {
        this.isRunning = false;
        reject(error);
      });
    });
  }

  /**
   * Get current status
   */
  async getStatus() {
    const database = await getDatabaseAsync();
    const isPostgres = isUsingPostgres();
    const freshCutoff1d = isPostgres
      ? `CURRENT_DATE - INTERVAL '1 day'`
      : `date('now', '-1 day')`;
    const freshCutoff3d = isPostgres
      ? `CURRENT_DATE - INTERVAL '3 days'`
      : `date('now', '-3 days')`;

    // Get update stats
    const statsResult = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_price_update >= ${freshCutoff1d} THEN 1 ELSE 0 END) as fresh_1d,
        SUM(CASE WHEN last_price_update >= ${freshCutoff3d} THEN 1 ELSE 0 END) as fresh_3d
      FROM companies
      WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
    `);
    const stats = statsResult.rows[0];

    // Get last log entry
    const lastLogResult = await database.query(`
      SELECT * FROM price_update_log
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const lastLog = lastLogResult.rows[0];

    return {
      scheduler: {
        isRunning: this.isRunning,
        lastRun: this.lastRun?.toISOString() || null,
        lastResult: this.lastResult ? {
          success: this.lastResult.success,
          duration: this.lastResult.duration
        } : null
      },
      database: {
        totalCompanies: stats.total,
        freshWithin1Day: stats.fresh_1d,
        freshWithin3Days: stats.fresh_3d,
        freshness: `${((stats.fresh_1d / stats.total) * 100).toFixed(1)}%`
      },
      lastDatabaseLog: lastLog || null
    };
  }

  /**
   * Start the scheduler
   * Runs at 6:00 PM ET (23:00 UTC in winter, 22:00 UTC in summer)
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Price Update Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule: Weekdays at 6:00 PM ET (after market close)');
    console.log('  Cron: "0 18 * * 1-5" (America/New_York)');
    console.log('='.repeat(60) + '\n');

    // Schedule: 6:00 PM ET, Monday-Friday
    // node-cron supports timezone
    const task = cron.schedule('0 18 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled update triggered`);

      try {
        await this.runUpdate('update');
        console.log('Scheduled update completed successfully');
      } catch (error) {
        console.error('Scheduled update failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Also run backfill on weekends to catch up
    const backfillTask = cron.schedule('0 12 * * 0,6', async () => {
      console.log(`\n[${new Date().toISOString()}] Weekend backfill triggered`);

      try {
        await this.runUpdate('backfill');
        console.log('Weekend backfill completed successfully');
      } catch (error) {
        console.error('Weekend backfill failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Print next scheduled runs
    console.log('Next scheduled runs:');
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const next = new Date(now);
      next.setDate(next.getDate() + i);
      if (next.getDay() !== 0 && next.getDay() !== 6) {
        next.setHours(18, 0, 0, 0);
        if (next > now) {
          console.log(`  - ${next.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
          })}`);
        }
      }
    }
    console.log('\nScheduler running. Press Ctrl+C to stop.\n');

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nScheduler stopped.');
      task.stop();
      backfillTask.stop();
      process.exit(0);
    });
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const scheduler = new PriceUpdateScheduler();

  if (args.includes('--now') || args.includes('-n')) {
    // Run immediately
    scheduler.runUpdate('update')
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Update failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--backfill') || args.includes('-b')) {
    // Run backfill
    scheduler.runUpdate('backfill')
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Backfill failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--status') || args.includes('-s')) {
    // Show status
    scheduler.getStatus().then(status => {
      console.log('\n' + '='.repeat(50));
      console.log('  Price Update Status');
      console.log('='.repeat(50));
      console.log('\nDatabase:');
      console.log(`  Total companies: ${status.database.totalCompanies}`);
      console.log(`  Fresh (1 day):   ${status.database.freshWithin1Day} (${status.database.freshness})`);
      console.log(`  Fresh (3 days):  ${status.database.freshWithin3Days}`);
      if (status.lastDatabaseLog) {
        console.log('\nLast update log:');
        console.log(`  Time:     ${status.lastDatabaseLog.created_at}`);
        console.log(`  Updated:  ${status.lastDatabaseLog.companies_updated}`);
        console.log(`  Errors:   ${status.lastDatabaseLog.errors}`);
      }
      console.log('');
    }).catch(err => {
      console.error('Status check failed:', err.message);
      process.exit(1);
    });
  } else if (args.includes('--dry-run') || args.includes('-d')) {
    // Dry run
    scheduler.runUpdate('dry-run')
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Dry run failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Price Update Scheduler

Usage:
  node src/jobs/priceUpdateScheduler.js [options]

Options:
  (none)        Start the scheduler daemon (runs daily at 6 PM ET)
  --now, -n     Run price update immediately
  --backfill, -b  Run backfill for stale companies
  --dry-run, -d   Preview what would be updated
  --status, -s    Show current update status
  --help, -h      Show this help message

Schedule:
  - Weekdays at 6:00 PM ET: Full daily update
  - Weekends at 12:00 PM ET: Backfill for stale companies
`);
  } else {
    // Start scheduler daemon
    scheduler.start();
  }
}

module.exports = PriceUpdateScheduler;
