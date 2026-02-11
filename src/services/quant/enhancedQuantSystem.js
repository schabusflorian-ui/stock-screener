// src/services/quant/enhancedQuantSystem.js
// Enhanced Quant Trading System - Integration of all council recommendations
// Orchestrates tail hedging, factor attribution, regime detection, and more

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
const { TailHedgeManager } = require('../hedging/tailHedgeManager');
const { FactorAttribution } = require('../factors/factorAttribution');
const { PredictionIntervalCalculator } = require('../statistics/predictionIntervals');
const { SignalDecorrelator } = require('../ml/signalDecorrelation');
const { CorrelationManager } = require('../portfolio/correlationManager');
const { EconomicRegimeDetector } = require('../macro/economicRegime');
const { PairsTradingEngine } = require('../arbitrage/pairsTrading');
const { MoatScorer } = require('../valuation/moatScoring');
const { CreditCycleMonitor } = require('../macro/creditCycleIndicators');

/**
 * EnhancedQuantSystem - Master orchestration of all quant improvements
 *
 * Integrates recommendations from the investor council:
 * - Spitznagel: Tail hedging, credit cycle monitoring
 * - Asness: Factor attribution, proper momentum
 * - Derman: Prediction intervals, signal decorrelation
 * - Dalio: Economic regime overlay
 * - Simons: Correlation management, pairs trading, diversification
 * - Buffett: Moat scoring, quality focus
 */
class EnhancedQuantSystem {
  constructor(db = null) {
    this.db = db;

    // Initialize all subsystems (pass db to those that need it)
    console.log('\n🚀 Initializing Enhanced Quant System...\n');

    this.tailHedge = new TailHedgeManager();
    this.factorAttribution = new FactorAttribution();
    this.predictionIntervals = new PredictionIntervalCalculator();
    this.signalDecorrelator = new SignalDecorrelator(db);
    this.correlationManager = new CorrelationManager();
    this.economicRegime = new EconomicRegimeDetector(db);
    this.pairsTrading = new PairsTradingEngine();
    this.moatScorer = new MoatScorer(db);
    this.creditCycle = new CreditCycleMonitor(db);

    console.log('\n✅ All subsystems initialized\n');
  }

  /**
   * Get comprehensive market assessment
   * @returns {Object} Full market analysis
   */
  getMarketAssessment() {
    // Crash indicators
    const crashIndicators = this.tailHedge.getCrashIndicators();

    // Economic regime
    const economicRegime = this.economicRegime.classifyRegime();

    // Credit cycle
    const creditStress = this.creditCycle.calculateCreditStressIndex();
    const creditPhase = this.creditCycle.detectCreditCyclePhase();
    const creditWarnings = this.creditCycle.getEarlyWarningSignals();

    // Combine for overall assessment
    let overallRisk = 'normal';
    let exposureMultiplier = 1.0;

    // Aggregate risk signals
    const riskSignals = [];

    if (crashIndicators.overallRiskLevel === 'HIGH_ALERT') {
      riskSignals.push({ source: 'crash_indicators', level: 'high' });
    }
    if (economicRegime.regime === 'STAGFLATION' || economicRegime.regime === 'DEFLATION') {
      riskSignals.push({ source: 'economic_regime', level: 'elevated' });
    }
    if (creditStress.stressLevel === 'high' || creditStress.stressLevel === 'extreme') {
      riskSignals.push({ source: 'credit_stress', level: 'high' });
    }
    if (creditWarnings.overallAlert === 'red') {
      riskSignals.push({ source: 'credit_warnings', level: 'high' });
    }

    // Set overall risk and exposure
    const highRiskCount = riskSignals.filter(s => s.level === 'high').length;
    const elevatedCount = riskSignals.filter(s => s.level === 'elevated').length;

    if (highRiskCount >= 2) {
      overallRisk = 'extreme';
      exposureMultiplier = 0.3;
    } else if (highRiskCount >= 1) {
      overallRisk = 'high';
      exposureMultiplier = 0.5;
    } else if (elevatedCount >= 2) {
      overallRisk = 'elevated';
      exposureMultiplier = 0.7;
    } else if (elevatedCount >= 1 || riskSignals.length > 0) {
      overallRisk = 'cautious';
      exposureMultiplier = 0.85;
    }

    return {
      timestamp: new Date().toISOString(),
      overallRisk,
      exposureMultiplier,
      riskSignals,
      crashIndicators,
      economicRegime,
      creditCycle: {
        stress: creditStress,
        phase: creditPhase,
        warnings: creditWarnings
      },
      recommendations: this._generateMarketRecommendations(overallRisk, economicRegime, creditPhase)
    };
  }

