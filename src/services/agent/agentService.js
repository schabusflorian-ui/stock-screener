// src/services/agent/agentService.js
// Service for managing Trading Agents as first-class entities
// Pattern follows investorService.js for consistency

const db = require('../../database').db;

// Ensure region column exists (for existing databases)
try {
  db.exec(`ALTER TABLE trading_agents ADD COLUMN region TEXT DEFAULT 'US'`);
} catch (e) {
  // Column already exists
}

// Default signal weights (from tradingAgent.js)
const DEFAULT_WEIGHTS = {
  technical: 0.11,
  sentiment: 0.11,
  insider: 0.11,
  fundamental: 0.13,
  alternative: 0.11,
  valuation: 0.11,
  thirteenf: 0.12,
  earnings: 0.10,
  valueQuality: 0.10
};

// Ensure unified_strategy_id column exists (for existing databases)
try {
  db.exec(`ALTER TABLE trading_agents ADD COLUMN unified_strategy_id INTEGER REFERENCES unified_strategies(id)`);
} catch (e) {
  // Column already exists
}

// Strategy presets
const STRATEGY_PRESETS = {
  technical: {
    name: 'Technical',
    description: 'Momentum and trend-following strategy',
    weights: {
      technical: 0.35,
      sentiment: 0.15,
      insider: 0.08,
      fundamental: 0.10,
      alternative: 0.08,
      valuation: 0.08,
      thirteenf: 0.08,
      earnings: 0.04,
      valueQuality: 0.04
    }
  },
  fundamental: {
    name: 'Fundamental',
    description: 'Value-focused strategy based on company fundamentals',
    weights: {
      technical: 0.08,
      sentiment: 0.05,
      insider: 0.15,
      fundamental: 0.30,
      alternative: 0.05,
      valuation: 0.25,
      thirteenf: 0.04,
      earnings: 0.04,
      valueQuality: 0.04
    }
  },
  sentiment: {
    name: 'Sentiment',
    description: 'News and social sentiment-driven strategy',
    weights: {
      technical: 0.15,
      sentiment: 0.35,
      insider: 0.08,
      fundamental: 0.08,
      alternative: 0.25,
      valuation: 0.03,
      thirteenf: 0.02,
      earnings: 0.02,
      valueQuality: 0.02
    }
  },
  hybrid: {
    name: 'Hybrid',
    description: 'Balanced strategy using all signal types',
    weights: DEFAULT_WEIGHTS
  },
  custom: {
    name: 'Custom',
    description: 'User-defined signal weights',
    weights: DEFAULT_WEIGHTS
  }
};

// ============================================
// Agent CRUD Operations
// ============================================

/**
 * Get all trading agents
 */
function getAllAgents() {
  const stmt = db.prepare(`
    SELECT
      ta.*,
      (SELECT COUNT(*) FROM agent_portfolios ap WHERE ap.agent_id = ta.id AND ap.is_active = 1) as portfolio_count,
      (SELECT COUNT(*) FROM agent_signals asig WHERE asig.agent_id = ta.id AND asig.status = 'pending') as pending_signals
    FROM trading_agents ta
    WHERE ta.is_active = 1
    ORDER BY ta.updated_at DESC
  `);
  return stmt.all();
}

/**
 * Get single agent by ID with stats
 */
