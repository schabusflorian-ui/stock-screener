// src/services/costs/transactionCostModel.js
/**
 * Comprehensive Transaction Cost Model
 *
 * Integrates all cost components for realistic backtesting and live trading:
 * - Commission (tiered by broker)
 * - Bid-ask spread (volume-dependent)
 * - Market impact (Almgren-Chriss square-root model)
 * - Slippage (timing uncertainty)
 *
 * Professional hedge funds typically see:
 * - Mega-cap: 3-10 bps total
 * - Large-cap: 5-20 bps
 * - Mid-cap: 15-50 bps
 * - Small-cap: 30-100+ bps
 */

/**
 * Broker commission profiles
 */
const BROKER_PROFILES = {
  // Interactive Brokers tiered
  IBKR_TIERED: {
    name: 'Interactive Brokers (Tiered)',
    perShare: 0.0035,  // $0.0035 per share
    minPerOrder: 0.35, // $0.35 minimum
    maxPctOfTrade: 0.01, // 1% max
    type: 'per_share'
  },
  // Interactive Brokers fixed
  IBKR_FIXED: {
    name: 'Interactive Brokers (Fixed)',
    perShare: 0.005,
    minPerOrder: 1.00,
    maxPctOfTrade: 0.01,
    type: 'per_share'
  },
  // Commission-free (Alpaca, etc.)
  ZERO_COMMISSION: {
    name: 'Zero Commission',
    perShare: 0,
    minPerOrder: 0,
    maxPctOfTrade: 0,
    type: 'per_share'
  },
  // Institutional (negotiated)
  INSTITUTIONAL: {
    name: 'Institutional',
    bps: 1.5, // 1.5 bps
    minPerOrder: 25,
    type: 'bps'
  },
  // Default flat rate (for backtesting)
  FLAT_BPS: {
    name: 'Flat Basis Points',
    bps: 5, // 5 bps default
    type: 'bps'
  }
};

/**
 * Almgren-Chriss market impact parameters
 * Calibrated from academic literature
 */
const ALMGREN_CHRISS_PARAMS = {
  // Temporary impact: η * σ * sqrt(participation_rate)
  eta: 0.142,
  // Permanent impact: γ * σ * participation_rate
  gamma: 0.314
};

class TransactionCostModel {
  /**
   * Create a transaction cost model
   * @param {Object} options Configuration
   */
  constructor(options = {}) {
    this.broker = options.broker || 'FLAT_BPS';
    this.brokerProfile = BROKER_PROFILES[this.broker] || BROKER_PROFILES.FLAT_BPS;

    // Custom commission override (in bps)
    this.commissionBps = options.commissionBps || null;

    // Market impact settings
    this.useMarketImpact = options.useMarketImpact !== false;
    this.acParams = { ...ALMGREN_CHRISS_PARAMS, ...options.acParams };

    // Spread estimation settings
    this.useSpreadEstimation = options.useSpreadEstimation !== false;

    // Statistics
    this.stats = {
      totalTrades: 0,
      totalCommission: 0,
      totalSpreadCost: 0,
      totalMarketImpact: 0,
      totalSlippage: 0,
      totalCost: 0
    };
  }

  /**
   * Calculate commission for a trade
   * @param {number} shares Number of shares
   * @param {number} price Price per share
   * @param {string} side 'buy' or 'sell'
   * @returns {Object} Commission breakdown
   */
  calculateCommission(shares, price, side = 'buy') {
    const notional = shares * price;

    // Custom override
    if (this.commissionBps !== null) {
      const commission = notional * (this.commissionBps / 10000);
      return {
        commission,
        bps: this.commissionBps,
        method: 'custom_bps'
      };
    }

    const profile = this.brokerProfile;

    if (profile.type === 'per_share') {
      let commission = shares * profile.perShare;
      commission = Math.max(commission, profile.minPerOrder);
      commission = Math.min(commission, notional * profile.maxPctOfTrade);

      return {
        commission,
        bps: (commission / notional) * 10000,
        method: 'per_share'
      };
    } else {
      // BPS-based
      const commission = Math.max(
        notional * (profile.bps / 10000),
        profile.minPerOrder || 0
      );

      return {
        commission,
        bps: (commission / notional) * 10000,
        method: 'bps'
      };
    }
  }

