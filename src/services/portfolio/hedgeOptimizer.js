// src/services/portfolio/hedgeOptimizer.js
// Hedge optimization service for tail risk protection
// Suggests protective hedges during high-risk market regimes

class HedgeOptimizer {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Get portfolio positions with betas
      getPortfolioPositions: this.db.prepare(`
        SELECT
          pp.id,
          pp.shares,
          pp.current_value,
          pp.average_cost,
          c.symbol,
          c.name,
          c.sector,
          pm.beta
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        LEFT JOIN price_metrics pm ON pp.company_id = pm.company_id
        WHERE pp.portfolio_id = ?
          AND pp.shares > 0
      `),

      // Get portfolio summary
      getPortfolioSummary: this.db.prepare(`
        SELECT
          current_value as total_value,
          current_cash as total_cash,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = portfolios.id AND shares > 0) as position_count
        FROM portfolios
        WHERE id = ?
      `),

      // Get current VIX level
      getVIXLevel: this.db.prepare(`
        SELECT
          indicator_value as vix,
          fetched_at
        FROM market_sentiment
        WHERE indicator_type = 'vix'
        ORDER BY fetched_at DESC
        LIMIT 1
      `),

      // Get SPY price
      getSPYPrice: this.db.prepare(`
        SELECT dp.close as price
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE c.symbol = 'SPY'
        ORDER BY dp.date DESC
        LIMIT 1
      `),

