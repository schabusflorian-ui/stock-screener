// src/services/costs/backtestIntegration.js
/**
 * Backtest Cost Integration
 *
 * Provides drop-in replacement for simple fixed costs in backtesting
 * with sophisticated market impact and tax-aware modeling.
 *
 * Integration Points:
 * 1. UnifiedBacktestEngine - replace fixed slippage with dynamic costs
 * 2. ExecutionSimulator - enhance with broker profiles
 * 3. WalkForwardEngine - track cumulative cost impact
 *
 * Usage:
 *
 * // In UnifiedBacktestEngine:
 * const { BacktestCostCalculator } = require('../costs/backtestIntegration');
 * const costCalculator = new BacktestCostCalculator(db, { profile: 'HEDGE_FUND' });
 * const fillPrice = costCalculator.getExecutionPrice(symbol, basePrice, shares, 'buy', date);
 */

const { TransactionCostModel, CostModels, BROKER_PROFILES } = require('./transactionCostModel');
const { TaxTracker, LOT_METHODS } = require('./taxTracker');

/**
 * Cost profiles for different backtesting scenarios
 */
const COST_PROFILES = {
  // Simple: Fixed 10 bps (current default behavior)
  SIMPLE: {
    name: 'Simple Fixed',
    description: 'Fixed 10 bps commission + slippage, no market impact',
    model: () => CostModels.SIMPLE,
    useMarketImpact: false,
    fixedCostBps: 10
  },

  // Retail: Zero commission + spread + small slippage
  RETAIL: {
    name: 'Retail (Zero Commission)',
    description: 'Zero commission but pays spread, minimal market impact',
    model: () => CostModels.RETAIL,
    useMarketImpact: false,
    fixedCostBps: 5 // Just spread approximation
  },

  // Institutional: Full cost model with market impact
  HEDGE_FUND: {
    name: 'Institutional/Hedge Fund',
    description: 'Full cost model: commission + spread + market impact',
    model: () => CostModels.HEDGE_FUND,
    useMarketImpact: true,
    fixedCostBps: null // Dynamic
  },

  // Conservative: Higher costs for stress testing
  CONSERVATIVE: {
    name: 'Conservative (Stress Test)',
    description: '2x normal costs for conservative estimates',
    model: () => new TransactionCostModel({
      broker: 'INSTITUTIONAL',
      useMarketImpact: true,
      slippageBps: 10, // Double slippage
      commissionBps: 3  // Higher commission
    }),
    useMarketImpact: true,
    fixedCostBps: null
  }
};

/**
 * BacktestCostCalculator
 *
 * Calculates execution costs for backtest trades
 */
class BacktestCostCalculator {
  /**
   * @param {Object} db Database connection
   * @param {Object} options Configuration
   */
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;

    // Select cost profile
    const profileName = options.profile || 'HEDGE_FUND';
    this.profile = COST_PROFILES[profileName] || COST_PROFILES.HEDGE_FUND;
    this.costModel = this.profile.model();

    // Tax tracking (optional)
    this.trackTaxes = options.trackTaxes || false;
    this.taxTracker = this.trackTaxes ? new TaxTracker({
      lotMethod: options.lotMethod || 'hifo'
    }) : null;

    // Cache for market data
    this.marketDataCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Cumulative statistics
    this.stats = {
      totalTrades: 0,
      totalCommission: 0,
      totalSpread: 0,
      totalMarketImpact: 0,
      totalSlippage: 0,
      totalCostBps: 0,
      bySymbol: new Map()
    };

