// src/api/routes/screening.js
const express = require('express');
const router = express.Router();
const ScreeningService = require('../../services/screeningService');
const { requireFeature } = require('../../middleware/subscription');

const screener = new ScreeningService();

/**
 * GET /api/screening/options
 * Get available filter options (sectors, industries, periods)
 */
router.get('/options', async (req, res) => {
  try {
    const options = await screener.getFilterOptions();
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/screening/custom
 * Run custom screen with advanced criteria
 */
router.post('/custom', requireFeature('advanced_screener'), async (req, res) => {
  try {
    const criteria = req.body;
    const result = await screener.screen(criteria);

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
    },
    // Alpha-based presets
    {
      id: 'alpha_outperformers_1m',
      name: '1M Alpha Outperformers',
      description: 'Stocks outperforming S&P 500 by >5% in the last month.',
      criteria: {
        minAlpha1M: 5
      }
    },
    {
      id: 'alpha_outperformers_ytd',
      name: 'YTD Alpha Leaders',
      description: 'Stocks outperforming S&P 500 by >10% year-to-date.',
      criteria: {
        minAlphaYTD: 10
      }
    },
    {
      id: 'alpha_outperformers_1y',
      name: '1Y Alpha Champions',
      description: 'Stocks outperforming S&P 500 by >15% over the past year.',
      criteria: {
        minAlpha1Y: 15
      }
    },
    {
      id: 'alpha_underperformers',
      name: 'Alpha Laggards (Potential Value)',
      description: 'Quality stocks (ROIC>10%) underperforming S&P 500 by >10% YTD.',
      criteria: {
        maxAlphaYTD: -10,
        minROIC: 10
      }
    },
    {
      id: 'quality_momentum',
      name: 'Quality + Momentum',
      description: 'High quality stocks (ROIC>15%) with positive alpha >5% YTD.',
      criteria: {
        minROIC: 15,
        minAlphaYTD: 5,
        maxDebtToEquity: 1.0
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

/**
 * Alpha-based preset screens
 */
router.get('/alpha_outperformers_1m', (req, res) => {
  try {
    const { limit } = req.query;
    const criteria = {
      minAlpha1M: 5,
      sortBy: 'alpha_1m',
      sortOrder: 'DESC',
      limit: limit ? parseInt(limit) : undefined
    };
    const screenResult = screener.screen(criteria);
    const results = screenResult.results || screenResult;

    res.json({
      screen: '1M Alpha Outperformers',
      description: 'Stocks outperforming S&P 500 by >5% in the last month',
      criteria: { minAlpha1M: 5 },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alpha_outperformers_ytd', (req, res) => {
  try {
    const { limit } = req.query;
    const criteria = {
      minAlphaYTD: 10,
      sortBy: 'alpha_ytd',
      sortOrder: 'DESC',
      limit: limit ? parseInt(limit) : undefined
    };
    const screenResult = screener.screen(criteria);
    const results = screenResult.results || screenResult;

    res.json({
      screen: 'YTD Alpha Leaders',
      description: 'Stocks outperforming S&P 500 by >10% year-to-date',
      criteria: { minAlphaYTD: 10 },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alpha_outperformers_1y', (req, res) => {
  try {
    const { limit } = req.query;
    const criteria = {
      minAlpha1Y: 15,
      sortBy: 'alpha_1y',
      sortOrder: 'DESC',
      limit: limit ? parseInt(limit) : undefined
    };
    const screenResult = screener.screen(criteria);
    const results = screenResult.results || screenResult;

    res.json({
      screen: '1Y Alpha Champions',
      description: 'Stocks outperforming S&P 500 by >15% over the past year',
      criteria: { minAlpha1Y: 15 },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alpha_underperformers', (req, res) => {
  try {
    const { limit } = req.query;
    const criteria = {
      maxAlphaYTD: -10,
      minROIC: 10,
      sortBy: 'alpha_ytd',
      sortOrder: 'ASC',
      limit: limit ? parseInt(limit) : undefined
    };
    const screenResult = screener.screen(criteria);
    const results = screenResult.results || screenResult;

    res.json({
      screen: 'Alpha Laggards (Potential Value)',
      description: 'Quality stocks (ROIC>10%) underperforming S&P 500 by >10% YTD',
      criteria: { maxAlphaYTD: -10, minROIC: 10 },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/quality_momentum', (req, res) => {
  try {
    const { limit } = req.query;
    const criteria = {
      minROIC: 15,
      minAlphaYTD: 5,
      maxDebtToEquity: 1.0,
      sortBy: 'alpha_ytd',
      sortOrder: 'DESC',
      limit: limit ? parseInt(limit) : undefined
    };
    const screenResult = screener.screen(criteria);
    const results = screenResult.results || screenResult;

    res.json({
      screen: 'Quality + Momentum',
      description: 'High quality stocks (ROIC>15%) with positive alpha >5% YTD',
      criteria: { minROIC: 15, minAlphaYTD: 5, maxDebtToEquity: 1.0 },
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Factor-Based Screening Endpoints
// ============================================

/**
 * GET /api/screening/factors
 * Screen stocks by factor percentiles
 */
router.get('/factors', async (req, res) => {
  try {
    const { getDatabaseAsync } = require('../../database');
    const database = await getDatabaseAsync();
    const {
      min_value, max_value,
      min_quality, max_quality,
      min_momentum, max_momentum,
      min_growth, max_growth,
      sector,
      min_market_cap, max_market_cap,
      sort_by = 'composite',
      sort_order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        c.market_cap,
        ROUND(sfs.value_percentile, 1) as value_percentile,
        ROUND(sfs.quality_percentile, 1) as quality_percentile,
        ROUND(sfs.momentum_percentile, 1) as momentum_percentile,
        ROUND(sfs.growth_percentile, 1) as growth_percentile,
        ROUND(sfs.size_percentile, 1) as size_percentile,
        ROUND((COALESCE(sfs.value_percentile, 0) + COALESCE(sfs.quality_percentile, 0) +
         COALESCE(sfs.momentum_percentile, 0) + COALESCE(sfs.growth_percentile, 0)) / 4.0, 1) as composite_score,
        sfs.score_date
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date = (SELECT MAX(score_date) FROM stock_factor_scores)
    `;
    const params = [];

    if (min_value) { query += ' AND sfs.value_percentile >= ?'; params.push(parseFloat(min_value)); }
    if (max_value) { query += ' AND sfs.value_percentile <= ?'; params.push(parseFloat(max_value)); }
    if (min_quality) { query += ' AND sfs.quality_percentile >= ?'; params.push(parseFloat(min_quality)); }
    if (max_quality) { query += ' AND sfs.quality_percentile <= ?'; params.push(parseFloat(max_quality)); }
    if (min_momentum) { query += ' AND sfs.momentum_percentile >= ?'; params.push(parseFloat(min_momentum)); }
    if (max_momentum) { query += ' AND sfs.momentum_percentile <= ?'; params.push(parseFloat(max_momentum)); }
    if (min_growth) { query += ' AND sfs.growth_percentile >= ?'; params.push(parseFloat(min_growth)); }
    if (max_growth) { query += ' AND sfs.growth_percentile <= ?'; params.push(parseFloat(max_growth)); }
    if (sector) { query += ' AND c.sector = ?'; params.push(sector); }
    if (min_market_cap) { query += ' AND c.market_cap >= ?'; params.push(parseFloat(min_market_cap)); }
    if (max_market_cap) { query += ' AND c.market_cap <= ?'; params.push(parseFloat(max_market_cap)); }

    const sortColumn = {
      'composite': 'composite_score',
      'value': 'sfs.value_percentile',
      'quality': 'sfs.quality_percentile',
      'momentum': 'sfs.momentum_percentile',
      'growth': 'sfs.growth_percentile',
      'market_cap': 'c.market_cap'
    }[sort_by] || 'composite_score';

    query += ` ORDER BY ${sortColumn} ${sort_order === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const stocksResult = await database.query(query, params);
    const stocks = stocksResult.rows;

    res.json({
      stocks,
      filters: { min_value, max_value, min_quality, max_quality, min_momentum, max_momentum, min_growth, max_growth, sector },
      pagination: { limit: parseInt(limit), offset: parseInt(offset), returned: stocks.length }
    });
  } catch (error) {
    console.error('Factor screening error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/factor-presets/:preset
 * Pre-defined factor screens
 */
router.get('/factor-presets/:preset', async (req, res) => {
  try {
    const { getDatabaseAsync } = require('../../database');
    const database = await getDatabaseAsync();
    const { preset } = req.params;
    const { sector, limit = 20 } = req.query;

    const presets = {
      'quality-value': {
        description: 'High quality companies at reasonable valuations (Buffett style)',
        where: 'sfs.quality_percentile >= 70 AND sfs.value_percentile >= 50',
        orderBy: '(sfs.value_percentile + sfs.quality_percentile) / 2.0 DESC'
      },
      'deep-value': {
        description: 'Deeply undervalued stocks with minimum quality',
        where: 'sfs.value_percentile >= 80 AND sfs.quality_percentile >= 30',
        orderBy: 'sfs.value_percentile DESC'
      },
      'momentum-quality': {
        description: 'High quality stocks with strong price momentum',
        where: 'sfs.momentum_percentile >= 70 AND sfs.quality_percentile >= 60',
        orderBy: '(sfs.momentum_percentile + sfs.quality_percentile) / 2.0 DESC'
      },
      'growth-momentum': {
        description: 'High growth stocks with positive momentum',
        where: 'sfs.growth_percentile >= 70 AND sfs.momentum_percentile >= 50',
        orderBy: '(sfs.growth_percentile + sfs.momentum_percentile) / 2.0 DESC'
      },
      'contrarian': {
        description: 'Quality stocks that are out of favor (potential turnarounds)',
        where: 'sfs.value_percentile >= 60 AND sfs.quality_percentile >= 50 AND sfs.momentum_percentile <= 40',
        orderBy: '(sfs.value_percentile + sfs.quality_percentile - sfs.momentum_percentile) / 2.0 DESC'
      },
      'all-factor': {
        description: 'Stocks ranking well across all major factors',
        where: 'sfs.value_percentile >= 50 AND sfs.quality_percentile >= 50 AND sfs.momentum_percentile >= 50 AND sfs.growth_percentile >= 50',
        orderBy: '(sfs.value_percentile + sfs.quality_percentile + sfs.momentum_percentile + sfs.growth_percentile) / 4.0 DESC'
      }
    };

    const config = presets[preset];
    if (!config) {
      return res.status(400).json({ error: `Unknown preset: ${preset}`, available: Object.keys(presets) });
    }

    const query = `
      SELECT c.symbol, c.name, c.sector, c.market_cap,
        ROUND(sfs.value_percentile, 1) as value_percentile,
        ROUND(sfs.quality_percentile, 1) as quality_percentile,
        ROUND(sfs.momentum_percentile, 1) as momentum_percentile,
        ROUND(sfs.growth_percentile, 1) as growth_percentile
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date = (SELECT MAX(score_date) FROM stock_factor_scores)
        AND ${config.where}
        ${sector ? `AND c.sector = '${sector}'` : ''}
      ORDER BY ${config.orderBy}
      LIMIT ?
    `;

    const stocksResult = await database.query(query, [parseInt(limit)]);
    const stocks = stocksResult.rows;

    res.json({ preset, description: config.description, stocks, count: stocks.length });
  } catch (error) {
    console.error('Factor preset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/factor-presets
 * List available factor screening presets
 */
router.get('/factor-presets', (req, res) => {
  res.json({
    presets: [
      { id: 'quality-value', name: 'Quality Value', description: 'High quality + reasonable value (Buffett style)' },
      { id: 'deep-value', name: 'Deep Value', description: 'Deeply undervalued with minimum quality' },
      { id: 'momentum-quality', name: 'Momentum + Quality', description: 'Strong price momentum with quality' },
      { id: 'growth-momentum', name: 'Growth + Momentum', description: 'High growth with positive momentum' },
      { id: 'contrarian', name: 'Contrarian', description: 'Quality stocks out of favor' },
      { id: 'all-factor', name: 'All-Factor', description: 'Strong across all factors' }
    ]
  });
});

// ============================================
// Macro-Aware Screening Endpoints
// ============================================

/**
 * GET /api/screening/macro/context
 * Get current macro context for screening decisions
 */
router.get('/macro/context', (req, res) => {
  try {
    const macro = screener.getMacroContext();
    res.json({
      timestamp: new Date().toISOString(),
      context: macro
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/value-with-macro
 * Comprehensive value screen with macro overlay
 */
router.get('/macro/value-with-macro', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.valueInvestingWithMacro(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Value Investing + Macro Overlay',
      description: 'Fundamental value screen adjusted for current macro conditions',
      regime: result.regime,
      strategy: result.strategy,
      count: result.results.length,
      total: result.total,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/recession-resistant
 * Defensive stocks for late cycle/recession
 */
router.get('/macro/recession-resistant', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.recessionResistantValue(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Recession-Resistant Value',
      description: 'Defensive sectors with strong FCF and low debt',
      criteria: {
        sectors: ['Consumer Staples', 'Healthcare', 'Utilities'],
        minFCFYield: 5,
        maxDebtToEquity: 1.0
      },
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/deep-value-safe
 * Deep value only when macro is favorable
 */
router.get('/macro/deep-value-safe', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.deepValueSafeMacro(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Deep Value + Safe Macro',
      description: 'Deep value stocks with yield curve safety check',
      criteria: {
        maxPERatio: 12,
        minFCFYield: 8,
        maxDebtToEquity: 0.5
      },
      warning: result.warning,
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/garp-low-vol
 * GARP when volatility is calm
 */
router.get('/macro/garp-low-vol', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.garpLowVol(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'GARP + Low Volatility',
      description: 'Quality at reasonable price with VIX context',
      criteria: {
        minROIC: 15,
        maxPERatio: 25,
        minRevenueGrowth: 5
      },
      recommendation: result.recommendation,
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/cyclical
 * Cyclicals when curve is steep (early cycle)
 */
router.get('/macro/cyclical', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.cyclicalValue(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Cyclical Value',
      description: 'Cyclical sectors for early-cycle investing',
      criteria: {
        sectors: ['Materials', 'Industrials', 'Consumer Discretionary', 'Energy', 'Financials'],
        maxPERatio: 15,
        minROIC: 10
      },
      recommendation: result.recommendation,
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/fear-buying
 * Quality accumulation during fear (high VIX)
 */
router.get('/macro/fear-buying', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.fearBuying(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Fear Buying',
      description: 'High quality companies to buy during market fear',
      criteria: {
        minROIC: 20,
        minNetMargin: 10,
        maxDebtToEquity: 0.5,
        minCurrentRatio: 1.5
      },
      mode: result.mode,
      recommendation: result.recommendation,
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/credit-stress
 * Fortress balance sheets during credit stress
 */
router.get('/macro/credit-stress', (req, res) => {
  try {
    const { limit } = req.query;
    const result = screener.creditStressOpportunities(limit ? parseInt(limit) : undefined);

    res.json({
      screen: 'Credit Stress Opportunities',
      description: 'Strong balance sheets for credit stress environments',
      criteria: {
        maxDebtToEquity: 0.3,
        minCurrentRatio: 2.0,
        minInterestCoverage: 10,
        minFCFMargin: 10
      },
      stressLevel: result.stressLevel,
      recommendation: result.recommendation,
      count: result.results.length,
      macroContext: result.macroContext,
      results: result.results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screening/macro/presets
 * List available macro-aware screening presets
 */
router.get('/macro/presets', (req, res) => {
  res.json({
    presets: [
      {
        id: 'value-with-macro',
        name: 'Value + Macro Overlay',
        description: 'Automatically adjusts strategy based on VIX, yield curve, and credit spreads'
      },
      {
        id: 'recession-resistant',
        name: 'Recession-Resistant Value',
        description: 'Defensive sectors (Healthcare, Staples, Utilities) with strong FCF'
      },
      {
        id: 'deep-value-safe',
        name: 'Deep Value + Safe Macro',
        description: 'Deep value only when yield curve is not inverted'
      },
      {
        id: 'garp-low-vol',
        name: 'GARP + Low Volatility',
        description: 'Quality at reasonable price when VIX is calm'
      },
      {
        id: 'cyclical',
        name: 'Cyclical Value',
        description: 'Cyclical sectors for early-cycle investing (steep yield curve)'
      },
      {
        id: 'fear-buying',
        name: 'Fear Buying',
        description: 'Quality companies to accumulate during high VIX periods'
      },
      {
        id: 'credit-stress',
        name: 'Credit Stress Opportunities',
        description: 'Fortress balance sheets for credit stress environments'
      }
    ]
  });
});

/**
 * GET /api/screening/sectors-by-factor
 * Get sector breakdown with factor averages
 */
router.get('/sectors-by-factor', async (req, res) => {
  try {
    const { getDatabaseAsync } = require('../../database');
    const database = await getDatabaseAsync();
    const sectorsResult = await database.query(`
      SELECT
        c.sector,
        COUNT(*) as stock_count,
        ROUND(AVG(sfs.value_percentile), 1) as avg_value,
        ROUND(AVG(sfs.quality_percentile), 1) as avg_quality,
        ROUND(AVG(sfs.momentum_percentile), 1) as avg_momentum,
        ROUND(AVG(sfs.growth_percentile), 1) as avg_growth
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date = (SELECT MAX(score_date) FROM stock_factor_scores)
        AND c.sector IS NOT NULL
      GROUP BY c.sector
      ORDER BY stock_count DESC
    `);
    const sectors = sectorsResult.rows;

    res.json({ sectors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
