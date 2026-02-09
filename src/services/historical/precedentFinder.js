// src/services/historical/precedentFinder.js
// Finds historical precedents similar to current investment situations

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * PrecedentFinder
 *
 * Finds similar historical situations for current stock analysis by:
 * 1. Comparing current metrics to historical decision metrics
 * 2. Finding what famous investors did in similar situations
 * 3. Identifying sector/valuation combinations with historical outcomes
 * 4. Building similarity scores across multiple dimensions
 */
class PrecedentFinder {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Find historical precedents similar to a current stock
   */
  async findPrecedents(symbol, options = {}) {
    const { limit = 10, minSimilarity = 0.4, includeOutcomes = true } = options;

    // Get current stock metrics
    const currentMetrics = await this._getCurrentMetrics(symbol);
    if (!currentMetrics) {
      return { symbol, error: 'Stock not found or no metrics available' };
    }

    // Find similar historical decisions
    const candidates = await this._findCandidateDecisions(currentMetrics, limit * 5);

    // Score each candidate for similarity
    const scored = candidates.map(candidate => {
      const similarity = this._calculateSimilarity(currentMetrics, candidate);
      return {
        ...candidate,
        similarity
      };
    }).filter(c => c.similarity.overall >= minSimilarity);

    // Sort by overall similarity
    scored.sort((a, b) => b.similarity.overall - a.similarity.overall);

    // Take top results
    const results = scored.slice(0, limit);

    // Group by outcome for summary
    const outcomeSummary = this._summarizeOutcomes(results);

    // Get what happened in similar situations
    const historicalOutcomes = includeOutcomes
      ? this._aggregateHistoricalOutcomes(results)
      : null;

    return {
      symbol,
      currentMetrics: {
        pe_ratio: currentMetrics.pe_ratio,
        pb_ratio: currentMetrics.pb_ratio,
        roic: currentMetrics.roic,
        revenue_growth: currentMetrics.revenue_growth_yoy,
        sector: currentMetrics.sector
      },
      precedentCount: results.length,
      precedents: results.map(r => ({
        symbol: r.symbol,
        investor: r.investor_name,
        decisionDate: r.decision_date,
        decisionType: r.decision_type,
        similarity: r.similarity,
        metricsAtDecision: {
          pe_ratio: r.pe_ratio,
          pb_ratio: r.pb_ratio,
          roic: r.roic,
          revenue_growth: r.revenue_growth_yoy
        },
        outcome: {
          return_1y: r.return_1y,
          alpha_1y: r.alpha_1y,
          outcome_category: r.outcome_category,
          beat_market: r.beat_market_1y
        }
      })),
      outcomeSummary,
      historicalOutcomes
    };
  }

  /**
   * Find what famous investors did in similar situations
   */
  async findSimilarDecisions(symbol, options = {}) {
    const { limit = 20, decisionTypes = null, investorStyles = null } = options;

    const currentMetrics = await this._getCurrentMetrics(symbol);
    if (!currentMetrics) {
      return { symbol, error: 'Stock not found or no metrics available' };
    }

    // Build query for similar decisions
    const database = await getDatabaseAsync();
    let query = `
      SELECT
        d.*,
        fi.name as investor_name,
        fi.fund_name,
        fi.investment_style,
        ip.pattern_name,
        ip.pattern_code
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      LEFT JOIN investment_patterns ip ON d.primary_pattern_id = ip.id
      WHERE d.return_1y IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    // Filter by sector (important for comparability)
    if (currentMetrics.sector) {
      query += ` AND d.sector = $${paramIndex}`;
      params.push(currentMetrics.sector);
      paramIndex++;
    }

    // Filter by decision types if specified
    if (decisionTypes && decisionTypes.length > 0) {
      query += ` AND d.decision_type IN (${decisionTypes.map(() => `$${paramIndex++}`).join(',')})`;
      params.push(...decisionTypes);
    }

    // Filter by investor styles if specified
    if (investorStyles && investorStyles.length > 0) {
      query += ` AND fi.investment_style IN (${investorStyles.map(() => `$${paramIndex++}`).join(',')})`;
      params.push(...investorStyles);
    }

    // Similar valuation range (P/E within 50%)
    if (currentMetrics.pe_ratio) {
      query += ` AND d.pe_ratio BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(currentMetrics.pe_ratio * 0.5, currentMetrics.pe_ratio * 1.5);
      paramIndex += 2;
    }

