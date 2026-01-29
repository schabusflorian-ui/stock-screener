/**
 * Market Scenarios, Edge Cases, and Test Conditions
 *
 * Defines various market regimes and edge cases for stress testing
 */

const MARKET_SCENARIOS = {
  BULL_MARKET: {
    id: 'bull_market',
    regime: 'BULL',
    vix: 12,
    fearGreed: 75,
    description: 'Strong bull market with low volatility',
    priceMultiplier: 1.02,
    volatility: 0.01,
    duration: 8
  },
  BEAR_MARKET: {
    id: 'bear_market',
    regime: 'BEAR',
    vix: 28,
    fearGreed: 25,
    description: 'Bear market with elevated fear',
    priceMultiplier: 0.98,
    volatility: 0.02,
    duration: 5
  },
  HIGH_VOLATILITY: {
    id: 'high_vol',
    regime: 'HIGH_VOL',
    vix: 35,
    fearGreed: 40,
    description: 'High volatility regime with unpredictable moves',
    priceMultiplier: 1.0,
    volatility: 0.03,
    duration: 3
  },
  CRISIS: {
    id: 'crisis',
    regime: 'CRISIS',
    vix: 45,
    fearGreed: 10,
    description: 'Market crisis - should trigger pause_in_crisis',
    priceMultiplier: 0.95,
    volatility: 0.05,
    duration: 2
  },
  SIDEWAYS: {
    id: 'sideways',
    regime: 'SIDEWAYS',
    vix: 18,
    fearGreed: 50,
    description: 'Range-bound sideways market',
    priceMultiplier: 1.0,
    volatility: 0.005,
    duration: 5
  }
};

const SCENARIO_SEQUENCE = [
  { ...MARKET_SCENARIOS.SIDEWAYS, duration: 5 },
  { ...MARKET_SCENARIOS.BULL_MARKET, duration: 8 },
  { ...MARKET_SCENARIOS.HIGH_VOLATILITY, duration: 3 },
  { ...MARKET_SCENARIOS.BEAR_MARKET, duration: 5 },
  { ...MARKET_SCENARIOS.CRISIS, duration: 2 },
  { ...MARKET_SCENARIOS.SIDEWAYS, duration: 4 },
  { ...MARKET_SCENARIOS.BULL_MARKET, duration: 3 }
];

const EDGE_CASES = {
  // Resource exhaustion scenarios
  NO_CASH: {
    id: 'no_cash',
    description: 'Portfolio has no available cash',
    category: 'resource_exhaustion',
    setup: (portfolio) => ({ ...portfolio, current_cash: 0 }),
    expectError: true,
    expectedErrorType: 'INSUFFICIENT_CASH'
  },
  FULL_POSITION: {
    id: 'full_position',
    description: 'Position size at maximum allowed',
    category: 'resource_exhaustion',
    setup: (agent) => ({ maxPositionReached: true }),
    expectWarning: true
  },
  SECTOR_LIMIT_HIT: {
    id: 'sector_limit',
    description: 'Sector concentration at limit',
    category: 'resource_exhaustion',
    setup: (portfolio) => ({ sectorConcentration: 0.30 }),
    expectWarning: true
  },
  MAX_DAILY_TRADES: {
    id: 'max_daily_trades',
    description: 'Daily trade limit reached',
    category: 'resource_exhaustion',
    setup: (agent) => ({ dailyTradesExhausted: true }),
    expectWarning: true
  },

  // Invalid inputs
  INVALID_SYMBOL: {
    id: 'invalid_symbol',
    description: 'Non-existent stock symbol',
    category: 'invalid_input',
    symbol: 'XYZZY123FAKE',
    expectError: true,
    expectedErrorType: 'SYMBOL_NOT_FOUND'
  },
  NEGATIVE_QUANTITY: {
    id: 'negative_qty',
    description: 'Negative share quantity',
    category: 'invalid_input',
    quantity: -100,
    expectError: true,
    expectedErrorType: 'INVALID_QUANTITY'
  },
  ZERO_PRICE: {
    id: 'zero_price',
    description: 'Zero price execution',
    category: 'invalid_input',
    price: 0,
    expectError: true,
    expectedErrorType: 'INVALID_PRICE'
  },
  EXCESSIVE_QUANTITY: {
    id: 'excessive_qty',
    description: 'Quantity exceeds portfolio value',
    category: 'invalid_input',
    quantity: 999999999,
    expectError: true,
    expectedErrorType: 'INSUFFICIENT_FUNDS'
  },

  // Validation errors for agent creation
  MISSING_NAME: {
    id: 'missing_name',
    description: 'Agent creation with missing name field',
    category: 'validation',
    agentConfig: {
      strategy_type: 'hybrid'
    },
    expectError: true,
    expectedErrorType: 'VALIDATION_ERROR'
  },
  INVALID_STRATEGY_TYPE: {
    id: 'invalid_strategy',
    description: 'Invalid strategy type',
    category: 'validation',
    agentConfig: {
      name: 'Test Agent',
      strategy_type: 'invalid_type_xyz'
    },
    expectError: true,
    expectedErrorType: 'INVALID_STRATEGY'
  },
  WEIGHTS_EXCEED_ONE: {
    id: 'weights_exceed',
    description: 'Signal weights sum exceeds 1.0',
    category: 'validation',
    agentConfig: {
      name: 'Bad Weights Agent',
      strategy_type: 'custom',
      technical_weight: 0.5,
      fundamental_weight: 0.5,
      sentiment_weight: 0.5
    },
    expectWarning: true
  },
  NEGATIVE_THRESHOLD: {
    id: 'negative_threshold',
    description: 'Negative confidence threshold',
    category: 'validation',
    agentConfig: {
      name: 'Bad Threshold Agent',
      strategy_type: 'hybrid',
      min_confidence: -0.5
    },
    expectError: true
  },

  // Concurrent operations
  CONCURRENT_SCANS: {
    id: 'concurrent_scans',
    description: 'Multiple agents scanning simultaneously',
    category: 'concurrency',
    agentCount: 5,
    expectSuccess: true
  },
  RAPID_FIRE_REQUESTS: {
    id: 'rapid_fire',
    description: 'Rapid API requests (rate limiting test)',
    category: 'concurrency',
    requestsPerSecond: 50,
    expectThrottling: true
  },
  PARALLEL_TRADES: {
    id: 'parallel_trades',
    description: 'Multiple trades executed in parallel',
    category: 'concurrency',
    tradeCount: 10,
    expectSuccess: true
  }
};

