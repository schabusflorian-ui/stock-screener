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
  // Note: All presets filter to companies with data within the last 2 years (latest available data)
  const presets = [
    {
      id: 'buffett',
      name: 'Buffett Quality',
      description: 'ROIC >15%, debt/equity <0.5, positive FCF. Latest data within 2 years.',
      criteria: {
        minROIC: 15,
        maxDebtToEquity: 0.5,
        minFCFYield: 0
      }
    },
    {
      id: 'value',
      name: 'Deep Value (Graham)',
      description: 'P/E <15, P/B <1.5, positive ROIC. Latest data within 2 years.',
      criteria: {
        maxPERatio: 15,
        maxPBRatio: 1.5,
        minROIC: 0
      }
    },
    {
      id: 'magic',
      name: 'Magic Formula',
      description: 'ROIC >15%, P/E <25 (Greenblatt). Latest data within 2 years.',
      criteria: {
        minROIC: 15,
        maxPERatio: 25
      }
    },
    {
      id: 'quality',
      name: 'Quality at Any Price',
      description: 'ROIC >20%, debt/equity <1. Latest data within 2 years.',
      criteria: {
        minROIC: 20,
        maxDebtToEquity: 1.0
      }
    },
    {
      id: 'growth',
      name: 'High Growth',
      description: 'Revenue & earnings growth >15%. Latest data within 2 years.',
      criteria: {
        minRevenueGrowth: 15,
        minEarningsGrowth: 15
      }
    },
    {
      id: 'dividend',
      name: 'Dividend Value',
      description: 'FCF margin >10%, low debt, positive growth. Latest data within 2 years.',
      criteria: {
        minFCFMargin: 10,
        maxDebtToEquity: 1.0,
        minRevenueGrowth: 0
      }
    },
    {
      id: 'fortress',
      name: 'Financial Fortress',
      description: 'Debt <0.3, current ratio >2, margin >5%. Latest data within 2 years.',
      criteria: {
        maxDebtToEquity: 0.3,
        minCurrentRatio: 2,
        minNetMargin: 5
      }
    },
    {
      id: 'cigarbutts',
      name: 'Graham Cigar Butts',
      description: 'P/B <0.8, P/E <8, current ratio >1.5. Deep value / net-net style.',
      criteria: {
        maxPBRatio: 0.8,
        maxPERatio: 8,
        minCurrentRatio: 1.5
      }
    },
    {
      id: 'compounders',
      name: 'Akre Compounders',
      description: 'ROIC >20%, debt <0.5, net margin >10%. High-quality compounders.',
      criteria: {
        minROIC: 20,
        maxDebtToEquity: 0.5,
        minNetMargin: 10
      }
    },
    {
      id: 'flywheel',
      name: 'Sleep Well Flywheel',
      description: 'Revenue CAGR >10%, gross margin >30%, ROIC >12%. Growth + efficiency.',
      criteria: {
        minRevenueCagr: 10,
        minGrossMargin: 30,
        minROIC: 12
      }
    },
    {
      id: 'forensic',
      name: 'Forensic Quality',
      description: 'CFO/Net Income >1.0, margin >5%. High earnings quality.',
      criteria: {
        minCFOToNetIncome: 1.0,
        minNetMargin: 5,
        maxDebtToEquity: 1.0
      }
    },
    {
      id: 'asymmetry',
      name: 'Pabrai Asymmetry',
      description: 'P/E <10, ROIC >12%, debt <0.8. Cheap quality with low risk.',
      criteria: {
        maxPERatio: 10,
        minROIC: 12,
        maxDebtToEquity: 0.8
      }
    },
    {
      id: 'moats',
      name: 'Pat Dorsey Moats',
      description: 'ROIC >15%, gross margin >40%. Companies with competitive advantages.',
      criteria: {
        minROIC: 15,
        minGrossMargin: 40,
        minOperatingMargin: 15,
        minNetMargin: 10
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
    const { limit } = req.query;
    const results = screener.buffettQuality(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.deepValue(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.magicFormula(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.qualityAtAnyPrice(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.highGrowth(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.dividendValue(limit ? parseInt(limit) : undefined);

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
    const { limit } = req.query;
    const results = screener.financialFortress(limit ? parseInt(limit) : undefined);

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

/**
 * GET /api/screening/cigarbutts
 * Graham Cigar Butts - Deep value / net-net style
 */
router.get('/cigarbutts', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.grahamCigarButts(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Graham Cigar Butts',
      description: 'Deep value stocks trading below liquidation value',
      criteria: {
        maxPBRatio: 0.8,
        maxPERatio: 8,
        minCurrentRatio: 1.5,
        minNetMargin: 0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/compounders
 * Akre Compounders - High quality compounders
 */
router.get('/compounders', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.akreCompounders(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Akre Compounders',
      description: 'High-quality compounders with conservative debt',
      criteria: {
        minROIC: 20,
        maxDebtToEquity: 0.5,
        minNetMargin: 10,
        minFCFMargin: 8
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/flywheel
 * Sleep Well Flywheel - Compounders with growth and efficiency
 */
router.get('/flywheel', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.sleepWellFlywheel(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Sleep Well Flywheel',
      description: 'Growing companies with improving capital efficiency',
      criteria: {
        minRevenueCagr: 10,
        minGrossMargin: 30,
        minROIC: 12
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/forensic
 * Forensic Quality - High earnings quality
 */
router.get('/forensic', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.forensicQuality(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Forensic Quality',
      description: 'Companies with high-quality cash earnings',
      criteria: {
        minCFOToNetIncome: 1.0,
        minNetMargin: 5,
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
 * GET /api/screening/asymmetry
 * Pabrai Asymmetry - Low risk, high reward
 */
router.get('/asymmetry', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.pabraiAsymmetry(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Pabrai Asymmetry',
      description: 'Cheap quality stocks with asymmetric risk/reward',
      criteria: {
        maxPERatio: 10,
        minROIC: 12,
        maxDebtToEquity: 0.8,
        minFCFMargin: 5
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/moats
 * Pat Dorsey Moats - Companies with competitive advantages
 */
router.get('/moats', (req, res) => {
  try {
    const { limit } = req.query;
    const results = screener.dorseyMoats(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Pat Dorsey Moats',
      description: 'Companies with durable competitive advantages',
      criteria: {
        minROIC: 15,
        minGrossMargin: 40,
        minOperatingMargin: 15,
        minNetMargin: 10,
        maxDebtToEquity: 1.0
      },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
