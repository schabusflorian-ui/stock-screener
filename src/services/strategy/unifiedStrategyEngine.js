// src/services/strategy/unifiedStrategyEngine.js
// Unified Strategy Engine - Single signal generation engine for all trading strategies
// Integrates all 15 signal types with regime detection and factor analysis

const { TechnicalSignals } = require('../trading/technicalSignals');
const { SentimentSignal } = require('../sentimentSignal');
const { InsiderTradingSignals } = require('../signals/insiderTradingSignals');
const { CongressionalTradingSignals } = require('../signals/congressionalTradingSignals');
const { ValueSignals } = require('../signals/valueSignals');
const { AlternativeDataAggregator } = require('../alternativeData/alternativeDataAggregator');
const { FactorAnalyzer } = require('../factors/factorAnalyzer');
const { RegimeDetector } = require('../trading/regimeDetector');

// Optional ML components (may not exist in all installations)
let getRegimeHMM, getSignalCombiner, SignalDecorrelation, PythonMLClient;
try {
  getRegimeHMM = require('../ml/regimeHMM').getRegimeHMM;
} catch (e) { getRegimeHMM = null; }
try {
  getSignalCombiner = require('../ml/signalCombiner').getSignalCombiner;
} catch (e) { getSignalCombiner = null; }
try {
  SignalDecorrelation = require('../ml/signalDecorrelation').SignalDecorrelation;
} catch (e) { SignalDecorrelation = null; }
try {
  PythonMLClient = require('../ml/pythonMLClient').PythonMLClient;
} catch (e) { PythonMLClient = null; }

/**
 * Default signal weights (16 signals including ML prediction)
 * Sum to 1.0 for proper normalization
 *
 * mlPrediction: Deep learning model prediction (LSTM/Transformer ensemble)
 * - Starts conservative (0.05) until model proves itself
 * - Increase gradually as model performance is validated
 */
const DEFAULT_SIGNAL_WEIGHTS = {
  technical: 0.08,
  fundamental: 0.09,
  sentiment: 0.07,
  insider: 0.09,
  congressional: 0.07,
  valuation: 0.09,
  thirteenF: 0.07,
  earningsMomentum: 0.07,
  valueQuality: 0.07,
  momentum: 0.07,
  analyst: 0.06,
  alternative: 0.04,
  contrarian: 0.02,
  magicFormula: 0.02,
  factorScores: 0.02,
  mlPrediction: 0.05  // Deep learning signal - start conservative
};

/**
 * UnifiedStrategyEngine
 *
 * The core signal generation engine that:
 * - Integrates all 15 signal types
 * - Supports historical backtesting via setSimulationDate()
 * - Applies regime adjustments
 * - Provides factor exposure analysis
 * - Optional ML signal combination
 */
class UnifiedStrategyEngine {
  /**
   * @param {Database} db - SQLite database instance
   * @param {Object} options - Configuration options
   */
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.simulationDate = null; // For backtesting - if set, all queries use this date
    this.options = {
      useHMM: options.useHMM !== false,
      useMLCombiner: options.useMLCombiner || false,
      useSignalDecorrelation: options.useSignalDecorrelation || false,
      verbose: options.verbose || false,
      ...options
    };

    // Initialize signal calculators
    this._initializeSignalCalculators();

    // Initialize regime detection
    this._initializeRegimeDetection();

    // Initialize factor analysis
    this._initializeFactorAnalysis();

    // Initialize ML enhancements
    this._initializeMLComponents();

    // Prepare database statements
    this._prepareStatements();

