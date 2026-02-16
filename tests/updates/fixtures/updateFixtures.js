// tests/updates/fixtures/updateFixtures.js
// Test fixtures for update services

/**
 * Sample bundle configurations
 */
const BUNDLES = {
  prices: {
    name: 'prices',
    display_name: 'Price Data',
    description: 'Stock and ETF price updates',
    priority: 10,
    is_enabled: 1,
    is_automatic: 1,
  },
  fundamentals: {
    name: 'fundamentals',
    display_name: 'Fundamentals',
    description: 'Financial statements and metrics',
    priority: 30,
    is_enabled: 1,
    is_automatic: 1,
  },
  sentiment: {
    name: 'sentiment',
    display_name: 'Sentiment',
    description: 'Social and news sentiment',
    priority: 50,
    is_enabled: 1,
    is_automatic: 1,
  },
  sec: {
    name: 'sec',
    display_name: 'SEC Filings',
    description: 'SEC EDGAR imports',
    priority: 35,
    is_enabled: 1,
    is_automatic: 1,
  },
  market: {
    name: 'market',
    display_name: 'Market Data',
    description: 'Indices and sectors',
    priority: 40,
    is_enabled: 1,
    is_automatic: 1,
  },
  etf: {
    name: 'etf',
    display_name: 'ETF Data',
    description: 'ETF holdings and metadata',
    priority: 20,
    is_enabled: 1,
    is_automatic: 1,
  },
  knowledge: {
    name: 'knowledge',
    display_name: 'Knowledge Base',
    description: 'AI knowledge updates',
    priority: 60,
    is_enabled: 1,
    is_automatic: 1,
  },
  ipo: {
    name: 'ipo',
    display_name: 'IPO Tracker',
    description: 'IPO pipeline monitoring',
    priority: 25,
    is_enabled: 1,
    is_automatic: 1,
  },
  maintenance: {
    name: 'maintenance',
    display_name: 'Maintenance',
    description: 'Data cleanup and health',
    priority: 90,
    is_enabled: 1,
    is_automatic: 1,
  },
  analytics: {
    name: 'analytics',
    display_name: 'Analytics',
    description: 'Factor analysis and outcomes',
    priority: 45,
    is_enabled: 1,
    is_automatic: 1,
  },
};

/**
 * Sample job configurations
 */
const JOBS = {
  'prices.daily': {
    job_key: 'prices.daily',
    name: 'Daily Price Update',
    description: 'Fetch end-of-day prices for all tracked stocks',
    cron_expression: '0 18 * * 1-5',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 3600,
    max_retries: 3,
    batch_size: 100,
  },
  'prices.intraday': {
    job_key: 'prices.intraday',
    name: 'Intraday Update',
    description: 'Fetch intraday prices during market hours',
    cron_expression: '*/15 9-16 * * 1-5',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 600,
    max_retries: 2,
    batch_size: 50,
  },
  'fundamentals.quarterly': {
    job_key: 'fundamentals.quarterly',
    name: 'Quarterly Import',
    description: 'Import quarterly financial statements',
    cron_expression: '0 6 * * *',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 7200,
    max_retries: 3,
    batch_size: 50,
  },
  'sentiment.reddit': {
    job_key: 'sentiment.reddit',
    name: 'Reddit Sentiment',
    description: 'Analyze Reddit sentiment for tracked stocks',
    cron_expression: '0 */4 * * *',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 1800,
    max_retries: 2,
    batch_size: 100,
  },
  'sec.filings': {
    job_key: 'sec.filings',
    name: 'SEC Filing Check',
    description: 'Check for new SEC filings',
    cron_expression: '0 7 * * *',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 3600,
    max_retries: 3,
    batch_size: 100,
  },
  'maintenance.cleanup': {
    job_key: 'maintenance.cleanup',
    name: 'Data Cleanup',
    description: 'Clean up stale data',
    cron_expression: '0 3 * * 0',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 7200,
    max_retries: 1,
    batch_size: 1000,
  },
  'analytics.outcomes': {
    job_key: 'analytics.outcomes',
    name: 'Outcome Calculation',
    description: 'Calculate recommendation outcomes',
    cron_expression: '0 4 * * 0',
    timezone: 'America/New_York',
    is_enabled: 1,
    is_automatic: 1,
    timeout_seconds: 7200,
    max_retries: 2,
    batch_size: 2000,
    depends_on: '["fundamentals.quarterly"]',
  },
};

