// src/services/agent/agentService.js
// Service for managing Trading Agents as first-class entities
// Pattern follows investorService.js for consistency

const { getDatabaseAsync } = require('../../database');
const { agent: logger } = require('../../utils/logger');

/**
 * Default Signal Weights - Multi-Factor Model Configuration
 *
 * These weights combine multiple signal sources to generate trading recommendations.
 * The weights are calibrated based on backtesting and academic research:
 *
 * Weight Rationale:
 * - technical (11%): Price momentum and trend signals. Limited weight due to high noise
 *   and potential overfitting. Based on Jegadeesh & Titman momentum research.
 *
 * - sentiment (11%): Social media and news sentiment. Lower weight due to high noise
 *   and potential manipulation. Useful as contrarian indicator at extremes.
 *
 * - insider (11%): Corporate insider buying/selling. Strong predictive signal when
 *   clustered, but infrequent. Research shows 5-10% alpha for insider buys.
 *
 * - fundamental (13%): Earnings quality, growth, profitability metrics. Higher weight
 *   as these are the most reliable long-term predictors of stock returns.
 *
 * - alternative (11%): Alternative data (short interest, options flow, etc.).
 *   Useful for timing but can be gamed. Moderate weight.
 *
 * - valuation (11%): DCF, comparables, intrinsic value estimates. Important for
 *   avoiding overpaying, but markets can stay irrational. Based on Fama-French value factor.
 *
 * - thirteenf (12%): Super-investor 13F holdings (Buffett, Burry, etc.). Higher weight
 *   as these represent high-conviction positions from proven investors.
 *
 * - earnings (10%): Post-earnings announcement drift and earnings surprise. Well-documented
 *   anomaly but fades over time. Lower weight due to timing sensitivity.
 *
 * - valueQuality (10%): Piotroski F-Score and Altman Z-Score. Quality screens that
 *   identify financially healthy companies and avoid value traps.
 *
 * Total: 100% (weights sum to 1.0)
 *
 * Note: Weights are adaptive based on market regime (see _getRegimeAdaptiveWeights).
 * In crisis/high-vol periods, fundamental and quality weights increase while
 * technical and sentiment weights decrease.
 */
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

/**
 * Fields stored as INTEGER (0/1) in trading_agents; frontend sends booleans.
 * Coerce to 0/1 so PostgreSQL accepts the value.
 */
const INTEGER_BOOLEAN_FIELDS = [
  'regime_scaling_enabled', 'vix_scaling_enabled', 'pause_in_crisis',
  'auto_execute', 'require_confirmation',
  'use_optimized_weights', 'use_hmm_regime', 'use_ml_combiner',
  'use_factor_exposure', 'use_probabilistic_dcf', 'apply_earnings_filter'
];

function toIntegerIfBoolean(field, value) {
  if (!INTEGER_BOOLEAN_FIELDS.includes(field)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/**
 * Safely parse JSON with logging on failure
 * @param {string} jsonString - The string to parse
 * @param {string} context - Context for error logging
 * @returns {any} Parsed value or null on failure
 */
function safeJsonParse(jsonString, context = 'unknown') {
  if (!jsonString || typeof jsonString !== 'string') {
    return jsonString;
  }
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    logger.debug(`Failed to parse JSON in ${context}`, {
      error: e.message,
      preview: jsonString.substring(0, 100),
    });
    return null;
  }
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
async function getAllAgents() {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT
      ta.*,
      (SELECT COUNT(*) FROM agent_portfolios ap WHERE ap.agent_id = ta.id AND ap.is_active = true) as portfolio_count,
      (SELECT COUNT(*) FROM agent_signals asig WHERE asig.agent_id = ta.id AND asig.status = 'pending') as pending_signals
    FROM trading_agents ta
    WHERE ta.is_active = true
    ORDER BY ta.updated_at DESC
  `);
  return result.rows;
}

/**
 * Get single agent by ID with stats
 */
async function getAgent(id) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query(`
    SELECT * FROM trading_agents WHERE id = $1
  `, [id]);

  const agent = agentResult.rows[0];
  if (!agent) return null;

  // Get managed portfolios
  const portfoliosResult = await database.query(`
    SELECT
      ap.*,
      p.name as portfolio_name,
      p.current_value,
      p.initial_cash,
      p.portfolio_type
    FROM agent_portfolios ap
    JOIN portfolios p ON ap.portfolio_id = p.id
    WHERE ap.agent_id = $1 AND ap.is_active = true
    ORDER BY ap.created_at DESC
  `, [id]);

  // Get pending signals count
  const pendingSignalsResult = await database.query(`
    SELECT COUNT(*) as count FROM agent_signals
    WHERE agent_id = $1 AND status = 'pending'
  `, [id]);

  // Get recent activity
  const recentActivityResult = await database.query(`
    SELECT * FROM agent_activity_log
    WHERE agent_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [id]);

  // Get signal stats
  const signalStatsResult = await database.query(`
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
    WHERE agent_id = $1
  `, [id]);

  return {
    ...agent,
    portfolios: portfoliosResult.rows,
    pendingSignalsCount: pendingSignalsResult.rows[0]?.count || 0,
    recentActivity: recentActivityResult.rows,
    signalStats: signalStatsResult.rows[0]
  };
}

/**
 * Create a new trading agent
 */
async function createAgent(config) {
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
    regime_scaling_enabled = true,
    vix_scaling_enabled = true,
    vix_threshold = 25,
    pause_in_crisis = true,
    // Execution settings
    auto_execute = false,
    execution_threshold = 0.8,
    require_confirmation = true,
    allowed_actions = '["buy","sell"]',
    // Feature flags
    use_optimized_weights = true,
    use_hmm_regime = true,
    use_ml_combiner = false,
    use_factor_exposure = true,
    use_probabilistic_dcf = true,
    apply_earnings_filter = true,
    earnings_blackout_days = 7,
    // Universe
    universe_type = 'all',
    universe_filter = null,
    // Region for sentiment sources
    region = 'US',
    // Unified strategy reference (new system)
    unified_strategy_id = null
  } = config;

  // Input validation
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Agent name is required and must be a non-empty string');
  }

  if (min_confidence !== undefined && min_confidence < 0) {
    throw new Error('min_confidence must be non-negative');
  }

  if (execution_threshold !== undefined && execution_threshold < 0) {
    throw new Error('execution_threshold must be non-negative');
  }

  if (min_signal_score !== undefined && min_signal_score < 0) {
    throw new Error('min_signal_score must be non-negative');
  }

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

  const database = await getDatabaseAsync();
  const result = await database.query(`
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
      $1, $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14,
      $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24,
      $25, $26, $27, $28,
      $29, $30, $31, $32, $33,
      $34, $35,
      $36, $37, $38, $39
    )
    RETURNING id
  `, [
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
  ]);

  const agentId = result.rows[0].id;

  // Log activity
  await logActivity(agentId, null, 'agent_started', `Agent "${name}" created`);

  return await getAgent(agentId);
}

