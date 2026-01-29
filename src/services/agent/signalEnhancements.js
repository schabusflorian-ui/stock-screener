// src/services/agent/signalEnhancements.js
// Signal enhancements for hedge fund-grade trading
// - Regime-adaptive weights
// - Signal decay tracking
// - Transaction cost modeling

/**
 * Regime-Adaptive Signal Weights
 * Adjusts factor weights based on market regime
 */
const REGIME_WEIGHT_MATRIX = {
  // In crisis, trust fundamentals and insider (smart money signals)
  CRISIS: {
    technical: 0.05,
    sentiment: 0.05,
    insider: 0.40,
    fundamental: 0.50,
    rationale: 'Crisis: Fundamentals and smart money matter most, noise signals unreliable',
  },

  // High volatility - reduce noisy signals
  HIGH_VOL: {
    technical: 0.10,
    sentiment: 0.10,
    insider: 0.35,
    fundamental: 0.45,
    rationale: 'High volatility: Reduce noise, trust value and insider signals',
  },

  // Bear market - fundamentals and contrarian insider buying
  BEAR: {
    technical: 0.15,
    sentiment: 0.15,
    insider: 0.35,
    fundamental: 0.35,
    rationale: 'Bear market: Quality and insider buying signal opportunity',
  },

  // Bull market - momentum works
  BULL: {
    technical: 0.30,
    sentiment: 0.25,
    insider: 0.15,
    fundamental: 0.30,
    rationale: 'Bull market: Momentum and sentiment are informative',
  },

  // Sideways - balanced approach
  SIDEWAYS: {
    technical: 0.20,
    sentiment: 0.20,
    insider: 0.25,
    fundamental: 0.35,
    rationale: 'Sideways: Balanced weights for range-bound market',
  },
};

/**
 * Signal Half-Life Configuration
 * Days until signal loses 50% of predictive power
 */
const SIGNAL_HALF_LIVES = {
  // Technical signals decay fast
  technical: {
    halfLifeDays: 5,
    minWeight: 0.2, // Never below 20% of original weight
    type: 'fast',
  },

  // Sentiment decays moderately
  sentiment: {
    halfLifeDays: 7,
    minWeight: 0.3,
    type: 'medium',
  },

  // Insider buying has longer information content
  insider: {
    halfLifeDays: 30,
    minWeight: 0.5,
    type: 'slow',
  },

  // Fundamental signals are most persistent
  fundamental: {
    halfLifeDays: 60,
    minWeight: 0.6,
    type: 'persistent',
  },
};

/**
 * Transaction Cost Model
 * Estimates cost impact of trades
 */
const DEFAULT_COST_PARAMS = {
  commissionBps: 5,        // 5 basis points
  halfSpreadBps: 5,        // Assume 10bp spread, we pay half
  impactCoefficient: 0.1,  // Almgren-Chriss eta
  permanentImpact: 0.05,   // gamma
};

