// src/services/historical/outcomeCalculator.js
// Calculates investment outcomes for historical decisions

/**
 * OutcomeCalculator
 *
 * Calculates returns and outcomes for investment decisions:
 * - Returns at various intervals (1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y)
 * - Max drawdown and max gain within 1Y
 * - S&P 500 comparison and alpha calculation
 * - Outcome classification (big_winner, winner, neutral, loser, big_loser)
 * - Holding period tracking for closed positions
 */
class OutcomeCalculator {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculate outcomes for a single decision
   */
  async calculateOutcome(decisionId) {
    const decision = this.db.prepare(`
      SELECT * FROM investment_decisions WHERE id = ?
    `).get(decisionId);

    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    if (!decision.company_id) {
      // Can't calculate outcomes without company mapping
      return { decisionId, calculated: false, reason: 'No company mapping' };
    }

    const decisionDate = decision.decision_date;
    const today = new Date().toISOString().split('T')[0];

    // Get entry price
    const entryPrice = await this._getPrice(decision.company_id, decisionDate);
    if (!entryPrice) {
      return { decisionId, calculated: false, reason: 'No entry price available' };
    }

    // Calculate returns at various intervals
    const outcomes = {};

    // 1 Month
    const date1m = this._addDays(decisionDate, 30);
    if (date1m <= today) {
      outcomes.return_1m = await this._calculateReturn(decision.company_id, entryPrice, date1m);
    }

    // 3 Months
    const date3m = this._addDays(decisionDate, 91);
    if (date3m <= today) {
      outcomes.return_3m = await this._calculateReturn(decision.company_id, entryPrice, date3m);
    }

    // 6 Months
    const date6m = this._addDays(decisionDate, 182);
    if (date6m <= today) {
      outcomes.return_6m = await this._calculateReturn(decision.company_id, entryPrice, date6m);
    }

    // 1 Year
    const date1y = this._addDays(decisionDate, 365);
    if (date1y <= today) {
      outcomes.return_1y = await this._calculateReturn(decision.company_id, entryPrice, date1y);

      // Calculate max drawdown and max gain within 1Y
      const drawdownGain = await this._calculateMaxDrawdownGain(
        decision.company_id,
        entryPrice,
        decisionDate,
        date1y
      );
      outcomes.max_drawdown_1y = drawdownGain.maxDrawdown;
      outcomes.max_gain_1y = drawdownGain.maxGain;

      // Get S&P 500 return for alpha calculation
      outcomes.sp500_return_1y = await this._getSP500Return(decisionDate, date1y);

      if (outcomes.return_1y != null && outcomes.sp500_return_1y != null) {
        outcomes.alpha_1y = outcomes.return_1y - outcomes.sp500_return_1y;
        outcomes.beat_market_1y = outcomes.alpha_1y > 0 ? 1 : 0;
      }
    }

    // 2 Years
    const date2y = this._addDays(decisionDate, 730);
    if (date2y <= today) {
      outcomes.return_2y = await this._calculateReturn(decision.company_id, entryPrice, date2y);
    }

    // 3 Years
    const date3y = this._addDays(decisionDate, 1095);
    if (date3y <= today) {
      outcomes.return_3y = await this._calculateReturn(decision.company_id, entryPrice, date3y);
    }

    // 5 Years
    const date5y = this._addDays(decisionDate, 1825);
    if (date5y <= today) {
      outcomes.return_5y = await this._calculateReturn(decision.company_id, entryPrice, date5y);
    }

    // Classify outcome
    if (outcomes.return_1y != null) {
      outcomes.outcome_category = this._classifyOutcome(outcomes.return_1y, outcomes.alpha_1y);
    }

    // Check if position was exited
    const exitInfo = await this._checkExit(decision);
    if (exitInfo.exited) {
      outcomes.still_held = 0;
      outcomes.exit_date = exitInfo.exitDate;
      outcomes.exit_price = exitInfo.exitPrice;
      outcomes.total_return = exitInfo.totalReturn;
      outcomes.holding_period_days = exitInfo.holdingPeriodDays;
      outcomes.annualized_return = exitInfo.annualizedReturn;
    } else {
      outcomes.still_held = 1;
    }

    // Update the decision
    this._updateOutcomes(decisionId, outcomes);

    return { decisionId, calculated: true, outcomes };
  }

