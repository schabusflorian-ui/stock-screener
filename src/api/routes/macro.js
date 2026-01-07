/**
 * Macroeconomic Data API Routes
 *
 * Provides endpoints for economic indicators, yield curve, and macro signals.
 */

const express = require('express');
const router = express.Router();
const { FREDService } = require('../../services/data');
const db = require('../../database');

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
router.get('/snapshot', (req, res) => {
  try {
    const service = getService();
    const snapshot = service.getMacroSnapshot();
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
router.get('/signals', (req, res) => {
  try {
    const service = getService();
    const signals = service.getMacroSignals();
    res.json(signals);
  } catch (error) {
    console.error('Macro signals error:', error);
    res.status(500).json({ error: 'Failed to get macro signals', message: error.message });
  }
});

// ========================================
// Yield Curve
// ========================================

/**
 * GET /api/macro/yield-curve
 * Get current yield curve
 */
router.get('/yield-curve', (req, res) => {
  try {
    const curve = db.getDatabase().prepare(`
      SELECT * FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `).get();

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
    console.error('Yield curve error:', error);
    res.status(500).json({ error: 'Failed to get yield curve', message: error.message });
  }
});

/**
 * GET /api/macro/yield-curve/history
 * Get yield curve history
 */
router.get('/yield-curve/history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;

    const history = db.getDatabase().prepare(`
      SELECT curve_date, y_2y, y_5y, y_10y, y_30y, spread_2s10s, is_inverted_2s10s
      FROM yield_curve
      WHERE curve_date >= date('now', '-' || ? || ' days')
      ORDER BY curve_date ASC
    `).all(days);

    res.json(history);
  } catch (error) {
    console.error('Yield curve history error:', error);
    res.status(500).json({ error: 'Failed to get yield curve history', message: error.message });
  }
});

// ========================================
// Economic Indicators
// ========================================

/**
 * GET /api/macro/indicators
 * Get all latest economic indicators
 */
router.get('/indicators', (req, res) => {
  try {
    const category = req.query.category;

    let query = `
      SELECT * FROM v_latest_economic_indicators
    `;

    if (category) {
      query += ` WHERE category = ?`;
    }

    query += ` ORDER BY category, series_name`;

    const indicators = category
      ? db.getDatabase().prepare(query).all(category)
      : db.getDatabase().prepare(query).all();

    res.json(indicators);
  } catch (error) {
    console.error('Indicators error:', error);
    res.status(500).json({ error: 'Failed to get indicators', message: error.message });
  }
});

/**
 * GET /api/macro/indicators/:seriesId
 * Get specific indicator history
 */
router.get('/indicators/:seriesId', (req, res) => {
  try {
    const { seriesId } = req.params;
    const days = parseInt(req.query.days) || 365;

    const history = db.getDatabase().prepare(`
      SELECT observation_date, value, change_1m, change_1y
      FROM economic_indicators
      WHERE series_id = ?
        AND observation_date >= date('now', '-' || ? || ' days')
      ORDER BY observation_date ASC
    `).all(seriesId.toUpperCase(), days);

    const metadata = db.getDatabase().prepare(`
      SELECT * FROM economic_series_definitions WHERE series_id = ?
    `).get(seriesId.toUpperCase());

    res.json({
      seriesId: seriesId.toUpperCase(),
      metadata,
      history,
    });
  } catch (error) {
    console.error('Indicator history error:', error);
    res.status(500).json({ error: 'Failed to get indicator history', message: error.message });
  }
});

/**
 * GET /api/macro/categories
 * Get available indicator categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = db.getDatabase().prepare(`
      SELECT category, COUNT(*) as series_count
      FROM economic_series_definitions
      WHERE is_active = 1
      GROUP BY category
      ORDER BY category
    `).all();

    res.json(categories);
  } catch (error) {
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
router.get('/status', (req, res) => {
  try {
    const latestIndicator = db.getDatabase().prepare(`
      SELECT MAX(observation_date) as latest_date
      FROM economic_indicators
    `).get();

    const latestYieldCurve = db.getDatabase().prepare(`
      SELECT MAX(curve_date) as latest_date
      FROM yield_curve
    `).get();

    const seriesCount = db.getDatabase().prepare(`
      SELECT COUNT(DISTINCT series_id) as count
      FROM economic_indicators
    `).get();

    const totalObservations = db.getDatabase().prepare(`
      SELECT COUNT(*) as count
      FROM economic_indicators
    `).get();

    res.json({
      status: 'ok',
      apiKeyConfigured: !!process.env.FRED_API_KEY,
      latestIndicatorDate: latestIndicator?.latest_date,
      latestYieldCurveDate: latestYieldCurve?.latest_date,
      seriesTracked: seriesCount?.count || 0,
      totalObservations: totalObservations?.count || 0,
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});

// ========================================
// Key Metrics Summary
// ========================================

/**
 * GET /api/macro/key-metrics
 * Get key macro metrics summary
 */
router.get('/key-metrics', (req, res) => {
  try {
    const dbConn = db.getDatabase();

    // Get key values
    const getValue = (seriesId) => {
      const result = dbConn.prepare(`
        SELECT value, observation_date FROM economic_indicators
        WHERE series_id = ?
        ORDER BY observation_date DESC
        LIMIT 1
      `).get(seriesId);
      return result;
    };

    const fedFunds = getValue('DFF');
    const treasury10y = getValue('DGS10');
    const treasury2y = getValue('DGS2');
    const vix = getValue('VIXCLS');
    const hySpread = getValue('BAMLH0A0HYM2');
    const unemployment = getValue('UNRATE');
    const cpi = getValue('CPIAUCSL');

    // Get yield curve
    const yieldCurve = dbConn.prepare(`
      SELECT spread_2s10s, is_inverted_2s10s
      FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `).get();

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
    console.error('Key metrics error:', error);
    res.status(500).json({ error: 'Failed to get key metrics', message: error.message });
  }
});

module.exports = router;