/**
 * Update an existing agent
 */
async function updateAgent(id, updates) {
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
    return await getAgent(id);
  }

  const setClause = fieldsToUpdate.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
  const values = fieldsToUpdate.map(field => {
    let value = updates[field];
    // Coerce booleans to 0/1 for INTEGER columns
    value = toIntegerIfBoolean(field, value);
    // Convert arrays to JSON strings for PostgreSQL storage
    if (field === 'allowed_actions' && Array.isArray(value)) {
      return JSON.stringify(value);
    }
    // Convert universe_filter object to JSON string
    if (field === 'universe_filter' && typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
  });

  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${values.length + 1}
  `, [...values, id]);

  await logActivity(id, null, 'settings_updated', `Agent settings updated: ${fieldsToUpdate.join(', ')}`);

  return await getAgent(id);
}

/**
 * Delete (soft delete) an agent
 * Uses transaction to ensure atomic deactivation of agent and portfolios
 */
async function deleteAgent(id) {
  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    await database.query(`
      UPDATE trading_agents
      SET is_active = false, status = 'paused', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id]);

    // Deactivate all agent portfolios
    await database.query(`
      UPDATE agent_portfolios
      SET is_active = false, deactivated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $1
    `, [id]);

    await database.query('COMMIT');
    return { success: true };
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

// ============================================
// Agent Lifecycle Operations
// ============================================

/**
 * Start an agent (set to running)
 */
async function startAgent(id) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET status = 'running', updated_at = CURRENT_TIMESTAMP, error_message = NULL
    WHERE id = $1 AND is_active = true
  `, [id]);

  await logActivity(id, null, 'agent_resumed', 'Agent started');

  return await getAgentStatus(id);
}

/**
 * Pause an agent
 */
async function pauseAgent(id) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET status = 'paused', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [id]);

  await logActivity(id, null, 'agent_paused', 'Agent paused');

  return await getAgentStatus(id);
}

/**
 * Get agent status
 */
async function getAgentStatus(id) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query(`
    SELECT
      id, name, status, is_active,
      last_scan_at, next_scan_at, error_message,
      total_signals_generated, total_trades_executed, win_rate
    FROM trading_agents
    WHERE id = $1
  `, [id]);

  const agent = agentResult.rows[0];
  if (!agent) return null;

  // Get pending signals count
  const pendingResult = await database.query(`
    SELECT COUNT(*) as count FROM agent_signals
    WHERE agent_id = $1 AND status = 'pending'
  `, [id]);

  // Get today's activity count
  const todayActivityResult = await database.query(`
    SELECT COUNT(*) as count FROM agent_activity_log
    WHERE agent_id = $1 AND DATE(created_at) = CURRENT_DATE
  `, [id]);

  return {
    ...agent,
    pendingSignals: pendingResult.rows[0]?.count || 0,
    todayActivityCount: todayActivityResult.rows[0]?.count || 0
  };
}

/**
 * Update last scan time
 */
async function updateLastScan(id, nextScanAt = null) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET last_scan_at = CURRENT_TIMESTAMP,
        next_scan_at = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [nextScanAt, id]);
}

/**
 * Set agent error state
 */
async function setAgentError(id, errorMessage) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET status = 'error', error_message = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [errorMessage, id]);

  await logActivity(id, null, 'agent_error', errorMessage);
}

// ============================================
// Signal Operations
// ============================================

/**
 * Create a new signal for an agent
 * Uses transaction to ensure atomic signal creation + stats update
 */
async function createSignal(agentId, signalData) {
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
    expires_at = null,
    portfolio_id = null  // Added to ensure signals have portfolio context
  } = signalData;

  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    const result = await database.query(`
      INSERT INTO agent_signals (
        agent_id, symbol, company_id, signal_date, action,
        overall_score, confidence, raw_score, signals,
        regime, regime_confidence, price_at_signal, market_cap_at_signal, sector,
        position_size_pct, position_value, suggested_shares,
        risk_approved, risk_checks, risk_warnings, risk_blockers,
        reasoning, expires_at, portfolio_id
      ) VALUES (
        $1, $2, $3, CURRENT_TIMESTAMP, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23
      )
      RETURNING id
    `, [
      agentId, symbol, company_id, action,
      overall_score, confidence, raw_score, typeof signals === 'object' ? JSON.stringify(signals) : signals,
      regime, regime_confidence, price_at_signal, market_cap_at_signal, sector,
      position_size_pct, position_value, suggested_shares,
      risk_approved, typeof risk_checks === 'object' ? JSON.stringify(risk_checks) : risk_checks,
      typeof risk_warnings === 'object' ? JSON.stringify(risk_warnings) : risk_warnings,
      typeof risk_blockers === 'object' ? JSON.stringify(risk_blockers) : risk_blockers,
      typeof reasoning === 'object' ? JSON.stringify(reasoning) : reasoning, expires_at, portfolio_id
    ]);

    const signalId = result.rows[0].id;

    // Update agent stats
    await database.query(`
      UPDATE trading_agents
      SET total_signals_generated = total_signals_generated + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [agentId]);

    // Log activity
    await logActivity(agentId, null, 'signal_generated', `Signal generated: ${action.toUpperCase()} ${symbol} (${(confidence * 100).toFixed(0)}% confidence)`, null, signalId);

    await database.query('COMMIT');
    return await getSignal(signalId);
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

/**
 * Get a single signal by ID
 */
