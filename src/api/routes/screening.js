// src/api/routes/screening.js
const express = require('express');
const router = express.Router();
const ScreeningService = require('../../services/screeningService');

const screener = new ScreeningService();

/**
 * GET /api/screening/options
 * Get available filter options (sectors, industries, periods)
 */
router.get('/options', (req, res) => {
  try {
    const options = screener.getFilterOptions();
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/screening/custom
 * Run custom screen with advanced criteria
 */
router.post('/custom', (req, res) => {
  try {
    const criteria = req.body;
    const result = screener.screen(criteria);

    res.json({
      criteria,
      count: result.results.length,
      total: result.total,
      results: result.results,
      pagination: {
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.results.length < result.total
      },
      duration: result.duration
    });
  } catch (error) {
    console.error('Screening error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/presets
 * Get list of available preset screens
 */
router.get('/presets', (req, res) => {
  const presets = [
    {
      id: 'buffett',
      name: 'Buffett Quality',
      description: 'High ROIC, low debt companies with strong cash flows',
      criteria: {
        minROIC: 15,
        maxDebtToEquity: 0.5,
        minFCFYield: 0
      }
    },
    {
      id: 'value',
      name: 'Deep Value (Graham)',
      description: 'Low P/E, low P/B stocks with decent returns',
      criteria: {
        maxPERatio: 15,
        maxPBRatio: 1.5,
        minROIC: 0
      }
    },
    {
      id: 'magic',
      name: 'Magic Formula',
      description: 'Greenblatt style: High ROIC at reasonable prices',
      criteria: {
        minROIC: 15,
        maxPERatio: 25
      }
    },
    {
      id: 'quality',
      name: 'Quality at Any Price',
      description: 'Top quality companies regardless of valuation',
      criteria: {
        minROIC: 20,
        maxDebtToEquity: 1.0
      }
    },
    {
      id: 'growth',
      name: 'High Growth',
      description: 'Companies with strong revenue and earnings growth',
      criteria: {
        minRevenueGrowth: 15,
        minEarningsGrowth: 15
      }
    },
    {
      id: 'dividend',
      name: 'Dividend Value',
      description: 'High FCF yield with sustainable growth',
      criteria: {
        minFCFYield: 5,
        maxDebtToEquity: 1.0,
        minRevenueGrowth: 0
      }
    },
    {
      id: 'fortress',
      name: 'Financial Fortress',
      description: 'Rock-solid balance sheets with minimal debt',
      criteria: {
        maxDebtToEquity: 0.3,
        minCurrentRatio: 2,
        minFCFYield: 0
      }
    }
  ];

  res.json({ presets });
});

/**
 * GET /api/screening/buffett
 * Buffett quality screen
 */
router.get('/buffett', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.buffettQuality(parseInt(limit));

    res.json({
      screen: 'Buffett Quality',
      criteria: {
        minROIC: 15,
        maxDebtToEquity: 0.5,
        minFCFYield: 0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/value
 * Deep value screen (Graham)
 */
router.get('/value', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.deepValue(parseInt(limit));

    res.json({
      screen: 'Deep Value (Graham)',
      criteria: {
        maxPERatio: 15,
        maxPBRatio: 1.5,
        minROIC: 0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/magic
 * Magic Formula screen (Greenblatt)
 */
router.get('/magic', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.magicFormula(parseInt(limit));

    res.json({
      screen: 'Magic Formula (Greenblatt)',
      criteria: {
        minROIC: 15,
        maxPERatio: 25
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/quality
 * Quality at any price
 */
router.get('/quality', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.qualityAtAnyPrice(parseInt(limit));

    res.json({
      screen: 'Quality at Any Price',
      criteria: {
        minROIC: 20,
        maxDebtToEquity: 1.0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/growth
 * High growth screen
 */
router.get('/growth', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.highGrowth(parseInt(limit));

    res.json({
      screen: 'High Growth',
      criteria: {
        minRevenueGrowth: 15,
        minEarningsGrowth: 15
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/dividend
 * Dividend value screen
 */
router.get('/dividend', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.dividendValue(parseInt(limit));

    res.json({
      screen: 'Dividend Value',
      criteria: {
        minFCFYield: 5,
        maxDebtToEquity: 1.0,
        minRevenueGrowth: 0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/fortress
 * Financial fortress screen
 */
router.get('/fortress', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const results = screener.financialFortress(parseInt(limit));

    res.json({
      screen: 'Financial Fortress',
      criteria: {
        maxDebtToEquity: 0.3,
        minCurrentRatio: 2,
        minFCFYield: 0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
