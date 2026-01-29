// src/services/costs/taxTracker.js
/**
 * Tax Tracking Module
 *
 * Relevance by account type:
 * - Hedge Fund (LP): Low - taxes pass through to investors
 * - Family Office: High - full tax optimization needed
 * - Retail (taxable): High - tax-loss harvesting valuable
 * - IRA/401k: None - tax-deferred/exempt
 * - Prop Trading: Moderate - mark-to-market election available
 *
 * Features:
 * - Realized gain/loss tracking
 * - Tax lot selection (FIFO, LIFO, HIFO, SpecID)
 * - Wash sale detection
 * - Short-term vs long-term classification
 * - Tax-loss harvesting suggestions
 */

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Tax rates (2024 US Federal)
 */
const TAX_RATES = {
  // Short-term capital gains (< 1 year) - taxed as ordinary income
  shortTerm: {
    bracket_0: { threshold: 11600, rate: 0.10 },
    bracket_1: { threshold: 47150, rate: 0.12 },
    bracket_2: { threshold: 100525, rate: 0.22 },
    bracket_3: { threshold: 191950, rate: 0.24 },
    bracket_4: { threshold: 243725, rate: 0.32 },
    bracket_5: { threshold: 609350, rate: 0.35 },
    bracket_6: { threshold: Infinity, rate: 0.37 }
  },
  // Long-term capital gains (>= 1 year)
  longTerm: {
    bracket_0: { threshold: 47025, rate: 0.00 },
    bracket_1: { threshold: 518900, rate: 0.15 },
    bracket_2: { threshold: Infinity, rate: 0.20 }
  },
  // Net Investment Income Tax (for high earners)
  niit: {
    threshold: 200000, // Single filer
    rate: 0.038
  }
};

/**
 * Lot selection methods
 */
const LOT_METHODS = {
  FIFO: 'fifo',      // First-In-First-Out (default)
  LIFO: 'lifo',      // Last-In-First-Out
  HIFO: 'hifo',      // Highest-In-First-Out (tax-loss priority)
  LOFO: 'lofo',      // Lowest-In-First-Out
  SPEC_ID: 'spec_id' // Specific Identification
};

