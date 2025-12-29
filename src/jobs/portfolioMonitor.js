/**
 * Portfolio Monitor Scheduler
 * Checks portfolio alert conditions after price updates
 *
 * Schedule: Every weekday at 6:35 PM ET (after order executor completes at 6:30 PM)
 *
 * Usage:
 *   node src/jobs/portfolioMonitor.js          # Run scheduler daemon
 *   node src/jobs/portfolioMonitor.js --now    # Run check immediately
 *   node src/jobs/portfolioMonitor.js --status # Check status
 */

const cron = require('node-cron');
const db = require('../database');
const { getPortfolioService } = require('../services/portfolio');

class PortfolioMonitor {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Check all portfolio alerts
   */
  checkAlerts() {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        reject(new Error('Alert check already in progress'));
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] Checking portfolio alerts...`);
      console.log('='.repeat(60));

      try {
        const database = db.getDatabase();
        const portfolioService = getPortfolioService(database);

        // Check all portfolio alerts
        console.log('\nChecking all portfolios for alert conditions...');
        const result = portfolioService.checkAllPortfolioAlerts();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\nResults:`);
        console.log(`  Portfolios checked: ${result.checked}`);
        console.log(`  Successful: ${result.successful}`);
        console.log(`  Total alerts triggered: ${result.totalAlerts}`);

        if (result.totalAlerts > 0) {
          console.log('\nTriggered alerts by portfolio:');
          for (const portfolio of result.results) {
            if (portfolio.alertsTriggered > 0) {
              console.log(`\n  ${portfolio.name} (ID: ${portfolio.portfolioId}):`);
              for (const alert of portfolio.alerts) {
                console.log(`    [${alert.severity.toUpperCase()}] ${alert.message}`);
              }
            }
          }
        }

        // Report any errors
        const errors = result.results.filter(r => !r.success);
        if (errors.length > 0) {
          console.log('\nErrors:');
          for (const err of errors) {
            console.log(`  - ${err.name} (ID: ${err.portfolioId}): ${err.error}`);
          }
        }

        this.isRunning = false;
        this.lastRun = new Date();
        this.lastResult = {
          success: true,
          duration: `${duration} seconds`,
          timestamp: this.lastRun.toISOString(),
          ...result
        };

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${this.lastRun.toISOString()}] Alert check completed`);
        console.log(`  Duration: ${duration} seconds`);
        console.log('='.repeat(60) + '\n');

        resolve(this.lastResult);
      } catch (error) {
        this.isRunning = false;
        this.lastRun = new Date();
        this.lastResult = {
          success: false,
          error: error.message,
          timestamp: this.lastRun.toISOString()
        };

        console.error(`\nError during alert check: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    const database = db.getDatabase();

    // Get portfolio count
    const portfolioCount = database.prepare(`
      SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 0
    `).get();

    // Get alert counts by type
    const alertCounts = database.prepare(`
      SELECT
        alert_type,
        COUNT(*) as count,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM portfolio_alerts
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY alert_type
    `).all();

    // Get total unread
    const totalUnread = database.prepare(`
      SELECT COUNT(*) as count FROM portfolio_alerts WHERE is_read = 0
    `).get();

    // Get recent alerts
    const recentAlerts = database.prepare(`
      SELECT pa.*, p.name as portfolio_name
      FROM portfolio_alerts pa
      JOIN portfolios p ON pa.portfolio_id = p.id
      WHERE pa.created_at >= datetime('now', '-24 hours')
      ORDER BY pa.created_at DESC
      LIMIT 10
    `).all();

    return {
      scheduler: {
        isRunning: this.isRunning,
        lastRun: this.lastRun?.toISOString() || null,
        lastResult: this.lastResult ? {
          success: this.lastResult.success,
          duration: this.lastResult.duration,
          checked: this.lastResult.checked,
          alertsTriggered: this.lastResult.totalAlerts
        } : null
      },
      portfolios: portfolioCount.count,
      alerts: {
        totalUnread: totalUnread.count,
        last7DaysByType: alertCounts.reduce((acc, row) => {
          acc[row.alert_type] = { total: row.count, unread: row.unread };
          return acc;
        }, {})
      },
      recentAlerts: recentAlerts.map(a => ({
        id: a.id,
        portfolio: a.portfolio_name,
        type: a.alert_type,
        severity: a.severity,
        message: a.message,
        createdAt: a.created_at,
        isRead: a.is_read === 1
      }))
    };
  }

  /**
   * Start the scheduler
   * Runs at 6:35 PM ET (after order executor completes at 6:30 PM)
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Portfolio Monitor Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule: Weekdays at 6:35 PM ET (after order executor)');
    console.log('  Cron: "35 18 * * 1-5" (America/New_York)');
    console.log('='.repeat(60) + '\n');

    // Schedule: 6:35 PM ET, Monday-Friday
    const task = cron.schedule('35 18 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled alert check triggered`);

      try {
        await this.checkAlerts();
        console.log('Scheduled alert check completed successfully');
      } catch (error) {
        console.error('Scheduled alert check failed:', error.message);
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
        next.setHours(18, 35, 0, 0);
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

    // Display status on startup
    const status = this.getStatus();
    console.log('Current status:');
    console.log(`  Active portfolios: ${status.portfolios}`);
    console.log(`  Unread alerts: ${status.alerts.totalUnread}`);
    if (Object.keys(status.alerts.last7DaysByType).length > 0) {
      console.log('  Alerts (last 7 days) by type:');
      for (const [type, data] of Object.entries(status.alerts.last7DaysByType)) {
        console.log(`    - ${type}: ${data.total} (${data.unread} unread)`);
      }
    }
    console.log('');

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nScheduler stopped.');
      task.stop();
      process.exit(0);
    });
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const monitor = new PortfolioMonitor();

  if (args.includes('--now') || args.includes('-n')) {
    // Run immediately
    monitor.checkAlerts()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Alert check failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--status') || args.includes('-s')) {
    // Show status
    const status = monitor.getStatus();
    console.log('\n' + '='.repeat(50));
    console.log('  Portfolio Monitor Status');
    console.log('='.repeat(50));
    console.log('\nPortfolios: ' + status.portfolios);
    console.log('\nAlerts:');
    console.log(`  Total Unread: ${status.alerts.totalUnread}`);
    if (Object.keys(status.alerts.last7DaysByType).length > 0) {
      console.log('  Last 7 Days by Type:');
      for (const [type, data] of Object.entries(status.alerts.last7DaysByType)) {
        console.log(`    - ${type}: ${data.total} total, ${data.unread} unread`);
      }
    }
    if (status.recentAlerts.length > 0) {
      console.log('\nRecent Alerts (24h):');
      for (const alert of status.recentAlerts) {
        const readIndicator = alert.isRead ? '✓' : '•';
        console.log(`  ${readIndicator} [${alert.severity.toUpperCase()}] ${alert.portfolio}: ${alert.message}`);
        console.log(`    Type: ${alert.type}, Time: ${alert.createdAt}`);
      }
    }
    if (status.scheduler.lastRun) {
      console.log('\nLast Run:');
      console.log(`  Time: ${status.scheduler.lastRun}`);
      console.log(`  Duration: ${status.scheduler.lastResult?.duration || 'N/A'}`);
      console.log(`  Checked: ${status.scheduler.lastResult?.checked || 0}`);
      console.log(`  Alerts Triggered: ${status.scheduler.lastResult?.alertsTriggered || 0}`);
    }
    console.log('');
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Portfolio Monitor Scheduler

Usage:
  node src/jobs/portfolioMonitor.js [options]

Options:
  (none)        Start the scheduler daemon (runs daily at 6:35 PM ET)
  --now, -n     Run alert check immediately
  --status, -s  Show current alert status
  --help, -h    Show this help message

Schedule:
  - Weekdays at 6:35 PM ET: Check all portfolio alert conditions

Alert Types Monitored:
  - drawdown_threshold:     Portfolio drops X% from high
  - position_concentration: Single position exceeds X% of portfolio
  - daily_gain:             Portfolio gains X% in a day
  - daily_loss:             Portfolio loses X% in a day
  - new_high:               Portfolio reaches new all-time high
  - cash_low:               Cash balance drops below threshold
`);
  } else {
    // Start scheduler daemon
    monitor.start();
  }
}

module.exports = PortfolioMonitor;
