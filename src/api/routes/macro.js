/**
 * Macroeconomic Data API Routes
 *
 * Provides endpoints for economic indicators, yield curve, and macro signals.
 */

const express = require('express');
const router = express.Router();
const { FREDService } = require('../../services/dataProviders');
const db = require('../../database');
const { isUsingPostgres } = require('../../lib/db');

// Initialize service
let fredService = null;

function getService() {
  if (!fredService) {
    fredService = new FREDService(db);
  }
  return fredService;
}

// ========================================
// Macro Snapshot & Signals
// ========================================

/**
 * GET /api/macro/snapshot
 * Get current macroeconomic snapshot
 */
router.get('/snapshot', async (req, res) => {
  try {
    const service = getService();
    const snapshot = await service.getMacroSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error('Macro snapshot error:', error);
    res.status(500).json({ error: 'Failed to get macro snapshot', message: error.message });
  }
});

/**
 * GET /api/macro/signals
 * Get current macro trading signals
 */
router.get('/signals', async (req, res) => {
  try {
    const service = getService();
    const signals = await service.getMacroSignals();
    res.json(signals);
  } catch (error) {
    console.error('Macro signals error:', error);
    res.status(500).json({ error: 'Failed to get macro signals', message: error.message });
  }
});

// ========================================
// Yield Curve
// ========================================

/** Return true if error is "table/view does not exist" (Postgres 42P01 or message match). */
function isMissingRelation(err) {
  return err.code === '42P01' || (err.message && /relation .* does not exist/i.test(err.message));
}

/**
 * GET /api/macro/yield-curve
 * Get current yield curve
 */
router.get('/yield-curve', async (req, res) => {
  try {
    const dbConn = await db.getDatabaseAsync();
    const result = await dbConn.query(`
      SELECT * FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `);
    const curve = result.rows && result.rows[0] ? result.rows[0] : null;

    if (!curve) {
      return res.status(404).json({ error: 'No yield curve data available' });
    }

    res.json({
      ...curve,
      maturities: [
        { term: '1M', yield: curve.y_1m },
        { term: '3M', yield: curve.y_3m },
        { term: '6M', yield: curve.y_6m },
        { term: '1Y', yield: curve.y_1y },
        { term: '2Y', yield: curve.y_2y },
        { term: '3Y', yield: curve.y_3y },
        { term: '5Y', yield: curve.y_5y },
        { term: '7Y', yield: curve.y_7y },
        { term: '10Y', yield: curve.y_10y },
        { term: '20Y', yield: curve.y_20y },
        { term: '30Y', yield: curve.y_30y },
      ].filter(m => m.yield !== null),
    });
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.status(404).json({ error: 'No yield curve data available' });
    }
    console.error('Yield curve error:', error);
    res.status(500).json({ error: 'Failed to get yield curve', message: error.message });
  }
});

/**
 * GET /api/macro/yield-curve/history
 * Get yield curve spread history from economic_indicators table
 */
router.get('/yield-curve/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const dbConn = await db.getDatabaseAsync();

    // First try yield_curve table
    let result = await dbConn.query(`
      SELECT curve_date, y_2y, y_5y, y_10y, y_30y, spread_2s10s, is_inverted_2s10s
      FROM yield_curve
      WHERE curve_date >= CURRENT_DATE - ($1 || ' days')::interval
      ORDER BY curve_date ASC
    `, [days]);
    let history = result.rows || [];

    // If yield_curve table is empty or has few records, use economic_indicators
    if (!history || history.length < 5) {
      result = await dbConn.query(`
        SELECT
          observation_date as curve_date,
          value as spread_2s10s,
          CASE WHEN value < 0 THEN 1 ELSE 0 END as is_inverted_2s10s
        FROM economic_indicators
        WHERE series_id = 'T10Y2Y'
          AND observation_date >= CURRENT_DATE - ($1 || ' days')::interval
        ORDER BY observation_date ASC
      `, [days]);
      history = result.rows || [];
    }

    res.json(history);
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json([]);
    }
    console.error('Yield curve history error:', error);
    res.status(500).json({ error: 'Failed to get yield curve history', message: error.message });
  }
});

// ========================================
// Economic Indicators
// ========================================