class TaxLot {
  constructor({
    symbol,
    shares,
    costBasis,
    purchaseDate,
    lotId = null
  }) {
    this.lotId = lotId || `${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.symbol = symbol;
    this.shares = shares;
    this.costBasis = costBasis; // Total cost basis
    this.costPerShare = costBasis / shares;
    this.purchaseDate = new Date(purchaseDate);
  }

  /**
   * Check if this lot qualifies for long-term treatment
   */
  isLongTerm(asOfDate = new Date()) {
    // Ensure asOfDate is a Date object
    const dateObj = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
    const holdingPeriod = dateObj.getTime() - this.purchaseDate.getTime();
    return holdingPeriod >= ONE_YEAR_MS;
  }

  /**
   * Calculate gain/loss if sold at given price
   */
  calculateGainLoss(salePrice, sharesToSell = null) {
    const shares = sharesToSell || this.shares;
    const proceeds = salePrice * shares;
    const basis = this.costPerShare * shares;
    const gainLoss = proceeds - basis;

    return {
      proceeds,
      basis,
      gainLoss,
      gainLossPct: (gainLoss / basis) * 100,
      isGain: gainLoss > 0
    };
  }
}

class TaxTracker {
  constructor(options = {}) {
    // Lot tracking
    this.lots = new Map(); // symbol -> TaxLot[]

    // Realized gains/losses
    this.realizedGains = {
      shortTerm: { gains: 0, losses: 0 },
      longTerm: { gains: 0, losses: 0 }
    };

    // Wash sale tracking
    this.washSales = [];
    this.recentSales = []; // Track sales for wash sale detection

    // Configuration
    this.lotMethod = options.lotMethod || LOT_METHODS.FIFO;
    this.trackWashSales = options.trackWashSales !== false;

    // Tax year
    this.taxYear = options.taxYear || new Date().getFullYear();
  }

  /**
   * Add a new lot from a purchase
   */
  addLot(symbol, shares, totalCost, purchaseDate) {
    if (!this.lots.has(symbol)) {
      this.lots.set(symbol, []);
    }

    const lot = new TaxLot({
      symbol,
      shares,
      costBasis: totalCost,
      purchaseDate
    });

    this.lots.get(symbol).push(lot);

    // Check for wash sale trigger (purchase within 30 days of loss)
    if (this.trackWashSales) {
      this._checkWashSaleTrigger(symbol, purchaseDate);
    }

    return lot;
  }

  /**
   * Sell shares and calculate realized gain/loss
   */
  sellShares(symbol, sharesToSell, salePrice, saleDate = new Date()) {
    // Ensure saleDate is a Date object
    const saleDateObj = saleDate instanceof Date ? saleDate : new Date(saleDate);

    const symbolLots = this.lots.get(symbol);

    if (!symbolLots || symbolLots.length === 0) {
      throw new Error(`No lots found for ${symbol}`);
    }

    // Sort lots based on method
    const sortedLots = this._sortLotsForSale(symbolLots, salePrice);

    const results = {
      symbol,
      sharesSold: 0,
      totalProceeds: 0,
      totalBasis: 0,
      totalGainLoss: 0,
      shortTermGainLoss: 0,
      longTermGainLoss: 0,
      lotsSold: []
    };

    let remainingShares = sharesToSell;

    for (const lot of sortedLots) {
      if (remainingShares <= 0) break;

      const sharesToSellFromLot = Math.min(lot.shares, remainingShares);
      const { proceeds, basis, gainLoss } = lot.calculateGainLoss(salePrice, sharesToSellFromLot);
      const isLongTerm = lot.isLongTerm(saleDateObj);

      // Record the sale
      results.sharesSold += sharesToSellFromLot;
      results.totalProceeds += proceeds;
      results.totalBasis += basis;
      results.totalGainLoss += gainLoss;

      if (isLongTerm) {
        results.longTermGainLoss += gainLoss;
      } else {
        results.shortTermGainLoss += gainLoss;
      }

      results.lotsSold.push({
        lotId: lot.lotId,
        sharesSold: sharesToSellFromLot,
        costPerShare: lot.costPerShare,
        proceeds,
        basis,
        gainLoss,
        holdingPeriod: isLongTerm ? 'long_term' : 'short_term',
        purchaseDate: lot.purchaseDate.toISOString(),
        saleDate: saleDateObj.toISOString()
      });

      // Update realized gains
      const category = isLongTerm ? 'longTerm' : 'shortTerm';
      if (gainLoss > 0) {
        this.realizedGains[category].gains += gainLoss;
      } else {
        this.realizedGains[category].losses += Math.abs(gainLoss);
      }

      // Update lot
      lot.shares -= sharesToSellFromLot;
      remainingShares -= sharesToSellFromLot;
    }

    // Remove empty lots
    this.lots.set(symbol, symbolLots.filter(lot => lot.shares > 0));

    // Track for wash sale detection
    if (this.trackWashSales && results.totalGainLoss < 0) {
      this.recentSales.push({
        symbol,
        saleDate: saleDateObj,
        lossAmount: Math.abs(results.totalGainLoss),
        expiresAt: new Date(saleDateObj.getTime() + 30 * 24 * 60 * 60 * 1000)
      });
    }

    return results;
  }

  /**
   * Sort lots based on selection method
   */
  _sortLotsForSale(lots, salePrice) {
    const sortedLots = [...lots];

    switch (this.lotMethod) {
      case LOT_METHODS.FIFO:
        // First purchased first
        sortedLots.sort((a, b) => a.purchaseDate - b.purchaseDate);
        break;

      case LOT_METHODS.LIFO:
        // Last purchased first
        sortedLots.sort((a, b) => b.purchaseDate - a.purchaseDate);
        break;

      case LOT_METHODS.HIFO:
        // Highest cost first (maximizes losses)
        sortedLots.sort((a, b) => b.costPerShare - a.costPerShare);
        break;

      case LOT_METHODS.LOFO:
        // Lowest cost first (maximizes gains)
        sortedLots.sort((a, b) => a.costPerShare - b.costPerShare);
        break;

      default:
        // Default to FIFO
        sortedLots.sort((a, b) => a.purchaseDate - b.purchaseDate);
    }

    return sortedLots;
  }

  /**
   * Check if a purchase triggers a wash sale
   */
  _checkWashSaleTrigger(symbol, purchaseDate) {
    const now = new Date(purchaseDate);

    // Find recent sales of same symbol with losses
    const triggeredSales = this.recentSales.filter(sale =>
      sale.symbol === symbol &&
      sale.expiresAt > now &&
      sale.saleDate < now
    );

    for (const sale of triggeredSales) {
      this.washSales.push({
        symbol,
        saleDate: sale.saleDate,
        repurchaseDate: purchaseDate,
        disallowedLoss: sale.lossAmount,
        status: 'triggered'
      });

      // In a wash sale, the loss is disallowed but added to cost basis
      // This is tracked for reporting but the actual adjustment
      // would need to be applied to the new lot
    }

    // Clean up expired sales
    this.recentSales = this.recentSales.filter(sale => sale.expiresAt > now);
  }

  /**
   * Calculate unrealized gains/losses
   */
  calculateUnrealizedGainLoss(currentPrices) {
    let shortTermUnrealized = 0;
    let longTermUnrealized = 0;
    const details = [];

    for (const [symbol, lots] of this.lots) {
      const currentPrice = currentPrices[symbol];
      if (!currentPrice) continue;

      for (const lot of lots) {
        const { gainLoss } = lot.calculateGainLoss(currentPrice);
        const isLongTerm = lot.isLongTerm();

        if (isLongTerm) {
          longTermUnrealized += gainLoss;
        } else {
          shortTermUnrealized += gainLoss;
        }

        details.push({
          symbol,
          lotId: lot.lotId,
          shares: lot.shares,
          costPerShare: lot.costPerShare,
          currentPrice,
          gainLoss,
          holdingPeriod: isLongTerm ? 'long_term' : 'short_term'
        });
      }
    }

    return {
      shortTermUnrealized,
      longTermUnrealized,
      totalUnrealized: shortTermUnrealized + longTermUnrealized,
      details
    };
  }

  /**
   * Get tax-loss harvesting opportunities
   */
  getTaxLossHarvestingOpportunities(currentPrices, minLoss = 100) {
    const opportunities = [];

    for (const [symbol, lots] of this.lots) {
      const currentPrice = currentPrices[symbol];
      if (!currentPrice) continue;

      for (const lot of lots) {
        const { gainLoss } = lot.calculateGainLoss(currentPrice);

        if (gainLoss < -minLoss) {
          const isLongTerm = lot.isLongTerm();

          // Short-term losses are more valuable (offset ordinary income)
          const taxValue = isLongTerm
            ? Math.abs(gainLoss) * 0.15  // LT rate
            : Math.abs(gainLoss) * 0.32; // Assumed marginal rate

          opportunities.push({
            symbol,
            lotId: lot.lotId,
            shares: lot.shares,
            costBasis: lot.costPerShare * lot.shares,
            currentValue: currentPrice * lot.shares,
            unrealizedLoss: gainLoss,
            holdingPeriod: isLongTerm ? 'long_term' : 'short_term',
            estimatedTaxSavings: taxValue,
            washSaleRisk: this._checkWashSaleRisk(symbol)
          });
        }
      }
    }

    // Sort by tax value (highest first)
    opportunities.sort((a, b) => b.estimatedTaxSavings - a.estimatedTaxSavings);

    return opportunities;
  }

  /**
   * Check if a symbol is at risk of wash sale
   */
  _checkWashSaleRisk(symbol) {
    const recentSale = this.recentSales.find(s =>
      s.symbol === symbol && s.expiresAt > new Date()
    );
    return recentSale ? true : false;
  }

  /**
   * Get tax summary for the year
   */
  getTaxSummary() {
    const stGains = this.realizedGains.shortTerm.gains;
    const stLosses = this.realizedGains.shortTerm.losses;
    const ltGains = this.realizedGains.longTerm.gains;
    const ltLosses = this.realizedGains.longTerm.losses;

    const netShortTerm = stGains - stLosses;
    const netLongTerm = ltGains - ltLosses;

    // Net capital gain/loss (netting rules)
    let netCapitalGain;
    let taxableGain;
    let carryforwardLoss = 0;

    if (netShortTerm >= 0 && netLongTerm >= 0) {
      // Both positive - taxed separately
      taxableGain = netShortTerm + netLongTerm;
      netCapitalGain = taxableGain;
    } else if (netShortTerm < 0 && netLongTerm > 0) {
      // ST loss offsets LT gain
      netCapitalGain = netShortTerm + netLongTerm;
      taxableGain = Math.max(0, netCapitalGain);
    } else if (netShortTerm > 0 && netLongTerm < 0) {
      // LT loss offsets ST gain
      netCapitalGain = netShortTerm + netLongTerm;
      taxableGain = Math.max(0, netCapitalGain);
    } else {
      // Both negative
      netCapitalGain = netShortTerm + netLongTerm;
      taxableGain = 0;
      // Can deduct up to $3,000 against ordinary income
      carryforwardLoss = Math.max(0, Math.abs(netCapitalGain) - 3000);
    }

    return {
      taxYear: this.taxYear,
      shortTerm: {
        gains: stGains,
        losses: stLosses,
        net: netShortTerm
      },
      longTerm: {
        gains: ltGains,
        losses: ltLosses,
        net: netLongTerm
      },
      netCapitalGain,
      taxableGain,
      ordinaryIncomeDeduction: netCapitalGain < 0 ? Math.min(3000, Math.abs(netCapitalGain)) : 0,
      carryforwardLoss,
      washSales: this.washSales.length,
      washSaleDisallowed: this.washSales.reduce((sum, ws) => sum + ws.disallowedLoss, 0)
    };
  }

  /**
   * Estimate tax liability
   */
  estimateTaxLiability(ordinaryIncome = 100000) {
    const summary = this.getTaxSummary();

    // Short-term gains taxed as ordinary income
    // Long-term gains taxed at preferential rates

    // This is a simplified estimate
    const stTax = summary.shortTerm.net > 0
      ? summary.shortTerm.net * 0.32 // Assumed marginal rate
      : 0;

    const ltTax = summary.longTerm.net > 0
      ? summary.longTerm.net * 0.15 // Standard LT rate
      : 0;

    // NIIT if applicable
    const totalIncome = ordinaryIncome + Math.max(0, summary.netCapitalGain);
    const niitTax = totalIncome > TAX_RATES.niit.threshold
      ? Math.max(0, summary.netCapitalGain) * TAX_RATES.niit.rate
      : 0;

    return {
      shortTermTax: stTax,
      longTermTax: ltTax,
      niitTax,
      totalEstimatedTax: stTax + ltTax + niitTax,
      effectiveRate: summary.netCapitalGain > 0
        ? ((stTax + ltTax + niitTax) / summary.netCapitalGain) * 100
        : 0
    };
  }
}

module.exports = {
  TaxTracker,
  TaxLot,
  LOT_METHODS,
  TAX_RATES
};