    if (this.options.verbose) {
      console.log('🔧 UnifiedStrategyEngine initialized');
      console.log(`   Simulation mode: ${this.simulationDate ? 'ON' : 'OFF'}`);
      console.log(`   HMM Regime: ${this.regimeHMM ? 'ON' : 'OFF'}`);
      console.log(`   ML Combiner: ${this.signalCombiner ? 'ON' : 'OFF'}`);
    }
  }

  /**
   * Initialize all signal calculators
   */
  _initializeSignalCalculators() {
    // Core signals (always available)
    this.signals = {};

    try {
      this.signals.technical = new TechnicalSignals(this.db);
    } catch (e) {
      console.warn('TechnicalSignals not available:', e.message);
    }

    try {
      this.signals.sentiment = new SentimentSignal(this.db);
    } catch (e) {
      console.warn('SentimentSignal not available:', e.message);
    }

    try {
      this.signals.insider = new InsiderTradingSignals(this.db);
    } catch (e) {
      console.warn('InsiderTradingSignals not available:', e.message);
    }

    try {
      this.signals.congressional = new CongressionalTradingSignals(this.db);
    } catch (e) {
      console.warn('CongressionalTradingSignals not available:', e.message);
    }

    try {
      this.signals.valueSignals = new ValueSignals();
    } catch (e) {
      console.warn('ValueSignals not available:', e.message);
    }

    try {
      this.signals.alternative = new AlternativeDataAggregator(this.db);
    } catch (e) {
      console.warn('AlternativeDataAggregator not available:', e.message);
    }
  }

  /**
   * Initialize regime detection systems
   */
  _initializeRegimeDetection() {
    try {
      this.regimeDetector = new RegimeDetector(this.db);
    } catch (e) {
      console.warn('RegimeDetector not available:', e.message);
      this.regimeDetector = null;
    }

    // HMM-based regime detection (optional, more sophisticated)
    if (this.options.useHMM && getRegimeHMM) {
      try {
        this.regimeHMM = getRegimeHMM(this.db);
      } catch (e) {
        console.warn('HMM Regime not available:', e.message);
        this.regimeHMM = null;
      }
    } else {
      this.regimeHMM = null;
    }
  }

  /**
   * Initialize factor analysis
   */
  _initializeFactorAnalysis() {
    try {
      this.factorAnalyzer = new FactorAnalyzer(this.db);
    } catch (e) {
      console.warn('FactorAnalyzer not available:', e.message);
      this.factorAnalyzer = null;
    }
  }

  /**
   * Initialize ML components (optional)
   */
  _initializeMLComponents() {
    // ML signal combiner (gradient boosting)
    if (this.options.useMLCombiner && getSignalCombiner) {
      try {
        this.signalCombiner = getSignalCombiner(this.db);
      } catch (e) {
        this.signalCombiner = null;
      }
    } else {
      this.signalCombiner = null;
    }

    // Signal decorrelation
    if (this.options.useSignalDecorrelation && SignalDecorrelation) {
      try {
        this.signalDecorrelation = new SignalDecorrelation(this.db);
      } catch (e) {
        this.signalDecorrelation = null;
      }
    } else {
      this.signalDecorrelation = null;
    }

    // Deep learning prediction client (LSTM/Transformer)
    if (PythonMLClient) {
      try {
        this.deepLearningClient = new PythonMLClient(this.db, {
          timeout: 30000,  // 30 second timeout
          cacheMaxSize: 10000,
          cacheTTL: 3600000  // 1 hour cache
        });
        // Initialize asynchronously (don't block constructor)
        this.deepLearningClient.initialize().then(success => {
          if (this.options.verbose) {
            console.log(`   Deep Learning: ${success ? 'ON' : 'OFF (no models)'}`);
          }
        }).catch(() => {
          this.deepLearningClient = null;
        });
      } catch (e) {
        this.deepLearningClient = null;
        if (this.options.verbose) {
          console.warn('Deep learning client not available:', e.message);
        }
      }
    } else {
      this.deepLearningClient = null;
    }
  }

  /**
   * Prepare database statements
   * Uses try-catch for optional tables to gracefully handle missing tables
   */
  _prepareStatements() {
    // Helper to safely prepare statements for optional tables
    const safePrepare = (sql, tableName) => {
      try {
        return this.db.prepare(sql);
      } catch (err) {
        if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
          if (this.options.verbose) {
            console.log(`⚠️ Optional table '${tableName}' not found, skipping`);
          }
          return null;
        }
        throw err;
      }
    };

    // Core tables (required)
    this.stmtGetCompany = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE id = ?
    `);

    this.stmtGetCompanyBySymbol = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE LOWER(symbol) = LOWER(?)
    `);

    this.stmtGetPriceAsOf = this.db.prepare(`
      SELECT close as price, date, volume
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    this.stmtGetPriceHistory = this.db.prepare(`
      SELECT close as price, date
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT ?
    `);

    // Optional tables - gracefully handle missing ones
    this.stmtGetMetrics = safePrepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC
      LIMIT 1
    `, 'calculated_metrics');

    this.stmtGetSentiment = safePrepare(`
      SELECT * FROM combined_sentiment
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `, 'combined_sentiment');

    this.stmtGetIntrinsicValue = safePrepare(`
      SELECT * FROM intrinsic_value_estimates
      WHERE company_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, 'intrinsic_value_estimates');

    this.stmtGetAnalyst = safePrepare(`
      SELECT * FROM analyst_ratings
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT 1
    `, 'analyst_ratings');

    this.stmtGet13FSignal = safePrepare(`
      SELECT
        COUNT(DISTINCT investor_id) as investor_count,
        SUM(CASE WHEN change_type = 'new' THEN 1 ELSE 0 END) as new_positions,
        SUM(CASE WHEN change_type = 'increase' THEN 1 ELSE 0 END) as increases,
        SUM(CASE WHEN change_type = 'decrease' THEN 1 ELSE 0 END) as decreases,
        SUM(CASE WHEN change_type = 'exit' THEN 1 ELSE 0 END) as exits
      FROM famous_investor_positions fip
      WHERE fip.company_id = ?
        AND fip.filing_date >= date(?, '-90 days')
    `, 'famous_investor_positions');

    this.stmtGetEarningsMomentum = safePrepare(`
      SELECT
        earnings_surprise,
        surprise_percent,
        beat_count,
        miss_count
      FROM earnings_history
      WHERE company_id = ?
      ORDER BY report_date DESC
      LIMIT 4
    `, 'earnings_history');
  }

  /**
   * Set simulation date for backtesting
   * All queries will return data as-of this date
   * @param {string|null} date - ISO date string (YYYY-MM-DD) or null for live mode
   */
  setSimulationDate(date) {
    this.simulationDate = date;

    // Propagate to signal calculators that support it
    if (this.signals.insider && this.signals.insider.setSimulationDate) {
      this.signals.insider.setSimulationDate(date);
    }
    if (this.signals.congressional && this.signals.congressional.setSimulationDate) {
      this.signals.congressional.setSimulationDate(date);
    }

    if (this.options.verbose) {
      console.log(`📅 Simulation date set to: ${date || 'LIVE'}`);
    }
  }

  /**
   * Get the effective date for queries
   * @returns {string} ISO date string
   */
  _getEffectiveDate() {
    return this.simulationDate || new Date().toISOString().slice(0, 10);
  }

  /**
   * Get current market regime
   * @returns {Object} Regime info with name and confidence
   */
  async getRegime() {
    const effectiveDate = this._getEffectiveDate();

    // Try HMM first (more sophisticated)
    if (this.regimeHMM) {
      try {
        const hmmResult = await this.regimeHMM.getCurrentRegime(effectiveDate);
        if (hmmResult && hmmResult.regime) {
          return {
            name: hmmResult.regime,
            confidence: hmmResult.probability || 0.7,
            source: 'hmm',
            transitionProb: hmmResult.transitionProbabilities || {}
          };
        }
      } catch (e) {
        // Fall through to VIX-based
      }
    }

    // Fall back to VIX-based regime detection
    if (this.regimeDetector) {
      try {
        const regime = await this.regimeDetector.getCurrentRegime();
        return {
          name: regime.regime || 'normal',
          confidence: regime.confidence || 0.6,
          source: 'vix',
          vix: regime.vix
        };
      } catch (e) {
        // Fall through to default
      }
    }

    // Default to normal regime
    return { name: 'normal', confidence: 0.5, source: 'default' };
  }

  /**
   * Generate signal for a single company
   * @param {number|string} companyIdOrSymbol - Company ID or symbol
   * @param {Object} strategyConfig - Strategy configuration
   * @param {Object} portfolioContext - Current portfolio state (optional)
   * @returns {Object} Generated signal
   */
  async generateSignal(companyIdOrSymbol, strategyConfig, portfolioContext = {}) {
    const effectiveDate = this._getEffectiveDate();

    // Resolve company
    let company;
    if (typeof companyIdOrSymbol === 'number') {
      company = this.stmtGetCompany.get(companyIdOrSymbol);
    } else {
      company = this.stmtGetCompanyBySymbol.get(companyIdOrSymbol);
    }

    if (!company) {
      return { error: 'Company not found', companyId: companyIdOrSymbol };
    }

    // Get current price
    const priceData = this.stmtGetPriceAsOf.get(company.id, effectiveDate);
    if (!priceData) {
      return { error: 'No price data', companyId: company.id, symbol: company.symbol };
    }

    // Get signal weights from strategy config
    const weights = strategyConfig.signal_weights || DEFAULT_SIGNAL_WEIGHTS;

    // Calculate all enabled signals
    const signalResults = {};
    let totalWeight = 0;
    let weightedScore = 0;

    // Calculate each signal type based on weights
    const signalPromises = [];

    // Technical
    if (weights.technical > 0) {
      signalPromises.push(
        this._calculateTechnicalSignal(company, effectiveDate)
          .then(score => {
            if (score !== null) {
              signalResults.technical = score;
              weightedScore += score * weights.technical;
              totalWeight += weights.technical;
            }
          })
      );
    }

    // Fundamental
    if (weights.fundamental > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateFundamentalSignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.fundamental = score;
              weightedScore += score * weights.fundamental;
              totalWeight += weights.fundamental;
            }
          })
      );
    }

    // Sentiment
    if (weights.sentiment > 0) {
      signalPromises.push(
        this._calculateSentimentSignal(company, effectiveDate)
          .then(score => {
            if (score !== null) {
              signalResults.sentiment = score;
              weightedScore += score * weights.sentiment;
              totalWeight += weights.sentiment;
            }
          })
      );
    }

    // Insider
    if (weights.insider > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateInsiderSignal(company.id, effectiveDate))
          .then(score => {
            if (score !== null) {
              signalResults.insider = score;
              weightedScore += score * weights.insider;
              totalWeight += weights.insider;
            }
          })
      );
    }

    // Congressional
    if (weights.congressional > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateCongressionalSignal(company.id, effectiveDate))
          .then(score => {
            if (score !== null) {
              signalResults.congressional = score;
              weightedScore += score * weights.congressional;
              totalWeight += weights.congressional;
            }
          })
      );
    }

    // Valuation
    if (weights.valuation > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateValuationSignal(company.id, priceData.price))
          .then(score => {
            if (score !== null) {
              signalResults.valuation = score;
              weightedScore += score * weights.valuation;
              totalWeight += weights.valuation;
            }
          })
      );
    }

    // 13F Holdings
    if (weights.thirteenF > 0) {
      signalPromises.push(
        Promise.resolve(this._calculate13FSignal(company.id, effectiveDate))
          .then(score => {
            if (score !== null) {
              signalResults.thirteenF = score;
              weightedScore += score * weights.thirteenF;
              totalWeight += weights.thirteenF;
            }
          })
      );
    }

    // Earnings Momentum
    if (weights.earningsMomentum > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateEarningsMomentumSignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.earningsMomentum = score;
              weightedScore += score * weights.earningsMomentum;
              totalWeight += weights.earningsMomentum;
            }
          })
      );
    }

    // Value Quality (Piotroski, Altman)
    if (weights.valueQuality > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateValueQualitySignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.valueQuality = score;
              weightedScore += score * weights.valueQuality;
              totalWeight += weights.valueQuality;
            }
          })
      );
    }

    // Momentum
    if (weights.momentum > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateMomentumSignal(company.id, effectiveDate))
          .then(score => {
            if (score !== null) {
              signalResults.momentum = score;
              weightedScore += score * weights.momentum;
              totalWeight += weights.momentum;
            }
          })
      );
    }

    // Analyst
    if (weights.analyst > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateAnalystSignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.analyst = score;
              weightedScore += score * weights.analyst;
              totalWeight += weights.analyst;
            }
          })
      );
    }

    // Alternative Data
    if (weights.alternative > 0) {
      signalPromises.push(
        this._calculateAlternativeSignal(company, effectiveDate)
          .then(score => {
            if (score !== null) {
              signalResults.alternative = score;
              weightedScore += score * weights.alternative;
              totalWeight += weights.alternative;
            }
          })
      );
    }

    // Contrarian
    if (weights.contrarian > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateContrarianSignal(company.id, effectiveDate))
          .then(score => {
            if (score !== null) {
              signalResults.contrarian = score;
              weightedScore += score * weights.contrarian;
              totalWeight += weights.contrarian;
            }
          })
      );
    }

    // Magic Formula
    if (weights.magicFormula > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateMagicFormulaSignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.magicFormula = score;
              weightedScore += score * weights.magicFormula;
              totalWeight += weights.magicFormula;
            }
          })
      );
    }

    // Factor Scores
    if (weights.factorScores > 0) {
      signalPromises.push(
        Promise.resolve(this._calculateFactorSignal(company.id))
          .then(score => {
            if (score !== null) {
              signalResults.factorScores = score;
              weightedScore += score * weights.factorScores;
              totalWeight += weights.factorScores;
            }
          })
      );
    }

    // ML Prediction (Deep Learning - LSTM/Transformer ensemble)
    if (weights.mlPrediction > 0) {
      signalPromises.push(
        this._calculateMLPredictionSignal(company.symbol, effectiveDate)
          .then(result => {
            if (result !== null && result.score !== null) {
              signalResults.mlPrediction = result.score;
              signalResults.mlUncertainty = result.uncertainty;
              signalResults.mlModelType = result.modelType;
              // Weight by confidence: lower uncertainty = higher effective weight
              const confidenceWeight = result.confidence || 0.5;
              const effectiveWeight = weights.mlPrediction * confidenceWeight;
              weightedScore += result.score * effectiveWeight;
              totalWeight += effectiveWeight;
            }
          })
          .catch(() => {
            // Silently fail - ML prediction is optional
          })
      );
    }

    // Wait for all signals to complete
    await Promise.all(signalPromises);

    // Check if we have enough signals
    if (totalWeight === 0) {
      return {
        error: 'No signals available',
        companyId: company.id,
        symbol: company.symbol
      };
    }

    // Normalize score
    let normalizedScore = weightedScore / totalWeight;

    // Apply regime adjustment if enabled
    let regimeMultiplier = 1.0;
    let regime = null;

    const regimeConfig = strategyConfig.regime_config || {};
    if (regimeConfig.enabled !== false) {
      regime = await this.getRegime();

      // Adjust score based on regime
      if (regime.name === 'crisis' || regime.name === 'extreme') {
        regimeMultiplier = regimeConfig.exposureHighRisk || 0.5;
      } else if (regime.name === 'high_vol' || regime.name === 'elevated' || regime.name === 'cautious') {
        regimeMultiplier = regimeConfig.exposureElevated || 0.75;
      } else {
        regimeMultiplier = regimeConfig.exposureNormal || 1.0;
      }

      // Reduce buy conviction in risky environments
      if (normalizedScore > 0) {
        normalizedScore *= regimeMultiplier;
      }
    }

    // Calculate confidence - fixed to not unfairly penalize partial data
    // Data completeness saturates at 8 signals (50%) - having more signals helps but isn't required
    const signalCount = Object.keys(signalResults).length;
    const dataCompleteness = Math.min(1, signalCount / 8);  // Saturates at 8 signals
    const signalStrength = Math.abs(normalizedScore);
    // Weight signal strength more heavily than data completeness
    // Strong signals with 8+ sources can reach 0.6+ confidence
    const confidence = Math.min(0.95, 0.35 + (dataCompleteness * 0.15) + (signalStrength * 0.45));

    // Check against thresholds (relaxed defaults to not miss opportunities)
    const minScore = strategyConfig.min_signal_score || 0.25;     // Relaxed from 0.3
    const minConfidence = strategyConfig.min_confidence || 0.50;  // Relaxed from 0.6

    if (Math.abs(normalizedScore) < minScore || confidence < minConfidence) {
      return {
        symbol: company.symbol,
        companyId: company.id,
        action: 'hold',
        score: normalizedScore,
        confidence,
        signals: signalResults,
        regime,
        belowThreshold: true
      };
    }

    // Determine action
    let action = 'hold';
    if (normalizedScore > 0.3) action = 'strong_buy';
    else if (normalizedScore > 0.1) action = 'buy';
    else if (normalizedScore < -0.3) action = 'strong_sell';
    else if (normalizedScore < -0.1) action = 'sell';

    return {
      symbol: company.symbol,
      companyId: company.id,
      sector: company.sector,
      price: priceData.price,
      priceDate: priceData.date,
      action,
      score: normalizedScore,
      rawScore: weightedScore / totalWeight,
      confidence,
      signals: signalResults,
      regime,
      regimeMultiplier,
      signalCount: Object.keys(signalResults).length,
      effectiveDate
    };
  }

  /**
   * Generate signals for a universe of stocks
   * @param {Object} strategyConfig - Strategy configuration
   * @param {Array} universe - Array of company IDs or symbols (optional, uses config if not provided)
   * @returns {Array} Array of signals
   */
  async generateSignalsForUniverse(strategyConfig, universe = null) {
    // Get universe from config if not provided
    if (!universe) {
      universe = await this._getUniverse(strategyConfig.universe_config || {});
    }

    const signals = [];
    const batchSize = 50;

    for (let i = 0; i < universe.length; i += batchSize) {
      const batch = universe.slice(i, i + batchSize);
      const batchPromises = batch.map(companyId =>
        this.generateSignal(companyId, strategyConfig)
          .catch(e => ({ error: e.message, companyId }))
      );

      const batchResults = await Promise.all(batchPromises);
      signals.push(...batchResults.filter(s => !s.error && s.action !== 'hold'));
    }

    // Sort by score descending
    signals.sort((a, b) => b.score - a.score);

    return signals;
  }

  /**
   * Get universe of stocks based on config
   * @param {Object} universeConfig - Universe configuration
   * @returns {Array} Array of company IDs
   */
  async _getUniverse(universeConfig) {
    let query = `
      SELECT c.id
      FROM companies c
      WHERE c.market_cap > 0
        AND c.symbol NOT LIKE 'CIK_%'
    `;
    const params = [];

    // Market cap filter
    if (universeConfig.minMarketCap) {
      query += ' AND c.market_cap >= ?';
      params.push(universeConfig.minMarketCap);
    }
    if (universeConfig.maxMarketCap) {
      query += ' AND c.market_cap <= ?';
      params.push(universeConfig.maxMarketCap);
    }

    // Sector filter
    if (universeConfig.sectors && universeConfig.sectors.length > 0) {
      const placeholders = universeConfig.sectors.map(() => '?').join(',');
      query += ` AND c.sector IN (${placeholders})`;
      params.push(...universeConfig.sectors);
    }
    if (universeConfig.excludedSectors && universeConfig.excludedSectors.length > 0) {
      const placeholders = universeConfig.excludedSectors.map(() => '?').join(',');
      query += ` AND c.sector NOT IN (${placeholders})`;
      params.push(...universeConfig.excludedSectors);
    }

    // Exclude ADRs
    if (universeConfig.excludeADRs) {
      query += ' AND c.symbol NOT LIKE \'%.%\'';
    }

    // Exclude penny stocks
    if (universeConfig.excludePennyStocks && universeConfig.minPrice) {
      // Would need to join with price_metrics
    }

    query += ' ORDER BY c.market_cap DESC LIMIT 500';

    const companies = this.db.prepare(query).all(...params);
    return companies.map(c => c.id);
  }

  // ========== Individual Signal Calculators ==========

  async _calculateTechnicalSignal(company, effectiveDate) {
    if (!this.signals.technical) return null;
    try {
      const result = await this.signals.technical.calculate(company.symbol, 250);
      return result && result.score ? result.score : null;
    } catch (e) {
      return null;
    }
  }

  _calculateFundamentalSignal(companyId) {
    if (!this.stmtGetMetrics) return null;
    const metrics = this.stmtGetMetrics.get(companyId);
    if (!metrics) return null;

    let score = 0;

    // ROE
    if (metrics.roe > 0.20) score += 0.25;
    else if (metrics.roe > 0.12) score += 0.1;
    else if (metrics.roe < 0) score -= 0.25;

    // Net margin
    if (metrics.net_margin > 0.15) score += 0.2;
    else if (metrics.net_margin > 0.08) score += 0.1;
    else if (metrics.net_margin < 0) score -= 0.2;

    // Revenue growth
    if (metrics.revenue_growth_yoy > 0.20) score += 0.25;
    else if (metrics.revenue_growth_yoy > 0.10) score += 0.1;
    else if (metrics.revenue_growth_yoy < 0) score -= 0.15;

    // Debt/Equity
    if (metrics.debt_to_equity < 0.5) score += 0.15;
    else if (metrics.debt_to_equity > 2) score -= 0.2;

    // ROIC
    if (metrics.roic > 0.15) score += 0.15;
    else if (metrics.roic < 0.05) score -= 0.1;

    return Math.max(-1, Math.min(1, score));
  }

  async _calculateSentimentSignal(company, effectiveDate) {
    if (!this.signals.sentiment) return null;
    try {
      const result = await this.signals.sentiment.calculateForSymbol(company.symbol);
      if (result && result.combined_score !== undefined) {
        // Normalize 0-100 to -1 to 1
        return (result.combined_score - 50) / 50;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateInsiderSignal(companyId, effectiveDate) {
    if (!this.signals.insider) return null;
    try {
      const signal = this.signals.insider.generateSignal(companyId, effectiveDate);
      if (signal && signal.score !== undefined) {
        // Insider signal is 0-1, convert to -1 to 1 (buys only, so 0-1 maps to 0-1)
        return signal.score;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateCongressionalSignal(companyId, effectiveDate) {
    if (!this.signals.congressional) return null;
    try {
      const signal = this.signals.congressional.generateSignal(companyId, effectiveDate);
      if (signal && signal.score !== undefined) {
        return signal.score;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateValuationSignal(companyId, currentPrice) {
    const intrinsic = this.stmtGetIntrinsicValue ? this.stmtGetIntrinsicValue.get(companyId) : null;
    const metrics = this.stmtGetMetrics ? this.stmtGetMetrics.get(companyId) : null;

    if (!intrinsic && !metrics) return null;

    let score = 0;
    let components = 0;

    // Margin of safety from intrinsic value
    if (intrinsic && intrinsic.intrinsic_value && currentPrice) {
      const mos = (intrinsic.intrinsic_value - currentPrice) / intrinsic.intrinsic_value;
      if (mos > 0.3) score += 0.4;
      else if (mos > 0.15) score += 0.25;
      else if (mos > 0) score += 0.1;
      else if (mos < -0.2) score -= 0.3;
      components++;
    }

    // P/E ratio
    if (metrics && metrics.pe_ratio) {
      if (metrics.pe_ratio > 0 && metrics.pe_ratio < 12) score += 0.3;
      else if (metrics.pe_ratio > 0 && metrics.pe_ratio < 18) score += 0.15;
      else if (metrics.pe_ratio > 35) score -= 0.25;
      components++;
    }

    // FCF Yield
    if (metrics && metrics.fcf_yield) {
      if (metrics.fcf_yield > 0.08) score += 0.25;
      else if (metrics.fcf_yield > 0.05) score += 0.1;
      else if (metrics.fcf_yield < 0) score -= 0.2;
      components++;
    }

    if (components === 0) return null;
    return Math.max(-1, Math.min(1, score / (components * 0.3)));
  }

  _calculate13FSignal(companyId, effectiveDate) {
    try {
      if (!this.stmtGet13FSignal) return null;
      const data = this.stmtGet13FSignal.get(companyId, effectiveDate);
      if (!data || data.investor_count === 0) return null;

      let score = 0;

      // More investors = stronger signal
      if (data.investor_count >= 5) score += 0.4;
      else if (data.investor_count >= 3) score += 0.25;
      else score += 0.1;

      // New positions are bullish
      score += Math.min(0.3, data.new_positions * 0.1);

      // Increases vs decreases
      const netChange = (data.new_positions + data.increases) - (data.decreases + data.exits);
      score += Math.min(0.3, Math.max(-0.3, netChange * 0.1));

      return Math.max(-1, Math.min(1, score));
    } catch (e) {
      return null;
    }
  }

  _calculateEarningsMomentumSignal(companyId) {
    try {
      if (!this.stmtGetEarningsMomentum) return null;
      const earnings = this.stmtGetEarningsMomentum.all(companyId);
      if (!earnings || earnings.length === 0) return null;

      let score = 0;

      // Beat/miss ratio
      const totalBeats = earnings.reduce((sum, e) => sum + (e.beat_count || 0), 0);
      const totalMisses = earnings.reduce((sum, e) => sum + (e.miss_count || 0), 0);

      if (totalBeats > totalMisses) {
        score += 0.3 * Math.min(1, (totalBeats - totalMisses) / 4);
      } else if (totalMisses > totalBeats) {
        score -= 0.3 * Math.min(1, (totalMisses - totalBeats) / 4);
      }

      // Recent surprise magnitude
      const recentSurprise = earnings[0]?.surprise_percent;
      if (recentSurprise) {
        if (recentSurprise > 10) score += 0.3;
        else if (recentSurprise > 5) score += 0.15;
        else if (recentSurprise < -10) score -= 0.3;
        else if (recentSurprise < -5) score -= 0.15;
      }

      return Math.max(-1, Math.min(1, score));
    } catch (e) {
      return null;
    }
  }

  _calculateValueQualitySignal(companyId) {
    if (!this.signals.valueSignals) return null;
    try {
      // Get Piotroski F-Score
      const piotroski = this.signals.valueSignals.calculatePiotroskiScore(companyId);

      if (!piotroski || piotroski.error) return null;

      // F-Score 0-9, convert to -1 to 1
      // 7-9 = strong (0.5 to 1), 4-6 = neutral (-0.1 to 0.1), 0-3 = weak (-0.5 to -1)
      const fScore = piotroski.fScore;
      if (fScore >= 7) return 0.3 + (fScore - 7) * 0.35;
      if (fScore <= 3) return -0.3 - (3 - fScore) * 0.35;
      return (fScore - 5) * 0.1;
    } catch (e) {
      return null;
    }
  }

  _calculateMomentumSignal(companyId, effectiveDate) {
    try {
      const history = this.stmtGetPriceHistory.all(companyId, effectiveDate, 252);
      if (!history || history.length < 63) return null;

      const prices = history.map(h => h.price).reverse();
      const current = prices[prices.length - 1];

      let score = 0;

      // 12-1 momentum (skip most recent month)
      if (prices.length >= 252) {
        const price1MonthAgo = prices[prices.length - 21];
        const price12MonthsAgo = prices[0];
        const mom12_1 = (price1MonthAgo - price12MonthsAgo) / price12MonthsAgo;

        if (mom12_1 > 0.3) score += 0.4;
        else if (mom12_1 > 0.15) score += 0.25;
        else if (mom12_1 > 0) score += 0.1;
        else if (mom12_1 < -0.15) score -= 0.3;
        else score -= 0.1;
      }

      // 3-month momentum
      if (prices.length >= 63) {
        const price3MonthsAgo = prices[prices.length - 63];
        const mom3m = (current - price3MonthsAgo) / price3MonthsAgo;

        if (mom3m > 0.15) score += 0.3;
        else if (mom3m > 0.05) score += 0.15;
        else if (mom3m < -0.1) score -= 0.25;
      }

      return Math.max(-1, Math.min(1, score));
    } catch (e) {
      return null;
    }
  }

  _calculateAnalystSignal(companyId) {
    try {
      if (!this.stmtGetAnalyst) return null;
      const analyst = this.stmtGetAnalyst.get(companyId);
      if (!analyst) return null;

      let score = 0;

      // Rating (1-5, 1=strong buy, 5=strong sell)
      if (analyst.mean_rating) {
        score = (3 - analyst.mean_rating) * 0.3; // Converts 1-5 to 0.6 to -0.6
      }

      // Price target upside
      if (analyst.target_price && analyst.current_price) {
        const upside = (analyst.target_price - analyst.current_price) / analyst.current_price;
        score += Math.min(0.4, Math.max(-0.4, upside * 0.8));
      }

      return Math.max(-1, Math.min(1, score));
    } catch (e) {
      return null;
    }
  }

  async _calculateAlternativeSignal(company, effectiveDate) {
    if (!this.signals.alternative) return null;
    try {
      const result = await this.signals.alternative.getAggregatedSignal(company.symbol);
      if (result && result.score !== undefined) {
        // Normalize to -1 to 1 if needed
        return result.score;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateContrarianSignal(companyId, effectiveDate) {
    if (!this.signals.valueSignals) return null;
    try {
      const result = this.signals.valueSignals.calculateContrarianSignal(companyId);
      if (result && result.score !== undefined) {
        return result.score;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateMagicFormulaSignal(companyId) {
    if (!this.signals.valueSignals) return null;
    try {
      const result = this.signals.valueSignals.calculateMagicFormula(companyId);
      if (result && result.combinedRank !== undefined) {
        // Lower rank = better, convert to score
        // Assuming ranks 1-100, normalize to 1 to -1
        return 1 - (result.combinedRank / 50);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  _calculateFactorSignal(companyId) {
    if (!this.factorAnalyzer) return null;
    try {
      const factors = this.factorAnalyzer.getStockFactorScores(companyId);
      if (!factors) return null;

      // Combine factor scores with equal weight
      const factorWeights = {
        value: 0.2,
        quality: 0.25,
        momentum: 0.2,
        growth: 0.15,
        size: 0.1,
        dividend: 0.1
      };

      let score = 0;
      let totalWeight = 0;

      for (const [factor, weight] of Object.entries(factorWeights)) {
        if (factors[factor] !== undefined) {
          // Factor scores are typically percentiles (0-100), normalize to -1 to 1
          score += ((factors[factor] - 50) / 50) * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight === 0) return null;
      return Math.max(-1, Math.min(1, score / totalWeight));
    } catch (e) {
      return null;
    }
  }

  /**
   * Calculate ML prediction signal using deep learning models
   * @param {string} symbol - Stock symbol
   * @param {string} asOfDate - Prediction date
   * @returns {Object|null} Signal result with score, uncertainty, and confidence
   */
  async _calculateMLPredictionSignal(symbol, asOfDate) {
    if (!this.deepLearningClient) {
      return null;
    }

    try {
      const predictions = await this.deepLearningClient.predict(
        [symbol],
        asOfDate,
        {
          modelType: 'ensemble',  // Use ensemble if available, else latest LSTM
          returnUncertainty: true
        }
      );

      const prediction = predictions[symbol];
      if (!prediction || prediction.error) {
        return null;
      }

      // Convert expected return to signal score (-1 to 1)
      // Expected return is typically annualized percentage
      // Scale: +/- 20% annual return maps to +/- 1.0 score
      const returnScale = 0.20;
      const score = Math.max(-1, Math.min(1, prediction.expected_return / returnScale));

      // Confidence is inverse of uncertainty (clamped to 0-1)
      // Lower uncertainty = higher confidence
      const uncertainty = prediction.uncertainty || 0.5;
      const confidence = Math.max(0.1, Math.min(0.9, prediction.confidence || (1 - uncertainty)));

      return {
        score,
        uncertainty,
        confidence,
        modelType: prediction.model_type || 'unknown',
        rawReturn: prediction.expected_return
      };
    } catch (e) {
      // Silently fail - ML is an optional enhancement
      return null;
    }
  }

  /**
   * Get ML prediction statistics
   * @returns {Object} ML stats or null if not available
   */
  getMLStats() {
    if (!this.deepLearningClient) {
      return null;
    }

    return this.deepLearningClient.getStats();
  }

  /**
   * Get strategy summary/stats
   */
  getSummary() {
    return {
      availableSignals: Object.keys(this.signals).filter(k => this.signals[k]),
      regimeDetection: {
        vix: !!this.regimeDetector,
        hmm: !!this.regimeHMM
      },
      factorAnalysis: !!this.factorAnalyzer,
      mlComponents: {
        combiner: !!this.signalCombiner,
        decorrelation: !!this.signalDecorrelation,
        deepLearning: !!this.deepLearningClient
      },
      simulationDate: this.simulationDate,
      signalCount: 16  // Now including ML prediction
    };
  }
}

module.exports = { UnifiedStrategyEngine, DEFAULT_SIGNAL_WEIGHTS };
