/**
 * Input Validation Middleware using Joi
 * Protects against injection attacks and malformed data
 */

const Joi = require('joi');

// Generic validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace with sanitized values
    req[property] = value;
    next();
  };
};

// Common field validators
const fields = {
  id: Joi.number().integer().positive(),
  symbol: Joi.string().uppercase().max(10).pattern(/^[A-Z0-9.-]+$/),
  email: Joi.string().email().max(255),
  password: Joi.string().min(8).max(128),
  name: Joi.string().min(1).max(255).pattern(/^[a-zA-Z0-9\s\-_]+$/),
  description: Joi.string().max(2000).allow('', null),
  amount: Joi.number().positive().max(1000000000),
  percentage: Joi.number().min(0).max(1),
  date: Joi.date().iso(),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc'),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0),
  status: Joi.string().valid('pending', 'approved', 'rejected', 'executed', 'expired', 'cancelled'),
  action: Joi.string().valid('strong_buy', 'buy', 'hold', 'sell', 'strong_sell'),
  strategyType: Joi.string().valid('technical', 'fundamental', 'hybrid', 'ml', 'custom'),
  portfolioMode: Joi.string().valid('paper', 'live')
};

// ========================================
// Agent Schemas
// ========================================

const schemas = {
  // Create/Update Agent
  createAgent: Joi.object({
    name: fields.name.required(),
    description: fields.description,
    strategy_type: fields.strategyType.required(),
    technical_weight: fields.percentage.default(0.2),
    sentiment_weight: fields.percentage.default(0.1),
    insider_weight: fields.percentage.default(0.1),
    fundamental_weight: fields.percentage.default(0.2),
    alternative_weight: fields.percentage.default(0.1),
    valuation_weight: fields.percentage.default(0.1),
    thirteenf_weight: fields.percentage.default(0.1),
    earnings_weight: fields.percentage.default(0.05),
    value_quality_weight: fields.percentage.default(0.05),
    min_confidence: fields.percentage.default(0.5),
    min_signal_score: fields.percentage.default(0.25),
    max_position_size: fields.percentage.default(0.1),
    max_sector_exposure: fields.percentage.default(0.3),
    is_active: Joi.boolean().default(true),
    auto_execute: Joi.boolean().default(false),
    universe_type: Joi.string().valid('all', 'sp500', 'nasdaq100', 'custom').default('all'),
    custom_universe: Joi.array().items(fields.symbol).max(500)
  }),

  updateAgent: Joi.object({
    // Basic info
    name: fields.name,
    description: fields.description,
    strategy_type: fields.strategyType,

    // Strategy weights
    technical_weight: fields.percentage,
    sentiment_weight: fields.percentage,
    insider_weight: fields.percentage,
    fundamental_weight: fields.percentage,
    alternative_weight: fields.percentage,
    valuation_weight: fields.percentage,
    thirteenf_weight: fields.percentage,
    earnings_weight: fields.percentage,
    value_quality_weight: fields.percentage,

    // Signal thresholds
    min_confidence: fields.percentage,
    min_signal_score: fields.percentage,

    // Risk parameters
    max_position_size: fields.percentage,
    max_sector_exposure: fields.percentage,
    min_cash_reserve: fields.percentage,
    max_drawdown: fields.percentage,
    max_correlation: fields.percentage,

    // Regime behavior
    regime_scaling_enabled: Joi.boolean(),
    vix_scaling_enabled: Joi.boolean(),
    vix_threshold: Joi.number().min(0).max(100),
    pause_in_crisis: Joi.boolean(),

    // Execution settings
    is_active: Joi.boolean(),
    auto_execute: Joi.boolean(),
    execution_threshold: fields.percentage,
    require_confirmation: Joi.boolean(),
    allowed_actions: Joi.alternatives().try(
      Joi.array().items(Joi.string().valid('buy', 'sell', 'hold')),
      Joi.string() // Allow JSON string for backwards compatibility
    ),

    // Feature flags
    use_optimized_weights: Joi.boolean(),
    use_hmm_regime: Joi.boolean(),
    use_ml_combiner: Joi.boolean(),
    use_factor_exposure: Joi.boolean(),
    use_probabilistic_dcf: Joi.boolean(),

    // Universe configuration
    universe_type: Joi.string().valid('all', 'sp500', 'nasdaq100', 'custom'),
    universe_filter: Joi.any().allow(null)
  }),

  // Signal Actions
  approveSignal: Joi.object({
    portfolioId: fields.id
  }),

  rejectSignal: Joi.object({
    reason: Joi.string().max(500).allow('', null)
  }),

  // Agent Query Params
  agentSignalsQuery: Joi.object({
    status: fields.status,
    limit: fields.limit,
    offset: fields.offset,
    sortBy: Joi.string().valid('signal_date', 'overall_score', 'confidence', 'symbol').default('overall_score'),
    sortOrder: fields.sortOrder.default('DESC')
  }),

  // ========================================
  // Portfolio Schemas
  // ========================================

  createPortfolio: Joi.object({
    name: fields.name.required(),
    description: fields.description,
    initial_cash: fields.amount.default(100000),
    currency: Joi.string().length(3).uppercase().default('USD'),
    benchmark_index_id: fields.id.allow(null)
  }),

  updatePortfolio: Joi.object({
    name: fields.name,
    description: fields.description,
    auto_execute: Joi.boolean(),
    execution_threshold: fields.percentage,
    max_auto_position_pct: fields.percentage,
    require_confirmation: Joi.boolean()
  }),

  // ========================================
  // Execution Schemas
  // ========================================

  executionSettings: Joi.object({
    autoExecute: Joi.boolean(),
    executionThreshold: fields.percentage,
    maxAutoPositionPct: fields.percentage,
    requireConfirmation: Joi.boolean(),
    autoExecuteActions: Joi.array().items(Joi.string().valid('buy', 'sell', 'strong_buy', 'strong_sell'))
  }),

  submitOrder: Joi.object({
    symbol: fields.symbol.required(),
    side: Joi.string().valid('BUY', 'SELL').required(),
    orderType: Joi.string().valid('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT').default('MARKET'),
    quantity: Joi.number().integer().positive().max(1000000).required(),
    limitPrice: fields.amount.when('orderType', {
      is: Joi.string().valid('LIMIT', 'STOP_LIMIT'),
      then: Joi.required()
    }),
    stopPrice: fields.amount.when('orderType', {
      is: Joi.string().valid('STOP', 'STOP_LIMIT'),
      then: Joi.required()
    }),
    notes: Joi.string().max(500).allow('', null)
  }),

  // ========================================
  // Backtest Schemas
  // ========================================

  runBacktest: Joi.object({
    startDate: fields.date.required(),
    endDate: fields.date.required(),
    initialCapital: fields.amount.default(100000),
    maxPositionSize: fields.percentage.default(0.1),
    stopLoss: fields.percentage.allow(null),
    takeProfit: fields.percentage.allow(null),
    commissionPct: fields.percentage.default(0.001),
    slippagePct: fields.percentage.default(0.001)
  }),

  // ========================================
  // Search/Filter Schemas
  // ========================================

  screeningQuery: Joi.object({
    sectors: Joi.array().items(Joi.string().max(100)),
    minMarketCap: fields.amount,
    maxMarketCap: fields.amount,
    minPrice: fields.amount,
    maxPrice: fields.amount,
    minVolume: Joi.number().integer().min(0),
    signals: Joi.array().items(fields.action),
    limit: fields.limit,
    offset: fields.offset
  }),

  // ========================================
  // ID Parameter Validation
  // ========================================

  idParam: Joi.object({
    id: fields.id.required()
  }),

  agentIdParam: Joi.object({
    id: fields.id.required(),
    signalId: fields.id
  })
};

// Export middleware helpers
module.exports = {
  validate,
  schemas,
  fields,

  // Shorthand validators
  validateBody: (schemaName) => validate(schemas[schemaName], 'body'),
  validateQuery: (schemaName) => validate(schemas[schemaName], 'query'),
  validateParams: (schemaName) => validate(schemas[schemaName], 'params')
};
