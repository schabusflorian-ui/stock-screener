// src/api/routes/execution.js
// API routes for auto-execution and pending trades management

const express = require('express');
const router = express.Router();
const { AutoExecutor } = require('../../services/agent/autoExecutor');

// Middleware to get executor service
const getExecutor = (req) => {
  const db = req.app.get('db');
  return new AutoExecutor(db);
};

// ============================================
// Portfolio Execution Settings
// ============================================

// GET /api/execution/portfolios/:id/settings - Get execution settings
router.get('/portfolios/:id/settings', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.put('/portfolios/:id/settings', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.get('/pending', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.get('/portfolios/:id/pending', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/:id/approve', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/:id/reject', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/:id/execute', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/portfolios/:id/approve-all', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/portfolios/:id/reject-all', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.get('/portfolios/:id/history', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.get('/portfolios/:id/stats', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/submit-recommendation', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/execute-all', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/portfolios/:id/execute-all', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.get('/approved', (req, res) => {
  try {
    const executor = getExecutor(req);
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
router.post('/expire-old', (req, res) => {
  try {
    const executor = getExecutor(req);

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

module.exports = router;
