// src/services/hedging/tailHedgeManager.js
// Tail Hedging Overlay System - Spitznagel-inspired crash protection
// Provides systematic put buying and crash indicator monitoring

/**
 * TailHedgeManager - Crash protection overlay for portfolios
 *
 * Implements systematic tail hedging based on Mark Spitznagel's principles:
 * - Monitor crash indicators for early warning
 * - Size hedge budget based on risk level
 * - Recommend specific protective positions
 */
class TailHedgeManager {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._initializeTables();
    this._prepareStatements();
    console.log('🛡️ TailHedgeManager initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crash_indicators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shiller_cape REAL,
        cape_percentile REAL,
        credit_spread REAL,
        vix_spot REAL,
        vix_futures REAL,
        vix_term_structure TEXT,
        margin_debt REAL,
        insider_sell_buy_ratio REAL,
        overall_risk_level TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(date)
      );

      CREATE TABLE IF NOT EXISTS hedge_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument TEXT NOT NULL,
        position_type TEXT NOT NULL,
        strike REAL,
        expiry TEXT,
        quantity INTEGER,
        entry_price REAL,
        current_price REAL,
        entry_date TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS hedge_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument TEXT NOT NULL,
        position_type TEXT NOT NULL,
        entry_date TEXT,
        exit_date TEXT,
        entry_price REAL,
        exit_price REAL,
        quantity INTEGER,
        pnl REAL,
        pnl_percent REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtGetVix = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'VIX' OR c.symbol = '^VIX'
      ORDER BY date DESC
      LIMIT 30
    `);

    this.stmtGetInsiderRatio = this.db.prepare(`
      SELECT
        SUM(CASE WHEN transaction_code IN ('P', 'A') THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN transaction_code IN ('S', 'D') THEN 1 ELSE 0 END) as sells
      FROM insider_transactions
      WHERE filing_date >= date('now', '-30 days')
    `);

    this.stmtStoreCrashIndicators = this.db.prepare(`
      INSERT OR REPLACE INTO crash_indicators (
        date, shiller_cape, cape_percentile, credit_spread,
        vix_spot, vix_futures, vix_term_structure,
        margin_debt, insider_sell_buy_ratio, overall_risk_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetLatestIndicators = this.db.prepare(`
      SELECT * FROM crash_indicators
      ORDER BY date DESC
      LIMIT 1
    `);

    this.stmtStoreHedgePosition = this.db.prepare(`
      INSERT INTO hedge_positions (
        instrument, position_type, strike, expiry, quantity,
        entry_price, current_price, entry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    this.stmtGetActiveHedges = this.db.prepare(`
      SELECT * FROM hedge_positions WHERE status = 'active'
    `);
  }

  /**
   * Get current crash indicator readings
   * @returns {Object} Crash indicator dashboard
   */
  getCrashIndicators() {
    const indicators = {
      shillerCAPE: this._getShillerCAPE(),
      creditSpreads: this._getCreditSpreads(),
      vixTermStructure: this._getVixTermStructure(),
      marginDebt: this._getMarginDebt(),
      insiderRatio: this._getInsiderRatio()
    };

    // Calculate overall risk level
    let riskScore = 0;
    let triggeredIndicators = [];

    // CAPE > 95th percentile
    if (indicators.shillerCAPE.percentile > 95) {
      riskScore += 2;
      triggeredIndicators.push('Elevated CAPE');
    } else if (indicators.shillerCAPE.percentile > 85) {
      riskScore += 1;
    }

    // Credit spreads widening
    if (indicators.creditSpreads.signal === 'warning') {
      riskScore += 2;
      triggeredIndicators.push('Credit spread warning');
    } else if (indicators.creditSpreads.signal === 'elevated') {
      riskScore += 1;
    }

    // VIX term structure inverted
    if (indicators.vixTermStructure.signal === 'fear') {
      riskScore += 2;
      triggeredIndicators.push('VIX inversion');
    }

    // High margin debt
    if (indicators.marginDebt.signal === 'elevated') {
      riskScore += 1;
      triggeredIndicators.push('High margin debt');
    }

    // Insider selling wave
    if (indicators.insiderRatio.signal === 'distribution') {
      riskScore += 2;
      triggeredIndicators.push('Insider selling');
    }

    let overallRisk = 'NORMAL';
    if (riskScore >= 6) overallRisk = 'HIGH_ALERT';
    else if (riskScore >= 4) overallRisk = 'ELEVATED';
    else if (riskScore >= 2) overallRisk = 'CAUTIOUS';

    const result = {
      ...indicators,
      overallRiskLevel: overallRisk,
      riskScore,
      triggeredIndicators,
      timestamp: new Date().toISOString()
    };

    // Store indicators
    this._storeIndicators(result);

    return result;
  }

  _getShillerCAPE() {
    // Approximate CAPE calculation from P/E data
    // In production, would fetch from FRED or calculate from earnings
    const avgPE = this.db.prepare(`
      SELECT AVG(pe_ratio) as avg_pe
      FROM calculated_metrics
      WHERE pe_ratio > 0 AND pe_ratio < 200
    `).get();

    const pe = avgPE?.avg_pe || 20;

    // Historical CAPE percentiles (approximate)
    // Mean ~17, current elevated markets often 25-35
    let percentile = 50;
    if (pe > 35) percentile = 98;
    else if (pe > 30) percentile = 95;
    else if (pe > 25) percentile = 85;
    else if (pe > 20) percentile = 70;
    else if (pe > 15) percentile = 40;
    else percentile = 20;

    return {
      value: pe,
      percentile,
      signal: percentile > 90 ? 'extreme' : percentile > 80 ? 'elevated' : 'normal'
    };
  }

  _getCreditSpreads() {
    // Would fetch BAA-AAA spread from FRED in production
    // Using proxy based on market conditions
    const vixData = this.stmtGetVix.all();
    const currentVix = vixData[0]?.price || 15;

    // VIX as proxy for credit conditions
    // VIX 15-20 = normal, 20-30 = elevated, >30 = stress
    const impliedSpread = currentVix * 0.05; // Rough conversion

    let signal = 'normal';
    if (impliedSpread > 2) signal = 'warning';
    else if (impliedSpread > 1.5) signal = 'elevated';

    return {
      baaAaa: impliedSpread,
      value: impliedSpread,
      signal
    };
  }

  _getVixTermStructure() {
    const vixData = this.stmtGetVix.all();

    if (vixData.length < 2) {
      return { spot: 15, futures: 16, contango: true, signal: 'normal' };
    }

    const spot = vixData[0]?.price || 15;
    // Approximate futures as slightly higher in normal markets
    const futures = spot * 1.05;
    const contango = futures > spot;

    return {
      spot,
      futures,
      contango,
      signal: !contango ? 'fear' : spot > 25 ? 'elevated' : 'normal'
    };
  }

  _getMarginDebt() {
    // Proxy using market cap changes and volume
    // In production, would use FINRA margin statistics
    return {
      value: null,
      gdpRatio: null,
      signal: 'normal' // Would need real data
    };
  }

  _getInsiderRatio() {
    const data = this.stmtGetInsiderRatio.get();
    const buys = data?.buys || 1;
    const sells = data?.sells || 1;
    const ratio = sells / Math.max(buys, 1);

    let signal = 'neutral';
    if (ratio > 5) signal = 'distribution';
    else if (ratio > 3) signal = 'selling';
    else if (ratio < 0.5) signal = 'accumulation';

    return {
      sellBuyRatio: ratio,
      buys,
      sells,
      signal
    };
  }

  _storeIndicators(indicators) {
    const date = new Date().toISOString().split('T')[0];
    try {
      this.stmtStoreCrashIndicators.run(
        date,
        indicators.shillerCAPE.value,
        indicators.shillerCAPE.percentile,
        indicators.creditSpreads.value,
        indicators.vixTermStructure.spot,
        indicators.vixTermStructure.futures,
        indicators.vixTermStructure.contango ? 'contango' : 'backwardation',
        indicators.marginDebt.value,
        indicators.insiderRatio.sellBuyRatio,
        indicators.overallRiskLevel
      );
    } catch (e) {
      // Ignore duplicate date errors
    }
  }

  /**
   * Calculate hedge budget based on portfolio value and risk level
   * @param {number} portfolioValue - Total portfolio value
   * @param {string} riskLevel - NORMAL, CAUTIOUS, ELEVATED, HIGH_ALERT
   * @returns {Object} Hedge budget allocation
   */
  calculateHedgeBudget(portfolioValue, riskLevel = null) {
    if (!riskLevel) {
      const indicators = this.getCrashIndicators();
      riskLevel = indicators.overallRiskLevel;
    }

    const budgets = {
      'NORMAL': 0.003,      // 0.3% monthly (3.6% annual)
      'CAUTIOUS': 0.004,    // 0.4% monthly (4.8% annual)
      'ELEVATED': 0.005,    // 0.5% monthly (6% annual)
      'HIGH_ALERT': 0.010   // 1.0% monthly (12% annual)
    };

    const monthlyRate = budgets[riskLevel] || budgets['NORMAL'];
    const monthlyBudget = portfolioValue * monthlyRate;
    const annualBudget = portfolioValue * monthlyRate * 12;

    return {
      riskLevel,
      monthlyBudget,
      annualBudget,
      monthlyRate: monthlyRate * 100,
      annualRate: monthlyRate * 12 * 100,
      hedgeAllocation: {
        spyPuts: monthlyBudget * 0.70,      // 70% to SPY puts
        vixCalls: monthlyBudget * 0.20,     // 20% to VIX calls
        reserve: monthlyBudget * 0.10       // 10% reserve
      }
    };
  }

  /**
   * Get specific hedge recommendations
   * @param {number} portfolioValue - Portfolio value
   * @param {Array} currentHedges - Existing hedge positions
   * @returns {Array} Recommended hedges
   */
  getHedgeRecommendations(portfolioValue, currentHedges = []) {
    const indicators = this.getCrashIndicators();
    const budget = this.calculateHedgeBudget(portfolioValue, indicators.overallRiskLevel);

    // Get current SPY price (approximate)
    const spyPrice = this.db.prepare(`
      SELECT close as price FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'SPY'
      ORDER BY date DESC LIMIT 1
    `).get()?.price || 450;

    const recommendations = [];

    // SPY Put recommendation
    // 3-month expiry, 20-30% OTM
    const putStrike = Math.round(spyPrice * 0.75); // 25% OTM
    const putExpiry = this._getExpiryDate(90); // ~3 months
    const putPremium = spyPrice * 0.015; // Approximate 1.5% premium for 25% OTM put
    const putQuantity = Math.floor(budget.hedgeAllocation.spyPuts / (putPremium * 100));

    if (putQuantity > 0) {
      recommendations.push({
        instrument: 'SPY',
        type: 'put',
        strike: putStrike,
        expiry: putExpiry,
        quantity: putQuantity,
        estimatedCost: putQuantity * putPremium * 100,
        otmPercent: 25,
        expectedPayoffAt20Drop: putQuantity * (spyPrice * 0.80 - putStrike) * 100,
        expectedPayoffAt35Drop: putQuantity * Math.max(0, putStrike - spyPrice * 0.65) * 100,
        rationale: 'Core crash protection - pays off in significant market decline'
      });
    }

    // VIX Call recommendation (if elevated risk)
    if (indicators.overallRiskLevel !== 'NORMAL') {
      const vixPrice = indicators.vixTermStructure.spot;
      const vixCallStrike = Math.round(vixPrice * 1.5); // 50% OTM
      const vixCallPremium = vixPrice * 0.10; // Approximate
      const vixCallQuantity = Math.floor(budget.hedgeAllocation.vixCalls / (vixCallPremium * 100));

      if (vixCallQuantity > 0) {
        recommendations.push({
          instrument: 'VIX',
          type: 'call',
          strike: vixCallStrike,
          expiry: this._getExpiryDate(30),
          quantity: vixCallQuantity,
          estimatedCost: vixCallQuantity * vixCallPremium * 100,
          otmPercent: 50,
          expectedPayoffAtVix50: vixCallQuantity * (50 - vixCallStrike) * 100,
          rationale: 'Volatility spike protection - pays off when fear spikes'
        });
      }
    }

    return {
      recommendations,
      totalCost: recommendations.reduce((sum, r) => sum + r.estimatedCost, 0),
      budget,
      indicators: indicators.overallRiskLevel,
      currentHedgeValue: this._calculateCurrentHedgeValue(currentHedges)
    };
  }

  _getExpiryDate(daysOut) {
    const date = new Date();
    date.setDate(date.getDate() + daysOut);
    // Find third Friday (standard options expiry)
    const month = date.getMonth();
    const year = date.getFullYear();
    const firstDay = new Date(year, month, 1);
    const firstFriday = 1 + ((5 - firstDay.getDay() + 7) % 7);
    const thirdFriday = firstFriday + 14;
    return new Date(year, month, thirdFriday).toISOString().split('T')[0];
  }

  _calculateCurrentHedgeValue(hedges) {
    return hedges.reduce((sum, h) => sum + (h.quantity * h.current_price * 100), 0);
  }

  /**
   * Calculate portfolio protection in various crash scenarios
   * @param {Array} hedges - Current hedge positions
   * @param {number} portfolioValue - Portfolio value
   * @returns {Object} Protection analysis
   */
  calculatePortfolioProtection(hedges, portfolioValue) {
    const scenarios = [
      { name: '10% Correction', drop: 0.10, vixSpike: 25 },
      { name: '20% Bear Market', drop: 0.20, vixSpike: 35 },
      { name: '35% Crash (COVID)', drop: 0.35, vixSpike: 65 },
      { name: '50% Crisis (2008)', drop: 0.50, vixSpike: 80 }
    ];

    const spyPrice = this.db.prepare(`
      SELECT close as price FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'SPY'
      ORDER BY date DESC LIMIT 1
    `).get()?.price || 450;

    return scenarios.map(scenario => {
      const unhedgedLoss = portfolioValue * scenario.drop;

      let hedgePayoff = 0;
      for (const hedge of hedges) {
        if (hedge.instrument === 'SPY' && hedge.position_type === 'put') {
          const newSpyPrice = spyPrice * (1 - scenario.drop);
          const intrinsicValue = Math.max(0, hedge.strike - newSpyPrice);
          hedgePayoff += intrinsicValue * hedge.quantity * 100;
        } else if (hedge.instrument === 'VIX' && hedge.position_type === 'call') {
          const intrinsicValue = Math.max(0, scenario.vixSpike - hedge.strike);
          hedgePayoff += intrinsicValue * hedge.quantity * 100;
        }
      }

      const netLoss = unhedgedLoss - hedgePayoff;
      const protection = hedgePayoff / unhedgedLoss;

      return {
        scenario: scenario.name,
        marketDrop: `${scenario.drop * 100}%`,
        unhedgedLoss: unhedgedLoss.toFixed(0),
        hedgePayoff: hedgePayoff.toFixed(0),
        netLoss: netLoss.toFixed(0),
        protectionPercent: (protection * 100).toFixed(1),
        effectiveDrawdown: ((netLoss / portfolioValue) * 100).toFixed(1)
      };
    });
  }

  /**
   * Store a new hedge position
   * @param {Object} hedge - Hedge position details
   */
  storeHedgePosition(hedge) {
    this.stmtStoreHedgePosition.run(
      hedge.instrument,
      hedge.type,
      hedge.strike,
      hedge.expiry,
      hedge.quantity,
      hedge.price,
      hedge.price,
      new Date().toISOString().split('T')[0]
    );
  }

  /**
   * Get all active hedge positions
   * @returns {Array} Active hedges
   */
  getActiveHedges() {
    return this.stmtGetActiveHedges.all();
  }

  /**
   * Get exposure adjustment multiplier based on crash indicators
   * @returns {Object} Exposure recommendation
   */
  getExposureAdjustment() {
    const indicators = this.getCrashIndicators();

    const multipliers = {
      'NORMAL': 1.0,
      'CAUTIOUS': 0.85,
      'ELEVATED': 0.70,
      'HIGH_ALERT': 0.50
    };

    return {
      multiplier: multipliers[indicators.overallRiskLevel],
      riskLevel: indicators.overallRiskLevel,
      reasoning: indicators.triggeredIndicators.join(', ') || 'No elevated indicators',
      recommendation: indicators.overallRiskLevel === 'HIGH_ALERT'
        ? 'Reduce gross exposure and increase hedges'
        : indicators.overallRiskLevel === 'ELEVATED'
        ? 'Consider reducing position sizes'
        : 'Normal positioning appropriate'
    };
  }
}

/**
 * Factory function to create TailHedgeManager
 * @param {Database} db - Database instance
 * @returns {TailHedgeManager}
 */
function createTailHedgeManager(db) {
  return new TailHedgeManager(db);
}

module.exports = { TailHedgeManager, createTailHedgeManager };