/**
 * Sample run records
 */
const RUNS = {
  completed: {
    job_key: 'prices.daily',
    trigger_type: 'scheduled',
    triggered_by: 'cron',
    status: 'completed',
    items_total: 500,
    items_processed: 500,
    items_updated: 450,
    items_failed: 0,
    duration_ms: 45000,
    progress: 100,
  },
  failed: {
    job_key: 'prices.daily',
    trigger_type: 'manual',
    triggered_by: 'user',
    status: 'failed',
    items_total: 500,
    items_processed: 250,
    items_updated: 200,
    items_failed: 50,
    duration_ms: 30000,
    progress: 50,
    error_message: 'API rate limit exceeded',
  },
  running: {
    job_key: 'fundamentals.quarterly',
    trigger_type: 'scheduled',
    triggered_by: 'cron',
    status: 'running',
    items_total: 100,
    items_processed: 45,
    items_updated: 40,
    items_failed: 0,
    progress: 45,
    current_step: 'Processing AAPL',
  },
};

/**
 * Sample queue entries
 */
const QUEUE_ENTRIES = {
  pending: {
    job_key: 'prices.daily',
    priority: 50,
    status: 'pending',
    trigger_type: 'manual',
    triggered_by: 'test',
    attempt: 0,
    max_attempts: 3,
  },
  processing: {
    job_key: 'fundamentals.quarterly',
    priority: 30,
    status: 'processing',
    trigger_type: 'scheduled',
    triggered_by: 'cron',
    attempt: 1,
    max_attempts: 3,
  },
  retry: {
    job_key: 'sentiment.social',
    priority: 20,
    status: 'pending',
    trigger_type: 'retry',
    triggered_by: 'system',
    attempt: 2,
    max_attempts: 3,
    last_error: 'Connection timeout',
  },
  highPriority: {
    job_key: 'sec.filings',
    priority: 10,
    status: 'pending',
    trigger_type: 'manual',
    triggered_by: 'admin',
    attempt: 0,
    max_attempts: 3,
  },
};

/**
 * Valid cron expressions for testing
 */
const VALID_CRON_EXPRESSIONS = [
  '* * * * *',           // Every minute
  '0 * * * *',           // Every hour
  '0 0 * * *',           // Daily at midnight
  '0 6 * * 1-5',         // Weekdays at 6am
  '*/15 9-16 * * 1-5',   // Every 15 min during market hours
  '0 0 1 * *',           // Monthly on 1st
  '0 4 * * 0',           // Sundays at 4am
];

/**
 * Invalid cron expressions for testing
 */
const INVALID_CRON_EXPRESSIONS = [
  '',                    // Empty
  'invalid',             // Not a cron format
  '* * *',               // Too few fields
  '60 * * * *',          // Invalid minute
  '* 25 * * *',          // Invalid hour
  null,                  // Null value
  123,                   // Non-string
];

/**
 * Bundle execution result shapes
 */
const EXECUTION_RESULTS = {
  success: {
    itemsTotal: 100,
    itemsProcessed: 100,
    itemsUpdated: 85,
    itemsFailed: 0,
  },
  partial: {
    itemsTotal: 100,
    itemsProcessed: 100,
    itemsUpdated: 70,
    itemsFailed: 15,
  },
  empty: {
    itemsTotal: 0,
    itemsProcessed: 0,
    itemsUpdated: 0,
    itemsFailed: 0,
  },
};

/**
 * Error scenarios for testing
 */
const ERROR_SCENARIOS = {
  networkError: new Error('Network request failed'),
  databaseError: new Error('Database connection lost'),
  timeoutError: new Error('Operation timed out'),
  validationError: new Error('Invalid data format'),
  notFoundError: new Error('Resource not found'),
};

/**
 * Generate a timestamp for testing
 */
function generateTimestamp(offsetMinutes = 0) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date.toISOString();
}

/**
 * Generate a date string (YYYY-MM-DD)
 */
function generateDateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

module.exports = {
  BUNDLES,
  JOBS,
  RUNS,
  QUEUE_ENTRIES,
  VALID_CRON_EXPRESSIONS,
  INVALID_CRON_EXPRESSIONS,
  EXECUTION_RESULTS,
  ERROR_SCENARIOS,
  generateTimestamp,
  generateDateString,
};