      // Store hedge suggestion
      storeHedgeSuggestion: this.db.prepare(`
        INSERT INTO hedge_suggestions (
          portfolio_id,
          regime,
          vix_level,
          portfolio_beta,
          portfolio_var_95,
          suggestion_type,
          underlying,
          action,
          strike_type,
          expiry_dte,
          contracts,
          estimated_cost,
          target_cash_pct,
          current_cash_pct,
          hedge_ratio,
          notional_hedged,
          rationale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      // Get recent hedge suggestions
      getRecentSuggestions: this.db.prepare(`
        SELECT *
        FROM hedge_suggestions
        WHERE portfolio_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `),

      // Update suggestion status
      updateSuggestionStatus: this.db.prepare(`
        UPDATE hedge_suggestions
        SET status = ?,
            implemented_at = CASE WHEN ? = 'implemented' THEN datetime('now') ELSE implemented_at END
        WHERE id = ?
      `),
    };
  }

  /**
   * Analyze portfolio and suggest hedges based on market regime
   * @param {number} portfolioId - Portfolio ID
   * @param {Object} regime - Current market regime from RegimeDetector
   * @returns {Object} Hedge suggestions
   */
  suggestHedges(portfolioId, regime) {
    // Only suggest hedges in high-risk regimes
    const shouldHedge = ['HIGH_VOL', 'CRISIS'].includes(regime?.regime);

    if (!shouldHedge) {
      return {
        needed: false,
        regime: regime?.regime || 'UNKNOWN',
        reason: 'Market regime does not warrant protective hedging',
        suggestions: [],
      };
    }

    // Get portfolio data
    const portfolio = this.stmts.getPortfolioSummary.get(portfolioId);
    if (!portfolio || portfolio.total_value <= 0) {
      return {
        needed: false,
        error: 'Portfolio not found or has no value',
        suggestions: [],
      };
    }

    const positions = this.stmts.getPortfolioPositions.all(portfolioId);

    // Calculate portfolio metrics
    const portfolioMetrics = this._calculatePortfolioMetrics(portfolio, positions);

    // Get market data
    const vixData = this.stmts.getVIXLevel.get();
    const spyData = this.stmts.getSPYPrice.get();

    const vix = vixData?.vix || 20;
    const spyPrice = spyData?.price || 450;

    // Generate hedge suggestions
    const suggestions = [];

    // 1. Index put suggestion
    const indexPut = this._suggestIndexPut(portfolioMetrics, spyPrice, vix, regime);
    if (indexPut) suggestions.push(indexPut);

    // 2. VIX call suggestion (if VIX is relatively low in crisis)
    const vixCall = this._suggestVIXCall(portfolioMetrics, vix, regime);
    if (vixCall) suggestions.push(vixCall);

    // 3. Sector-specific hedges
    const sectorHedge = this._suggestSectorHedge(portfolioMetrics, positions, regime);
    if (sectorHedge) suggestions.push(sectorHedge);

    // 4. Cash increase suggestion
    const cashSuggestion = this._suggestCashIncrease(portfolioMetrics, regime);
    if (cashSuggestion) suggestions.push(cashSuggestion);

    // Store suggestions
    for (const suggestion of suggestions) {
      this._storeSuggestion(portfolioId, suggestion, portfolioMetrics, vix, regime);
    }

    return {
      needed: true,
      regime: regime?.regime,
      vix,
      portfolioValue: portfolio.total_value,
      portfolioBeta: portfolioMetrics.beta,
      portfolioVaR95: portfolioMetrics.var95,
      suggestions,
      analysisTime: new Date().toISOString(),
    };
  }

  /**
   * Calculate portfolio-level metrics
   */
  _calculatePortfolioMetrics(portfolio, positions) {
    const totalValue = portfolio.total_value + portfolio.total_cash;
    const equityValue = portfolio.total_value;

    // Calculate weighted beta
    let weightedBeta = 0;
    let totalBetaWeight = 0;

    for (const pos of positions) {
      if (pos.beta !== null && pos.current_value > 0) {
        const weight = pos.current_value / equityValue;
        weightedBeta += (pos.beta || 1) * weight;
        totalBetaWeight += weight;
      }
    }

    const beta = totalBetaWeight > 0 ? weightedBeta / totalBetaWeight : 1.0;

    // Estimate VaR (simplified - assume 20% annual vol, 95% = 1.65 sigma)
    // Daily VaR = Portfolio * Beta * Market Vol * Z-score
    const dailyMarketVol = 0.20 / Math.sqrt(252); // Annualized to daily
    const zScore95 = 1.65;
    const dailyVaR = equityValue * beta * dailyMarketVol * zScore95;
    const weeklyVaR = dailyVaR * Math.sqrt(5);

    // Calculate sector concentration
    const sectorExposure = {};
    for (const pos of positions) {
      const sector = pos.sector || 'Unknown';
      sectorExposure[sector] = (sectorExposure[sector] || 0) + pos.current_value;
    }

    // Find most concentrated sector
    let maxSector = null;
    let maxSectorValue = 0;
    for (const [sector, value] of Object.entries(sectorExposure)) {
      if (value > maxSectorValue) {
        maxSector = sector;
        maxSectorValue = value;
      }
    }

    return {
      totalValue,
      equityValue,
      cashValue: portfolio.total_cash,
      cashPct: portfolio.total_cash / totalValue,
      beta,
      var95: weeklyVaR,
      var95Pct: weeklyVaR / equityValue,
      sectorExposure,
      topSector: maxSector,
      topSectorPct: equityValue > 0 ? maxSectorValue / equityValue : 0,
      positionCount: positions.length,
    };
  }

  /**
   * Suggest SPY put for broad market protection
   */
  _suggestIndexPut(portfolioMetrics, spyPrice, vix, regime) {
    const { beta, equityValue } = portfolioMetrics;

    // Skip if portfolio too small
    if (equityValue < 10000) {
      return null;
    }

    // Calculate hedge parameters
    const hedgeRatio = regime?.regime === 'CRISIS' ? 0.75 : 0.50; // Hedge 50-75% of exposure
    const notionalToHedge = equityValue * beta * hedgeRatio;

    // SPY option parameters
    const spyMultiplier = 100;
    const contracts = Math.max(1, Math.round(notionalToHedge / (spyPrice * spyMultiplier)));
    const notionalHedged = contracts * spyPrice * spyMultiplier;

    // Strike selection based on VIX
    let strikeType, strikePct;
    if (vix > 30) {
      strikeType = '3% OTM';
      strikePct = 0.97;
    } else if (vix > 25) {
      strikeType = '5% OTM';
      strikePct = 0.95;
    } else {
      strikeType = '7% OTM';
      strikePct = 0.93;
    }

    const strike = Math.round(spyPrice * strikePct);

    // Estimate cost (simplified - higher VIX = higher premiums)
    const baseIV = vix / 100;
    const daysToExpiry = 30;
    const timeValue = Math.sqrt(daysToExpiry / 365);
    const putPremium = spyPrice * 0.02 * (1 + baseIV) * timeValue; // Rough estimate
    const estimatedCost = contracts * putPremium * 100;

    return {
      type: 'INDEX_PUT',
      underlying: 'SPY',
      action: 'BUY',
      strike,
      strikeType,
      expiryDTE: daysToExpiry,
      contracts,
      estimatedCost: Math.round(estimatedCost),
      hedgeRatio,
      notionalHedged: Math.round(notionalHedged),
      rationale: `Protect ${(hedgeRatio * 100).toFixed(0)}% of market exposure. ${contracts} SPY ${strike} puts at ~$${putPremium.toFixed(2)}/contract.`,
      priority: 'HIGH',
    };
  }

  /**
   * Suggest VIX calls for volatility spike protection
   */
  _suggestVIXCall(portfolioMetrics, vix, regime) {
    const { equityValue } = portfolioMetrics;

    // Skip if portfolio too small or VIX already elevated
    if (equityValue < 25000 || vix > 35) {
      return null;
    }

    // VIX calls are most valuable when VIX is low but regime suggests trouble
    if (regime?.regime !== 'HIGH_VOL' && regime?.regime !== 'CRISIS') {
      return null;
    }

    // Allocate 0.5-1% of portfolio to VIX calls
    const allocationPct = regime?.regime === 'CRISIS' ? 0.01 : 0.005;
    const allocationAmount = equityValue * allocationPct;

    // VIX option parameters
    const vixMultiplier = 100;
    const strikeMultiplier = vix < 25 ? 1.3 : 1.2; // 20-30% OTM
    const strike = Math.round(vix * strikeMultiplier);

    // Estimate VIX call price (very rough)
    const callPremium = Math.max(0.50, (strike - vix) * 0.3 + 1.0);
    const contracts = Math.max(1, Math.floor(allocationAmount / (callPremium * vixMultiplier)));
    const estimatedCost = contracts * callPremium * vixMultiplier;

    return {
      type: 'VIX_CALL',
      underlying: 'VIX',
      action: 'BUY',
      strike,
      strikeType: `${Math.round((strikeMultiplier - 1) * 100)}% OTM`,
      expiryDTE: 45, // VIX options typically 30-45 DTE
      contracts,
      estimatedCost: Math.round(estimatedCost),
      hedgeRatio: allocationPct,
      notionalHedged: null,
      rationale: `Volatility spike protection. If VIX spikes to ${strike + 10}+, these calls provide significant gains to offset portfolio losses.`,
      priority: 'MEDIUM',
    };
  }

  /**
   * Suggest sector-specific hedge if concentrated
   */
  _suggestSectorHedge(portfolioMetrics, positions, regime) {
    const { topSector, topSectorPct, equityValue } = portfolioMetrics;

    // Only suggest if heavily concentrated (>35%) in one sector
    if (topSectorPct < 0.35 || !topSector) {
      return null;
    }

    // Map sectors to ETFs
    const sectorETFs = {
      'Technology': 'XLK',
      'Information Technology': 'XLK',
      'Healthcare': 'XLV',
      'Health Care': 'XLV',
      'Financials': 'XLF',
      'Consumer Discretionary': 'XLY',
      'Consumer Staples': 'XLP',
      'Energy': 'XLE',
      'Industrials': 'XLI',
      'Materials': 'XLB',
      'Utilities': 'XLU',
      'Real Estate': 'XLRE',
      'Communication Services': 'XLC',
    };

    const etf = sectorETFs[topSector];
    if (!etf) {
      return null;
    }

    const sectorExposure = portfolioMetrics.sectorExposure[topSector] || 0;
    const hedgeRatio = 0.5; // Hedge 50% of sector exposure
    const notionalToHedge = sectorExposure * hedgeRatio;

    return {
      type: 'SECTOR_HEDGE',
      underlying: etf,
      action: 'BUY',
      strike: null,
      strikeType: '5% OTM',
      expiryDTE: 30,
      contracts: Math.max(1, Math.round(notionalToHedge / 5000)), // Rough estimate
      estimatedCost: null,
      hedgeRatio,
      notionalHedged: Math.round(notionalToHedge),
      rationale: `${(topSectorPct * 100).toFixed(0)}% concentration in ${topSector}. Consider ${etf} puts to hedge sector-specific risk.`,
      priority: 'MEDIUM',
    };
  }

  /**
   * Suggest raising cash levels
   */
  _suggestCashIncrease(portfolioMetrics, regime) {
    const { cashPct, totalValue, equityValue } = portfolioMetrics;

    // Target cash levels by regime
    const targetCash = {
      'HIGH_VOL': 0.15,
      'CRISIS': 0.25,
    };

    const target = targetCash[regime?.regime] || 0.10;

    // Only suggest if significantly below target
    if (cashPct >= target - 0.05) {
      return null;
    }

    const currentCashPct = cashPct;
    const cashToRaise = (target - cashPct) * totalValue;
    const pctToSell = (target - cashPct);

    return {
      type: 'CASH_INCREASE',
      underlying: 'CASH',
      action: 'RAISE',
      strike: null,
      strikeType: null,
      expiryDTE: null,
      contracts: null,
      estimatedCost: 0,
      targetCashPct: target,
      currentCashPct: Math.round(currentCashPct * 100) / 100,
      hedgeRatio: pctToSell,
      notionalHedged: Math.round(cashToRaise),
      rationale: `Raise cash from ${(currentCashPct * 100).toFixed(0)}% to ${(target * 100).toFixed(0)}% (reduce equity by ~$${(cashToRaise / 1000).toFixed(1)}K). Cash provides optionality and reduces drawdown.`,
      priority: regime?.regime === 'CRISIS' ? 'HIGH' : 'MEDIUM',
    };
  }

  /**
   * Store hedge suggestion in database
   */
  _storeSuggestion(portfolioId, suggestion, metrics, vix, regime) {
    try {
      this.stmts.storeHedgeSuggestion.run(
        portfolioId,
        regime?.regime || 'UNKNOWN',
        vix,
        metrics.beta,
        metrics.var95,
        suggestion.type,
        suggestion.underlying,
        suggestion.action,
        suggestion.strikeType,
        suggestion.expiryDTE,
        suggestion.contracts,
        suggestion.estimatedCost,
        suggestion.targetCashPct || null,
        suggestion.currentCashPct || null,
        suggestion.hedgeRatio,
        suggestion.notionalHedged,
        suggestion.rationale
      );
    } catch (error) {
      console.warn('Failed to store hedge suggestion:', error.message);
    }
  }

  /**
   * Get recent hedge suggestions for a portfolio
   */
  getRecentSuggestions(portfolioId, limit = 10) {
    return this.stmts.getRecentSuggestions.all(portfolioId, limit);
  }

  /**
   * Mark suggestion as implemented or dismissed
   */
  updateSuggestionStatus(suggestionId, status) {
    this.stmts.updateSuggestionStatus.run(status, status, suggestionId);
    return { success: true, status };
  }

  /**
   * Get hedge summary for portfolio
   */
  getHedgeSummary(portfolioId) {
    const suggestions = this.getRecentSuggestions(portfolioId, 20);

    const summary = {
      totalSuggestions: suggestions.length,
      implemented: suggestions.filter(s => s.status === 'implemented').length,
      dismissed: suggestions.filter(s => s.status === 'dismissed').length,
      pending: suggestions.filter(s => s.status === 'suggested').length,
      recentSuggestions: suggestions.slice(0, 5),
    };

    // Calculate total estimated hedging cost
    summary.totalEstimatedCost = suggestions
      .filter(s => s.status === 'suggested' && s.estimated_cost)
      .reduce((sum, s) => sum + s.estimated_cost, 0);

    return summary;
  }
}

module.exports = { HedgeOptimizer };