    query += ` ORDER BY d.decision_date DESC LIMIT $${paramIndex}`;
    params.push(limit * 2);

    const result = await database.query(query, params);
    const decisions = result.rows;

    // Score and rank by similarity
    const scored = decisions.map(d => ({
      ...d,
      similarity: this._calculateSimilarity(currentMetrics, d)
    }));

    scored.sort((a, b) => b.similarity.overall - a.similarity.overall);

    // Group by investor for insights
    const byInvestor = {};
    for (const d of scored.slice(0, limit)) {
      if (!byInvestor[d.investor_name]) {
        byInvestor[d.investor_name] = {
          investor: d.investor_name,
          style: d.investment_style,
          decisions: []
        };
      }
      byInvestor[d.investor_name].decisions.push({
        symbol: d.symbol,
        date: d.decision_date,
        type: d.decision_type,
        return_1y: d.return_1y,
        pattern: d.pattern_name
      });
    }

    return {
      symbol,
      currentContext: {
        pe_ratio: currentMetrics.pe_ratio,
        sector: currentMetrics.sector,
        market_cap_tier: this._getMarketCapTier(currentMetrics.market_cap)
      },
      similarDecisions: scored.slice(0, limit).map(d => ({
        investor: d.investor_name,
        investorStyle: d.investment_style,
        symbol: d.symbol,
        date: d.decision_date,
        decisionType: d.decision_type,
        pattern: d.pattern_name,
        similarity: d.similarity.overall,
        outcome: {
          return_1y: d.return_1y,
          alpha_1y: d.alpha_1y,
          category: d.outcome_category
        }
      })),
      byInvestor: Object.values(byInvestor),
      summary: this._summarizeInvestorDecisions(scored.slice(0, limit))
    };
  }

  /**
   * Get historical precedents for a sector/valuation combination
   */
  async getSectorPrecedents(sector, valuationTier, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 20, marketCycle = null } = options;

    const valuationRange = this._getValuationRange(valuationTier);

    let query = `
      SELECT
        d.*,
        fi.name as investor_name,
        fi.investment_style
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.sector = $1
        AND d.pe_ratio BETWEEN $2 AND $3
        AND d.return_1y IS NOT NULL
    `;

    const params = [sector, valuationRange.min, valuationRange.max];
    let paramIndex = 4;

    if (marketCycle) {
      query += ` AND d.market_cycle = $${paramIndex}`;
      params.push(marketCycle);
      paramIndex++;
    }

    query += ` ORDER BY d.decision_date DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await database.query(query, params);
    const decisions = result.rows;

    // Calculate aggregate statistics
    const stats = {
      count: decisions.length,
      avgReturn1Y: decisions.reduce((s, d) => s + (d.return_1y || 0), 0) / decisions.length,
      avgAlpha1Y: decisions.reduce((s, d) => s + (d.alpha_1y || 0), 0) / decisions.length,
      winRate: decisions.filter(d => d.beat_market_1y).length / decisions.length * 100,
      outcomeDistribution: this._getOutcomeDistribution(decisions)
    };

    return {
      sector,
      valuationTier,
      valuationRange,
      marketCycle,
      stats,
      decisions: decisions.map(d => ({
        symbol: d.symbol,
        date: d.decision_date,
        investor: d.investor_name,
        pe_ratio: d.pe_ratio,
        return_1y: d.return_1y,
        alpha_1y: d.alpha_1y,
        outcome: d.outcome_category
      })),
      insights: this._generateSectorInsights(sector, valuationTier, stats, decisions)
    };
  }

  /**
   * Create a historical precedent record for storage
   */
  async createPrecedent(symbol, date, options = {}) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, name, sector, industry FROM companies WHERE symbol = $1
    `, [symbol]);

    const company = companyResult.rows[0];

    if (!company) {
      throw new Error(`Company not found: ${symbol}`);
    }

    // Get metrics at that date
    const metricsResult = await database.query(`
      SELECT *
      FROM calculated_metrics
      WHERE company_id = $1 AND fiscal_period <= $2
      ORDER BY fiscal_period DESC
      LIMIT 1
    `, [company.id, date]);

    const metrics = metricsResult.rows[0];

    const priceResult = await database.query(`
      SELECT close
      FROM daily_prices
      WHERE company_id = $1 AND date <= $2
      ORDER BY date DESC
      LIMIT 1
    `, [company.id, date]);

    const price = priceResult.rows[0];

    // Calculate outcomes
    const outcomes = await this._calculatePrecedentOutcomes(company.id, date, price?.close);

    // Determine what famous investors did
    const dateInterval = isUsingPostgres()
      ? `d.decision_date BETWEEN $2::date - INTERVAL '90 days' AND $2::date + INTERVAL '90 days'`
      : `d.decision_date BETWEEN date($2, '-90 days') AND date($2, '+90 days')`;

    const investorActionsResult = await database.query(`
      SELECT
        fi.name as investor_name,
        d.decision_type,
        d.decision_date
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.company_id = $1
        AND ${dateInterval}
    `, [company.id, date]);

    const investorActions = investorActionsResult.rows;

    const investorsWhoBought = investorActions
      .filter(a => a.decision_type === 'new_position' || a.decision_type === 'increased')
      .map(a => ({ name: a.investor_name, date: a.decision_date }));

    const investorsWhoSold = investorActions
      .filter(a => a.decision_type === 'sold_out' || a.decision_type === 'decreased')
      .map(a => ({ name: a.investor_name, date: a.decision_date }));

    // Generate situation summary
    const situationType = this._classifySituation(metrics);
    const situationSummary = this._generateSituationSummary(symbol, company.name, metrics, price?.close);

    // Calculate outcome category
    const outcomeCategory = outcomes.outcome_1y
      ? this._classifyOutcome(outcomes.outcome_1y)
      : null;

    // Insert precedent
    const outcomesSummary = outcomes.outcome_1y
      ? `${outcomes.outcome_1y > 0 ? '+' : ''}${outcomes.outcome_1y.toFixed(1)}% in 1 year`
      : null;

    const nowFunction = isUsingPostgres() ? 'NOW()' : "datetime('now')";
    const upsertSQL = isUsingPostgres()
      ? `INSERT INTO historical_precedents (
          symbol, company_name, precedent_date,
          situation_type, situation_summary,
          price, market_cap, pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
          revenue_growth, earnings_growth, roic, roe, net_margin, debt_to_equity, fcf_yield,
          sector, industry,
          outcome_1y, outcome_3y, outcome_5y, max_drawdown_1y, sp500_return_1y, alpha_1y,
          outcome_summary, outcome_category,
          investors_who_bought, investors_who_sold,
          tags, data_quality_score,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, ${nowFunction}, ${nowFunction}
        ) ON CONFLICT (symbol, precedent_date) DO UPDATE SET
          situation_type = EXCLUDED.situation_type,
          situation_summary = EXCLUDED.situation_summary,
          updated_at = ${nowFunction}`
      : `INSERT OR REPLACE INTO historical_precedents (
          symbol, company_name, precedent_date,
          situation_type, situation_summary,
          price, market_cap, pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
          revenue_growth, earnings_growth, roic, roe, net_margin, debt_to_equity, fcf_yield,
          sector, industry,
          outcome_1y, outcome_3y, outcome_5y, max_drawdown_1y, sp500_return_1y, alpha_1y,
          outcome_summary, outcome_category,
          investors_who_bought, investors_who_sold,
          tags, data_quality_score,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, ${nowFunction}, ${nowFunction}
        )`;

    await database.query(upsertSQL, [
      symbol,
      company.name,
      date,
      situationType,
      situationSummary,
      price?.close,
      metrics?.market_cap,
      metrics?.pe_ratio,
      metrics?.pb_ratio,
      metrics?.ps_ratio,
      metrics?.ev_ebitda,
      metrics?.revenue_growth_yoy,
      metrics?.earnings_growth_yoy,
      metrics?.roic,
      metrics?.roe,
      metrics?.net_margin,
      metrics?.debt_to_equity,
      metrics?.fcf_yield,
      company.sector,
      company.industry,
      outcomes.outcome_1y,
      outcomes.outcome_3y,
      outcomes.outcome_5y,
      outcomes.max_drawdown_1y,
      outcomes.sp500_return_1y,
      outcomes.alpha_1y,
      outcomesSummary,
      outcomeCategory,
      JSON.stringify(investorsWhoBought),
      JSON.stringify(investorsWhoSold),
      JSON.stringify(this._generateTags(metrics, company.sector)),
      this._calculateDataQuality(metrics, outcomes)
    ]);

    return { symbol, date, created: true };
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Get current metrics for a stock
   */
  async _getCurrentMetrics(symbol) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, name, sector, industry, market_cap
      FROM companies
      WHERE symbol = $1
    `, [symbol.toUpperCase()]);

    const company = companyResult.rows[0];

    if (!company) return null;

    const metricsResult = await database.query(`
      SELECT *
      FROM calculated_metrics
      WHERE company_id = $1
      ORDER BY fiscal_period DESC
      LIMIT 1
    `, [company.id]);

    const metrics = metricsResult.rows[0];

    const priceResult = await database.query(`
      SELECT close
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [company.id]);

    const price = priceResult.rows[0];

    return {
      company_id: company.id,
      symbol,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      market_cap: company.market_cap,
      price: price?.close,
      ...metrics
    };
  }

  /**
   * Find candidate historical decisions to compare
   */
  async _findCandidateDecisions(currentMetrics, limit) {
    const database = await getDatabaseAsync();
    const params = [];
    const conditions = ['d.return_1y IS NOT NULL'];
    let paramIndex = 1;

    // Same sector is highly relevant
    if (currentMetrics.sector) {
      conditions.push(`d.sector = $${paramIndex}`);
      params.push(currentMetrics.sector);
      paramIndex++;
    }

    const query = `
      SELECT
        d.*,
        fi.name as investor_name,
        fi.investment_style
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.decision_date DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Calculate similarity between current metrics and a historical decision
   */
  _calculateSimilarity(current, historical) {
    const scores = {};

    // Valuation similarity (P/E, P/B, FCF yield)
    scores.valuation = this._calculateMetricSimilarity([
      { current: current.pe_ratio, historical: historical.pe_ratio, weight: 3 },
      { current: current.pb_ratio, historical: historical.pb_ratio, weight: 2 },
      { current: current.fcf_yield, historical: historical.fcf_yield, weight: 2 }
    ]);

    // Growth similarity
    scores.growth = this._calculateMetricSimilarity([
      { current: current.revenue_growth_yoy, historical: historical.revenue_growth_yoy, weight: 3 },
      { current: current.earnings_growth_yoy, historical: historical.earnings_growth_yoy, weight: 2 }
    ]);

    // Quality similarity (ROIC, ROE, margins)
    scores.quality = this._calculateMetricSimilarity([
      { current: current.roic, historical: historical.roic, weight: 3 },
      { current: current.roe, historical: historical.roe, weight: 2 },
      { current: current.net_margin, historical: historical.net_margin, weight: 2 }
    ]);

    // Safety similarity (debt, coverage)
    scores.safety = this._calculateMetricSimilarity([
      { current: current.debt_to_equity, historical: historical.debt_to_equity, weight: 2 },
      { current: current.current_ratio, historical: historical.current_ratio, weight: 1 }
    ]);

    // Context similarity (sector match is already filtered, so add market cap tier)
    const currentTier = this._getMarketCapTier(current.market_cap);
    const historicalTier = this._getMarketCapTier(historical.market_cap);
    scores.context = currentTier === historicalTier ? 1.0 : 0.5;

    // Overall weighted average
    const weights = { valuation: 0.3, growth: 0.25, quality: 0.25, safety: 0.1, context: 0.1 };
    let overall = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (scores[key] != null) {
        overall += scores[key] * weight;
        totalWeight += weight;
      }
    }

    scores.overall = totalWeight > 0 ? overall / totalWeight : 0;

    return scores;
  }

  /**
   * Calculate similarity for a set of metrics
   */
  _calculateMetricSimilarity(metrics) {
    let totalWeight = 0;
    let weightedSimilarity = 0;

    for (const m of metrics) {
      if (m.current == null || m.historical == null) continue;

      const similarity = this._singleMetricSimilarity(m.current, m.historical);
      weightedSimilarity += similarity * m.weight;
      totalWeight += m.weight;
    }

    return totalWeight > 0 ? weightedSimilarity / totalWeight : null;
  }

  /**
   * Calculate similarity between two numeric values
   */
  _singleMetricSimilarity(a, b) {
    if (a === 0 && b === 0) return 1;
    if (a === 0 || b === 0) return 0.5;

    const ratio = Math.min(a, b) / Math.max(a, b);
    return Math.max(0, ratio);  // 1 = identical, 0 = completely different
  }

  /**
   * Get market cap tier
   */
  _getMarketCapTier(marketCap) {
    if (!marketCap) return 'unknown';
    if (marketCap >= 200e9) return 'mega';
    if (marketCap >= 10e9) return 'large';
    if (marketCap >= 2e9) return 'mid';
    if (marketCap >= 300e6) return 'small';
    return 'micro';
  }

  /**
   * Get valuation range for a tier
   */
  _getValuationRange(tier) {
    const ranges = {
      'very_cheap': { min: 0, max: 10 },
      'cheap': { min: 8, max: 15 },
      'fair': { min: 12, max: 22 },
      'expensive': { min: 20, max: 35 },
      'very_expensive': { min: 30, max: 100 }
    };
    return ranges[tier] || ranges.fair;
  }

  /**
   * Summarize outcomes from precedents
   */
  _summarizeOutcomes(precedents) {
    if (precedents.length === 0) return null;

    const withOutcomes = precedents.filter(p => p.return_1y != null);
    if (withOutcomes.length === 0) return null;

    return {
      count: withOutcomes.length,
      avgReturn1Y: withOutcomes.reduce((s, p) => s + p.return_1y, 0) / withOutcomes.length,
      avgAlpha1Y: withOutcomes.reduce((s, p) => s + (p.alpha_1y || 0), 0) / withOutcomes.length,
      winRate: withOutcomes.filter(p => p.beat_market_1y).length / withOutcomes.length * 100,
      distribution: this._getOutcomeDistribution(withOutcomes)
    };
  }

  /**
   * Get outcome distribution
   */
  _getOutcomeDistribution(decisions) {
    const distribution = {
      big_winner: 0,
      winner: 0,
      neutral: 0,
      loser: 0,
      big_loser: 0
    };

    for (const d of decisions) {
      if (d.outcome_category && distribution[d.outcome_category] !== undefined) {
        distribution[d.outcome_category]++;
      }
    }

    return distribution;
  }

  /**
   * Aggregate historical outcomes
   */
  _aggregateHistoricalOutcomes(precedents) {
    const outcomes = precedents.filter(p => p.return_1y != null);
    if (outcomes.length === 0) return null;

    return {
      bigWinnerPct: (outcomes.filter(p => p.return_1y >= 50).length / outcomes.length * 100).toFixed(1),
      winnerPct: (outcomes.filter(p => p.return_1y >= 15 && p.return_1y < 50).length / outcomes.length * 100).toFixed(1),
      neutralPct: (outcomes.filter(p => p.return_1y > -15 && p.return_1y < 15).length / outcomes.length * 100).toFixed(1),
      loserPct: (outcomes.filter(p => p.return_1y <= -15 && p.return_1y > -50).length / outcomes.length * 100).toFixed(1),
      bigLoserPct: (outcomes.filter(p => p.return_1y <= -50).length / outcomes.length * 100).toFixed(1),
      medianReturn: this._getMedian(outcomes.map(p => p.return_1y)),
      bestCase: Math.max(...outcomes.map(p => p.return_1y)),
      worstCase: Math.min(...outcomes.map(p => p.return_1y))
    };
  }

  /**
   * Summarize investor decisions
   */
  _summarizeInvestorDecisions(decisions) {
    const byStyle = {};
    for (const d of decisions) {
      if (!byStyle[d.investment_style]) {
        byStyle[d.investment_style] = { count: 0, returns: [] };
      }
      byStyle[d.investment_style].count++;
      if (d.return_1y != null) {
        byStyle[d.investment_style].returns.push(d.return_1y);
      }
    }

    return {
      totalDecisions: decisions.length,
      byStyle: Object.entries(byStyle).map(([style, data]) => ({
        style,
        count: data.count,
        avgReturn: data.returns.length > 0
          ? data.returns.reduce((s, r) => s + r, 0) / data.returns.length
          : null
      }))
    };
  }

  /**
   * Generate sector-specific insights
   */
  _generateSectorInsights(sector, valuationTier, stats, decisions) {
    const insights = [];

    if (stats.winRate > 60) {
      insights.push(`Historically, ${valuationTier} ${sector} stocks have beaten the market ${stats.winRate.toFixed(0)}% of the time.`);
    } else if (stats.winRate < 40) {
      insights.push(`Caution: ${valuationTier} ${sector} stocks have only beaten the market ${stats.winRate.toFixed(0)}% of the time historically.`);
    }

    if (stats.avgAlpha1Y > 5) {
      insights.push(`Average alpha of +${stats.avgAlpha1Y.toFixed(1)}% suggests this is a favorable setup.`);
    } else if (stats.avgAlpha1Y < -5) {
      insights.push(`Historical average alpha of ${stats.avgAlpha1Y.toFixed(1)}% is concerning.`);
    }

    // Check for famous investor activity
    const investorTypes = [...new Set(decisions.map(d => d.investment_style))];
    if (investorTypes.includes('value') && valuationTier !== 'expensive') {
      insights.push('Value investors have shown interest in similar situations.');
    }

    return insights;
  }

  /**
   * Calculate precedent outcomes
   */
  async _calculatePrecedentOutcomes(companyId, date, entryPrice) {
    if (!entryPrice) return {};

    const outcomes = {};

    // 1 Year
    const date1y = this._addDays(date, 365);
    const price1y = await this._getPrice(companyId, date1y);
    if (price1y) {
      outcomes.outcome_1y = ((price1y - entryPrice) / entryPrice) * 100;
    }

    // 3 Years
    const date3y = this._addDays(date, 1095);
    const price3y = await this._getPrice(companyId, date3y);
    if (price3y) {
      outcomes.outcome_3y = ((price3y - entryPrice) / entryPrice) * 100;
    }

    // 5 Years
    const date5y = this._addDays(date, 1825);
    const price5y = await this._getPrice(companyId, date5y);
    if (price5y) {
      outcomes.outcome_5y = ((price5y - entryPrice) / entryPrice) * 100;
    }

    // S&P 500 return for comparison
    outcomes.sp500_return_1y = await this._getSP500Return(date, date1y);
    if (outcomes.outcome_1y != null && outcomes.sp500_return_1y != null) {
      outcomes.alpha_1y = outcomes.outcome_1y - outcomes.sp500_return_1y;
    }

    // Max drawdown
    outcomes.max_drawdown_1y = await this._getMaxDrawdown(companyId, entryPrice, date, date1y);

    return outcomes;
  }

  async _getPrice(companyId, date) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT close FROM daily_prices
      WHERE company_id = $1 AND date <= $2
      ORDER BY date DESC LIMIT 1
    `, [companyId, date]);
    return result.rows[0]?.close;
  }

  async _getSP500Return(startDate, endDate) {
    const database = await getDatabaseAsync();
    const spyResult = await database.query(`
      SELECT id FROM companies WHERE symbol = 'SPY'
    `);
    const spy = spyResult.rows[0];

    if (!spy) return null;

    const startPrice = await this._getPrice(spy.id, startDate);
    const endPrice = await this._getPrice(spy.id, endDate);

    if (startPrice && endPrice) {
      return ((endPrice - startPrice) / startPrice) * 100;
    }
    return null;
  }

  async _getMaxDrawdown(companyId, entryPrice, startDate, endDate) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT close FROM daily_prices
      WHERE company_id = $1 AND date BETWEEN $2 AND $3
      ORDER BY close ASC LIMIT 1
    `, [companyId, startDate, endDate]);

    const prices = result.rows[0];

    if (prices?.close && entryPrice) {
      return ((prices.close - entryPrice) / entryPrice) * 100;
    }
    return null;
  }

  _addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  _getMedian(arr) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _classifySituation(metrics) {
    if (!metrics) return 'unknown';

    if (metrics.pe_ratio < 10 && metrics.pb_ratio < 1.5) return 'deep_value';
    if (metrics.pe_ratio > 40 && metrics.revenue_growth_yoy > 30) return 'high_growth_premium';
    if (metrics.roic > 20 && metrics.revenue_growth_yoy > 10) return 'quality_growth';
    if (metrics.pe_ratio < 15 && metrics.roic > 15) return 'quality_value';
    if (metrics.dividend_yield > 4) return 'high_yield';
    return 'general';
  }

  _classifyOutcome(return1y) {
    if (return1y >= 50) return 'big_winner';
    if (return1y >= 15) return 'winner';
    if (return1y >= -15) return 'neutral';
    if (return1y >= -50) return 'loser';
    return 'big_loser';
  }

  _generateSituationSummary(symbol, name, metrics, price) {
    const parts = [];

    if (metrics?.pe_ratio) {
      parts.push(`P/E of ${metrics.pe_ratio.toFixed(1)}`);
    }
    if (metrics?.revenue_growth_yoy) {
      parts.push(`${metrics.revenue_growth_yoy > 0 ? '+' : ''}${metrics.revenue_growth_yoy.toFixed(1)}% revenue growth`);
    }
    if (metrics?.roic) {
      parts.push(`ROIC of ${metrics.roic.toFixed(1)}%`);
    }

    return `${symbol} (${name}) with ${parts.join(', ')}`;
  }

  _generateTags(metrics, sector) {
    const tags = [];

    if (sector) tags.push(sector.toLowerCase());

    if (metrics?.pe_ratio < 10) tags.push('low_pe');
    else if (metrics?.pe_ratio > 40) tags.push('high_pe');

    if (metrics?.revenue_growth_yoy > 20) tags.push('high_growth');
    else if (metrics?.revenue_growth_yoy < 0) tags.push('declining_revenue');

    if (metrics?.roic > 20) tags.push('high_roic');
    if (metrics?.debt_to_equity > 2) tags.push('high_debt');
    if (metrics?.fcf_yield > 8) tags.push('high_fcf_yield');

    return tags;
  }

  _calculateDataQuality(metrics, outcomes) {
    let score = 0;

    // Metrics quality
    if (metrics?.pe_ratio) score += 10;
    if (metrics?.roic) score += 10;
    if (metrics?.revenue_growth_yoy) score += 10;
    if (metrics?.net_margin) score += 10;
    if (metrics?.debt_to_equity) score += 10;

    // Outcome quality
    if (outcomes?.outcome_1y != null) score += 20;
    if (outcomes?.outcome_3y != null) score += 15;
    if (outcomes?.alpha_1y != null) score += 15;

    return Math.min(100, score);
  }
}

module.exports = PrecedentFinder;
