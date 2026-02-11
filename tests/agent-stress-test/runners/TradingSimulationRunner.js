/**
 * Trading Simulation Runner
 *
 * Handles 30-day trading simulation with time acceleration and scenario changes
 */

class TradingSimulationRunner {
  constructor(db, options = {}) {
    this.db = db;
    this.verbose = options.verbose || false;
    this.issueCollector = options.issueCollector;
    this.metricsCollector = options.metricsCollector;
    this.simulationDays = options.simulationDays || 30;

    // Lazy load services
    this._agentService = null;
    this._paperEngine = null;
  }

  /**
   * Get agent service
   */
  getAgentService() {
    if (!this._agentService) {
      try {
        this._agentService = require('../../../src/services/agent/agentService');
      } catch (e) {
        console.error('Failed to load agentService:', e.message);
      }
    }
    return this._agentService;
  }

  /**
   * Get paper trading engine
   */
  getPaperEngine() {
    if (!this._paperEngine) {
      try {
        const { PaperTradingEngine } = require('../../../src/services/trading/paperTrading');
        this._paperEngine = new PaperTradingEngine(this.db);
      } catch (e) {
        // Use minimal fallback
        this._paperEngine = {
          submitOrder: () => ({ orderId: Date.now() }),
          takeSnapshot: () => true
        };
      }
    }
    return this._paperEngine;
  }

  /**
   * Run one day of trading for an agent
   */
  async runAgentDay(agentId, portfolioId, paperAccountId, scenario, dayNumber) {
    const startTime = Date.now();
    const result = {
      day: dayNumber,
      scenario: scenario.id,
      signalsGenerated: 0,
      signalsPending: 0,
      signalsApproved: 0,
      tradesExecuted: 0,
      errors: [],
      duration: 0
    };

    try {
      // Update market conditions for this scenario
      await this.updateMarketConditions(scenario);

      // Get agent service
      const agentService = this.getAgentService();
      if (!agentService) {
        result.errors.push('Agent service not available');
        return result;
      }

      // Run agent scan to generate signals
      let scanResult;
      try {
        scanResult = await agentService.runScan(agentId);
        result.signalsGenerated = scanResult?.signalsGenerated || scanResult?.signals?.length || 0;
        if (scanResult?.errors) {
          result.errors.push(...scanResult.errors);
        }
      } catch (e) {
        result.errors.push(`Scan error: ${e.message}`);
        // Continue with execution even if scan fails
      }

      // Get pending signals
      let pendingSignals = [];
      try {
        pendingSignals = agentService.getPendingSignals(agentId) || [];
        result.signalsPending = pendingSignals.length;
      } catch (e) {
        result.errors.push(`Get pending signals error: ${e.message}`);
      }

      // Get agent config to check auto_execute
      let agent;
      try {
        agent = agentService.getAgent(agentId);
      } catch (e) {
        result.errors.push(`Get agent error: ${e.message}`);
        agent = { auto_execute: false, execution_threshold: 0.8 };
      }

      // Process signals based on agent configuration
      if (agent && agent.auto_execute) {
        // Auto-approve high confidence signals
        for (const signal of pendingSignals) {
          try {
            if (signal.confidence >= (agent.execution_threshold || 0.8)) {
              agentService.approveSignal(signal.id, portfolioId);
              result.signalsApproved++;
            }
          } catch (e) {
            result.errors.push(`Approve signal error: ${e.message}`);
          }
        }

        // Execute approved signals
        try {
          const executions = await this.executeApprovedSignals(agentId, portfolioId, paperAccountId);
          result.tradesExecuted = executions.executed;
          result.errors.push(...executions.errors);
        } catch (e) {
          result.errors.push(`Execution error: ${e.message}`);
        }
      } else {
        // Simulate manual approval (approve 50% randomly for testing)
        for (const signal of pendingSignals) {
          if (Math.random() > 0.5) {
            try {
              agentService.approveSignal(signal.id, portfolioId);
              result.signalsApproved++;
            } catch (e) {
              // Ignore approval errors in manual mode
            }
          }
        }
      }

      // Simulate price changes based on scenario
      await this.simulatePriceChanges(portfolioId, scenario);

      this.metricsCollector?.recordPerformance('agent_day', Date.now() - startTime, true, {
        agentId,
        day: dayNumber,
        scenario: scenario.id
      });

    } catch (error) {
      result.errors.push(error.message);
      this.issueCollector?.addIssue({
        severity: 'MEDIUM',
        category: 'SIMULATION',
        agentId,
        day: dayNumber,
        scenario: scenario.id,
        message: `Day ${dayNumber} failed: ${error.message}`
      });
      this.metricsCollector?.recordPerformance('agent_day', Date.now() - startTime, false);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Execute all approved signals for an agent
   */
  async executeApprovedSignals(agentId, portfolioId, paperAccountId) {
    const result = {
      executed: 0,
      failed: 0,
      errors: []
    };

    try {
      const agentService = this.getAgentService();
      if (!agentService) {
        result.errors.push('Agent service not available');
        return result;
      }

      const paperEngine = this.getPaperEngine();

      // Get approved signals waiting for execution
      let approvedSignals = [];
      try {
        const executions = agentService.getExecutions(agentId);
        approvedSignals = executions?.approved || [];
      } catch (e) {
        result.errors.push(`Get executions error: ${e.message}`);
        return result;
      }

      for (const signal of approvedSignals) {
        try {
          // Determine order side
          const side = signal.action?.includes('buy') ? 'BUY' : 'SELL';
          const quantity = signal.suggested_shares || Math.floor(Math.random() * 10) + 1;
          const price = signal.price_at_signal || 100;

          // Execute via paper trading
          await paperEngine.submitOrder(paperAccountId, {
            symbol: signal.symbol,
            side,
            orderType: 'MARKET',
            quantity,
            notes: `Agent signal #${signal.id}`
          });

          // Mark signal as executed
          try {
            agentService.markSignalExecuted(signal.id, {
              executed_price: price,
              executed_shares: quantity,
              executed_value: quantity * price,
              portfolio_id: portfolioId
            });
          } catch (e) {
            // Continue even if marking fails
          }

          result.executed++;
          this.metricsCollector?.recordPerformance('trade_execute', 0, true);

        } catch (error) {
          result.failed++;
          result.errors.push(`Signal ${signal.id}: ${error.message}`);
          this.metricsCollector?.recordPerformance('trade_execute', 0, false);
        }
      }
    } catch (error) {
      result.errors.push(`Execution error: ${error.message}`);
    }

    return result;
  }

  /**
   * Update market sentiment indicators to simulate scenario
   */
  async updateMarketConditions(scenario) {
    try {
      // Check if table exists
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='market_sentiment'
      `).get();

      if (!tableCheck) {
        // Create table if it doesn't exist
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS market_sentiment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            indicator_type TEXT,
            indicator_value REAL,
            fetched_at TEXT DEFAULT (datetime('now')),
            UNIQUE(indicator_type)
          )
        `);
      }

      // Update VIX indicator
      this.db.prepare(`
        INSERT OR REPLACE INTO market_sentiment
        (indicator_type, indicator_value, fetched_at)
        VALUES ('vix', ?, datetime('now'))
      `).run(scenario.vix);

      // Update fear/greed
      this.db.prepare(`
        INSERT OR REPLACE INTO market_sentiment
        (indicator_type, indicator_value, fetched_at)
        VALUES ('cnn_fear_greed', ?, datetime('now'))
      `).run(scenario.fearGreed);

      // Update regime
      this.db.prepare(`
        INSERT OR REPLACE INTO market_sentiment
        (indicator_type, indicator_value, fetched_at)
        VALUES ('market_regime', ?, datetime('now'))
      `).run(scenario.regime === 'CRISIS' ? 1 : scenario.regime === 'BEAR' ? 2 : scenario.regime === 'BULL' ? 4 : 3);

    } catch (error) {
      // Non-critical - continue without updating conditions
      if (this.verbose) {
        console.log(`    [WARN] Could not update market conditions: ${error.message}`);
      }
    }
  }

