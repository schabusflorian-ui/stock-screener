/**
 * Order Executor Scheduler
 * Checks and executes standing orders (stop loss, limit, trailing stop) after price updates
 *
 * Schedule: Every weekday at 6:30 PM ET (after price updates complete)
 *
 * Usage:
 *   node src/jobs/orderExecutor.js          # Run scheduler daemon
 *   node src/jobs/orderExecutor.js --now    # Run check immediately
 *   node src/jobs/orderExecutor.js --status # Check status
 */

const cron = require('node-cron');
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');
const { getPortfolioService } = require('../services/portfolio');

class OrderExecutor {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Check and execute all pending orders
   */
  async checkOrders() {
    if (this.isRunning) {
      throw new Error('Order check already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] Checking and executing orders...`);
    console.log('='.repeat(60));

    try {
      const portfolioService = getPortfolioService();

      // Update trailing stops first (track new highs)
      console.log('\nUpdating trailing stops...');
      const trailingResult = await portfolioService.orderEngine.updateTrailingStops();
      console.log(`  Trailing orders checked: ${trailingResult.trailingOrdersChecked}`);
      console.log(`  Trailing stops updated: ${trailingResult.updated}`);

      // Check and execute orders
      console.log('\nChecking order triggers...');
      const result = await portfolioService.checkAndExecuteOrders();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\nResults:');
      console.log(`  Orders checked: ${result.checked}`);
      console.log(`  Orders triggered: ${result.triggered}`);

      if (result.triggeredOrders.length > 0) {
        console.log('\nTriggered orders:');
        for (const order of result.triggeredOrders) {
          console.log(`  - ${order.symbol}: ${order.orderType} at $${order.triggeredPrice.toFixed(2)}`);
          if (order.result.realizedPnl !== undefined) {
            const pnlSign = order.result.realizedPnl >= 0 ? '+' : '';
            console.log(`    Realized P&L: ${pnlSign}$${order.result.realizedPnl.toFixed(2)}`);
          }
        }
      }

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  - ${error.symbol} (Order #${error.orderId}): ${error.error}`);
        }
      }

      this.lastRun = new Date();
      this.lastResult = {
        success: true,
        duration: `${duration} seconds`,
        timestamp: this.lastRun.toISOString(),
        ...result
      };

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${this.lastRun.toISOString()}] Order check completed`);
      console.log(`  Duration: ${duration} seconds`);
      console.log('='.repeat(60) + '\n');

      return this.lastResult;
    } catch (error) {
      this.lastRun = new Date();
      this.lastResult = {
        success: false,
        error: error.message,
        timestamp: this.lastRun.toISOString()
      };

      console.error(`\nError during order check: ${error.message}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get current status
   */
  async getStatus() {
    const database = await getDatabaseAsync();
    const isPostgres = isUsingPostgres();
    const recentCutoff = isPostgres
      ? `CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      : `datetime('now', '-24 hours')`;

    // Get active orders count by type
    const orderStatsResult = await database.query(`
      SELECT
        order_type,
        COUNT(*) as count
      FROM portfolio_orders
      WHERE status = 'active'
      GROUP BY order_type
    `);
    const orderStats = orderStatsResult.rows;

    // Get recently triggered orders
    const recentlyTriggeredResult = await database.query(`
      SELECT po.*, c.symbol, p.name as portfolio_name
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      JOIN portfolios p ON po.portfolio_id = p.id
      WHERE po.status = 'triggered'
        AND po.triggered_at >= ${recentCutoff}
      ORDER BY po.triggered_at DESC
      LIMIT 10
    `);
    const recentlyTriggered = recentlyTriggeredResult.rows;

    // Get total portfolio count
    const portfolioCountResult = await database.query(`
      SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 0
    `);
    const portfolioCount = portfolioCountResult.rows[0];

    return {
      scheduler: {
        isRunning: this.isRunning,
        lastRun: this.lastRun?.toISOString() || null,
        lastResult: this.lastResult ? {
          success: this.lastResult.success,
          duration: this.lastResult.duration,
          triggered: this.lastResult.triggered,
          checked: this.lastResult.checked
        } : null
      },
      orders: {
        activeByType: orderStats.reduce((acc, row) => {
          acc[row.order_type] = row.count;
          return acc;
        }, {}),
        totalActive: orderStats.reduce((sum, row) => sum + row.count, 0)
      },
      recentlyTriggered: recentlyTriggered.map(o => ({
        orderId: o.id,
        portfolio: o.portfolio_name,
        symbol: o.symbol,
        type: o.order_type,
        triggeredAt: o.triggered_at,
        triggeredPrice: o.triggered_price
      })),
      portfolios: portfolioCount.count
    };
  }

  /**
   * Start the scheduler
   * Runs at 6:30 PM ET (after price updates complete at 6:00 PM)
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Order Executor Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule: Weekdays at 6:30 PM ET (after price updates)');
    console.log('  Cron: "30 18 * * 1-5" (America/New_York)');
    console.log('='.repeat(60) + '\n');

    // Schedule: 6:30 PM ET, Monday-Friday
    const task = cron.schedule('30 18 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled order check triggered`);

      try {
        await this.checkOrders();
        console.log('Scheduled order check completed successfully');
      } catch (error) {
        console.error('Scheduled order check failed:', error.message);
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
        next.setHours(18, 30, 0, 0);
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
    this.getStatus().then(status => {
      console.log('Current status:');
      console.log(`  Active portfolios: ${status.portfolios}`);
      console.log(`  Active orders: ${status.orders.totalActive}`);
      if (Object.keys(status.orders.activeByType).length > 0) {
        console.log('  By type:');
        for (const [type, count] of Object.entries(status.orders.activeByType)) {
          console.log(`    - ${type}: ${count}`);
        }
      }
      console.log('');
    }).catch(err => {
      console.error('Status load failed:', err.message);
    });

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
  const executor = new OrderExecutor();

  if (args.includes('--now') || args.includes('-n')) {
    // Run immediately
    executor.checkOrders()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Order check failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--status') || args.includes('-s')) {
    // Show status
    executor.getStatus().then(status => {
      console.log('\n' + '='.repeat(50));
      console.log('  Order Executor Status');
      console.log('='.repeat(50));
      console.log('\nPortfolios: ' + status.portfolios);
      console.log('\nActive Orders:');
      console.log(`  Total: ${status.orders.totalActive}`);
      if (Object.keys(status.orders.activeByType).length > 0) {
        for (const [type, count] of Object.entries(status.orders.activeByType)) {
          console.log(`  - ${type}: ${count}`);
        }
      }
      if (status.recentlyTriggered.length > 0) {
        console.log('\nRecently Triggered (24h):');
        for (const order of status.recentlyTriggered) {
          console.log(`  - ${order.symbol} (${order.portfolio}): ${order.type} at $${order.triggeredPrice}`);
          console.log(`    Triggered: ${order.triggeredAt}`);
        }
      }
      if (status.scheduler.lastRun) {
        console.log('\nLast Run:');
        console.log(`  Time: ${status.scheduler.lastRun}`);
        console.log(`  Duration: ${status.scheduler.lastResult?.duration || 'N/A'}`);
        console.log(`  Checked: ${status.scheduler.lastResult?.checked || 0}`);
        console.log(`  Triggered: ${status.scheduler.lastResult?.triggered || 0}`);
      }
      console.log('');
    }).catch(err => {
      console.error('Status check failed:', err.message);
      process.exit(1);
    });
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Order Executor Scheduler

Usage:
  node src/jobs/orderExecutor.js [options]

Options:
  (none)        Start the scheduler daemon (runs daily at 6:30 PM ET)
  --now, -n     Run order check immediately
  --status, -s  Show current order status
  --help, -h    Show this help message

Schedule:
  - Weekdays at 6:30 PM ET: Check and execute orders after price updates

Order Types Supported:
  - stop_loss:     Sell when price drops to/below trigger
  - take_profit:   Sell when price rises to/above trigger
  - limit_buy:     Buy when price drops to/below limit
  - limit_sell:    Sell when price rises to/above limit
  - trailing_stop: Dynamic stop that follows price up
`);
  } else {
    // Start scheduler daemon
    executor.start();
  }
}

module.exports = OrderExecutor;
