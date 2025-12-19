/**
 * DCF Valuation API Routes
 *
 * Endpoints for professional DCF calculations with multi-stage growth,
 * dual terminal methods, scenarios, and sensitivity analysis.
 */

const express = require('express');
const router = express.Router();
const DCFCalculator = require('../../services/dcfCalculator');
const db = require('../../database');

const database = db.getDatabase();
const calculator = new DCFCalculator(database);

/**
 * GET /api/dcf/:symbol
 * Get DCF valuation for a company
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { price, shares } = req.query;

    // Get company ID
    const company = database.prepare(`
      SELECT id, symbol, name, market_cap FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    const priceData = database.prepare(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = ?
    `).get(company.id);

    // Build overrides from query params OR price_metrics
    const overrides = {};

    // Price priority: query param > price_metrics
    if (price) {
      overrides.currentPrice = parseFloat(price);
    } else if (priceData?.last_price) {
      overrides.currentPrice = priceData.last_price;
    }

    // Shares can be derived from market cap / price
    if (shares) {
      overrides.sharesOutstanding = parseFloat(shares);
    } else if (priceData?.market_cap && overrides.currentPrice) {
      overrides.sharesOutstanding = priceData.market_cap / overrides.currentPrice;
    } else if (company.market_cap && overrides.currentPrice) {
      overrides.sharesOutstanding = company.market_cap / overrides.currentPrice;
    }

    const results = await calculator.calculateDCF(company.id, overrides);

    res.json(results);
  } catch (error) {
    console.error('DCF calculation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/dcf/:symbol
 * Calculate DCF with custom assumptions
 *
 * Body params:
 * - fcf: Override base FCF
 * - ebitda: Override EBITDA
 * - growthStage1: Years 1-3 growth rate (e.g., 0.15 for 15%)
 * - growthStage2: Years 4-7 growth rate
 * - growthStage3: Years 8-10 growth rate
 * - terminalGrowth: Perpetual growth rate (max 3%)
 * - wacc: Discount rate (e.g., 0.10 for 10%)
 * - exitMultiple: EV/EBITDA exit multiple
 * - currentPrice: Current stock price
 * - sharesOutstanding: Shares outstanding
 * - netDebt: Net debt (debt - cash)
 * - targetMargin: Target FCF margin
 */
router.post('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const overrides = req.body;

    // Get company ID
    const company = database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const results = await calculator.calculateDCF(company.id, overrides);

    res.json(results);
  } catch (error) {
    console.error('DCF calculation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/sensitivity
 * Get sensitivity analysis matrix (WACC vs Growth)
 */
router.get('/:symbol/sensitivity', async (req, res) => {
  try {
    const { symbol } = req.params;

    const company = database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // First get base case
    const baseCase = await calculator.calculateDCF(company.id);

    if (!baseCase.success) {
      return res.json({ success: false, error: 'Cannot calculate base case', errors: baseCase.errors });
    }

    const baseWACC = baseCase.assumptions.wacc;
    const baseGrowth = baseCase.assumptions.growth.stage1;

    // Generate sensitivity matrix
    const sensitivity = await calculator.calculateSensitivity(company.id, baseWACC, baseGrowth);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      currentPrice: baseCase.currentPrice,
      baseIntrinsicValue: baseCase.intrinsicValue,
      baseWACC,
      baseGrowth,
      sensitivity
    });
  } catch (error) {
    console.error('Sensitivity analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/history
 * Get historical DCF valuations for a company
 */
router.get('/:symbol/history', (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const company = database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const history = calculator.getHistoricalValuations(company.id, limit);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      valuations: history.map(v => ({
        calculatedAt: v.calculated_at,
        intrinsicValue: v.intrinsic_value_per_share,
        bullCase: v.bull_case_value,
        bearCase: v.bear_case_value,
        wacc: v.wacc,
        growthStage1: v.growth_stage1,
        terminalPct: v.terminal_value_pct,
        warnings: v.warning_flags ? JSON.parse(v.warning_flags) : []
      }))
    });
  } catch (error) {
    console.error('DCF history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/benchmarks/:industry
 * Get industry benchmarks for DCF assumptions
 */
router.get('/benchmarks/:industry', (req, res) => {
  try {
    const { industry } = req.params;

    const benchmarks = database.prepare(`
      SELECT * FROM industry_benchmarks
      WHERE industry LIKE ? OR sector LIKE ? OR industry = 'Default'
      ORDER BY CASE WHEN industry LIKE ? THEN 0 WHEN sector LIKE ? THEN 1 ELSE 2 END
      LIMIT 1
    `).get(`%${industry}%`, `%${industry}%`, `%${industry}%`, `%${industry}%`);

    if (!benchmarks) {
      return res.status(404).json({ success: false, error: 'Industry not found' });
    }

    res.json({
      success: true,
      data: {
        industry: benchmarks.industry,
        sector: benchmarks.sector,
        evEbitdaMedian: benchmarks.ev_ebitda_median,
        peMedian: benchmarks.pe_median,
        waccMedian: benchmarks.wacc_median,
        betaMedian: benchmarks.beta_median,
        revenueGrowthMedian: benchmarks.revenue_growth_median,
        marginMedian: benchmarks.margin_median
      }
    });
  } catch (error) {
    console.error('Benchmarks error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/benchmarks
 * Get all industry benchmarks
 */
router.get('/benchmarks', (req, res) => {
  try {
    const benchmarks = database.prepare(`
      SELECT * FROM industry_benchmarks ORDER BY industry
    `).all();

    res.json({
      success: true,
      data: benchmarks.map(b => ({
        industry: b.industry,
        sector: b.sector,
        evEbitdaMedian: b.ev_ebitda_median,
        peMedian: b.pe_median,
        waccMedian: b.wacc_median,
        betaMedian: b.beta_median,
        revenueGrowthMedian: b.revenue_growth_median,
        marginMedian: b.margin_median
      }))
    });
  } catch (error) {
    console.error('Benchmarks error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