    this._prepareStatements();
  }

  _prepareStatements() {
    // Get average daily volume
    this.stmtGetADV = this.db.prepare(`
      SELECT AVG(volume) as adv
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER(?)
        AND dp.date <= ?
        AND dp.date >= date(?, '-30 days')
    `);

    // Get volatility (from recent returns)
    this.stmtGetVolatility = this.db.prepare(`
      SELECT dp.close
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER(?)
        AND dp.date <= ?
      ORDER BY dp.date DESC
      LIMIT 21
    `);

    // Get market cap
    this.stmtGetMarketCap = this.db.prepare(`
      SELECT market_cap FROM companies WHERE LOWER(symbol) = LOWER(?)
    `);
  }

  /**
   * Get market data for cost calculation
   */
  _getMarketData(symbol, date) {
    const cacheKey = `${symbol}:${date}`;

    if (this.marketDataCache.has(cacheKey)) {
      this.cacheHits++;
      return this.marketDataCache.get(cacheKey);
    }

    this.cacheMisses++;

    // Get ADV
    const advResult = this.stmtGetADV.get(symbol, date, date);
    const adv = advResult?.adv || 1000000; // Default 1M shares

    // Calculate volatility from recent prices
    const prices = this.stmtGetVolatility.all(symbol, date);
    let volatility = 0.02; // Default 2%

    if (prices.length >= 2) {
      const returns = [];
      for (let i = 0; i < prices.length - 1; i++) {
        returns.push(prices[i].close / prices[i + 1].close - 1);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;
      volatility = Math.sqrt(variance);
    }

    // Get market cap
    const mcResult = this.stmtGetMarketCap.get(symbol);
    const marketCap = mcResult?.market_cap || 10e9; // Default $10B

    const data = { adv, volatility, marketCap };
    this.marketDataCache.set(cacheKey, data);

    return data;
  }

  /**
   * Calculate execution price with costs
   *
   * This is the main integration point - replaces the simple:
   *   fillPrice = price * (1 + slippage)  // for buys
   * with:
   *   fillPrice = this.getExecutionPrice(symbol, price, shares, 'buy', date)
   *
   * @param {string} symbol Stock symbol
   * @param {number} basePrice Theoretical execution price (close price)
   * @param {number} shares Order size
   * @param {string} side 'buy' or 'sell'
   * @param {string} date Trade date (for market data lookup)
   * @returns {number} Adjusted fill price including all costs
   */
  getExecutionPrice(symbol, basePrice, shares, side, date) {
    // For simple profile, just use fixed cost
    if (this.profile.fixedCostBps !== null && !this.profile.useMarketImpact) {
      const costMultiplier = side === 'buy'
        ? 1 + this.profile.fixedCostBps / 10000
        : 1 - this.profile.fixedCostBps / 10000;
      return basePrice * costMultiplier;
    }

    // Full cost calculation
    const marketData = this._getMarketData(symbol, date);

    const costs = this.costModel.calculateTotalCost({
      shares,
      price: basePrice,
      side,
      adv: marketData.adv,
      volatility: marketData.volatility,
      marketCap: marketData.marketCap
    });

    // Update statistics - breakdown contains objects with .bps properties
    this.stats.totalTrades++;
    this.stats.totalCommission += costs.breakdown.commission.bps || 0;
    this.stats.totalSpread += costs.breakdown.spread.bps || 0;
    this.stats.totalMarketImpact += costs.breakdown.marketImpact.bps || 0;
    this.stats.totalSlippage += costs.breakdown.slippage.bps || 0;
    this.stats.totalCostBps += costs.totalCostBps || 0;

    // Track by symbol
    if (!this.stats.bySymbol.has(symbol)) {
      this.stats.bySymbol.set(symbol, { trades: 0, totalCostBps: 0 });
    }
    const symbolStats = this.stats.bySymbol.get(symbol);
    symbolStats.trades++;
    symbolStats.totalCostBps += costs.totalCostBps || 0;

    return costs.fillPrice;
  }

  /**
   * Record a buy for tax tracking
   */
  recordBuy(symbol, shares, price, date) {
    if (this.taxTracker) {
      this.taxTracker.addLot(symbol, shares, shares * price, date);
    }
  }

  /**
   * Record a sell and get tax implications
   */
  recordSell(symbol, shares, price, date) {
    if (this.taxTracker) {
      return this.taxTracker.sellShares(symbol, shares, price, date);
    }
    return null;
  }

  /**
   * Get tax-loss harvesting opportunities
   */
  getTaxHarvestingOpportunities(currentPrices, minLoss = 1000) {
    if (this.taxTracker) {
      return this.taxTracker.getTaxLossHarvestingOpportunities(currentPrices, minLoss);
    }
    return [];
  }

  /**
   * Get cumulative cost statistics
   */
  getStatistics() {
    const avgCostBps = this.stats.totalTrades > 0
      ? this.stats.totalCostBps / this.stats.totalTrades
      : 0;

    return {
      profile: this.profile.name,
      totalTrades: this.stats.totalTrades,
      averageCostBps: avgCostBps.toFixed(2),
      breakdown: {
        avgCommissionBps: (this.stats.totalCommission / Math.max(1, this.stats.totalTrades)).toFixed(2),
        avgSpreadBps: (this.stats.totalSpread / Math.max(1, this.stats.totalTrades)).toFixed(2),
        avgMarketImpactBps: (this.stats.totalMarketImpact / Math.max(1, this.stats.totalTrades)).toFixed(2),
        avgSlippageBps: (this.stats.totalSlippage / Math.max(1, this.stats.totalTrades)).toFixed(2)
      },
      cacheStats: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: this.cacheHits > 0
          ? ((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100).toFixed(1) + '%'
          : '0%'
      },
      topCostlySymbols: this._getTopCostlySymbols(5)
    };
  }

  _getTopCostlySymbols(n) {
    const sorted = Array.from(this.stats.bySymbol.entries())
      .map(([symbol, stats]) => ({
        symbol,
        trades: stats.trades,
        avgCostBps: (stats.totalCostBps / stats.trades).toFixed(2)
      }))
      .sort((a, b) => parseFloat(b.avgCostBps) - parseFloat(a.avgCostBps));

    return sorted.slice(0, n);
  }

  /**
   * Reset statistics (for new backtest run)
   */
  reset() {
    this.stats = {
      totalTrades: 0,
      totalCommission: 0,
      totalSpread: 0,
      totalMarketImpact: 0,
      totalSlippage: 0,
      totalCostBps: 0,
      bySymbol: new Map()
    };
    this.marketDataCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;

    if (this.taxTracker) {
      this.taxTracker = new TaxTracker({
        lotMethod: this.taxTracker.lotMethod
      });
    }
  }
}