/**
 * GET /api/macro/indicators
 * Get all latest economic indicators (uses economic_indicators when view does not exist)
 */
router.get('/indicators', async (req, res) => {
  try {
    const category = req.query.category;
    const dbConn = await db.getDatabaseAsync();

    // Prefer view if it exists; otherwise latest per series from economic_indicators
    let result;
    try {
      let query = `SELECT * FROM v_latest_economic_indicators`;
      if (category) query += ' WHERE category = $1';
      query += ' ORDER BY category, series_name';
      result = category
        ? await dbConn.query(query, [category])
        : await dbConn.query(query);
    } catch (viewErr) {
      if (isMissingRelation(viewErr)) {
        try {
          const sub = `
            SELECT ei.*, esd.series_name, esd.category
            FROM economic_indicators ei
            LEFT JOIN economic_series_definitions esd ON esd.series_id = ei.series_id
            WHERE (ei.series_id, ei.observation_date) IN (
              SELECT series_id, MAX(observation_date) FROM economic_indicators GROUP BY series_id
            )
          `;
          const q = category ? sub + ' AND esd.category = $1' : sub;
          result = await dbConn.query(q + ' ORDER BY esd.category, esd.series_name', category ? [category] : []);
        } catch (fallbackErr) {
          if (isMissingRelation(fallbackErr)) {
            return res.json([]);
          }
          throw fallbackErr;
        }
      } else {
        throw viewErr;
      }
    }

    res.json(result.rows || []);
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json([]);
    }
    console.error('Indicators error:', error);
    res.status(500).json({ error: 'Failed to get indicators', message: error.message });
  }
});

/**
 * GET /api/macro/indicators/:seriesId
 * Get specific indicator history
 */
router.get('/indicators/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const days = parseInt(req.query.days) || 365;
    const dbConn = await db.getDatabaseAsync();
    const sid = seriesId.toUpperCase();

    const historyResult = await dbConn.query(`
      SELECT observation_date, value, change_1m, change_1y
      FROM economic_indicators
      WHERE series_id = $1
        AND observation_date >= CURRENT_DATE - ($2 || ' days')::interval
      ORDER BY observation_date ASC
    `, [sid, days]);

    const metaResult = await dbConn.query(`
      SELECT * FROM economic_series_definitions WHERE series_id = $1
    `, [sid]);
    const metadata = metaResult.rows && metaResult.rows[0] ? metaResult.rows[0] : null;

    res.json({
      seriesId: sid,
      metadata,
      history: historyResult.rows || [],
    });
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json({ seriesId: req.params.seriesId.toUpperCase(), metadata: null, history: [] });
    }
    console.error('Indicator history error:', error);
    res.status(500).json({ error: 'Failed to get indicator history', message: error.message });
  }
});

/**
 * GET /api/macro/categories
 * Get available indicator categories
 */
router.get('/categories', async (req, res) => {
  try {
    const dbConn = await db.getDatabaseAsync();
    const result = await dbConn.query(`
      SELECT category, COUNT(*) as series_count
      FROM economic_series_definitions
      WHERE is_active = 1
      GROUP BY category
      ORDER BY category
    `);

    res.json(result.rows || []);
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json([]);
    }
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Failed to get categories', message: error.message });
  }
});

// ========================================
// Data Updates
// ========================================

/**
 * POST /api/macro/update
 * Trigger FRED data update (requires API key)
 */
router.post('/update', async (req, res) => {
  try {
    if (!process.env.FRED_API_KEY) {
      return res.status(400).json({
        error: 'FRED_API_KEY not configured',
        message: 'Set FRED_API_KEY in your .env file to enable macro data updates',
      });
    }

    const service = getService();
    const result = await service.updateAllSeries();

    res.json(result);
  } catch (error) {
    console.error('Macro update error:', error);
    res.status(500).json({ error: 'Failed to update macro data', message: error.message });
  }
});

/**
 * GET /api/macro/status
 * Get macro data status
 */
