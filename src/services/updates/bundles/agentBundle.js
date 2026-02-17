// src/services/updates/bundles/agentBundle.js
/**
 * Agent Update Bundle
 *
 * Handles AI trading agent jobs:
 * - agent.signal_scan_morning - Morning signal scan (10:00 AM ET)
 * - agent.signal_scan_afternoon - Afternoon signal scan (2:00 PM ET)
 * - agent.execute_open - Market open trade execution (9:30 AM ET)
 * - agent.execute_intraday - Intraday execution (every 30 min 10AM-4PM)
 * - agent.execute_close - Market close execution (4:00 PM ET)
 * - agent.execute_postmarket - Post-market execution (6:45 PM ET)
 */

class AgentBundle {
  constructor() {
    this.agentScanner = null;
    this.agentExecutor = null;
  }

  getAgentScanner() {
    if (!this.agentScanner) {
      try {
        const AgentScanner = require('../../../jobs/agentScanner');
        this.agentScanner = new AgentScanner();
      } catch (error) {
        console.warn('AgentScanner not available:', error.message);
        return null;
      }
    }
    return this.agentScanner;
  }

  getAgentExecutor() {
    if (!this.agentExecutor) {
      try {
        const AgentExecutor = require('../../../jobs/agentExecutor');
        this.agentExecutor = new AgentExecutor();
      } catch (error) {
        console.warn('AgentExecutor not available:', error.message);
        return null;
      }
    }
    return this.agentExecutor;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'agent.signal_scan_morning':
      case 'agent.signal_scan_afternoon':
        return this.runSignalScan(jobKey, db, onProgress);
      case 'agent.execute_open':
      case 'agent.execute_intraday':
      case 'agent.execute_close':
      case 'agent.execute_postmarket':
        return this.runTradeExecution(jobKey, db, onProgress);
      default:
        throw new Error(`Unknown agent job: ${jobKey}`);
    }
  }

  async runSignalScan(jobKey, db, onProgress) {
    const scanType = jobKey.includes('morning') ? 'morning' : 'afternoon';
    await onProgress(5, `Starting ${scanType} agent signal scan...`);

    const scanner = this.getAgentScanner();
    if (!scanner) {
      await onProgress(100, 'Skipped: AgentScanner not available');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'AgentScanner not available' }
      };
    }

    // Check if already running
    if (scanner.isRunning) {
      await onProgress(100, 'Signal scan already in progress');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'Already running' }
      };
    }

    try {
      await onProgress(10, 'Scanning active agents...');
      const result = await scanner.scanAllAgents();

      if (result.skipped) {
        await onProgress(100, `Skipped: ${result.reason}`);
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: result.reason }
        };
      }

      await onProgress(100, `Signal scan complete: ${result.totalSignals} signals generated from ${result.scanned} agents`);

      return {
        itemsTotal: result.scanned + result.skipped,
        itemsProcessed: result.scanned,
        itemsUpdated: result.totalSignals,
        itemsFailed: result.totalErrors,
        metadata: {
          scanType,
          agentsScanned: result.scanned,
          agentsSkipped: result.skipped,
          duration: result.duration
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async runTradeExecution(jobKey, db, onProgress) {
    const executionType = jobKey.replace('agent.execute_', '');
    await onProgress(5, `Starting ${executionType} trade execution...`);

    const executor = this.getAgentExecutor();
    if (!executor) {
      await onProgress(100, 'Skipped: AgentExecutor not available');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'AgentExecutor not available' }
      };
    }

    // Check if already running
    if (executor.isRunning) {
      await onProgress(100, 'Trade execution already in progress');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'Already running' }
      };
    }

    try {
      await onProgress(10, 'Executing approved trades...');
      const result = await executor.executeApprovedTrades();

      if (!result.success) {
        throw new Error(result.error || 'Trade execution failed');
      }

      const totalTrades = result.executed + result.failed + result.skipped;
      await onProgress(100, `Execution complete: ${result.executed} executed, ${result.failed} failed, ${result.skipped} skipped`);

      return {
        itemsTotal: totalTrades,
        itemsProcessed: result.executed + result.failed,
        itemsUpdated: result.executed,
        itemsFailed: result.failed,
        metadata: {
          executionType,
          totalValue: result.totalValue,
          duration: result.duration,
          skipped: result.skipped
        }
      };
    } catch (error) {
      throw error;
    }
  }
}

const agentBundle = new AgentBundle();

module.exports = {
  execute: (jobKey, db, context) => agentBundle.execute(jobKey, db, context)
};