async function getSignal(signalId) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT
      asig.*,
      c.name as company_name,
      c.sector as company_sector,
      ta.name as agent_name
    FROM agent_signals asig
    LEFT JOIN companies c ON asig.company_id = c.id
    LEFT JOIN trading_agents ta ON asig.agent_id = ta.id
    WHERE asig.id = $1
  `, [signalId]);

  const signal = result.rows[0];
  if (!signal) return null;

  // Parse JSON fields safely with logging
  if (signal.signals) {
    const parsed = safeJsonParse(signal.signals, 'signal.signals');
    if (parsed !== null) signal.signals = parsed;
  }
  if (signal.risk_checks) {
    const parsed = safeJsonParse(signal.risk_checks, 'signal.risk_checks');
    if (parsed !== null) signal.risk_checks = parsed;
  }
  if (signal.reasoning) {
    const parsed = safeJsonParse(signal.reasoning, 'signal.reasoning');
    if (parsed !== null) signal.reasoning = parsed;
  }

  return signal;
}

/**
 * Get signals for an agent
 */
async function getSignals(agentId, options = {}) {
  const {
    status = null,
    limit = 50,
    offset = 0,
    sortBy = 'overall_score',  // Default: sort by signal strength (best opportunities first)
    sortOrder = 'DESC'
  } = options;

  let whereClause = 'WHERE asig.agent_id = $1';
  const params = [agentId];

  if (status) {
    whereClause += ' AND asig.status = $2';
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

  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT
      asig.*,
      c.name as company_name,
      c.sector as company_sector
    FROM agent_signals asig
    LEFT JOIN companies c ON asig.company_id = c.id
    ${whereClause}
    ${orderClause}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  // Parse JSON fields safely
  return result.rows.map(signal => {
    if (signal.signals) {
      const parsed = safeJsonParse(signal.signals, 'signals.signals');
      if (parsed !== null) signal.signals = parsed;
    }
    return signal;
  });
}

/**
 * Get pending signals for an agent
 */
async function getPendingSignals(agentId) {
  return await getSignals(agentId, { status: 'pending', limit: 100 });
}

/**
 * Approve a signal
 * Also creates a pending_executions entry for the autoExecutor to process
 */
async function approveSignal(signalId, portfolioId = null) {
  const signal = await getSignal(signalId);
  if (!signal) return null;

  // Validate signal has required fields
  if (!signal.action || !signal.symbol) {
    throw new Error(`Invalid signal data: missing action or symbol for signal ${signalId}`);
  }

  const database = await getDatabaseAsync();

  // P1 FIX: Enforce agent's configured thresholds (Expert Panel Recommendation)
  // Get the agent's threshold configuration
  const agentResult = await database.query('SELECT min_confidence, min_signal_score FROM trading_agents WHERE id = $1', [signal.agent_id]);
  const agent = agentResult.rows[0];
  if (agent) {
    const minConfidence = agent.min_confidence || 0.6;
    const minScore = agent.min_signal_score || 0.3;

    if (signal.confidence < minConfidence) {
      throw new Error(`Signal rejected: confidence ${signal.confidence.toFixed(3)} below agent minimum ${minConfidence}`);
    }
    if (signal.overall_score < minScore) {
      throw new Error(`Signal rejected: score ${signal.overall_score.toFixed(3)} below agent minimum ${minScore}`);
    }
  }

  // If no portfolioId provided, try to get from agent's linked portfolios
  let resolvedPortfolioId = portfolioId;
  if (!resolvedPortfolioId) {
    const portfolios = await getAgentPortfolios(signal.agent_id);
    if (portfolios && portfolios.length > 0) {
      resolvedPortfolioId = portfolios[0].portfolio_id;
    }
  }

  // Update signal status to approved
  await database.query(`
    UPDATE agent_signals
    SET status = 'approved', portfolio_id = $1
    WHERE id = $2
  `, [resolvedPortfolioId, signalId]);

  await logActivity(signal.agent_id, resolvedPortfolioId, 'signal_approved', `Signal approved: ${signal.action.toUpperCase()} ${signal.symbol}`, null, signalId);

  // Create pending_execution entry for autoExecutor to process
  if (resolvedPortfolioId) {
    try {
      // Get portfolio value for position sizing
      const portfolioResult = await database.query(`
        SELECT current_value, current_cash FROM portfolios WHERE id = $1
      `, [resolvedPortfolioId]);

      const portfolio = portfolioResult.rows[0];
      const totalValue = (portfolio?.current_value || 0) + (portfolio?.current_cash || 0);
      const positionPct = totalValue > 0 ? (signal.position_value || 0) / totalValue : 0;

      // Map action to uppercase format
      const actionMap = {
        'strong_buy': 'BUY',
        'buy': 'BUY',
        'sell': 'SELL',
        'strong_sell': 'SELL'
      };
      const normalizedAction = actionMap[signal.action.toLowerCase()] || signal.action.toUpperCase();

      await database.query(`
        INSERT INTO pending_executions (
          portfolio_id,
          symbol,
          company_id,
          action,
          shares,
          estimated_price,
          estimated_value,
          signal_score,
          confidence,
          regime,
          position_pct,
          status,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', CURRENT_TIMESTAMP + INTERVAL '24 hours')
      `, [
        resolvedPortfolioId,
        signal.symbol,
        signal.company_id,
        normalizedAction,
        signal.suggested_shares || null,
        signal.price_at_signal || null,
        signal.position_value || null,
        signal.overall_score || null,
        signal.confidence || null,
        signal.regime || null,
        positionPct
      ]);

      await logActivity(signal.agent_id, resolvedPortfolioId, 'execution_queued',
        `Execution queued: ${normalizedAction} ${signal.symbol}`, null, signalId);
    } catch (err) {
      console.warn(`Could not create pending_execution for signal ${signalId}: ${err.message}`);
      // Don't fail the approval - just log the warning
    }
  }

  return await getSignal(signalId);
}

/**
 * Reject a signal
 */
async function rejectSignal(signalId, reason = null) {
  const signal = await getSignal(signalId);
  if (!signal) return null;

  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE agent_signals
    SET status = 'rejected'
    WHERE id = $1
  `, [signalId]);

  await logActivity(signal.agent_id, null, 'signal_rejected', `Signal rejected: ${signal.action.toUpperCase()} ${signal.symbol}${reason ? ` - ${reason}` : ''}`, null, signalId);

  return await getSignal(signalId);
}

/**
 * Mark signal as executed
 * Uses transaction to ensure atomic signal update + stats update
 */
