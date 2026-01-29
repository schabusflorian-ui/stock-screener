/**
 * Trading Signals API Routes
 *
 * Agent 1: Data & Signals
 * Provides endpoints for market regime, technical signals, and aggregated signals.
 */

const express = require('express');
const router = express.Router();
const { RegimeDetector, TechnicalSignals, SignalAggregator, REGIMES } = require('../../services/trading');
const { LiquidityRefresh } = require('../../jobs/liquidityRefresh');
const db = require('../../database');

// Initialize services
let regimeDetector = null;
let technicalSignals = null;
let signalAggregator = null;
let liquidityRefresh = null;

function getServices() {
  if (!regimeDetector) {
    regimeDetector = new RegimeDetector(db);
  }
  if (!technicalSignals) {
    technicalSignals = new TechnicalSignals(db);
  }
  if (!signalAggregator) {
    signalAggregator = new SignalAggregator(db);
  }
  if (!liquidityRefresh) {
    liquidityRefresh = new LiquidityRefresh(db.getDatabase());
  }
  return { regimeDetector, technicalSignals, signalAggregator, liquidityRefresh };
}

// ========================================
// Market Regime Endpoints
// ========================================

/**
 * GET /api/trading/regime/current
 * Get current market regime classification
 */
router.get('/regime/current', async (req, res) => {
  try {
    const { regimeDetector } = getServices();
    const regime = await regimeDetector.detectRegime();
    res.json(regime);
  } catch (error) {
    console.error('Regime detection error:', error);
    res.status(500).json({ error: 'Failed to detect regime', message: error.message });
  }
});

/**
 * GET /api/trading/regime/history
 * Get market regime history
 * Query params: days (default 30)
 */
router.get('/regime/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { regimeDetector } = getServices();
    const history = await regimeDetector.getRegimeHistory(days);
    res.json(history);
  } catch (error) {
    console.error('Regime history error:', error);
    res.status(500).json({ error: 'Failed to get regime history', message: error.message });
  }
});

/**
 * GET /api/trading/regime/definitions
 * Get regime type definitions
 */
router.get('/regime/definitions', (req, res) => {
  const { REGIME_DESCRIPTIONS } = require('../../services/trading');
  res.json({
    regimes: REGIMES,
    descriptions: REGIME_DESCRIPTIONS,
  });
});

// ========================================
// Technical Signal Endpoints
// ========================================

/**
 * GET /api/trading/technical/:symbol
 * Get technical signals for a specific symbol
 */
router.get('/technical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { technicalSignals } = getServices();
    const signal = await technicalSignals.calculate(symbol.toUpperCase());
    res.json(signal);
  } catch (error) {
    console.error(`Technical signal error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to calculate technical signals', message: error.message });
  }
});

/**
 * POST /api/trading/technical/batch
 * Get technical signals for multiple symbols
 * Body: { symbols: ['AAPL', 'MSFT', ...] }
 */
router.post('/technical/batch', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    if (symbols.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 symbols per batch' });
    }

    const { technicalSignals } = getServices();
    const results = await technicalSignals.calculateBatch(symbols.map(s => s.toUpperCase()));
    res.json(results);
  } catch (error) {
    console.error('Technical batch error:', error);
    res.status(500).json({ error: 'Failed to calculate technical signals', message: error.message });
  }
});

// ========================================
// Aggregated Signal Endpoints
// ========================================

/**
 * GET /api/trading/signals/:symbol
 * Get aggregated signals for a specific symbol
 */
router.get('/signals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { signalAggregator } = getServices();
    const signals = await signalAggregator.aggregateSignals(symbol.toUpperCase());
    res.json(signals);
  } catch (error) {
    console.error(`Aggregated signal error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to aggregate signals', message: error.message });
  }
});

/**
 * POST /api/trading/signals/batch
 * Get aggregated signals for multiple symbols
 * Body: { symbols: ['AAPL', 'MSFT', ...] }
 */
