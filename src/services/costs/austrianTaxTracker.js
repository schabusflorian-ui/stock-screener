// src/services/costs/austrianTaxTracker.js
/**
 * Austrian Tax Tracker (KESt - Kapitalertragsteuer)
 *
 * Austrian capital gains tax rules:
 * - Flat 27.5% tax on all realized gains (KESt)
 * - No distinction between short-term and long-term holdings
 * - No wash sale rules
 * - Losses can offset gains within the same calendar year
 * - Foreign dividends taxed at 27.5% (may have withholding tax credits)
 *
 * Note: Austrian brokers (e.g., Flatex AT, DADAT) automatically withhold KESt.
 * Foreign brokers (Interactive Brokers, Trade Republic DE) require self-reporting
 * via Einkommensteuererklärung (E1kv form).
 */

const KEST_RATE = 0.275; // 27.5% flat tax

/**
 * Tax lot for Austrian tracking
 * Simpler than US version - no holding period distinction needed
 */
class AustrianTaxLot {
  constructor(symbol, shares, costBasis, purchaseDate, purchasePrice = null) {
    this.lotId = `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.symbol = symbol;
    this.shares = shares;
    this.costBasis = costBasis; // Total cost basis in EUR
    this.costPerShare = costBasis / shares;
    this.purchaseDate = new Date(purchaseDate);
    this.purchasePrice = purchasePrice || this.costPerShare;
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
      isGain: gainLoss > 0,
      kest: gainLoss > 0 ? gainLoss * KEST_RATE : 0 // Only tax on gains
    };
  }
}

/**
 * Austrian Tax Tracker
 *
 * Tracks positions and calculates KESt liability
 */
class AustrianTaxTracker {
  constructor(options = {}) {
    // Lot selection method (FIFO is standard in Austria)
    this.lotMethod = options.lotMethod || 'fifo';

    // Storage
    this.lots = new Map(); // symbol -> TaxLot[]

    // Yearly tracking
    this.yearlyResults = new Map(); // year -> { gains, losses, netGain, kest }

    // Current year
    this.currentYear = options.year || new Date().getFullYear();

    // Dividend tracking
    this.dividends = [];
  }

  /**
   * Add a new purchase lot
   */
  addLot(symbol, shares, totalCost, purchaseDate) {
    if (!this.lots.has(symbol)) {
      this.lots.set(symbol, []);
    }

    const lot = new AustrianTaxLot(symbol, shares, totalCost, purchaseDate);
    this.lots.get(symbol).push(lot);

    return lot;
  }

  /**
   * Record a dividend payment
   */
  recordDividend(symbol, grossAmount, withholdingTax, paymentDate) {
    const year = new Date(paymentDate).getFullYear();
    const netAmount = grossAmount - withholdingTax;

    // Austrian KESt on dividends
    const kestDue = grossAmount * KEST_RATE;

    // Credit for foreign withholding (up to 15% typically creditable)
    const withholdingCredit = Math.min(withholdingTax, grossAmount * 0.15);
    const netKest = Math.max(0, kestDue - withholdingCredit);

    const dividend = {
      symbol,
      grossAmount,
      withholdingTax,
      withholdingCredit,
      netAmount,
      kestDue,
      netKest,
      paymentDate: new Date(paymentDate),
      year
    };

    this.dividends.push(dividend);
    return dividend;
  }

  /**
   * Sell shares using FIFO (standard Austrian method)
   */
  sellShares(symbol, sharesToSell, salePrice, saleDate = new Date()) {
    const saleDateObj = saleDate instanceof Date ? saleDate : new Date(saleDate);
    const saleYear = saleDateObj.getFullYear();

    const symbolLots = this.lots.get(symbol);
    if (!symbolLots || symbolLots.length === 0) {
      throw new Error(`No lots found for ${symbol}`);
    }

    // Sort by purchase date (FIFO)
    const sortedLots = [...symbolLots].sort((a, b) => a.purchaseDate - b.purchaseDate);

    const results = {
      symbol,
      saleDate: saleDateObj.toISOString(),
      sharesSold: 0,
      totalProceeds: 0,
      totalBasis: 0,
      totalGainLoss: 0,
      kest: 0,
      lotsSold: []
    };

    let remainingShares = sharesToSell;

    for (const lot of sortedLots) {
      if (remainingShares <= 0) break;

      const sharesToSellFromLot = Math.min(lot.shares, remainingShares);
      const { proceeds, basis, gainLoss, kest } = lot.calculateGainLoss(salePrice, sharesToSellFromLot);

      results.sharesSold += sharesToSellFromLot;
      results.totalProceeds += proceeds;
      results.totalBasis += basis;
      results.totalGainLoss += gainLoss;
      results.kest += kest;

      results.lotsSold.push({
        lotId: lot.lotId,
        sharesSold: sharesToSellFromLot,
        purchaseDate: lot.purchaseDate.toISOString(),
        purchasePrice: lot.costPerShare,
        salePrice,
        gainLoss,
        kest
      });

      // Update lot
      lot.shares -= sharesToSellFromLot;
      remainingShares -= sharesToSellFromLot;
    }

    // Remove empty lots
    this.lots.set(symbol, symbolLots.filter(lot => lot.shares > 0));

    // Update yearly tracking
    this._updateYearlyResults(saleYear, results.totalGainLoss);

    return results;
  }

  /**
   * Update yearly results for loss offsetting
   */
  _updateYearlyResults(year, gainLoss) {
    if (!this.yearlyResults.has(year)) {
      this.yearlyResults.set(year, {
        gains: 0,
        losses: 0,
        netGain: 0,
        kest: 0,
        trades: []
      });
    }

    const yearData = this.yearlyResults.get(year);

    if (gainLoss > 0) {
      yearData.gains += gainLoss;
    } else {
      yearData.losses += Math.abs(gainLoss);
    }

    yearData.netGain = yearData.gains - yearData.losses;
    yearData.kest = Math.max(0, yearData.netGain) * KEST_RATE;
  }

  /**
   * Get tax summary for a year
   */
  getYearSummary(year = this.currentYear) {
    const yearData = this.yearlyResults.get(year) || {
      gains: 0,
      losses: 0,
      netGain: 0,
      kest: 0
    };

    // Add dividend KESt
    const yearDividends = this.dividends.filter(d => d.year === year);
    const dividendGross = yearDividends.reduce((sum, d) => sum + d.grossAmount, 0);
    const dividendKest = yearDividends.reduce((sum, d) => sum + d.netKest, 0);

    return {
      year,
      capitalGains: {
        totalGains: yearData.gains,
        totalLosses: yearData.losses,
        netGain: yearData.netGain,
        kest: yearData.kest
      },
      dividends: {
        grossAmount: dividendGross,
        kest: dividendKest,
        count: yearDividends.length
      },
      total: {
        taxableIncome: yearData.netGain + dividendGross,
        totalKest: yearData.kest + dividendKest
      },
      formatted: {
        netGain: `€${yearData.netGain.toFixed(2)}`,
        kest: `€${(yearData.kest + dividendKest).toFixed(2)}`,
        effectiveRate: yearData.netGain > 0
          ? `${((yearData.kest / yearData.netGain) * 100).toFixed(1)}%`
          : '0%'
      }
    };
  }

  /**
   * Get all open positions with unrealized gains/losses
   */
  getOpenPositions(currentPrices) {
    const positions = [];

    for (const [symbol, lots] of this.lots) {
      const currentPrice = currentPrices[symbol];
      if (!currentPrice || lots.length === 0) continue;

      let totalShares = 0;
      let totalBasis = 0;

      for (const lot of lots) {
        totalShares += lot.shares;
        totalBasis += lot.shares * lot.costPerShare;
      }

      const currentValue = totalShares * currentPrice;
      const unrealizedGain = currentValue - totalBasis;
      const potentialKest = unrealizedGain > 0 ? unrealizedGain * KEST_RATE : 0;

      positions.push({
        symbol,
        shares: totalShares,
        avgCost: totalBasis / totalShares,
        currentPrice,
        totalBasis,
        currentValue,
        unrealizedGain,
        unrealizedGainPct: (unrealizedGain / totalBasis) * 100,
        potentialKest,
        netAfterTax: currentValue - potentialKest
      });
    }

    return positions.sort((a, b) => b.currentValue - a.currentValue);
  }

  /**
   * Find tax-loss harvesting opportunities
   * In Austria, losses offset gains within the same year
   */
  findLossHarvestingOpportunities(currentPrices, minLoss = 100) {
    const opportunities = [];

    for (const [symbol, lots] of this.lots) {
      const currentPrice = currentPrices[symbol];
      if (!currentPrice) continue;

      for (const lot of lots) {
        const { gainLoss } = lot.calculateGainLoss(currentPrice);

        if (gainLoss < -minLoss) {
          opportunities.push({
            symbol,
            shares: lot.shares,
            purchaseDate: lot.purchaseDate.toISOString(),
            purchasePrice: lot.costPerShare,
            currentPrice,
            unrealizedLoss: gainLoss,
            taxSavings: Math.abs(gainLoss) * KEST_RATE // Potential tax offset
          });
        }
      }
    }

    return opportunities.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss);
  }

  /**
   * Estimate year-end tax situation
   */
  estimateYearEndTax(currentPrices, year = this.currentYear) {
    const realized = this.getYearSummary(year);
    const positions = this.getOpenPositions(currentPrices);

    const totalUnrealizedGain = positions.reduce((sum, p) => sum + p.unrealizedGain, 0);
    const totalUnrealizedLoss = positions
      .filter(p => p.unrealizedGain < 0)
      .reduce((sum, p) => sum + p.unrealizedGain, 0);

    return {
      realized: realized.capitalGains,
      unrealized: {
        totalGain: totalUnrealizedGain,
        ifSoldNow: totalUnrealizedGain > 0 ? totalUnrealizedGain * KEST_RATE : 0
      },
      lossHarvestingPotential: {
        availableLosses: Math.abs(totalUnrealizedLoss),
        couldOffsetGains: Math.min(Math.abs(totalUnrealizedLoss), realized.capitalGains.gains),
        potentialTaxSavings: Math.min(Math.abs(totalUnrealizedLoss), realized.capitalGains.gains) * KEST_RATE
      },
      recommendation: this._getRecommendation(realized, totalUnrealizedLoss)
    };
  }

  _getRecommendation(realized, unrealizedLoss) {
    if (realized.capitalGains.netGain > 0 && unrealizedLoss < 0) {
      const harvestable = Math.min(realized.capitalGains.netGain, Math.abs(unrealizedLoss));
      if (harvestable > 500) {
        return `Consider harvesting €${harvestable.toFixed(0)} in losses to offset gains and save €${(harvestable * KEST_RATE).toFixed(0)} in KESt`;
      }
    }
    if (realized.capitalGains.netGain > 0) {
      return `Net gain of €${realized.capitalGains.netGain.toFixed(0)} - KESt of €${realized.capitalGains.kest.toFixed(0)} will be due`;
    }
    if (realized.capitalGains.losses > 0) {
      return `€${realized.capitalGains.losses.toFixed(0)} in losses can offset future gains this year`;
    }
    return 'No significant tax events yet this year';
  }
}

module.exports = {
  AustrianTaxTracker,
  AustrianTaxLot,
  KEST_RATE
};