  _generateMarketRecommendations(overallRisk, regime, creditPhase) {
    const recommendations = [];

    if (overallRisk === 'extreme') {
      recommendations.push('Reduce gross exposure to minimum');
      recommendations.push('Maximum tail hedge allocation');
      recommendations.push('Favor cash and short-term treasuries');
    } else if (overallRisk === 'high') {
      recommendations.push('Reduce equity exposure by 50%');
      recommendations.push('Increase tail hedges');
      recommendations.push('Rotate to defensive sectors');
    } else if (overallRisk === 'elevated') {
      recommendations.push('Reduce cyclical exposure');
      recommendations.push('Add protective positions');
      recommendations.push('Quality over quantity');
    }

    // Regime-specific
    if (regime.regime === 'STAGFLATION') {
      recommendations.push('Favor energy, utilities, staples');
      recommendations.push('Avoid technology, discretionary');
    } else if (regime.regime === 'DEFLATION') {
      recommendations.push('Favor quality and low volatility');
      recommendations.push('Consider long-duration bonds');
    } else if (regime.regime === 'REFLATION') {
      recommendations.push('Favor commodities and financials');
    }

    return recommendations;
  }

  /**
   * Analyze a stock with all enhancements
   * @param {string} symbol - Stock symbol
   * @returns {Object} Enhanced analysis
   */
  async analyzeStock(symbol) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);

    const company = result.rows[0];
    if (!company) return { error: 'Company not found' };

    // Moat score
    const moatScore = this.moatScorer.calculateMoatScore(company.id);

    // Get sector multiplier from economic regime
    const regime = this.economicRegime.classifyRegime();
    const sectorMultipliers = this.economicRegime.getSectorMultipliers(regime.regime);
    const sectorMultiplier = sectorMultipliers.sectorMultipliers[company.sector] || 1.0;

    // Moat-adjusted valuation
    const moatValuation = this.moatScorer.getMoatAdjustedValuation(company.id, 20); // Base P/E of 20

    return {
      symbol: company.symbol,
      name: company.name,
      sector: company.sector,
      moat: moatScore.error ? null : {
        score: moatScore.totalScore,
        strength: moatScore.moatStrength,
        primaryMoat: moatScore.primaryMoat,
        threats: moatScore.threatLevel
      },
      regimeAdjustment: {
        currentRegime: regime.regime,
        sectorMultiplier,
        reasoning: sectorMultipliers.reasoning[company.sector]
      },
      valuation: {
        moatAdjustedPE: moatValuation.adjustedMultiple,
        moatPremium: moatValuation.adjustment
      }
    };
  }

  /**
   * Get enhanced signal weights with decorrelation
   * @param {Object} baseWeights - Original signal weights
   * @param {Object} signalHistory - Historical signal data
   * @returns {Object} Adjusted weights
   */
  getEnhancedSignalWeights(baseWeights, signalHistory) {
    // Calculate correlation matrix
    const correlationMatrix = this.signalDecorrelator.calculateSignalCorrelationMatrix(
      signalHistory,
      63 // 3-month lookback
    );

    // Get decorrelated weights
    const decorrelatedWeights = this.signalDecorrelator.getDecorrelatedWeights(
      baseWeights,
      correlationMatrix,
      0.5 // Threshold
    );

    // Identify redundant signals
    const redundantSignals = this.signalDecorrelator.identifyRedundantSignals(
      correlationMatrix,
      0.7
    );

    return {
      originalWeights: baseWeights,
      adjustedWeights: decorrelatedWeights.adjustedWeights,
      correlationMatrix: correlationMatrix.avgCorrelation,
      penalties: decorrelatedWeights.correlationPenalties,
      redundantSignals: redundantSignals.signalsToRemove,
      interpretation: correlationMatrix.interpretation
    };
  }

  /**
   * Check if position should be added with all constraints
   * @param {string} symbol - Stock to add
   * @param {number} proposedSize - Proposed position size
   * @param {Array} currentPositions - Current portfolio positions
   * @param {number} portfolioValue - Total portfolio value
   * @returns {Object} Position recommendation
   */
  checkPositionConstraints(symbol, proposedSize, currentPositions, portfolioValue) {
    // Correlation check
    const correlationCheck = this.correlationManager.checkNewPositionCorrelation(
      symbol,
      currentPositions,
      0.7
    );

    // Sector diversification
    const sectorCheck = this.correlationManager.getSectorDiversification([
      ...currentPositions,
      { symbol, value: portfolioValue * proposedSize }
    ]);

    // Correlation-adjusted size
    const sizeAdjustment = this.correlationManager.adjustSizeForCorrelation(
      proposedSize,
      symbol,
      currentPositions
    );

    // Market assessment for regime adjustment
    const marketAssessment = this.getMarketAssessment();

    // Final adjusted size
    let finalSize = sizeAdjustment.adjustedNewSize * marketAssessment.exposureMultiplier;

    // Apply position limits
    const maxSize = 0.03; // 3% max per position
    finalSize = Math.min(finalSize, maxSize);

    const approved = correlationCheck.canAdd &&
                    !sectorCheck.isSectorConcentrated &&
                    finalSize >= 0.01; // Minimum 1%

    return {
      approved,
      symbol,
      originalSize: proposedSize,
      finalSize,
      adjustments: {
        correlation: sizeAdjustment.sizeReduction,
        regime: 1 - marketAssessment.exposureMultiplier,
        total: 1 - (finalSize / proposedSize)
      },
      constraints: {
        correlationPassed: correlationCheck.canAdd,
        sectorPassed: !sectorCheck.isSectorConcentrated,
        correlatedWith: correlationCheck.highlyCorrelatedWith.map(h => h.symbol),
        sectorExposure: sectorCheck.sectorWeights
      },
      marketConditions: {
        risk: marketAssessment.overallRisk,
        exposureMultiplier: marketAssessment.exposureMultiplier
      }
    };
  }

  /**
   * Get hedge recommendations
   * @param {number} portfolioValue - Portfolio value
   * @param {Array} currentHedges - Existing hedges
   * @returns {Object} Hedge recommendations
   */
  getHedgeRecommendations(portfolioValue, currentHedges = []) {
    const hedgeRecs = this.tailHedge.getHedgeRecommendations(portfolioValue, currentHedges);
    const protection = this.tailHedge.calculatePortfolioProtection(currentHedges, portfolioValue);

    return {
      recommendations: hedgeRecs.recommendations,
      budget: hedgeRecs.budget,
      currentProtection: protection,
      crashIndicators: hedgeRecs.indicators
    };
  }

  /**
   * Get pairs trading opportunities
   * @param {string} sector - Sector to scan
   * @returns {Object} Pairs trading analysis
   */
  async getPairsTradingOpportunities(sector = 'Technology') {
    // Find cointegrated pairs
    const pairs = await this.pairsTrading.findCointegrationPairs(sector);

    // Generate signals for active pairs
    const signals = this.pairsTrading.generatePairSignals(pairs.slice(0, 10));

    // Get open positions
    const openPositions = this.pairsTrading.getOpenPositions();

    // Monitor existing pairs for breakdown
    const breakdownWarnings = this.pairsTrading.monitorCointegrationBreakdown(pairs.slice(0, 10));

    return {
      sector,
      cointegrationPairs: pairs.length,
      topPairs: pairs.slice(0, 5),
      signals,
      openPositions: openPositions.length,
      breakdownWarnings
    };
  }

  /**
   * Run factor attribution on portfolio
   * @param {Array} portfolioReturns - Array of {date, return}
   * @param {string} startDate - Period start
   * @param {string} endDate - Period end
   * @returns {Object} Attribution report
   */
  runFactorAttribution(portfolioReturns, startDate, endDate) {
    return this.factorAttribution.generateAttributionReport(
      portfolioReturns,
      startDate,
      endDate
    );
  }

  /**
   * Get full system status
   * @returns {Object} System status
   */
  getSystemStatus() {
    return {
      subsystems: {
        tailHedge: '✅ Active',
        factorAttribution: '✅ Active',
        predictionIntervals: '✅ Active',
        signalDecorrelator: '✅ Active',
        correlationManager: '✅ Active',
        economicRegime: '✅ Active',
        pairsTrading: '✅ Active',
        moatScorer: '✅ Active',
        creditCycle: '✅ Active'
      },
      capabilities: [
        'Tail risk hedging with crash indicators',
        'Factor attribution (MKT, SMB, HML, UMD, QMJ, BAB)',
        'Prediction intervals with bootstrap',
        'Signal decorrelation with PCA',
        'Correlation-aware position sizing',
        'Economic regime detection (Growth/Inflation)',
        'Statistical arbitrage pairs trading',
        'Competitive moat scoring',
        'Credit cycle monitoring'
      ],
      improvements: {
        fromCouncil: [
          'Spitznagel: Tail hedging overlay',
          'Asness: Proper 12-1 momentum, factor attribution',
          'Derman: Prediction intervals, uncertainty quantification',
          'Dalio: Economic regime overlay',
          'Simons: Diversification, pairs trading',
          'Buffett: Moat scoring'
        ]
      }
    };
  }
}

function createEnhancedQuantSystem() {
  return new EnhancedQuantSystem();
}

module.exports = { EnhancedQuantSystem, createEnhancedQuantSystem };
