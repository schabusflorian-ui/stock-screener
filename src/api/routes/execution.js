// src/api/routes/execution.js
// API routes for auto-execution, pending trades, and algorithmic execution

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const { AutoExecutor } = require('../../services/agent/autoExecutor');
const { getExecutor: getAlgoExecutor, ALGORITHMS, URGENCY } = require('../../services/execution/algorithmicExecutor');

// Middleware to get executor service (async)
const getExecutor = async (req) => {
  const db = await getDatabaseAsync();
  return new AutoExecutor(db);
};

// ============================================
// Portfolio Execution Settings
// ============================================

// GET /api/execution/portfolios/:id/settings - Get execution settings
router.get('/portfolios/:id/settings', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;

    const settings = executor.getPortfolioSettings(parseInt(id));

    if (!settings) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error getting execution settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/execution/portfolios/:id/settings - Update execution settings
router.put('/portfolios/:id/settings', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const {
      autoExecute,
      executionThreshold,
      maxAutoPositionPct,
      requireConfirmation,
      autoExecuteActions
    } = req.body;

    const settings = executor.updatePortfolioSettings(parseInt(id), {
      autoExecute,
      executionThreshold,
      maxAutoPositionPct,
      requireConfirmation,
      autoExecuteActions
    });

    if (!settings) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json({
      success: true,
      message: 'Settings updated',
      settings
    });
  } catch (error) {
    console.error('Error updating execution settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Pending Executions
// ============================================

// GET /api/execution/pending - Get all pending executions
router.get('/pending', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { portfolioId } = req.query;

    const pending = executor.getPendingExecutions(
      portfolioId ? parseInt(portfolioId) : null
    );

    res.json({
      success: true,
      count: pending.length,
      executions: pending
    });
  } catch (error) {
    console.error('Error getting pending executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/portfolios/:id/pending - Get pending for specific portfolio
router.get('/portfolios/:id/pending', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;

    const pending = executor.getPendingExecutions(parseInt(id));

    res.json({
      success: true,
      portfolioId: parseInt(id),
      count: pending.length,
      executions: pending
    });
  } catch (error) {
    console.error('Error getting pending executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Execution Actions
// ============================================

// POST /api/execution/:id/approve - Approve a pending execution
router.post('/:id/approve', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { approvedBy = 'user' } = req.body;

    const result = executor.approveExecution(parseInt(id), approvedBy);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error approving execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/:id/reject - Reject a pending execution
router.post('/:id/reject', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { reason, rejectedBy = 'user' } = req.body;

    const result = executor.rejectExecution(parseInt(id), reason, rejectedBy);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error rejecting execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/:id/execute - Execute an approved trade
router.post('/:id/execute', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { actualPrice, actualShares } = req.body;

    const result = executor.executeApprovedTrade(
      parseInt(id),
      actualPrice ? parseFloat(actualPrice) : null,
      actualShares ? parseFloat(actualShares) : null
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error executing trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/portfolios/:id/approve-all - Approve all pending
router.post('/portfolios/:id/approve-all', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { approvedBy = 'user' } = req.body;

    const result = executor.approveAllPending(parseInt(id), approvedBy);

    res.json({
      success: true,
      portfolioId: parseInt(id),
      ...result
    });
  } catch (error) {
    console.error('Error approving all executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/portfolios/:id/reject-all - Reject all pending
router.post('/portfolios/:id/reject-all', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { reason = 'Batch rejection', rejectedBy = 'user' } = req.body;

    const result = executor.rejectAllPending(parseInt(id), reason, rejectedBy);

    res.json({
      success: true,
      portfolioId: parseInt(id),
      ...result
    });
  } catch (error) {
    console.error('Error rejecting all executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// History and Statistics
// ============================================

// GET /api/execution/portfolios/:id/history - Get execution history
router.get('/portfolios/:id/history', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const history = executor.getExecutionHistory(parseInt(id), parseInt(limit));

    res.json({
      success: true,
      portfolioId: parseInt(id),
      count: history.length,
      executions: history
    });
  } catch (error) {
    console.error('Error getting execution history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/portfolios/:id/stats - Get execution statistics
router.get('/portfolios/:id/stats', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;

    const stats = executor.getExecutionStats(parseInt(id));

    res.json({
      success: true,
      portfolioId: parseInt(id),
      stats
    });
  } catch (error) {
    console.error('Error getting execution stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Submit Recommendations (Entry Point for AI Agent)
// ============================================

// POST /api/execution/submit-recommendation - Submit a new trading recommendation
router.post('/submit-recommendation', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const {
      portfolioId,
      symbol,
      companyId,
      action,
      shares,
      price,
      score,
      confidence,
      regime,
      reasoning,
      signals,
      targetPrice,
      stopLoss
    } = req.body;

    // Validate required fields
    if (!portfolioId || !symbol || !action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: portfolioId, symbol, action'
      });
    }

    const result = executor.submitRecommendation({
      portfolioId: parseInt(portfolioId),
      symbol,
      companyId: companyId ? parseInt(companyId) : null,
      action,
      shares: shares ? parseInt(shares) : null,
      price: price ? parseFloat(price) : null,
      score: score ? parseFloat(score) : null,
      confidence: confidence ? parseFloat(confidence) : null,
      regime,
      reasoning,
      signals,
      targetPrice: targetPrice ? parseFloat(targetPrice) : null,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error submitting recommendation:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Execute All Approved
// ============================================

// POST /api/execution/execute-all - Execute all approved trades
router.post('/execute-all', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { portfolioId } = req.body;

    const result = executor.executeAllApproved(
      portfolioId ? parseInt(portfolioId) : null
    );

    res.json({
      success: true,
      message: `Executed ${result.executed} trades (${result.failed} failed)`,
      ...result
    });
  } catch (error) {
    console.error('Error executing all approved:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/portfolios/:id/execute-all - Execute all approved for a portfolio
router.post('/portfolios/:id/execute-all', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { id } = req.params;

    const result = executor.executeAllApproved(parseInt(id));

    res.json({
      success: true,
      portfolioId: parseInt(id),
      message: `Executed ${result.executed} trades (${result.failed} failed)`,
      ...result
    });
  } catch (error) {
    console.error('Error executing all approved:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/approved - Get all approved executions awaiting execution
router.get('/approved', async (req, res) => {
  try {
    const executor = await getExecutor(req);
    const { portfolioId } = req.query;

    const approved = executor.getApprovedExecutions(
      portfolioId ? parseInt(portfolioId) : null
    );

    res.json({
      success: true,
      count: approved.length,
      executions: approved
    });
  } catch (error) {
    console.error('Error getting approved executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Maintenance
// ============================================

// POST /api/execution/expire-old - Expire old pending executions
router.post('/expire-old', async (req, res) => {
  try {
    const executor = await getExecutor(req);

    const result = executor.expireOldExecutions();

    res.json({
      success: true,
      message: `Expired ${result.expired} old executions`,
      ...result
    });
  } catch (error) {
    console.error('Error expiring old executions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ALGORITHMIC EXECUTION (TWAP, VWAP, IS, etc.)
// ============================================

// Initialize the algorithmic executor
let algoExecutorInitialized = false;
const ensureAlgoExecutorInitialized = async () => {
  const executor = getAlgoExecutor();
  if (!algoExecutorInitialized) {
    await executor.initialize();
    algoExecutorInitialized = true;
  }
  return executor;
};

// GET /api/execution/algo/algorithms - Get available algorithms
router.get('/algo/algorithms', (req, res) => {
  res.json({
    success: true,
    algorithms: Object.entries(ALGORITHMS).map(([key, value]) => ({
      id: value,
      name: key,
      description: getAlgorithmDescription(value)
    })),
    urgencyLevels: Object.entries(URGENCY).map(([key, config]) => ({
      id: key.toLowerCase(),
      name: config.name,
      participationRate: config.participationRate,
      aggression: config.aggression
    }))
  });
});

function getAlgorithmDescription(algo) {
  const descriptions = {
    twap: 'Time-Weighted Average Price - Splits order evenly across time intervals',
    vwap: 'Volume-Weighted Average Price - Follows historical volume profile',
    is: 'Implementation Shortfall - Optimizes market impact vs timing risk (Almgren-Chriss)',
    pov: 'Percentage of Volume - Targets specific participation rate',
    adaptive: 'Adaptive - Adjusts execution based on real-time market conditions',
    iceberg: 'Iceberg - Hides true order size with visible slices',
    sniper: 'Sniper - Opportunistically seeks liquidity'
  };
  return descriptions[algo] || 'Custom algorithm';
}

// POST /api/execution/algo/orders - Submit a new algorithmic order
router.post('/algo/orders', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const {
      portfolioId,
      symbol,
      side,
      shares,
      algorithm = 'vwap',
      urgency = 'normal',
      startTime,
      endTime,
      limitPrice,
      parameters = {}
    } = req.body;

    // Validate required fields
    if (!portfolioId || !symbol || !side || !shares) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: portfolioId, symbol, side, shares'
      });
    }

    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Side must be "buy" or "sell"'
      });
    }

    const result = await executor.submitOrder({
      portfolioId: parseInt(portfolioId),
      symbol: symbol.toUpperCase(),
      side: side.toLowerCase(),
      shares: parseInt(shares),
      algorithm,
      urgency,
      startTime,
      endTime,
      limitPrice: limitPrice ? parseFloat(limitPrice) : null,
      parameters
    });

    res.json({
      success: true,
      message: `Algorithmic ${algorithm.toUpperCase()} order submitted`,
      ...result
    });
  } catch (error) {
    console.error('Error submitting algo order:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/algo/orders - Get all active algorithmic orders
router.get('/algo/orders', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { portfolioId, status } = req.query;

    const orders = [];
    for (const [orderId, order] of executor.activeOrders) {
      if (portfolioId && order.portfolioId !== parseInt(portfolioId)) continue;
      if (status && order.status !== status) continue;

      orders.push({
        id: orderId,
        symbol: order.symbol,
        side: order.side,
        algorithm: order.algorithm,
        status: order.status,
        totalShares: order.total_shares,
        filledShares: order.filled_shares,
        fillPercent: ((order.filled_shares / order.total_shares) * 100).toFixed(1) + '%',
        arrivalPrice: order.arrival_price,
        avgFillPrice: order.avg_fill_price
      });
    }

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Error getting algo orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/algo/orders/:id - Get specific algorithmic order status
router.get('/algo/orders/:id', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { id } = req.params;

    const status = executor.getOrderStatus(parseInt(id));

    if (!status) {
      return res.status(404).json({
        success: false,
        error: `Order ${id} not found`
      });
    }

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting algo order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/algo/orders/:id/execute - Execute next slice
router.post('/algo/orders/:id/execute', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { id } = req.params;

    const result = await executor.executeNextSlice(parseInt(id));

    if (!result) {
      return res.json({
        success: true,
        message: 'Order completed or no pending slices'
      });
    }

    if (result.skipped) {
      return res.json({
        success: true,
        skipped: true,
        reason: result.reason
      });
    }

    res.json({
      success: true,
      message: 'Slice executed',
      execution: result
    });
  } catch (error) {
    console.error('Error executing slice:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/algo/orders/:id/execute-all - Execute all remaining slices
router.post('/algo/orders/:id/execute-all', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { id } = req.params;

    const executions = [];
    let slice;
    while ((slice = await executor.executeNextSlice(parseInt(id))) !== null) {
      if (!slice.skipped) {
        executions.push(slice);
      }
    }

    const status = executor.getOrderStatus(parseInt(id));

    res.json({
      success: true,
      message: `Executed ${executions.length} slices`,
      executionsCount: executions.length,
      orderStatus: status
    });
  } catch (error) {
    console.error('Error executing all slices:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/execution/algo/orders/:id - Cancel an algorithmic order
router.delete('/algo/orders/:id', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { id } = req.params;
    const { reason } = req.body || {};

    const result = await executor.cancelOrder(parseInt(id), reason || 'User cancelled');

    res.json({
      success: true,
      message: 'Order cancelled',
      ...result
    });
  } catch (error) {
    console.error('Error cancelling algo order:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/algo/analytics - Get execution analytics
router.get('/algo/analytics', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { portfolioId, startDate, endDate, algorithm } = req.query;

    const analytics = executor.getAnalytics(
      portfolioId ? parseInt(portfolioId) : null,
      { startDate, endDate, algorithm }
    );

    res.json({
      success: true,
      ...analytics
    });
  } catch (error) {
    console.error('Error getting algo analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/execution/algo/portfolios/:id/analytics - Get portfolio-specific analytics
router.get('/algo/portfolios/:id/analytics', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const { id } = req.params;
    const { startDate, endDate, algorithm } = req.query;

    const analytics = executor.getAnalytics(parseInt(id), { startDate, endDate, algorithm });

    res.json({
      success: true,
      portfolioId: parseInt(id),
      ...analytics
    });
  } catch (error) {
    console.error('Error getting portfolio algo analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/algo/preview - Preview execution schedule without submitting
router.post('/algo/preview', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const {
      symbol,
      shares,
      algorithm = 'vwap',
      urgency = 'normal',
      startTime,
      endTime,
      parameters = {}
    } = req.body;

    if (!symbol || !shares) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, shares'
      });
    }

    // Generate schedule without creating order
    const schedule = executor._generateSchedule({
      symbol: symbol.toUpperCase(),
      shares: parseInt(shares),
      algorithm,
      urgency,
      startTime,
      endTime,
      parameters
    });

    res.json({
      success: true,
      preview: {
        symbol: symbol.toUpperCase(),
        shares: parseInt(shares),
        algorithm: schedule.algorithm,
        sliceCount: schedule.slices.length,
        durationMinutes: schedule.durationMinutes,
        estimatedCostBps: schedule.estimatedCostBps,
        slices: schedule.slices.map(s => ({
          time: s.time,
          shares: s.shares,
          weight: s.weight || s.normalizedWeight
        }))
      }
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/execution/algo/recommend - Get algorithm recommendation for an order
router.post('/algo/recommend', async (req, res) => {
  try {
    const executor = await ensureAlgoExecutorInitialized();
    const {
      portfolioId,
      symbol,
      shares,
      urgency = 'normal',
      durationMinutes = 390 // Full trading day
    } = req.body;

    if (!symbol || !shares) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, shares'
      });
    }

    // Get historical analytics
    const analytics = portfolioId
      ? executor.getAnalytics(parseInt(portfolioId), {})
      : executor.getAnalytics(null, {});

    // Simple recommendation logic based on order characteristics
    let recommendedAlgo = 'vwap';
    let reason = 'VWAP is the standard benchmark for institutional execution';

    const urgencyLower = urgency.toLowerCase();

    if (urgencyLower === 'urgent' || urgencyLower === 'aggressive') {
      recommendedAlgo = 'is';
      reason = 'Implementation Shortfall minimizes timing risk for urgent orders';
    } else if (durationMinutes < 60) {
      recommendedAlgo = 'twap';
      reason = 'TWAP is efficient for short duration orders';
    } else if (parseInt(shares) > 100000) {
      recommendedAlgo = 'adaptive';
      reason = 'Adaptive algorithm adjusts to market conditions for large orders';
    }

    // Override with historical performance if available
    if (analytics.recommendation && analytics.recommendation.algorithm !== 'VWAP') {
      recommendedAlgo = analytics.recommendation.algorithm.toLowerCase();
      reason = analytics.recommendation.reason;
    }

    res.json({
      success: true,
      recommendation: {
        algorithm: recommendedAlgo,
        reason,
        alternatives: Object.values(ALGORITHMS).filter(a => a !== recommendedAlgo).slice(0, 3)
      },
      orderCharacteristics: {
        symbol,
        shares: parseInt(shares),
        urgency,
        durationMinutes
      }
    });
  } catch (error) {
    console.error('Error generating recommendation:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
