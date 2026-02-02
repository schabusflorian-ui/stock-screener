/**
 * Agent Signal Scanner Scheduler
 * Automatically generates trading signals for active AI agents
 *
 * This job triggers signal generation for all running agents:
 * 1. Gets all agents with status='running'
 * 2. Calls generateSignals() for each agent
 * 3. Signals are then available for execution (manual or auto)
 *
 * Schedule:
 *   - Daily at 10:00 AM ET (after market open, prices available)
 *   - Daily at 2:00 PM ET (mid-day scan)
 *   - Can be run manually with --now flag
 *
 * Usage:
 *   node src/jobs/agentScanner.js          # Start scheduler daemon
 *   node src/jobs/agentScanner.js --now    # Run scan immediately
 *   node src/jobs/agentScanner.js --status # Check status
 *   node src/jobs/agentScanner.js --agent 5 # Scan specific agent
 */

const cron = require('node-cron');
const db = require('../database');

// Lazy load agentService to avoid circular dependencies
let agentService = null;
function getAgentService() {
  if (!agentService) {
    agentService = require('../services/agent/agentService');
  }
  return agentService;
}

class AgentScanner {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Get all active agents that should be scanned
   */
  getActiveAgents() {
    const database = db.getDatabase();
    return database.prepare(`
      SELECT
        ta.id,
        ta.name,
        ta.strategy_type,
        ta.status,
        ta.last_scan_at,
        ta.auto_execute,
        ta.pause_in_crisis,
        (SELECT COUNT(*) FROM agent_universe WHERE agent_id = ta.id) as universe_size,
        (SELECT COUNT(*) FROM agent_signals WHERE agent_id = ta.id AND DATE(created_at) = DATE('now')) as signals_today
      FROM trading_agents ta
      WHERE ta.status = 'running'
      ORDER BY ta.last_scan_at ASC NULLS FIRST
    `).all();
  }

  /**
   * Scan all active agents for new signals
   */
  async scanAllAgents() {
    if (this.isRunning) {
      console.log('Scan already in progress, skipping...');
      return { skipped: true, reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const service = getAgentService();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] Agent Signal Scanner Starting...`);
    console.log('='.repeat(60));

    const results = {
      timestamp: new Date().toISOString(),
      agents: [],
      totalSignals: 0,
      totalErrors: 0,
      scanned: 0,
      skipped: 0
    };

    try {
      const agents = this.getActiveAgents();
      console.log(`\nFound ${agents.length} active agents to scan`);

      if (agents.length === 0) {
        console.log('No active agents found.');
        this.isRunning = false;
        this.lastRun = new Date();
        this.lastResult = results;
        return results;
      }

      for (const agent of agents) {
        console.log(`\n${'─'.repeat(40)}`);
        console.log(`Scanning: ${agent.name} (ID: ${agent.id})`);
        console.log(`  Strategy: ${agent.strategy_type}`);
        console.log(`  Universe: ${agent.universe_size} symbols`);
        console.log(`  Last scan: ${agent.last_scan_at || 'Never'}`);

        try {
          const scanResult = await service.runScan(agent.id);

          results.agents.push({
            id: agent.id,
            name: agent.name,
            success: true,
            signalsGenerated: scanResult.signalsGenerated || 0,
            errors: scanResult.errors || 0,
            symbolsScanned: scanResult.symbols || 0,
            skipped: scanResult.skipped || false,
            reason: scanResult.reason || null
          });

          if (scanResult.skipped) {
            results.skipped++;
            console.log(`  ⏸️  Skipped: ${scanResult.reason}`);
          } else {
            results.scanned++;
            results.totalSignals += scanResult.signalsGenerated || 0;
            results.totalErrors += scanResult.errors || 0;
            console.log(`  ✓ Generated ${scanResult.signalsGenerated} signals from ${scanResult.symbols} symbols`);
            if (scanResult.errors > 0) {
              console.log(`  ⚠ ${scanResult.errors} errors during scan`);
            }
          }
        } catch (error) {
          console.log(`  ✗ Error: ${error.message}`);
          results.agents.push({
            id: agent.id,
            name: agent.name,
            success: false,
            error: error.message
          });
          results.totalErrors++;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n${'='.repeat(60)}`);
      console.log('Summary:');
      console.log(`  Agents scanned: ${results.scanned}`);
      console.log(`  Agents skipped: ${results.skipped}`);
      console.log(`  Total signals generated: ${results.totalSignals}`);
      console.log(`  Total errors: ${results.totalErrors}`);
      console.log(`  Duration: ${duration} seconds`);
      console.log('='.repeat(60) + '\n');

      results.duration = `${duration} seconds`;

    } catch (error) {
      console.error(`\nCritical error during scan: ${error.message}`);
      results.criticalError = error.message;
    }

