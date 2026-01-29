// src/services/macro/creditCycleIndicators.js
// Credit Cycle Monitor - Spitznagel-inspired early warning system
// Tracks credit conditions to predict financial stress before it manifests

/**
 * CreditCycleMonitor - Early warning system for financial stress
 *
 * Tracks:
 * - Credit spreads (BAA-AAA, high yield)
 * - Yield curve (10Y-2Y, inversions)
 * - Leverage metrics
 * - Credit growth
 *
 * Identifies credit cycle phase and provides positioning guidance
 */
class CreditCycleMonitor {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._initializeTables();
    this._prepareStatements();
    console.log('💳 CreditCycleMonitor initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credit_cycle_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        baa_aaa_spread REAL,
        hy_spread REAL,
        ted_spread REAL,
        yield_10y_2y REAL,
        yield_10y_3m REAL,
        curve_inverted INTEGER,
        corporate_debt_gdp REAL,
        margin_debt REAL,
        bank_lending_growth REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS credit_stress_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        stress_index REAL,
        stress_level TEXT,
        cycle_phase TEXT,
        spread_component REAL,
        curve_component REAL,
        leverage_component REAL,
        growth_component REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS credit_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        signal TEXT,
        severity TEXT,
        current_reading REAL,
        threshold REAL,
        lead_time TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtStoreMetrics = this.db.prepare(`
      INSERT OR REPLACE INTO credit_cycle_metrics (
        date, baa_aaa_spread, hy_spread, ted_spread,
        yield_10y_2y, yield_10y_3m, curve_inverted,
        corporate_debt_gdp, margin_debt, bank_lending_growth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtStoreStressIndex = this.db.prepare(`
      INSERT OR REPLACE INTO credit_stress_index (
        date, stress_index, stress_level, cycle_phase,
        spread_component, curve_component, leverage_component, growth_component
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtStoreWarning = this.db.prepare(`
      INSERT INTO credit_warnings (date, signal, severity, current_reading, threshold, lead_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetLatestMetrics = this.db.prepare(`
      SELECT * FROM credit_cycle_metrics ORDER BY date DESC LIMIT 1
    `);

    this.stmtGetMetricsHistory = this.db.prepare(`
      SELECT * FROM credit_cycle_metrics
      WHERE date >= date('now', '-365 days')
      ORDER BY date ASC
    `);

    this.stmtGetLatestStress = this.db.prepare(`
      SELECT * FROM credit_stress_index ORDER BY date DESC LIMIT 1
    `);
  }

  /**
   * Get current credit metrics
   * Uses market data as proxies when direct FRED data unavailable
   * @returns {Object} Credit metrics
   */
  getCurrentCreditMetrics() {
    // Credit spread proxies based on VIX and market conditions
    const spreads = this._getCreditSpreads();
    const yieldCurve = this._getYieldCurve();
    const leverage = this._getLeverageMetrics();
    const creditGrowth = this._getCreditGrowth();

    const metrics = {
      spreads,
      yieldCurve,
      leverage,
      creditGrowth,
      timestamp: new Date().toISOString()
    };

    // Store metrics
    const date = new Date().toISOString().split('T')[0];
    this.stmtStoreMetrics.run(
      date,
      spreads.baaAaa,
      spreads.highYield,
      spreads.ted,
      yieldCurve.spread10y2y,
      yieldCurve.spread10y3m,
      yieldCurve.isInverted ? 1 : 0,
      leverage.corporateDebtGdp,
      leverage.marginDebt,
      creditGrowth.bankLendingGrowth
    );

    return metrics;
  }

  _getCreditSpreads() {
    // Use VIX as proxy for credit conditions
    const vixData = this.db.prepare(`
      SELECT close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'VIX' OR c.symbol = '^VIX'
      ORDER BY date DESC
      LIMIT 1
    `).get();

    const vix = vixData?.price || 15;

    // Empirical relationship: credit spreads correlate with VIX
    // VIX 15 ≈ BAA-AAA 1.0%, VIX 25 ≈ 2.0%, VIX 35 ≈ 3.5%
    const baaAaa = Math.max(0.5, vix * 0.07);
    const highYield = baaAaa * 2.5; // HY spread typically 2-3x IG spread
    const ted = Math.max(0.1, vix * 0.02); // TED spread

    return {
      baaAaa,
      highYield,
      ted,
      vixLevel: vix,
      interpretation: baaAaa > 2 ? 'Elevated credit stress' :
                     baaAaa > 1.5 ? 'Moderate stress' : 'Normal conditions'
    };
  }

  _getYieldCurve() {
    // Get treasury yield proxies from market
    // Using 10Y-2Y as primary curve indicator

    // Estimate based on market conditions
    // In reality, would fetch from FRED
    const spreads = this._getCreditSpreads();

    // Inversion often happens when credit spreads are low but VIX rising
    // Simple heuristic: curve flattens/inverts late in cycle
    const baseSpread = 0.5; // Normal spread

    // Adjust based on credit conditions
    let spread10y2y = baseSpread;
    if (spreads.baaAaa > 2) {
      // High stress = flight to safety, curve steepens
      spread10y2y = baseSpread + 0.5;
    } else if (spreads.baaAaa < 1 && spreads.vixLevel < 15) {
      // Low vol, tight spreads = late cycle, flatten
      spread10y2y = baseSpread - 0.3;
    }

    const isInverted = spread10y2y < 0;
    const spread10y3m = spread10y2y - 0.1; // 3m typically higher yield than 2y

    return {
      spread10y2y,
      spread10y3m,
      isInverted,
      inversionDays: 0, // Would track from historical data
      interpretation: isInverted ? 'INVERTED - Recession warning' :
                     spread10y2y < 0.3 ? 'Flattening - Watch for inversion' :
                     'Normal steepness'
    };
  }

  _getLeverageMetrics() {
    // Proxy leverage metrics based on market cap changes
    // In reality, would use FRED data for debt/GDP ratios

    const marketData = this.db.prepare(`
      SELECT SUM(market_cap) as total_market_cap
      FROM companies
      WHERE market_cap > 0
    `).get();

    const totalMarketCap = marketData?.total_market_cap || 30e12; // $30T default

    // US GDP proxy: ~$25T
    const gdpProxy = 25e12;

    // Market cap / GDP (Buffett indicator) as leverage proxy
    const marketCapGdp = totalMarketCap / gdpProxy;

    // Corporate debt/GDP typically 45-50% in normal times
    // Estimate based on market conditions
    const corporateDebtGdp = 0.45 + (marketCapGdp - 1.2) * 0.1;

    // Margin debt proxy
    const marginDebt = totalMarketCap * 0.02; // ~2% of market cap

    return {
      corporateDebtGdp,
      marginDebt,
      marketCapGdp,
      interpretation: corporateDebtGdp > 0.55 ? 'Elevated leverage' :
                     corporateDebtGdp > 0.50 ? 'Above average' : 'Normal range'
    };
  }

  _getCreditGrowth() {
    // Estimate credit growth from market data
    // In reality, would use bank lending surveys, loan growth data

    // Use market performance as proxy
    const spyData = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'SPY'
      ORDER BY date DESC
      LIMIT 252
    `).all();

    if (spyData.length < 252) {
      return {
        bankLendingGrowth: 0.05, // Default 5%
        interpretation: 'Normal credit growth'
      };
    }

    // YoY market return as credit growth proxy
    const currentPrice = spyData[0].price;
    const yearAgoPrice = spyData[251].price;
    const marketReturn = (currentPrice - yearAgoPrice) / yearAgoPrice;

    // Credit growth typically 5-8% in normal times
    // Strong markets = strong credit growth
    const bankLendingGrowth = 0.05 + marketReturn * 0.3;

    return {
      bankLendingGrowth,
      marketReturn,
      interpretation: bankLendingGrowth > 0.12 ? 'Excessive credit growth - late cycle' :
                     bankLendingGrowth > 0.08 ? 'Strong credit growth' :
                     bankLendingGrowth > 0.03 ? 'Normal credit growth' :
                     bankLendingGrowth > 0 ? 'Weak credit growth' :
                     'Credit contraction - recession warning'
    };
  }

  /**
   * Calculate composite credit stress index (0-100)
   * @returns {Object} Stress index with components
   */
  calculateCreditStressIndex() {
    const metrics = this.getCurrentCreditMetrics();

    // Component scores (0-25 each)
    const spreadComponent = this._scoreSpreadComponent(metrics.spreads);
    const curveComponent = this._scoreCurveComponent(metrics.yieldCurve);
    const leverageComponent = this._scoreLeverageComponent(metrics.leverage);
    const growthComponent = this._scoreGrowthComponent(metrics.creditGrowth);

    const stressIndex = spreadComponent + curveComponent + leverageComponent + growthComponent;

    let stressLevel = 'low';
    if (stressIndex >= 70) stressLevel = 'extreme';
    else if (stressIndex >= 55) stressLevel = 'high';
    else if (stressIndex >= 40) stressLevel = 'elevated';
    else if (stressIndex >= 25) stressLevel = 'moderate';

    // Calculate historical percentile
    const history = this.stmtGetMetricsHistory.all();
    const historicalPercentile = this._calculatePercentile(stressIndex, history);

    const result = {
      stressIndex,
      stressLevel,
      components: {
        spreads: spreadComponent,
        curve: curveComponent,
        leverage: leverageComponent,
        growth: growthComponent
      },
      historicalPercentile,
      interpretation: this._interpretStressIndex(stressIndex, stressLevel)
    };

    // Store result (don't call detectCreditCyclePhase here to avoid recursion)
    const date = new Date().toISOString().split('T')[0];
    try {
      this.stmtStoreStressIndex.run(
        date, stressIndex, stressLevel, 'UNKNOWN',
        spreadComponent, curveComponent, leverageComponent, growthComponent
      );
    } catch (e) {
      // Ignore duplicate date errors
    }

    return result;
  }

  _scoreSpreadComponent(spreads) {
    // 0-25 based on credit spreads
    const baaScore = Math.min(12.5, spreads.baaAaa * 5);
    const hyScore = Math.min(12.5, spreads.highYield * 2);
    return baaScore + hyScore;
  }

  _scoreCurveComponent(curve) {
    // 0-25 based on yield curve
    if (curve.isInverted) return 25;
    if (curve.spread10y2y < 0.2) return 20;
    if (curve.spread10y2y < 0.5) return 15;
    if (curve.spread10y2y < 0.8) return 10;
    return 5;
  }

  _scoreLeverageComponent(leverage) {
    // 0-25 based on leverage levels
    if (leverage.corporateDebtGdp > 0.60) return 25;
    if (leverage.corporateDebtGdp > 0.55) return 20;
    if (leverage.corporateDebtGdp > 0.50) return 15;
    if (leverage.corporateDebtGdp > 0.45) return 10;
    return 5;
  }

  _scoreGrowthComponent(growth) {
    // 0-25 based on credit growth (too fast or too slow is concerning)
    const g = growth.bankLendingGrowth;

    if (g < 0) return 25; // Contraction = very concerning
    if (g < 0.02) return 20; // Very weak
    if (g > 0.15) return 20; // Excessive
    if (g > 0.10) return 15; // High
    if (g > 0.08) return 10; // Elevated
    return 5; // Normal range
  }

  _calculatePercentile(stressIndex, history) {
    if (history.length === 0) return 50;

    // Reconstruct historical stress indices
    const historicalIndices = history.map(h => {
      return this._scoreSpreadComponent({ baaAaa: h.baa_aaa_spread || 1, highYield: h.hy_spread || 4 }) +
             this._scoreCurveComponent({ isInverted: h.curve_inverted, spread10y2y: h.yield_10y_2y || 0.5 }) +
             this._scoreLeverageComponent({ corporateDebtGdp: h.corporate_debt_gdp || 0.48 }) +
             this._scoreGrowthComponent({ bankLendingGrowth: h.bank_lending_growth || 0.06 });
    });

    const below = historicalIndices.filter(i => i < stressIndex).length;
    return (below / historicalIndices.length) * 100;
  }

  _interpretStressIndex(stressIndex, level) {
    const interpretations = {
      'extreme': 'Credit crisis conditions - maximum defensive positioning',
      'high': 'Significant credit stress - reduce risk exposure',
      'elevated': 'Above normal stress - increase caution',
      'moderate': 'Some stress indicators - monitor closely',
      'low': 'Normal credit conditions'
    };
    return interpretations[level];
  }

  /**
   * Detect current credit cycle phase
   * @returns {Object} Cycle phase analysis
   */
  detectCreditCyclePhase() {
    const stress = this.calculateCreditStressIndex();
    const metrics = this.getCurrentCreditMetrics();

    let phase = 'EARLY_EXPANSION';
    let confidence = 0.6;
    let positioning = {};

    // Credit growth and spread analysis for phase detection
    const creditGrowth = metrics.creditGrowth.bankLendingGrowth;
    const spreads = metrics.spreads.baaAaa;
    const curveInverted = metrics.yieldCurve.isInverted;

    if (curveInverted || (spreads > 2.5 && creditGrowth < 0.02)) {
      // Contraction phase
      phase = 'CONTRACTION';
      confidence = 0.75;
      positioning = {
        equities: 0.4,
        bonds: 1.3,
        cash: 1.5,
        defensives: 1.3,
        cyclicals: 0.5
      };
    } else if (spreads > 3 || stress.stressIndex > 60) {
      // Trough phase
      phase = 'TROUGH';
      confidence = 0.7;
      positioning = {
        equities: 0.6, // Start rebuilding
        bonds: 1.2,
        cash: 1.2,
        defensives: 1.1,
        cyclicals: 0.7
      };
    } else if (spreads < 1 && creditGrowth > 0.10) {
      // Peak/Euphoria
      phase = 'PEAK_EUPHORIA';
      confidence = 0.7;
      positioning = {
        equities: 0.7,
        bonds: 0.9,
        cash: 1.3,
        defensives: 1.2,
        cyclicals: 0.7
      };
    } else if (creditGrowth > 0.08 && spreads < 1.5) {
      // Late expansion
      phase = 'LATE_EXPANSION';
      confidence = 0.65;
      positioning = {
        equities: 0.85,
        bonds: 1.0,
        cash: 1.1,
        defensives: 1.1,
        cyclicals: 0.9
      };
    } else {
      // Early expansion
      phase = 'EARLY_EXPANSION';
      confidence = 0.6;
      positioning = {
        equities: 1.1,
        bonds: 0.9,
        cash: 0.8,
        defensives: 0.9,
        cyclicals: 1.2
      };
    }

    return {
      phase,
      confidence,
      positioning,
      stressIndex: stress.stressIndex,
      likelyNextPhase: this._predictNextPhase(phase),
      recommendation: this._getPhaseRecommendation(phase)
    };
  }

  _predictNextPhase(currentPhase) {
    const sequence = [
      'EARLY_EXPANSION', 'LATE_EXPANSION', 'PEAK_EUPHORIA',
      'CONTRACTION', 'TROUGH', 'EARLY_EXPANSION'
    ];
    const idx = sequence.indexOf(currentPhase);
    return sequence[(idx + 1) % (sequence.length - 1)];
  }

  _getPhaseRecommendation(phase) {
    const recommendations = {
      'EARLY_EXPANSION': 'Increase risk exposure - credit conditions supportive',
      'LATE_EXPANSION': 'Maintain exposure but watch for cycle peak signals',
      'PEAK_EUPHORIA': 'Reduce risk - credit cycle near peak',
      'CONTRACTION': 'Defensive positioning - preserve capital',
      'TROUGH': 'Begin rebuilding positions - worst may be behind'
    };
    return recommendations[phase];
  }

  /**
   * Get early warning signals
   * @returns {Object} Warning signals
   */
  getEarlyWarningSignals() {
    const metrics = this.getCurrentCreditMetrics();
    const warnings = [];
    const date = new Date().toISOString().split('T')[0];

    // Yield curve inversion
    if (metrics.yieldCurve.isInverted) {
      warnings.push({
        signal: 'YIELD_CURVE_INVERSION',
        severity: 'alert',
        leadTime: '12-18 months',
        currentReading: metrics.yieldCurve.spread10y2y,
        threshold: 0,
        description: 'Yield curve inverted - historically precedes recession'
      });
      this.stmtStoreWarning.run(date, 'YIELD_CURVE_INVERSION', 'alert',
        metrics.yieldCurve.spread10y2y, 0, '12-18 months');
    } else if (metrics.yieldCurve.spread10y2y < 0.25) {
      warnings.push({
        signal: 'YIELD_CURVE_FLATTENING',
        severity: 'warning',
        leadTime: '18-24 months',
        currentReading: metrics.yieldCurve.spread10y2y,
        threshold: 0.25,
        description: 'Yield curve very flat - watch for inversion'
      });
    }

    // Credit spreads widening
    if (metrics.spreads.baaAaa > 2.5) {
      warnings.push({
        signal: 'CREDIT_SPREADS_WIDENING',
        severity: 'alert',
        leadTime: '6-12 months',
        currentReading: metrics.spreads.baaAaa,
        threshold: 2.5,
        description: 'Credit spreads widening significantly'
      });
    } else if (metrics.spreads.baaAaa > 1.5) {
      warnings.push({
        signal: 'CREDIT_SPREADS_ELEVATED',
        severity: 'watch',
        leadTime: '12+ months',
        currentReading: metrics.spreads.baaAaa,
        threshold: 1.5,
        description: 'Credit spreads above normal'
      });
    }

    // Excessive credit growth
    if (metrics.creditGrowth.bankLendingGrowth > 0.12) {
      warnings.push({
        signal: 'EXCESSIVE_CREDIT_GROWTH',
        severity: 'warning',
        leadTime: '12-24 months',
        currentReading: metrics.creditGrowth.bankLendingGrowth,
        threshold: 0.12,
        description: 'Credit growth excessive - late cycle indicator'
      });
    }

    // Credit contraction
    if (metrics.creditGrowth.bankLendingGrowth < 0) {
      warnings.push({
        signal: 'CREDIT_CONTRACTION',
        severity: 'alert',
        leadTime: '3-6 months',
        currentReading: metrics.creditGrowth.bankLendingGrowth,
        threshold: 0,
        description: 'Credit contracting - recession likely'
      });
    }

    // Determine overall alert level
    let overallAlert = 'none';
    if (warnings.some(w => w.severity === 'alert')) overallAlert = 'red';
    else if (warnings.some(w => w.severity === 'warning')) overallAlert = 'orange';
    else if (warnings.some(w => w.severity === 'watch')) overallAlert = 'yellow';

    return {
      warnings,
      overallAlert,
      warningCount: warnings.length,
      recommendation: warnings.length > 0
        ? 'Review portfolio risk exposure'
        : 'No immediate concerns'
    };
  }

  /**
   * Get positioning recommendation based on credit conditions
   * @param {number} stressIndex - Current stress index
   * @param {string} cyclePhase - Current cycle phase
   * @returns {Object} Positioning guidance
   */
  getRiskPositioningRecommendation(stressIndex = null, cyclePhase = null) {
    if (!stressIndex) {
      const stress = this.calculateCreditStressIndex();
      stressIndex = stress.stressIndex;
    }

    if (!cyclePhase) {
      const phase = this.detectCreditCyclePhase();
      cyclePhase = phase.phase;
    }

    let exposureMultiplier = 1.0;
    let hedgeRecommendation = 'normal';
    const sectorTilts = {};

    // Stress-based adjustment
    if (stressIndex >= 60) {
      exposureMultiplier = 0.3;
      hedgeRecommendation = 'maximum';
      sectorTilts.defensives = 1.4;
      sectorTilts.cyclicals = 0.5;
      sectorTilts.financials = 0.4;
    } else if (stressIndex >= 45) {
      exposureMultiplier = 0.5;
      hedgeRecommendation = 'elevated';
      sectorTilts.defensives = 1.2;
      sectorTilts.cyclicals = 0.7;
      sectorTilts.financials = 0.6;
    } else if (stressIndex >= 30) {
      exposureMultiplier = 0.7;
      hedgeRecommendation = 'moderate';
      sectorTilts.defensives = 1.1;
      sectorTilts.cyclicals = 0.9;
      sectorTilts.financials = 0.8;
    } else {
      exposureMultiplier = 1.0;
      hedgeRecommendation = 'normal';
      sectorTilts.defensives = 1.0;
      sectorTilts.cyclicals = 1.1;
      sectorTilts.financials = 1.0;
    }

    return {
      exposureMultiplier,
      hedgeRecommendation,
      sectorTilts,
      stressIndex,
      cyclePhase,
      guidance: this._getDetailedGuidance(exposureMultiplier, hedgeRecommendation)
    };
  }

  _getDetailedGuidance(multiplier, hedge) {
    if (multiplier <= 0.3) {
      return 'Maximum defensive positioning. Reduce gross exposure significantly. Consider protective puts. Favor cash and short-term treasuries.';
    } else if (multiplier <= 0.5) {
      return 'Elevated caution warranted. Reduce cyclical exposure. Increase hedges. Raise cash levels.';
    } else if (multiplier <= 0.7) {
      return 'Moderate caution. Avoid adding to risk. Quality over quantity in new positions.';
    } else {
      return 'Normal credit conditions support risk-taking. Standard position sizing appropriate.';
    }
  }

  /**
   * Get credit stress level (convenience method for other services)
   * @returns {string} Stress level
   */
  getCreditStressLevel() {
    const latest = this.stmtGetLatestStress.get();
    return latest?.stress_level || 'unknown';
  }
}

function createCreditCycleMonitor(db) {
  return new CreditCycleMonitor(db);
}

module.exports = { CreditCycleMonitor, createCreditCycleMonitor };