function getAgent(id) {
  const agent = db.prepare(`
    SELECT * FROM trading_agents WHERE id = ?
  `).get(id);

  if (!agent) return null;

  // Get managed portfolios
  const portfolios = db.prepare(`
    SELECT
      ap.*,
      p.name as portfolio_name,
      p.current_value,
      p.initial_cash,
      p.portfolio_type
    FROM agent_portfolios ap
    JOIN portfolios p ON ap.portfolio_id = p.id
    WHERE ap.agent_id = ? AND ap.is_active = 1
    ORDER BY ap.created_at DESC
  `).all(id);

  // Get pending signals count
  const pendingSignals = db.prepare(`
    SELECT COUNT(*) as count FROM agent_signals
    WHERE agent_id = ? AND status = 'pending'
  `).get(id);

  // Get recent activity
  const recentActivity = db.prepare(`
    SELECT * FROM agent_activity_log
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(id);

  // Get signal stats
  const signalStats = db.prepare(`
    SELECT
      COUNT(*) as total_signals,
      SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed_count,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      AVG(CASE WHEN status = 'executed' AND actual_return IS NOT NULL THEN actual_return END) as avg_return,
      SUM(CASE WHEN status = 'executed' AND actual_return > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN status = 'executed' AND actual_return IS NOT NULL THEN 1 ELSE 0 END) as total_tracked_trades
    FROM agent_signals
    WHERE agent_id = ?
  `).get(id);

  return {
    ...agent,
    portfolios,
    pendingSignalsCount: pendingSignals?.count || 0,
    recentActivity,
    signalStats
  };
}

/**
 * Create a new trading agent
 */
function createAgent(config) {
  const {
    name,
    description = '',
    strategy_type = 'hybrid',
    // Signal weights (optional - use preset or custom)
    technical_weight,
    sentiment_weight,
    insider_weight,
    fundamental_weight,
    alternative_weight,
    valuation_weight,
    thirteenf_weight,
    earnings_weight,
    value_quality_weight,
    // Thresholds
    min_confidence = 0.6,
    min_signal_score = 0.3,
    // Risk parameters
    max_position_size = 0.10,
    max_sector_exposure = 0.30,
    min_cash_reserve = 0.05,
    max_drawdown = 0.20,
    max_correlation = 0.70,
    max_daily_trades = 10,
    // Regime behavior
    regime_scaling_enabled = 1,
    vix_scaling_enabled = 1,
    vix_threshold = 25,
    pause_in_crisis = 1,
    // Execution settings
    auto_execute = 0,
    execution_threshold = 0.8,
    require_confirmation = 1,
    allowed_actions = '["buy","sell"]',
    // Feature flags
    use_optimized_weights = 1,
    use_hmm_regime = 1,
    use_ml_combiner = 0,
    use_factor_exposure = 1,
    use_probabilistic_dcf = 1,
    apply_earnings_filter = 1,
    earnings_blackout_days = 7,
    // Universe
    universe_type = 'all',
    universe_filter = null,
    // Region for sentiment sources
    region = 'US',
    // Unified strategy reference (new system)
    unified_strategy_id = null
  } = config;

  // Apply preset weights if strategy is not custom
  let weights = {
    technical_weight,
    sentiment_weight,
    insider_weight,
    fundamental_weight,
    alternative_weight,
    valuation_weight,
    thirteenf_weight,
    earnings_weight,
    value_quality_weight
  };

  if (strategy_type !== 'custom' && STRATEGY_PRESETS[strategy_type]) {
    const preset = STRATEGY_PRESETS[strategy_type].weights;
    weights = {
      technical_weight: technical_weight ?? preset.technical,
      sentiment_weight: sentiment_weight ?? preset.sentiment,
      insider_weight: insider_weight ?? preset.insider,
      fundamental_weight: fundamental_weight ?? preset.fundamental,
      alternative_weight: alternative_weight ?? preset.alternative,
      valuation_weight: valuation_weight ?? preset.valuation,
      thirteenf_weight: thirteenf_weight ?? preset.thirteenf,
      earnings_weight: earnings_weight ?? preset.earnings,
      value_quality_weight: value_quality_weight ?? preset.valueQuality
    };
  }

  const stmt = db.prepare(`
    INSERT INTO trading_agents (
      name, description, strategy_type,
      technical_weight, sentiment_weight, insider_weight, fundamental_weight,
      alternative_weight, valuation_weight, thirteenf_weight, earnings_weight, value_quality_weight,
      min_confidence, min_signal_score,
      max_position_size, max_sector_exposure, min_cash_reserve, max_drawdown, max_correlation, max_daily_trades,
      regime_scaling_enabled, vix_scaling_enabled, vix_threshold, pause_in_crisis,
      auto_execute, execution_threshold, require_confirmation, allowed_actions,
      use_optimized_weights, use_hmm_regime, use_ml_combiner, use_factor_exposure, use_probabilistic_dcf,
      apply_earnings_filter, earnings_blackout_days,
      universe_type, universe_filter, region, unified_strategy_id
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `);

  const result = stmt.run(
    name, description, strategy_type,
    weights.technical_weight, weights.sentiment_weight, weights.insider_weight, weights.fundamental_weight,
    weights.alternative_weight, weights.valuation_weight, weights.thirteenf_weight, weights.earnings_weight, weights.value_quality_weight,
    min_confidence, min_signal_score,
    max_position_size, max_sector_exposure, min_cash_reserve, max_drawdown, max_correlation, max_daily_trades,
    regime_scaling_enabled, vix_scaling_enabled, vix_threshold, pause_in_crisis,
    auto_execute, execution_threshold, require_confirmation, allowed_actions,
    use_optimized_weights, use_hmm_regime, use_ml_combiner, use_factor_exposure, use_probabilistic_dcf,
    apply_earnings_filter, earnings_blackout_days,
    universe_type, universe_filter, region, unified_strategy_id
  );

  // Log activity
  logActivity(result.lastInsertRowid, null, 'agent_started', `Agent "${name}" created`);

  return getAgent(result.lastInsertRowid);
}

/**
 * Update an existing agent
 */
function updateAgent(id, updates) {
  const allowedFields = [
    'name', 'description', 'strategy_type',
    'technical_weight', 'sentiment_weight', 'insider_weight', 'fundamental_weight',
    'alternative_weight', 'valuation_weight', 'thirteenf_weight', 'earnings_weight', 'value_quality_weight',
    'min_confidence', 'min_signal_score',
    'max_position_size', 'max_sector_exposure', 'min_cash_reserve', 'max_drawdown', 'max_correlation', 'max_daily_trades',
    'regime_scaling_enabled', 'vix_scaling_enabled', 'vix_threshold', 'pause_in_crisis',
    'auto_execute', 'execution_threshold', 'require_confirmation', 'allowed_actions',
    'use_optimized_weights', 'use_hmm_regime', 'use_ml_combiner', 'use_factor_exposure', 'use_probabilistic_dcf',
    'apply_earnings_filter', 'earnings_blackout_days',
    'universe_type', 'universe_filter', 'region', 'unified_strategy_id'
  ];

  const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
  if (fieldsToUpdate.length === 0) {
    return getAgent(id);
  }

  const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
  const values = fieldsToUpdate.map(field => updates[field]);

  const stmt = db.prepare(`
    UPDATE trading_agents
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(...values, id);

  logActivity(id, null, 'settings_updated', `Agent settings updated: ${fieldsToUpdate.join(', ')}`);

  return getAgent(id);
}

/**
 * Delete (soft delete) an agent
 */
function deleteAgent(id) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET is_active = 0, status = 'paused', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(id);

  // Deactivate all agent portfolios
  db.prepare(`
    UPDATE agent_portfolios
    SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ?
  `).run(id);

  return { success: true };
}

// ============================================
// Agent Lifecycle Operations
// ============================================

/**
 * Start an agent (set to running)
 */
function startAgent(id) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET status = 'running', updated_at = CURRENT_TIMESTAMP, error_message = NULL
    WHERE id = ? AND is_active = 1
  `);
  stmt.run(id);

  logActivity(id, null, 'agent_resumed', 'Agent started');

  return getAgentStatus(id);
}

/**
 * Pause an agent
 */
function pauseAgent(id) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET status = 'paused', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(id);

  logActivity(id, null, 'agent_paused', 'Agent paused');

  return getAgentStatus(id);
}

/**
 * Get agent status
 */
function getAgentStatus(id) {
  const agent = db.prepare(`
    SELECT
      id, name, status, is_active,
      last_scan_at, next_scan_at, error_message,
      total_signals_generated, total_trades_executed, win_rate
    FROM trading_agents
    WHERE id = ?
  `).get(id);

  if (!agent) return null;

  // Get pending signals count
  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM agent_signals
    WHERE agent_id = ? AND status = 'pending'
  `).get(id);

  // Get today's activity count
  const todayActivity = db.prepare(`
    SELECT COUNT(*) as count FROM agent_activity_log
    WHERE agent_id = ? AND DATE(created_at) = DATE('now')
  `).get(id);

  return {
    ...agent,
    pendingSignals: pending?.count || 0,
    todayActivityCount: todayActivity?.count || 0
  };
}

