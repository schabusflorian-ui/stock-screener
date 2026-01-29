// src/services/strategy/beginnerStrategyEngine.js
// Engine for beginner-friendly trading strategies: DCA, Value Averaging, DRIP, Rebalancing, Lump Sum Hybrid

const { getDatabase } = require('../../database');

// Strategy type constants
const STRATEGY_TYPES = {
  DCA: 'dca',
  VALUE_AVERAGING: 'value_averaging',
  DRIP: 'drip',
  REBALANCE: 'rebalance',
  LUMP_DCA: 'lump_dca'
};

// Frequency constants
const FREQUENCIES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly'
};

class BeginnerStrategyEngine {
  constructor(db = null) {
    this.db = db || getDatabase();
  }

  // ============================================
  // SIGNAL GENERATION
  // ============================================

  /**
   * Generate signals for a beginner strategy agent
   * @param {number} agentId - The agent ID
   * @returns {Promise<Array>} Array of signal objects
   */
  async generateSignals(agentId) {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.agent_category !== 'beginner') {
      throw new Error(`Agent ${agentId} is not a beginner strategy agent`);
    }

    const config = this._parseConfig(agent.beginner_config);
    if (!config) {
      throw new Error(`Agent ${agentId} has no beginner configuration`);
    }

    switch (config.strategy_type) {
      case STRATEGY_TYPES.DCA:
        return this._generateDCASignals(agent, config);
      case STRATEGY_TYPES.VALUE_AVERAGING:
        return this._generateValueAveragingSignals(agent, config);
      case STRATEGY_TYPES.DRIP:
        return this._generateDRIPSignals(agent, config);
      case STRATEGY_TYPES.REBALANCE:
        return this._generateRebalanceSignals(agent, config);
      case STRATEGY_TYPES.LUMP_DCA:
        return this._generateLumpDCASignals(agent, config);
      default:
        throw new Error(`Unknown strategy type: ${config.strategy_type}`);
    }
  }

  /**
   * Generate DCA signals - fixed amount at regular intervals
   */
  async _generateDCASignals(agent, config) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if contribution is due
    if (!this._isContributionDue(config, today)) {
      return [];
    }

    const signals = [];
    const totalAmount = config.amount || 0;

    for (const asset of (config.target_assets || [])) {
      const amount = totalAmount * (asset.allocation || 0);
      if (amount <= 0) continue;

      // Get current price for the asset
      const price = await this._getCurrentPrice(asset.symbol);
      if (!price) continue;

      const shares = Math.floor((amount / price) * 10000) / 10000; // 4 decimal places

      signals.push({
        symbol: asset.symbol,
        action: 'buy',
        amount: amount,
        shares: shares,
        price: price,
        reason: `Scheduled DCA contribution ($${amount.toFixed(2)})`,
        confidence: 1.0,
        contribution_type: STRATEGY_TYPES.DCA
      });
    }

    return signals;
  }

  /**
   * Generate Value Averaging signals - adjust to hit growth target
   */
  async _generateValueAveragingSignals(agent, config) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!this._isContributionDue(config, today)) {
      return [];
    }

    // Get linked portfolio
    const portfolioLink = await this._getAgentPortfolio(agent.id);
    if (!portfolioLink) {
      return [];
    }

    // Calculate current portfolio value for target assets
    const currentValue = await this._getPortfolioValueForAssets(
      portfolioLink.portfolio_id,
      config.target_assets
    );

    // Calculate target value based on growth rate
    const startValue = config.start_value || currentValue;
    const monthsElapsed = this._getMonthsElapsed(config.start_date || new Date());
    const monthlyGrowthRate = Math.pow(1 + (config.target_growth_rate || 0.10), 1/12) - 1;
    const targetValue = startValue * Math.pow(1 + monthlyGrowthRate, monthsElapsed);

    // Difference determines contribution
    let contribution = targetValue - currentValue;

    // Clamp to min/max
    contribution = Math.max(config.min_contribution || 0, contribution);
    contribution = Math.min(config.max_contribution || Infinity, contribution);

    if (contribution <= 0) {
      return [{
        symbol: 'CASH',
        action: 'hold',
        amount: 0,
        reason: `Portfolio above target ($${currentValue.toFixed(0)} > $${targetValue.toFixed(0)}). No contribution needed.`,
        confidence: 1.0,
        contribution_type: STRATEGY_TYPES.VALUE_AVERAGING
      }];
    }

    // Allocate contribution across target assets
    return this._allocateContribution(contribution, config.target_assets, STRATEGY_TYPES.VALUE_AVERAGING);
  }

  /**
   * Generate DRIP signals - reinvest dividends
   */
  async _generateDRIPSignals(agent, config) {
    const portfolioLink = await this._getAgentPortfolio(agent.id);
    if (!portfolioLink) {
      return [];
    }

    // Get recent dividends that haven't been reinvested
    const unreinvestedDividends = await this._getUnreinvestedDividends(
      portfolioLink.portfolio_id,
      agent.id
    );

    if (unreinvestedDividends.length === 0) {
      return [];
    }

    const signals = [];
    const minAmount = config.min_dividend_to_reinvest || 10;

    for (const dividend of unreinvestedDividends) {
      if (dividend.amount < minAmount) continue;

      const targetSymbol = config.reinvest_same_stock
        ? dividend.symbol
        : this._selectReinvestTarget(config.target_assets);

      const price = await this._getCurrentPrice(targetSymbol);
      if (!price) continue;

      const shares = Math.floor((dividend.amount / price) * 10000) / 10000;

      signals.push({
        symbol: targetSymbol,
        action: 'buy',
        amount: dividend.amount,
        shares: shares,
        price: price,
        reason: `DRIP: Reinvesting $${dividend.amount.toFixed(2)} dividend from ${dividend.symbol}`,
        confidence: 1.0,
        contribution_type: STRATEGY_TYPES.DRIP,
        dividend_id: dividend.id
      });
    }

    return signals;
  }

  /**
   * Generate Rebalancing signals - maintain target allocation
   */
  async _generateRebalanceSignals(agent, config) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if rebalance is due (by date or threshold)
    const portfolioLink = await this._getAgentPortfolio(agent.id);
    if (!portfolioLink) {
      return [];
    }

    const holdings = await this._getPortfolioHoldings(portfolioLink.portfolio_id);
    const totalValue = holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);

    if (totalValue <= 0) {
      return [];
    }

    // Calculate current allocations
    const currentAllocations = {};
    for (const holding of holdings) {
      currentAllocations[holding.symbol] = (holding.current_value || 0) / totalValue;
    }

    const targetAllocation = config.target_allocation || {};
    const threshold = config.rebalance_threshold || 0.05;
    const signals = [];

    // Check each target allocation
    for (const [symbol, targetPct] of Object.entries(targetAllocation)) {
      const currentPct = currentAllocations[symbol] || 0;
      const drift = currentPct - targetPct;

      if (Math.abs(drift) > threshold) {
        const tradeAmount = Math.abs(drift) * totalValue;
        const price = await this._getCurrentPrice(symbol);
        if (!price) continue;

        const shares = Math.floor((tradeAmount / price) * 10000) / 10000;

        signals.push({
          symbol: symbol,
          action: drift > 0 ? 'sell' : 'buy',
          amount: tradeAmount,
          shares: shares,
          price: price,
          reason: `Rebalance: ${symbol} is ${(drift * 100).toFixed(1)}% ${drift > 0 ? 'over' : 'under'} target`,
          confidence: 1.0,
          contribution_type: STRATEGY_TYPES.REBALANCE,
          current_allocation: currentPct,
          target_allocation: targetPct
        });
      }
    }

    return signals;
  }

  /**
   * Generate Lump Sum + DCA signals
   */
  async _generateLumpDCASignals(agent, config) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if lump sum has been executed
    if (!config.lump_sum_executed) {
      // Generate lump sum signals
      const lumpSumAmount = (config.total_amount || 0) * (config.lump_sum_pct || 0.5);
      return this._allocateContribution(
        lumpSumAmount,
        config.target_assets,
        STRATEGY_TYPES.LUMP_DCA,
        'Lump sum initial investment'
      );
    }

    // Otherwise, generate DCA signals for remaining amount
    const dcaRemaining = config.dca_remaining || 0;
    if (dcaRemaining <= 0) {
      return [];
    }

    // Check if DCA contribution is due
    if (!this._isContributionDue({ ...config, frequency: config.dca_frequency }, today)) {
      return [];
    }

    // Calculate per-contribution amount
    const endDate = new Date(config.dca_end_date);
    const periodsRemaining = this._getPeriodsRemaining(today, endDate, config.dca_frequency);
    const contributionAmount = periodsRemaining > 0 ? dcaRemaining / periodsRemaining : dcaRemaining;

    return this._allocateContribution(
      contributionAmount,
      config.target_assets,
      STRATEGY_TYPES.LUMP_DCA,
      `DCA contribution ($${contributionAmount.toFixed(2)} of $${dcaRemaining.toFixed(2)} remaining)`
    );
  }

  // ============================================
  // CONTRIBUTION TRACKING
  // ============================================

  /**
   * Create pending contribution record
   */
  async createPendingContribution(agentId, signals) {
    const agent = await this.getAgent(agentId);
    const portfolioLink = await this._getAgentPortfolio(agentId);
    const config = this._parseConfig(agent.beginner_config);

    const totalAmount = signals.reduce((sum, s) => sum + (s.amount || 0), 0);

    const result = this.db.prepare(`
      INSERT INTO beginner_contributions
      (agent_id, portfolio_id, contribution_date, strategy_type, planned_amount, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      agentId,
      portfolioLink?.portfolio_id || null,
      new Date().toISOString().split('T')[0],
      config.strategy_type,
      totalAmount
    );

    return result.lastInsertRowid;
  }

  /**
   * Record executed contribution
   */
  async recordContribution(contributionId, executionDetails) {
    this.db.prepare(`
      UPDATE beginner_contributions
      SET status = 'executed',
          actual_amount = ?,
          execution_details = ?,
          executed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      executionDetails.totalAmount,
      JSON.stringify(executionDetails),
      contributionId
    );
  }

  /**
   * Get contribution history for an agent
   */
  async getContributionHistory(agentId, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM beginner_contributions
      WHERE agent_id = ?
      ORDER BY contribution_date DESC
      LIMIT ?
    `).all(agentId, limit);
  }

  // ============================================
  // PROJECTIONS
  // ============================================

  /**
   * Project future portfolio value based on strategy
   */
  async projectFutureValue(agentId, yearsAhead = 10) {
    const agent = await this.getAgent(agentId);
    const config = this._parseConfig(agent.beginner_config);
    const portfolioLink = await this._getAgentPortfolio(agentId);

    const currentValue = portfolioLink
      ? await this._getPortfolioValue(portfolioLink.portfolio_id)
      : 0;

    // Calculate annual contribution
    let annualContribution = 0;
    switch (config.strategy_type) {
      case STRATEGY_TYPES.DCA:
        annualContribution = this._getAnnualContribution(config.amount, config.frequency);
        break;
      case STRATEGY_TYPES.VALUE_AVERAGING:
        annualContribution = (config.min_contribution + config.max_contribution) / 2 * 12;
        break;
      case STRATEGY_TYPES.LUMP_DCA:
        annualContribution = config.total_amount / (config.dcaMonths / 12);
        break;
      default:
        annualContribution = 0;
    }

    // Project with different return scenarios
    const scenarios = {
      conservative: { returnRate: 0.05, label: 'Conservative (5%)' },
      moderate: { returnRate: 0.07, label: 'Moderate (7%)' },
      optimistic: { returnRate: 0.10, label: 'Optimistic (10%)' }
    };

    const projections = {};
    for (const [key, scenario] of Object.entries(scenarios)) {
      projections[key] = this._calculateProjection(
        currentValue,
        annualContribution,
        scenario.returnRate,
        yearsAhead
      );
      projections[key].label = scenario.label;
    }

    return {
      currentValue,
      annualContribution,
      yearsAhead,
      projections
    };
  }

  _calculateProjection(startValue, annualContribution, returnRate, years) {
    const yearlyData = [];
    let value = startValue;
    let totalContributed = 0;

    for (let year = 0; year <= years; year++) {
      yearlyData.push({
        year,
        value: Math.round(value),
        contributed: Math.round(totalContributed),
        gains: Math.round(value - totalContributed - startValue)
      });

      // Apply growth and add contribution
      value = value * (1 + returnRate) + annualContribution;
      totalContributed += annualContribution;
    }

    return {
      finalValue: yearlyData[years].value,
      totalContributed: yearlyData[years].contributed + startValue,
      totalGains: yearlyData[years].gains,
      yearlyData
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async getAgent(agentId) {
    return this.db.prepare(`
      SELECT * FROM trading_agents WHERE id = ?
    `).get(agentId);
  }

  async _getAgentPortfolio(agentId) {
    return this.db.prepare(`
      SELECT * FROM agent_portfolios
      WHERE agent_id = ? AND is_active = 1
      LIMIT 1
    `).get(agentId);
  }

  async _getPortfolioHoldings(portfolioId) {
    return this.db.prepare(`
      SELECT h.*, c.symbol, c.name as company_name,
             h.shares * h.average_cost as cost_basis,
             h.shares * COALESCE(
               (SELECT close FROM daily_prices WHERE company_id = h.company_id ORDER BY date DESC LIMIT 1),
               h.average_cost
             ) as current_value
      FROM holdings h
      JOIN companies c ON h.company_id = c.id
      WHERE h.portfolio_id = ? AND h.shares > 0
    `).all(portfolioId);
  }

  async _getPortfolioValue(portfolioId) {
    const holdings = await this._getPortfolioHoldings(portfolioId);
    return holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);
  }

  async _getPortfolioValueForAssets(portfolioId, targetAssets) {
    const symbols = (targetAssets || []).map(a => a.symbol);
    if (symbols.length === 0) return 0;

    const holdings = await this._getPortfolioHoldings(portfolioId);
    return holdings
      .filter(h => symbols.includes(h.symbol))
      .reduce((sum, h) => sum + (h.current_value || 0), 0);
  }

  async _getCurrentPrice(symbol) {
    const result = this.db.prepare(`
      SELECT dp.close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = ?
      ORDER BY dp.date DESC
      LIMIT 1
    `).get(symbol);

    return result?.price || null;
  }

  async _getUnreinvestedDividends(portfolioId, agentId) {
    // Get dividends that haven't been processed by DRIP
    return this.db.prepare(`
      SELECT t.id, t.symbol, t.total_amount as amount, t.created_at
      FROM transactions t
      WHERE t.portfolio_id = ?
        AND t.transaction_type = 'dividend'
        AND t.id NOT IN (
          SELECT CAST(json_extract(execution_details, '$.dividend_id') AS INTEGER)
          FROM beginner_contributions
          WHERE agent_id = ? AND strategy_type = 'drip' AND status = 'executed'
        )
      ORDER BY t.created_at DESC
    `).all(portfolioId, agentId);
  }

  _parseConfig(configStr) {
    if (!configStr) return null;
    try {
      return typeof configStr === 'string' ? JSON.parse(configStr) : configStr;
    } catch {
      return null;
    }
  }

  _isContributionDue(config, today) {
    const nextDate = config.next_contribution_date
      ? new Date(config.next_contribution_date)
      : this._calculateNextContributionDate(config, new Date(0));

    nextDate.setHours(0, 0, 0, 0);
    return today >= nextDate;
  }

  _calculateNextContributionDate(config, fromDate) {
    const frequency = config.frequency || FREQUENCIES.MONTHLY;
    const frequencyDay = config.frequency_day || 1;
    const next = new Date(fromDate);

    switch (frequency) {
      case FREQUENCIES.DAILY:
        next.setDate(next.getDate() + 1);
        break;
      case FREQUENCIES.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case FREQUENCIES.BIWEEKLY:
        next.setDate(next.getDate() + 14);
        break;
      case FREQUENCIES.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(frequencyDay, this._getDaysInMonth(next)));
        break;
      case FREQUENCIES.QUARTERLY:
        next.setMonth(next.getMonth() + 3);
        next.setDate(Math.min(frequencyDay, this._getDaysInMonth(next)));
        break;
    }

    return next;
  }

  _getDaysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  _getMonthsElapsed(startDate) {
    const start = new Date(startDate);
    const now = new Date();
    return (now.getFullYear() - start.getFullYear()) * 12 +
           (now.getMonth() - start.getMonth());
  }

  _getPeriodsRemaining(fromDate, toDate, frequency) {
    const diffMs = toDate - fromDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    switch (frequency) {
      case FREQUENCIES.DAILY: return Math.max(0, Math.ceil(diffDays));
      case FREQUENCIES.WEEKLY: return Math.max(0, Math.ceil(diffDays / 7));
      case FREQUENCIES.BIWEEKLY: return Math.max(0, Math.ceil(diffDays / 14));
      case FREQUENCIES.MONTHLY: return Math.max(0, Math.ceil(diffDays / 30));
      case FREQUENCIES.QUARTERLY: return Math.max(0, Math.ceil(diffDays / 90));
      default: return 1;
    }
  }

  _getAnnualContribution(amount, frequency) {
    switch (frequency) {
      case FREQUENCIES.DAILY: return amount * 252; // Trading days
      case FREQUENCIES.WEEKLY: return amount * 52;
      case FREQUENCIES.BIWEEKLY: return amount * 26;
      case FREQUENCIES.MONTHLY: return amount * 12;
      case FREQUENCIES.QUARTERLY: return amount * 4;
      default: return amount * 12;
    }
  }

  async _allocateContribution(totalAmount, targetAssets, contributionType, reasonPrefix = '') {
    const signals = [];

    for (const asset of (targetAssets || [])) {
      const amount = totalAmount * (asset.allocation || 0);
      if (amount <= 0) continue;

      const price = await this._getCurrentPrice(asset.symbol);
      if (!price) continue;

      const shares = Math.floor((amount / price) * 10000) / 10000;

      signals.push({
        symbol: asset.symbol,
        action: 'buy',
        amount: amount,
        shares: shares,
        price: price,
        reason: reasonPrefix
          ? `${reasonPrefix}: $${amount.toFixed(2)} into ${asset.symbol}`
          : `Contribution: $${amount.toFixed(2)} into ${asset.symbol}`,
        confidence: 1.0,
        contribution_type: contributionType
      });
    }

    return signals;
  }

  _selectReinvestTarget(targetAssets) {
    // Simple selection - pick first asset or default to VTI
    if (targetAssets && targetAssets.length > 0) {
      return targetAssets[0].symbol;
    }
    return 'VTI';
  }

  /**
   * Update agent's next contribution date after execution
   */
  async updateNextContributionDate(agentId) {
    const agent = await this.getAgent(agentId);
    const config = this._parseConfig(agent.beginner_config);

    const nextDate = this._calculateNextContributionDate(config, new Date());
    config.next_contribution_date = nextDate.toISOString().split('T')[0];

    // For lump_dca, also update remaining amount
    if (config.strategy_type === STRATEGY_TYPES.LUMP_DCA && config.lump_sum_executed) {
      const periodsRemaining = this._getPeriodsRemaining(
        new Date(),
        new Date(config.dca_end_date),
        config.dca_frequency
      );
      if (periodsRemaining > 0) {
        const contributionAmount = config.dca_remaining / (periodsRemaining + 1);
        config.dca_remaining = config.dca_remaining - contributionAmount;
      }
    }

    this.db.prepare(`
      UPDATE trading_agents
      SET beginner_config = ?
      WHERE id = ?
    `).run(JSON.stringify(config), agentId);
  }
}

module.exports = {
  BeginnerStrategyEngine,
  STRATEGY_TYPES,
  FREQUENCIES
};
