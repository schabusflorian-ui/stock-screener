// src/services/macro/economicRegime.js
// Economic Regime Detector - Dalio All Weather inspired
// Classifies economic environment by growth/inflation dynamics

/**
 * EconomicRegimeDetector - Growth/Inflation regime classification
 *
 * Implements Ray Dalio's four-quadrant economic environment framework:
 * - Rising Growth + Rising Inflation (Reflation)
 * - Rising Growth + Falling Inflation (Goldilocks)
 * - Falling Growth + Rising Inflation (Stagflation)
 * - Falling Growth + Falling Inflation (Deflation)
 */
class EconomicRegimeDetector {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._initializeTables();
    this._prepareStatements();
    console.log('🌍 EconomicRegimeDetector initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS economic_regimes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        regime TEXT NOT NULL,
        confidence REAL,
        pmi REAL,
        industrial_production_yoy REAL,
        employment_growth REAL,
        cpi_yoy REAL,
        core_cpi_yoy REAL,
        breakeven_inflation REAL,
        growth_direction TEXT,
        inflation_direction TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS regime_sector_multipliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime TEXT NOT NULL,
        sector TEXT NOT NULL,
        multiplier REAL NOT NULL,
        reasoning TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(regime, sector)
      );
    `);
    // Note: We use the existing economic_indicators table which has observation_date, series_id columns

    // Initialize default sector multipliers
    this._initializeSectorMultipliers();
  }

  _initializeSectorMultipliers() {
    const multipliers = [
      // REFLATION (Rising Growth + Rising Inflation)
      { regime: 'REFLATION', sector: 'Energy', multiplier: 1.3, reasoning: 'Commodity demand strong' },
      { regime: 'REFLATION', sector: 'Materials', multiplier: 1.3, reasoning: 'Industrial demand, inflation hedge' },
      { regime: 'REFLATION', sector: 'Financials', multiplier: 1.2, reasoning: 'Rising rates benefit banks' },
      { regime: 'REFLATION', sector: 'Industrials', multiplier: 1.1, reasoning: 'Economic growth exposure' },
      { regime: 'REFLATION', sector: 'Technology', multiplier: 0.9, reasoning: 'Rate sensitivity' },
      { regime: 'REFLATION', sector: 'Utilities', multiplier: 0.8, reasoning: 'Bond proxy underperforms' },
      { regime: 'REFLATION', sector: 'Consumer Staples', multiplier: 0.8, reasoning: 'Defensive underperforms' },

      // GOLDILOCKS (Rising Growth + Falling Inflation)
      { regime: 'GOLDILOCKS', sector: 'Technology', multiplier: 1.3, reasoning: 'Growth premium, low rates' },
      { regime: 'GOLDILOCKS', sector: 'Consumer Discretionary', multiplier: 1.2, reasoning: 'Consumer strength' },
      { regime: 'GOLDILOCKS', sector: 'Communication Services', multiplier: 1.2, reasoning: 'Growth exposure' },
      { regime: 'GOLDILOCKS', sector: 'Financials', multiplier: 1.1, reasoning: 'Credit growth' },
      { regime: 'GOLDILOCKS', sector: 'Energy', multiplier: 0.9, reasoning: 'Low inflation, moderate demand' },
      { regime: 'GOLDILOCKS', sector: 'Utilities', multiplier: 0.8, reasoning: 'Defensive underperforms' },

      // STAGFLATION (Falling Growth + Rising Inflation)
      { regime: 'STAGFLATION', sector: 'Energy', multiplier: 1.3, reasoning: 'Inflation hedge, supply constraints' },
      { regime: 'STAGFLATION', sector: 'Utilities', multiplier: 1.2, reasoning: 'Defensive, regulated pricing' },
      { regime: 'STAGFLATION', sector: 'Healthcare', multiplier: 1.2, reasoning: 'Defensive, inelastic demand' },
      { regime: 'STAGFLATION', sector: 'Consumer Staples', multiplier: 1.2, reasoning: 'Defensive, pricing power' },
      { regime: 'STAGFLATION', sector: 'Technology', multiplier: 0.7, reasoning: 'Growth challenged, rate sensitive' },
      { regime: 'STAGFLATION', sector: 'Consumer Discretionary', multiplier: 0.7, reasoning: 'Demand destruction' },
      { regime: 'STAGFLATION', sector: 'Financials', multiplier: 0.7, reasoning: 'Credit losses, margin pressure' },

      // DEFLATION (Falling Growth + Falling Inflation)
      { regime: 'DEFLATION', sector: 'Utilities', multiplier: 1.3, reasoning: 'Bond proxy, stable cash flows' },
      { regime: 'DEFLATION', sector: 'Healthcare', multiplier: 1.2, reasoning: 'Defensive, inelastic demand' },
      { regime: 'DEFLATION', sector: 'Consumer Staples', multiplier: 1.2, reasoning: 'Defensive positioning' },
      { regime: 'DEFLATION', sector: 'Technology', multiplier: 1.0, reasoning: 'Quality growth holds up' },
      { regime: 'DEFLATION', sector: 'Energy', multiplier: 0.7, reasoning: 'Demand collapse' },
      { regime: 'DEFLATION', sector: 'Materials', multiplier: 0.7, reasoning: 'Industrial weakness' },
      { regime: 'DEFLATION', sector: 'Financials', multiplier: 0.8, reasoning: 'Low rates, credit stress' }
    ];

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO regime_sector_multipliers (regime, sector, multiplier, reasoning)
      VALUES (?, ?, ?, ?)
    `);

    for (const m of multipliers) {
      stmt.run(m.regime, m.sector, m.multiplier, m.reasoning);
    }
  }

  _prepareStatements() {
    this.stmtStoreRegime = this.db.prepare(`
      INSERT OR REPLACE INTO economic_regimes (
        date, regime, confidence, pmi, industrial_production_yoy,
        employment_growth, cpi_yoy, core_cpi_yoy, breakeven_inflation,
        growth_direction, inflation_direction
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetLatestRegime = this.db.prepare(`
      SELECT * FROM economic_regimes ORDER BY date DESC LIMIT 1
    `);

    this.stmtGetSectorMultipliers = this.db.prepare(`
      SELECT sector, multiplier, reasoning
      FROM regime_sector_multipliers
      WHERE regime = ?
    `);

    this.stmtGetRegimeHistory = this.db.prepare(`
      SELECT * FROM economic_regimes
      WHERE date BETWEEN ? AND ?
      ORDER BY date ASC
    `);

    // Note: economic_indicators table has schema with observation_date, series_id
    // We use market data as proxies, so no need to store additional indicators
    this.stmtGetIndicator = this.db.prepare(`
      SELECT value, observation_date, change_1y, change_1m
      FROM economic_indicators
      WHERE series_id = ?
      ORDER BY observation_date DESC
      LIMIT 1
    `);
  }

  /**
   * Get current economic data
   * Uses available market data as proxies when FRED data unavailable
   * @returns {Object} Economic indicators
   */
  getCurrentEconomicData() {
    // Use market-based proxies since we may not have real-time FRED data
    const growth = this._getGrowthIndicators();
    const inflation = this._getInflationIndicators();

    return { growth, inflation };
  }

  _getGrowthIndicators() {
    // Use market data as proxy for economic growth
    // SPY performance, volume trends, breadth

    const spyData = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'SPY'
      ORDER BY date DESC
      LIMIT 252
    `).all();

    if (spyData.length < 60) {
      return {
        pmi: 50, // Neutral
        industrialProductionYoY: 0,
        employmentGrowth: 0,
        growthMomentum: 'neutral',
        direction: 'stable'
      };
    }

    // Calculate 3-month momentum as growth proxy
    const current = spyData[0].price;
    const threeMonthsAgo = spyData[63]?.price || current;
    const oneYearAgo = spyData[252]?.price || current;

    const momentum3M = (current - threeMonthsAgo) / threeMonthsAgo;
    const momentum1Y = (current - oneYearAgo) / oneYearAgo;

    // Estimate PMI based on market performance
    // Strong market = expanding economy
    const estimatedPMI = 50 + momentum3M * 100; // Scale momentum to PMI range

    const direction = momentum3M > 0.03 ? 'rising' :
                     momentum3M < -0.03 ? 'falling' : 'stable';

    return {
      pmi: Math.max(35, Math.min(65, estimatedPMI)),
      industrialProductionYoY: momentum1Y * 100,
      employmentGrowth: momentum3M * 50, // Scaled proxy
      growthMomentum: momentum3M > 0 ? 'positive' : 'negative',
      direction
    };
  }

  _getInflationIndicators() {
    // Use TIPS/treasury spread as inflation proxy if available
    // Otherwise use commodity price changes

    // Try to get inflation expectations from treasury data
    const vixData = this.db.prepare(`
      SELECT close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = 'VIX' OR c.symbol = '^VIX'
      ORDER BY date DESC
      LIMIT 252
    `).all();

    // Use energy sector as inflation proxy
    const energyPerf = this.db.prepare(`
      SELECT AVG(
        (dp1.close - dp2.close) / dp2.close
      ) as perf
      FROM daily_prices dp1
      JOIN daily_prices dp2 ON dp1.company_id = dp2.company_id
      JOIN companies c ON c.id = dp1.company_id
      WHERE c.sector = 'Energy'
        AND dp1.date = (SELECT MAX(date) FROM daily_prices)
        AND dp2.date = date(dp1.date, '-63 days')
    `).get();

    const energyMomentum = energyPerf?.perf || 0;

    // Higher energy prices suggest inflation
    const estimatedCPI = 2.5 + energyMomentum * 20; // Base 2.5% + energy contribution

    const direction = energyMomentum > 0.1 ? 'rising' :
                     energyMomentum < -0.1 ? 'falling' : 'stable';

    return {
      cpiYoY: Math.max(0, Math.min(10, estimatedCPI)),
      coreCpiYoY: estimatedCPI * 0.8, // Core slightly lower
      breakevenInflation: estimatedCPI,
      inflationMomentum: energyMomentum > 0 ? 'positive' : 'negative',
      direction
    };
  }

  /**
   * Classify current economic regime
   * @param {Object} economicData - Optional data (fetches if not provided)
   * @returns {Object} Regime classification
   */
  classifyRegime(economicData = null) {
    const data = economicData || this.getCurrentEconomicData();
    const { growth, inflation } = data;

    const isGrowthRising = growth.direction === 'rising' || growth.pmi > 52;
    const isGrowthFalling = growth.direction === 'falling' || growth.pmi < 48;
    const isInflationRising = inflation.direction === 'rising' || inflation.cpiYoY > 3;
    const isInflationFalling = inflation.direction === 'falling' || inflation.cpiYoY < 2;

    let regime = 'GOLDILOCKS';
    let confidence = 0.6;

    if (isGrowthRising && isInflationRising) {
      regime = 'REFLATION';
      confidence = 0.7;
    } else if (isGrowthRising && isInflationFalling) {
      regime = 'GOLDILOCKS';
      confidence = 0.75;
    } else if (isGrowthFalling && isInflationRising) {
      regime = 'STAGFLATION';
      confidence = 0.7;
    } else if (isGrowthFalling && isInflationFalling) {
      regime = 'DEFLATION';
      confidence = 0.7;
    } else if (isGrowthRising) {
      regime = 'GOLDILOCKS';
      confidence = 0.6;
    } else if (isGrowthFalling) {
      regime = 'DEFLATION';
      confidence = 0.55;
    }

    const result = {
      regime,
      confidence,
      indicators: {
        growth,
        inflation
      },
      growthDirection: growth.direction,
      inflationDirection: inflation.direction
    };

    // Store regime
    const date = new Date().toISOString().split('T')[0];
    this.stmtStoreRegime.run(
      date, regime, confidence,
      growth.pmi, growth.industrialProductionYoY, growth.employmentGrowth,
      inflation.cpiYoY, inflation.coreCpiYoY, inflation.breakevenInflation,
      growth.direction, inflation.direction
    );

    return result;
  }

  /**
   * Get sector multipliers for current regime
   * @param {string} regime - Optional regime (fetches current if not provided)
   * @returns {Object} Sector multipliers
   */
  getSectorMultipliers(regime = null) {
    if (!regime) {
      const current = this.classifyRegime();
      regime = current.regime;
    }

    const multipliers = this.stmtGetSectorMultipliers.all(regime);
    const result = {
      regime,
      sectorMultipliers: {},
      reasoning: {}
    };

    for (const m of multipliers) {
      result.sectorMultipliers[m.sector] = m.multiplier;
      result.reasoning[m.sector] = m.reasoning;
    }

    return result;
  }

  /**
   * Get overall position size multiplier based on regime
   * @param {string} regime - Optional regime
   * @returns {Object} Position sizing guidance
   */
  getPositionSizeMultiplier(regime = null) {
    if (!regime) {
      const current = this.classifyRegime();
      regime = current.regime;
    }

    const multipliers = {
      'GOLDILOCKS': 1.1,   // Risk on
      'REFLATION': 1.0,    // Neutral, inflation aware
      'STAGFLATION': 0.7,  // Defensive
      'DEFLATION': 0.6     // Very defensive
    };

    const recommendations = {
      'GOLDILOCKS': 'Favorable conditions - maintain full exposure to risk assets',
      'REFLATION': 'Growth strong but watch inflation - favor value, commodities',
      'STAGFLATION': 'Reduce exposure - favor defensives, commodities, cash',
      'DEFLATION': 'Defensive positioning - favor quality, bonds, utilities'
    };

    return {
      regime,
      multiplier: multipliers[regime] || 1.0,
      recommendation: recommendations[regime],
      riskLevel: regime === 'GOLDILOCKS' ? 'low' :
                 regime === 'REFLATION' ? 'moderate' :
                 regime === 'STAGFLATION' ? 'high' : 'elevated'
    };
  }

  /**
   * Analyze regime transition
   * @param {string} currentRegime - Current regime
   * @param {string} previousRegime - Previous regime
   * @returns {Object} Transition analysis
   */
  analyzeRegimeTransition(currentRegime, previousRegime) {
    if (!previousRegime || currentRegime === previousRegime) {
      return {
        isTransitioning: false,
        transitionDirection: 'stable',
        urgency: 'none',
        recommendations: []
      };
    }

    const riskOffTransitions = [
      { from: 'GOLDILOCKS', to: 'STAGFLATION' },
      { from: 'GOLDILOCKS', to: 'DEFLATION' },
      { from: 'REFLATION', to: 'STAGFLATION' },
      { from: 'REFLATION', to: 'DEFLATION' }
    ];

    const riskOnTransitions = [
      { from: 'DEFLATION', to: 'GOLDILOCKS' },
      { from: 'STAGFLATION', to: 'GOLDILOCKS' },
      { from: 'STAGFLATION', to: 'REFLATION' },
      { from: 'DEFLATION', to: 'REFLATION' }
    ];

    const isRiskOff = riskOffTransitions.some(t =>
      t.from === previousRegime && t.to === currentRegime
    );
    const isRiskOn = riskOnTransitions.some(t =>
      t.from === previousRegime && t.to === currentRegime
    );

    const recommendations = [];

    if (isRiskOff) {
      recommendations.push('Reduce equity exposure');
      recommendations.push('Increase defensive sector allocation');
      recommendations.push('Consider adding tail hedges');
      if (currentRegime === 'STAGFLATION') {
        recommendations.push('Add inflation protection (TIPS, commodities)');
      }
    } else if (isRiskOn) {
      recommendations.push('Gradually increase equity exposure');
      recommendations.push('Rotate to cyclical sectors');
      recommendations.push('Reduce defensive positioning');
    }

    return {
      isTransitioning: true,
      from: previousRegime,
      to: currentRegime,
      transitionDirection: isRiskOff ? 'risk_off' : isRiskOn ? 'risk_on' : 'neutral',
      urgency: isRiskOff ? 'immediate' : 'gradual',
      recommendations
    };
  }

  /**
   * Get regime history for backtesting
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Array} Historical regimes
   */
  getRegimeHistory(startDate, endDate) {
    return this.stmtGetRegimeHistory.all(startDate, endDate);
  }

  /**
   * Get latest stored regime
   * @returns {Object} Latest regime
   */
  getLatestRegime() {
    return this.stmtGetLatestRegime.get();
  }
}

function createEconomicRegimeDetector(db) {
  return new EconomicRegimeDetector(db);
}

module.exports = { EconomicRegimeDetector, createEconomicRegimeDetector };