router.get('/status', async (req, res) => {
  try {
    const dbConn = await db.getDatabaseAsync();

    const r1 = await dbConn.query(`SELECT MAX(observation_date) as latest_date FROM economic_indicators`);
    const latestIndicator = r1.rows && r1.rows[0] ? r1.rows[0] : null;

    const r2 = await dbConn.query(`SELECT MAX(curve_date) as latest_date FROM yield_curve`);
    const latestYieldCurve = r2.rows && r2.rows[0] ? r2.rows[0] : null;

    const r3 = await dbConn.query(`SELECT COUNT(DISTINCT series_id) as count FROM economic_indicators`);
    const seriesCount = r3.rows && r3.rows[0] ? r3.rows[0] : null;

    const r4 = await dbConn.query(`SELECT COUNT(*) as count FROM economic_indicators`);
    const totalObservations = r4.rows && r4.rows[0] ? r4.rows[0] : null;

    res.json({
      status: 'ok',
      apiKeyConfigured: !!process.env.FRED_API_KEY,
      latestIndicatorDate: latestIndicator?.latest_date,
      latestYieldCurveDate: latestYieldCurve?.latest_date,
      seriesTracked: seriesCount?.count || 0,
      totalObservations: totalObservations?.count || 0,
    });
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json({
        status: 'ok',
        apiKeyConfigured: !!process.env.FRED_API_KEY,
        latestIndicatorDate: null,
        latestYieldCurveDate: null,
        seriesTracked: 0,
        totalObservations: 0,
      });
    }
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});

// ========================================
// Key Metrics Summary
// ========================================

/**
 * GET /api/macro/market-indicators/history
 * Get historical time series for market valuation indicators
 * IMPORTANT: This route must come BEFORE /market-indicators to avoid route conflict
 * Query params:
 *   - startQuarter: e.g., '2015-Q1' (default: '2015-Q1')
 *   - indicator: specific indicator or 'all' (default: 'all')
 *
 * NOTE: This query is expensive (~100s), so we cache results for 1 hour
 */
const { MemoryCache } = require('../../lib/cache');
const marketIndicatorsCache = new MemoryCache({
  defaultTTL: 60 * 60 * 1000, // 1 hour cache
  maxSize: 50
});

// Helper: Apply rolling average to smooth quarterly fluctuations
function applyRollingAverage(series, window = 4) {
  return series.map((item, idx) => {
    if (idx < window - 1) return item; // Not enough previous data, return raw
    let sum = 0;
    for (let i = idx - window + 1; i <= idx; i++) {
      sum += series[i].value;
    }
    return { ...item, value: Math.round((sum / window) * 1000) / 1000 };
  });
}

router.get('/market-indicators/history', async (req, res) => {
  try {
    const startQuarter = req.query.startQuarter || '2015-Q1';
    const database = await require('../../database').getDatabaseAsync();

    // Read pre-calculated data from table (instant!)
    const queryResult = await database.query(`
      SELECT
        quarter,
        quarter_end_date as date,
        buffett_indicator,
        sp500_pe,
        median_pe,
        median_msi,
        fred_msi,
        aggregate_msi,
        pct_undervalued,
        treasury_10y,
        yield_spread_2s10s,
        data_quality
      FROM market_indicator_history
      WHERE quarter >= ?
      ORDER BY quarter ASC
    `, [startQuarter]);
    const data = queryResult.rows;

    if (data.length === 0) {
      return res.json({
        success: true,
        loading: true,
        message: 'No historical data. Run: node src/scripts/backfill-market-indicator-history.js',
        data: [],
      });
    }

    // Build raw MSI series first, then apply smoothing
    const rawMSI = data.filter(d => d.median_msi).map(d => ({
      quarter: d.quarter,
      date: d.date,
      value: d.median_msi
    }));

    // Apply 4-quarter rolling average to smooth MSI fluctuations
    const smoothedMSI = applyRollingAverage(rawMSI, 4);

    // Transform to expected format (frontend expects 'data' object with specific keys)
    const result = {
      success: true,
      cached: true,
      source: 'database',
      generated: new Date().toISOString(),
      quarters: data.map(d => d.quarter),
      data: {
        buffett: data.filter(d => d.buffett_indicator).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.buffett_indicator
        })),
        sp500PE: data.filter(d => d.sp500_pe).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.sp500_pe
        })),
        medianPE: data.filter(d => d.median_pe).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.median_pe
        })),
        medianMSI: smoothedMSI, // 4Q rolling average for smooth display
        // FRED MSI - official Federal Reserve measure (Equity / Net Worth)
        // Range: 0.5-2.5, equilibrium = 1.0
        fredMSI: data.filter(d => d.fred_msi).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.fred_msi
        })),
        // Stock-based MSI (EV / Book Value) - internal calculation
        // Range: 3-5, higher values than FRED due to different methodology
        stockMSI: data.filter(d => d.aggregate_msi).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.aggregate_msi
        })),
        pctUndervalued: data.filter(d => d.pct_undervalued).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.pct_undervalued
        })),
        treasury10Y: data.filter(d => d.treasury_10y).map(d => ({
          quarter: d.quarter,
          date: d.date,
          value: d.treasury_10y
        }))
      },
      metadata: {
        startQuarter,
        endQuarter: data[data.length - 1]?.quarter,
        quartersCount: data.length
      }
    };

    res.json(result);
  } catch (error) {
    console.error('Historical market indicators error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get historical market indicators',
      message: error.message,
    });
  }
});

