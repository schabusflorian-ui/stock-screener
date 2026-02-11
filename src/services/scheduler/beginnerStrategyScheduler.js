// src/services/scheduler/beginnerStrategyScheduler.js
// Scheduler for checking and creating beginner strategy contribution signals

const { getDatabaseAsync } = require('../../lib/db');

class BeginnerStrategyScheduler {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.lastCheck = null;
    this.dbPromise = null;
  }

  async _getDb() {
    if (!this.dbPromise) {
      this.dbPromise = getDatabaseAsync();
    }
    return this.dbPromise;
  }

  /**
   * Start the scheduler
   * @param {number} intervalMs - Check interval in milliseconds (default: 1 hour)
   */
  start(intervalMs = 3600000) {
    if (this.isRunning) {
      console.log('[BeginnerScheduler] Already running');
      return;
    }

    console.log('[BeginnerScheduler] Starting scheduler...');
    this.isRunning = true;

    // Run immediately on start
    this.checkContributions().catch(err => {
      console.error('[BeginnerScheduler] Error in initial check:', err);
    });

    // Set up recurring check
    this.checkInterval = setInterval(() => {
      this.checkContributions().catch(err => {
        console.error('[BeginnerScheduler] Error in scheduled check:', err);
      });
    }, intervalMs);

    console.log(`[BeginnerScheduler] Scheduled to run every ${intervalMs / 1000} seconds`);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[BeginnerScheduler] Stopped');
  }

  /**
   * Check all active beginner agents for due contributions
   */
  async checkContributions() {
    const startTime = Date.now();
    console.log('[BeginnerScheduler] Checking for due contributions...');

    try {
      const database = await this._getDb();
      // Get all active beginner agents
      const beginnerAgentsResult = await database.query(`
        SELECT * FROM trading_agents
        WHERE agent_category = 'beginner'
          AND is_active = 1
          AND status != 'paused'
          AND beginner_config IS NOT NULL
      `);
      const beginnerAgents = beginnerAgentsResult.rows;

      console.log(`[BeginnerScheduler] Found ${beginnerAgents.length} active beginner agents`);

      let contributionsCreated = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const agent of beginnerAgents) {
        try {
          const config = JSON.parse(agent.beginner_config);
          const nextContributionDate = config.next_contribution_date;

          // Check if contribution is due
          if (nextContributionDate && nextContributionDate <= today) {
            // Check if we already have a pending contribution for today
            const existingContributionResult = await database.query(`
              SELECT * FROM beginner_contributions
              WHERE agent_id = $1
                AND contribution_date = $2
                AND status IN ('pending', 'executed')
            `, [agent.id, today]);
            const existingContribution = existingContributionResult.rows[0];

            if (!existingContribution) {
              // Create contribution signals
              const result = await this.createContributionSignals(agent, config);
              if (result.signalsCreated > 0) {
                contributionsCreated++;

                // Update next contribution date
                await this.updateNextContributionDate(agent.id, config);
              }
            } else {
              console.log(`[BeginnerScheduler] Agent ${agent.id}: Contribution already exists for ${today}`);
            }
          }
        } catch (err) {
          console.error(`[BeginnerScheduler] Error processing agent ${agent.id}:`, err);
        }
      }

      this.lastCheck = new Date().toISOString();
      const elapsed = Date.now() - startTime;
      console.log(`[BeginnerScheduler] Check completed in ${elapsed}ms. Created ${contributionsCreated} contributions.`);

      return { contributionsCreated, agentsChecked: beginnerAgents.length };

    } catch (error) {
      console.error('[BeginnerScheduler] Error in checkContributions:', error);
      throw error;
    }
  }

  /**
   * Create contribution signals for a beginner agent
   */
  async createContributionSignals(agent, config) {
    const database = await this._getDb();
    const BeginnerStrategyEngine = require('../strategy/beginnerStrategyEngine');
    const engine = new BeginnerStrategyEngine(database);

    const signals = await engine.generateSignals(agent.id);

    if (!signals || signals.length === 0) {
      console.log(`[BeginnerScheduler] Agent ${agent.id}: No signals generated`);
      return { signalsCreated: 0 };
    }

    const today = new Date().toISOString().split('T')[0];
    const signalIds = [];

    // Get agent's portfolio
    const portfolioResult = await database.query(`
      SELECT ap.portfolio_id FROM agent_portfolios ap
      WHERE ap.agent_id = $1 AND ap.is_active = 1
      LIMIT 1
    `, [agent.id]);
    const portfolio = portfolioResult.rows[0];

    // Create signals in agent_signals table
    for (const signal of signals) {
      const result = await database.query(`
        INSERT INTO agent_signals (
          agent_id, symbol, signal_date, action,
          overall_score, confidence, price_at_signal,
          position_value, suggested_shares,
          contribution_type, contribution_amount,
          reasoning, status
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 1.0, 1.0, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING id
      `, [
        agent.id,
        signal.symbol,
        signal.action,
        signal.price || null,
        signal.amount,
        signal.shares || null,
        config.strategy_type,
        signal.amount,
        JSON.stringify({ reason: signal.reason, strategy: config.strategy_type })
      ]);

      signalIds.push(result.rows?.[0]?.id || result.lastInsertRowid);
    }

    // Record in beginner_contributions table
    const totalAmount = signals.reduce((sum, s) => sum + (s.amount || 0), 0);
    await database.query(`
      INSERT INTO beginner_contributions (
        agent_id, portfolio_id, contribution_date, strategy_type,
        planned_amount, status, signal_ids, notes
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
    `, [
      agent.id,
      portfolio?.portfolio_id || null,
      today,
      config.strategy_type,
      totalAmount,
      JSON.stringify(signalIds),
      `Scheduled ${config.strategy_type} contribution`
    ]);

    // Log activity
    await database.query(`
      INSERT INTO agent_activity_log (agent_id, portfolio_id, activity_type, description)
      VALUES ($1, $2, 'contribution_scheduled', $3)
    `, [
      agent.id,
      portfolio?.portfolio_id || null,
      `Scheduled ${config.strategy_type} contribution: $${totalAmount.toFixed(2)} across ${signals.length} assets`
    ]);

    console.log(`[BeginnerScheduler] Agent ${agent.id}: Created ${signals.length} signals for $${totalAmount.toFixed(2)}`);

    return { signalsCreated: signals.length, totalAmount };
  }

  /**
   * Update the next contribution date after a contribution is created
   */
  async updateNextContributionDate(agentId, config) {
    const database = await this._getDb();
    const frequency = config.frequency || config.dca_frequency || 'monthly';
    const frequencyDay = config.frequency_day || 1;

    const nextDate = this.calculateNextDate(frequency, frequencyDay);

    // Update the config with new next_contribution_date
    const newConfig = {
      ...config,
      next_contribution_date: nextDate,
      last_contribution_date: new Date().toISOString().split('T')[0]
    };

    await database.query(`
      UPDATE trading_agents
      SET beginner_config = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(newConfig), agentId]);

    console.log(`[BeginnerScheduler] Agent ${agentId}: Next contribution date set to ${nextDate}`);
  }

  /**
   * Calculate the next contribution date based on frequency
   */
  calculateNextDate(frequency, frequencyDay = 1) {
    const now = new Date();
    const result = new Date(now);

    switch (frequency) {
      case 'daily':
        result.setDate(result.getDate() + 1);
        break;

      case 'weekly':
        // Next occurrence of the specified day (0=Sunday, 1=Monday, etc.)
        const currentDay = result.getDay();
        const targetDay = frequencyDay % 7;
        const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
        result.setDate(result.getDate() + daysUntilTarget);
        break;

      case 'biweekly':
        result.setDate(result.getDate() + 14);
        break;

      case 'monthly':
        result.setMonth(result.getMonth() + 1);
        // Set to the specified day, clamped to month end
        const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(frequencyDay, daysInMonth));
        break;

      case 'quarterly':
        result.setMonth(result.getMonth() + 3);
        const daysInQuarterMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(frequencyDay, daysInQuarterMonth));
        break;

      default:
        result.setMonth(result.getMonth() + 1);
    }

    return result.toISOString().split('T')[0];
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCheck: this.lastCheck,
      checkInterval: this.checkInterval ? 'active' : 'inactive'
    };
  }

  /**
   * Manually trigger a contribution check for a specific agent
   */
  async triggerAgentCheck(agentId) {
    const database = await this._getDb();
    const agentResult = await database.query(`
      SELECT * FROM trading_agents
      WHERE id = $1 AND agent_category = 'beginner'
    `, [agentId]);
    const agent = agentResult.rows[0];

    if (!agent) {
      throw new Error(`Beginner agent ${agentId} not found`);
    }

    const config = JSON.parse(agent.beginner_config);
    return this.createContributionSignals(agent, config);
  }

  /**
   * Get due contributions summary
   */
  async getDueContributions() {
    const database = await this._getDb();
    const today = new Date().toISOString().split('T')[0];

    const dueAgentsResult = await database.query(`
      SELECT
        ta.id,
        ta.name,
        ta.beginner_config,
        (SELECT COUNT(*) FROM beginner_contributions bc
         WHERE bc.agent_id = ta.id AND bc.contribution_date = $1 AND bc.status = 'pending') as pending_today
      FROM trading_agents ta
      WHERE ta.agent_category = 'beginner'
        AND ta.is_active = 1
        AND ta.beginner_config IS NOT NULL
    `, [today]);
    const dueAgents = dueAgentsResult.rows;

    return dueAgents.map(agent => {
      const config = JSON.parse(agent.beginner_config);
      return {
        id: agent.id,
        name: agent.name,
        strategyType: config.strategy_type,
        nextContributionDate: config.next_contribution_date,
        isDue: config.next_contribution_date <= today,
        hasPendingContribution: agent.pending_today > 0
      };
    });
  }

  /**
   * Get contribution history for an agent
   */
  async getContributionHistory(agentId, limit = 20) {
    const database = await this._getDb();
    const result = await database.query(`
      SELECT * FROM beginner_contributions
      WHERE agent_id = $1
      ORDER BY contribution_date DESC
      LIMIT $2
    `, [agentId, limit]);
    return result.rows;
  }
}

// Singleton instance
let schedulerInstance = null;

function getScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new BeginnerStrategyScheduler();
  }
  return schedulerInstance;
}

module.exports = {
  BeginnerStrategyScheduler,
  getScheduler
};