const UI_VALIDATION_TESTS = [
  // Agent creation validation
  {
    action: 'create_agent',
    description: 'Missing required name field',
    payload: { strategy_type: 'hybrid' },
    expectError: true,
    expectedMessage: 'name is required'
  },
  {
    action: 'create_agent',
    description: 'Empty name string',
    payload: { name: '', strategy_type: 'hybrid' },
    expectError: true,
    expectedMessage: 'name cannot be empty'
  },
  {
    action: 'create_agent',
    description: 'Very long name (500+ chars)',
    payload: { name: 'A'.repeat(500), strategy_type: 'hybrid' },
    expectWarning: true
  },

  // Portfolio creation validation
  {
    action: 'create_portfolio',
    description: 'Negative initial cash',
    payload: { name: 'Test Portfolio', initialCash: -1000 },
    expectError: true,
    expectedMessage: 'Invalid amount'
  },
  {
    action: 'create_portfolio',
    description: 'Zero initial cash',
    payload: { name: 'Test Portfolio', initialCash: 0 },
    expectError: false
  },
  {
    action: 'create_portfolio',
    description: 'Missing portfolio name',
    payload: { initialCash: 10000 },
    expectError: true,
    expectedMessage: 'name is required'
  },

  // Signal handling validation
  {
    action: 'approve_signal',
    description: 'Non-existent signal ID',
    payload: { signalId: 99999999 },
    expectError: true,
    expectedMessage: 'Signal not found'
  },
  {
    action: 'reject_signal',
    description: 'Already executed signal',
    payload: { signalId: 'executed_signal' },
    expectError: true,
    expectedMessage: 'cannot modify executed signal'
  },

  // Trade execution validation
  {
    action: 'execute_trade',
    description: 'Insufficient cash for buy',
    payload: { symbol: 'AAPL', side: 'buy', amount: 999999999 },
    expectError: true,
    expectedMessage: 'Insufficient cash'
  },
  {
    action: 'execute_trade',
    description: 'Sell more shares than owned',
    payload: { symbol: 'AAPL', side: 'sell', shares: 999999 },
    expectError: true,
    expectedMessage: 'Insufficient shares'
  },
  {
    action: 'execute_trade',
    description: 'Invalid stock symbol',
    payload: { symbol: 'INVALID_SYMBOL_123', side: 'buy', shares: 10 },
    expectError: true,
    expectedMessage: 'not found'
  }
];

const STRESS_TEST_CONFIG = {
  // Simulation settings
  defaultSimulationDays: 30,
  snapshotInterval: 1, // days

  // Load test settings
  concurrentAgentLimit: 10,
  maxRequestsPerMinute: 100,

  // Timeout settings
  agentScanTimeout: 60000, // 60 seconds
  tradeExecutionTimeout: 30000, // 30 seconds
  apiRequestTimeout: 10000, // 10 seconds

  // Retry settings
  maxRetries: 3,
  retryDelay: 1000, // 1 second

  // Memory thresholds
  maxMemoryMB: 2048,
  warningMemoryMB: 1024
};

module.exports = {
  MARKET_SCENARIOS,
  SCENARIO_SEQUENCE,
  EDGE_CASES,
  UI_VALIDATION_TESTS,
  STRESS_TEST_CONFIG
};