/**
 * GET /api/macro/market-indicators
 * Get comprehensive market valuation indicators
 * Cached 1 hour - getAllIndicators() is expensive (many DB queries)
 */
router.get('/market-indicators', async (req, res) => {
  try {
    const cacheKey = 'market-indicators-current';
    const cached = marketIndicatorsCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const { MarketIndicatorsService } = require('../../services/marketIndicatorsService');
    const service = new MarketIndicatorsService();
    const indicators = await service.getAllIndicators();
    marketIndicatorsCache.set(cacheKey, indicators);
    res.json(indicators);
  } catch (error) {
    console.error('Market indicators error:', error);
    res.status(500).json({ error: 'Failed to get market indicators', message: error.message });
  }
});

/**
 * GET /api/macro/safe-havens
 * Get safe haven stocks
 */
router.get('/safe-havens', async (req, res) => {
  try {
    const { MarketIndicatorsService } = require('../../services/marketIndicatorsService');
    const service = new MarketIndicatorsService();
    const limit = parseInt(req.query.limit) || 10;
    const safeHavens = await service.getSafeHavens(limit);
    res.json(safeHavens);
  } catch (error) {
    console.error('Safe havens error:', error);
    res.status(500).json({ error: 'Failed to get safe havens', message: error.message });
  }
});

/**
 * GET /api/macro/opportunities
 * Get undervalued quality stocks
 */
router.get('/opportunities', async (req, res) => {
  try {
    const { MarketIndicatorsService } = require('../../services/marketIndicatorsService');
    const service = new MarketIndicatorsService();
    const limit = parseInt(req.query.limit) || 10;
    const opportunities = await service.getUndervaluedQuality(limit);
    res.json(opportunities);
  } catch (error) {
    console.error('Opportunities error:', error);
    res.status(500).json({ error: 'Failed to get opportunities', message: error.message });
  }
});

/**
 * GET /api/macro/key-metrics
 * Get key macro metrics summary
 */
router.get('/key-metrics', async (req, res) => {
  try {
    const dbConn = await db.getDatabaseAsync();

    const getValue = async (seriesId) => {
      const result = await dbConn.query(`
        SELECT value, observation_date FROM economic_indicators
        WHERE series_id = $1
        ORDER BY observation_date DESC
        LIMIT 1
      `, [seriesId]);
      return result.rows && result.rows[0] ? result.rows[0] : null;
    };

    const fedFunds = await getValue('DFF');
    const treasury10y = await getValue('DGS10');
    const treasury2y = await getValue('DGS2');
    const vix = await getValue('VIXCLS');
    const hySpread = await getValue('BAMLH0A0HYM2');
    const unemployment = await getValue('UNRATE');
    const cpi = await getValue('CPIAUCSL');

    const yieldResult = await dbConn.query(`
      SELECT spread_2s10s, is_inverted_2s10s
      FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `);
    const yieldCurve = yieldResult.rows && yieldResult.rows[0] ? yieldResult.rows[0] : null;

    res.json({
      timestamp: new Date().toISOString(),
      rates: {
        fedFunds: fedFunds?.value,
        treasury2y: treasury2y?.value,
        treasury10y: treasury10y?.value,
        spread2s10s: yieldCurve?.spread_2s10s,
        curveInverted: yieldCurve?.is_inverted_2s10s === 1,
      },
      volatility: {
        vix: vix?.value,
        level: vix?.value > 30 ? 'crisis' : vix?.value > 25 ? 'high' : vix?.value > 20 ? 'elevated' : 'normal',
      },
      credit: {
        hySpread: hySpread?.value,
        stressLevel: hySpread?.value > 7 ? 'high' : hySpread?.value > 5 ? 'elevated' : 'normal',
      },
      economy: {
        unemployment: unemployment?.value,
        lastCpiDate: cpi?.observation_date,
      },
    });
  } catch (error) {
    if (isMissingRelation(error)) {
      return res.json({
        timestamp: new Date().toISOString(),
        rates: {},
        volatility: {},
        credit: {},
        economy: {},
      });
    }
    console.error('Key metrics error:', error);
    res.status(500).json({ error: 'Failed to get key metrics', message: error.message });
  }
});