  /**
   * Calculate outcomes for all decisions that need updating
   */
  async calculateAllOutcomes(options = {}) {
    const { limit = 1000, minDaysOld = 365, verbose = false } = options;

    const cutoffDate = this._addDays(new Date().toISOString().split('T')[0], -minDaysOld);

    const decisions = this.db.prepare(`
      SELECT id, company_id, decision_date, symbol
      FROM investment_decisions
      WHERE company_id IS NOT NULL
        AND decision_date <= ?
        AND (outcome_calculated_at IS NULL OR return_1y IS NULL)
      ORDER BY decision_date ASC
      LIMIT ?
    `).all(cutoffDate, limit);

    if (verbose) {
      console.log(`📊 Calculating outcomes for ${decisions.length} decisions...`);
    }

    let calculated = 0;
    let errors = 0;

    for (const decision of decisions) {
      try {
        const result = await this.calculateOutcome(decision.id);
        if (result.calculated) calculated++;

        if (verbose && calculated % 100 === 0) {
          console.log(`  Calculated ${calculated}/${decisions.length}`);
        }
      } catch (e) {
        if (verbose) {
          console.error(`Error calculating outcome for ${decision.id}: ${e.message}`);
        }
        errors++;
      }
    }

    if (verbose) {
      console.log(`✅ Calculated ${calculated} outcomes (${errors} errors)`);
    }

    return { calculated, errors, total: decisions.length };
  }

  /**
   * Refresh outcomes for decisions that may have new data
   */
  async refreshOutcomes(options = {}) {
    const { daysOld = 30, limit = 500, verbose = false } = options;

    const cutoffDate = this._addDays(new Date().toISOString().split('T')[0], -daysOld);

    // Find decisions where we might have new interval data
    const decisions = this.db.prepare(`
      SELECT id, decision_date
      FROM investment_decisions
      WHERE company_id IS NOT NULL
        AND outcome_calculated_at < ?
        AND (
          -- Missing 1Y outcome but now old enough
          (return_1y IS NULL AND decision_date <= date('now', '-365 days'))
          OR
          -- Missing 2Y outcome but now old enough
          (return_2y IS NULL AND decision_date <= date('now', '-730 days'))
          OR
          -- Missing 3Y outcome but now old enough
          (return_3y IS NULL AND decision_date <= date('now', '-1095 days'))
        )
      ORDER BY decision_date ASC
      LIMIT ?
    `).all(cutoffDate, limit);

    if (verbose) {
      console.log(`📊 Refreshing outcomes for ${decisions.length} decisions...`);
    }

    let refreshed = 0;
    let errors = 0;

    for (const decision of decisions) {
      try {
        await this.calculateOutcome(decision.id);
        refreshed++;
      } catch (e) {
        errors++;
      }
    }

    if (verbose) {
      console.log(`✅ Refreshed ${refreshed} outcomes (${errors} errors)`);
    }

    return { refreshed, errors };
  }