/**
 * Update last scan time
 */
function updateLastScan(id, nextScanAt = null) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET last_scan_at = CURRENT_TIMESTAMP,
        next_scan_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(nextScanAt, id);
}

/**
 * Set agent error state
 */
function setAgentError(id, errorMessage) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(errorMessage, id);

  logActivity(id, null, 'agent_error', errorMessage);
}

// ============================================
// Signal Operations
// ============================================

/**
 * Create a new signal for an agent
 */
function createSignal(agentId, signalData) {
  const {
    symbol,
    company_id,
    action,
    overall_score,
    confidence,
    raw_score = null,
    signals = null,
    regime = null,
    regime_confidence = null,
    price_at_signal = null,
    market_cap_at_signal = null,
    sector = null,
    position_size_pct = null,
    position_value = null,
    suggested_shares = null,
    risk_approved = null,
    risk_checks = null,
    risk_warnings = null,
    risk_blockers = null,
    reasoning = null,
    expires_at = null
  } = signalData;

  const stmt = db.prepare(`
    INSERT INTO agent_signals (
      agent_id, symbol, company_id, signal_date, action,
      overall_score, confidence, raw_score, signals,
      regime, regime_confidence, price_at_signal, market_cap_at_signal, sector,
      position_size_pct, position_value, suggested_shares,
      risk_approved, risk_checks, risk_warnings, risk_blockers,
      reasoning, expires_at
    ) VALUES (
      ?, ?, ?, CURRENT_TIMESTAMP, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  const result = stmt.run(
    agentId, symbol, company_id, action,
    overall_score, confidence, raw_score, typeof signals === 'object' ? JSON.stringify(signals) : signals,
    regime, regime_confidence, price_at_signal, market_cap_at_signal, sector,
    position_size_pct, position_value, suggested_shares,
    risk_approved, typeof risk_checks === 'object' ? JSON.stringify(risk_checks) : risk_checks,
    typeof risk_warnings === 'object' ? JSON.stringify(risk_warnings) : risk_warnings,
    typeof risk_blockers === 'object' ? JSON.stringify(risk_blockers) : risk_blockers,
    typeof reasoning === 'object' ? JSON.stringify(reasoning) : reasoning, expires_at
  );

  // Update agent stats
  db.prepare(`
    UPDATE trading_agents
    SET total_signals_generated = total_signals_generated + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(agentId);

  // Log activity
  logActivity(agentId, null, 'signal_generated', `Signal generated: ${action.toUpperCase()} ${symbol} (${(confidence * 100).toFixed(0)}% confidence)`, null, result.lastInsertRowid);

  return getSignal(result.lastInsertRowid);
}

/**
 * Get a single signal by ID
 */
function getSignal(signalId) {
  const signal = db.prepare(`
    SELECT
      asig.*,
      c.name as company_name,
      c.sector as company_sector,
      ta.name as agent_name
    FROM agent_signals asig
    LEFT JOIN companies c ON asig.company_id = c.id
    LEFT JOIN trading_agents ta ON asig.agent_id = ta.id
    WHERE asig.id = ?
  `).get(signalId);

  if (!signal) return null;

  // Parse JSON fields
  if (signal.signals) {
    try {
      signal.signals = JSON.parse(signal.signals);
    } catch (e) {}
  }
  if (signal.risk_checks) {
    try {
      signal.risk_checks = JSON.parse(signal.risk_checks);
    } catch (e) {}
  }
  if (signal.reasoning) {
    try {
      signal.reasoning = JSON.parse(signal.reasoning);
    } catch (e) {}
  }

  return signal;
}

/**
 * Get signals for an agent
 */
function getSignals(agentId, options = {}) {
  const {
    status = null,
    limit = 50,
    offset = 0,
    sortBy = 'overall_score',  // Default: sort by signal strength (best opportunities first)
    sortOrder = 'DESC'
  } = options;

  let whereClause = 'WHERE asig.agent_id = ?';
  const params = [agentId];

  if (status) {
    whereClause += ' AND asig.status = ?';
    params.push(status);
  }

  const validSortColumns = ['signal_date', 'confidence', 'overall_score', 'symbol'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'overall_score';
  const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  params.push(limit, offset);

  // Sort by primary column, then by confidence as secondary for ties
  const orderClause = sortColumn === 'overall_score'
    ? `ORDER BY ABS(asig.overall_score) ${order}, asig.confidence DESC`
    : `ORDER BY asig.${sortColumn} ${order}`;

  const signals = db.prepare(`
    SELECT
      asig.*,
      c.name as company_name,
      c.sector as company_sector
    FROM agent_signals asig
    LEFT JOIN companies c ON asig.company_id = c.id
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `).all(...params);

  // Parse JSON fields
  return signals.map(signal => {
    if (signal.signals) {
      try {
        signal.signals = JSON.parse(signal.signals);
      } catch (e) {}
    }
    return signal;
  });
}

/**
 * Get pending signals for an agent
 */
function getPendingSignals(agentId) {
  return getSignals(agentId, { status: 'pending', limit: 100 });
}

/**
 * Approve a signal
 */
function approveSignal(signalId, portfolioId = null) {
  const signal = getSignal(signalId);
  if (!signal) return null;

  // Validate signal has required fields
  if (!signal.action || !signal.symbol) {
    throw new Error(`Invalid signal data: missing action or symbol for signal ${signalId}`);
  }

  const stmt = db.prepare(`
    UPDATE agent_signals
    SET status = 'approved', portfolio_id = ?
    WHERE id = ?
  `);
  stmt.run(portfolioId, signalId);

  logActivity(signal.agent_id, portfolioId, 'signal_approved', `Signal approved: ${signal.action.toUpperCase()} ${signal.symbol}`, null, signalId);

  return getSignal(signalId);
}

/**
 * Reject a signal
 */
function rejectSignal(signalId, reason = null) {
  const signal = getSignal(signalId);
  if (!signal) return null;

  const stmt = db.prepare(`
    UPDATE agent_signals
    SET status = 'rejected'
    WHERE id = ?
  `);
  stmt.run(signalId);

  logActivity(signal.agent_id, null, 'signal_rejected', `Signal rejected: ${signal.action.toUpperCase()} ${signal.symbol}${reason ? ` - ${reason}` : ''}`, null, signalId);

  return getSignal(signalId);
}

/**
 * Mark signal as executed
 */
function markSignalExecuted(signalId, executionData) {
  const {
    executed_price,
    executed_shares,
    executed_value,
    portfolio_id
  } = executionData;

  const signal = getSignal(signalId);
  if (!signal) return null;

  const stmt = db.prepare(`
    UPDATE agent_signals
    SET status = 'executed',
        executed_at = CURRENT_TIMESTAMP,
        executed_price = ?,
        executed_shares = ?,
        executed_value = ?,
        portfolio_id = ?
    WHERE id = ?
  `);
  stmt.run(executed_price, executed_shares, executed_value, portfolio_id, signalId);

  // Update agent stats
  db.prepare(`
    UPDATE trading_agents
    SET total_trades_executed = total_trades_executed + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(signal.agent_id);

  logActivity(signal.agent_id, portfolio_id, 'trade_executed', `Trade executed: ${signal.action.toUpperCase()} ${signal.symbol} @ $${executed_price}`, null, signalId);

  return getSignal(signalId);
}

/**
 * Bulk approve signals
 */
function approveAllPendingSignals(agentId, portfolioId = null) {
  const pendingSignals = getPendingSignals(agentId);
  const approved = [];

  for (const signal of pendingSignals) {
    approved.push(approveSignal(signal.id, portfolioId));
  }

  return approved;
}

// ============================================
// Portfolio Management Operations
// ============================================

/**
 * Create a portfolio for an agent
 */
function createPortfolioForAgent(agentId, portfolioConfig) {
  const {
    name,
    initial_capital,
    mode = 'paper'
  } = portfolioConfig;

  // Create the portfolio
  const portfolioResult = db.prepare(`
    INSERT INTO portfolios (name, initial_cash, current_cash, current_value, portfolio_type, agent_id)
    VALUES (?, ?, ?, ?, 'agent_managed', ?)
  `).run(name, initial_capital, initial_capital, initial_capital, agentId);

  const portfolioId = portfolioResult.lastInsertRowid;

  // Link it to the agent
  db.prepare(`
    INSERT INTO agent_portfolios (agent_id, portfolio_id, mode, initial_capital, activated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(agentId, portfolioId, mode, initial_capital);

  // If paper trading mode, create a paper trading account
  if (mode === 'paper') {
    try {
      const { PaperTradingEngine } = require('../trading/paperTrading');
      const paperEngine = new PaperTradingEngine(db);
      const accountName = `portfolio_${portfolioId}`;

      // Check if account already exists
      let account;
      try {
        account = paperEngine.getAccount(accountName);
      } catch (err) {
        // Create new paper trading account
        account = paperEngine.createAccount(accountName, initial_capital);
      }

      // Paper account linked via agent_portfolios table (mode column)

      // Paper account creation is logged as part of portfolio attachment below
    } catch (err) {
      console.error('Error creating paper trading account:', err);
      // Non-fatal - portfolio still created
    }
  }

  logActivity(agentId, portfolioId, 'portfolio_attached', `Portfolio "${name}" created and attached (${mode} mode)`);

  return { portfolio_id: portfolioId, portfolios: getAgentPortfolios(agentId) };
}

/**
 * Attach an existing portfolio to an agent
 */
function attachPortfolio(agentId, portfolioId, mode = 'paper') {
  // Check if already attached
  const existing = db.prepare(`
    SELECT * FROM agent_portfolios WHERE agent_id = ? AND portfolio_id = ?
  `).get(agentId, portfolioId);

  if (existing) {
    // Reactivate if previously deactivated
    db.prepare(`
      UPDATE agent_portfolios
      SET is_active = 1, mode = ?, activated_at = CURRENT_TIMESTAMP, deactivated_at = NULL
      WHERE agent_id = ? AND portfolio_id = ?
    `).run(mode, agentId, portfolioId);
  } else {
    // Create new link
    db.prepare(`
      INSERT INTO agent_portfolios (agent_id, portfolio_id, mode, activated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(agentId, portfolioId, mode);
  }

  // Update portfolio's agent_id
  db.prepare(`
    UPDATE portfolios SET agent_id = ?, portfolio_type = 'agent_managed' WHERE id = ?
  `).run(agentId, portfolioId);

  logActivity(agentId, portfolioId, 'portfolio_attached', `Portfolio attached (${mode} mode)`);

  return getAgentPortfolios(agentId);
}

/**
 * Detach a portfolio from an agent
 */
function detachPortfolio(agentId, portfolioId) {
  db.prepare(`
    UPDATE agent_portfolios
    SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
    WHERE agent_id = ? AND portfolio_id = ?
  `).run(agentId, portfolioId);

  // Remove agent reference from portfolio but keep as manual
  db.prepare(`
    UPDATE portfolios SET agent_id = NULL, portfolio_type = 'manual' WHERE id = ?
  `).run(portfolioId);

  logActivity(agentId, portfolioId, 'portfolio_detached', 'Portfolio detached from agent');

  return { success: true };
}

/**
 * Get all portfolios managed by an agent
 */
function getAgentPortfolios(agentId) {
  return db.prepare(`
    SELECT
      ap.*,
      p.name as portfolio_name,
      p.current_value,
      p.initial_cash as portfolio_initial_capital,
      p.portfolio_type,
      (SELECT COUNT(*) FROM portfolio_transactions t WHERE t.portfolio_id = p.id) as trade_count,
      (p.current_value - p.initial_cash) as total_pnl
    FROM agent_portfolios ap
    JOIN portfolios p ON ap.portfolio_id = p.id
    WHERE ap.agent_id = ? AND ap.is_active = 1
    ORDER BY ap.created_at DESC
  `).all(agentId);
}

// ============================================
// Performance Operations
// ============================================

/**
 * Get agent performance metrics
 */
function getAgentPerformance(agentId) {
  // Get overall stats
  const stats = db.prepare(`
    SELECT
      total_signals_generated,
      total_trades_executed,
      win_rate,
      avg_return,
      total_return,
      sharpe_ratio,
      max_drawdown_actual
    FROM trading_agents
    WHERE id = ?
  `).get(agentId);

  // Get signal performance by type
  const signalPerformance = db.prepare(`
    SELECT
      action,
      COUNT(*) as count,
      AVG(CASE WHEN actual_return IS NOT NULL THEN actual_return END) as avg_return,
      SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN actual_return <= 0 THEN 1 ELSE 0 END) as losses
    FROM agent_signals
    WHERE agent_id = ? AND status = 'executed' AND actual_return IS NOT NULL
    GROUP BY action
  `).all(agentId);

  // Get recent returns (last 30 signals)
  const recentReturns = db.prepare(`
    SELECT
      signal_date,
      symbol,
      action,
      actual_return,
      holding_period_days
    FROM agent_signals
    WHERE agent_id = ? AND status = 'executed' AND actual_return IS NOT NULL
    ORDER BY exit_date DESC
    LIMIT 30
  `).all(agentId);

  return {
    ...stats,
    signalPerformance,
    recentReturns
  };
}

/**
 * Update agent performance stats (called after tracking outcomes)
 */
function updateAgentPerformance(agentId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_tracked,
      SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) as wins,
      AVG(actual_return) as avg_return,
      SUM(actual_return) as total_return
    FROM agent_signals
    WHERE agent_id = ? AND status = 'executed' AND actual_return IS NOT NULL
  `).get(agentId);

  const winRate = stats.total_tracked > 0 ? (stats.wins / stats.total_tracked) : null;

  db.prepare(`
    UPDATE trading_agents
    SET
      win_rate = ?,
      avg_return = ?,
      total_return = ?,
      total_trades_won = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(winRate, stats.avg_return, stats.total_return, stats.wins, agentId);
}

// ============================================
// Activity Log Operations
// ============================================

/**
 * Log an activity
 */
function logActivity(agentId, portfolioId, activityType, description, details = null, signalId = null) {
  db.prepare(`
    INSERT INTO agent_activity_log (agent_id, portfolio_id, activity_type, description, details, signal_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(agentId, portfolioId, activityType, description, details, signalId);
}

/**
 * Get activity log for an agent
 */
function getActivityLog(agentId, limit = 50) {
  return db.prepare(`
    SELECT
      aal.*,
      p.name as portfolio_name
    FROM agent_activity_log aal
    LEFT JOIN portfolios p ON aal.portfolio_id = p.id
    WHERE aal.agent_id = ?
    ORDER BY aal.created_at DESC
    LIMIT ?
  `).all(agentId, limit);
}

// ============================================
// Helper Operations
// ============================================

/**
 * Get agent configuration as object for TradingAgent
 */
function getAgentConfig(agentId) {
  const agent = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(agentId);
  if (!agent) return null;

  return {
    // Signal weights
    technicalWeight: agent.technical_weight ?? DEFAULT_WEIGHTS.technical,
    sentimentWeight: agent.sentiment_weight ?? DEFAULT_WEIGHTS.sentiment,
    insiderWeight: agent.insider_weight ?? DEFAULT_WEIGHTS.insider,
    fundamentalWeight: agent.fundamental_weight ?? DEFAULT_WEIGHTS.fundamental,
    alternativeDataWeight: agent.alternative_weight ?? DEFAULT_WEIGHTS.alternative,
    valuationWeight: agent.valuation_weight ?? DEFAULT_WEIGHTS.valuation,
    thirteenFWeight: agent.thirteenf_weight ?? DEFAULT_WEIGHTS.thirteenf,
    earningsMomentumWeight: agent.earnings_weight ?? DEFAULT_WEIGHTS.earnings,
    valueQualityWeight: agent.value_quality_weight ?? DEFAULT_WEIGHTS.valueQuality,
    // Feature flags
    useOptimizedWeights: !!agent.use_optimized_weights,
    trackRecommendations: true,
    applyEarningsFilter: !!agent.apply_earnings_filter,
    useHMMRegime: !!agent.use_hmm_regime,
    useMLCombiner: !!agent.use_ml_combiner,
    useFactorExposure: !!agent.use_factor_exposure,
    includeConfidenceIntervals: true,
    useProbabilisticDCF: !!agent.use_probabilistic_dcf,
    // Region for sentiment sources (US, EU, UK, or 'all')
    region: agent.region || 'US',
    // Thresholds
    earningsBlackoutDays: agent.earnings_blackout_days || 7,
    minConfidence: agent.min_confidence || 0.6,
    minSignalScore: agent.min_signal_score || 0.3
  };
}

/**
 * Get strategy presets
 */
function getStrategyPresets() {
  return STRATEGY_PRESETS;
}

// ============================================
// Signal Generation Operations
// ============================================

/**
 * Get the universe of symbols to scan for an agent
 */
function getAgentUniverse(agentId) {
  const agent = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(agentId);
  if (!agent) return [];

  const universeType = agent.universe_type || 'all';
  let universeFilter = null;

  if (agent.universe_filter) {
    try {
      universeFilter = JSON.parse(agent.universe_filter);
    } catch (e) {}
  }

  let symbols = [];

  switch (universeType) {
    case 'watchlist':
      // Get symbols from user's watchlist
      symbols = db.prepare(`
        SELECT DISTINCT c.symbol
        FROM watchlist_items wi
        JOIN companies c ON wi.company_id = c.id
        ORDER BY c.symbol
      `).all().map(r => r.symbol);
      break;

    case 'sector':
      // Get symbols from specific sectors
      if (universeFilter?.sectors?.length > 0) {
        const placeholders = universeFilter.sectors.map(() => '?').join(',');
        symbols = db.prepare(`
          SELECT symbol FROM companies
          WHERE sector IN (${placeholders})
          ORDER BY symbol
        `).all(...universeFilter.sectors).map(r => r.symbol);
      }
      break;

    case 'custom':
      // Use explicit symbol list from filter
      if (universeFilter?.symbols?.length > 0) {
        symbols = universeFilter.symbols;
      }
      break;

    case 'all':
    default:
      // Get all active companies (with some filtering for quality)
      symbols = db.prepare(`
        SELECT c.symbol
        FROM companies c
        WHERE c.is_active = 1
        ORDER BY c.symbol
        LIMIT 500
      `).all().map(r => r.symbol);
      break;
  }

  // Apply market cap filter if specified
  if (universeFilter?.min_market_cap) {
    const minCap = universeFilter.min_market_cap;
    symbols = db.prepare(`
      SELECT c.symbol FROM companies c
      WHERE c.symbol IN (${symbols.map(() => '?').join(',')})
        AND c.market_cap >= ?
      ORDER BY c.symbol
    `).all(...symbols, minCap).map(r => r.symbol);
  }

  return symbols;
}

/**
 * Generate signals for an agent by running the TradingAgent on its universe
 */
async function generateSignals(agentId) {
  const agent = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  if (agent.status === 'paused') {
    throw new Error(`Agent ${agentId} is paused`);
  }

  // Update status to running
  db.prepare(`
    UPDATE trading_agents SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(agentId);

  logActivity(agentId, null, 'scan_started', 'Signal generation scan started');

  try {
    // Get agent config for TradingAgent
    const config = getAgentConfig(agentId);

    // Import TradingAgent (lazy to avoid circular deps)
    const { TradingAgent } = require('./tradingAgent');
    const tradingAgent = new TradingAgent(db, config);

    // Get universe of symbols to scan
    const symbols = getAgentUniverse(agentId);

    if (symbols.length === 0) {
      logActivity(agentId, null, 'scan_completed', 'No symbols in universe to scan');
      updateLastScan(agentId);
      return { signalsGenerated: 0, errors: 0, symbols: 0 };
    }

    // Get portfolio context if agent has an active portfolio
    const portfolios = getAgentPortfolios(agentId);
    let portfolioContext = null;
    if (portfolios.length > 0) {
      const primaryPortfolio = portfolios[0];
      portfolioContext = {
        portfolioId: primaryPortfolio.portfolio_id,
        totalValue: primaryPortfolio.current_value || primaryPortfolio.initial_capital,
        cash: primaryPortfolio.current_value || primaryPortfolio.initial_capital, // Simplified
      };
    }

    // Run batch recommendations
    const result = await tradingAgent.batchRecommendations(symbols, portfolioContext, null);

    // Signal tier thresholds for opportunity visibility
    const SIGNAL_TIERS = {
      STRONG: { minConfidence: 0.65, minScore: 0.35 },      // Auto-approve eligible
      MODERATE: { minConfidence: 0.50, minScore: 0.25 },    // Show to user, require approval
      BORDERLINE: { minConfidence: 0.40, minScore: 0.20 }   // Near-miss watchlist
    };

    // Filter recommendations by agent thresholds (relaxed defaults to not miss opportunities)
    const minConfidence = agent.min_confidence || 0.50;  // Relaxed from 0.6
    const minScore = agent.min_signal_score || 0.25;     // Relaxed from 0.3

    let signalsGenerated = 0;
    let errors = result.errors?.length || 0;

    // Classify signal tier based on confidence and score
    const classifyTier = (confidence, score) => {
      const absScore = Math.abs(score);
      if (confidence >= SIGNAL_TIERS.STRONG.minConfidence && absScore >= SIGNAL_TIERS.STRONG.minScore) {
        return 'STRONG';
      } else if (confidence >= SIGNAL_TIERS.MODERATE.minConfidence && absScore >= SIGNAL_TIERS.MODERATE.minScore) {
        return 'MODERATE';
      } else if (confidence >= SIGNAL_TIERS.BORDERLINE.minConfidence && absScore >= SIGNAL_TIERS.BORDERLINE.minScore) {
        return 'BORDERLINE';
      }
      return null; // Below all thresholds
    };

    for (const rec of result.recommendations) {
      // Skip holds
      if (rec.action === 'hold') continue;

      // Classify tier
      const tier = classifyTier(rec.confidence, rec.score);

      // Skip signals below all tier thresholds
      if (!tier) continue;

      // Map action to agent_signals format
      const action = rec.action; // 'strong_buy', 'buy', 'sell', 'strong_sell'

      // Enhance reasoning with tier information
      let reasoning = rec.reasoning;
      if (typeof reasoning === 'object') {
        reasoning = { ...reasoning, tier };
      } else if (typeof reasoning === 'string') {
        try {
          reasoning = { ...JSON.parse(reasoning), tier };
        } catch {
          reasoning = { text: reasoning, tier };
        }
      } else {
        reasoning = { tier };
      }

      // Create signal in database
      createSignal(agentId, {
        symbol: rec.symbol,
        company_id: rec.companyId,
        action: action,
        overall_score: rec.score,
        confidence: rec.confidence,
        raw_score: rec.rawScore,
        signals: rec.signals,
        regime: rec.regime?.regime,
        regime_confidence: rec.regime?.confidence,
        price_at_signal: rec.currentPrice,
        sector: rec.sector,
        position_size_pct: rec.positionSize,
        position_value: rec.suggestedValue,
        suggested_shares: rec.suggestedShares,
        reasoning: reasoning,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      });

      signalsGenerated++;

      // Auto-approve only STRONG tier signals if confidence exceeds threshold
      if (agent.auto_execute && tier === 'STRONG' && rec.confidence >= agent.execution_threshold) {
        // Get the last inserted signal and approve it
        const lastSignal = db.prepare(`
          SELECT id FROM agent_signals WHERE agent_id = ? ORDER BY id DESC LIMIT 1
        `).get(agentId);
        if (lastSignal) {
          approveSignal(lastSignal.id, portfolioContext?.portfolioId);
        }
      }
    }

    // Update scan timestamp
    updateLastScan(agentId);

    // Log completion
    logActivity(agentId, null, 'scan_completed',
      `Scan completed: ${symbols.length} symbols scanned, ${signalsGenerated} signals generated, ${errors} errors`);

    // Set status back to idle (or running if scheduled)
    db.prepare(`
      UPDATE trading_agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(agentId);

    return {
      signalsGenerated,
      errors,
      symbols: symbols.length,
      regime: result.regime
    };

  } catch (error) {
    setAgentError(agentId, error.message);
    throw error;
  }
}

/**
 * Run an immediate scan for an agent
 */
async function runScan(agentId) {
  return generateSignals(agentId);
}

// ============================================
// Execution Operations
// ============================================

/**
 * Get all executions for an agent (pending, approved, and executed)
 * Returns data formatted for the 3-column ExecutionTab
 */
function getExecutions(agentId) {
  // Pending approvals (signals that need user approval)
  const pending = db.prepare(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = ? AND s.status = 'pending'
    ORDER BY s.created_at DESC
    LIMIT 50
  `).all(agentId);

  // Approved (ready to execute)
  const approved = db.prepare(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = ? AND s.status = 'approved'
    ORDER BY s.updated_at DESC
    LIMIT 50
  `).all(agentId);

  // Recently executed (for history)
  const executed = db.prepare(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = ? AND s.status = 'executed'
    ORDER BY s.updated_at DESC
    LIMIT 50
  `).all(agentId);

  return {
    pending,
    approved,
    executed,
    counts: {
      pending: pending.length,
      approved: approved.length,
      executed: executed.length
    }
  };
}

/**
 * Approve an execution (move signal from pending to approved)
 */
function approveExecution(signalId) {
  const signal = db.prepare('SELECT * FROM agent_signals WHERE id = ?').get(signalId);
  if (!signal || signal.status !== 'pending') return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE agent_signals
    SET status = 'approved', updated_at = ?
    WHERE id = ?
  `).run(now, signalId);

  // Log activity
  logActivity(signal.agent_id, 'signal_approved', `Approved ${signal.action.toUpperCase()} ${signal.symbol}`);

  return db.prepare('SELECT * FROM agent_signals WHERE id = ?').get(signalId);
}

/**
 * Reject an execution
 */
function rejectExecution(signalId, reason = null) {
  const signal = db.prepare('SELECT * FROM agent_signals WHERE id = ?').get(signalId);
  if (!signal) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE agent_signals
    SET status = 'rejected', rejection_reason = ?, updated_at = ?
    WHERE id = ?
  `).run(reason, now, signalId);

  // Log activity
  logActivity(signal.agent_id, 'signal_rejected', `Rejected ${signal.action.toUpperCase()} ${signal.symbol}${reason ? ': ' + reason : ''}`);

  return db.prepare('SELECT * FROM agent_signals WHERE id = ?').get(signalId);
}

/**
 * Execute an approved signal
 * This is where the actual trade execution happens
 */
async function executeApproved(signalId) {
  const signal = db.prepare('SELECT * FROM agent_signals WHERE id = ?').get(signalId);
  if (!signal || signal.status !== 'approved') return null;

  // Get agent and portfolio
  const agent = getAgent(signal.agent_id);
  const portfolios = getAgentPortfolios(signal.agent_id);

  if (portfolios.length === 0) {
    throw new Error('No portfolio attached to agent');
  }

  const portfolio = portfolios[0]; // Use first portfolio
  const now = new Date().toISOString();

  try {
    // Check if paper trading or live
    if (portfolio.mode === 'paper') {
      // Paper trading execution
      const { PaperTradingEngine } = require('./paperTradingEngine');
      const paperEngine = new PaperTradingEngine(db);

      const tradeResult = await paperEngine.executeTrade({
        portfolioId: portfolio.portfolio_id,
        symbol: signal.symbol,
        action: signal.action.includes('buy') ? 'buy' : 'sell',
        shares: signal.position_size_shares || 10,
        orderType: 'market',
        agentSignalId: signal.id
      });

      // Update signal status
      db.prepare(`
        UPDATE agent_signals
        SET status = 'executed',
            executed_at = ?,
            executed_price = ?,
            executed_shares = ?,
            updated_at = ?
        WHERE id = ?
      `).run(now, tradeResult.executedPrice, tradeResult.executedShares, now, signalId);

      // Log activity
      logActivity(signal.agent_id, portfolio.portfolio_id, 'trade_executed',
        `Executed ${signal.action.toUpperCase()} ${tradeResult.executedShares} shares of ${signal.symbol} @ $${tradeResult.executedPrice?.toFixed(2)}`, null, signalId);

      return {
        ...signal,
        status: 'executed',
        executed_at: now,
        executed_price: tradeResult.executedPrice,
        executed_shares: tradeResult.executedShares,
        trade: tradeResult
      };
    } else {
      // Live trading - not yet implemented
      throw new Error('Live trading not yet implemented');
    }
  } catch (error) {
    // Log error (using 'trade_failed' which is in the allowed CHECK constraint)
    logActivity(signal.agent_id, portfolio?.portfolio_id || null, 'trade_failed', `Failed to execute ${signal.symbol}: ${error.message}`, null, signalId);
    throw error;
  }
}

/**
 * Approve all pending executions for an agent
 */
function approveAllExecutions(agentId) {
  const pending = db.prepare(`
    SELECT id FROM agent_signals
    WHERE agent_id = ? AND status = 'pending'
  `).all(agentId);

  const approved = [];
  for (const signal of pending) {
    const result = approveExecution(signal.id);
    if (result) approved.push(result);
  }

  return approved;
}

/**
 * Execute all approved trades for an agent
 */
async function executeAllApproved(agentId) {
  const approved = db.prepare(`
    SELECT id FROM agent_signals
    WHERE agent_id = ? AND status = 'approved'
  `).all(agentId);

  const executed = [];
  for (const signal of approved) {
    try {
      const result = await executeApproved(signal.id);
      if (result) executed.push(result);
    } catch (error) {
      console.error(`Failed to execute signal ${signal.id}:`, error.message);
    }
  }

  return executed;
}

/**
 * Update agent settings
 */
function updateAgentSettings(agentId, settings) {
  const agent = db.prepare('SELECT * FROM trading_agents WHERE id = ?').get(agentId);
  if (!agent) return null;

  // Build update query dynamically based on provided settings
  const updates = [];
  const values = [];

  const settableFields = [
    'technical_weight', 'sentiment_weight', 'insider_weight', 'fundamental_weight',
    'alternative_weight', 'valuation_weight', 'thirteenf_weight', 'earnings_weight',
    'value_quality_weight', 'min_confidence', 'min_signal_score', 'max_position_size',
    'max_sector_exposure', 'min_cash_reserve', 'max_drawdown', 'max_correlation',
    'regime_scaling_enabled', 'vix_scaling_enabled', 'vix_threshold', 'pause_in_crisis',
    'auto_execute', 'execution_threshold', 'require_confirmation', 'allowed_actions',
    'use_optimized_weights', 'use_hmm_regime', 'use_ml_combiner', 'use_factor_exposure',
    'use_probabilistic_dcf', 'universe_type', 'universe_filter', 'strategy_type'
  ];

  for (const field of settableFields) {
    if (settings[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(typeof settings[field] === 'object' ? JSON.stringify(settings[field]) : settings[field]);
    }
  }

  if (updates.length === 0) {
    return agent;
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(agentId);

  db.prepare(`
    UPDATE trading_agents
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...values);

  // Log activity
  logActivity(agentId, 'settings_updated', 'Agent settings updated');

  return getAgent(agentId);
}

/**
 * Link an agent to a unified strategy
 * This allows the agent to use the unified strategy engine for signal generation
 */
function linkToUnifiedStrategy(agentId, strategyId) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET unified_strategy_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(strategyId, agentId);

  logActivity(agentId, null, 'settings_updated', `Linked to unified strategy #${strategyId}`);

  return getAgent(agentId);
}

/**
 * Unlink an agent from a unified strategy
 */
function unlinkUnifiedStrategy(agentId) {
  const stmt = db.prepare(`
    UPDATE trading_agents
    SET unified_strategy_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(agentId);

  logActivity(agentId, null, 'settings_updated', 'Unlinked from unified strategy');

  return getAgent(agentId);
}

/**
 * Get agent's linked unified strategy
 */
function getLinkedStrategy(agentId) {
  const agent = db.prepare(`
    SELECT unified_strategy_id FROM trading_agents WHERE id = ?
  `).get(agentId);

  if (!agent || !agent.unified_strategy_id) {
    return null;
  }

  // Get strategy details
  const strategy = db.prepare(`
    SELECT * FROM unified_strategies WHERE id = ?
  `).get(agent.unified_strategy_id);

  if (!strategy) {
    return null;
  }

  return {
    id: strategy.id,
    name: strategy.name,
    strategy_type: strategy.strategy_type,
    signal_weights: JSON.parse(strategy.signal_weights || '{}'),
    risk_params: JSON.parse(strategy.risk_params || '{}'),
    universe_config: JSON.parse(strategy.universe_config || '{}'),
    regime_config: JSON.parse(strategy.regime_config || '{}')
  };
}

/**
 * Get all agents using a specific unified strategy
 */
function getAgentsByStrategy(strategyId) {
  return db.prepare(`
    SELECT * FROM trading_agents
    WHERE unified_strategy_id = ? AND is_active = 1
    ORDER BY name
  `).all(strategyId);
}

/**
 * Get lightweight live status for polling
 */
function getLiveStatus(agentId) {
  const agent = db.prepare(`
    SELECT
      id, status, last_scan_at, next_scan_at,
      (SELECT COUNT(*) FROM agent_signals WHERE agent_id = ? AND status = 'pending') as pending_count,
      (SELECT COUNT(*) FROM agent_signals WHERE agent_id = ? AND status = 'approved') as approved_count
    FROM trading_agents
    WHERE id = ?
  `).get(agentId, agentId, agentId);

  if (!agent) return null;

  return {
    id: agent.id,
    status: agent.status,
    last_scan_at: agent.last_scan_at,
    next_scan_at: agent.next_scan_at,
    pending_count: agent.pending_count,
    approved_count: agent.approved_count
  };
}

module.exports = {
  // CRUD
  getAllAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,

  // Lifecycle
  startAgent,
  pauseAgent,
  getAgentStatus,
  updateLastScan,
  setAgentError,

  // Signals
  createSignal,
  getSignal,
  getSignals,
  getPendingSignals,
  approveSignal,
  rejectSignal,
  markSignalExecuted,
  approveAllPendingSignals,

  // Portfolio management
  createPortfolioForAgent,
  attachPortfolio,
  detachPortfolio,
  getAgentPortfolios,

  // Performance
  getAgentPerformance,
  updateAgentPerformance,

  // Activity
  logActivity,
  getActivityLog,

  // Helpers
  getAgentConfig,
  getStrategyPresets,
  DEFAULT_WEIGHTS,
  STRATEGY_PRESETS,

  // Signal generation
  getAgentUniverse,
  generateSignals,
  runScan,

  // Executions
  getExecutions,
  approveExecution,
  rejectExecution,
  executeApproved,
  approveAllExecutions,
  executeAllApproved,
  updateAgentSettings,
  getLiveStatus,

  // Unified Strategy Integration
  linkToUnifiedStrategy,
  unlinkUnifiedStrategy,
  getLinkedStrategy,
  getAgentsByStrategy
};