/**
 * GET /api/macro/buffett-comparison
 * Returns both Buffett Indicator (total market/GDP) and S&P 500/GDP
 * for overlay chart comparison showing broad market vs large-cap perspectives
 */
router.get('/buffett-comparison', async (req, res) => {
  try {
    const startQuarter = req.query.startQuarter || '2015-Q1';
    const database = await require('../../database').getDatabaseAsync();

    // Read pre-calculated data from table (instant!)
    const result = await database.query(`
      SELECT
        quarter,
        quarter_end_date as date,
        buffett_indicator,
        buffett_market_cap,
        buffett_gdp,
        buffett_stock_count,
        sp500_market_cap
      FROM market_indicator_history
      WHERE quarter >= ?
        AND buffett_indicator IS NOT NULL
      ORDER BY quarter ASC
    `, [startQuarter]);
    const data = result.rows;

    if (data.length === 0) {
      return res.json({
        success: true,
        loading: true,
        message: 'No historical data. Run: node src/scripts/backfill-market-indicator-history.js',
        data: [],
      });
    }

    // Get current values
    const current = data[data.length - 1];

    // Calculate S&P 500 / GDP ratio for each quarter
    // Note: sp500_market_cap is in dollars, buffett_gdp and buffett_market_cap are in billions
    const sp500GDP = data
      .filter(d => d.sp500_market_cap && d.buffett_gdp)
      .map(d => ({
        quarter: d.quarter,
        value: Math.round((d.sp500_market_cap / 1e9 / d.buffett_gdp) * 100 * 100) / 100
      }));

    // Calculate largecapShare (S&P 500 market cap as % of total market)
    // Convert sp500_market_cap from dollars to billions to match buffett_market_cap
    const largecapShare = current?.sp500_market_cap && current?.buffett_market_cap
      ? Math.round((current.sp500_market_cap / 1e9 / current.buffett_market_cap) * 100 * 10) / 10
      : null;

    // Calculate current S&P 500 / GDP
    const currentSP500GDP = current?.sp500_market_cap && current?.buffett_gdp
      ? Math.round((current.sp500_market_cap / 1e9 / current.buffett_gdp) * 100 * 100) / 100
      : null;

    // Build totalMarketGDP and remove last datapoint (incomplete data distorts chart)
    const allTotalMarketGDP = data.map(d => ({
      quarter: d.quarter,
      value: d.buffett_indicator,
      companyCount: d.buffett_stock_count
    }));
    const totalMarketGDP = allTotalMarketGDP.slice(0, -1); // Remove last quarter

    const responseData = {
      success: true,
      source: 'database',
      generated: new Date().toISOString(),
      totalMarketGDP: totalMarketGDP,
      sp500GDP: sp500GDP,
      currentValues: {
        buffett: current?.buffett_indicator || null,
        sp500: currentSP500GDP,
        marketCap: current?.buffett_market_cap || null,
        gdp: current?.buffett_gdp || null,
        largecapShare: largecapShare
      },
      metadata: {
        startQuarter,
        endQuarter: data[data.length - 1]?.quarter,
        quartersCount: data.length
      }
    };

    res.json(responseData);
  } catch (error) {
    console.error('Buffett comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get buffett comparison',
      message: error.message,
    });
  }
});

