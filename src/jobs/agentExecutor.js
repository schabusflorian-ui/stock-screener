/**
 * Agent Trade Executor Scheduler
 * Automatically executes approved agent trades for portfolios with auto-execution enabled
 *
 * This job completes the agent trading flow:
 * 1. Agent generates signals → 2. Signals auto-approved (if enabled) → 3. THIS JOB executes approved trades
 *
 * Schedule: Every 30 minutes during market hours (9:30 AM - 4:00 PM ET weekdays)
 *           Also runs at 6:45 PM ET after price updates complete
 *
 * Usage:
 *   node src/jobs/agentExecutor.js          # Run scheduler daemon
 *   node src/jobs/agentExecutor.js --now    # Run execution immediately
 *   node src/jobs/agentExecutor.js --status # Check status
 */

const cron = require('node-cron');
const db = require('../database');
const { AutoExecutor } = require('../services/agent/autoExecutor');

class AgentExecutor {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Execute all approved trades for auto-execution portfolios
   */
  executeApprovedTrades() {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        reject(new Error('Execution already in progress'));
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] Executing approved agent trades...`);
      console.log('='.repeat(60));

      try {
        const database = db.getDatabase();
        const executor = new AutoExecutor(database);

        // First, expire any old pending executions (older than 24 hours)
        console.log('\nExpiring old pending executions...');
        const expireResult = executor.expireOldExecutions();
        console.log(`  Expired: ${expireResult.expired}`);

        // Get portfolios linked to agents with auto-execution enabled
        // Use AGENT's require_confirmation setting (not portfolio's) to avoid dual-gate confusion
        const autoExecPortfolios = database.prepare(`
          SELECT DISTINCT
            p.id,
            p.name,
            ta.auto_execute,
            ta.require_confirmation,
            ta.name as agent_name,
            ta.id as agent_id
          FROM portfolios p
          INNER JOIN agent_portfolios ap ON ap.portfolio_id = p.id
          INNER JOIN trading_agents ta ON ta.id = ap.agent_id
          WHERE ta.auto_execute = 1
            AND ta.require_confirmation = 0
            AND p.is_archived = 0
            AND ta.status != 'paused'
        `).all();

        console.log(`\nFound ${autoExecPortfolios.length} portfolios with full auto-execution enabled`);

        // Get all approved executions waiting to be executed
        const approvedExecutions = executor.getApprovedExecutions();
        console.log(`Found ${approvedExecutions.length} approved executions waiting`);

        if (approvedExecutions.length === 0) {
          console.log('No approved trades to execute.');

          this.isRunning = false;
          this.lastRun = new Date();
          this.lastResult = {
            success: true,
            duration: `${((Date.now() - startTime) / 1000).toFixed(2)} seconds`,
            timestamp: this.lastRun.toISOString(),
            executed: 0,
            failed: 0,
            skipped: 0,
            totalValue: 0,
            results: []
          };

          console.log(`\n${'='.repeat(60)}`);
          console.log(`[${this.lastRun.toISOString()}] Execution check completed (no trades)`);
          console.log('='.repeat(60) + '\n');

          resolve(this.lastResult);
          return;
        }

        // Filter to only execute trades for auto-exec portfolios
        const autoExecPortfolioIds = new Set(autoExecPortfolios.map(p => p.id));
        const tradesToExecute = approvedExecutions.filter(e => autoExecPortfolioIds.has(e.portfolio_id));
        const skippedTrades = approvedExecutions.filter(e => !autoExecPortfolioIds.has(e.portfolio_id));

        console.log(`\nTrades to execute automatically: ${tradesToExecute.length}`);
        console.log(`Trades skipped (manual confirmation required): ${skippedTrades.length}`);

        if (skippedTrades.length > 0) {
          console.log('\nSkipped trades (require manual confirmation):');
          for (const trade of skippedTrades.slice(0, 5)) {
            console.log(`  - ${trade.symbol} ${trade.action} (Portfolio: ${trade.portfolio_name})`);
          }
          if (skippedTrades.length > 5) {
            console.log(`  ... and ${skippedTrades.length - 5} more`);
          }
        }

        // Execute the trades
        const results = [];
        let executed = 0;
        let failed = 0;
        let totalValue = 0;

        for (const trade of tradesToExecute) {
          console.log(`\nExecuting: ${trade.symbol} ${trade.action} x${trade.shares} @ $${trade.estimated_price}`);
          console.log(`  Portfolio: ${trade.portfolio_name} (ID: ${trade.portfolio_id})`);

          try {
            const result = executor.executeApprovedTrade(trade.id);

            if (result.success) {
              executed++;
              totalValue += result.trade?.value || 0;
              console.log(`  ✓ Success: ${result.trade?.shares} shares @ $${result.trade?.price?.toFixed(2)}`);
              console.log(`    Transaction ID: ${result.trade?.transactionId}`);
            } else {
              failed++;
              console.log(`  ✗ Failed: ${result.error}`);
            }

            results.push({
              executionId: trade.id,
              symbol: trade.symbol,
              action: trade.action,
              portfolio: trade.portfolio_name,
              ...result
            });
          } catch (error) {
            failed++;
            console.log(`  ✗ Error: ${error.message}`);
            results.push({
              executionId: trade.id,
              symbol: trade.symbol,
              action: trade.action,
              portfolio: trade.portfolio_name,
              success: false,
              error: error.message
            });
          }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '-'.repeat(40));
        console.log('Summary:');
        console.log(`  Executed successfully: ${executed}`);
        console.log(`  Failed: ${failed}`);
        console.log(`  Skipped (manual): ${skippedTrades.length}`);
        console.log(`  Total value traded: $${totalValue.toFixed(2)}`);

        this.isRunning = false;
        this.lastRun = new Date();
        this.lastResult = {
          success: true,
          duration: `${duration} seconds`,
          timestamp: this.lastRun.toISOString(),
          executed,
          failed,
          skipped: skippedTrades.length,
          totalValue,
          results
        };

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${this.lastRun.toISOString()}] Execution completed`);
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

        console.error(`\nError during execution: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    const database = db.getDatabase();

    // Get portfolios with auto-execution enabled (via agent settings)
    const autoExecPortfolios = database.prepare(`
      SELECT DISTINCT
        p.id,
        p.name,
        ta.auto_execute,
        ta.require_confirmation,
        ta.name as agent_name
      FROM portfolios p
      INNER JOIN agent_portfolios ap ON ap.portfolio_id = p.id
      INNER JOIN trading_agents ta ON ta.id = ap.agent_id
      WHERE ta.auto_execute = 1
        AND p.is_archived = 0
    `).all();

    // Get pending execution counts by status
    const executionStats = database.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(estimated_value) as total_value
      FROM pending_executions
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY status
    `).all();

    // Get recent executions
    const recentExecutions = database.prepare(`
      SELECT
        pe.*,
        c.symbol,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.status = 'executed'
        AND pe.executed_at >= datetime('now', '-24 hours')
      ORDER BY pe.executed_at DESC
      LIMIT 10
    `).all();

    // Get approved waiting to execute
    const approvedWaiting = database.prepare(`
      SELECT
        pe.*,
        c.symbol,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.status = 'approved'
      ORDER BY pe.created_at DESC
      LIMIT 10
    `).all();

    return {
      scheduler: {
        isRunning: this.isRunning,
        lastRun: this.lastRun?.toISOString() || null,
        lastResult: this.lastResult ? {
          success: this.lastResult.success,
          duration: this.lastResult.duration,
          executed: this.lastResult.executed,
          failed: this.lastResult.failed,
          skipped: this.lastResult.skipped
        } : null
      },
      portfolios: {
        autoExecuteEnabled: autoExecPortfolios.length,
        fullAutoExec: autoExecPortfolios.filter(p => !p.require_confirmation).length,
        withConfirmation: autoExecPortfolios.filter(p => p.require_confirmation).length,
        list: autoExecPortfolios.map(p => ({
          id: p.id,
          name: p.name,
          agent: p.agent_name,
          requiresConfirmation: !!p.require_confirmation
        }))
      },
      executions: {
        byStatus: executionStats.reduce((acc, row) => {
          acc[row.status] = { count: row.count, value: row.total_value || 0 };
          return acc;
        }, {}),
        approvedWaiting: approvedWaiting.map(e => ({
          id: e.id,
          symbol: e.symbol,
          action: e.action,
          shares: e.shares,
          price: e.estimated_price,
          portfolio: e.portfolio_name,
          createdAt: e.created_at
        })),
        recentlyExecuted: recentExecutions.map(e => ({
          id: e.id,
          symbol: e.symbol,
          action: e.action,
          shares: e.executed_shares,
          price: e.executed_price,
          portfolio: e.portfolio_name,
          executedAt: e.executed_at
        }))
      }
    };
  }

  /**
   * Start the scheduler
   * Runs every 30 minutes during market hours and after market close
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Agent Trade Executor Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule:');
    console.log('    - Every 30 min during market hours (9:30 AM - 4:00 PM ET)');
    console.log('    - After market close at 6:45 PM ET');
    console.log('='.repeat(60) + '\n');

    // Schedule: Every 30 minutes during market hours (9:30 AM - 4:00 PM ET), weekdays
    // Run at :00 and :30 of each hour from 10 AM to 4 PM
    cron.schedule('0,30 10-15 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled execution check (market hours)`);
      try {
        await this.executeApprovedTrades();
      } catch (error) {
        console.error('Scheduled execution failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Also run at 9:30 AM (market open) and 4:00 PM (market close)
    cron.schedule('30 9 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled execution check (market open)`);
      try {
        await this.executeApprovedTrades();
      } catch (error) {
        console.error('Scheduled execution failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    cron.schedule('0 16 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled execution check (market close)`);
      try {
        await this.executeApprovedTrades();
      } catch (error) {
        console.error('Scheduled execution failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Schedule: 6:45 PM ET (after price updates at 6 PM and order executor at 6:30 PM)
    cron.schedule('45 18 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled execution check (post-market)`);
      try {
        await this.executeApprovedTrades();
      } catch (error) {
        console.error('Scheduled execution failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Print next scheduled runs
    console.log('Schedule overview:');
    console.log('  Market hours (Mon-Fri): Every 30 min from 9:30 AM to 4:00 PM ET');
    console.log('  Post-market (Mon-Fri): 6:45 PM ET');
    console.log('\nScheduler running. Press Ctrl+C to stop.\n');

    // Display status on startup
    const status = this.getStatus();
    console.log('Current status:');
    console.log(`  Portfolios with auto-execute: ${status.portfolios.autoExecuteEnabled}`);
    console.log(`    - Full auto (no confirmation): ${status.portfolios.fullAutoExec}`);
    console.log(`    - With confirmation required: ${status.portfolios.withConfirmation}`);

    if (status.executions.approvedWaiting.length > 0) {
      console.log(`\n  Approved trades waiting: ${status.executions.approvedWaiting.length}`);
      for (const exec of status.executions.approvedWaiting.slice(0, 3)) {
        console.log(`    - ${exec.symbol} ${exec.action} x${exec.shares} (${exec.portfolio})`);
      }
    }
    console.log('');

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\nScheduler stopped.');
      process.exit(0);
    });
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const executor = new AgentExecutor();

  if (args.includes('--now') || args.includes('-n')) {
    // Run immediately
    executor.executeApprovedTrades()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Execution failed:', err.message);
        process.exit(1);
      });
  } else if (args.includes('--status') || args.includes('-s')) {
    // Show status
    const status = executor.getStatus();
    console.log('\n' + '='.repeat(50));
    console.log('  Agent Trade Executor Status');
    console.log('='.repeat(50));

    console.log('\nPortfolios:');
    console.log(`  Auto-execute enabled: ${status.portfolios.autoExecuteEnabled}`);
    console.log(`  Full auto (no confirmation): ${status.portfolios.fullAutoExec}`);
    console.log(`  With confirmation: ${status.portfolios.withConfirmation}`);

    if (status.portfolios.list.length > 0) {
      console.log('\n  Portfolio list:');
      for (const p of status.portfolios.list) {
        const mode = p.requiresConfirmation ? '(manual confirm)' : '(full auto)';
        console.log(`    - ${p.name} ${mode} [Agent: ${p.agent || 'None'}]`);
      }
    }

    console.log('\nExecution Stats (7 days):');
    for (const [status_name, data] of Object.entries(status.executions.byStatus)) {
      console.log(`  - ${status_name}: ${data.count} ($${data.value?.toFixed(2) || 0})`);
    }

    if (status.executions.approvedWaiting.length > 0) {
      console.log('\nApproved & Waiting:');
      for (const exec of status.executions.approvedWaiting) {
        console.log(`  - ${exec.symbol} ${exec.action} x${exec.shares} @ $${exec.price?.toFixed(2)}`);
        console.log(`    Portfolio: ${exec.portfolio}, Since: ${exec.createdAt}`);
      }
    }

    if (status.executions.recentlyExecuted.length > 0) {
      console.log('\nRecently Executed (24h):');
      for (const exec of status.executions.recentlyExecuted) {
        console.log(`  - ${exec.symbol} ${exec.action} x${exec.shares} @ $${exec.price?.toFixed(2)}`);
        console.log(`    Portfolio: ${exec.portfolio}, At: ${exec.executedAt}`);
      }
    }

    if (status.scheduler.lastRun) {
      console.log('\nLast Run:');
      console.log(`  Time: ${status.scheduler.lastRun}`);
      console.log(`  Duration: ${status.scheduler.lastResult?.duration || 'N/A'}`);
      console.log(`  Executed: ${status.scheduler.lastResult?.executed || 0}`);
      console.log(`  Failed: ${status.scheduler.lastResult?.failed || 0}`);
      console.log(`  Skipped: ${status.scheduler.lastResult?.skipped || 0}`);
    }
    console.log('');
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Trade Executor Scheduler

Automatically executes approved agent trades for portfolios configured
for full auto-execution (auto_execute=ON, require_confirmation=OFF).

Usage:
  node src/jobs/agentExecutor.js [options]

Options:
  (none)        Start the scheduler daemon
  --now, -n     Execute approved trades immediately
  --status, -s  Show current execution status
  --help, -h    Show this help message

Schedule:
  - Market hours (Mon-Fri): Every 30 min from 9:30 AM to 4:00 PM ET
  - Post-market (Mon-Fri): 6:45 PM ET (after price updates)

How it works:
  1. Agent generates trading signals based on strategy
  2. If auto_execute is ON, signals are auto-approved
  3. THIS JOB executes approved trades for portfolios where:
     - auto_execute = ON (enabled)
     - require_confirmation = OFF (disabled)

  Trades for portfolios with require_confirmation = ON are skipped
  and must be manually executed by the user.

Portfolio Settings:
  - auto_execute: Whether to auto-approve generated signals
  - require_confirmation: Whether trades need manual execution

  For fully automatic trading, set both:
    auto_execute = ON
    require_confirmation = OFF
`);
  } else {
    // Start scheduler daemon
    executor.start();
  }
}

module.exports = AgentExecutor;
