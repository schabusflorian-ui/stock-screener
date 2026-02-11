// src/api/routes/metrics.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');

/**
 * GET /api/metrics/summary
 * Summary statistics across all companies
 */
router.get('/summary', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT 
        COUNT(DISTINCT m.company_id) as total_companies,
        AVG(m.roic) as avg_roic,
        AVG(m.roe) as avg_roe,
        AVG(m.fcf_yield) as avg_fcf_yield,
        AVG(m.pe_ratio) as avg_pe,
        AVG(m.debt_to_equity) as avg_debt,
        MAX(m.roic) as max_roic,
        MIN(m.roic) as min_roic
      FROM calculated_metrics m
      WHERE m.fiscal_period = (
        SELECT MAX(fiscal_period) 
        FROM calculated_metrics 
        WHERE company_id = m.company_id
      )
    `);
    const summary = result.rows[0];

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/compare
 * Compare metrics across multiple companies
 */
router.get('/compare', async (req, res) => {
  try {
    const { symbols, metric = 'roic' } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'symbols parameter required' });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const placeholders = symbolList.map((_, i) => `$${i + 1}`).join(', ');

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT 
        c.symbol,
        c.name,
        m.fiscal_period,
        m.${metric}
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE c.symbol IN (${placeholders})
      ORDER BY c.symbol, m.fiscal_period DESC
    `, symbolList);
    const data = result.rows;

    // Group by symbol
    const grouped = {};
    data.forEach(row => {
      if (!grouped[row.symbol]) {
        grouped[row.symbol] = {
          name: row.name,
          data: []
        };
      }
      grouped[row.symbol].data.push({
        date: row.fiscal_period,
        value: row[metric]
      });
    });

    res.json({
      metric,
      companies: grouped
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/leaderboard
 * Top companies by specific metric
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { metric = 'roic', limit = 10, order = 'DESC', periodType = 'ttm' } = req.query;

    const validMetrics = ['roic', 'roe', 'fcf_yield', 'net_margin', 'earnings_yield', 'data_quality_score',
                          'revenue_growth_yoy', 'earnings_growth_yoy', 'gross_margin', 'operating_margin'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        error: 'Invalid metric',
        valid_metrics: validMetrics
      });
    }

    const validPeriodTypes = ['ttm', 'annual', 'quarterly'];
    if (!validPeriodTypes.includes(periodType)) {
      return res.status(400).json({
        error: 'Invalid periodType',
        valid_period_types: validPeriodTypes
      });
    }

    // Set reasonable bounds for each metric to filter out unrealistic values
    const metricBounds = {
      roic: { min: -100, max: 200 },
      roe: { min: -100, max: 200 },
      fcf_yield: { min: -50, max: 100 },
      net_margin: { min: -100, max: 100 },
      gross_margin: { min: -100, max: 100 },
      operating_margin: { min: -100, max: 100 },
      earnings_yield: { min: -50, max: 100 },
      data_quality_score: { min: 0, max: 100 },
      revenue_growth_yoy: { min: -100, max: 500 },
      earnings_growth_yoy: { min: -100, max: 500 }
    };

    const bounds = metricBounds[metric] || { min: -1000, max: 1000 };

    const database = await getDatabaseAsync();
    let leaderboard;
    if (periodType === 'ttm') {
      const result = await database.query(`
        SELECT
          c.symbol,
          c.name,
          c.sector,
          m.${metric},
          m.fiscal_period,
          m.period_type
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = 'ttm'
          AND m.${metric} IS NOT NULL
          AND m.${metric} BETWEEN $1 AND $2
          AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY m.${metric} ${order === 'ASC' ? 'ASC' : 'DESC'}
        LIMIT $3
      `, [bounds.min, bounds.max, parseInt(limit)]);
      leaderboard = result.rows;
    } else {
      const result = await database.query(`
        SELECT
          c.symbol,
          c.name,
          c.sector,
          m.${metric},
          m.fiscal_period,
          m.period_type
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(fiscal_period)
            FROM calculated_metrics
            WHERE company_id = m.company_id AND period_type = $2
          )
          AND m.${metric} IS NOT NULL
          AND m.${metric} BETWEEN $3 AND $4
          AND c.symbol NOT LIKE 'CIK_%'
          AND m.fiscal_period >= '2020-01-01'
        ORDER BY m.${metric} ${order === 'ASC' ? 'ASC' : 'DESC'}
        LIMIT $5
      `, [periodType, periodType, bounds.min, bounds.max, parseInt(limit)]);
      leaderboard = result.rows;
    }

    res.json({
      metric,
      periodType,
      order,
      count: leaderboard.length,
      leaderboard
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
