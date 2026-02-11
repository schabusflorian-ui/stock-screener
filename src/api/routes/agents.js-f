// src/api/routes/agents.js
// API routes for Trading Agents as first-class entities

const express = require('express');
const router = express.Router();
const agentService = require('../../services/agent/agentService');
const { validateBody, validateQuery, schemas } = require('../../middleware/validation');
const { asyncHandler } = require('../../middleware/errorHandler');

// Authentication and subscription middleware
const { requireAuth } = require('../../middleware/auth');
const { requireFeature, checkResourceLimit } = require('../../middleware/subscription');

// ============================================
// Agent CRUD Routes
// ============================================

/**
 * GET /api/agents
 * List all active trading agents
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const agents = await agentService.getAllAgents();
  res.json({ success: true, data: agents });
}));

/**
 * GET /api/agents/presets
 * Get available strategy presets
 */
router.get('/presets', asyncHandler(async (req, res) => {
  try {
    const presets = await agentService.getStrategyPresets();
    res.json({ success: true, data: presets });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents
 * Create a new trading agent
 * Requires: Ultra tier (paper_trading_bots feature)
 */
router.post('/', requireAuth, requireFeature('paper_trading_bots'), checkResourceLimit('agents'), validateBody('createAgent'), asyncHandler(async (req, res) => {
  try {
    const agent = await agentService.createAgent(req.body);
    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id
 * Get a single agent with details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const agent = await agentService.getAgent(parseInt(req.params.id, 10));
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * PUT /api/agents/:id
 * Update an agent
 */
router.put('/:id', validateBody('updateAgent'), asyncHandler(async (req, res) => {
  try {
    const agent = await agentService.updateAgent(parseInt(req.params.id, 10), req.body);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * DELETE /api/agents/:id
 * Delete (soft delete) an agent
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const result = await agentService.deleteAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ============================================
// Agent Lifecycle Routes
// ============================================

/**
 * GET /api/agents/:id/status
 * Get agent status
 */
router.get('/:id/status', asyncHandler(async (req, res) => {
  try {
    const status = await agentService.getAgentStatus(parseInt(req.params.id, 10));
    if (!status) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching agent status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/start
 * Start an agent
 */
router.post('/:id/start', asyncHandler(async (req, res) => {
  try {
    const status = await agentService.startAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/pause
 * Pause an agent
 */
router.post('/:id/pause', asyncHandler(async (req, res) => {
  try {
    const status = await agentService.pauseAgent(parseInt(req.params.id, 10));
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error pausing agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/scan
 * Trigger an immediate scan for an agent
 * Runs the TradingAgent to generate signals for the agent's universe
 */
router.post('/:id/scan', asyncHandler(async (req, res) => {
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
}));

// ============================================
// Signal Routes
// ============================================

/**
 * GET /api/agents/:id/signals
 * Get signals for an agent
 */
router.get('/:id/signals', asyncHandler(async (req, res) => {
  try {
    const { status, limit = 50, offset = 0, sortBy, sortOrder } = req.query;
    const signals = await agentService.getSignals(parseInt(req.params.id, 10), {
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
}));

/**
 * GET /api/agents/:id/signals/pending
 * Get pending signals for an agent
 */
router.get('/:id/signals/pending', asyncHandler(async (req, res) => {
  try {
    const signals = await agentService.getPendingSignals(parseInt(req.params.id, 10));
    res.json({ success: true, data: signals });
  } catch (error) {
    console.error('Error fetching pending signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/signals/:signalId
 * Get a single signal
 */
router.get('/:id/signals/:signalId', asyncHandler(async (req, res) => {
  try {
    const signal = await agentService.getSignal(parseInt(req.params.signalId, 10));
    if (!signal) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }
    res.json({ success: true, data: signal });
  } catch (error) {
    console.error('Error fetching signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/signals/:signalId/approve
 * Approve a signal
 */
router.post('/:id/signals/:signalId/approve', validateBody('approveSignal'), asyncHandler(async (req, res) => {
  try {
    const { portfolioId } = req.body || {};
    const signal = await agentService.approveSignal(
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
}));

/**
 * POST /api/agents/:id/signals/:signalId/reject
 * Reject a signal
 */
router.post('/:id/signals/:signalId/reject', validateBody('rejectSignal'), asyncHandler(async (req, res) => {
  try {
    const { reason } = req.body || {};
    const signal = await agentService.rejectSignal(
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
}));

/**
 * POST /api/agents/:id/signals/approve-all
 * Approve all pending signals
 */
router.post('/:id/signals/approve-all', asyncHandler(async (req, res) => {
  try {
    const { portfolioId } = req.body;
    const approved = await agentService.approveAllPendingSignals(
      parseInt(req.params.id, 10),
      portfolioId ? parseInt(portfolioId, 10) : null
    );
    res.json({ success: true, data: { approved: approved.length, signals: approved } });
  } catch (error) {
    console.error('Error approving all signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/signals/:signalId/execute
 * Execute an approved signal (triggers paper/live trading)
 */
router.post('/:id/signals/:signalId/execute', asyncHandler(async (req, res) => {
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
}));

/**
 * POST /api/agents/:id/signals/execute-all
 * Execute all approved signals for this agent
 */
router.post('/:id/signals/execute-all', asyncHandler(async (req, res) => {
  try {
    const executed = await agentService.executeAllApproved(parseInt(req.params.id, 10));
    res.json({ success: true, data: { executed: executed.length, signals: executed } });
  } catch (error) {
    console.error('Error executing all signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ============================================
// Portfolio Routes
// ============================================

/**
 * GET /api/agents/:id/portfolios
 * Get portfolios managed by an agent
 */
router.get('/:id/portfolios', asyncHandler(async (req, res) => {
  try {
    const portfolios = await agentService.getAgentPortfolios(parseInt(req.params.id, 10));
    res.json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error fetching agent portfolios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/portfolios
 * Create a new portfolio for an agent
 */
router.post('/:id/portfolios', asyncHandler(async (req, res) => {
  try {
    const { name, initial_capital, mode = 'paper' } = req.body;

    if (!name || !initial_capital) {
      return res.status(400).json({
        success: false,
        error: 'Name and initial_capital are required'
      });
    }

    const portfolios = await agentService.createPortfolioForAgent(
      parseInt(req.params.id, 10),
      { name, initial_capital, mode }
    );
    res.status(201).json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error creating portfolio for agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/portfolios/attach
 * Attach an existing portfolio to an agent
 */
router.post('/:id/portfolios/attach', asyncHandler(async (req, res) => {
  try {
    const { portfolioId, mode = 'paper' } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required'
      });
    }

    const portfolios = await agentService.attachPortfolio(
      parseInt(req.params.id, 10),
      parseInt(portfolioId, 10),
      mode
    );
    res.json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error attaching portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * DELETE /api/agents/:id/portfolios/:portfolioId
 * Detach a portfolio from an agent
 */
router.delete('/:id/portfolios/:portfolioId', asyncHandler(async (req, res) => {
  try {
    const result = await agentService.detachPortfolio(
      parseInt(req.params.id, 10),
      parseInt(req.params.portfolioId, 10)
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error detaching portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ============================================
// Performance & Activity Routes
// ============================================

/**
 * GET /api/agents/:id/performance
 * Get agent performance metrics
 */
router.get('/:id/performance', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);

    // Validate agent exists
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const performance = await agentService.getAgentPerformance(agentId);

    // Handle case where no performance data exists yet
    if (!performance || !performance.total_signals_generated) {
      return res.json({
        success: true,
        data: {
          message: 'No performance data available yet',
          total_signals_generated: 0,
          total_trades_executed: 0,
          win_rate: 0,
          avg_return: 0,
          total_return: 0,
          sharpe_ratio: 0,
          max_drawdown_actual: 0,
          signalPerformance: { buy: [], sell: [] },
          recentReturns: []
        }
      });
    }

    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/activity
 * Get agent activity log
 */
router.get('/:id/activity', asyncHandler(async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activity = await agentService.getActivityLog(
      parseInt(req.params.id, 10),
      parseInt(limit, 10)
    );
    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Error fetching agent activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/config
 * Get agent configuration for TradingAgent
 */
router.get('/:id/config', asyncHandler(async (req, res) => {
  try {
    const config = await agentService.getAgentConfig(parseInt(req.params.id, 10));
    if (!config) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ============================================
// Execution Routes
// ============================================

/**
 * GET /api/agents/:id/executions
 * Get all executions for an agent (pending, approved, and executed)
 */
router.get('/:id/executions', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const executions = await agentService.getExecutions(agentId);
    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/executions/:executionId/approve
 * Approve an execution (move from pending to approved)
 */
router.post('/:id/executions/:executionId/approve', asyncHandler(async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId, 10);
    const execution = await agentService.approveExecution(executionId);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error approving execution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/executions/:executionId/reject
 * Reject an execution
 */
router.post('/:id/executions/:executionId/reject', asyncHandler(async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId, 10);
    const { reason } = req.body;
    const execution = await agentService.rejectExecution(executionId, reason);
    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error rejecting execution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/executions/:executionId/execute
 * Execute an approved trade
 */
router.post('/:id/executions/:executionId/execute', asyncHandler(async (req, res) => {
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
}));

/**
 * POST /api/agents/:id/executions/approve-all
 * Approve all pending executions
 */
router.post('/:id/executions/approve-all', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const approved = await agentService.approveAllExecutions(agentId);
    res.json({ success: true, data: { approved: approved.length, executions: approved } });
  } catch (error) {
    console.error('Error approving all executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/executions/execute-all
 * Execute all approved trades
 */
router.post('/:id/executions/execute-all', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const executed = await agentService.executeAllApproved(agentId);
    res.json({ success: true, data: { executed: executed.length, trades: executed } });
  } catch (error) {
    console.error('Error executing all trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * PUT /api/agents/:id/settings
 * Update agent settings
 */
router.put('/:id/settings', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const agent = await agentService.updateAgentSettings(agentId, req.body);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error updating agent settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/live-status
 * Lightweight status endpoint for polling
 */
router.get('/:id/live-status', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const status = await agentService.getLiveStatus(agentId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching live status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// ============================================
// Beginner Strategy Routes
// ============================================

const { BeginnerStrategyEngine, STRATEGY_TYPES, FREQUENCIES } = require('../../services/strategy/beginnerStrategyEngine');

/**
 * GET /api/agents/beginner/presets
 * Get beginner strategy presets
 */
router.get('/beginner/presets', asyncHandler(async (req, res) => {
  try {
    const presets = await agentService.getBeginnerPresets();
    res.json({ success: true, data: presets });
  } catch (error) {
    console.error('Error fetching beginner presets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/beginner/strategy-types
 * Get available beginner strategy types with descriptions
 */
router.get('/beginner/strategy-types', asyncHandler(async (req, res) => {
  try {
    const types = [
      {
        id: STRATEGY_TYPES.DCA,
        name: 'Dollar Cost Averaging',
        description: 'Invest a fixed dollar amount at regular intervals regardless of price',
        benefits: [
          'Reduces timing risk',
          'Automatic and disciplined',
          'Lower average cost over time'
        ],
        params: ['amount', 'frequency', 'target_assets']
      },
      {
        id: STRATEGY_TYPES.VALUE_AVERAGING,
        name: 'Value Averaging',
        description: 'Adjust contributions to maintain a target portfolio growth path',
        benefits: [
          'Invests more when market is down',
          'Invests less when market is up',
          'Can outperform DCA in volatile markets'
        ],
        params: ['target_growth_rate', 'min_contribution', 'max_contribution', 'target_assets']
      },
      {
        id: STRATEGY_TYPES.DRIP,
        name: 'Dividend Reinvestment (DRIP)',
        description: 'Automatically reinvest all dividends to compound returns',
        benefits: [
          'Maximizes compounding effect',
          'No cash drag',
          'Grows positions automatically'
        ],
        params: ['reinvest_same_stock', 'min_dividend_to_reinvest']
      },
      {
        id: STRATEGY_TYPES.REBALANCE,
        name: 'Portfolio Rebalancing',
        description: 'Maintain target asset allocation by periodic rebalancing',
        benefits: [
          'Enforces discipline',
          'Sells high, buys low automatically',
          'Manages risk through diversification'
        ],
        params: ['target_allocation', 'rebalance_threshold', 'rebalance_frequency']
      },
      {
        id: STRATEGY_TYPES.LUMP_DCA,
        name: 'Lump Sum + DCA Hybrid',
        description: 'Invest portion immediately, DCA the rest over time',
        benefits: [
          'Balances time-in-market with risk management',
          'Good for windfalls or bonuses',
          'Reduces regret from poor timing'
        ],
        params: ['total_amount', 'lump_sum_pct', 'dca_frequency', 'dca_end_date']
      }
    ];
    res.json({ success: true, data: { types, frequencies: FREQUENCIES } });
  } catch (error) {
    console.error('Error fetching strategy types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/beginner
 * Create a new beginner strategy agent
 */
router.post('/beginner', asyncHandler(async (req, res) => {
  try {
    const {
      name,
      description,
      portfolioId,
      strategyType,
      config
    } = req.body;

    // Validate required fields
    if (!name || !strategyType || !config) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, strategyType, config'
      });
    }

    // Validate strategy type
    if (!Object.values(STRATEGY_TYPES).includes(strategyType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid strategy type. Must be one of: ${Object.values(STRATEGY_TYPES).join(', ')}`
      });
    }

    // Create the agent with beginner configuration
    const agent = agentService.createBeginnerAgent({
      name,
      description,
      portfolioId,
      strategyType,
      config
    });

    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    console.error('Error creating beginner agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/contributions
 * Get contribution history for a beginner agent
 */
router.get('/:id/contributions', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const { limit = 50 } = req.query;

    const engine = new BeginnerStrategyEngine();
    const contributions = await engine.getContributionHistory(agentId, parseInt(limit, 10));

    res.json({ success: true, data: contributions });
  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/contributions/preview
 * Preview the next contribution for a beginner agent
 */
router.post('/:id/contributions/preview', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);

    const engine = new BeginnerStrategyEngine();
    const signals = await engine.generateSignals(agentId);

    const totalAmount = signals.reduce((sum, s) => sum + (s.amount || 0), 0);

    res.json({
      success: true,
      data: {
        signals,
        totalAmount,
        signalCount: signals.length
      }
    });
  } catch (error) {
    console.error('Error previewing contribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * POST /api/agents/:id/contributions/execute
 * Execute the next contribution for a beginner agent
 */
router.post('/:id/contributions/execute', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);

    const engine = new BeginnerStrategyEngine();
    const signals = await engine.generateSignals(agentId);

    if (signals.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No contribution due at this time',
          signals: []
        }
      });
    }

    // Create pending signals in agent_signals table for approval flow
    const createdSignals = [];
    for (const signal of signals) {
      const created = agentService.createSignal(agentId, {
        symbol: signal.symbol,
        action: signal.action,
        overall_score: signal.confidence,
        confidence: signal.confidence,
        signals: JSON.stringify({ beginner: signal }),
        contribution_type: signal.contribution_type,
        contribution_amount: signal.amount,
        status: 'pending_approval'
      });
      createdSignals.push(created);
    }

    // Create contribution record
    const contributionId = await engine.createPendingContribution(agentId, signals);

    // Update next contribution date
    await engine.updateNextContributionDate(agentId);

    res.json({
      success: true,
      data: {
        message: 'Contribution signals created for approval',
        contributionId,
        signals: createdSignals
      }
    });
  } catch (error) {
    console.error('Error executing contribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/projection
 * Project future portfolio value for a beginner agent
 */
router.get('/:id/projection', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const { years = 10 } = req.query;

    const engine = new BeginnerStrategyEngine();
    const projection = await engine.projectFutureValue(agentId, parseInt(years, 10));

    res.json({ success: true, data: projection });
  } catch (error) {
    console.error('Error calculating projection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/agents/:id/schedule
 * Get the contribution schedule for a beginner agent
 */
router.get('/:id/schedule', asyncHandler(async (req, res) => {
  try {
    const agentId = parseInt(req.params.id, 10);
    const agent = agentService.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    if (agent.agent_category !== 'beginner') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for beginner strategy agents'
      });
    }

    const config = JSON.parse(agent.beginner_config || '{}');

    const schedule = {
      strategyType: config.strategy_type,
      frequency: config.frequency || config.dca_frequency || config.rebalance_frequency,
      nextContributionDate: config.next_contribution_date || config.next_rebalance_date,
      amount: config.amount,
      targetAssets: config.target_assets,
      targetAllocation: config.target_allocation
    };

    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

module.exports = router;
