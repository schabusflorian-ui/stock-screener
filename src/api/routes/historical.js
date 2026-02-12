// src/api/routes/historical.js
// Historical Intelligence API - Query investor patterns and decision history

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');

/**
 * GET /api/historical/decisions
 * Query investment decisions with filters
 */
router.get('/decisions', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      investor_id,
      symbol,
      decision_type,
      sector,
      start_date,
      end_date,
      min_value,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        d.id,
        d.decision_date,
        d.decision_type,
        d.symbol,
        d.security_name,
        d.shares,
        d.position_value,
        d.portfolio_weight,
        d.shares_change_pct,
        d.sector,
        d.return_1m,
        d.return_3m,
        d.return_6m,
        d.return_1y,
        d.alpha_1y,
        d.beat_market_1y,
        fi.name as investor_name,
        fi.investment_style
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (investor_id) {
      query += ` AND d.investor_id = $${paramIndex++}`;
      params.push(investor_id);
    }
    if (symbol) {
      query += ` AND d.symbol = $${paramIndex++}`;
      params.push(symbol.toUpperCase());
    }
    if (decision_type) {
      query += ` AND d.decision_type = $${paramIndex++}`;
      params.push(decision_type);
    }
    if (sector) {
      query += ` AND d.sector = $${paramIndex++}`;
      params.push(sector);
    }
    if (start_date) {
      query += ` AND d.decision_date >= $${paramIndex++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND d.decision_date <= $${paramIndex++}`;
      params.push(end_date);
    }
    if (min_value) {
      query += ` AND d.position_value >= $${paramIndex++}`;
      params.push(parseFloat(min_value));
    }

    query += ` ORDER BY d.decision_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const decisionsResult = await database.query(query, params);
    const decisions = decisionsResult.rows;

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM')
      .replace(/ORDER BY[\s\S]*$/, '');
    const countParams = params.slice(0, -2);
    const countResult = await database.query(countQuery, countParams);
    const count = countResult.rows[0].count;

    res.json({
      decisions,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('Error fetching decisions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/investors/:id/patterns
 * Get investment patterns for a specific investor
 */
router.get('/investors/:id/patterns', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await getDatabaseAsync();

    // Get investor info
    const investorResult = await database.query(`
      SELECT * FROM famous_investors WHERE id = $1
    `, [id]);
    const investor = investorResult.rows[0];

    if (!investor) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    // Get decision type distribution
    const decisionTypesResult = await database.query(`
      SELECT
        decision_type,
        COUNT(*) as count,
        AVG(position_value) as avg_position_value,
        AVG(return_1y) as avg_return_1y
      FROM investment_decisions
      WHERE investor_id = $1
      GROUP BY decision_type
    `, [id]);
    const decisionTypes = decisionTypesResult.rows;

    // Get sector preferences
    const sectorPreferencesResult = await database.query(`
      SELECT
        sector,
        COUNT(*) as decision_count,
        SUM(position_value) as total_value,
        AVG(return_1y) as avg_return_1y
      FROM investment_decisions
      WHERE investor_id = $1 AND sector IS NOT NULL
      GROUP BY sector
      ORDER BY total_value DESC
      LIMIT 10
    `, [id]);
    const sectorPreferences = sectorPreferencesResult.rows;

    // Get top performing decisions
    const topDecisionsResult = await database.query(`
      SELECT
        symbol,
        security_name,
        decision_date,
        decision_type,
        position_value,
        return_1y,
        alpha_1y
      FROM investment_decisions
      WHERE investor_id = $1 AND return_1y IS NOT NULL
      ORDER BY return_1y DESC
      LIMIT 10
    `, [id]);
    const topDecisions = topDecisionsResult.rows;

    // Get worst performing decisions
    const worstDecisionsResult = await database.query(`
      SELECT
        symbol,
        security_name,
        decision_date,
        decision_type,
        position_value,
        return_1y,
        alpha_1y
      FROM investment_decisions
      WHERE investor_id = $1 AND return_1y IS NOT NULL
      ORDER BY return_1y ASC
      LIMIT 10
    `, [id]);
    const worstDecisions = worstDecisionsResult.rows;

    // Get timing stats
    const timingStatsResult = await database.query(`
      SELECT
        COUNT(*) as total_decisions,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) as beat_market_count,
        AVG(return_1y) as avg_return,
        AVG(alpha_1y) as avg_alpha
      FROM investment_decisions
      WHERE investor_id = $1 AND return_1y IS NOT NULL
    `, [id]);
    const timingStats = timingStatsResult.rows[0];

    res.json({
      investor,
      patterns: {
        decisionTypes,
        sectorPreferences,
        topDecisions,
        worstDecisions,
        timingStats: {
          ...timingStats,
          beat_market_pct: timingStats.total_decisions > 0
            ? (timingStats.beat_market_count / timingStats.total_decisions * 100).toFixed(1)
            : null
        }
      }
    });
  } catch (err) {
    console.error('Error fetching investor patterns:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/stocks/:symbol/investors
 * Get which famous investors hold/have held a stock
 */
router.get('/stocks/:symbol/investors', async (req, res) => {
  try {
    const { symbol } = req.params;
    const database = await getDatabaseAsync();

    // Get current holders
    const currentHoldersResult = await database.query(`
      SELECT
        fi.id as investor_id,
        fi.name,
        fi.investment_style,
        ih.shares,
        ih.market_value,
        ih.portfolio_weight,
        ih.filing_date,
        ih.change_type
      FROM investor_holdings ih
      JOIN famous_investors fi ON ih.investor_id = fi.id
      JOIN companies c ON ih.company_id = c.id
      WHERE c.symbol = $1
        AND ih.filing_date = (
          SELECT MAX(filing_date) FROM investor_holdings WHERE investor_id = ih.investor_id
        )
      ORDER BY ih.market_value DESC
    `, [symbol.toUpperCase()]);
    const currentHolders = currentHoldersResult.rows;

    // Get historical decisions on this stock
    const historicalDecisionsResult = await database.query(`
      SELECT
        d.id,
        d.decision_date,
        d.decision_type,
        d.shares,
        d.position_value,
        d.shares_change_pct,
        d.return_1y,
        d.alpha_1y,
        fi.id as investor_id,
        fi.name as investor_name,
        fi.investment_style
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.symbol = $1
      ORDER BY d.decision_date DESC
      LIMIT 50
    `, [symbol.toUpperCase()]);
    const historicalDecisions = historicalDecisionsResult.rows;

    // Aggregate stats
    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT d.investor_id) as unique_investors,
        COUNT(*) as total_decisions,
        SUM(CASE WHEN d.decision_type = 'new_position' THEN 1 ELSE 0 END) as new_positions,
        SUM(CASE WHEN d.decision_type = 'increased' THEN 1 ELSE 0 END) as increases,
        SUM(CASE WHEN d.decision_type = 'decreased' THEN 1 ELSE 0 END) as decreases,
        SUM(CASE WHEN d.decision_type = 'sold_out' THEN 1 ELSE 0 END) as sold_outs,
        AVG(d.return_1y) as avg_return_1y
      FROM investment_decisions d
      WHERE d.symbol = $1
    `, [symbol.toUpperCase()]);
    const stats = statsResult.rows[0];

    res.json({
      symbol: symbol.toUpperCase(),
      currentHolders,
      historicalDecisions,
      stats
    });
  } catch (err) {
    console.error('Error fetching stock investors:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/similar-decisions
 * Find decisions similar to a pattern (e.g., "value investors buying tech")
 */
router.get('/similar-decisions', async (req, res) => {
  try {
    const {
      investment_style,
      sector,
      decision_type,
      min_portfolio_weight,
      has_positive_return,
      limit = 50
    } = req.query;

    const database = await getDatabaseAsync();
    let query = `
      SELECT
        d.id,
        d.symbol,
        d.security_name,
        d.decision_date,
        d.decision_type,
        d.position_value,
        d.portfolio_weight,
        d.return_1y,
        d.alpha_1y,
        d.beat_market_1y,
        fi.name as investor_name,
        fi.investment_style
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (investment_style) {
      query += ` AND fi.investment_style = $${paramIndex++}`;
      params.push(investment_style);
    }
    if (sector) {
      query += ` AND d.sector = $${paramIndex++}`;
      params.push(sector);
    }
    if (decision_type) {
      query += ` AND d.decision_type = $${paramIndex++}`;
      params.push(decision_type);
    }
    if (min_portfolio_weight) {
      query += ` AND d.portfolio_weight >= $${paramIndex++}`;
      params.push(parseFloat(min_portfolio_weight));
    }
    if (has_positive_return === 'true') {
      query += ' AND d.return_1y > 0';
    }

    query += ` ORDER BY d.decision_date DESC LIMIT $${paramIndex++}`;
    params.push(parseInt(limit));

    const decisionsResult = await database.query(query, params);
    const decisions = decisionsResult.rows;

    res.json({ decisions });
  } catch (err) {
    console.error('Error fetching similar decisions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Factors with percentile columns in decision_factor_context (size, volatility have _score only)
const SUPPORTED_FACTORS = ['value', 'quality', 'momentum', 'growth'];

/**
 * GET /api/historical/performance-by-factor
 * Analyze decision performance by factor characteristics
 */
router.get('/performance-by-factor', async (req, res) => {
  try {
    const { factor = 'value', min_decisions = 50 } = req.query;
    if (!SUPPORTED_FACTORS.includes(factor)) {
      return res.status(400).json({
        error: `Unsupported factor: ${factor}`,
        supported: SUPPORTED_FACTORS,
        hint: 'Size and volatility percentiles are not yet populated in decision_factor_context.'
      });
    }

    const minDecisions = Math.max(1, Math.min(500, parseInt(min_decisions, 10) || 50));

    const database = await getDatabaseAsync();

    // Get performance breakdown by factor quintile (safe column name from allowlist)
    const factorColumn = `${factor}_percentile`;

    const performanceResult = await database.query(`
      SELECT
        CASE
          WHEN dfc.${factorColumn} >= 80 THEN 'Top 20%'
          WHEN dfc.${factorColumn} >= 60 THEN '60-80%'
          WHEN dfc.${factorColumn} >= 40 THEN '40-60%'
          WHEN dfc.${factorColumn} >= 20 THEN '20-40%'
          ELSE 'Bottom 20%'
        END as factor_quintile,
        COUNT(*)::int as decision_count,
        AVG(d.return_1y) as avg_return_pct,
        AVG(d.alpha_1y) as avg_alpha_pct,
        SUM(CASE WHEN (d.beat_market_1y IS TRUE OR d.beat_market_1y = 1) THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as beat_market_pct
      FROM decision_factor_context dfc
      JOIN investment_decisions d ON dfc.decision_id = d.id
      WHERE d.return_1y IS NOT NULL
        AND dfc.${factorColumn} IS NOT NULL
      GROUP BY factor_quintile
      HAVING COUNT(*) >= $1
      ORDER BY
        CASE factor_quintile
          WHEN 'Top 20%' THEN 1
          WHEN '60-80%' THEN 2
          WHEN '40-60%' THEN 3
          WHEN '20-40%' THEN 4
          ELSE 5
        END
    `, [minDecisions]);
    const performance = performanceResult.rows;

    const interpretation = _getFactorInterpretation(factor, performance);
    if (performance.length === 0) {
      interpretation.summary = 'No factor data yet. Run "Calculate outcomes" and ensure decision_factor_context is populated.';
    }

    res.json({
      factor,
      performance,
      interpretation
    });
  } catch (err) {
    console.error('Error fetching factor performance:', err);
    // Missing tables/columns on Postgres — return empty so UI loads
    const msg = err.message || '';
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('undefined table')) {
      return res.json({
        factor: req.query.factor || 'value',
        performance: [],
        interpretation: { summary: 'Historical factor tables missing. Run migrations and populate decision_factor_context.', details: null }
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// Factor terminology mapping for clearer user communication
const FACTOR_TERMINOLOGY = {
  value: {
    high: 'cheap stocks (low P/E)',
    low: 'expensive stocks (high P/E)',
    explanation: 'Value measures how cheap a stock is relative to earnings. Low P/E = high value = cheap.',
    action: 'Consider screening for stocks with P/E below market median.'
  },
  quality: {
    high: 'high-quality companies (strong ROE, margins)',
    low: 'low-quality companies (weak fundamentals)',
    explanation: 'Quality measures profitability, stability, and financial health.',
    action: 'Focus on companies with consistent ROE above 15% and stable margins.'
  },
  momentum: {
    high: 'recent winners (strong price momentum)',
    low: 'recent losers (weak momentum)',
    explanation: 'Momentum captures the tendency for winners to keep winning short-term.',
    action: 'Look for stocks with positive 6-12 month price performance.'
  },
  growth: {
    high: 'fast-growing companies',
    low: 'slow-growing companies',
    explanation: 'Growth measures revenue and earnings expansion rates.',
    action: 'Target companies with >15% revenue growth.'
  },
  size: {
    high: 'large-cap stocks',
    low: 'small-cap stocks',
    explanation: 'Size measures market capitalization. Small caps historically outperform but with more risk.',
    action: 'Consider small caps for higher growth potential, large caps for stability.'
  },
  volatility: {
    high: 'high-volatility stocks',
    low: 'low-volatility stocks',
    explanation: 'Volatility measures price swings. Low-vol stocks often provide better risk-adjusted returns.',
    action: 'Low-volatility stocks may offer better risk-adjusted returns.'
  }
};

function _getFactorInterpretation(factor, performance) {
  if (!performance || performance.length < 2) {
    return { summary: 'Insufficient data for interpretation', details: null };
  }

  const top = performance.find(p => p.factor_quintile === 'Top 20%');
  const bottom = performance.find(p => p.factor_quintile === 'Bottom 20%');

  if (!top || !bottom) {
    return { summary: 'Incomplete quintile data', details: null };
  }

  const spread = (top.avg_return_pct || 0) - (bottom.avg_return_pct || 0);
  const terminology = FACTOR_TERMINOLOGY[factor] || { high: `high ${factor}`, low: `low ${factor}` };
  const totalDecisions = performance.reduce((sum, p) => sum + (p.decision_count || 0), 0);

  let summary, insight, recommendation;

  if (Math.abs(spread) < 2) {
    summary = `The ${factor} factor shows minimal performance difference between quintiles`;
    insight = `${terminology.explanation}`;
    recommendation = 'This factor may not be a strong predictor in the current dataset.';
  } else if (spread > 0) {
    summary = `${terminology.high.charAt(0).toUpperCase() + terminology.high.slice(1)} outperformed ${terminology.low} by ${spread.toFixed(1)}% on average`;
    insight = terminology.explanation;
    recommendation = terminology.action;
  } else {
    summary = `${terminology.low.charAt(0).toUpperCase() + terminology.low.slice(1)} outperformed ${terminology.high} by ${Math.abs(spread).toFixed(1)}% on average`;
    insight = terminology.explanation;
    recommendation = terminology.action;
  }

  return {
    summary,
    insight,
    recommendation,
    spread: spread.toFixed(1),
    sampleSize: totalDecisions,
    sampleWarning: totalDecisions < 500 ? 'Small sample size - interpret with caution' : null
  };
}

/**
 * POST /api/historical/backfill-decision-company-ids
 * Set company_id on investment_decisions where symbol matches companies.symbol and company_id is null.
 */
router.post('/backfill-decision-company-ids', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const r = await database.query(`
      UPDATE investment_decisions d
      SET company_id = c.id, updated_at = NOW()
      FROM companies c
      WHERE d.symbol = c.symbol AND d.company_id IS NULL
    `);
    const updated = r.rowCount ?? 0;
    res.json({ success: true, updated });
  } catch (err) {
    console.error('Error backfilling decision company_id:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/historical/calculate-outcomes
 * Calculate outcomes for decisions that have enough history (populates return_1y, alpha_1y, etc.).
 * Supports both SQLite and Postgres (OutcomeCalculator uses getDatabaseAsync and db.query when on Postgres).
 * Optionally runs backfill of company_id from symbol first.
 */
router.post('/calculate-outcomes', async (req, res) => {
  try {
    const { limit = 1000, minDaysOld = 365, backfillCompanyIds = true } = req.body;
    const { getHistoricalIntelligence } = require('../../services/historical');
    const his = getHistoricalIntelligence();

    let backfillResult = { updated: 0 };
    if (backfillCompanyIds) {
      try {
        const database = await getDatabaseAsync();
        const r = await database.query(`
          UPDATE investment_decisions d
          SET company_id = c.id, updated_at = NOW()
          FROM companies c
          WHERE d.symbol = c.symbol AND d.company_id IS NULL
        `);
        backfillResult.updated = r.rowCount ?? 0;
      } catch (e) {
        console.warn('Backfill company_id (non-fatal):', e.message);
      }
    }

    const result = await his.calculateAllOutcomes({
      limit: parseInt(limit),
      minDaysOld: parseInt(minDaysOld),
      verbose: true
    });

    res.json({
      success: true,
      backfillCompanyIds: backfillResult.updated,
      ...result
    });
  } catch (err) {
    console.error('Error calculating outcomes:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/historical/refresh-outcomes
 * Refresh outcomes for decisions that may have new data
 */
router.post('/refresh-outcomes', async (req, res) => {
  try {
    const { daysOld = 30, limit = 500 } = req.body;
    const { getHistoricalIntelligence } = require('../../services/historical');
    const his = getHistoricalIntelligence();

    const result = await his.refreshOutcomes({
      daysOld: parseInt(daysOld),
      limit: parseInt(limit),
      verbose: true
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Error refreshing outcomes:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/historical/calculate-investor-track-record
 * Calculate track record for an investor
 */
router.post('/calculate-investor-track-record', async (req, res) => {
  try {
    const { investorId, periodType = 'all_time' } = req.body;

    if (!investorId) {
      return res.status(400).json({ error: 'investorId is required' });
    }

    const { getHistoricalIntelligence } = require('../../services/historical');
    const his = getHistoricalIntelligence();

    const result = await his.calculateInvestorTrackRecord(parseInt(investorId), periodType);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Error calculating track record:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/investor-track-record/:id
 * Get pre-calculated track record for an investor
 */
router.get('/investor-track-record/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { periodType = 'all_time' } = req.query;
    const { getHistoricalIntelligence } = require('../../services/historical');
    const his = getHistoricalIntelligence();

    const record = his.getInvestorTrackRecord(parseInt(id), periodType);

    if (!record) {
      return res.status(404).json({ error: 'Track record not found. Use POST /calculate-investor-track-record first.' });
    }

    res.json(record);
  } catch (err) {
    console.error('Error fetching track record:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/stats
 * Get overall historical intelligence statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const decisionStatsResult = await database.query(`
      SELECT
        COUNT(*) as total_decisions,
        COUNT(DISTINCT investor_id) as unique_investors,
        COUNT(DISTINCT symbol) as unique_stocks,
        MIN(decision_date) as earliest_decision,
        MAX(decision_date) as latest_decision,
        SUM(CASE WHEN return_1y IS NOT NULL THEN 1 ELSE 0 END) as decisions_with_returns,
        AVG(CASE WHEN return_1y IS NOT NULL THEN return_1y ELSE NULL END) as avg_return_1y
      FROM investment_decisions
    `, []);
    const decisionStats = decisionStatsResult.rows[0];

    const decisionTypeBreakdownResult = await database.query(`
      SELECT decision_type, COUNT(*) as count
      FROM investment_decisions
      GROUP BY decision_type
      ORDER BY count DESC
    `, []);
    const decisionTypeBreakdown = decisionTypeBreakdownResult.rows;

    const topSectorsResult = await database.query(`
      SELECT sector, COUNT(*) as count
      FROM investment_decisions
      WHERE sector IS NOT NULL
      GROUP BY sector
      ORDER BY count DESC
      LIMIT 10
    `, []);
    const topSectors = topSectorsResult.rows;

    res.json({
      overview: decisionStats,
      byDecisionType: decisionTypeBreakdown,
      topSectors
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/factor-timeseries
 * Get factor performance over time for charting
 */
router.get('/factor-timeseries', async (req, res) => {
  try {
    const { factor = 'value', groupBy = 'quarter' } = req.query;
    if (!SUPPORTED_FACTORS.includes(factor)) {
      return res.status(400).json({
        error: `Unsupported factor: ${factor}`,
        supported: SUPPORTED_FACTORS,
        hint: 'Size and volatility percentiles are not yet populated in decision_factor_context.'
      });
    }

    const database = await getDatabaseAsync();
    const factorColumn = `${factor}_percentile`;

    // Get performance by time period and quintile (Postgres/SQLite compatible date extraction)
    const timeseriesResult = await database.query(`
      SELECT
        CASE
          WHEN $1 = 'quarter' THEN SUBSTR(CAST(d.decision_date AS TEXT), 1, 4) || '-Q' ||
            CASE
              WHEN SUBSTR(CAST(d.decision_date AS TEXT), 6, 2) IN ('01','02','03') THEN '1'
              WHEN SUBSTR(CAST(d.decision_date AS TEXT), 6, 2) IN ('04','05','06') THEN '2'
              WHEN SUBSTR(CAST(d.decision_date AS TEXT), 6, 2) IN ('07','08','09') THEN '3'
              ELSE '4'
            END
          ELSE SUBSTR(CAST(d.decision_date AS TEXT), 1, 4)
        END as period,
        CASE
          WHEN dfc.${factorColumn} >= 80 THEN 'top'
          WHEN dfc.${factorColumn} >= 60 THEN 'high'
          WHEN dfc.${factorColumn} >= 40 THEN 'mid'
          WHEN dfc.${factorColumn} >= 20 THEN 'low'
          ELSE 'bottom'
        END as quintile,
        COUNT(*) as decisions,
        AVG(d.return_1y) as avg_return
      FROM decision_factor_context dfc
      JOIN investment_decisions d ON dfc.decision_id = d.id
      WHERE d.return_1y IS NOT NULL
        AND dfc.${factorColumn} IS NOT NULL
      GROUP BY period, quintile
      HAVING COUNT(*) >= 10
      ORDER BY period
    `, [groupBy]);
    const timeseries = timeseriesResult.rows;

    // Pivot data for charting
    const pivoted = {};
    for (const row of timeseries) {
      if (!pivoted[row.period]) {
        pivoted[row.period] = { period: row.period };
      }
      pivoted[row.period][row.quintile] = parseFloat(row.avg_return?.toFixed(2)) || 0;
      pivoted[row.period][`${row.quintile}_count`] = row.decisions;
    }

    res.json({
      factor,
      data: Object.values(pivoted).sort((a, b) => a.period.localeCompare(b.period))
    });
  } catch (err) {
    console.error('Error fetching factor timeseries:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/decision-heatmap
 * Get decision count heatmap by sector and time
 */
router.get('/decision-heatmap', async (req, res) => {
  try {
    const { decisionType } = req.query;
    const database = await getDatabaseAsync();

    let query = `
      SELECT
        sector,
        SUBSTR(CAST(decision_date AS TEXT), 1, 4) || '-Q' ||
          CASE
            WHEN SUBSTR(CAST(decision_date AS TEXT), 6, 2) IN ('01','02','03') THEN '1'
            WHEN SUBSTR(CAST(decision_date AS TEXT), 6, 2) IN ('04','05','06') THEN '2'
            WHEN SUBSTR(CAST(decision_date AS TEXT), 6, 2) IN ('07','08','09') THEN '3'
            ELSE '4'
          END as period,
        COUNT(*) as count,
        AVG(return_1y) as avg_return
      FROM investment_decisions
      WHERE sector IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (decisionType) {
      query += ` AND decision_type = $${paramIndex++}`;
      params.push(decisionType);
    }

    query += `
      GROUP BY sector, period
      HAVING COUNT(*) >= 5
      ORDER BY sector, period
    `;

    const heatmapDataResult = await database.query(query, params);
    const heatmapData = heatmapDataResult.rows;

    // Get unique sectors and periods
    const sectors = [...new Set(heatmapData.map(d => d.sector))];
    const periods = [...new Set(heatmapData.map(d => d.period))].sort();

    res.json({
      heatmapData,
      sectors,
      periods
    });
  } catch (err) {
    console.error('Error fetching heatmap:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/investor-styles
 * Get investors grouped by classified style with performance
 */
router.get('/investor-styles', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    // Get style performance summary (Postgres: beat_market_1y can be int or boolean)
    const stylePerformanceResult = await database.query(`
      SELECT
        fi.investment_style,
        COUNT(DISTINCT fi.id)::int as investor_count,
        COUNT(d.id)::int as total_decisions,
        AVG(d.return_1y) as avg_return,
        AVG(d.alpha_1y) as avg_alpha,
        SUM(CASE WHEN (d.beat_market_1y IS TRUE OR d.beat_market_1y = 1) THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as beat_market_pct
      FROM famous_investors fi
      LEFT JOIN investment_decisions d ON fi.id = d.investor_id AND d.return_1y IS NOT NULL
      WHERE fi.investment_style IS NOT NULL
      GROUP BY fi.investment_style
      HAVING COUNT(d.id) >= 10
      ORDER BY avg_alpha DESC NULLS LAST
    `, []);
    const stylePerformance = stylePerformanceResult.rows;

    // Get top investors per style
    const topByStyleResult = await database.query(`
      SELECT
        fi.id,
        fi.name,
        fi.investment_style,
        COUNT(d.id)::int as decisions,
        AVG(d.return_1y) as avg_return,
        AVG(d.alpha_1y) as avg_alpha,
        SUM(CASE WHEN (d.beat_market_1y IS TRUE OR d.beat_market_1y = 1) THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as beat_market_pct
      FROM famous_investors fi
      JOIN investment_decisions d ON fi.id = d.investor_id
      WHERE fi.investment_style IS NOT NULL AND d.return_1y IS NOT NULL
      GROUP BY fi.id, fi.name, fi.investment_style
      HAVING COUNT(d.id) >= 5
      ORDER BY avg_alpha DESC
    `, []);
    const topByStyle = topByStyleResult.rows;

    // Group top investors by style
    const investorsByStyle = {};
    for (const inv of topByStyle) {
      if (!investorsByStyle[inv.investment_style]) {
        investorsByStyle[inv.investment_style] = [];
      }
      if (investorsByStyle[inv.investment_style].length < 5) {
        investorsByStyle[inv.investment_style].push(inv);
      }
    }

    res.json({
      stylePerformance,
      investorsByStyle
    });
  } catch (err) {
    console.error('Error fetching investor styles:', err);
    // Missing tables on Postgres (e.g. migration not run) — return empty so UI loads
    const msg = err.message || '';
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('undefined table')) {
      return res.json({ stylePerformance: [], investorsByStyle: {} });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/historical/classify-investor-style
 * Classify or reclassify an investor's style based on their decisions
 */
router.post('/classify-investor-style', async (req, res) => {
  try {
    const { investorId } = req.body;
    if (!investorId) {
      return res.status(400).json({ error: 'investorId is required' });
    }

    const database = await getDatabaseAsync();

    // Get investor's decision patterns
    const patternsResult = await database.query(`
      SELECT
        -- Factor preferences (what percentile stocks do they buy)
        AVG(dfc.value_percentile) as avg_value_pct,
        AVG(dfc.quality_percentile) as avg_quality_pct,
        AVG(dfc.momentum_percentile) as avg_momentum_pct,
        AVG(dfc.growth_percentile) as avg_growth_pct,
        AVG(dfc.size_percentile) as avg_size_pct,
        -- Sector concentration
        COUNT(DISTINCT d.sector) as sector_count,
        -- Position sizing
        AVG(d.portfolio_weight) as avg_weight,
        MAX(d.portfolio_weight) as max_weight,
        -- Decision types
        SUM(CASE WHEN d.decision_type = 'new_position' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as new_position_pct,
        SUM(CASE WHEN d.decision_type = 'increased' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as increased_pct,
        SUM(CASE WHEN d.decision_type = 'decreased' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as decreased_pct,
        SUM(CASE WHEN d.decision_type = 'sold_out' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as sold_out_pct,
        COUNT(*) as total_decisions
      FROM investment_decisions d
      LEFT JOIN decision_factor_context dfc ON d.id = dfc.decision_id
      WHERE d.investor_id = $1
    `, [investorId]);
    const patterns = patternsResult.rows[0];

    if (!patterns || patterns.total_decisions < 10) {
      return res.status(400).json({ error: 'Insufficient decision data for classification' });
    }

    // Classify based on patterns
    let style = 'Unknown';
    let confidence = 0;
    const scores = {};

    // Value investor: high value_percentile, lower growth
    scores.value = (patterns.avg_value_pct || 50) - (patterns.avg_growth_pct || 50);

    // Growth investor: high growth_percentile, high momentum
    scores.growth = ((patterns.avg_growth_pct || 50) + (patterns.avg_momentum_pct || 50)) / 2 - 50;

    // Quality investor: high quality_percentile
    scores.quality = (patterns.avg_quality_pct || 50) - 50;

    // Momentum investor: high momentum_percentile, high turnover
    scores.momentum = (patterns.avg_momentum_pct || 50) - 50 + (patterns.sold_out_pct || 0) / 5;

    // GARP: balance of growth and value
    const garpBalance = 100 - Math.abs((patterns.avg_value_pct || 50) - (patterns.avg_growth_pct || 50));
    scores.garp = garpBalance - 70;

    // Concentrated: fewer sectors, higher weights
    scores.concentrated = ((patterns.max_weight || 0) * 100) - (patterns.sector_count || 10) * 3;

    // Find highest score
    const maxScore = Math.max(...Object.values(scores));
    for (const [key, value] of Object.entries(scores)) {
      if (value === maxScore) {
        style = key.charAt(0).toUpperCase() + key.slice(1);
        confidence = Math.min(100, 50 + maxScore);
        break;
      }
    }

    // Update the investor's style
    await database.query(`
      UPDATE famous_investors
      SET investment_style = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [style, investorId]);

    res.json({
      investorId,
      classifiedStyle: style,
      confidence: confidence.toFixed(1),
      scores,
      patterns: {
        avgValuePct: patterns.avg_value_pct?.toFixed(1),
        avgGrowthPct: patterns.avg_growth_pct?.toFixed(1),
        avgQualityPct: patterns.avg_quality_pct?.toFixed(1),
        avgMomentumPct: patterns.avg_momentum_pct?.toFixed(1),
        sectorCount: patterns.sector_count,
        avgWeight: (patterns.avg_weight * 100)?.toFixed(2) + '%',
        totalDecisions: patterns.total_decisions
      }
    });
  } catch (err) {
    console.error('Error classifying investor:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Coerce to number for comparisons (Postgres driver may return numeric as string) */
function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/historical/classify-all-investors
 * Batch classify all investors based on their decision patterns
 */
router.post('/classify-all-investors', async (req, res) => {
  try {
    const minDecisions = Math.max(1, parseInt(req.body?.minDecisions, 10) || 20);
    const database = await getDatabaseAsync();

    // Get all investors with enough decisions (Postgres: cast count)
    const investorsResult = await database.query(`
      SELECT fi.id, fi.name, COUNT(d.id)::int as decision_count
      FROM famous_investors fi
      JOIN investment_decisions d ON fi.id = d.investor_id
      GROUP BY fi.id, fi.name
      HAVING COUNT(d.id) >= $1
    `, [minDecisions]);
    const investors = investorsResult.rows || [];

    const results = [];
    let classified = 0;
    let errors = 0;

    for (const inv of investors) {
      try {
        const patternsResult = await database.query(`
          SELECT
            AVG(dfc.value_percentile)::float as avg_value_pct,
            AVG(dfc.quality_percentile)::float as avg_quality_pct,
            AVG(dfc.momentum_percentile)::float as avg_momentum_pct,
            AVG(dfc.growth_percentile)::float as avg_growth_pct
          FROM investment_decisions d
          LEFT JOIN decision_factor_context dfc ON d.id = dfc.decision_id
          WHERE d.investor_id = $1
        `, [inv.id]);
        const raw = patternsResult.rows[0];
        const avgValue = toNum(raw?.avg_value_pct);
        const avgQuality = toNum(raw?.avg_quality_pct);
        const avgMomentum = toNum(raw?.avg_momentum_pct);
        const avgGrowth = toNum(raw?.avg_growth_pct);

        let style = 'Diversified';
        if (avgValue != null && avgValue > 65) {
          style = 'Value';
        } else if (avgGrowth != null && avgGrowth > 65) {
          style = 'Growth';
        } else if (avgMomentum != null && avgMomentum > 65) {
          style = 'Momentum';
        } else if (avgQuality != null && avgQuality > 65) {
          style = 'Quality';
        } else if (avgValue != null && avgGrowth != null && Math.abs(avgValue - avgGrowth) < 15) {
          style = 'GARP';
        }

        await database.query(
          `UPDATE famous_investors SET investment_style = $1 WHERE id = $2`,
          [style, inv.id]
        );

        const decisionCount = inv.decision_count != null ? Number(inv.decision_count) : 0;
        results.push({ id: inv.id, name: inv.name, style, decisions: decisionCount });
        classified++;
      } catch (innerErr) {
        errors++;
        if (errors <= 3) {
          console.warn('[classify-all-investors] per-investor error:', innerErr?.message, 'investor_id:', inv?.id);
        }
      }
    }

    res.json({
      success: true,
      classified,
      errors,
      total: investors.length,
      results: results.slice(0, 20)
    });
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : '';
    const code = String(err?.code || '');
    console.error('[classify-all-investors] Error:', msg, code || err);

    const isMissingTable = /does not exist|relation.*does not exist|undefined table|no such table|undefined column/i.test(msg) ||
      code === '42P01' || code === '42703';

    let message = 'Classification unavailable. Check server logs for details.';
    if (isMissingTable) {
      try {
        const database = await getDatabaseAsync();
        const runMigration002 = require('../../database-migrations/002-add-historical-intelligence-tables.js');
        await runMigration002(database);
        console.log('[classify-all-investors] Created investment_decisions and decision_factor_context via migration 002');
        message = 'Historical tables were missing and have been created. Click "Classify all" again to run classification.';
      } catch (migErr) {
        console.error('[classify-all-investors] Migration 002 failed:', migErr?.message);
        message = 'Historical investor data not available. Run Postgres migration 002-add-historical-intelligence-tables manually.';
      }
    }

    if (!res.headersSent) {
      res.status(200).json({
        success: true,
        classified: 0,
        errors: 0,
        total: 0,
        results: [],
        message
      });
    }
  }
});

module.exports = router;
