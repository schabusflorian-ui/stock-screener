// src/api/routes/agents.js
// API routes for Trading Agents as first-class entities

const express = require('express');
const router = express.Router();
const agentService = require('../../services/agent/agentService');

// ============================================
// Agent CRUD Routes
// ============================================

/**
 * GET /api/agents
 * List all active trading agents
 */
router.get('/', (req, res) => {
  try {
    const agents = agentService.getAllAgents();
    res.json({ success: true, data: agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/presets
 * Get available strategy presets
 */
router.get('/presets', (req, res) => {
  try {
    const presets = agentService.getStrategyPresets();
    res.json({ success: true, data: presets });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents
 * Create a new trading agent
 */
router.post('/', (req, res) => {
  try {
    const agent = agentService.createAgent(req.body);
    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id
 * Get a single agent with details
 */
router.get('/:id', (req, res) => {
  try {
    const agent = agentService.getAgent(parseInt(req.params.id, 10));
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/agents/:id
 * Update an agent
 */
router.put('/:id', (req, res) => {
  try {
    const agent = agentService.updateAgent(parseInt(req.params.id, 10), req.body);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete (soft delete) an agent
 */
router.delete('/:id', (req, res) => {
  try {
    const result = agentService.deleteAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Agent Lifecycle Routes
// ============================================

/**
 * GET /api/agents/:id/status
 * Get agent status
 */
router.get('/:id/status', (req, res) => {
  try {
    const status = agentService.getAgentStatus(parseInt(req.params.id, 10));
    if (!status) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching agent status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/start
 * Start an agent
 */
router.post('/:id/start', (req, res) => {
  try {
    const status = agentService.startAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/pause
 * Pause an agent
 */
router.post('/:id/pause', (req, res) => {
  try {
    const status = agentService.pauseAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error pausing agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/scan
 * Trigger an immediate scan for an agent
 * Runs the TradingAgent to generate signals for the agent's universe
 */
router.post('/:id/scan', async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const agent = agentService.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    // Run the actual scan using tradingAgent.js
    const result = await agentService.runScan(agentId);

    res.json({
      success: true,
      data: {
        message: 'Scan completed',
        agentId,
        ...result,
        status: agentService.getAgentStatus(agentId)
      }
    });
  } catch (error) {
    console.error('Error triggering scan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Signal Routes
// ============================================

/**
 * GET /api/agents/:id/signals
 * Get signals for an agent
 */
router.get('/:id/signals', (req, res) => {
  try {
    const { status, limit = 50, offset = 0, sortBy, sortOrder } = req.query;
    const signals = agentService.getSignals(parseInt(req.params.id, 10), {
      status,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      sortBy,
      sortOrder
    });
    res.json({ success: true, data: signals });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id/signals/pending
 * Get pending signals for an agent
 */
router.get('/:id/signals/pending', (req, res) => {
  try {
    const signals = agentService.getPendingSignals(parseInt(req.params.id, 10));
    res.json({ success: true, data: signals });
  } catch (error) {
    console.error('Error fetching pending signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id/signals/:signalId
 * Get a single signal
 */
router.get('/:id/signals/:signalId', (req, res) => {
  try {
    const signal = agentService.getSignal(parseInt(req.params.signalId, 10));
    if (!signal) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }
    res.json({ success: true, data: signal });
  } catch (error) {
    console.error('Error fetching signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/signals/:signalId/approve
 * Approve a signal
 */
router.post('/:id/signals/:signalId/approve', (req, res) => {
  try {
    const { portfolioId } = req.body || {};
    const signal = agentService.approveSignal(
      parseInt(req.params.signalId, 10),
      portfolioId ? parseInt(portfolioId, 10) : null
    );
    if (!signal) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }
    res.json({ success: true, data: signal });
  } catch (error) {
    console.error('Error approving signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/signals/:signalId/reject
 * Reject a signal
 */
router.post('/:id/signals/:signalId/reject', (req, res) => {
  try {
    const { reason } = req.body || {};
    const signal = agentService.rejectSignal(
      parseInt(req.params.signalId, 10),
      reason
    );
    if (!signal) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }
    res.json({ success: true, data: signal });
  } catch (error) {
    console.error('Error rejecting signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/signals/approve-all
 * Approve all pending signals
 */
router.post('/:id/signals/approve-all', (req, res) => {
  try {
    const { portfolioId } = req.body;
    const approved = agentService.approveAllPendingSignals(
      parseInt(req.params.id, 10),
      portfolioId ? parseInt(portfolioId, 10) : null
    );
    res.json({ success: true, data: { approved: approved.length, signals: approved } });
  } catch (error) {
    console.error('Error approving all signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/signals/:signalId/execute
 * Execute an approved signal (triggers paper/live trading)
 */
router.post('/:id/signals/:signalId/execute', async (req, res) => {
  try {
    const result = await agentService.executeApproved(parseInt(req.params.signalId, 10));
    if (!result) {
      return res.status(404).json({ success: false, error: 'Signal not found or not in approved status' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/signals/execute-all
 * Execute all approved signals for this agent
 */
router.post('/:id/signals/execute-all', async (req, res) => {
  try {
    const executed = await agentService.executeAllApproved(parseInt(req.params.id, 10));
    res.json({ success: true, data: { executed: executed.length, signals: executed } });
  } catch (error) {
    console.error('Error executing all signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Portfolio Routes
// ============================================

/**
 * GET /api/agents/:id/portfolios
 * Get portfolios managed by an agent
 */
router.get('/:id/portfolios', (req, res) => {
  try {
    const portfolios = agentService.getAgentPortfolios(parseInt(req.params.id, 10));
    res.json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error fetching agent portfolios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/portfolios
 * Create a new portfolio for an agent
 */
router.post('/:id/portfolios', (req, res) => {
  try {
    const { name, initial_capital, mode = 'paper' } = req.body;

    if (!name || !initial_capital) {
      return res.status(400).json({
        success: false,
        error: 'Name and initial_capital are required'
      });
    }

    const portfolios = agentService.createPortfolioForAgent(
      parseInt(req.params.id, 10),
      { name, initial_capital, mode }
    );
    res.status(201).json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error creating portfolio for agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/portfolios/attach
 * Attach an existing portfolio to an agent
 */
router.post('/:id/portfolios/attach', (req, res) => {
  try {
    const { portfolioId, mode = 'paper' } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required'
      });
    }

    const portfolios = agentService.attachPortfolio(
      parseInt(req.params.id, 10),
      parseInt(portfolioId, 10),
      mode
    );
    res.json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error attaching portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/agents/:id/portfolios/:portfolioId
 * Detach a portfolio from an agent
 */
router.delete('/:id/portfolios/:portfolioId', (req, res) => {
  try {
    const result = agentService.detachPortfolio(
      parseInt(req.params.id, 10),
      parseInt(req.params.portfolioId, 10)
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error detaching portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Performance & Activity Routes
// ============================================

/**
 * GET /api/agents/:id/performance
 * Get agent performance metrics
 */
router.get('/:id/performance', (req, res) => {
  try {
    const performance = agentService.getAgentPerformance(parseInt(req.params.id, 10));
    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id/activity
 * Get agent activity log
 */
router.get('/:id/activity', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activity = agentService.getActivityLog(
      parseInt(req.params.id, 10),
      parseInt(limit, 10)
    );
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error fetching agent activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id/config
 * Get agent configuration for TradingAgent
 */
router.get('/:id/config', (req, res) => {
  try {
    const config = agentService.getAgentConfig(parseInt(req.params.id, 10));
    if (!config) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Execution Routes
// ============================================

/**
 * GET /api/agents/:id/executions
 * Get all executions for an agent (pending, approved, and executed)
 */
router.get('/:id/executions', (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const executions = agentService.getExecutions(agentId);
    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/executions/:executionId/approve
 * Approve an execution (move from pending to approved)
 */
router.post('/:id/executions/:executionId/approve', (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId, 10);
    const execution = agentService.approveExecution(executionId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error approving execution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/executions/:executionId/reject
 * Reject an execution
 */
router.post('/:id/executions/:executionId/reject', (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId, 10);
    const { reason } = req.body;
    const execution = agentService.rejectExecution(executionId, reason);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error rejecting execution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/executions/:executionId/execute
 * Execute an approved trade
 */
router.post('/:id/executions/:executionId/execute', async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId, 10);
    const execution = await agentService.executeApproved(executionId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error executing trade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/executions/approve-all
 * Approve all pending executions
 */
router.post('/:id/executions/approve-all', (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const approved = agentService.approveAllExecutions(agentId);
    res.json({ success: true, data: { approved: approved.length, executions: approved } });
  } catch (error) {
    console.error('Error approving all executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/executions/execute-all
 * Execute all approved trades
 */
router.post('/:id/executions/execute-all', async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const executed = await agentService.executeAllApproved(agentId);
    res.json({ success: true, data: { executed: executed.length, trades: executed } });
  } catch (error) {
    console.error('Error executing all trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/agents/:id/settings
 * Update agent settings
 */
router.put('/:id/settings', (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const agent = agentService.updateAgentSettings(agentId, req.body);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error updating agent settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agents/:id/live-status
 * Lightweight status endpoint for polling
 */
router.get('/:id/live-status', (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const status = agentService.getLiveStatus(agentId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching live status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
