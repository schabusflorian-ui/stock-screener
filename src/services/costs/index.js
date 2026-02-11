// src/services/costs/index.js
/**
 * Cost Modeling Module
 *
 * Comprehensive transaction cost and tax handling for:
 * - Realistic backtesting
 * - Live trading cost estimation
 * - Tax-aware portfolio management
 *
 * Usage:
 *
 * // Simple backtesting (current behavior)
 * const { TransactionCostModel } = require('./costs');
 * const fillPrice = TransactionCostModel.simpleAdjustment(price, 'buy', 10); // 10 bps
 *
 * // Realistic hedge fund model
 * const { CostModels } = require('./costs');
 * const cost = CostModels.HEDGE_FUND.calculateTotalCost({
 *   shares: 1000,
 *   price: 150,
 *   side: 'buy',
 *   adv: 5000000,
 *   volatility: 0.02
 * });
 *
 * // Tax tracking (for taxable accounts)
 * const { TaxTracker } = require('./costs');
 * const taxTracker = new TaxTracker({ lotMethod: 'hifo' });
 * taxTracker.addLot('AAPL', 100, 15000, '2024-01-15');
 * const sale = taxTracker.sellShares('AAPL', 50, 180);
 */

const { TransactionCostModel, CostModels, BROKER_PROFILES, ALMGREN_CHRISS_PARAMS } = require('./transactionCostModel');
const { TaxTracker, TaxLot, LOT_METHODS, TAX_RATES } = require('./taxTracker');
const { AustrianTaxTracker, AustrianTaxLot, KEST_RATE } = require('./austrianTaxTracker');
const {
  BacktestCostCalculator,
  COST_PROFILES,
  applyTransactionCosts,
  createCostAwareSimulator,
  compareCostProfiles
} = require('./backtestIntegration');

// API cost tracking (Phase 3.1)
const ApiCostTracker = require('./apiCostTracker');

// Singleton instance for API cost tracking
let apiCostTrackerInstance = null;

/**
 * Get or create the API cost tracker instance
 * @returns {ApiCostTracker}
 */
function getCostTracker() {
  if (!apiCostTrackerInstance) {
    apiCostTrackerInstance = new ApiCostTracker();
  }
  return apiCostTrackerInstance;
}

/**
 * Middleware to track Claude API costs with budget enforcement
 * @param {Function} apiCallFn - Function that makes the Claude API call
 * @param {Object} options - Tracking options { jobKey, endpoint }
 * @returns {Promise<Object>} - API response with cost tracking
 */
async function trackClaudeCall(apiCallFn, options = {}) {
  const tracker = getCostTracker();
  const { jobKey = 'unknown', endpoint = '/v1/messages' } = options;

  // Check budget before making expensive API call
  const budgetCheck = await tracker.checkBudget('claude');

  if (!budgetCheck.withinBudget) {
    const error = new Error(budgetCheck.message);
    error.code = 'BUDGET_EXCEEDED';
    error.budgetStatus = budgetCheck;
    throw error;
  }

  // Make the API call
  let response;
  let error = null;

  try {
    response = await apiCallFn();
  } catch (err) {
    error = err;
    throw err;
  } finally {
    // Track the call regardless of success/failure
    if (response || error) {
      const inputTokens = response?.usage?.input_tokens || 0;
      const outputTokens = response?.usage?.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      // Calculate cost using Claude Sonnet 4 pricing
      const inputCostPer1M = 3.00;
      const outputCostPer1M = 15.00;
      const cost = (inputTokens / 1_000_000) * inputCostPer1M +
                   (outputTokens / 1_000_000) * outputCostPer1M;

      tracker.logCall('claude', endpoint, jobKey, cost, totalTokens, false);
    }
  }

  return response;
}

/**
 * Track Alpha Vantage API call (free tier, track for monitoring)
 */
function trackAlphaVantageCall(endpoint, jobKey = 'unknown') {
  getCostTracker().logCall('alpha_vantage', endpoint, jobKey, 0, 0, false);
}

/**
 * Track SEC EDGAR API call (free, track for monitoring)
 */
function trackSECCall(endpoint, jobKey = 'unknown') {
  getCostTracker().logCall('sec', endpoint, jobKey, 0, 0, false);
}

/**
 * Track FRED API call (free, track for monitoring)
 */
function trackFREDCall(endpoint, jobKey = 'unknown') {
  getCostTracker().logCall('fred', endpoint, jobKey, 0, 0, false);
}

module.exports = {
  // Transaction costs
  TransactionCostModel,
  CostModels,
  BROKER_PROFILES,
  ALMGREN_CHRISS_PARAMS,

  // Tax tracking (US)
  TaxTracker,
  TaxLot,
  LOT_METHODS,
  TAX_RATES,

  // Tax tracking (Austria)
  AustrianTaxTracker,
  AustrianTaxLot,
  KEST_RATE,

  // Backtest integration
  BacktestCostCalculator,
  COST_PROFILES,
  applyTransactionCosts,
  createCostAwareSimulator,
  compareCostProfiles,

  // API cost tracking (Phase 3.1)
  ApiCostTracker,
  getCostTracker,
  trackClaudeCall,
  trackAlphaVantageCall,
  trackSECCall,
  trackFREDCall
};