class SignalEnhancer {
  constructor(db, options = {}) {
    this.db = db;
    this.costParams = { ...DEFAULT_COST_PARAMS, ...options.costParams };
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      getSignalHistory: this.db.prepare(`
        SELECT ar.*, c.symbol
        FROM agent_recommendations ar
        JOIN companies c ON ar.company_id = c.id
        WHERE LOWER(c.symbol) = LOWER(?)
        ORDER BY ar.created_at DESC
        LIMIT 20
      `),

      getPriceVolatility: this.db.prepare(`
        SELECT company_id,
          AVG(ABS((close - open) / open)) * 100 as avg_daily_range,
          COUNT(*) as days
        FROM daily_prices
        WHERE company_id = ?
        AND date >= date('now', '-30 days')
        GROUP BY company_id
      `),

      getAverageVolume: this.db.prepare(`
        SELECT AVG(volume) as avg_volume
        FROM daily_prices
        WHERE company_id = ?
        AND date >= date('now', '-30 days')
      `),

      storeSignalDecay: this.db.prepare(`
        INSERT OR REPLACE INTO signal_decay_history
        (company_id, signal_type, signal_date, original_strength, current_strength, days_aged)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
    };
  }

  /**
   * Get regime-adjusted weights
   * @param {string} regime - BULL, BEAR, SIDEWAYS, HIGH_VOL, CRISIS
   * @param {Object} baseWeights - Optional base weights to blend with
   */
  getRegimeWeights(regime, baseWeights = null) {
    const regimeWeights = REGIME_WEIGHT_MATRIX[regime] || REGIME_WEIGHT_MATRIX.SIDEWAYS;

    if (!baseWeights) {
      return { ...regimeWeights };
    }

    // Blend base weights with regime weights (50/50)
    const blended = {
      technical: (baseWeights.technical + regimeWeights.technical) / 2,
      sentiment: (baseWeights.sentiment + regimeWeights.sentiment) / 2,
      insider: (baseWeights.insider + regimeWeights.insider) / 2,
      fundamental: (baseWeights.fundamental + regimeWeights.fundamental) / 2,
      rationale: `Blended: ${regimeWeights.rationale}`,
    };

    // Normalize to sum to 1
    const total = blended.technical + blended.sentiment + blended.insider + blended.fundamental;
    blended.technical /= total;
    blended.sentiment /= total;
    blended.insider /= total;
    blended.fundamental /= total;

    return blended;
  }

  /**
   * Apply signal decay based on age
   * @param {Object} signal - Signal with score, confidence, and age
   * @param {string} signalType - technical, sentiment, insider, fundamental
   * @param {number} ageInDays - How old the signal is
   */
  applySignalDecay(signal, signalType, ageInDays) {
    const config = SIGNAL_HALF_LIVES[signalType];
    if (!config) return signal;

    // Exponential decay: weight = exp(-ln(2) * age / halfLife)
    const decayFactor = Math.exp(-0.693 * ageInDays / config.halfLifeDays);
    const effectiveWeight = Math.max(config.minWeight, decayFactor);

    return {
      ...signal,
      originalScore: signal.score,
      score: signal.score * effectiveWeight,
      decayFactor: Math.round(effectiveWeight * 1000) / 1000,
      ageInDays,
      halfLife: config.halfLifeDays,
      isStale: ageInDays > config.halfLifeDays * 3, // 3 half-lives = ~12.5% remaining
    };
  }

  /**
   * Calculate signal Information Coefficient (IC)
   * Measures correlation between signal and forward returns
   * @param {string} symbol - Stock symbol
   * @param {number} lookbackDays - Days to analyze
   */
  calculateSignalIC(symbol, lookbackDays = 60) {
    const history = this.stmts.getSignalHistory.all(symbol);

    if (history.length < 5) {
      return {
        error: 'Insufficient history',
        minRequired: 5,
        available: history.length,
      };
    }

    // Get price data for forward returns calculation
    const company = this.db.prepare('SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)').get(symbol);
    if (!company) return { error: 'Company not found' };

    const prices = this.db.prepare(`
      SELECT date, close FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(company.id, lookbackDays + 30);

    if (prices.length < 20) {
      return { error: 'Insufficient price data' };
    }

    // Match signals to forward returns
    const signalReturns = [];

    for (const rec of history) {
      const signals = rec.signals ? JSON.parse(rec.signals) : null;
      if (!signals) continue;

      const recDate = rec.date;

      // Find price at recommendation date and N days forward
      const horizons = [5, 10, 20];

      for (const horizon of horizons) {
        const priceAtRec = prices.find(p => p.date <= recDate);
        const priceForward = prices.find((p, idx) => {
          const daysBack = prices.indexOf(priceAtRec);
          return daysBack - idx >= horizon;
        });

        if (priceAtRec && priceForward) {
          const forwardReturn = (priceForward.close - priceAtRec.close) / priceAtRec.close;

          signalReturns.push({
            date: recDate,
            score: rec.score,
            horizon,
            forwardReturn,
          });
        }
      }
    }

    if (signalReturns.length < 5) {
      return { error: 'Insufficient matched signal-return pairs' };
    }

    // Calculate IC for each horizon
    const icResults = {};

    for (const horizon of [5, 10, 20]) {
      const pairs = signalReturns.filter(s => s.horizon === horizon);
      if (pairs.length < 3) continue;

      // Pearson correlation between signal score and forward return
      const scores = pairs.map(p => p.score);
      const returns = pairs.map(p => p.forwardReturn);

      const ic = this._correlation(scores, returns);

      icResults[`${horizon}d`] = {
        ic: Math.round(ic * 1000) / 1000,
        icAbsolute: Math.round(Math.abs(ic) * 1000) / 1000,
        sampleSize: pairs.length,
        interpretation: this._interpretIC(ic),
      };
    }

    // Calculate IC Information Ratio (mean IC / std dev of IC)
    const ics = Object.values(icResults).map(r => r.ic);
    const meanIC = ics.reduce((a, b) => a + b, 0) / ics.length;
    const icStdDev = Math.sqrt(ics.reduce((s, ic) => s + Math.pow(ic - meanIC, 2), 0) / ics.length);
    const icir = icStdDev > 0 ? meanIC / icStdDev : 0;

    return {
      symbol,
      byHorizon: icResults,
      summary: {
        meanIC: Math.round(meanIC * 1000) / 1000,
        icStdDev: Math.round(icStdDev * 1000) / 1000,
        icir: Math.round(icir * 100) / 100, // IC Information Ratio
        signalQuality: this._assessSignalQuality(meanIC, icir),
      },
      sampleSize: signalReturns.length,
    };
  }

  /**
   * Estimate transaction costs for a trade
   * @param {Object} trade - {symbol, shares, price, side, avgDailyVolume}
   */
  estimateTransactionCosts(trade) {
    const { shares, price, avgDailyVolume } = trade;
    const orderValue = shares * price;
    const participationRate = avgDailyVolume > 0 ? shares / avgDailyVolume : 0.01;

    // Commission
    const commission = orderValue * (this.costParams.commissionBps / 10000);

    // Spread cost
    const spreadCost = orderValue * (this.costParams.halfSpreadBps / 10000);

    // Market impact (Almgren-Chriss simplified)
    // Impact = η × σ × sqrt(Q/V)
    const volatility = 0.02; // Default 2% daily vol, should be calculated from data
    const temporaryImpact = this.costParams.impactCoefficient * volatility * Math.sqrt(participationRate);
    const impactCost = orderValue * temporaryImpact;

    // Total cost
    const totalCost = commission + spreadCost + impactCost;
    const totalCostBps = (totalCost / orderValue) * 10000;

    return {
      orderValue: Math.round(orderValue * 100) / 100,
      participationRate: Math.round(participationRate * 10000) / 100, // As percentage
      components: {
        commission: Math.round(commission * 100) / 100,
        spreadCost: Math.round(spreadCost * 100) / 100,
        marketImpact: Math.round(impactCost * 100) / 100,
      },
      totalCost: Math.round(totalCost * 100) / 100,
      totalCostBps: Math.round(totalCostBps * 10) / 10,
      breakEvenReturn: Math.round(totalCostBps * 2) / 10000, // Need 2x cost to profit
      recommendation: this._getCostRecommendation(totalCostBps, participationRate),
    };
  }

  /**
   * Suggest optimal execution strategy
   * @param {Object} order - Order details
   */
  suggestExecutionStrategy(order) {
    const { shares, avgDailyVolume, urgency = 'normal' } = order;
    const participationRate = avgDailyVolume > 0 ? shares / avgDailyVolume : 0.5;

    // Execution strategy based on order size
    if (participationRate < 0.01) {
      return {
        strategy: 'IMMEDIATE',
        description: 'Small order - execute immediately at market',
        expectedSlippage: 'Minimal (< 5 bps)',
        timeframe: 'Instant',
      };
    } else if (participationRate < 0.05) {
      return {
        strategy: 'TWAP_2H',
        description: 'Time-Weighted Average Price over 2 hours',
        expectedSlippage: '5-15 bps',
        timeframe: '2 hours',
        intervals: 12, // Every 10 minutes
      };
    } else if (participationRate < 0.15) {
      return {
        strategy: 'VWAP_DAY',
        description: 'Volume-Weighted Average Price over full day',
        expectedSlippage: '15-30 bps',
        timeframe: 'Full trading day',
        intervals: 'Match volume profile',
      };
    } else {
      return {
        strategy: 'MULTI_DAY',
        description: 'Split across multiple days to minimize impact',
        expectedSlippage: '30-50+ bps',
        timeframe: `${Math.ceil(participationRate / 0.10)} days minimum`,
        dailyLimit: `${Math.round(10 * 100)}% of ADV per day`,
        warning: 'Large order - significant market impact expected',
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  _correlation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    if (varX === 0 || varY === 0) return 0;
    return cov / Math.sqrt(varX * varY);
  }

  _interpretIC(ic) {
    const absIC = Math.abs(ic);
    if (absIC > 0.10) return 'Excellent predictive power';
    if (absIC > 0.05) return 'Good predictive power';
    if (absIC > 0.02) return 'Moderate predictive power';
    if (absIC > 0.01) return 'Weak predictive power';
    return 'No significant predictive power';
  }

  _assessSignalQuality(meanIC, icir) {
    if (icir > 0.5 && meanIC > 0.03) return 'HIGH - Consistent alpha generation';
    if (icir > 0.3 && meanIC > 0.02) return 'MEDIUM - Moderate alpha with some consistency';
    if (meanIC > 0.01) return 'LOW - Weak but present signal';
    return 'NONE - Signal not predictive';
  }

  _getCostRecommendation(totalCostBps, participationRate) {
    if (totalCostBps > 50) {
      return 'HIGH COST: Consider reducing position size or patient execution';
    }
    if (totalCostBps > 25) {
      return 'MODERATE COST: Use algorithmic execution (TWAP/VWAP)';
    }
    if (participationRate > 0.10) {
      return 'LARGE ORDER: Split execution over multiple days';
    }
    return 'LOW COST: Immediate execution acceptable';
  }

  /**
   * Get aggregate IC dashboard across all signals
   * Shows which signal types are most predictive
   */
  getSignalICDashboard() {
    // Get all recent recommendations
    const recommendations = this.db.prepare(`
      SELECT ar.*, c.symbol
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      WHERE ar.date >= date('now', '-90 days')
      ORDER BY ar.date DESC
    `).all();

    if (recommendations.length < 10) {
      return { error: 'Insufficient recommendation history', count: recommendations.length };
    }

    // Track IC by signal type
    const signalTypeICs = {
      technical: { scores: [], returns: [] },
      sentiment: { scores: [], returns: [] },
      insider: { scores: [], returns: [] },
      fundamental: { scores: [], returns: [] },
      overall: { scores: [], returns: [] },
    };

    for (const rec of recommendations) {
      const signals = rec.signals ? JSON.parse(rec.signals) : null;
      if (!signals) continue;

      // Get forward return (20-day)
      const forwardPrice = this.db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date > ?
        ORDER BY date ASC LIMIT 1 OFFSET 19
      `).get(rec.company_id, rec.date);

      const recPrice = this.db.prepare(`
        SELECT close FROM daily_prices
        WHERE company_id = ? AND date <= ?
        ORDER BY date DESC LIMIT 1
      `).get(rec.company_id, rec.date);

      if (!forwardPrice || !recPrice) continue;

      const forwardReturn = (forwardPrice.close - recPrice.close) / recPrice.close;

      // Store scores and returns by signal type
      if (signals.technical?.score !== undefined) {
        signalTypeICs.technical.scores.push(signals.technical.score);
        signalTypeICs.technical.returns.push(forwardReturn);
      }
      if (signals.sentiment?.score !== undefined) {
        signalTypeICs.sentiment.scores.push(signals.sentiment.score);
        signalTypeICs.sentiment.returns.push(forwardReturn);
      }
      if (signals.insider?.score !== undefined) {
        signalTypeICs.insider.scores.push(signals.insider.score);
        signalTypeICs.insider.returns.push(forwardReturn);
      }
      if (signals.fundamental?.score !== undefined) {
        signalTypeICs.fundamental.scores.push(signals.fundamental.score);
        signalTypeICs.fundamental.returns.push(forwardReturn);
      }

      signalTypeICs.overall.scores.push(rec.score);
      signalTypeICs.overall.returns.push(forwardReturn);
    }

    // Calculate IC for each signal type
    const dashboard = {};

    for (const [signalType, data] of Object.entries(signalTypeICs)) {
      if (data.scores.length < 5) {
        dashboard[signalType] = { ic: null, sampleSize: data.scores.length, status: 'Insufficient data' };
        continue;
      }

      const ic = this._correlation(data.scores, data.returns);
      const absIC = Math.abs(ic);

      dashboard[signalType] = {
        ic: Math.round(ic * 1000) / 1000,
        absIC: Math.round(absIC * 1000) / 1000,
        sampleSize: data.scores.length,
        status: absIC > 0.10 ? 'Excellent' : absIC > 0.05 ? 'Good' : absIC > 0.02 ? 'Moderate' : 'Weak',
        recommendation: ic > 0.05 ? 'Increase weight' : ic < -0.02 ? 'Review or reduce weight' : 'Maintain current weight',
      };
    }

    // Rank signal types by IC
    const ranking = Object.entries(dashboard)
      .filter(([_, d]) => d.ic !== null)
      .sort((a, b) => Math.abs(b[1].ic) - Math.abs(a[1].ic))
      .map(([type, data], idx) => ({ rank: idx + 1, signalType: type, ...data }));

    return {
      calculatedAt: new Date().toISOString(),
      period: '90 days',
      signalICs: dashboard,
      ranking,
      bestSignal: ranking[0]?.signalType || null,
      worstSignal: ranking[ranking.length - 1]?.signalType || null,
      overallIC: dashboard.overall?.ic || null,
    };
  }
}

// Export all
module.exports = {
  SignalEnhancer,
  REGIME_WEIGHT_MATRIX,
  SIGNAL_HALF_LIVES,
  DEFAULT_COST_PARAMS,
};
