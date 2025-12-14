// src/api/routes/trends.js
const express = require('express');
const router = express.Router();
const TrendAnalysis = require('../../services/trendAnalysis');

const analyzer = new TrendAnalysis();

/**
 * GET /api/trends/:symbol
 * Get trend analysis for a company
 */
router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const trends = analyzer.getCompanyTrends(symbol.toUpperCase());
    
    if (trends.error) {
      return res.status(404).json({ error: trends.error });
    }
    
    const health = analyzer.classifyCompanyHealth(trends);
    
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
router.get('/compare/all', (req, res) => {
  try {
    const db = require('../../database').getDatabase();
    const companies = db.prepare(
      'SELECT symbol FROM companies WHERE is_active = 1'
    ).all();
    
    const symbols = companies.map(c => c.symbol);
    const comparison = analyzer.compareCompanies(symbols);
    
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
router.get('/improving', (req, res) => {
  try {
    const { minScore = 3 } = req.query;
    const improving = analyzer.findBestTrends(parseInt(minScore));
    
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