// src/api/routes/tca.js
/**
 * Transaction Cost Analysis (TCA) API Routes
 *
 * Endpoints for execution quality analysis:
 * - GET /api/tca/benchmark - Run TCA benchmark
 * - GET /api/tca/metrics/:orderId - Get TCA metrics for a specific order
 * - GET /api/tca/summary - Get TCA summary statistics
 * - POST /api/tca/analyze - Analyze a trade's execution quality
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { getDatabaseAsync } = require('../../database');

// Lazy load TCA benchmark to avoid startup issues
let TCABenchmark = null;
let TCAMetricsCalculator = null;
let TCA_THRESHOLDS = null;

function loadTCAModule() {
  if (!TCABenchmark) {
    try {
      const tcaModule = require(path.join(__dirname, '../../../tests/benchmarks/transactionCostBenchmark'));
      TCABenchmark = tcaModule.TCABenchmark;
      TCAMetricsCalculator = tcaModule.TCAMetricsCalculator;
      TCA_THRESHOLDS = tcaModule.TCA_THRESHOLDS;
    } catch (e) {
      console.warn('TCA module not available:', e.message);
    }
  }
  return { TCABenchmark, TCAMetricsCalculator, TCA_THRESHOLDS };
}

// Lazy load TCA Results Manager
let resultsManager = null;

async function getResultsManager(req) {
  const db = await getDatabaseAsync();
  if (!db) {
    console.warn('TCA Results Manager not available: database not set on app');
    return null;
  }

  if (!resultsManager) {
    try {
      const { TCAResultsManager } = require('../../services/mlops/tcaResultsManager');
      resultsManager = new TCAResultsManager(db);
    } catch (e) {
      console.warn('TCA Results Manager not available:', e.message);
    }
  }
  return resultsManager;
}

/**
 * GET /api/tca/benchmark
 * Run the full TCA benchmark (without saving)
 */
