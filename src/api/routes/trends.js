// src/api/routes/trends.js
const express = require('express');
const router = express.Router();
const TrendAnalysis = require('../../services/trendAnalysis');

const analyzer = new TrendAnalysis();

/**
 * GET /api/trends/:symbol
 * Get trend analysis for a company
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const trends = await analyzer.getCompanyTrends(symbol.toUpperCase());

    if (trends.error) {
      return res.status(404).json({ error: trends.error });
    }

    const health = await analyzer.classifyCompanyHealth(trends);

    res.json({
      ...trends,
      health
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trends/compare/all
 * Compare trends across all companies
 */
router.get('/compare/all', async (req, res) => {
  try {
    const { getDatabaseAsync } = require('../../lib/db');
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT symbol FROM companies WHERE is_active = 1');
    const companies = result.rows;

    const symbols = companies.map(c => c.symbol);
    const comparison = await analyzer.compareCompanies(symbols);

    res.json({
      count: comparison.length,
      companies: comparison
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trends/improving
 * Find companies with improving trends
 */
router.get('/improving', async (req, res) => {
  try {
    const { minScore = 3 } = req.query;
    const improving = await analyzer.findBestTrends(parseInt(minScore));

    res.json({
      minScore: parseInt(minScore),
      count: improving.length,
      companies: improving
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
