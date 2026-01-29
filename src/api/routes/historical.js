// src/api/routes/historical.js
// Historical Intelligence API - Query investor patterns and decision history

const express = require('express');
const router = express.Router();

let db;
function getDb() {
  if (!db) {
    db = require('../../database').db;
  }
  return db;
}

/**
 * GET /api/historical/decisions
 * Query investment decisions with filters
 */
router.get('/decisions', (req, res) => {
  try {
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

    if (investor_id) {
      query += ' AND d.investor_id = ?';
      params.push(investor_id);
    }
    if (symbol) {
      query += ' AND d.symbol = ?';
      params.push(symbol.toUpperCase());
    }
    if (decision_type) {
      query += ' AND d.decision_type = ?';
      params.push(decision_type);
    }
    if (sector) {
      query += ' AND d.sector = ?';
      params.push(sector);
    }
    if (start_date) {
      query += ' AND d.decision_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND d.decision_date <= ?';
      params.push(end_date);
    }
    if (min_value) {
      query += ' AND d.position_value >= ?';
      params.push(parseFloat(min_value));
    }

    query += ' ORDER BY d.decision_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const decisions = getDb().prepare(query).all(...params);

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM')
      .replace(/ORDER BY[\s\S]*$/, '');
    const countParams = params.slice(0, -2);
    const { count } = getDb().prepare(countQuery).get(...countParams);

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
router.get('/investors/:id/patterns', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Get investor info
    const investor = db.prepare(`
      SELECT * FROM famous_investors WHERE id = ?
    `).get(id);

    if (!investor) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    // Get decision type distribution
    const decisionTypes = db.prepare(`
      SELECT
        decision_type,
        COUNT(*) as count,
        AVG(position_value) as avg_position_value,
        AVG(return_1y) as avg_return_1y
      FROM investment_decisions
      WHERE investor_id = ?
      GROUP BY decision_type
    `).all(id);

    // Get sector preferences
    const sectorPreferences = db.prepare(`
      SELECT
        sector,
        COUNT(*) as decision_count,
        SUM(position_value) as total_value,
        AVG(return_1y) as avg_return_1y
      FROM investment_decisions
      WHERE investor_id = ? AND sector IS NOT NULL
      GROUP BY sector
      ORDER BY total_value DESC
      LIMIT 10
    `).all(id);

    // Get top performing decisions
    const topDecisions = db.prepare(`
      SELECT
        symbol,
        security_name,
        decision_date,
        decision_type,
        position_value,
        return_1y,
        alpha_1y
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL
      ORDER BY return_1y DESC
      LIMIT 10
    `).all(id);

    // Get worst performing decisions
    const worstDecisions = db.prepare(`
      SELECT
        symbol,
        security_name,
        decision_date,
        decision_type,
        position_value,
        return_1y,
        alpha_1y
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL
      ORDER BY return_1y ASC
      LIMIT 10
    `).all(id);

    // Get timing stats
    const timingStats = db.prepare(`
      SELECT
        COUNT(*) as total_decisions,
        SUM(CASE WHEN beat_market_1y = 1 THEN 1 ELSE 0 END) as beat_market_count,
        AVG(return_1y) as avg_return,
        AVG(alpha_1y) as avg_alpha
      FROM investment_decisions
      WHERE investor_id = ? AND return_1y IS NOT NULL
    `).get(id);

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
router.get('/stocks/:symbol/investors', (req, res) => {
  try {
    const { symbol } = req.params;
    const db = getDb();

    // Get current holders
    const currentHolders = db.prepare(`
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
      WHERE c.symbol = ?
        AND ih.filing_date = (
          SELECT MAX(filing_date) FROM investor_holdings WHERE investor_id = ih.investor_id
        )
      ORDER BY ih.market_value DESC
    `).all(symbol.toUpperCase());

    // Get historical decisions on this stock
    const historicalDecisions = db.prepare(`
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
      WHERE d.symbol = ?
      ORDER BY d.decision_date DESC
      LIMIT 50
    `).all(symbol.toUpperCase());

    // Aggregate stats
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT d.investor_id) as unique_investors,
        COUNT(*) as total_decisions,
        SUM(CASE WHEN d.decision_type = 'new_position' THEN 1 ELSE 0 END) as new_positions,
        SUM(CASE WHEN d.decision_type = 'increased' THEN 1 ELSE 0 END) as increases,
        SUM(CASE WHEN d.decision_type = 'decreased' THEN 1 ELSE 0 END) as decreases,
        SUM(CASE WHEN d.decision_type = 'sold_out' THEN 1 ELSE 0 END) as sold_outs,
        AVG(d.return_1y) as avg_return_1y
      FROM investment_decisions d
      WHERE d.symbol = ?
    `).get(symbol.toUpperCase());

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
router.get('/similar-decisions', (req, res) => {
  try {
    const {
      investment_style,
      sector,
      decision_type,
      min_portfolio_weight,
      has_positive_return,
      limit = 50
    } = req.query;

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

    if (investment_style) {
      query += ' AND fi.investment_style = ?';
      params.push(investment_style);
    }
    if (sector) {
      query += ' AND d.sector = ?';
      params.push(sector);
    }
    if (decision_type) {
      query += ' AND d.decision_type = ?';
      params.push(decision_type);
    }
    if (min_portfolio_weight) {
      query += ' AND d.portfolio_weight >= ?';
      params.push(parseFloat(min_portfolio_weight));
    }
    if (has_positive_return === 'true') {
      query += ' AND d.return_1y > 0';
    }

    query += ' ORDER BY d.decision_date DESC LIMIT ?';
    params.push(parseInt(limit));

    const decisions = getDb().prepare(query).all(...params);

    res.json({ decisions });
  } catch (err) {
    console.error('Error fetching similar decisions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/historical/performance-by-factor
 * Analyze decision performance by factor characteristics
 */
router.get('/performance-by-factor', (req, res) => {
  try {
    const { factor = 'value', min_decisions = 50 } = req.query;
    const db = getDb();

    // Get performance breakdown by factor quintile
    const factorColumn = `${factor}_percentile`;

    const performance = db.prepare(`
      SELECT
        CASE
          WHEN dfc.${factorColumn} >= 80 THEN 'Top 20%'
          WHEN dfc.${factorColumn} >= 60 THEN '60-80%'
          WHEN dfc.${factorColumn} >= 40 THEN '40-60%'
          WHEN dfc.${factorColumn} >= 20 THEN '20-40%'
          ELSE 'Bottom 20%'
        END as factor_quintile,
        COUNT(*) as decision_count,
        AVG(d.return_1y) as avg_return_pct,
        AVG(d.alpha_1y) as avg_alpha_pct,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as beat_market_pct
      FROM decision_factor_context dfc
      JOIN investment_decisions d ON dfc.decision_id = d.id
      WHERE d.return_1y IS NOT NULL
        AND dfc.${factorColumn} IS NOT NULL
      GROUP BY factor_quintile
      HAVING COUNT(*) >= ?
      ORDER BY
        CASE factor_quintile
          WHEN 'Top 20%' THEN 1
          WHEN '60-80%' THEN 2
          WHEN '40-60%' THEN 3
          WHEN '20-40%' THEN 4
          ELSE 5
        END
    `).all(parseInt(min_decisions));

    res.json({
      factor,
      performance,
      interpretation: _getFactorInterpretation(factor, performance)
    });
  } catch (err) {
    console.error('Error fetching factor performance:', err);
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
 * POST /api/historical/calculate-outcomes
 * Calculate outcomes for decisions that have enough history
 */
router.post('/calculate-outcomes', async (req, res) => {
  try {
    const { limit = 1000, minDaysOld = 365 } = req.body;
    const { getHistoricalIntelligence } = require('../../services/historical');
    const his = getHistoricalIntelligence();

    const result = await his.calculateAllOutcomes({
      limit: parseInt(limit),
      minDaysOld: parseInt(minDaysOld),
      verbose: true
    });

    res.json({
      success: true,
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
router.get('/investor-track-record/:id', (req, res) => {
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
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const decisionStats = db.prepare(`
      SELECT
        COUNT(*) as total_decisions,
        COUNT(DISTINCT investor_id) as unique_investors,
        COUNT(DISTINCT symbol) as unique_stocks,
        MIN(decision_date) as earliest_decision,
        MAX(decision_date) as latest_decision,
        SUM(CASE WHEN return_1y IS NOT NULL THEN 1 ELSE 0 END) as decisions_with_returns,
        AVG(CASE WHEN return_1y IS NOT NULL THEN return_1y ELSE NULL END) as avg_return_1y
      FROM investment_decisions
    `).get();

    const decisionTypeBreakdown = db.prepare(`
      SELECT decision_type, COUNT(*) as count
      FROM investment_decisions
      GROUP BY decision_type
      ORDER BY count DESC
    `).all();

    const topSectors = db.prepare(`
      SELECT sector, COUNT(*) as count
      FROM investment_decisions
      WHERE sector IS NOT NULL
      GROUP BY sector
      ORDER BY count DESC
      LIMIT 10
    `).all();

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
router.get('/factor-timeseries', (req, res) => {
  try {
    const { factor = 'value', groupBy = 'quarter' } = req.query;
    const db = getDb();
    const factorColumn = `${factor}_percentile`;

    // Get performance by time period and quintile
    const timeseries = db.prepare(`
      SELECT
        CASE
          WHEN ? = 'quarter' THEN substr(d.decision_date, 1, 4) || '-Q' ||
            CASE
              WHEN substr(d.decision_date, 6, 2) IN ('01','02','03') THEN '1'
              WHEN substr(d.decision_date, 6, 2) IN ('04','05','06') THEN '2'
              WHEN substr(d.decision_date, 6, 2) IN ('07','08','09') THEN '3'
              ELSE '4'
            END
          ELSE substr(d.decision_date, 1, 4)
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
    `).all(groupBy);

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
router.get('/decision-heatmap', (req, res) => {
  try {
    const { decisionType } = req.query;
    const db = getDb();

    let query = `
      SELECT
        sector,
        substr(decision_date, 1, 4) || '-Q' ||
          CASE
            WHEN substr(decision_date, 6, 2) IN ('01','02','03') THEN '1'
            WHEN substr(decision_date, 6, 2) IN ('04','05','06') THEN '2'
            WHEN substr(decision_date, 6, 2) IN ('07','08','09') THEN '3'
            ELSE '4'
          END as period,
        COUNT(*) as count,
        AVG(return_1y) as avg_return
      FROM investment_decisions
      WHERE sector IS NOT NULL
    `;
    const params = [];

    if (decisionType) {
      query += ' AND decision_type = ?';
      params.push(decisionType);
    }

    query += `
      GROUP BY sector, period
      HAVING COUNT(*) >= 5
      ORDER BY sector, period
    `;

    const heatmapData = db.prepare(query).all(...params);

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
router.get('/investor-styles', (req, res) => {
  try {
    const db = getDb();

    // Get style performance summary
    const stylePerformance = db.prepare(`
      SELECT
        fi.investment_style,
        COUNT(DISTINCT fi.id) as investor_count,
        COUNT(d.id) as total_decisions,
        AVG(d.return_1y) as avg_return,
        AVG(d.alpha_1y) as avg_alpha,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as beat_market_pct
      FROM famous_investors fi
      LEFT JOIN investment_decisions d ON fi.id = d.investor_id AND d.return_1y IS NOT NULL
      WHERE fi.investment_style IS NOT NULL
      GROUP BY fi.investment_style
      HAVING COUNT(d.id) >= 50
      ORDER BY avg_alpha DESC NULLS LAST
    `).all();

    // Get top investors per style
    const topByStyle = db.prepare(`
      SELECT
        fi.id,
        fi.name,
        fi.investment_style,
        COUNT(d.id) as decisions,
        AVG(d.return_1y) as avg_return,
        AVG(d.alpha_1y) as avg_alpha,
        SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(CASE WHEN d.beat_market_1y IS NOT NULL THEN 1 END), 0) as beat_market_pct
      FROM famous_investors fi
      JOIN investment_decisions d ON fi.id = d.investor_id
      WHERE fi.investment_style IS NOT NULL AND d.return_1y IS NOT NULL
      GROUP BY fi.id
      HAVING COUNT(d.id) >= 20
      ORDER BY avg_alpha DESC
    `).all();

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

    const db = getDb();

    // Get investor's decision patterns
    const patterns = db.prepare(`
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
      WHERE d.investor_id = ?
    `).get(investorId);

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
    db.prepare(`
      UPDATE famous_investors
      SET investment_style = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(style, investorId);

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

/**
 * POST /api/historical/classify-all-investors
 * Batch classify all investors based on their decision patterns
 */
router.post('/classify-all-investors', async (req, res) => {
  try {
    const { minDecisions = 20 } = req.body;
    const db = getDb();

    // Get all investors with enough decisions
    const investors = db.prepare(`
      SELECT fi.id, fi.name, COUNT(d.id) as decision_count
      FROM famous_investors fi
      JOIN investment_decisions d ON fi.id = d.investor_id
      GROUP BY fi.id
      HAVING COUNT(d.id) >= ?
    `).all(minDecisions);

    const results = [];
    let classified = 0;
    let errors = 0;

    for (const inv of investors) {
      try {
        // Get investor's factor preferences
        const patterns = db.prepare(`
          SELECT
            AVG(dfc.value_percentile) as avg_value_pct,
            AVG(dfc.quality_percentile) as avg_quality_pct,
            AVG(dfc.momentum_percentile) as avg_momentum_pct,
            AVG(dfc.growth_percentile) as avg_growth_pct
          FROM investment_decisions d
          LEFT JOIN decision_factor_context dfc ON d.id = dfc.decision_id
          WHERE d.investor_id = ?
        `).get(inv.id);

        // Simple classification
        let style = 'Diversified';

        if (patterns.avg_value_pct && patterns.avg_value_pct > 65) {
          style = 'Value';
        } else if (patterns.avg_growth_pct && patterns.avg_growth_pct > 65) {
          style = 'Growth';
        } else if (patterns.avg_momentum_pct && patterns.avg_momentum_pct > 65) {
          style = 'Momentum';
        } else if (patterns.avg_quality_pct && patterns.avg_quality_pct > 65) {
          style = 'Quality';
        } else if (patterns.avg_value_pct && patterns.avg_growth_pct &&
                   Math.abs(patterns.avg_value_pct - patterns.avg_growth_pct) < 15) {
          style = 'GARP';
        }

        db.prepare(`
          UPDATE famous_investors SET investment_style = ? WHERE id = ?
        `).run(style, inv.id);

        results.push({ id: inv.id, name: inv.name, style, decisions: inv.decision_count });
        classified++;
      } catch (err) {
        errors++;
      }
    }

    res.json({
      success: true,
      classified,
      errors,
      total: investors.length,
      results: results.slice(0, 20) // Return first 20 as sample
    });
  } catch (err) {
    console.error('Error batch classifying:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