async function markSignalExecuted(signalId, executionData) {
  const {
    executed_price,
    executed_shares,
    executed_value,
    portfolio_id
  } = executionData;

  const signal = await getSignal(signalId);
  if (!signal) return null;

  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    await database.query(`
      UPDATE agent_signals
      SET status = 'executed',
          executed_at = CURRENT_TIMESTAMP,
          executed_price = $1,
          executed_shares = $2,
          executed_value = $3,
          portfolio_id = $4
      WHERE id = $5
    `, [executed_price, executed_shares, executed_value, portfolio_id, signalId]);

    // Update agent stats
    await database.query(`
      UPDATE trading_agents
      SET total_trades_executed = total_trades_executed + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [signal.agent_id]);

    await logActivity(signal.agent_id, portfolio_id, 'trade_executed', `Trade executed: ${signal.action.toUpperCase()} ${signal.symbol} @ $${executed_price}`, null, signalId);

    await database.query('COMMIT');
    return await getSignal(signalId);
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

/**
 * Bulk approve signals
 */
async function approveAllPendingSignals(agentId, portfolioId = null) {
  const pendingSignals = await getPendingSignals(agentId);
  const approved = [];

  for (const signal of pendingSignals) {
    approved.push(await approveSignal(signal.id, portfolioId));
  }

  return approved;
}

// ============================================
// Portfolio Management Operations
// ============================================

/**
 * Create a portfolio for an agent
 * Uses transaction to ensure atomic portfolio + link creation
 */
async function createPortfolioForAgent(agentId, portfolioConfig) {
  const {
    name,
    initial_capital,
    mode = 'paper'
  } = portfolioConfig;

  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    // Create the portfolio
    // Set total_deposited to initial_capital so return calculations work correctly
    const portfolioResult = await database.query(`
      INSERT INTO portfolios (name, initial_cash, current_cash, current_value, total_deposited, portfolio_type, agent_id)
      VALUES ($1, $2, $3, $4, $5, 'agent_managed', $6)
      RETURNING id
    `, [name, initial_capital, initial_capital, initial_capital, initial_capital, agentId]);

    const portfolioId = portfolioResult.rows[0].id;

    // Link it to the agent
    await database.query(`
      INSERT INTO agent_portfolios (agent_id, portfolio_id, mode, initial_capital, activated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [agentId, portfolioId, mode, initial_capital]);

    await database.query('COMMIT');

    // If paper trading mode, create a paper trading account
    if (mode === 'paper') {
      try {
        const { PaperTradingEngine } = require('../trading/paperTrading');
        const paperEngine = new PaperTradingEngine(database);
        const accountName = `portfolio_${portfolioId}`;

        // Check if account already exists
        let account;
        try {
          account = await paperEngine.getAccount(accountName);
        } catch (err) {
          // Create new paper trading account
          account = await paperEngine.createAccount(accountName, initial_capital);
        }

        // Paper account linked via agent_portfolios table (mode column)

        // Paper account creation is logged as part of portfolio attachment below
      } catch (err) {
        logger.error('Error creating paper trading account', { error: err.message });
        // Non-fatal - portfolio still created
      }
    }

    await logActivity(agentId, portfolioId, 'portfolio_attached', `Portfolio "${name}" created and attached (${mode} mode)`);

    return { portfolio_id: portfolioId, portfolios: await getAgentPortfolios(agentId) };
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

/**
 * Attach an existing portfolio to an agent
 * Uses transaction to ensure atomic link creation + portfolio update
 */
async function attachPortfolio(agentId, portfolioId, mode = 'paper') {
  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    // Check if already attached
    const existingResult = await database.query(`
      SELECT * FROM agent_portfolios WHERE agent_id = $1 AND portfolio_id = $2
    `, [agentId, portfolioId]);

    const existing = existingResult.rows[0];

    if (existing) {
      // Reactivate if previously deactivated
      await database.query(`
        UPDATE agent_portfolios
        SET is_active = true, mode = $1, activated_at = CURRENT_TIMESTAMP, deactivated_at = NULL
        WHERE agent_id = $2 AND portfolio_id = $3
      `, [mode, agentId, portfolioId]);
    } else {
      // Create new link
      await database.query(`
        INSERT INTO agent_portfolios (agent_id, portfolio_id, mode, activated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `, [agentId, portfolioId, mode]);
    }

    // Update portfolio's agent_id
    await database.query(`
      UPDATE portfolios SET agent_id = $1, portfolio_type = 'agent_managed' WHERE id = $2
    `, [agentId, portfolioId]);

    await logActivity(agentId, portfolioId, 'portfolio_attached', `Portfolio attached (${mode} mode)`);

    await database.query('COMMIT');
    return await getAgentPortfolios(agentId);
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

/**
 * Detach a portfolio from an agent
 * Uses transaction to ensure atomic portfolio unlinking
 */
async function detachPortfolio(agentId, portfolioId) {
  const database = await getDatabaseAsync();

  await database.query('BEGIN');
  try {
    await database.query(`
      UPDATE agent_portfolios
      SET is_active = false, deactivated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $1 AND portfolio_id = $2
    `, [agentId, portfolioId]);

    // Remove agent reference from portfolio but keep as manual
    await database.query(`
      UPDATE portfolios SET agent_id = NULL, portfolio_type = 'manual' WHERE id = $1
    `, [portfolioId]);

    await logActivity(agentId, portfolioId, 'portfolio_detached', 'Portfolio detached from agent');

    await database.query('COMMIT');
    return { success: true };
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

/**
 * Get all portfolios managed by an agent
 */
async function getAgentPortfolios(agentId) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
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
    WHERE ap.agent_id = $1 AND ap.is_active = true
    ORDER BY ap.created_at DESC
  `, [agentId]);
  return result.rows;
}

// ============================================
// Performance Operations
// ============================================

/**
 * Get agent performance metrics
 */
async function getAgentPerformance(agentId) {
  const database = await getDatabaseAsync();

  // Get overall stats
  const statsResult = await database.query(`
    SELECT
      total_signals_generated,
      total_trades_executed,
      win_rate,
      avg_return,
      total_return,
      sharpe_ratio,
      max_drawdown_actual
    FROM trading_agents
    WHERE id = $1
  `, [agentId]);

  // Get signal performance by type
  const signalPerformanceResult = await database.query(`
    SELECT
      action,
      COUNT(*) as count,
      AVG(CASE WHEN actual_return IS NOT NULL THEN actual_return END) as avg_return,
      SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN actual_return <= 0 THEN 1 ELSE 0 END) as losses
    FROM agent_signals
    WHERE agent_id = $1 AND status = 'executed' AND actual_return IS NOT NULL
    GROUP BY action
  `, [agentId]);

  // Get recent returns (last 30 signals)
  const recentReturnsResult = await database.query(`
    SELECT
      signal_date,
      symbol,
      action,
      actual_return,
      holding_period_days
    FROM agent_signals
    WHERE agent_id = $1 AND status = 'executed' AND actual_return IS NOT NULL
    ORDER BY exit_date DESC
    LIMIT 30
  `, [agentId]);

  return {
    ...statsResult.rows[0],
    signalPerformance: signalPerformanceResult.rows,
    recentReturns: recentReturnsResult.rows
  };
}

/**
 * Update agent performance stats (called after tracking outcomes)
 */
async function updateAgentPerformance(agentId) {
  const database = await getDatabaseAsync();

  const statsResult = await database.query(`
    SELECT
      COUNT(*) as total_tracked,
      SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) as wins,
      AVG(actual_return) as avg_return,
      SUM(actual_return) as total_return
    FROM agent_signals
    WHERE agent_id = $1 AND status = 'executed' AND actual_return IS NOT NULL
  `, [agentId]);

  const stats = statsResult.rows[0];
  const winRate = stats.total_tracked > 0 ? (stats.wins / stats.total_tracked) : null;

  await database.query(`
    UPDATE trading_agents
    SET
      win_rate = $1,
      avg_return = $2,
      total_return = $3,
      total_trades_won = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
  `, [winRate, stats.avg_return, stats.total_return, stats.wins, agentId]);
}

// ============================================
// Activity Log Operations
// ============================================

/**
 * Log an activity
 */
async function logActivity(agentId, portfolioId, activityType, description, details = null, signalId = null) {
  const database = await getDatabaseAsync();
  await database.query(`
    INSERT INTO agent_activity_log (agent_id, portfolio_id, activity_type, description, details, signal_id)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [agentId, portfolioId, activityType, description, details, signalId]);
}

/**
 * Get activity log for an agent
 */
async function getActivityLog(agentId, limit = 50) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT
      aal.*,
      p.name as portfolio_name
    FROM agent_activity_log aal
    LEFT JOIN portfolios p ON aal.portfolio_id = p.id
    WHERE aal.agent_id = $1
    ORDER BY aal.created_at DESC
    LIMIT $2
  `, [agentId, limit]);
  return result.rows;
}

// ============================================
// Helper Operations
// ============================================

/**
 * Detect current market regime for pause_in_crisis check
 * Returns: 'CRISIS', 'HIGH_VOL', 'BEAR', 'BULL', or 'SIDEWAYS'
 */
async function detectCurrentRegime() {
  try {
    const database = await getDatabaseAsync();
    // Get VIX and fear/greed indicators
    const indicatorsResult = await database.query(`
      SELECT indicator_type, indicator_value
      FROM market_sentiment
      WHERE indicator_type IN ('vix', 'cnn_fear_greed')
      ORDER BY fetched_at DESC
    `);

    const indicators = indicatorsResult.rows;
    let vix = null;
    let fearGreed = null;

    for (const ind of indicators) {
      if (ind.indicator_type === 'vix' && vix === null) {
        vix = ind.indicator_value;
      } else if (ind.indicator_type === 'cnn_fear_greed' && fearGreed === null) {
        fearGreed = ind.indicator_value;
      }
    }

    // Classify regime based on VIX (primary indicator for crisis detection)
    if (vix !== null) {
      if (vix > 35) {
        return 'CRISIS';
      } else if (vix > 25) {
        return 'HIGH_VOL';
      } else if (vix < 15 && fearGreed && fearGreed > 60) {
        return 'BULL';
      } else if (fearGreed && fearGreed < 25) {
        return 'BEAR';
      }
    }

    return 'SIDEWAYS';
  } catch (error) {
    console.warn('Could not detect market regime:', error.message);
    return 'SIDEWAYS'; // Default to sideways if detection fails
  }
}

/**
 * Get agent configuration as object for TradingAgent
 */
async function getAgentConfig(agentId) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query('SELECT * FROM trading_agents WHERE id = $1', [agentId]);
  const agent = agentResult.rows[0];
  if (!agent) return null;

  // Get user's global tax settings
  let taxSettings = null;
  try {
    const taxResult = await database.query('SELECT * FROM user_tax_settings WHERE id = 1');
    taxSettings = taxResult.rows[0];
  } catch (e) {
    // Table may not exist yet
  }

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
    minSignalScore: agent.min_signal_score || 0.3,
    // VIX and regime scaling settings
    vixScalingEnabled: !!agent.vix_scaling_enabled,
    vixThreshold: agent.vix_threshold ?? 25,
    regimeScalingEnabled: !!agent.regime_scaling_enabled,
    // Risk controls
    pauseInCrisis: !!agent.pause_in_crisis,
    maxDrawdown: agent.max_drawdown ?? 0.20,
    maxCorrelation: agent.max_correlation ?? 0.70,
    minCashReserve: agent.min_cash_reserve ?? 0.05,
    maxPositionSize: agent.max_position_size ?? 0.10,
    maxSectorExposure: agent.max_sector_exposure ?? 0.30,
    // Tax-aware trading settings (from user's global settings)
    taxAwareTrading: taxSettings?.show_tax_impact ?? true,
    taxJurisdiction: taxSettings?.tax_country || 'AT'
  };
}

/**
 * Get strategy presets
 */
function getStrategyPresets() {
  return STRATEGY_PRESETS;
}

/**
 * Get beginner strategy presets from database
 */
async function getBeginnerPresets() {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT * FROM strategy_presets_v2
    WHERE name LIKE 'Simple:%'
    ORDER BY sort_order, name
  `);

  return result.rows.map(p => ({
    id: p.id,
    name: p.name.replace('Simple: ', ''),
    fullName: p.name,
    description: p.description,
    category: p.category,
    riskProfile: p.risk_profile,
    holdingPeriod: p.holding_period_type,
    riskParams: p.risk_params ? JSON.parse(p.risk_params) : {},
    strategyType: p.risk_params ? JSON.parse(p.risk_params).beginner_strategy_type : null
  }));
}

