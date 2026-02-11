/**
 * DCF Valuation API Routes
 *
 * Endpoints for professional DCF calculations with multi-stage growth,
 * dual terminal methods, scenarios, and sensitivity analysis.
 */

const express = require('express');
const router = express.Router();
const DCFCalculator = require('../../services/dcfCalculator');
const { getDatabaseAsync } = require('../../lib/db');
const { requireAuth } = require('../../middleware/auth');
const { requireFeature } = require('../../middleware/subscription');

// Lazy initialization to avoid instantiating DCFCalculator at module load time
let calculator = null;
function getCalculator() {
  if (!calculator) {
    calculator = new DCFCalculator();
  }
  return calculator;
}

/**
 * GET /api/dcf/:symbol
 * Get DCF valuation for a company
 */
router.get('/:symbol', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { price, shares } = req.query;

    const database = await getDatabaseAsync();

    // Get company ID
    const companyResult = await database.query(`
      SELECT id, symbol, name, market_cap FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

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

    const results = await getCalculator().calculateDCF(company.id, overrides);

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
router.post('/:symbol', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const overrides = req.body;

    const database = await getDatabaseAsync();

    // Get company ID
    const companyResult = await database.query(`
      SELECT id FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const results = await getCalculator().calculateDCF(company.id, overrides);

    res.json(results);
  } catch (error) {
    console.error('DCF calculation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/sensitivity
 * Get sensitivity analysis matrix with custom intervals
 *
 * Query params:
 * - rowVariable: Variable for rows (wacc, growthStage1, etc.)
 * - colVariable: Variable for columns
 * - rowMin, rowMax, rowStep: Custom row interval (decimal, e.g., 0.06 for 6%)
 * - colMin, colMax, colStep: Custom column interval
 */
router.get('/:symbol/sensitivity', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      rowVariable, colVariable,
      rowMin, rowMax, rowStep,
      colMin, colMax, colStep
    } = req.query;

    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, market_cap FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    // NOTE: Use market_cap/price for shares (consistent with main endpoint)
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    const baseOverrides = {};
    if (priceData?.last_price) {
      baseOverrides.currentPrice = priceData.last_price;
    }
    // Calculate shares from market_cap / price (consistent with main endpoint)
    if (priceData?.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = priceData.market_cap / priceData.last_price;
    } else if (company.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = company.market_cap / priceData.last_price;
    }

    // First get base case with price/shares
    const baseCase = await getCalculator().calculateDCF(company.id, baseOverrides);

    if (!baseCase.success) {
      return res.json({ success: false, error: 'Cannot calculate base case', errors: baseCase.errors });
    }

    const baseWACC = baseCase.assumptions.wacc;
    const baseGrowth = baseCase.assumptions.growth.stage1;

    // Build options for custom intervals - include baseInputs with shares/price
    const options = {
      baseInputs: baseOverrides
    };
    if (rowVariable) options.rowVariable = rowVariable;
    if (colVariable) options.colVariable = colVariable;
    if (rowMin !== undefined) options.rowMin = parseFloat(rowMin);
    if (rowMax !== undefined) options.rowMax = parseFloat(rowMax);
    if (rowStep !== undefined) options.rowStep = parseFloat(rowStep);
    if (colMin !== undefined) options.colMin = parseFloat(colMin);
    if (colMax !== undefined) options.colMax = parseFloat(colMax);
    if (colStep !== undefined) options.colStep = parseFloat(colStep);

    // Generate sensitivity matrix
    const sensitivity = await getCalculator().calculateSensitivity(company.id, baseWACC, baseGrowth, options);

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
 * GET /api/dcf/:symbol/reverse
 * Reverse DCF - calculate implied growth and WACC from current price
 *
 * Query params:
 * - targetPrice: Price to solve for (defaults to current price)
 */
router.get('/:symbol/reverse', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { targetPrice } = req.query;

    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, market_cap FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    // NOTE: Use market_cap/price for shares (consistent with main endpoint)
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    // Build base overrides with price and shares
    const baseOverrides = {};
    if (priceData?.last_price) {
      baseOverrides.currentPrice = priceData.last_price;
    }
    // Calculate shares from market_cap / price (consistent with main endpoint)
    if (priceData?.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = priceData.market_cap / priceData.last_price;
    } else if (company.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = company.market_cap / priceData.last_price;
    }

    // Use targetPrice if specified, otherwise use current price
    const price = targetPrice ? parseFloat(targetPrice) : priceData?.last_price;

    if (!price || price <= 0) {
      return res.status(400).json({ success: false, error: 'No valid target price available' });
    }

    // Calculate implied growth and WACC in parallel - pass baseOverrides to ensure correct shares
    const [impliedGrowth, impliedWACC] = await Promise.all([
      getCalculator().calculateImpliedGrowth(company.id, price, { baseInputs: baseOverrides }),
      getCalculator().calculateImpliedWACC(company.id, price, { baseInputs: baseOverrides })
    ]);

    // Get base case for comparison - with proper price/shares
    const baseCase = await getCalculator().calculateDCF(company.id, baseOverrides);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      targetPrice: price,
      baseIntrinsicValue: baseCase.success ? baseCase.intrinsicValue : null,
      upside: baseCase.success ? ((baseCase.intrinsicValue / price) - 1) * 100 : null,
      impliedGrowth: impliedGrowth.success ? {
        value: impliedGrowth.impliedGrowth,
        valuePct: impliedGrowth.impliedGrowthPct,
        baseValue: impliedGrowth.baseGrowth,
        baseValuePct: impliedGrowth.baseGrowthPct,
        gap: impliedGrowth.growthGap,
        gapPct: impliedGrowth.growthGapPct,
        interpretation: impliedGrowth.interpretation
      } : null,
      impliedWACC: impliedWACC.success ? {
        value: impliedWACC.impliedWACC,
        valuePct: impliedWACC.impliedWACCPct,
        baseValue: impliedWACC.baseWACC,
        baseValuePct: impliedWACC.baseWACCPct,
        gap: impliedWACC.waccGap,
        gapPct: impliedWACC.waccGapPct,
        interpretation: impliedWACC.interpretation
      } : null
    });
  } catch (error) {
    console.error('Reverse DCF error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/tornado
 * Tornado chart data - sensitivity ranking of all variables
 *
 * Query params:
 * - variation: Variation percentage (default 20 for ±20%)
 */
router.get('/:symbol/tornado', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { variation } = req.query;

    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, market_cap FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    // NOTE: Use market_cap/price for shares (consistent with main endpoint)
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    // Build base overrides with price and shares
    const baseOverrides = {};
    if (priceData?.last_price) {
      baseOverrides.currentPrice = priceData.last_price;
    }
    // Calculate shares from market_cap / price (consistent with main endpoint)
    if (priceData?.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = priceData.market_cap / priceData.last_price;
    } else if (company.market_cap && priceData?.last_price) {
      baseOverrides.sharesOutstanding = company.market_cap / priceData.last_price;
    }

    const options = {
      baseInputs: baseOverrides
    };
    if (variation) {
      options.variationPct = parseFloat(variation) / 100;
    }

    const tornado = await getCalculator().calculateTornadoChart(company.id, options);

    res.json({
      success: tornado.success,
      symbol: symbol.toUpperCase(),
      ...tornado
    });
  } catch (error) {
    console.error('Tornado chart error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/breakeven
 * Break-even analysis - find values where intrinsic = current price
 */
router.get('/:symbol/breakeven', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;

    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, market_cap FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price and market cap from price_metrics
    // NOTE: Use market_cap/price for shares (consistent with main endpoint)
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    const currentPrice = priceData?.last_price;
    if (!currentPrice || currentPrice <= 0) {
      return res.status(400).json({ success: false, error: 'No valid current price available' });
    }

    // Build base overrides with price and shares
    const baseOverrides = {};
    baseOverrides.currentPrice = currentPrice;
    // Calculate shares from market_cap / price (consistent with main endpoint)
    if (priceData?.market_cap && currentPrice) {
      baseOverrides.sharesOutstanding = priceData.market_cap / currentPrice;
    } else if (company.market_cap && currentPrice) {
      baseOverrides.sharesOutstanding = company.market_cap / currentPrice;
    }

    const breakeven = await getCalculator().calculateBreakeven(company.id, currentPrice, { baseInputs: baseOverrides });

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ...breakeven
    });
  } catch (error) {
    console.error('Break-even analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/history
 * Get historical DCF valuations for a company
 */
router.get('/:symbol/history', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const history = await getCalculator().getHistoricalValuations(company.id, limit);

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
router.get('/benchmarks/:industry', async (req, res) => {
  try {
    const { industry } = req.params;

    const database = await getDatabaseAsync();

    const benchmarksResult = await database.query(`
      SELECT * FROM industry_benchmarks
      WHERE industry LIKE $1 OR sector LIKE $2 OR industry = 'Default'
      ORDER BY CASE WHEN industry LIKE $3 THEN 0 WHEN sector LIKE $4 THEN 1 ELSE 2 END
      LIMIT 1
    `, [`%${industry}%`, `%${industry}%`, `%${industry}%`, `%${industry}%`]);
    const benchmarks = benchmarksResult.rows[0];

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
router.get('/benchmarks', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const benchmarksResult = await database.query(`
      SELECT * FROM industry_benchmarks ORDER BY industry
    `);
    const benchmarks = benchmarksResult.rows;

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

/**
 * POST /api/dcf/:symbol/parametric
 * Calculate probabilistic valuation using Monte Carlo with parametric distributions
 *
 * This runs thousands of DCF simulations, sampling inputs from parametric
 * distributions (with optional fat tails) to produce a valuation distribution.
 *
 * Body params:
 * - simulations: Number of Monte Carlo simulations (default: 10000)
 * - distributionType: 'normal', 'studentT', or 'skewedT' (default: 'studentT')
 * - growthUncertainty: Std dev of growth rate assumption (default: 0.03)
 * - marginUncertainty: Std dev of margin assumption (default: 0.02)
 * - waccUncertainty: Std dev of WACC assumption (default: 0.01)
 * - multipleUncertainty: Std dev of exit multiple (default: 2)
 * - baseInputs: Optional DCF input overrides
 */
router.post('/:symbol/parametric', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      simulations = 10000,
      distributionType = 'studentT',
      growthUncertainty = 0.03,
      marginUncertainty = 0.02,
      waccUncertainty = 0.01,
      multipleUncertainty = 2,
      baseInputs = {}
    } = req.body;

    const database = await getDatabaseAsync();

    // Get company ID
    const companyResult = await database.query(`
      SELECT id, symbol, name FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price from price_metrics
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    // Merge price data into base inputs if not provided
    const mergedInputs = { ...baseInputs };
    if (!mergedInputs.currentPrice && priceData?.last_price) {
      mergedInputs.currentPrice = priceData.last_price;
    }
    if (!mergedInputs.sharesOutstanding && priceData?.market_cap && mergedInputs.currentPrice) {
      mergedInputs.sharesOutstanding = priceData.market_cap / mergedInputs.currentPrice;
    }

    const results = await getCalculator().calculateParametricValuation(company.id, {
      simulations: Math.min(simulations, 50000), // Cap at 50k for performance
      distributionType,
      growthUncertainty,
      marginUncertainty,
      waccUncertainty,
      multipleUncertainty,
      baseInputs: mergedInputs
    });

    res.json({
      success: results.success,
      symbol: symbol.toUpperCase(),
      company: company.name,
      ...results
    });
  } catch (error) {
    console.error('Parametric valuation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/dcf/:symbol/parametric
 * Get parametric valuation with default settings
 */
router.get('/:symbol/parametric', requireAuth, requireFeature('dcf_valuation'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      simulations = '5000',
      distributionType = 'studentT'
    } = req.query;

    const database = await getDatabaseAsync();

    // Get company ID
    const companyResult = await database.query(`
      SELECT id, symbol, name FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Get current price from price_metrics
    const priceDataResult = await database.query(`
      SELECT last_price, market_cap FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const priceData = priceDataResult.rows[0];

    const baseInputs = {};
    if (priceData?.last_price) {
      baseInputs.currentPrice = priceData.last_price;
    }
    if (priceData?.market_cap && baseInputs.currentPrice) {
      baseInputs.sharesOutstanding = priceData.market_cap / baseInputs.currentPrice;
    }

    const results = await getCalculator().calculateParametricValuation(company.id, {
      simulations: Math.min(parseInt(simulations), 20000),
      distributionType,
      baseInputs
    });

    res.json({
      success: results.success,
      symbol: symbol.toUpperCase(),
      company: company.name,
      ...results
    });
  } catch (error) {
    console.error('Parametric valuation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