  /**
   * Calculate investor track record
   */
  async calculateInvestorTrackRecord(investorId, periodType = 'all_time') {
    // Define period filter
    let dateFilter = '';
    switch (periodType) {
      case '1y':
        dateFilter = `AND decision_date >= date('now', '-1 year')`;
        break;
      case '3y':
        dateFilter = `AND decision_date >= date('now', '-3 years')`;
        break;
      case '5y':
        dateFilter = `AND decision_date >= date('now', '-5 years')`;
        break;
      case '10y':
        dateFilter = `AND decision_date >= date('now', '-10 years')`;
        break;
      default:
        dateFilter = '';
    }

    // Get basic statistics
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_decisions,
        SUM(CASE WHEN decision_type = 'new_position' THEN 1 ELSE 0 END) as new_positions,
        SUM(CASE WHEN decision_type = 'increased' THEN 1 ELSE 0 END) as increased_positions,
        SUM(CASE WHEN decision_type = 'decreased' THEN 1 ELSE 0 END) as decreased_positions,
        SUM(CASE WHEN decision_type = 'sold_out' THEN 1 ELSE 0 END) as sold_positions,
        AVG(return_1y) as avg_return_1y,
        AVG(alpha_1y) as avg_alpha_1y,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN beat_market_1y IS NOT NULL THEN 1 END), 0) as win_rate,
        AVG(pe_ratio) as avg_pe_at_purchase,
        AVG(market_cap) as avg_market_cap_at_purchase,
        AVG(holding_period_days) as avg_holding_period_days,
        AVG(portfolio_weight) as avg_position_size,
        MIN(decision_date) as period_start,
        MAX(decision_date) as period_end
      FROM investment_decisions
      WHERE investor_id = ?
        AND return_1y IS NOT NULL
        ${dateFilter}
    `).get(investorId);

    // Get median return
    const returns = this.db.prepare(`
      SELECT return_1y
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL ${dateFilter}
      ORDER BY return_1y
    `).all(investorId);

    const medianReturn = returns.length > 0
      ? returns[Math.floor(returns.length / 2)].return_1y
      : null;

    // Get best and worst picks
    const bestPick = this.db.prepare(`
      SELECT symbol, return_1y
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL ${dateFilter}
      ORDER BY return_1y DESC
      LIMIT 1
    `).get(investorId);

    const worstPick = this.db.prepare(`
      SELECT symbol, return_1y
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL ${dateFilter}
      ORDER BY return_1y ASC
      LIMIT 1
    `).get(investorId);

    // Get sector allocations
    const sectorData = this.db.prepare(`
      SELECT
        sector,
        COUNT(*) as count,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL AND sector IS NOT NULL ${dateFilter}
      GROUP BY sector
      ORDER BY count DESC
    `).all(investorId);

    const sectorAllocations = {};
    const sectorSuccessRates = {};
    const totalSectorDecisions = sectorData.reduce((sum, s) => sum + s.count, 0);
    for (const s of sectorData) {
      sectorAllocations[s.sector] = s.count / totalSectorDecisions;
      sectorSuccessRates[s.sector] = s.success_rate;
    }

    // Get pattern usage
    const patternData = this.db.prepare(`
      SELECT
        ip.pattern_code,
        COUNT(*) as count,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM investment_decisions d
      JOIN investment_patterns ip ON d.primary_pattern_id = ip.id
      WHERE d.investor_id = ? AND d.return_1y IS NOT NULL ${dateFilter}
      GROUP BY ip.pattern_code
      ORDER BY count DESC
    `).all(investorId);

    const patternUsage = {};
    const patternSuccess = {};
    for (const p of patternData) {
      patternUsage[p.pattern_code] = p.count;
      patternSuccess[p.pattern_code] = p.success_rate;
    }

    // Calculate concentration score (Herfindahl index of sector allocation)
    const concentrationScore = Object.values(sectorAllocations)
      .reduce((sum, weight) => sum + weight * weight, 0) * 100;

    // Upsert track record
    this.db.prepare(`
      INSERT INTO investor_track_records (
        investor_id, period_type, period_start, period_end,
        total_decisions, new_positions, increased_positions,
        decreased_positions, sold_positions,
        win_rate, avg_return_1y, median_return_1y, avg_alpha_1y,
        best_pick, best_pick_return, worst_pick, worst_pick_return,
        avg_pe_at_purchase, avg_market_cap_at_purchase,
        avg_holding_period_days, avg_position_size, concentration_score,
        sector_allocations, sector_success_rates,
        pattern_usage, pattern_success,
        calculated_at
      ) VALUES (
        @investor_id, @period_type, @period_start, @period_end,
        @total_decisions, @new_positions, @increased_positions,
        @decreased_positions, @sold_positions,
        @win_rate, @avg_return_1y, @median_return_1y, @avg_alpha_1y,
        @best_pick, @best_pick_return, @worst_pick, @worst_pick_return,
        @avg_pe_at_purchase, @avg_market_cap_at_purchase,
        @avg_holding_period_days, @avg_position_size, @concentration_score,
        @sector_allocations, @sector_success_rates,
        @pattern_usage, @pattern_success,
        datetime('now')
      )
      ON CONFLICT(investor_id, period_type) DO UPDATE SET
        period_start = @period_start,
        period_end = @period_end,
        total_decisions = @total_decisions,
        new_positions = @new_positions,
        increased_positions = @increased_positions,
        decreased_positions = @decreased_positions,
        sold_positions = @sold_positions,
        win_rate = @win_rate,
        avg_return_1y = @avg_return_1y,
        median_return_1y = @median_return_1y,
        avg_alpha_1y = @avg_alpha_1y,
        best_pick = @best_pick,
        best_pick_return = @best_pick_return,
        worst_pick = @worst_pick,
        worst_pick_return = @worst_pick_return,
        avg_pe_at_purchase = @avg_pe_at_purchase,
        avg_market_cap_at_purchase = @avg_market_cap_at_purchase,
        avg_holding_period_days = @avg_holding_period_days,
        avg_position_size = @avg_position_size,
        concentration_score = @concentration_score,
        sector_allocations = @sector_allocations,
        sector_success_rates = @sector_success_rates,
        pattern_usage = @pattern_usage,
        pattern_success = @pattern_success,
        calculated_at = datetime('now')
    `).run({
      investor_id: investorId,
      period_type: periodType,
      period_start: stats.period_start,
      period_end: stats.period_end,
      total_decisions: stats.total_decisions,
      new_positions: stats.new_positions,
      increased_positions: stats.increased_positions,
      decreased_positions: stats.decreased_positions,
      sold_positions: stats.sold_positions,
      win_rate: stats.win_rate,
      avg_return_1y: stats.avg_return_1y,
      median_return_1y: medianReturn,
      avg_alpha_1y: stats.avg_alpha_1y,
      best_pick: bestPick?.symbol,
      best_pick_return: bestPick?.return_1y,
      worst_pick: worstPick?.symbol,
      worst_pick_return: worstPick?.return_1y,
      avg_pe_at_purchase: stats.avg_pe_at_purchase,
      avg_market_cap_at_purchase: stats.avg_market_cap_at_purchase,
      avg_holding_period_days: stats.avg_holding_period_days,
      avg_position_size: stats.avg_position_size,
      concentration_score: concentrationScore,
      sector_allocations: JSON.stringify(sectorAllocations),
      sector_success_rates: JSON.stringify(sectorSuccessRates),
      pattern_usage: JSON.stringify(patternUsage),
      pattern_success: JSON.stringify(patternSuccess)
    });

    return {
      investorId,
      periodType,
      stats,
      medianReturn,
      bestPick,
      worstPick,
      sectorAllocations,
      sectorSuccessRates,
      patternUsage,
      patternSuccess
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get stock price at a specific date
   */
  async _getPrice(companyId, date) {
    const result = this.db.prepare(`
      SELECT close
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `).get(companyId, date);

    return result?.close || null;
  }

  /**
   * Calculate return from entry price to a target date
   */
  async _calculateReturn(companyId, entryPrice, targetDate) {
    const targetPrice = await this._getPrice(companyId, targetDate);
    if (!targetPrice || !entryPrice) return null;

    return ((targetPrice - entryPrice) / entryPrice) * 100;
  }

  /**
   * Calculate max drawdown and max gain within a period
   */
  async _calculateMaxDrawdownGain(companyId, entryPrice, startDate, endDate) {
    const prices = this.db.prepare(`
      SELECT date, close
      FROM daily_prices
      WHERE company_id = ? AND date BETWEEN ? AND ?
      ORDER BY date
    `).all(companyId, startDate, endDate);

    if (prices.length === 0) {
      return { maxDrawdown: null, maxGain: null };
    }

    let maxGain = 0;
    let maxDrawdown = 0;

    for (const price of prices) {
      const returnPct = ((price.close - entryPrice) / entryPrice) * 100;
      if (returnPct > maxGain) maxGain = returnPct;
      if (returnPct < maxDrawdown) maxDrawdown = returnPct;
    }

    return { maxDrawdown, maxGain };
  }

  /**
   * Get S&P 500 return between two dates
   */
  async _getSP500Return(startDate, endDate) {
    // Try SPY first
    const spy = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = 'SPY'
    `).get();

    if (spy) {
      const startPrice = await this._getPrice(spy.id, startDate);
      const endPrice = await this._getPrice(spy.id, endDate);

      if (startPrice && endPrice) {
        return ((endPrice - startPrice) / startPrice) * 100;
      }
    }

    // Try index_prices table
    const startPrice = this.db.prepare(`
      SELECT close FROM index_prices
      WHERE symbol = 'SPY' AND date <= ?
      ORDER BY date DESC LIMIT 1
    `).get(startDate);

    const endPrice = this.db.prepare(`
      SELECT close FROM index_prices
      WHERE symbol = 'SPY' AND date <= ?
      ORDER BY date DESC LIMIT 1
    `).get(endDate);

    if (startPrice?.close && endPrice?.close) {
      return ((endPrice.close - startPrice.close) / startPrice.close) * 100;
    }

    return null;
  }

  /**
   * Check if position was exited
   */
  async _checkExit(decision) {
    // Look for a sold_out decision for the same stock by same investor after this decision
    const exitDecision = this.db.prepare(`
      SELECT decision_date, stock_price
      FROM investment_decisions
      WHERE investor_id = ?
        AND (cusip = ? OR symbol = ?)
        AND decision_type = 'sold_out'
        AND decision_date > ?
      ORDER BY decision_date ASC
      LIMIT 1
    `).get(decision.investor_id, decision.cusip, decision.symbol, decision.decision_date);

    if (!exitDecision) {
      // Check if still held in latest filing
      const latestHolding = this.db.prepare(`
        SELECT filing_date
        FROM investor_holdings
        WHERE investor_id = ?
          AND (cusip = ? OR company_id = ?)
        ORDER BY filing_date DESC
        LIMIT 1
      `).get(decision.investor_id, decision.cusip, decision.company_id);

      if (latestHolding) {
        return { exited: false };
      }
    }

    if (exitDecision) {
      const entryPrice = decision.stock_price || await this._getPrice(decision.company_id, decision.decision_date);
      const exitPrice = exitDecision.stock_price || await this._getPrice(decision.company_id, exitDecision.decision_date);

      let totalReturn = null;
      let annualizedReturn = null;

      if (entryPrice && exitPrice) {
        totalReturn = ((exitPrice - entryPrice) / entryPrice) * 100;

        const holdingDays = this._daysBetween(decision.decision_date, exitDecision.decision_date);
        if (holdingDays > 0) {
          const years = holdingDays / 365;
          annualizedReturn = (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
        }
      }

      return {
        exited: true,
        exitDate: exitDecision.decision_date,
        exitPrice,
        totalReturn,
        holdingPeriodDays: this._daysBetween(decision.decision_date, exitDecision.decision_date),
        annualizedReturn
      };
    }

    return { exited: false };
  }

  /**
   * Classify outcome based on return and alpha
   */
  _classifyOutcome(return1y, alpha1y) {
    if (return1y >= 50) return 'big_winner';
    if (return1y >= 15) return 'winner';
    if (return1y >= -15) return 'neutral';
    if (return1y >= -50) return 'loser';
    return 'big_loser';
  }

  /**
   * Update decision with calculated outcomes
   */
  _updateOutcomes(decisionId, outcomes) {
    const fields = [];
    const values = { id: decisionId };

    for (const [key, value] of Object.entries(outcomes)) {
      if (value !== undefined) {
        fields.push(`${key} = @${key}`);
        values[key] = value;
      }
    }

    fields.push(`outcome_calculated_at = datetime('now')`);
    fields.push(`updated_at = datetime('now')`);

    const sql = `UPDATE investment_decisions SET ${fields.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(values);
  }

  /**
   * Add days to a date string
   */
  _addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate days between two dates
   */
  _daysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }
}

module.exports = OutcomeCalculator;