  /**
   * Estimate bid-ask spread based on stock characteristics
   * @param {number} adv Average Daily Volume (shares)
   * @param {number} price Stock price
   * @param {number} volatility Daily volatility (decimal)
   * @param {number} marketCap Market cap in dollars
   * @returns {Object} Spread estimate
   */
  estimateSpread(adv, price, volatility = 0.02, marketCap = null) {
    if (!this.useSpreadEstimation) {
      return { halfSpreadBps: 0, fullSpreadBps: 0 };
    }

    // Base spread by market cap tier
    let baseSpreadBps;

    if (marketCap && marketCap > 100e9) {
      baseSpreadBps = 1.5; // Mega-cap
    } else if (marketCap && marketCap > 10e9) {
      baseSpreadBps = 2.5; // Large-cap
    } else if (adv > 5e6) {
      baseSpreadBps = 3; // High volume
    } else if (adv > 1e6) {
      baseSpreadBps = 6; // Medium volume
    } else if (adv > 100e3) {
      baseSpreadBps = 15; // Low volume
    } else {
      baseSpreadBps = 40; // Illiquid
    }

    // Volatility adjustment (higher vol = wider spreads)
    const volMultiplier = 1 + Math.max(0, (volatility - 0.02) * 20);

    // Price adjustment (penny stocks have wider spreads in bps)
    const priceMultiplier = price < 10 ? 1.5 : (price < 20 ? 1.2 : 1.0);

    const fullSpreadBps = baseSpreadBps * volMultiplier * priceMultiplier;
    const halfSpreadBps = fullSpreadBps / 2;

    return {
      halfSpreadBps,
      fullSpreadBps,
      components: {
        baseSpreadBps,
        volMultiplier,
        priceMultiplier
      }
    };
  }

  /**
   * Calculate market impact using Almgren-Chriss square-root model
   * @param {number} shares Order size in shares
   * @param {number} adv Average Daily Volume
   * @param {number} volatility Daily volatility (decimal)
   * @param {string} side 'buy' or 'sell'
   * @returns {Object} Market impact breakdown
   */
  calculateMarketImpact(shares, adv, volatility = 0.02, side = 'buy') {
    if (!this.useMarketImpact || adv <= 0 || shares <= 0) {
      return {
        temporaryImpactBps: 0,
        permanentImpactBps: 0,
        totalImpactBps: 0
      };
    }

    const participationRate = shares / adv;

    // Almgren-Chriss model
    const temporaryImpact = this.acParams.eta * volatility * Math.sqrt(participationRate);
    const permanentImpact = this.acParams.gamma * volatility * participationRate;

    // Large orders: cap impact at reasonable levels
    const maxImpact = 0.05; // 5% max price impact
    const totalImpact = Math.min(temporaryImpact + permanentImpact, maxImpact);

    return {
      temporaryImpactBps: temporaryImpact * 10000,
      permanentImpactBps: permanentImpact * 10000,
      totalImpactBps: totalImpact * 10000,
      participationRate,
      warning: participationRate > 0.10 ? 'High participation rate' : null
    };
  }