/**
 * Create a new beginner strategy agent
 */
async function createBeginnerAgent({ name, description, portfolioId, strategyType, config }) {
  // Build beginner_config JSON
  const beginnerConfig = {
    strategy_type: strategyType,
    ...config,
    next_contribution_date: config.next_contribution_date || calculateNextContributionDate(config)
  };

  const database = await getDatabaseAsync();

  // Insert the agent with beginner category
  const result = await database.query(`
    INSERT INTO trading_agents (
      name,
      description,
      strategy_type,
      agent_category,
      beginner_config,
      min_confidence,
      min_signal_score,
      max_position_size,
      max_sector_exposure,
      auto_execute,
      require_confirmation,
      is_active,
      created_at
    ) VALUES ($1, $2, 'custom', 'beginner', $3, 1.0, 0, 0.25, 0.40, false, true, true, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    name,
    description || '',
    JSON.stringify(beginnerConfig)
  ]);

  const agentId = result.rows[0].id;

  // Attach portfolio if provided
  if (portfolioId) {
    await attachPortfolio(agentId, portfolioId, 'paper');
  }

  // Log activity
  await logActivity(agentId, portfolioId || null, 'agent_created', `Beginner agent "${name}" created with ${strategyType} strategy`);

  return await getAgent(agentId);
}

/**
 * Helper to calculate initial next contribution date
 */
function calculateNextContributionDate(config) {
  const today = new Date();
  const frequency = config.frequency || config.dca_frequency || 'monthly';
  const frequencyDay = config.frequency_day || 1;

  switch (frequency) {
    case 'daily':
      today.setDate(today.getDate() + 1);
      break;
    case 'weekly':
      today.setDate(today.getDate() + (7 - today.getDay()) % 7 + 1);
      break;
    case 'biweekly':
      today.setDate(today.getDate() + 14);
      break;
    case 'monthly':
      today.setMonth(today.getMonth() + 1);
      today.setDate(Math.min(frequencyDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
      break;
    case 'quarterly':
      today.setMonth(today.getMonth() + 3);
      today.setDate(Math.min(frequencyDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
      break;
    default:
      today.setMonth(today.getMonth() + 1);
  }

  return today.toISOString().split('T')[0];
}

// ============================================
// Signal Generation Operations
// ============================================

/**
 * Get the universe of symbols to scan for an agent
 */
async function getAgentUniverse(agentId) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query('SELECT * FROM trading_agents WHERE id = $1', [agentId]);
  const agent = agentResult.rows[0];
  if (!agent) return [];

  const universeType = agent.universe_type || 'all';
  let universeFilter = null;

  if (agent.universe_filter) {
    universeFilter = safeJsonParse(agent.universe_filter, 'agent.universe_filter');
  }

  let symbols = [];

  switch (universeType) {
    case 'watchlist':
      // Get symbols from user's watchlist
      const watchlistResult = await database.query(`
        SELECT DISTINCT c.symbol
        FROM watchlist_items wi
        JOIN companies c ON wi.company_id = c.id
        ORDER BY c.symbol
      `);
      symbols = watchlistResult.rows.map(r => r.symbol);
      break;

    case 'sector':
      // Get symbols from specific sectors
      if (universeFilter?.sectors?.length > 0) {
        const placeholders = universeFilter.sectors.map((_, idx) => `$${idx + 1}`).join(',');
        const sectorResult = await database.query(`
          SELECT symbol FROM companies
          WHERE sector IN (${placeholders})
          ORDER BY symbol
        `, universeFilter.sectors);
        symbols = sectorResult.rows.map(r => r.symbol);
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
      // Get all active companies with actual trading data
      // Filter for valid symbols with price data, ordered by market cap
      const allResult = await database.query(`
        SELECT c.symbol
        FROM companies c
        WHERE c.is_active = true
          AND LENGTH(c.symbol) <= 5
          AND c.symbol NOT LIKE '%=%'
          AND c.symbol NOT LIKE '%.%'
          AND c.symbol !~ '[0-9]{5,}'
          AND EXISTS (
            SELECT 1 FROM daily_prices dp
            WHERE dp.company_id = c.id
            AND dp.date >= CURRENT_DATE - INTERVAL '30 days'
          )
        ORDER BY c.market_cap DESC NULLS LAST
        LIMIT 500
      `);
      symbols = allResult.rows.map(r => r.symbol);
      break;
  }

  // Apply market cap filter if specified
  if (universeFilter?.min_market_cap && symbols.length > 0) {
    const minCap = universeFilter.min_market_cap;
    const placeholders = symbols.map((_, idx) => `$${idx + 1}`).join(',');
    const filteredResult = await database.query(`
      SELECT c.symbol FROM companies c
      WHERE c.symbol IN (${placeholders})
        AND c.market_cap >= $${symbols.length + 1}
      ORDER BY c.symbol
    `, [...symbols, minCap]);
    symbols = filteredResult.rows.map(r => r.symbol);
  }

  return symbols;
}

/**
 * Generate signals for an agent by running the TradingAgent on its universe
 */
async function generateSignals(agentId) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query('SELECT * FROM trading_agents WHERE id = $1', [agentId]);
  const agent = agentResult.rows[0];
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  if (agent.status === 'paused') {
    throw new Error(`Agent ${agentId} is paused`);
  }

  // Check if agent should pause during crisis
  if (agent.pause_in_crisis) {
    const regime = await detectCurrentRegime();
    if (regime === 'CRISIS') {
      console.log(`Agent ${agent.name}: Pausing signal generation during CRISIS regime`);
      await logActivity(agentId, null, 'scan_skipped', 'Signal generation paused: CRISIS regime detected');
      return {
        signalsGenerated: 0,
        errors: 0,
        symbols: 0,
        skipped: true,
        reason: 'pause_in_crisis triggered - CRISIS regime detected'
      };
    }
  }

  // Update status to running
  await database.query(`
    UPDATE trading_agents SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [agentId]);

  await logActivity(agentId, null, 'scan_started', 'Signal generation scan started');

  try {
    // Get agent config for TradingAgent
    const config = await getAgentConfig(agentId);

    // Import TradingAgent (lazy to avoid circular deps)
    const { TradingAgent } = require('./tradingAgent');
    const tradingAgent = new TradingAgent(config);

    // Get universe of symbols to scan
    const symbols = await getAgentUniverse(agentId);

    if (symbols.length === 0) {
      await logActivity(agentId, null, 'scan_completed', 'No symbols in universe to scan');
      await updateLastScan(agentId);
      return { signalsGenerated: 0, errors: 0, symbols: 0 };
    }

    // Get portfolio context if agent has an active portfolio
    const portfolios = await getAgentPortfolios(agentId);
    let portfolioContext = null;

    // Validate agent has at least one linked portfolio - required for signal execution
    if (!portfolios || portfolios.length === 0) {
      console.warn(`Agent ${agent.name} (${agentId}) has no linked portfolio. Skipping signal generation.`);
      await logActivity(agentId, null, 'scan_skipped', 'No linked portfolio - cannot execute signals');
      await updateLastScan(agentId);
      await database.query(`UPDATE trading_agents SET status = 'idle' WHERE id = $1`, [agentId]);
      return {
        signalsGenerated: 0,
        errors: 0,
        symbols: 0,
        skipped: true,
        reason: 'No linked portfolio'
      };
    }

    const primaryPortfolio = portfolios[0];
    portfolioContext = {
      portfolioId: primaryPortfolio.portfolio_id,
      totalValue: primaryPortfolio.current_value || primaryPortfolio.initial_capital,
      cash: primaryPortfolio.current_cash || primaryPortfolio.initial_capital,
    };

    // Run batch recommendations
    const result = await tradingAgent.batchRecommendations(symbols, portfolioContext, null);

    // Signal tier thresholds for opportunity visibility (relaxed for practical use)
    const SIGNAL_TIERS = {
      STRONG: { minConfidence: 0.55, minScore: 0.25 },      // Auto-approve eligible
      MODERATE: { minConfidence: 0.40, minScore: 0.15 },    // Show to user, require approval
      BORDERLINE: { minConfidence: 0.30, minScore: 0.10 }   // Near-miss watchlist
    };

    // Filter recommendations by agent thresholds (relaxed defaults to not miss opportunities)
    const minConfidence = agent.min_confidence || 0.50;  // Relaxed from 0.6
    const minScore = agent.min_signal_score || 0.25;     // Relaxed from 0.3

    let signalsGenerated = 0;
    const errors = result.errors?.length || 0;

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

      // Create signal in database with portfolio context
      await createSignal(agentId, {
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
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        portfolio_id: portfolioContext?.portfolioId  // Ensure signals have portfolio context from creation
      });

      signalsGenerated++;

      // Auto-approve only STRONG tier signals if confidence exceeds threshold
      if (agent.auto_execute && tier === 'STRONG' && rec.confidence >= agent.execution_threshold) {
        // Get the last inserted signal and approve it
        const lastSignalResult = await database.query(`
          SELECT id FROM agent_signals WHERE agent_id = $1 ORDER BY id DESC LIMIT 1
        `, [agentId]);
        const lastSignal = lastSignalResult.rows[0];
        if (lastSignal) {
          await approveSignal(lastSignal.id, portfolioContext?.portfolioId);
        }
      }
    }

    // Update scan timestamp
    await updateLastScan(agentId);

    // Log completion
    await logActivity(agentId, null, 'scan_completed',
      `Scan completed: ${symbols.length} symbols scanned, ${signalsGenerated} signals generated, ${errors} errors`);

    // Set status back to idle (or running if scheduled)
    await database.query(`
      UPDATE trading_agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [agentId]);

    return {
      signalsGenerated,
      errors,
      symbols: symbols.length,
      regime: result.regime
    };

  } catch (error) {
    await setAgentError(agentId, error.message);
    throw error;
  }
}

/**
 * Run an immediate scan for an agent
 */
async function runScan(agentId) {
  return await generateSignals(agentId);
}

// ============================================
// Execution Operations
// ============================================

/**
 * Get all executions for an agent (pending, approved, and executed)
 * Returns data formatted for the 3-column ExecutionTab
 */
async function getExecutions(agentId) {
  const database = await getDatabaseAsync();

  // Pending approvals (signals that need user approval)
  const pendingResult = await database.query(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = $1 AND s.status = 'pending'
    ORDER BY s.created_at DESC
    LIMIT 50
  `, [agentId]);

  // Approved (ready to execute)
  const approvedResult = await database.query(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = $1 AND s.status = 'approved'
    ORDER BY s.created_at DESC
    LIMIT 50
  `, [agentId]);

  // Recently executed (for history)
  const executedResult = await database.query(`
    SELECT
      s.*,
      c.name as company_name,
      c.sector
    FROM agent_signals s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.agent_id = $1 AND s.status = 'executed'
    ORDER BY s.executed_at DESC NULLS LAST, s.created_at DESC
    LIMIT 50
  `, [agentId]);

  const pending = pendingResult.rows;
  const approved = approvedResult.rows;
  const executed = executedResult.rows;

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
async function approveExecution(signalId) {
  const database = await getDatabaseAsync();
  const signalResult = await database.query('SELECT * FROM agent_signals WHERE id = $1', [signalId]);
  const signal = signalResult.rows[0];
  if (!signal || signal.status !== 'pending') return null;

  const now = new Date().toISOString();
  await database.query(`
    UPDATE agent_signals
    SET status = 'approved', updated_at = $1
    WHERE id = $2
  `, [now, signalId]);

  // Log activity
  await logActivity(signal.agent_id, null, 'signal_approved', `Approved ${signal.action.toUpperCase()} ${signal.symbol}`);

  const updatedResult = await database.query('SELECT * FROM agent_signals WHERE id = $1', [signalId]);
  return updatedResult.rows[0];
}

/**
 * Reject an execution
 */
async function rejectExecution(signalId, reason = null) {
  const database = await getDatabaseAsync();
  const signalResult = await database.query('SELECT * FROM agent_signals WHERE id = $1', [signalId]);
  const signal = signalResult.rows[0];
  if (!signal) return null;

  const now = new Date().toISOString();
  await database.query(`
    UPDATE agent_signals
    SET status = 'rejected', rejection_reason = $1, updated_at = $2
    WHERE id = $3
  `, [reason, now, signalId]);

  // Log activity
  await logActivity(signal.agent_id, null, 'signal_rejected', `Rejected ${signal.action.toUpperCase()} ${signal.symbol}${reason ? ': ' + reason : ''}`);

  const updatedResult = await database.query('SELECT * FROM agent_signals WHERE id = $1', [signalId]);
  return updatedResult.rows[0];
}

/**
 * Execute an approved signal
 * This is where the actual trade execution happens
 */
async function executeApproved(signalId) {
  const database = await getDatabaseAsync();
  const signalResult = await database.query('SELECT * FROM agent_signals WHERE id = $1', [signalId]);
  const signal = signalResult.rows[0];
  if (!signal || signal.status !== 'approved') return null;

  // Get agent and portfolio
  const agent = await getAgent(signal.agent_id);
  const portfolios = await getAgentPortfolios(signal.agent_id);

  if (portfolios.length === 0) {
    throw new Error('No portfolio attached to agent');
  }

  const portfolio = portfolios[0]; // Use first portfolio
  const now = new Date().toISOString();

  try {
    // Check if paper trading or live
    if (portfolio.mode === 'paper') {
      const { PaperTradingEngine } = require('../trading/paperTrading');
      const paperEngine = new PaperTradingEngine(database);

      const accountName = `portfolio_${portfolio.portfolio_id}`;
      let account;
      try {
        account = await paperEngine.getAccount(accountName);
      } catch (e) {
        account = await paperEngine.createAccount(accountName, portfolio.initial_capital || 100000);
      }

      const side = signal.action.includes('buy') ? 'BUY' : 'SELL';
      const shares = signal.suggested_shares || Math.floor((portfolio.initial_capital * 0.05) / (signal.price_at_signal || 100));

      const tradeResult = await paperEngine.submitOrder(account.id, {
        symbol: signal.symbol,
        side: side,
        orderType: 'MARKET',
        quantity: shares || 10,
        notes: `Agent signal ${signal.id}: ${signal.action}`
      });

      // Update signal status
      await database.query(`
        UPDATE agent_signals
        SET status = 'executed',
            executed_at = $1,
            executed_price = $2,
            executed_shares = $3
        WHERE id = $4
      `, [now, tradeResult.avgFillPrice || tradeResult.fillPrice, tradeResult.filledQuantity || shares, signalId]);

      // Log activity
      await logActivity(signal.agent_id, portfolio.portfolio_id, 'trade_executed',
        `Executed ${signal.action.toUpperCase()} ${tradeResult.filledQuantity || shares} shares of ${signal.symbol} @ $${(tradeResult.avgFillPrice || tradeResult.fillPrice)?.toFixed(2)}`, null, signalId);

      return {
        ...signal,
        status: 'executed',
        executed_at: now,
        executed_price: tradeResult.avgFillPrice || tradeResult.fillPrice,
        executed_shares: tradeResult.filledQuantity || shares,
        trade: tradeResult
      };
    } else {
      // Live trading - not yet implemented
      throw new Error('Live trading not yet implemented');
    }
  } catch (error) {
    // Log error (using 'trade_failed' which is in the allowed CHECK constraint)
    await logActivity(signal.agent_id, portfolio?.portfolio_id || null, 'trade_failed', `Failed to execute ${signal.symbol}: ${error.message}`, null, signalId);
    throw error;
  }
}

/**
 * Approve all pending executions for an agent
 */
async function approveAllExecutions(agentId) {
  const database = await getDatabaseAsync();
  const pendingResult = await database.query(`
    SELECT id FROM agent_signals
    WHERE agent_id = $1 AND status = 'pending'
  `, [agentId]);

  const approved = [];
  for (const signal of pendingResult.rows) {
    const result = await approveExecution(signal.id);
    if (result) approved.push(result);
  }

  return approved;
}

/**
 * Execute all approved trades for an agent
 */
async function executeAllApproved(agentId) {
  const database = await getDatabaseAsync();
  const approvedResult = await database.query(`
    SELECT id FROM agent_signals
    WHERE agent_id = $1 AND status = 'approved'
  `, [agentId]);

  const executed = [];
  for (const signal of approvedResult.rows) {
    try {
      const result = await executeApproved(signal.id);
      if (result) executed.push(result);
    } catch (error) {
      logger.error('Failed to execute signal', { signalId: signal.id, error: error.message });
    }
  }

  return executed;
}

/**
 * Update agent settings
 */
async function updateAgentSettings(agentId, settings) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query('SELECT * FROM trading_agents WHERE id = $1', [agentId]);
  const agent = agentResult.rows[0];
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

  let paramIndex = 1;
  for (const field of settableFields) {
    if (settings[field] !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      let val = settings[field];
      val = toIntegerIfBoolean(field, val);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }

  if (updates.length === 0) {
    return agent;
  }

  updates.push(`updated_at = $${paramIndex++}`);
  values.push(new Date().toISOString());
  values.push(agentId);

  await database.query(`
    UPDATE trading_agents
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
  `, values);

  // Log activity
  await logActivity(agentId, null, 'settings_updated', 'Agent settings updated');

  return await getAgent(agentId);
}

/**
 * Link an agent to a unified strategy
 * This allows the agent to use the unified strategy engine for signal generation
 */
async function linkToUnifiedStrategy(agentId, strategyId) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET unified_strategy_id = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [strategyId, agentId]);

  await logActivity(agentId, null, 'settings_updated', `Linked to unified strategy #${strategyId}`);

  return await getAgent(agentId);
}

/**
 * Unlink an agent from a unified strategy
 */
async function unlinkUnifiedStrategy(agentId) {
  const database = await getDatabaseAsync();
  await database.query(`
    UPDATE trading_agents
    SET unified_strategy_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [agentId]);

  await logActivity(agentId, null, 'settings_updated', 'Unlinked from unified strategy');

  return await getAgent(agentId);
}

/**
 * Get agent's linked unified strategy
 */
async function getLinkedStrategy(agentId) {
  const database = await getDatabaseAsync();
  const agentResult = await database.query(`
    SELECT unified_strategy_id FROM trading_agents WHERE id = $1
  `, [agentId]);

  const agent = agentResult.rows[0];

  if (!agent || !agent.unified_strategy_id) {
    return null;
  }

  // Get strategy details
  const strategyResult = await database.query(`
    SELECT * FROM unified_strategies WHERE id = $1
  `, [agent.unified_strategy_id]);

  const strategy = strategyResult.rows[0];

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
async function getAgentsByStrategy(strategyId) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT * FROM trading_agents
    WHERE unified_strategy_id = $1 AND is_active = true
    ORDER BY name
  `, [strategyId]);
  return result.rows;
}

/**
 * Get lightweight live status for polling
 */
async function getLiveStatus(agentId) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT
      id, status, last_scan_at, next_scan_at,
      (SELECT COUNT(*) FROM agent_signals WHERE agent_id = $1 AND status = 'pending') as pending_count,
      (SELECT COUNT(*) FROM agent_signals WHERE agent_id = $2 AND status = 'approved') as approved_count
    FROM trading_agents
    WHERE id = $3
  `, [agentId, agentId, agentId]);

  const agent = result.rows[0];
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
  getAgentsByStrategy,

  // Beginner Strategies
  getBeginnerPresets,
  createBeginnerAgent
};