/**
 * Helper: Apply costs to a backtest trade
 *
 * Example integration in UnifiedBacktestEngine._simulateTrade():
 *
 * // OLD:
 * const slippage = this.options.slippage;
 * const fillPrice = side === 'buy' ? price * (1 + slippage) : price * (1 - slippage);
 *
 * // NEW:
 * const fillPrice = this.costCalculator.getExecutionPrice(symbol, price, shares, side, date);
 */
function applyTransactionCosts(trade, costCalculator) {
  const { symbol, price, shares, side, date } = trade;

  const fillPrice = costCalculator.getExecutionPrice(symbol, price, shares, side, date);

  return {
    ...trade,
    fillPrice,
    costBps: ((fillPrice - price) / price * 10000 * (side === 'buy' ? 1 : -1)).toFixed(2)
  };
}

/**
 * Create a cost-aware trade simulator
 *
 * Usage:
 * const simulator = createCostAwareSimulator(db, 'HEDGE_FUND');
 * const result = simulator.executeTrade({ symbol: 'AAPL', price: 150, shares: 1000, side: 'buy', date: '2024-01-15' });
 */
function createCostAwareSimulator(db, profile = 'HEDGE_FUND', options = {}) {
  const costCalculator = new BacktestCostCalculator(db, { profile, ...options });

  return {
    executeTrade: (trade) => applyTransactionCosts(trade, costCalculator),

    executeBatch: (trades) => trades.map(t => applyTransactionCosts(t, costCalculator)),

    getStatistics: () => costCalculator.getStatistics(),

    reset: () => costCalculator.reset(),

    calculator: costCalculator
  };
}

/**
 * Compare backtest results with different cost models
 */
function compareCostProfiles(db, trades) {
  const profiles = ['SIMPLE', 'RETAIL', 'HEDGE_FUND', 'CONSERVATIVE'];
  const results = {};

  for (const profile of profiles) {
    const simulator = createCostAwareSimulator(db, profile);

    let totalReturn = 0;
    let totalCost = 0;

    for (const trade of trades) {
      const executed = simulator.executeTrade(trade);

      if (trade.exitPrice) {
        const pnl = trade.side === 'buy'
          ? (trade.exitPrice - executed.fillPrice) * trade.shares
          : (executed.fillPrice - trade.exitPrice) * trade.shares;
        totalReturn += pnl;
      }

      totalCost += parseFloat(executed.costBps);
    }

    const stats = simulator.getStatistics();
    results[profile] = {
      name: COST_PROFILES[profile].name,
      totalReturn: totalReturn.toFixed(2),
      avgCostBps: stats.averageCostBps,
      breakdown: stats.breakdown
    };
  }

  return results;
}

module.exports = {
  BacktestCostCalculator,
  COST_PROFILES,
  applyTransactionCosts,
  createCostAwareSimulator,
  compareCostProfiles
};