  /**
   * Simulate price changes for positions
   */
  async simulatePriceChanges(portfolioId, scenario) {
    try {
      // Check if table exists
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='portfolio_positions'
      `).get();

      if (!tableCheck) {
        return; // No positions table
      }

      const positions = this.db.prepare(`
        SELECT pp.*, c.symbol
        FROM portfolio_positions pp
        LEFT JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ?
      `).all(portfolioId);

      for (const position of positions) {
        // Calculate price change based on scenario
        let change;
        if (scenario.volatility) {
          // Random change within volatility range
          change = (Math.random() - 0.5) * 2 * scenario.volatility;
        } else {
          // Use price multiplier
          change = scenario.priceMultiplier - 1;
          // Add some randomness
          change += (Math.random() - 0.5) * 0.01;
        }

        const currentPrice = position.current_price || position.avg_cost || 100;
        const newPrice = Math.max(0.01, currentPrice * (1 + change));

        // Update position's current price
        this.db.prepare(`
          UPDATE portfolio_positions
          SET current_price = ?,
              unrealized_pnl = (? - COALESCE(avg_cost, ?)) * COALESCE(shares, 0),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(newPrice, newPrice, currentPrice, position.id);
      }
    } catch (error) {
      // Non-critical
      if (this.verbose) {
        console.log(`    [WARN] Could not simulate price changes: ${error.message}`);
      }
    }
  }

  /**
   * Take snapshots for all paper accounts
   */
  async takeAllSnapshots(accountIds) {
    const paperEngine = this.getPaperEngine();

    for (const accountId of accountIds) {
      try {
        await paperEngine.takeSnapshot(accountId);
        this.metricsCollector?.recordPerformance('snapshot', 0, true);
      } catch (error) {
        // Non-critical
        this.metricsCollector?.recordPerformance('snapshot', 0, false);
      }
    }
  }

  /**
   * Get current market regime from database
   */
  getMarketRegime() {
    try {
      const row = this.db.prepare(`
        SELECT indicator_value FROM market_sentiment
        WHERE indicator_type = 'market_regime'
      `).get();
      return row?.indicator_value || 'SIDEWAYS';
    } catch (e) {
      return 'SIDEWAYS';
    }
  }
}

module.exports = { TradingSimulationRunner };