router.post('/signals/batch', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    if (symbols.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 symbols per batch (aggregation is expensive)' });
    }

    const { signalAggregator } = getServices();
    const results = await signalAggregator.aggregateBatch(symbols.map(s => s.toUpperCase()));
    res.json(results);
  } catch (error) {
    console.error('Aggregated batch error:', error);
    res.status(500).json({ error: 'Failed to aggregate signals', message: error.message });
  }
});

/**
 * GET /api/trading/signals/top/bullish
 * Get top bullish signals
 * Query params: limit (default 20)
 */
router.get('/signals/top/bullish', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { signalAggregator } = getServices();
    const signals = signalAggregator.getTopBullishSignals(limit);
    res.json(signals);
  } catch (error) {
    console.error('Top bullish signals error:', error);
    res.status(500).json({ error: 'Failed to get top bullish signals', message: error.message });
  }
});

// ========================================
// Summary Endpoints
// ========================================

/**
 * GET /api/trading/summary/:symbol
 * Get a quick summary of all signals for a symbol (uses cached data when available)
 */
router.get('/summary/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { signalAggregator, technicalSignals, regimeDetector } = getServices();

    // Try to get cached signals first
    const storedSignal = signalAggregator.getStoredSignal(symbol.toUpperCase());
    const storedTechnical = technicalSignals.getStoredSignal(symbol.toUpperCase());
    const storedRegime = regimeDetector.getStoredRegime();

    // If we have recent data (within last hour), use it
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    if (storedSignal && storedSignal.calculated_at > oneHourAgo) {
      return res.json({
        symbol: symbol.toUpperCase(),
        cached: true,
        cachedAt: storedSignal.calculated_at,
        regime: storedRegime?.regime || 'UNKNOWN',
        technical: {
          score: storedSignal.technical_score,
          signal: storedSignal.technical_signal,
        },
        sentiment: {
          score: storedSignal.sentiment_score,
          signal: storedSignal.sentiment_signal,
        },
        insider: {
          score: storedSignal.insider_score,
          signal: storedSignal.insider_signal,
        },
        analyst: {
          score: storedSignal.analyst_score,
          signal: storedSignal.analyst_signal,
        },
        overall: {
          signal: storedSignal.overall_signal,
          strength: storedSignal.overall_strength,
          confidence: storedSignal.overall_confidence,
          score: storedSignal.weighted_score,
        },
      });
    }

    // Otherwise, calculate fresh
    const signals = await signalAggregator.aggregateSignals(symbol.toUpperCase());
    res.json({
      symbol: symbol.toUpperCase(),
      cached: false,
      cachedAt: signals.timestamp,
      regime: signals.regime.regime,
      technical: {
        score: signals.signals.technical.score,
        signal: signals.signals.technical.signal,
      },
      sentiment: {
        score: signals.signals.sentiment.score,
        signal: signals.signals.sentiment.signal,
      },
      insider: {
        score: signals.signals.insider.score,
        signal: signals.signals.insider.signal,
      },
      analyst: {
        score: signals.signals.analyst.score,
        signal: signals.signals.analyst.signal,
      },
      overall: signals.overall,
    });
  } catch (error) {
    console.error(`Summary error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to get signal summary', message: error.message });
  }
});

/**
 * GET /api/trading/health
 * Health check for trading services
 */
router.get('/health', async (req, res) => {
  try {
    const { regimeDetector, liquidityRefresh } = getServices();
    const regime = regimeDetector.getStoredRegime();
    const liquidityStatus = liquidityRefresh.getStatus();

    res.json({
      status: 'ok',
      services: {
        regimeDetector: 'available',
        technicalSignals: 'available',
        signalAggregator: 'available',
        liquidityRefresh: 'available',
      },
      lastRegime: regime ? {
        date: regime.date,
        regime: regime.regime,
        vix: regime.vix,
      } : null,
      liquidity: {
        lastRun: liquidityStatus.lastRun,
        isRunning: liquidityStatus.isRunning,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// ========================================
// Liquidity Metrics Endpoints (Agent 2)
// ========================================

/**
 * GET /api/trading/liquidity/status
 * Get liquidity refresh job status
 */
router.get('/liquidity/status', (req, res) => {
  try {
    const { liquidityRefresh } = getServices();
    res.json(liquidityRefresh.getStatus());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get liquidity status', message: error.message });
  }
});

/**
 * POST /api/trading/liquidity/refresh
 * Trigger manual liquidity metrics refresh
 */
router.post('/liquidity/refresh', async (req, res) => {
  try {
    const { liquidityRefresh } = getServices();
    const status = liquidityRefresh.getStatus();

    if (status.isRunning) {
      return res.status(409).json({
        error: 'Refresh already in progress',
        lastRun: status.lastRun,
      });
    }

    // Start refresh in background
    liquidityRefresh.refreshAll().then(result => {
      console.log('Liquidity refresh completed:', result);
    }).catch(err => {
      console.error('Liquidity refresh error:', err);
    });

    res.json({
      message: 'Liquidity refresh started',
      status: 'running',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start liquidity refresh', message: error.message });
  }
});

/**
 * GET /api/trading/liquidity/top
 * Get most liquid stocks
 * Query params: limit (default 50)
 */
router.get('/liquidity/top', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { liquidityRefresh } = getServices();
    const stocks = liquidityRefresh.getMostLiquid(limit);
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get liquid stocks', message: error.message });
  }
});

/**
 * GET /api/trading/liquidity/volatile
 * Get most volatile stocks
 * Query params: limit (default 50)
 */
router.get('/liquidity/volatile', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { liquidityRefresh } = getServices();
    const stocks = liquidityRefresh.getMostVolatile(limit);
    res.json(stocks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get volatile stocks', message: error.message });
  }
});

/**
 * GET /api/trading/liquidity/:symbol
 * Get liquidity metrics for a specific symbol
 */
router.get('/liquidity/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const database = db.getDatabase();

    const company = database.prepare(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol);

    if (!company) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const { liquidityRefresh } = getServices();
    const metrics = liquidityRefresh.getLiquidity(company.id);

    if (!metrics) {
      return res.status(404).json({ error: 'No liquidity data for this symbol' });
    }

    res.json({
      symbol: symbol.toUpperCase(),
      ...metrics,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get liquidity metrics', message: error.message });
  }
});

/**
 * GET /api/trading/liquidity/stats/summary
 * Get overall liquidity statistics
 */
router.get('/liquidity/stats/summary', (req, res) => {
  try {
    const database = db.getDatabase();

    const stats = database.prepare(`
      SELECT
        COUNT(*) as total_stocks,
        AVG(avg_value_30d) as avg_daily_value,
        AVG(volatility_30d) as avg_volatility,
        AVG(bid_ask_spread_bps) as avg_spread_bps,
        MAX(updated_at) as last_updated
      FROM liquidity_metrics
    `).get();

    const distribution = database.prepare(`
      SELECT
        CASE
          WHEN avg_value_30d >= 1000000000 THEN 'mega_liquid'
          WHEN avg_value_30d >= 100000000 THEN 'very_liquid'
          WHEN avg_value_30d >= 10000000 THEN 'liquid'
          WHEN avg_value_30d >= 1000000 THEN 'moderate'
          ELSE 'illiquid'
        END as category,
        COUNT(*) as count
      FROM liquidity_metrics
      GROUP BY category
      ORDER BY
        CASE category
          WHEN 'mega_liquid' THEN 1
          WHEN 'very_liquid' THEN 2
          WHEN 'liquid' THEN 3
          WHEN 'moderate' THEN 4
          ELSE 5
        END
    `).all();

    res.json({
      summary: {
        totalStocks: stats.total_stocks,
        avgDailyValue: stats.avg_daily_value,
        avgVolatility: stats.avg_volatility,
        avgSpreadBps: stats.avg_spread_bps,
        lastUpdated: stats.last_updated,
      },
      distribution,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get liquidity stats', message: error.message });
  }
});

module.exports = router;