/**
 * GET /api/macro/refresh-current-quarter
 * Update the current quarter's market indicators in the database.
 * Call this periodically to keep current quarter data fresh.
 */
router.get('/refresh-current-quarter', async (req, res) => {
  try {
    const { getDatabaseAsync } = require('../../database');
    const database = await getDatabaseAsync();
    const { HistoricalMarketIndicatorsService } = require('../../services/historicalMarketIndicators');
    const service = new HistoricalMarketIndicatorsService(database);

    // Get current quarter
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const currentQuarter = `${year}-Q${q}`;
    const endMonths = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
    const quarterEndDate = `${year}-${endMonths[q]}`;

    console.log(`Refreshing market indicators for ${currentQuarter}...`);

    // Calculate current quarter metrics
    const buffett = await service.calculateBuffettIndicator(currentQuarter);
    const sp500PE = await service.getSP500PEForQuarterTTM(currentQuarter);
    const aggregateMetrics = await service.getQuarterMetrics(currentQuarter);

    // Upsert into table
    const params = [
      currentQuarter,
      quarterEndDate,
      buffett?.value ? Math.round(buffett.value * 100) / 100 : null,
      buffett?.rawMarketCap || null,
      buffett?.gdp || null,
      buffett?.companyCount || null,
      sp500PE?.value ? Math.round(sp500PE.value * 100) / 100 : null,
      sp500PE?.marketCap || null,
      sp500PE?.totalEarnings || null,
      sp500PE?.companyCount || null,
      aggregateMetrics?.metrics?.pe_ratio ? Math.round(aggregateMetrics.metrics.pe_ratio * 100) / 100 : null,
      aggregateMetrics?.metrics?.msi ? Math.round(aggregateMetrics.metrics.msi * 1000) / 1000 : null,
      aggregateMetrics?.metrics?.pct_undervalued || null,
      aggregateMetrics?.sampleSize || null,
      'complete'
    ];
    const upsertSql = isUsingPostgres()
      ? `INSERT INTO market_indicator_history (
           quarter, quarter_end_date,
           buffett_indicator, buffett_market_cap, buffett_gdp, buffett_stock_count,
           sp500_pe, sp500_market_cap, sp500_earnings, sp500_company_count,
           median_pe, median_msi, pct_undervalued, total_stocks_analyzed,
           calculated_at, data_quality
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
         ON CONFLICT (quarter) DO UPDATE SET
           quarter_end_date = EXCLUDED.quarter_end_date,
           buffett_indicator = EXCLUDED.buffett_indicator,
           buffett_market_cap = EXCLUDED.buffett_market_cap,
           buffett_gdp = EXCLUDED.buffett_gdp,
           buffett_stock_count = EXCLUDED.buffett_stock_count,
           sp500_pe = EXCLUDED.sp500_pe,
           sp500_market_cap = EXCLUDED.sp500_market_cap,
           sp500_earnings = EXCLUDED.sp500_earnings,
           sp500_company_count = EXCLUDED.sp500_company_count,
           median_pe = EXCLUDED.median_pe,
           median_msi = EXCLUDED.median_msi,
           pct_undervalued = EXCLUDED.pct_undervalued,
           total_stocks_analyzed = EXCLUDED.total_stocks_analyzed,
           calculated_at = EXCLUDED.calculated_at,
           data_quality = EXCLUDED.data_quality`
      : `INSERT OR REPLACE INTO market_indicator_history (
           quarter, quarter_end_date,
           buffett_indicator, buffett_market_cap, buffett_gdp, buffett_stock_count,
           sp500_pe, sp500_market_cap, sp500_earnings, sp500_company_count,
           median_pe, median_msi, pct_undervalued, total_stocks_analyzed,
           calculated_at, data_quality
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, datetime('now'), $15)`;
    await database.query(upsertSql, params);

    res.json({
      success: true,
      quarter: currentQuarter,
      buffett: buffett?.value ? Math.round(buffett.value * 100) / 100 : null,
      sp500PE: sp500PE?.value ? Math.round(sp500PE.value * 100) / 100 : null,
      message: `Updated market indicators for ${currentQuarter}`
    });
  } catch (error) {
    console.error('Refresh current quarter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh current quarter',
      message: error.message,
    });
  }
});

module.exports = router;
