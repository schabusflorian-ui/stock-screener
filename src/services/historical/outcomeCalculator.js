// src/services/historical/outcomeCalculator.js
// Calculates investment outcomes for historical decisions
// Supports both SQLite (this.db passed in) and Postgres (getDatabaseAsync when this.db not set)

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

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

  async _getDb() {
    return this.db || await getDatabaseAsync();
  }

  async _pg() {
    const db = await this._getDb();
    return db && db.type === 'postgres';
  }

  /**
   * Calculate outcomes for a single decision
   */
  async calculateOutcome(decisionId) {
    const db = await this._getDb();
    if (!db) throw new Error('Database not available');

    let decision;
    if (await this._pg()) {
      const r = await db.query('SELECT * FROM investment_decisions WHERE id = $1', [decisionId]);
      decision = r.rows[0];
    } else {
      decision = db.prepare('SELECT * FROM investment_decisions WHERE id = ?').get(decisionId);
    }

    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`);
    }

    let companyId = decision.company_id;
    if (!companyId && decision.symbol) {
      companyId = await this._resolveCompanyIdFromSymbol(db, await this._pg(), decision.symbol);
      if (companyId) {
        await this._setDecisionCompanyId(db, await this._pg(), decisionId, companyId);
        decision.company_id = companyId;
      }
    }
    if (!companyId) {
      return { decisionId, calculated: false, reason: 'No company mapping (symbol not in companies)' };
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
    await this._updateOutcomes(decisionId, outcomes);

    return { decisionId, calculated: true, outcomes };
  }

  /**
   * Calculate outcomes for all decisions that need updating
   */
  async calculateAllOutcomes(options = {}) {
    const { limit = 1000, minDaysOld = 365, verbose = false } = options;

    const db = await this._getDb();
    if (!db) throw new Error('Database not available');

    const cutoffDate = this._addDays(new Date().toISOString().split('T')[0], -minDaysOld);

    let decisions;
    if (await this._pg()) {
      const r = await db.query(`
        SELECT id, company_id, decision_date, symbol
        FROM investment_decisions
        WHERE (company_id IS NOT NULL OR symbol IS NOT NULL) AND decision_date <= $1
          AND (outcome_calculated_at IS NULL OR return_1y IS NULL)
        ORDER BY decision_date ASC LIMIT $2
      `, [cutoffDate, limit]);
      decisions = r.rows;
    } else {
      decisions = db.prepare(`
        SELECT id, company_id, decision_date, symbol
        FROM investment_decisions
        WHERE (company_id IS NOT NULL OR symbol IS NOT NULL) AND decision_date <= ?
          AND (outcome_calculated_at IS NULL OR return_1y IS NULL)
        ORDER BY decision_date ASC LIMIT ?
      `).all(cutoffDate, limit);
    }

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

    const db = await this._getDb();
    if (!db) throw new Error('Database not available');

    const cutoffDate = this._addDays(new Date().toISOString().split('T')[0], -daysOld);

    let decisions;
    if (await this._pg()) {
      const r = await db.query(`
        SELECT id, decision_date
        FROM investment_decisions
        WHERE company_id IS NOT NULL AND outcome_calculated_at < $1
          AND (
            (return_1y IS NULL AND decision_date <= (CURRENT_DATE - INTERVAL '365 days')::date)
            OR (return_2y IS NULL AND decision_date <= (CURRENT_DATE - INTERVAL '730 days')::date)
            OR (return_3y IS NULL AND decision_date <= (CURRENT_DATE - INTERVAL '1095 days')::date)
          )
        ORDER BY decision_date ASC LIMIT $2
      `, [cutoffDate, limit]);
      decisions = r.rows;
    } else {
      decisions = db.prepare(`
        SELECT id, decision_date
        FROM investment_decisions
        WHERE company_id IS NOT NULL AND outcome_calculated_at < ?
          AND (
            (return_1y IS NULL AND decision_date <= date('now', '-365 days'))
            OR (return_2y IS NULL AND decision_date <= date('now', '-730 days'))
            OR (return_3y IS NULL AND decision_date <= date('now', '-1095 days'))
          )
        ORDER BY decision_date ASC LIMIT ?
      `).all(cutoffDate, limit);
    }

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
        dateFilter = 'AND decision_date >= date(\'now\', \'-1 year\')';
        break;
      case '3y':
        dateFilter = 'AND decision_date >= date(\'now\', \'-3 years\')';
        break;
      case '5y':
        dateFilter = 'AND decision_date >= date(\'now\', \'-5 years\')';
        break;
      case '10y':
        dateFilter = 'AND decision_date >= date(\'now\', \'-10 years\')';
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
  /**
   * Resolve company_id from symbol (companies table). Used when decision has symbol but no company_id.
   */
  async _resolveCompanyIdFromSymbol(db, isPg, symbol) {
    if (!symbol || !db) return null;
    if (isPg) {
      const r = await db.query('SELECT id FROM companies WHERE symbol = $1 LIMIT 1', [symbol]);
      return r.rows[0]?.id ?? null;
    }
    const row = db.prepare('SELECT id FROM companies WHERE symbol = ? LIMIT 1').get(symbol);
    return row?.id ?? null;
  }

  /**
   * Persist company_id on investment_decisions when we resolved it from symbol.
   */
  async _setDecisionCompanyId(db, isPg, decisionId, companyId) {
    if (!db || !decisionId || !companyId) return;
    if (isPg) {
      await db.query('UPDATE investment_decisions SET company_id = $1, updated_at = NOW() WHERE id = $2', [companyId, decisionId]);
    } else {
      db.prepare('UPDATE investment_decisions SET company_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(companyId, decisionId);
    }
  }

  async _getPrice(companyId, date) {
    const db = await this._getDb();
    if (!db) return null;
    if (await this._pg()) {
      const r = await db.query(`
        SELECT close FROM daily_prices
        WHERE company_id = $1 AND date <= $2
        ORDER BY date DESC LIMIT 1
      `, [companyId, date]);
      return r.rows[0]?.close ?? null;
    }
    const result = db.prepare(`
      SELECT close FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC LIMIT 1
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
    const db = await this._getDb();
    if (!db) return { maxDrawdown: null, maxGain: null };
    let prices;
    if (await this._pg()) {
      const r = await db.query(`
        SELECT date, close FROM daily_prices
        WHERE company_id = $1 AND date BETWEEN $2 AND $3
        ORDER BY date
      `, [companyId, startDate, endDate]);
      prices = r.rows;
    } else {
      prices = db.prepare(`
        SELECT date, close FROM daily_prices
        WHERE company_id = ? AND date BETWEEN ? AND ?
        ORDER BY date
      `).all(companyId, startDate, endDate);
    }

    if (!prices.length) return { maxDrawdown: null, maxGain: null };

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
    const db = await this._getDb();
    if (!db) return null;

    if (await this._pg()) {
      const spyRes = await db.query("SELECT id FROM companies WHERE symbol = 'SPY' LIMIT 1");
      const spy = spyRes.rows[0];
      if (spy) {
        const startPrice = await this._getPrice(spy.id, startDate);
        const endPrice = await this._getPrice(spy.id, endDate);
        if (startPrice != null && endPrice != null) return ((endPrice - startPrice) / startPrice) * 100;
      }
      try {
        const s = await db.query(`
          SELECT close FROM index_prices WHERE symbol = 'SPY' AND date <= $1 ORDER BY date DESC LIMIT 1
        `, [startDate]);
        const e = await db.query(`
          SELECT close FROM index_prices WHERE symbol = 'SPY' AND date <= $1 ORDER BY date DESC LIMIT 1
        `, [endDate]);
        const startClose = s.rows[0]?.close;
        const endClose = e.rows[0]?.close;
        if (startClose != null && endClose != null) return ((endClose - startClose) / startClose) * 100;
      } catch (_) { /* index_prices may not exist */ }
      return null;
    }

    const spy = db.prepare("SELECT id FROM companies WHERE symbol = 'SPY'").get();
    if (spy) {
      const startPrice = await this._getPrice(spy.id, startDate);
      const endPrice = await this._getPrice(spy.id, endDate);
      if (startPrice != null && endPrice != null) return ((endPrice - startPrice) / startPrice) * 100;
    }
    try {
      const startPrice = db.prepare(`
        SELECT close FROM index_prices WHERE symbol = 'SPY' AND date <= ? ORDER BY date DESC LIMIT 1
      `).get(startDate);
      const endPrice = db.prepare(`
        SELECT close FROM index_prices WHERE symbol = 'SPY' AND date <= ? ORDER BY date DESC LIMIT 1
      `).get(endDate);
      if (startPrice?.close != null && endPrice?.close != null) return ((endPrice.close - startPrice.close) / startPrice.close) * 100;
    } catch (_) { /* index_prices may not exist */ }
    return null;
  }

  /**
   * Check if position was exited
   */
  async _checkExit(decision) {
    const db = await this._getDb();
    if (!db) return { exited: false };

    let exitDecision;
    if (await this._pg()) {
      const r = await db.query(`
        SELECT decision_date, stock_price
        FROM investment_decisions
        WHERE investor_id = $1 AND (cusip = $2 OR symbol = $3) AND decision_type = 'sold_out' AND decision_date > $4
        ORDER BY decision_date ASC LIMIT 1
      `, [decision.investor_id, decision.cusip || null, decision.symbol, decision.decision_date]);
      exitDecision = r.rows[0];
      if (!exitDecision) {
        try {
          const h = await db.query(`
            SELECT filing_date FROM investor_holdings
            WHERE investor_id = $1 AND (cusip = $2 OR company_id = $3)
            ORDER BY filing_date DESC LIMIT 1
          `, [decision.investor_id, decision.cusip || null, decision.company_id]);
          if (h.rows[0]) return { exited: false };
        } catch (_) { /* investor_holdings may not exist */ }
      }
    } else {
      exitDecision = db.prepare(`
        SELECT decision_date, stock_price FROM investment_decisions
        WHERE investor_id = ? AND (cusip = ? OR symbol = ?) AND decision_type = 'sold_out' AND decision_date > ?
        ORDER BY decision_date ASC LIMIT 1
      `).get(decision.investor_id, decision.cusip, decision.symbol, decision.decision_date);
      if (!exitDecision) {
        const latestHolding = db.prepare(`
          SELECT filing_date FROM investor_holdings
          WHERE investor_id = ? AND (cusip = ? OR company_id = ?)
          ORDER BY filing_date DESC LIMIT 1
        `).get(decision.investor_id, decision.cusip, decision.company_id);
        if (latestHolding) return { exited: false };
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
  async _updateOutcomes(decisionId, outcomes) {
    const db = await this._getDb();
    if (!db) return;

    const entries = Object.entries(outcomes).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    if (await this._pg()) {
      const setParts = [];
      const params = [];
      let i = 1;
      for (const [key, value] of entries) {
        setParts.push(`${key} = $${i++}`);
        params.push(value);
      }
      setParts.push("outcome_calculated_at = NOW()", "updated_at = NOW()");
      params.push(decisionId);
      const sql = `UPDATE investment_decisions SET ${setParts.join(', ')} WHERE id = $${i}`;
      await db.query(sql, params);
      return;
    }

    const fields = [];
    const values = { id: decisionId };
    for (const [key, value] of entries) {
      fields.push(`${key} = @${key}`);
      values[key] = value;
    }
    fields.push('outcome_calculated_at = datetime(\'now\')', 'updated_at = datetime(\'now\')');
    const sql = `UPDATE investment_decisions SET ${fields.join(', ')} WHERE id = @id`;
    db.prepare(sql).run(values);
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