    this.isRunning = false;
    this.lastRun = new Date();
    this.lastResult = results;

    return results;
  }

  /**
   * Scan a specific agent
   */
  async scanAgent(agentId) {
    const service = getAgentService();
    const database = db.getDatabase();

    const agent = database.prepare(`
      SELECT id, name, strategy_type, status
      FROM trading_agents WHERE id = ?
    `).get(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    console.log(`\nScanning agent: ${agent.name} (ID: ${agent.id})`);
    console.log(`  Strategy: ${agent.strategy_type}`);
    console.log(`  Status: ${agent.status}`);

    if (agent.status === 'paused') {
      console.log('  ⚠ Agent is paused - scanning anyway (manual trigger)');
    }

    try {
      const result = await service.runScan(agentId);
      console.log(`  ✓ Generated ${result.signalsGenerated} signals`);
      if (result.errors > 0) {
        console.log(`  ⚠ ${result.errors} errors`);
      }
      return result;
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const database = db.getDatabase();

    // Get agent statistics
    const agentStats = database.prepare(`
      SELECT
        ta.status,
        COUNT(*) as count,
        (SELECT COUNT(*) FROM agent_signals as2
         WHERE as2.agent_id IN (SELECT id FROM trading_agents WHERE status = ta.status)
         AND DATE(as2.created_at) = DATE('now')) as signals_today
      FROM trading_agents ta
      GROUP BY ta.status
    `).all();

    // Get recent signals
    const recentSignals = database.prepare(`
      SELECT
        as2.id,
        as2.action,
        as2.confidence,
        as2.status,
        as2.created_at,
        c.symbol,
        ta.name as agent_name
      FROM agent_signals as2
      JOIN companies c ON as2.company_id = c.id
      JOIN trading_agents ta ON as2.agent_id = ta.id
      WHERE as2.created_at >= datetime('now', '-24 hours')
      ORDER BY as2.created_at DESC
      LIMIT 10
    `).all();

    // Get agents with most recent activity
    const activeAgents = database.prepare(`
      SELECT
        ta.id,
        ta.name,
        ta.strategy_type,
        ta.last_scan_at,
        ta.status,
        (SELECT COUNT(*) FROM agent_signals WHERE agent_id = ta.id AND DATE(created_at) = DATE('now')) as signals_today
      FROM trading_agents ta
      WHERE ta.status = 'running'
      ORDER BY ta.last_scan_at DESC
      LIMIT 10
    `).all();

    return {
      scheduler: {
        isRunning: this.isRunning,
        lastRun: this.lastRun?.toISOString() || null,
        lastResult: this.lastResult ? {
          scanned: this.lastResult.scanned,
          skipped: this.lastResult.skipped,
          totalSignals: this.lastResult.totalSignals,
          totalErrors: this.lastResult.totalErrors,
          duration: this.lastResult.duration
        } : null
      },
      agents: {
        byStatus: agentStats.reduce((acc, row) => {
          acc[row.status] = { count: row.count, signalsToday: row.signals_today || 0 };
          return acc;
        }, {}),
        active: activeAgents.map(a => ({
          id: a.id,
          name: a.name,
          strategy: a.strategy_type,
          lastScan: a.last_scan_at,
          signalsToday: a.signals_today
        }))
      },
      recentSignals: recentSignals.map(s => ({
        symbol: s.symbol,
        action: s.action,
        confidence: s.confidence,
        status: s.status,
        agent: s.agent_name,
        createdAt: s.created_at
      }))
    };
  }

  /**
   * Start the scheduler daemon
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Agent Signal Scanner Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule:');
    console.log('    - 10:00 AM ET (after market open)');
    console.log('    - 2:00 PM ET (mid-day scan)');
    console.log('='.repeat(60) + '\n');

    // Schedule: 10:00 AM ET weekdays (after market open, prices available)
    cron.schedule('0 10 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled scan (10:00 AM ET)`);
      try {
        await this.scanAllAgents();
      } catch (error) {
        console.error('Scheduled scan failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Schedule: 2:00 PM ET weekdays (mid-day scan for afternoon signals)
    cron.schedule('0 14 * * 1-5', async () => {
      console.log(`\n[${new Date().toISOString()}] Scheduled scan (2:00 PM ET)`);
      try {
        await this.scanAllAgents();
      } catch (error) {
        console.error('Scheduled scan failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Display status on startup
    const status = this.getStatus();
    console.log('Current status:');
    console.log(`  Running agents: ${status.agents.byStatus?.running?.count || 0}`);
    console.log(`  Paused agents: ${status.agents.byStatus?.paused?.count || 0}`);

    if (status.agents.active.length > 0) {
      console.log('\n  Active agents:');
      for (const agent of status.agents.active.slice(0, 5)) {
        console.log(`    - ${agent.name}: last scan ${agent.lastScan || 'never'}, ${agent.signalsToday || 0} signals today`);
      }
    }

    if (status.recentSignals.length > 0) {
      console.log(`\n  Recent signals (24h): ${status.recentSignals.length}`);
      for (const signal of status.recentSignals.slice(0, 3)) {
        console.log(`    - ${signal.symbol} ${signal.action} (${signal.agent})`);
      }
    }

    console.log('\nScheduler running. Press Ctrl+C to stop.\n');

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
  const scanner = new AgentScanner();

  if (args.includes('--now') || args.includes('-n')) {
    // Run immediately
    scanner.scanAllAgents()
      .then(result => {
        console.log('\nScan complete.');
        process.exit(result.criticalError ? 1 : 0);
      })
      .catch(err => {
        console.error('Scan failed:', err.message);
        process.exit(1);
      });

  } else if (args.includes('--agent') || args.includes('-a')) {
    // Scan specific agent
    const agentIndex = args.findIndex(a => a === '--agent' || a === '-a');
    const agentId = parseInt(args[agentIndex + 1], 10);

    if (isNaN(agentId)) {
      console.error('Error: Please provide agent ID after --agent flag');
      console.error('Usage: node src/jobs/agentScanner.js --agent 5');
      process.exit(1);
    }

    scanner.scanAgent(agentId)
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Scan failed:', err.message);
        process.exit(1);
      });

  } else if (args.includes('--status') || args.includes('-s')) {
    // Show status
    const status = scanner.getStatus();

    console.log('\n' + '='.repeat(50));
    console.log('  Agent Signal Scanner Status');
    console.log('='.repeat(50));

    console.log('\nAgents:');
    for (const [statusName, data] of Object.entries(status.agents.byStatus)) {
      console.log(`  - ${statusName}: ${data.count} agents, ${data.signalsToday} signals today`);
    }

    if (status.agents.active.length > 0) {
      console.log('\nActive agents:');
      for (const agent of status.agents.active) {
        console.log(`  - ${agent.name}`);
        console.log(`    Strategy: ${agent.strategy}`);
        console.log(`    Last scan: ${agent.lastScan || 'Never'}`);
        console.log(`    Signals today: ${agent.signalsToday || 0}`);
      }
    }

    if (status.recentSignals.length > 0) {
      console.log('\nRecent signals (24h):');
      for (const signal of status.recentSignals) {
        console.log(`  - ${signal.symbol} ${signal.action} @ ${(signal.confidence * 100).toFixed(0)}%`);
        console.log(`    Agent: ${signal.agent}, Status: ${signal.status}`);
        console.log(`    Created: ${signal.createdAt}`);
      }
    }

    if (status.scheduler.lastRun) {
      console.log('\nLast Run:');
      console.log(`  Time: ${status.scheduler.lastRun}`);
      console.log(`  Duration: ${status.scheduler.lastResult?.duration || 'N/A'}`);
      console.log(`  Agents scanned: ${status.scheduler.lastResult?.scanned || 0}`);
      console.log(`  Signals generated: ${status.scheduler.lastResult?.totalSignals || 0}`);
    }

    console.log('');

  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Signal Scanner Scheduler

Generates trading signals for all active AI trading agents.
Signals are created based on each agent's strategy and universe.

Usage:
  node src/jobs/agentScanner.js [options]

Options:
  (none)           Start the scheduler daemon
  --now, -n        Scan all active agents immediately
  --agent ID, -a   Scan a specific agent by ID
  --status, -s     Show current scanner status
  --help, -h       Show this help message

Schedule (when running as daemon):
  - 10:00 AM ET weekdays (after market open)
  - 2:00 PM ET weekdays (mid-day scan)

How it works:
  1. Gets all agents with status='running'
  2. For each agent:
     - Loads agent's strategy configuration
     - Gets agent's stock universe
     - Runs TradingAgent analysis on each symbol
     - Creates signals for actionable opportunities
  3. Signals become available for:
     - Auto-execution (if agent has auto_execute=ON)
     - Manual review in the UI

Examples:
  # Start the scheduler daemon
  node src/jobs/agentScanner.js

  # Run a one-time scan of all agents
  node src/jobs/agentScanner.js --now

  # Scan just agent ID 5
  node src/jobs/agentScanner.js --agent 5

  # Check status
  node src/jobs/agentScanner.js --status
`);

  } else {
    // Start scheduler daemon
    scanner.start();
  }
}

module.exports = AgentScanner;
