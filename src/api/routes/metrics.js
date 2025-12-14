// src/api/routes/metrics.js
const express = require('express');
const router = express.Router();
const db = require('../../database');

const database = db.getDatabase();

/**
 * GET /api/metrics/summary
 * Summary statistics across all companies
 */
router.get('/summary', (req, res) => {
  try {
    const summary = database.prepare(`
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
    `).get();
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/compare
 * Compare metrics across multiple companies
 */
router.get('/compare', (req, res) => {
  try {
    const { symbols, metric = 'roic' } = req.query;
    
    if (!symbols) {
      return res.status(400).json({ error: 'symbols parameter required' });
    }
    
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const placeholders = symbolList.map(() => '?').join(',');
    
    const data = database.prepare(`
      SELECT 
        c.symbol,
        c.name,
        m.fiscal_period,
        m.${metric}
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE c.symbol IN (${placeholders})
      ORDER BY c.symbol, m.fiscal_period DESC
    `).all(...symbolList);
    
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
router.get('/leaderboard', (req, res) => {
  try {
    const { metric = 'roic', limit = 10, order = 'DESC' } = req.query;
    
    const validMetrics = ['roic', 'roe', 'fcf_yield', 'net_margin', 'data_quality_score'];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ 
        error: 'Invalid metric',
        valid_metrics: validMetrics
      });
    }
    
    const leaderboard = database.prepare(`
      SELECT 
        c.symbol,
        c.name,
        c.sector,
        m.${metric},
        m.fiscal_period
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE m.fiscal_period = (
        SELECT MAX(fiscal_period) 
        FROM calculated_metrics 
        WHERE company_id = m.company_id
      )
      AND m.${metric} IS NOT NULL
      ORDER BY m.${metric} ${order === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT ?
    `).all(parseInt(limit));
    
    res.json({
      metric,
      order,
      count: leaderboard.length,
      leaderboard
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;