router.get('/benchmark', async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { TCABenchmark } = loadTCAModule();
    if (!TCABenchmark) {
      return res.status(500).json({ success: false, error: 'TCA module not available' });
    }

    const benchmark = new TCABenchmark(db, { verbose: false });
    const results = await benchmark.runBenchmark();

    res.json({
      success: true,
      data: {
        summary: results.summary,
        byLiquidityTier: results.byLiquidityTier,
        passFail: results.passFail,
        overallPass: results.overallPass,
        passRate: results.passRate,
        tradeCount: results.trades.length
      }
    });
  } catch (error) {
    console.error('TCA benchmark error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tca/benchmark
 * Run the full TCA benchmark and save results for historical trending
 */
router.post('/benchmark', async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { TCABenchmark } = loadTCAModule();
    if (!TCABenchmark) {
      return res.status(500).json({ success: false, error: 'TCA module not available' });
    }

    const { runType = 'manual', notes } = req.body;

    const benchmark = new TCABenchmark(db, { verbose: false });
    const results = await benchmark.runBenchmark();

    // Save results to history
    const manager = await getResultsManager(req);
    let savedId = null;
    if (manager) {
      try {
        savedId = manager.saveResults(results, { runType, notes });
      } catch (saveError) {
        console.warn('Failed to save TCA results:', saveError.message);
      }
    }

    res.json({
      success: true,
      data: {
        summary: results.summary,
        byLiquidityTier: results.byLiquidityTier,
        passFail: results.passFail,
        overallPass: results.overallPass,
        passRate: results.passRate,
        tradeCount: results.trades.length,
        savedToHistory: savedId !== null,
        historyId: savedId
      }
    });
  } catch (error) {
    console.error('TCA benchmark error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/thresholds
 * Get production-ready TCA thresholds by liquidity tier
 */
router.get('/thresholds', (req, res) => {
  try {
    const { TCA_THRESHOLDS } = loadTCAModule();
    if (!TCA_THRESHOLDS) {
      return res.status(500).json({ success: false, error: 'TCA module not available' });
    }

    res.json({
      success: true,
      data: TCA_THRESHOLDS
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/summary
 * Get TCA summary statistics from recent executions
 */
router.get('/summary', async (req, res) => {
  try {
    const db = await getDatabaseAsync();

    // Get execution benchmarks if they exist
    let benchmarks = [];
    try {
      benchmarks = await db.prepare(`
        SELECT eb.*, ao.symbol, ao.side, ao.total_shares, ao.algorithm
        FROM execution_benchmarks eb
        JOIN algo_orders ao ON eb.order_id = ao.id
        WHERE ao.status = 'completed'
        ORDER BY eb.created_at DESC
        LIMIT 100
      `).all();
    } catch (e) {
      // Table may not exist
    }

    if (benchmarks.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No executed orders found for TCA analysis',
          recommendation: 'Run /api/tca/benchmark for synthetic analysis'
        }
      });
    }

    // Calculate summary stats
    const vsArrivalBps = benchmarks.map(b => b.vs_arrival_bps).filter(v => v != null);
    const vsVwapBps = benchmarks.map(b => b.vs_vwap_bps).filter(v => v != null);
    const marketImpactBps = benchmarks.map(b => b.market_impact_bps).filter(v => v != null);

    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const median = arr => {
      if (!arr.length) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    res.json({
      success: true,
      data: {
        totalOrders: benchmarks.length,
        implementationShortfall: {
          mean: mean(vsArrivalBps)?.toFixed(2),
          median: median(vsArrivalBps)?.toFixed(2)
        },
        vwapDeviation: {
          mean: mean(vsVwapBps)?.toFixed(2),
          median: median(vsVwapBps)?.toFixed(2)
        },
        marketImpact: {
          mean: mean(marketImpactBps)?.toFixed(2),
          median: median(marketImpactBps)?.toFixed(2)
        },
        recentOrders: benchmarks.slice(0, 10).map(b => ({
          symbol: b.symbol,
          side: b.side,
          shares: b.total_shares,
          algorithm: b.algorithm,
          vsArrivalBps: b.vs_arrival_bps?.toFixed(2),
          vsVwapBps: b.vs_vwap_bps?.toFixed(2)
        }))
      }
    });
  } catch (error) {
    console.error('TCA summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/orders/:orderId
 * Get TCA metrics for a specific algorithmic order
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = await getDatabaseAsync();

    const order = await db.prepare(`
      SELECT ao.*, eb.*
      FROM algo_orders ao
      LEFT JOIN execution_benchmarks eb ON ao.id = eb.order_id
      WHERE ao.id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Get execution slices
    const slices = await db.prepare(`
      SELECT * FROM algo_executions WHERE order_id = ? ORDER BY slice_number
    `).all(orderId);

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          totalShares: order.total_shares,
          filledShares: order.filled_shares,
          algorithm: order.algorithm,
          status: order.status,
          arrivalPrice: order.arrival_price,
          avgFillPrice: order.avg_fill_price
        },
        benchmarks: {
          vsArrivalBps: order.vs_arrival_bps,
          vsVwapBps: order.vs_vwap_bps,
          vsTwapBps: order.vs_twap_bps,
          delayCostBps: order.delay_cost_bps,
          marketImpactBps: order.market_impact_bps,
          timingCostBps: order.timing_cost_bps,
          opportunityCostBps: order.opportunity_cost_bps
        },
        slices: slices.map(s => ({
          sliceNumber: s.slice_number,
          scheduledTime: s.scheduled_time,
          executedTime: s.executed_time,
          targetShares: s.target_shares,
          filledShares: s.filled_shares,
          price: s.price,
          slippageBps: s.slippage_bps,
          status: s.status
        }))
      }
    });
  } catch (error) {
    console.error('TCA order error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/tca/analyze
 * Analyze a trade's execution quality
 */
router.post('/analyze', async (req, res) => {
  try {
    const { symbol, side, shares, decisionPrice, executionPrice, executionDate } = req.body;

    if (!symbol || !side || !shares || !decisionPrice || !executionPrice) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: symbol, side, shares, decisionPrice, executionPrice'
      });
    }

    const db = await getDatabaseAsync();
    const { TCAMetricsCalculator, TCA_THRESHOLDS } = loadTCAModule();
    if (!TCAMetricsCalculator) {
      return res.status(500).json({ success: false, error: 'TCA module not available' });
    }

    const calculator = new TCAMetricsCalculator(db);

    // Calculate all metrics
    const is = calculator.calculateImplementationShortfall(decisionPrice, executionPrice, side);
    const tier = calculator.getLiquidityTier(symbol);
    const spread = calculator.calculateSpreadCost(symbol);
    const impact = calculator.calculateMarketImpact(symbol, executionDate || new Date().toISOString().split('T')[0], shares, side);

    // Get thresholds for this tier
    const thresholds = TCA_THRESHOLDS[tier];

    // Evaluate
    const evaluation = {
      implementationShortfall: {
        value: is?.shortfallBps,
        threshold: thresholds.implementationShortfall,
        pass: is?.shortfallBps <= thresholds.implementationShortfall
      },
      marketImpact: {
        value: impact?.totalImpactBps,
        threshold: thresholds.marketImpact,
        pass: (impact?.totalImpactBps || 0) <= thresholds.marketImpact
      },
      spreadCost: {
        value: spread?.estimatedHalfSpreadBps,
        threshold: thresholds.spreadCost,
        pass: (spread?.estimatedHalfSpreadBps || 0) <= thresholds.spreadCost
      }
    };

    res.json({
      success: true,
      data: {
        symbol,
        side,
        shares,
        liquidityTier: tier,
        metrics: {
          implementationShortfall: is,
          spreadCost: spread,
          marketImpact: impact
        },
        evaluation,
        overallPass: Object.values(evaluation).every(e => e.pass)
      }
    });
  } catch (error) {
    console.error('TCA analyze error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/liquidity/:symbol
 * Get liquidity tier and cost estimates for a symbol
 */
router.get('/liquidity/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const db = await getDatabaseAsync();
    const { TCAMetricsCalculator, TCA_THRESHOLDS } = loadTCAModule();

    if (!TCAMetricsCalculator) {
      return res.status(500).json({ success: false, error: 'TCA module not available' });
    }

    const calculator = new TCAMetricsCalculator(db);

    const tier = calculator.getLiquidityTier(symbol);
    const spread = calculator.calculateSpreadCost(symbol);
    const thresholds = TCA_THRESHOLDS[tier];

    res.json({
      success: true,
      data: {
        symbol,
        liquidityTier: tier,
        spreadEstimate: spread,
        thresholds,
        recommendations: {
          maxParticipationRate: tier === 'MEGA_CAP' ? '20%' :
                               tier === 'LARGE_CAP' ? '15%' :
                               tier === 'MID_CAP' ? '10%' : '5%',
          suggestedAlgorithm: tier === 'SMALL_CAP' ? 'TWAP' : 'VWAP',
          expectedCostRange: `${thresholds.spreadCost}-${thresholds.implementationShortfall} bps`
        }
      }
    });
  } catch (error) {
    console.error('TCA liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// TCA History Endpoints - For historical trending and analysis
// =============================================================================

/**
 * GET /api/tca/history
 * Get recent TCA benchmark results
 */
router.get('/history', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const limit = parseInt(req.query.limit) || 30;
    const results = manager.getRecent(limit);

    res.json({
      success: true,
      data: {
        results,
        count: results.length
      }
    });
  } catch (error) {
    console.error('TCA history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/history/latest
 * Get the most recent TCA benchmark result
 */
router.get('/history/latest', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const result = manager.getLatest();

    if (!result) {
      return res.json({
        success: true,
        data: null,
        message: 'No TCA benchmark results found. Run POST /api/tca/benchmark to create one.'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('TCA history latest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/history/stats
 * Get summary statistics for TCA benchmark results over a period
 */
router.get('/history/stats', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const period = req.query.period || '-30 days';
    const stats = manager.getSummaryStats(period);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('TCA history stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/history/trend
 * Get daily trend data for charting TCA metrics over time
 */
router.get('/history/trend', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const period = req.query.period || '-30 days';
    const trend = manager.getTrend(period);

    res.json({
      success: true,
      data: {
        trend,
        period,
        dataPoints: trend.length
      }
    });
  } catch (error) {
    console.error('TCA history trend error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/history/comparison
 * Compare TCA metrics between two time periods
 */
router.get('/history/comparison', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const currentPeriod = req.query.current || '-7 days';
    const previousPeriod = req.query.previous || '-14 days';

    const comparison = manager.getComparison(currentPeriod, previousPeriod);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('TCA history comparison error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tca/history/range
 * Get TCA benchmark results within a date range
 */
router.get('/history/range', (req, res) => {
  try {
    const manager = await getResultsManager(req);
    if (!manager) {
      return res.status(500).json({ success: false, error: 'TCA Results Manager not available' });
    }

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Required query parameters: startDate, endDate (YYYY-MM-DD format)'
      });
    }

    const results = manager.getByDateRange(startDate, endDate);

    res.json({
      success: true,
      data: {
        results,
        count: results.length,
        dateRange: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('TCA history range error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
