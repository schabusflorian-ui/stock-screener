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
      query += ` AND d.investor_id = ?`;
      params.push(investor_id);
    }
    if (symbol) {
      query += ` AND d.symbol = ?`;
      params.push(symbol.toUpperCase());
    }
    if (decision_type) {
      query += ` AND d.decision_type = ?`;
      params.push(decision_type);
    }
    if (sector) {
      query += ` AND d.sector = ?`;
      params.push(sector);
    }
    if (start_date) {
      query += ` AND d.decision_date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND d.decision_date <= ?`;
      params.push(end_date);
    }
    if (min_value) {
      query += ` AND d.position_value >= ?`;
      params.push(parseFloat(min_value));
    }

    query += ` ORDER BY d.decision_date DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const decisions = getDb().prepare(query).all(...params);

    // Get total count
    let countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM')
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
      query += ` AND fi.investment_style = ?`;
      params.push(investment_style);
    }
    if (sector) {
      query += ` AND d.sector = ?`;
      params.push(sector);
    }
    if (decision_type) {
      query += ` AND d.decision_type = ?`;
      params.push(decision_type);
    }
    if (min_portfolio_weight) {
      query += ` AND d.portfolio_weight >= ?`;
      params.push(parseFloat(min_portfolio_weight));
    }
    if (has_positive_return === 'true') {
      query += ` AND d.return_1y > 0`;
    }

    query += ` ORDER BY d.decision_date DESC LIMIT ?`;
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
        AVG(d.return_1y) * 100 as avg_return_pct,
        AVG(d.alpha_1y) * 100 as avg_alpha_pct,
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

function _getFactorInterpretation(factor, performance) {
  if (!performance || performance.length < 2) {
    return 'Insufficient data for interpretation';
  }

  const top = performance.find(p => p.factor_quintile === 'Top 20%');
  const bottom = performance.find(p => p.factor_quintile === 'Bottom 20%');

  if (!top || !bottom) {
    return 'Incomplete quintile data';
  }

  const spread = (top.avg_return_pct || 0) - (bottom.avg_return_pct || 0);

  if (Math.abs(spread) < 2) {
    return `${factor} factor shows minimal performance differentiation`;
  } else if (spread > 0) {
    return `High ${factor} stocks outperformed low ${factor} stocks by ${spread.toFixed(1)}% on average`;
  } else {
    return `Low ${factor} stocks outperformed high ${factor} stocks by ${Math.abs(spread).toFixed(1)}% on average`;
  }
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

module.exports = router;