  /**
   * Calculate total transaction cost
   * @param {Object} params Trade parameters
   * @returns {Object} Complete cost breakdown
   */
  calculateTotalCost({
    shares,
    price,
    side = 'buy',
    adv = null,
    volatility = 0.02,
    marketCap = null
  }) {
    const notional = shares * price;

    // Commission
    const commission = this.calculateCommission(shares, price, side);

    // Spread
    const spread = this.estimateSpread(adv || 1e6, price, volatility, marketCap);

    // Market Impact
    const impact = adv
      ? this.calculateMarketImpact(shares, adv, volatility, side)
      : { totalImpactBps: 0, temporaryImpactBps: 0, permanentImpactBps: 0 };

    // Random timing slippage (±2-5 bps uncertainty)
    const slippageBps = Math.random() * 3 + 2;

    // Total cost
    const totalBps = commission.bps + spread.halfSpreadBps + impact.totalImpactBps + slippageBps;
    const totalDollars = notional * (totalBps / 10000);

    // Update statistics
    this.stats.totalTrades++;
    this.stats.totalCommission += commission.commission;
    this.stats.totalSpreadCost += notional * (spread.halfSpreadBps / 10000);
    this.stats.totalMarketImpact += notional * (impact.totalImpactBps / 10000);
    this.stats.totalSlippage += notional * (slippageBps / 10000);
    this.stats.totalCost += totalDollars;

    // Calculate fill price
    let fillPrice;
    if (side === 'buy') {
      fillPrice = price * (1 + totalBps / 10000);
    } else {
      fillPrice = price * (1 - totalBps / 10000);
    }

    return {
      notional,
      fillPrice,
      totalCostBps: totalBps,
      totalCostDollars: totalDollars,
      breakdown: {
        commission: {
          dollars: commission.commission,
          bps: commission.bps
        },
        spread: {
          dollars: notional * (spread.halfSpreadBps / 10000),
          bps: spread.halfSpreadBps
        },
        marketImpact: {
          dollars: notional * (impact.totalImpactBps / 10000),
          bps: impact.totalImpactBps,
          temporary: impact.temporaryImpactBps,
          permanent: impact.permanentImpactBps
        },
        slippage: {
          dollars: notional * (slippageBps / 10000),
          bps: slippageBps
        }
      },
      warnings: impact.warning ? [impact.warning] : []
    };
  }

  /**
   * Get statistics summary
   */
  getStatistics() {
    const totalNotional = this.stats.totalCost / (this.stats.totalTrades > 0
      ? (this.stats.totalCost / this.stats.totalTrades * 10000)
      : 1);

    return {
      totalTrades: this.stats.totalTrades,
      totalCosts: {
        total: this.stats.totalCost,
        commission: this.stats.totalCommission,
        spread: this.stats.totalSpreadCost,
        marketImpact: this.stats.totalMarketImpact,
        slippage: this.stats.totalSlippage
      },
      averageCostBps: this.stats.totalTrades > 0
        ? this.stats.totalCost / this.stats.totalTrades / 100 // Rough estimate
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalTrades: 0,
      totalCommission: 0,
      totalSpreadCost: 0,
      totalMarketImpact: 0,
      totalSlippage: 0,
      totalCost: 0
    };
  }

  /**
   * Create a lightweight version for backtesting (just returns fill price adjustment)
   */
  static simpleAdjustment(price, side, costBps = 10) {
    if (side === 'buy') {
      return price * (1 + costBps / 10000);
    } else {
      return price * (1 - costBps / 10000);
    }
  }
}

/**
 * Pre-configured cost models
 */
const CostModels = {
  // Realistic hedge fund model
  HEDGE_FUND: new TransactionCostModel({
    broker: 'INSTITUTIONAL',
    useMarketImpact: true,
    useSpreadEstimation: true
  }),

  // Retail investor model
  RETAIL: new TransactionCostModel({
    broker: 'ZERO_COMMISSION',
    useMarketImpact: false,
    useSpreadEstimation: true
  }),

  // Simple backtesting model (fixed cost)
  SIMPLE: new TransactionCostModel({
    commissionBps: 5,
    useMarketImpact: false,
    useSpreadEstimation: false
  }),

  // Full realistic model
  REALISTIC: new TransactionCostModel({
    broker: 'IBKR_TIERED',
    useMarketImpact: true,
    useSpreadEstimation: true
  })
};

module.exports = {
  TransactionCostModel,
  CostModels,
  BROKER_PROFILES,
  ALMGREN_CHRISS_PARAMS
};
