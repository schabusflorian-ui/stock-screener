// src/services/agent/tradingAgent.js
// Trading Agent - Core decision engine for AI trading recommendations
// Enhanced with alternative data, margin of safety, 13F delta, and earnings momentum signals
// Now with IC-optimized weights via SignalOptimizer
// Added: Value quality signals (Piotroski F-Score, Altman Z-Score, Contrarian signal)

const { SignalEnhancements } = require('../signalEnhancements');
const { SignalOptimizer } = require('./signalOptimizer');
const { RecommendationTracker } = require('./recommendationTracker');
const { ValueSignals } = require('../signals/valueSignals');

// NEW: ML-powered components
const { getRegimeHMM } = require('../ml');
const { FactorExposureAnalyzer } = require('../factors/factorExposure');
const { getSignalCombiner } = require('../ml');

// NEW: Parametric distributions for confidence intervals
let ParametricDistributions = null;
try {
  const statsModule = require('../statistics');
  ParametricDistributions = statsModule.ParametricDistributions;
} catch (e) {
  // Gracefully degrade if not available
  console.warn('Parametric distributions not available:', e.message);
}

// NEW: DCF Calculator for probabilistic valuation
let DCFCalculator = null;
try {
  DCFCalculator = require('../dcfCalculator');
} catch (e) {
  console.warn('DCF Calculator not available:', e.message);
}

const ACTIONS = {
  STRONG_BUY: 'strong_buy',
  BUY: 'buy',
  HOLD: 'hold',
  SELL: 'sell',
  STRONG_SELL: 'strong_sell',
};

class TradingAgent {
  constructor(db, options = {}) {
    this.db = db;

    // Region for sentiment data (US, EU, UK, or 'all' for combined)
    this.region = options.region || 'US';

    // Configurable weights for signal aggregation
    // 9 signal types for comprehensive analysis
    this.weights = {
      technical: options.technicalWeight || 0.11,
      sentiment: options.sentimentWeight || 0.11,
      insider: options.insiderWeight || 0.11,           // Basic insider activity
      fundamental: options.fundamentalWeight || 0.13,
      alternativeData: options.alternativeDataWeight || 0.11, // Congress, short interest, contracts
      valuation: options.valuationWeight || 0.11,             // Margin of safety
      thirteenF: options.thirteenFWeight || 0.12,             // Super-investor 13F changes
      earningsMomentum: options.earningsMomentumWeight || 0.10, // Consecutive beats/misses
      valueQuality: options.valueQualityWeight || 0.10,       // Piotroski, Altman, Contrarian
    };

    // Initialize signal enhancements service
    this.signalEnhancements = new SignalEnhancements(db);

    // Initialize value signals service (Piotroski, Altman, Contrarian)
    this.valueSignals = new ValueSignals(db);

    // Initialize signal optimizer for IC-based dynamic weights
    this.signalOptimizer = new SignalOptimizer(db);
    this.useOptimizedWeights = options.useOptimizedWeights !== false; // Default to true

    // Initialize recommendation tracker
    this.recommendationTracker = new RecommendationTracker(db);
    this.trackRecommendations = options.trackRecommendations !== false; // Default to true

    // Earnings date filter configuration
    this.earningsBlackoutDays = options.earningsBlackoutDays || 7; // Skip stocks with earnings in next 7 days
    this.applyEarningsFilter = options.applyEarningsFilter !== false; // Default to true

    // NEW: ML-powered components (lazy initialization)
    this.useHMMRegime = options.useHMMRegime !== false; // Default to true - use HMM for regime detection
    this.useMLCombiner = options.useMLCombiner || false; // Default to false - opt-in for ML signal combination
    this.useFactorExposure = options.useFactorExposure !== false; // Default to true - include factor analysis
    this._regimeHMM = null; // Lazy loaded
    this._factorAnalyzer = null; // Lazy loaded
    this._mlCombiner = null; // Lazy loaded

    // NEW: Parametric confidence intervals
    this.includeConfidenceIntervals = options.includeConfidenceIntervals !== false; // Default to true
    this._parametricDist = null; // Lazy loaded

    // NEW: Probabilistic DCF for enhanced valuation signals
    this.useProbabilisticDCF = options.useProbabilisticDCF !== false; // Default to true
    this._dcfCalculator = null; // Lazy loaded
    this._probabilisticDCFCache = new Map(); // Cache results (expensive to compute)
    this._probabilisticDCFCacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours

    this._prepareStatements();
    console.log(`🤖 Trading Agent initialized (region: ${this.region}, 9 signals + IC-optimized weights + HMM regime + factors + probabilistic DCF)`);
  }

  // Lazy loaders for ML components (avoid circular deps and slow startup)
  _getRegimeHMM() {
    if (!this._regimeHMM) {
      try {
        this._regimeHMM = getRegimeHMM(this.db);
      } catch (error) {
        console.warn('Failed to initialize HMM regime model:', error.message);
        this._regimeHMM = null;
      }
    }
    return this._regimeHMM;
  }

  _getFactorAnalyzer() {
    if (!this._factorAnalyzer) {
      try {
        this._factorAnalyzer = new FactorExposureAnalyzer(this.db);
      } catch (error) {
        console.warn('Failed to initialize Factor Analyzer:', error.message);
        this._factorAnalyzer = null;
      }
    }
    return this._factorAnalyzer;
  }

  _getMLCombiner() {
    if (!this._mlCombiner) {
      try {
        this._mlCombiner = getSignalCombiner(this.db);
      } catch (error) {
        console.warn('Failed to initialize ML Signal Combiner:', error.message);
        this._mlCombiner = null;
      }
    }
    return this._mlCombiner;
  }

  _getParametricDist() {
    if (!this._parametricDist && ParametricDistributions) {
      try {
        this._parametricDist = new ParametricDistributions();
      } catch (error) {
        console.warn('Failed to initialize Parametric Distributions:', error.message);
        this._parametricDist = null;
      }
    }
    return this._parametricDist;
  }

  _getDCFCalculator() {
    if (!this._dcfCalculator && DCFCalculator) {
      try {
        this._dcfCalculator = new DCFCalculator(this.db);
      } catch (error) {
        console.warn('Failed to initialize DCF Calculator:', error.message);
        this._dcfCalculator = null;
      }
    }
    return this._dcfCalculator;
  }

  /**
   * Get probabilistic DCF valuation with caching
   * Uses Monte Carlo simulation with fat-tailed distributions
   * @param {number} companyId - Company ID
   * @returns {object|null} Probabilistic valuation result or null
   */
  async _getProbabilisticDCF(companyId) {
    if (!this.useProbabilisticDCF) return null;

    // Check cache first
    const cached = this._probabilisticDCFCache.get(companyId);
    if (cached && (Date.now() - cached.timestamp) < this._probabilisticDCFCacheMaxAge) {
      return cached.data;
    }

    const dcfCalc = this._getDCFCalculator();
    if (!dcfCalc) return null;

    try {
      // Run Monte Carlo with Student's t distribution (fat tails)
      // Use fewer simulations for speed in signal generation
      const result = await dcfCalc.calculateParametricValuation(companyId, {
        simulations: 2000, // Faster than default 10k
        distributionType: 'studentT'
      });

      if (result.success) {
        // Cache the result
        this._probabilisticDCFCache.set(companyId, {
          timestamp: Date.now(),
          data: result
        });
        return result;
      }
    } catch (error) {
      console.warn(`Probabilistic DCF failed for company ${companyId}:`, error.message);
    }

    return null;
  }

  _prepareStatements() {
    this.stmts = {
      getCompany: this.db.prepare(`
        SELECT id, symbol, name, sector, industry, market_cap
        FROM companies WHERE symbol = ? COLLATE NOCASE
      `),

      getCompanyById: this.db.prepare(`
        SELECT id, symbol, name, sector, industry, market_cap
        FROM companies WHERE id = ?
      `),

      getLatestPrice: this.db.prepare(`
        SELECT close as price, date FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      getPriceMetrics: this.db.prepare(`
        SELECT * FROM price_metrics WHERE company_id = ?
      `),

      getCalculatedMetrics: this.db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 1
      `),

      getSentiment: this.db.prepare(`
        SELECT * FROM combined_sentiment
        WHERE company_id = ?
        ORDER BY calculated_at DESC
        LIMIT 1
      `),

      getSentimentByRegion: this.db.prepare(`
        SELECT * FROM combined_sentiment
        WHERE company_id = ? AND (region = ? OR region IS NULL)
        ORDER BY calculated_at DESC
        LIMIT 1
      `),

      getSentimentAllRegions: this.db.prepare(`
        SELECT
          company_id,
          AVG(combined_score) as combined_score,
          MAX(combined_signal) as combined_signal,
          AVG(confidence) as confidence,
          AVG(reddit_sentiment) as reddit_sentiment,
          AVG(news_sentiment) as news_sentiment,
          SUM(sources_used) as sources_used,
          AVG(agreement_score) as agreement_score,
          MAX(calculated_at) as calculated_at
        FROM combined_sentiment
        WHERE company_id = ?
          AND calculated_at >= datetime('now', '-24 hours')
        GROUP BY company_id
      `),

      getInsiderActivity: this.db.prepare(`
        SELECT * FROM insider_activity_summary
        WHERE company_id = ? AND period = '90d'
      `),

      getAnalystEstimates: this.db.prepare(`
        SELECT * FROM analyst_estimates
        WHERE company_id = ?
      `),

      // NEW: Alternative data signals
      getAlternativeData: this.db.prepare(`
        SELECT * FROM alternative_data_signals
        WHERE company_id = ?
        ORDER BY signal_date DESC
        LIMIT 1
      `),

      // NEW: Intrinsic value / margin of safety
      getIntrinsicValue: this.db.prepare(`
        SELECT
          weighted_intrinsic_value as intrinsic_value_per_share,
          margin_of_safety,
          valuation_signal,
          CASE
            WHEN dcf_confidence >= 0.5 THEN 'DCF'
            WHEN graham_number IS NOT NULL THEN 'Graham'
            WHEN epv_value IS NOT NULL THEN 'EPV'
            ELSE 'Blended'
          END as primary_method,
          confidence_level as confidence_score
        FROM intrinsic_value_estimates
        WHERE company_id = ?
        ORDER BY estimate_date DESC
        LIMIT 1
      `),

      // NEW: Congressional trades summary for this symbol
      getCongressTrades: this.db.prepare(`
        SELECT
          COUNT(CASE WHEN transaction_type = 'purchase' THEN 1 END) as buy_count,
          COUNT(CASE WHEN transaction_type = 'sale' THEN 1 END) as sell_count,
          SUM(CASE WHEN transaction_type = 'purchase' THEN (amount_low + COALESCE(amount_high, amount_low)) / 2 ELSE 0 END) as buy_amount,
          SUM(CASE WHEN transaction_type = 'sale' THEN (amount_low + COALESCE(amount_high, amount_low)) / 2 ELSE 0 END) as sell_amount,
          MAX(transaction_date) as last_trade_date
        FROM congressional_trades
        WHERE company_id = ?
          AND transaction_date >= date('now', '-90 days')
      `),

      // NEW: Short interest data
      getShortInterest: this.db.prepare(`
        SELECT * FROM short_interest
        WHERE company_id = ?
        ORDER BY settlement_date DESC
        LIMIT 1
      `),

      storeRecommendation: this.db.prepare(`
        INSERT INTO agent_recommendations
        (company_id, date, action, score, raw_score, confidence, position_size,
         suggested_shares, suggested_value, reasoning, signals, regime_at_time,
         price_at_time, portfolio_id)
        VALUES (?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getRecommendationHistory: this.db.prepare(`
        SELECT ar.*, c.symbol, c.name
        FROM agent_recommendations ar
        JOIN companies c ON ar.company_id = c.id
        WHERE c.symbol = ? COLLATE NOCASE
        AND ar.date >= date('now', '-' || ? || ' days')
        ORDER BY ar.created_at DESC
      `),

      getLatestRecommendation: this.db.prepare(`
        SELECT ar.*, c.symbol, c.name
        FROM agent_recommendations ar
        JOIN companies c ON ar.company_id = c.id
        WHERE c.symbol = ? COLLATE NOCASE
        ORDER BY ar.created_at DESC
        LIMIT 1
      `),

      // Check for upcoming earnings
      getUpcomingEarnings: this.db.prepare(`
        SELECT next_earnings_date as report_date
        FROM earnings_calendar
        WHERE company_id = ?
          AND next_earnings_date IS NOT NULL
          AND next_earnings_date >= date('now')
          AND next_earnings_date <= date('now', '+' || ? || ' days')
        ORDER BY next_earnings_date ASC
        LIMIT 1
      `),

      // Get average daily volume for liquidity check
      getAverageDailyVolume: this.db.prepare(`
        SELECT avg_volume_30d as avg_volume
        FROM price_metrics
        WHERE company_id = ?
      `),
    };
  }

  /**
   * Generate trading recommendation for a symbol
   * @param {string} symbol - Stock symbol
   * @param {Object} portfolioContext - Current holdings, cash, etc.
   * @param {Object} regime - Market regime from Agent 1 (or use default)
   * @returns {AgentRecommendation}
   */
  async getRecommendation(symbol, portfolioContext = null, regime = null) {
    const company = this.stmts.getCompany.get(symbol);
    if (!company) {
      throw new Error(`Company ${symbol} not found`);
    }

    // 0. Check earnings blackout period
    const earningsCheck = this._checkEarningsBlackout(company.id);
    if (earningsCheck.inBlackout && this.applyEarningsFilter) {
      return {
        symbol: company.symbol,
        companyId: company.id,
        name: company.name,
        sector: company.sector,
        action: 'hold',
        score: 0,
        rawScore: 0,
        confidence: 0.5,
        positionSize: 0,
        suggestedShares: 0,
        suggestedValue: 0,
        currentPrice: null,
        reasoning: [{
          factor: 'Earnings Blackout',
          direction: 'neutral',
          weight: 0,
          details: `Earnings report on ${earningsCheck.reportDate} (${earningsCheck.daysUntil} days) - avoiding pre-earnings volatility`,
        }],
        signals: {},
        regime: regime || this._estimateRegime(),
        timestamp: new Date().toISOString(),
        skipped: true,
        skipReason: 'earnings_blackout',
        earningsDate: earningsCheck.reportDate,
      };
    }

    // 1. Get current price
    const priceData = this.stmts.getLatestPrice.get(company.id);
    const currentPrice = priceData?.price;
    if (!currentPrice) {
      throw new Error(`No price data for ${symbol}`);
    }

    // 1.5 Check liquidity
    const liquidityCheck = this._checkLiquidity(company.id, currentPrice);

    // 2. Gather all signals
    const signals = await this._gatherSignals(company.id);

    // 3. Get or estimate market regime
    const marketRegime = regime || this._estimateRegime();

    // 4. Calculate weighted score (with ML combiner, IC-optimized weights, or regime-adaptive)
    const { score, contributions, weightsUsed, usingOptimizedWeights, usingMLCombiner } = this._calculateScore(signals, marketRegime, company);

    // 5. Adjust for regime
    let adjustedScore = this._adjustForRegime(score, marketRegime);

    // 5.5 Apply liquidity penalty
    if (liquidityCheck.isIlliquid) {
      adjustedScore *= liquidityCheck.confidenceMultiplier;
    }

    // 6. Convert to action
    const action = this._scoreToAction(adjustedScore);

    // 7. Calculate position size (now with valuation uncertainty adjustment)
    const positionSize = this._calculatePositionSize(adjustedScore, portfolioContext, marketRegime, signals);

    // 8. Calculate suggested shares/value
    let suggestedShares = 0;
    let suggestedValue = 0;
    if (portfolioContext && action.action.includes('buy')) {
      const totalValue = portfolioContext.totalValue + portfolioContext.cash;
      suggestedValue = totalValue * positionSize;
      suggestedShares = Math.floor(suggestedValue / currentPrice);
    }

    // 9. Build reasoning
    const reasoning = this._buildReasoning(contributions, signals, marketRegime);

    // Add liquidity warning if applicable
    if (liquidityCheck.isIlliquid) {
      reasoning.push({
        factor: 'Liquidity Warning',
        direction: 'cautionary',
        weight: 0,
        details: `Low liquidity (avg volume: ${liquidityCheck.avgVolumeFormatted}) - confidence reduced`,
      });
    }

    // 9.5 Get factor exposure analysis (if enabled)
    let factorExposure = null;
    if (this.useFactorExposure) {
      try {
        const analyzer = this._getFactorAnalyzer();
        if (analyzer) {
          // Quick summary is fast - full analysis could be expensive
          factorExposure = analyzer.getQuickSummary(company.symbol);

          // Add factor-based reasoning if significant exposures found
          if (factorExposure && factorExposure.dominantFactor) {
            reasoning.push({
              factor: 'Factor Profile',
              direction: 'informational',
              weight: 0,
              details: `${factorExposure.dominantFactor} stock (${factorExposure.style || 'blend'})`,
            });
          }
        }
      } catch (factorError) {
        // Factor analysis is optional - silent fail
      }
    }

    // 10. Build recommendation object
    const recommendation = {
      symbol: company.symbol,
      companyId: company.id,
      name: company.name,
      sector: company.sector,
      action: action.action,
      score: Math.round(adjustedScore * 1000) / 1000,
      rawScore: Math.round(score * 1000) / 1000,
      confidence: Math.round(action.confidence * 100) / 100,
      positionSize: Math.round(positionSize * 10000) / 10000,
      suggestedShares,
      suggestedValue: Math.round(suggestedValue * 100) / 100,
      currentPrice,
      reasoning,
      signals: {
        technical: signals.technical,
        sentiment: signals.sentiment,
        insider: signals.insider,
        fundamental: signals.fundamental,
        alternativeData: signals.alternativeData,
        valuation: signals.valuation,
        thirteenF: signals.thirteenF,
        earningsMomentum: signals.earningsMomentum,
        valueQuality: signals.valueQuality,
      },
      regime: marketRegime,
      factorExposure, // NEW: Factor analysis
      timestamp: new Date().toISOString(),
      meta: {
        usingOptimizedWeights,
        usingMLCombiner: usingMLCombiner || false,
        weightsUsed,
        liquidityCheck: liquidityCheck.isIlliquid ? 'low' : 'ok',
        regimeSource: marketRegime.source || 'threshold',
        factorAnalysisEnabled: this.useFactorExposure,
        scoringMethod: usingMLCombiner ? 'ml_gradient_boosting' : (usingOptimizedWeights ? 'ic_optimized' : 'regime_adaptive'),
      },
    };

    // 11. Store recommendation in agent_recommendations
    const recId = this._storeRecommendation(recommendation, portfolioContext?.portfolioId);
    recommendation.id = recId;

    // 12. Track recommendation for outcome analysis (if enabled)
    if (this.trackRecommendations && action.action !== 'hold') {
      try {
        const trackedId = this.recommendationTracker.trackRecommendation({
          symbol: company.symbol,
          companyId: company.id,
          action: action.action.toUpperCase(),
          signalScore: adjustedScore,
          confidence: action.confidence,
          regime: marketRegime.regime,
          signalBreakdown: signals,
          priceAtRecommendation: currentPrice,
        }, portfolioContext?.portfolioId);
        recommendation.trackedOutcomeId = trackedId;
      } catch (trackError) {
        console.warn('Failed to track recommendation:', trackError.message);
      }
    }

    return recommendation;
  }

  /**
   * Check if company is in earnings blackout period
   */
  _checkEarningsBlackout(companyId) {
    try {
      const upcoming = this.stmts.getUpcomingEarnings.get(companyId, this.earningsBlackoutDays);
      if (upcoming && upcoming.report_date) {
        const reportDate = new Date(upcoming.report_date);
        const today = new Date();
        const daysUntil = Math.ceil((reportDate - today) / (1000 * 60 * 60 * 24));
        return {
          inBlackout: true,
          reportDate: upcoming.report_date,
          daysUntil,
        };
      }
    } catch (error) {
      // Table may not exist or query failed
    }
    return { inBlackout: false };
  }

  /**
   * Check liquidity and return confidence adjustment
   */
  _checkLiquidity(companyId, currentPrice) {
    try {
      const volumeData = this.stmts.getAverageDailyVolume.get(companyId);
      if (volumeData && volumeData.avg_volume) {
        const avgVolume = volumeData.avg_volume;
        const avgDollarVolume = avgVolume * currentPrice;

        // Consider illiquid if avg daily dollar volume < $1M
        const isIlliquid = avgDollarVolume < 1000000;
        let confidenceMultiplier = 1.0;

        if (avgDollarVolume < 100000) {
          confidenceMultiplier = 0.5; // Very illiquid
        } else if (avgDollarVolume < 500000) {
          confidenceMultiplier = 0.7;
        } else if (avgDollarVolume < 1000000) {
          confidenceMultiplier = 0.85;
        }

        return {
          isIlliquid,
          avgVolume,
          avgDollarVolume,
          avgVolumeFormatted: this._formatVolume(avgVolume),
          confidenceMultiplier,
        };
      }
    } catch (error) {
      // Volume data not available
    }
    return { isIlliquid: false, confidenceMultiplier: 1.0 };
  }

  _formatVolume(volume) {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(0)}K`;
    return volume.toString();
  }

  /**
   * Gather all available signals for a company
   * Enhanced with alternative data and valuation signals
   */
  async _gatherSignals(companyId) {
    const signals = {
      technical: { score: 0, confidence: 0, source: 'technical', details: {} },
      sentiment: { score: 0, confidence: 0, source: 'sentiment', details: {} },
      insider: { score: 0, confidence: 0, source: 'insider', details: {} },
      fundamental: { score: 0, confidence: 0, source: 'fundamental', details: {} },
      alternativeData: { score: 0, confidence: 0, source: 'alternativeData', details: {} },
      valuation: { score: 0, confidence: 0, source: 'valuation', details: {} },
      thirteenF: { score: 0, confidence: 0, source: 'thirteenF', details: {} },
      earningsMomentum: { score: 0, confidence: 0, source: 'earningsMomentum', details: {} },
      valueQuality: { score: 0, confidence: 0, source: 'valueQuality', details: {} },
    };

    // Technical signal from price metrics
    const priceMetrics = this.stmts.getPriceMetrics.get(companyId);
    if (priceMetrics) {
      signals.technical = this._buildTechnicalSignal(priceMetrics);
    }

    // Sentiment signal (region-aware)
    let sentiment;
    if (this.region === 'all') {
      // Aggregate sentiment from all regions
      sentiment = this.stmts.getSentimentAllRegions.get(companyId);
    } else if (this.region && this.region !== 'US') {
      // Get region-specific sentiment (EU, UK)
      sentiment = this.stmts.getSentimentByRegion.get(companyId, this.region);
    } else {
      // Default to US or legacy data
      sentiment = this.stmts.getSentimentByRegion.get(companyId, 'US');
    }
    if (sentiment) {
      signals.sentiment = this._buildSentimentSignal(sentiment);
    }

    // Insider signal
    const insider = this.stmts.getInsiderActivity.get(companyId);
    if (insider) {
      signals.insider = this._buildInsiderSignal(insider);
    }

    // Fundamental signal from analyst estimates + calculated metrics
    const analyst = this.stmts.getAnalystEstimates.get(companyId);
    const metrics = this.stmts.getCalculatedMetrics.get(companyId);
    signals.fundamental = this._buildFundamentalSignal(analyst, metrics);

    // NEW: Alternative data signal (congressional trades, short interest, contracts)
    const altData = this.stmts.getAlternativeData.get(companyId);
    const congressTrades = this.stmts.getCongressTrades.get(companyId);
    const shortInterest = this.stmts.getShortInterest.get(companyId);
    signals.alternativeData = this._buildAlternativeDataSignal(altData, congressTrades, shortInterest);

    // NEW: Valuation signal (margin of safety from intrinsic value)
    // Enhanced with probabilistic DCF for probability-based conviction
    const intrinsicValue = this.stmts.getIntrinsicValue.get(companyId);
    const probabilisticDCF = await this._getProbabilisticDCF(companyId);
    signals.valuation = this._buildValuationSignal(intrinsicValue, priceMetrics, probabilisticDCF);

    // NEW: 13F delta signal (super-investor position changes)
    const thirteenFSignal = this.signalEnhancements.get13FSignal(companyId);
    if (thirteenFSignal && thirteenFSignal.confidence > 0) {
      signals.thirteenF = thirteenFSignal;
    }

    // NEW: Earnings momentum signal (consecutive beats/misses)
    const earningsSignal = this.signalEnhancements.getEarningsMomentumSignal(companyId);
    if (earningsSignal && earningsSignal.confidence > 0) {
      signals.earningsMomentum = earningsSignal;
    }

    // ENHANCED: Use classified insider signal (open market buys weighted higher)
    const classifiedInsider = this.signalEnhancements.getInsiderSignal(companyId);
    if (classifiedInsider && classifiedInsider.confidence > 0.3) {
      // Blend with basic insider signal, favor classified version
      const basicScore = signals.insider.score || 0;
      const classifiedScore = classifiedInsider.score || 0;
      signals.insider = {
        ...signals.insider,
        score: (basicScore * 0.3 + classifiedScore * 0.7),
        confidence: Math.max(signals.insider.confidence, classifiedInsider.confidence),
        details: {
          ...signals.insider.details,
          classified: classifiedInsider.details,
        },
        interpretation: classifiedInsider.interpretation,
      };
    }

    // NEW: Value quality signal (Piotroski F-Score, Altman Z-Score, Contrarian)
    try {
      const valueSignal = this.valueSignals.getCombinedValueSignal(companyId);
      if (valueSignal && valueSignal.confidence > 0) {
        signals.valueQuality = valueSignal;
      }
    } catch (err) {
      // Value signals may not be available for all companies
      // Silent fail - signal will remain at default (0, 0)
    }

    return signals;
  }

  /**
   * Build technical signal from price metrics
   */
  _buildTechnicalSignal(priceMetrics) {
    let score = 0;
    let confidence = 0.5;
    const details = {};

    // Alpha signals (vs benchmark)
    if (priceMetrics.alpha_1m !== null) {
      const alphaScore = Math.max(-1, Math.min(1, priceMetrics.alpha_1m / 20)); // Normalize to -1 to 1
      score += alphaScore * 0.3;
      details.alpha1m = priceMetrics.alpha_1m;
    }

    if (priceMetrics.alpha_3m !== null) {
      const alphaScore = Math.max(-1, Math.min(1, priceMetrics.alpha_3m / 30));
      score += alphaScore * 0.2;
      details.alpha3m = priceMetrics.alpha_3m;
    }

    // 52-week position
    if (priceMetrics.high_52w && priceMetrics.low_52w && priceMetrics.last_price) {
      const range = priceMetrics.high_52w - priceMetrics.low_52w;
      if (range > 0) {
        const position = (priceMetrics.last_price - priceMetrics.low_52w) / range;
        // Contrarian: near 52w low is bullish, near 52w high less so
        const positionScore = (0.5 - position) * 0.5; // -0.25 to 0.25
        score += positionScore;
        details.position52w = Math.round(position * 100);
      }
    }

    // Change momentum
    if (priceMetrics.change_1m !== null) {
      const momentumScore = Math.max(-1, Math.min(1, priceMetrics.change_1m / 15));
      score += momentumScore * 0.2;
      details.change1m = priceMetrics.change_1m;
    }

    // Normalize final score to -1 to 1
    score = Math.max(-1, Math.min(1, score));

    // Confidence based on data availability
    const dataPoints = Object.keys(details).length;
    confidence = Math.min(0.9, 0.3 + (dataPoints * 0.15));

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'technical',
      signal: this._getSignalLabel(score),
      interpretation: this._getTechnicalInterpretation(score, details),
      details,
    };
  }

  /**
   * Build sentiment signal from combined sentiment
   */
  _buildSentimentSignal(sentiment) {
    const score = sentiment.combined_score || 0;
    const confidence = sentiment.confidence || 0.5;

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'sentiment',
      signal: sentiment.combined_signal || this._getSignalLabel(score),
      details: {
        reddit: sentiment.reddit_sentiment,
        stocktwits: sentiment.stocktwits_sentiment,
        news: sentiment.news_sentiment,
        market: sentiment.market_sentiment,
        sourcesUsed: sentiment.sources_used,
        agreement: sentiment.agreement_score,
      },
    };
  }

  /**
   * Build insider signal from insider activity summary
   */
  _buildInsiderSignal(insider) {
    let score = 0;
    let confidence = 0.5;

    // Map insider_signal to score
    const signalMap = {
      'strong_buy': 1,
      'buy': 0.5,
      'bullish': 0.5,
      'neutral': 0,
      'sell': -0.5,
      'bearish': -0.5,
      'strong_sell': -1,
    };

    if (insider.insider_signal) {
      score = signalMap[insider.insider_signal.toLowerCase()] || 0;
    }

    // Boost confidence based on activity volume
    const totalTransactions = (insider.buy_count || 0) + (insider.sell_count || 0);
    if (totalTransactions >= 10) confidence = 0.85;
    else if (totalTransactions >= 5) confidence = 0.7;
    else if (totalTransactions >= 2) confidence = 0.55;
    else confidence = 0.4;

    // Consider net value
    const netValue = insider.net_value || 0;
    if (Math.abs(netValue) > 1000000) {
      // Significant insider activity
      score = score * 1.2; // Amplify signal
      score = Math.max(-1, Math.min(1, score));
    }

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'insider',
      signal: insider.insider_signal || this._getSignalLabel(score),
      details: {
        buyCount: insider.buy_count,
        buyValue: insider.buy_value,
        sellCount: insider.sell_count,
        sellValue: insider.sell_value,
        netValue: netValue,
        uniqueBuyers: insider.unique_buyers,
        uniqueSellers: insider.unique_sellers,
      },
    };
  }

  /**
   * Build fundamental signal from analyst estimates and metrics
   */
  _buildFundamentalSignal(analyst, metrics) {
    let score = 0;
    let confidence = 0.5;
    const details = {};

    // Analyst recommendations (weighted heavily)
    if (analyst) {
      // recommendation_mean: 1 = Strong Buy, 5 = Strong Sell
      if (analyst.recommendation_mean) {
        const analystScore = (3 - analyst.recommendation_mean) / 2; // Convert to -1 to 1
        score += analystScore * 0.5;
        details.recommendationMean = analyst.recommendation_mean;
        details.recommendationKey = analyst.recommendation_key;
      }

      // Upside potential
      if (analyst.upside_potential) {
        const upsideScore = Math.max(-1, Math.min(1, analyst.upside_potential / 50));
        score += upsideScore * 0.3;
        details.upsidePotential = analyst.upside_potential;
      }

      // Confidence based on analyst count
      if (analyst.number_of_analysts >= 20) confidence = 0.9;
      else if (analyst.number_of_analysts >= 10) confidence = 0.75;
      else if (analyst.number_of_analysts >= 5) confidence = 0.6;
      else if (analyst.number_of_analysts >= 1) confidence = 0.45;

      details.numberOfAnalysts = analyst.number_of_analysts;
    }

    // Add quality metrics if available
    if (metrics) {
      // ROIC quality signal
      if (metrics.roic !== null) {
        if (metrics.roic > 20) score += 0.1;
        else if (metrics.roic > 15) score += 0.05;
        else if (metrics.roic < 5) score -= 0.05;
        details.roic = metrics.roic;
      }

      // FCF yield value signal
      if (metrics.fcf_yield !== null) {
        if (metrics.fcf_yield > 8) score += 0.1;
        else if (metrics.fcf_yield > 5) score += 0.05;
        else if (metrics.fcf_yield < 0) score -= 0.1;
        details.fcfYield = metrics.fcf_yield;
      }

      // Debt check
      if (metrics.debt_to_equity !== null) {
        if (metrics.debt_to_equity > 2) score -= 0.05;
        details.debtToEquity = metrics.debt_to_equity;
      }
    }

    // Normalize
    score = Math.max(-1, Math.min(1, score));

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'fundamental',
      signal: this._getSignalLabel(score),
      details,
    };
  }

  /**
   * Build alternative data signal from congressional trades, short interest, and contracts
   * This captures "smart money" activity and market structure signals
   */
  _buildAlternativeDataSignal(altData, congressTrades, shortInterest) {
    let score = 0;
    let confidence = 0.3; // Base confidence for alternative data
    const details = {};
    let dataPoints = 0;

    // Congressional trades signal (40% weight within alt data)
    if (congressTrades && (congressTrades.buy_count || congressTrades.sell_count)) {
      const netCount = congressTrades.buy_count - congressTrades.sell_count;
      const netAmount = (congressTrades.buy_amount || 0) - (congressTrades.sell_amount || 0);

      // Score based on net buying/selling with amount consideration
      let congressScore = 0;
      if (netCount !== 0) {
        // Base score from trade direction
        congressScore = Math.max(-1, Math.min(1, netCount / 3)); // ±3 trades = max signal

        // Amplify if amounts are significant ($100K+ is meaningful)
        if (Math.abs(netAmount) > 100000) {
          congressScore *= 1.2;
          congressScore = Math.max(-1, Math.min(1, congressScore));
        }
      }

      score += congressScore * 0.40;
      details.congressBuys = congressTrades.buy_count;
      details.congressSells = congressTrades.sell_count;
      details.congressNetAmount = netAmount;
      details.lastCongressTrade = congressTrades.last_trade_date;
      dataPoints++;
    }

    // Short interest signal (35% weight within alt data)
    if (shortInterest) {
      const shortPctFloat = shortInterest.short_pct_float || 0;
      const daysToCover = shortInterest.days_to_cover || 0;

      // High short interest can be bearish OR squeeze opportunity
      let shortScore = 0;
      if (shortPctFloat > 0) {
        if (shortPctFloat < 0.03) {
          // Low short interest - neutral to slightly bullish (no pessimism)
          shortScore = 0.1;
        } else if (shortPctFloat < 0.10) {
          // Moderate short interest - neutral
          shortScore = 0;
        } else if (shortPctFloat < 0.20) {
          // High short interest - bearish pressure
          shortScore = -0.3;
        } else {
          // Very high short - potential squeeze if days to cover high
          if (daysToCover > 5) {
            // Squeeze potential is bullish
            shortScore = 0.4;
            details.squeezeCandidate = true;
          } else {
            shortScore = -0.4; // Still bearish if easy to cover
          }
        }
      }

      score += shortScore * 0.35;
      details.shortPctFloat = shortPctFloat;
      details.daysToCover = daysToCover;
      dataPoints++;
    }

    // Pre-aggregated alternative data signal (25% weight - contracts and combined)
    if (altData && altData.combined_score !== null) {
      score += altData.combined_score * 0.25;
      details.contractSignal = altData.contract_signal;
      details.contractValue = altData.recent_contract_value;
      details.altDataScore = altData.combined_score;
      dataPoints++;
    }

    // Confidence based on data availability
    if (dataPoints >= 3) {
      confidence = 0.75;
    } else if (dataPoints >= 2) {
      confidence = 0.55;
    } else if (dataPoints >= 1) {
      confidence = 0.4;
    }

    // Normalize score
    score = Math.max(-1, Math.min(1, score));

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'alternativeData',
      signal: this._getSignalLabel(score),
      interpretation: this._getAltDataInterpretation(score, details),
      details,
    };
  }

  /**
   * Build valuation signal from intrinsic value / margin of safety
   * Core value investing signal - Buffett/Graham style
   * Enhanced with probabilistic DCF for probability-based conviction
   *
   * @param {object} intrinsicValue - Deterministic intrinsic value estimate
   * @param {object} priceMetrics - Current price data
   * @param {object} probabilisticDCF - Monte Carlo DCF result (optional)
   */
  _buildValuationSignal(intrinsicValue, priceMetrics, probabilisticDCF = null) {
    let score = 0;
    let confidence = 0.3;
    const details = {};

    if (!intrinsicValue || !priceMetrics?.last_price) {
      return {
        score: 0,
        confidence: 0,
        source: 'valuation',
        signal: 'neutral',
        details: { noData: true },
      };
    }

    const currentPrice = priceMetrics.last_price;
    const ivPerShare = intrinsicValue.intrinsic_value_per_share;

    if (ivPerShare && ivPerShare > 0) {
      // Calculate margin of safety (deterministic)
      const marginOfSafety = (ivPerShare - currentPrice) / ivPerShare;
      details.intrinsicValue = ivPerShare;
      details.currentPrice = currentPrice;
      details.marginOfSafety = marginOfSafety;
      details.valuationMethod = intrinsicValue.primary_method;

      // Score based on margin of safety
      // >40% undervalued = strong buy, >20% = buy, fair value = hold, overvalued = sell
      if (marginOfSafety >= 0.40) {
        score = 1.0;  // Deeply undervalued
        confidence = 0.85;
        details.valuationSignal = 'DEEPLY_UNDERVALUED';
      } else if (marginOfSafety >= 0.25) {
        score = 0.7;  // Undervalued
        confidence = 0.75;
        details.valuationSignal = 'UNDERVALUED';
      } else if (marginOfSafety >= 0.10) {
        score = 0.3;  // Slightly undervalued
        confidence = 0.6;
        details.valuationSignal = 'SLIGHTLY_UNDERVALUED';
      } else if (marginOfSafety >= -0.10) {
        score = 0;    // Fair value
        confidence = 0.5;
        details.valuationSignal = 'FAIR_VALUE';
      } else if (marginOfSafety >= -0.25) {
        score = -0.4; // Overvalued
        confidence = 0.6;
        details.valuationSignal = 'OVERVALUED';
      } else {
        score = -0.8; // Significantly overvalued
        confidence = 0.7;
        details.valuationSignal = 'SIGNIFICANTLY_OVERVALUED';
      }

      // Adjust confidence based on methodology confidence
      if (intrinsicValue.confidence_score) {
        confidence *= intrinsicValue.confidence_score;
      }

      // ENHANCED: Incorporate probabilistic DCF insights
      if (probabilisticDCF && probabilisticDCF.probabilisticValuation) {
        const probVal = probabilisticDCF.probabilisticValuation;
        const probs = probVal.probabilities || {};

        // Store probabilistic details
        details.probabilistic = {
          expectedValue: probVal.expectedValue,
          medianValue: probVal.percentiles?.p50,
          p5Value: probVal.percentiles?.p5,
          p95Value: probVal.percentiles?.p95,
          pUndervalued20: probs.undervalued20pct,
          pOvervalued: probs.overvalued,
          coefficientOfVariation: probVal.coefficientOfVariation,
          skewness: probVal.moments?.skewness,
          kurtosis: probVal.moments?.kurtosis
        };

        // Probability-based score adjustment
        // P(undervalued 20%+) > 70% → Strong conviction boost
        // P(overvalued) > 60% → Reduce score
        // High CV > 50% → Reduce confidence (high uncertainty)
        const pUndervalued20 = probs.undervalued20pct || 0;
        const pOvervalued = probs.overvalued || 0;
        const cv = probVal.coefficientOfVariation || 0;

        // Adjust score based on probability of undervaluation
        if (pUndervalued20 > 70) {
          // High probability of 20%+ upside → boost score
          score = Math.min(1.0, score + 0.2);
          details.probabilisticSignal = 'STRONG_PROBABILITY_UNDERVALUED';
          details.probabilityBoost = true;
        } else if (pUndervalued20 > 50) {
          // Moderate probability → small boost
          score = Math.min(1.0, score + 0.1);
          details.probabilisticSignal = 'MODERATE_PROBABILITY_UNDERVALUED';
        } else if (pOvervalued > 60) {
          // High probability of overvaluation → reduce score
          score = Math.max(-1.0, score - 0.2);
          details.probabilisticSignal = 'HIGH_PROBABILITY_OVERVALUED';
          details.probabilityPenalty = true;
        } else if (pOvervalued > 40 && pUndervalued20 < 30) {
          // Likely overvalued → small penalty
          score = Math.max(-1.0, score - 0.1);
          details.probabilisticSignal = 'MODERATE_PROBABILITY_OVERVALUED';
        }

        // Uncertainty adjustment to confidence
        // High CV (>50%) means wide valuation range → reduce confidence
        if (cv > 50) {
          confidence *= 0.7;  // High uncertainty
          details.highUncertainty = true;
          details.uncertaintyReason = 'Wide valuation range (CV > 50%)';
        } else if (cv > 30) {
          confidence *= 0.85; // Moderate uncertainty
        }

        // Fat tail adjustment
        // High kurtosis means extreme outcomes more likely
        const kurtosis = probVal.moments?.kurtosis || 3;
        if (kurtosis > 6) {
          confidence *= 0.85; // Extreme fat tails - less predictable
          details.fatTailWarning = 'EXTREME';
        } else if (kurtosis > 4) {
          confidence *= 0.9;  // Fat tails present
          details.fatTailWarning = 'MODERATE';
        }

        // Skewness insight
        const skewness = probVal.moments?.skewness || 0;
        if (skewness > 0.5) {
          details.skewnessInsight = 'Positively skewed - more upside scenarios';
        } else if (skewness < -0.5) {
          details.skewnessInsight = 'Negatively skewed - more downside scenarios';
          // Negative skew is concerning for long positions
          if (score > 0) {
            confidence *= 0.95;
          }
        }
      }
    }

    return {
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      source: 'valuation',
      signal: this._getSignalLabel(score),
      interpretation: this._getValuationInterpretation(score, details),
      details,
    };
  }

  _getAltDataInterpretation(score, details) {
    const parts = [];

    if (details.congressBuys > 0 || details.congressSells > 0) {
      const netCongress = details.congressBuys - details.congressSells;
      if (netCongress > 0) {
        parts.push(`${details.congressBuys} congressional buys (net +${netCongress})`);
      } else if (netCongress < 0) {
        parts.push(`${details.congressSells} congressional sells (net ${netCongress})`);
      }
    }

    if (details.shortPctFloat) {
      const pct = (details.shortPctFloat * 100).toFixed(1);
      if (details.squeezeCandidate) {
        parts.push(`${pct}% short interest (squeeze candidate)`);
      } else if (details.shortPctFloat > 0.15) {
        parts.push(`${pct}% short interest (high)`);
      } else if (details.shortPctFloat > 0.05) {
        parts.push(`${pct}% short interest`);
      }
    }

    if (details.contractValue && details.contractValue > 0) {
      const millions = (details.contractValue / 1000000).toFixed(1);
      parts.push(`$${millions}M govt contracts`);
    }

    return parts.length > 0 ? parts.join('; ') : `Alternative data score: ${score.toFixed(2)}`;
  }

  _getValuationInterpretation(score, details) {
    if (details.noData) {
      return 'No intrinsic value estimate available';
    }

    const mos = details.marginOfSafety;
    if (mos === undefined) {
      return 'Unable to calculate margin of safety';
    }

    const mosPct = (mos * 100).toFixed(0);
    const method = details.valuationMethod || 'blended';

    if (mos > 0) {
      return `${mosPct}% margin of safety (${method}): trading below intrinsic value`;
    } else {
      return `${Math.abs(mosPct)}% premium to intrinsic value (${method})`;
    }
  }

  /**
   * Estimate market regime from available data
   * Enhanced with HMM probabilistic regime detection and macro signals
   */
  _estimateRegime() {
    // Try HMM-based regime detection first (if enabled and trained)
    if (this.useHMMRegime) {
      const hmmResult = this._getHMMRegime();
      if (hmmResult) {
        return hmmResult;
      }
    }

    // Fallback to threshold-based detection
    return this._estimateRegimeFallback();
  }

  /**
   * Get regime from Hidden Markov Model
   * Uses probabilistic transition model for more robust detection
   */
  _getHMMRegime() {
    try {
      const hmmService = this._getRegimeHMM();
      if (!hmmService) return null;

      const result = hmmService.getCurrentRegime();
      if (!result || !result.regime) return null;

      // Map HMM states to TradingAgent regime names
      const stateMap = {
        'CRISIS': 'CRISIS',
        'HIGH_VOL': 'HIGH_VOL',
        'NORMAL': 'SIDEWAYS',
        'LOW_VOL': 'BULL',
      };

      const regime = stateMap[result.regime] || 'SIDEWAYS';
      const confidence = result.probability || 0.5;

      // Get transition probabilities for next-period outlook
      const transitions = result.transitions || {};
      const stayProbability = transitions[result.regime] || 0.5;
      const worstCaseProb = Math.max(
        transitions['CRISIS'] || 0,
        transitions['HIGH_VOL'] || 0
      );

      // Adjust confidence based on regime stability
      let adjustedConfidence = confidence;
      if (stayProbability < 0.5) {
        adjustedConfidence *= 0.85; // Regime may be transitioning
      }

      // Get macro signals for additional context
      const macroSignals = this._getMacroSignals();

      // Apply macro adjustments (same as fallback)
      let adjustedRegime = regime;
      if (macroSignals.yieldCurveInverted && regime === 'BULL') {
        adjustedRegime = 'SIDEWAYS';
        adjustedConfidence *= 0.85;
      }

      return {
        regime: adjustedRegime,
        confidence: Math.round(adjustedConfidence * 100) / 100,
        vix: result.observations?.vix || null,
        fearGreed: null, // HMM uses VIX directly
        macro: macroSignals,
        hmm: {
          rawState: result.regime,
          probability: result.probability,
          transitions: result.transitions,
          stayProbability,
          crisisRisk: worstCaseProb,
        },
        breadth: result.observations?.breadth || null,
        trendStrength: result.observations?.momentum || null,
        description: this._getRegimeDescription(adjustedRegime),
        source: 'HMM',
      };
    } catch (error) {
      console.warn('HMM regime detection failed, falling back:', error.message);
      return null;
    }
  }

  /**
   * Fallback threshold-based regime detection
   */
  _estimateRegimeFallback() {
    // Try to get latest market sentiment for VIX/Fear & Greed
    const marketData = this.db.prepare(`
      SELECT indicator_type, indicator_value, indicator_label
      FROM market_sentiment
      WHERE indicator_type IN ('vix', 'cnn_fear_greed', 'overall_market')
      ORDER BY fetched_at DESC
      LIMIT 3
    `).all();

    let regime = 'SIDEWAYS';
    let confidence = 0.5;
    let vix = null;
    let fearGreed = null;

    for (const data of marketData) {
      if (data.indicator_type === 'vix') {
        vix = data.indicator_value;
      } else if (data.indicator_type === 'cnn_fear_greed') {
        fearGreed = data.indicator_value;
      }
    }

    // Check for macro signals (yield curve inversion, unemployment, etc.)
    const macroSignals = this._getMacroSignals();

    // Base regime classification from VIX
    if (vix !== null) {
      if (vix > 35) {
        regime = 'CRISIS';
        confidence = 0.8;
      } else if (vix > 25) {
        regime = 'HIGH_VOL';
        confidence = 0.7;
      } else if (vix < 15 && fearGreed && fearGreed > 60) {
        regime = 'BULL';
        confidence = 0.7;
      } else if (vix > 20 && fearGreed && fearGreed < 30) {
        regime = 'BEAR';
        confidence = 0.65;
      }
    }

    // Adjust regime based on macro signals
    if (macroSignals.yieldCurveInverted) {
      // Yield curve inversion is a leading recession indicator
      if (regime === 'BULL') {
        regime = 'SIDEWAYS';
        confidence *= 0.85;
      } else if (regime === 'SIDEWAYS') {
        regime = 'BEAR';
        confidence *= 0.9;
      }
    }

    if (macroSignals.unemploymentRising && regime !== 'CRISIS') {
      if (regime === 'BULL') {
        regime = 'SIDEWAYS';
      } else if (regime === 'SIDEWAYS') {
        regime = 'BEAR';
      }
    }

    if (macroSignals.highInflation && regime === 'BULL') {
      confidence *= 0.9;
    }

    return {
      regime,
      confidence,
      vix,
      fearGreed,
      macro: macroSignals,
      breadth: null,
      trendStrength: null,
      description: this._getRegimeDescription(regime),
      source: 'threshold',
    };
  }

  /**
   * Get macro signals from FRED data if available
   */
  _getMacroSignals() {
    const signals = {
      yieldCurveInverted: false,
      unemploymentRising: false,
      highInflation: false,
      spreadIndicator: null,
      unemploymentRate: null,
      cpiYoY: null,
    };

    try {
      // Check for yield curve data (10Y-2Y spread)
      const yieldSpread = this.db.prepare(`
        SELECT
          fi.value,
          fi.observation_date
        FROM fred_indicators fi
        WHERE fi.series_id IN ('T10Y2Y', 'T10Y3M')
        ORDER BY fi.observation_date DESC
        LIMIT 1
      `).get();

      if (yieldSpread && yieldSpread.value !== null) {
        signals.spreadIndicator = yieldSpread.value;
        signals.yieldCurveInverted = yieldSpread.value < 0;
      }

      // Check unemployment trend
      const unemployment = this.db.prepare(`
        SELECT fi.value, fi.observation_date
        FROM fred_indicators fi
        WHERE fi.series_id = 'UNRATE'
        ORDER BY fi.observation_date DESC
        LIMIT 3
      `).all();

      if (unemployment.length >= 2) {
        signals.unemploymentRate = unemployment[0].value;
        // Rising if current > 3-month average
        const avgRecent = unemployment.reduce((a, b) => a + b.value, 0) / unemployment.length;
        signals.unemploymentRising = unemployment[0].value > avgRecent + 0.2;
      }

      // Check inflation (CPI YoY)
      const cpi = this.db.prepare(`
        SELECT fi.value, fi.observation_date
        FROM fred_indicators fi
        WHERE fi.series_id = 'CPIAUCSL'
        ORDER BY fi.observation_date DESC
        LIMIT 13
      `).all();

      if (cpi.length >= 13) {
        // Calculate YoY inflation
        const currentCpi = cpi[0].value;
        const yearAgoCpi = cpi[12].value;
        if (currentCpi && yearAgoCpi) {
          const yoyInflation = ((currentCpi - yearAgoCpi) / yearAgoCpi) * 100;
          signals.cpiYoY = yoyInflation;
          signals.highInflation = yoyInflation > 4; // >4% is high
        }
      }
    } catch (error) {
      // FRED tables may not exist or have data
      // Silent fail - macro signals are optional enhancement
    }

    return signals;
  }

  _getRegimeDescription(regime) {
    const descriptions = {
      'BULL': 'Bullish market conditions - favorable for risk-taking',
      'BEAR': 'Bearish market conditions - defensive positioning recommended',
      'SIDEWAYS': 'Range-bound market - selective opportunities',
      'HIGH_VOL': 'High volatility environment - reduced position sizes recommended',
      'CRISIS': 'Crisis conditions - maximum caution advised',
    };
    return descriptions[regime] || 'Unknown market conditions';
  }

  /**
   * Calculate weighted score from all signals
   * Uses ML combiner (gradient boosting) when enabled, otherwise IC-optimized or regime-adaptive weights
   */
  _calculateScore(signals, regime, company = null) {
    // Try ML combiner first (if enabled and trained)
    if (this.useMLCombiner) {
      const mlResult = this._getMLCombinedScore(signals, regime, company);
      if (mlResult) {
        return mlResult;
      }
    }

    // Fall back to linear weighted combination
    return this._calculateLinearScore(signals, regime);
  }

  /**
   * Get ML-combined score using gradient boosting
   */
  _getMLCombinedScore(signals, regime, company) {
    try {
      const mlCombiner = this._getMLCombiner();
      if (!mlCombiner || !mlCombiner.isModelTrained()) {
        return null;
      }

      // Prepare signals for ML combiner (map to expected format)
      const mlSignals = {
        technical: signals.technical?.score || 0,
        sentiment: signals.sentiment?.score || 0,
        insider: signals.insider?.score || 0,
        fundamental: signals.fundamental?.score || 0,
        alternative: signals.alternativeData?.score || 0,
        valuation: signals.valuation?.score || 0,
        filing_13f: signals.thirteenF?.score || 0,
        earnings: signals.earningsMomentum?.score || 0,
        value_quality: signals.valueQuality?.score || 0,
      };

      // Context for ML model
      const context = {
        regime: regime?.regime || 'SIDEWAYS',
        sector: company?.sector || 'Unknown',
        marketCap: company?.market_cap || null,
      };

      // Get ML prediction (21-day forward return prediction)
      const mlScore = mlCombiner.combine(mlSignals, context, 21);

      // Get feature importance for reasoning
      const importance = mlCombiner.getFeatureImportance() || {};

      // Build contributions from importance
      const contributions = [];
      const signalNames = Object.keys(mlSignals);

      for (const name of signalNames) {
        const imp = importance[name] || 0.1;
        const signalValue = mlSignals[name];

        contributions.push({
          factor: this._formatMLFactorName(name),
          signal: signalValue,
          baseWeight: this.weights[name] || 0.1,
          regimeWeight: imp,
          effectiveWeight: imp,
          contribution: signalValue * imp,
        });
      }

      // Sort by contribution magnitude
      contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

      return {
        score: mlScore,
        contributions,
        weightsUsed: importance,
        regimeRationale: 'ML gradient boosting ensemble',
        usingOptimizedWeights: false,
        usingMLCombiner: true,
      };
    } catch (error) {
      console.warn('ML signal combination failed:', error.message);
      return null;
    }
  }

  _formatMLFactorName(name) {
    const names = {
      'technical': 'technical',
      'sentiment': 'sentiment',
      'insider': 'insider',
      'fundamental': 'fundamental',
      'alternative': 'alternativeData',
      'valuation': 'valuation',
      'filing_13f': 'thirteenF',
      'earnings': 'earningsMomentum',
      'value_quality': 'valueQuality',
    };
    return names[name] || name;
  }

  /**
   * Calculate linear weighted score (original method)
   */
  _calculateLinearScore(signals, regime) {
    const contributions = [];
    let totalScore = 0;
    let totalWeight = 0;
    let usingOptimizedWeights = false;

    // Try to get IC-optimized weights first
    let activeWeights;
    if (this.useOptimizedWeights) {
      try {
        activeWeights = this.signalOptimizer.getWeightsForRegime(regime?.regime || 'ALL');
        // Map optimizer weight names to trading agent names
        activeWeights = {
          technical: activeWeights.technical || this.weights.technical,
          sentiment: activeWeights.sentiment || this.weights.sentiment,
          insider: activeWeights.insider || this.weights.insider,
          fundamental: activeWeights.fundamental || this.weights.fundamental,
          alternativeData: activeWeights.alternative || this.weights.alternativeData,
          valuation: activeWeights.valuation || this.weights.valuation,
          thirteenF: activeWeights.filing_13f || this.weights.thirteenF,
          earningsMomentum: activeWeights.earnings || this.weights.earningsMomentum,
          valueQuality: activeWeights.value_quality || this.weights.valueQuality,
          rationale: 'IC-optimized weights based on historical performance',
        };
        usingOptimizedWeights = true;
      } catch (error) {
        // Fall back to regime-adaptive weights
        activeWeights = this._getRegimeAdaptiveWeights(regime);
      }
    } else {
      // Use regime-adaptive weights
      activeWeights = this._getRegimeAdaptiveWeights(regime);
    }

    // Technical
    if (signals.technical && signals.technical.confidence > 0) {
      const weight = activeWeights.technical * signals.technical.confidence;
      const contrib = signals.technical.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'technical',
        signal: signals.technical.score,
        baseWeight: this.weights.technical,
        regimeWeight: activeWeights.technical,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Sentiment
    if (signals.sentiment && signals.sentiment.confidence > 0) {
      const weight = activeWeights.sentiment * signals.sentiment.confidence;
      const contrib = signals.sentiment.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'sentiment',
        signal: signals.sentiment.score,
        baseWeight: this.weights.sentiment,
        regimeWeight: activeWeights.sentiment,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Insider
    if (signals.insider && signals.insider.confidence > 0) {
      const weight = activeWeights.insider * signals.insider.confidence;
      const contrib = signals.insider.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'insider',
        signal: signals.insider.score,
        baseWeight: this.weights.insider,
        regimeWeight: activeWeights.insider,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Fundamental
    if (signals.fundamental && signals.fundamental.confidence > 0) {
      const weight = activeWeights.fundamental * signals.fundamental.confidence;
      const contrib = signals.fundamental.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'fundamental',
        signal: signals.fundamental.score,
        baseWeight: this.weights.fundamental,
        regimeWeight: activeWeights.fundamental,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Alternative Data (congressional trades, short interest, contracts)
    if (signals.alternativeData && signals.alternativeData.confidence > 0) {
      const weight = activeWeights.alternativeData * signals.alternativeData.confidence;
      const contrib = signals.alternativeData.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'alternativeData',
        signal: signals.alternativeData.score,
        baseWeight: this.weights.alternativeData,
        regimeWeight: activeWeights.alternativeData,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Valuation (margin of safety)
    if (signals.valuation && signals.valuation.confidence > 0) {
      const weight = activeWeights.valuation * signals.valuation.confidence;
      const contrib = signals.valuation.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'valuation',
        signal: signals.valuation.score,
        baseWeight: this.weights.valuation,
        regimeWeight: activeWeights.valuation,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // 13F (super-investor position changes)
    if (signals.thirteenF && signals.thirteenF.confidence > 0) {
      const weight = activeWeights.thirteenF * signals.thirteenF.confidence;
      const contrib = signals.thirteenF.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'thirteenF',
        signal: signals.thirteenF.score,
        baseWeight: this.weights.thirteenF,
        regimeWeight: activeWeights.thirteenF,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Earnings Momentum (consecutive beats/misses)
    if (signals.earningsMomentum && signals.earningsMomentum.confidence > 0) {
      const weight = activeWeights.earningsMomentum * signals.earningsMomentum.confidence;
      const contrib = signals.earningsMomentum.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'earningsMomentum',
        signal: signals.earningsMomentum.score,
        baseWeight: this.weights.earningsMomentum,
        regimeWeight: activeWeights.earningsMomentum,
        effectiveWeight: weight,
        contribution: contrib,
      });
    }

    // Value Quality (Piotroski F-Score, Altman Z-Score, Contrarian signal)
    if (signals.valueQuality && signals.valueQuality.confidence > 0) {
      const weight = activeWeights.valueQuality * signals.valueQuality.confidence;
      const contrib = signals.valueQuality.score * weight;
      totalScore += contrib;
      totalWeight += weight;
      contributions.push({
        factor: 'valueQuality',
        signal: signals.valueQuality.score,
        baseWeight: this.weights.valueQuality,
        regimeWeight: activeWeights.valueQuality,
        effectiveWeight: weight,
        contribution: contrib,
        details: signals.valueQuality.details,
      });
    }

    // Normalize
    const score = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      score,
      contributions,
      weightsUsed: activeWeights,
      regimeRationale: activeWeights.rationale,
      usingOptimizedWeights,
    };
  }

  /**
   * Get regime-adaptive weights based on market conditions
   * Enhanced with 9 signal types
   * In crisis: trust fundamentals, insider, valuation, 13F (smart money), and value quality
   * In bull: momentum, sentiment, earnings momentum work better
   */
  _getRegimeAdaptiveWeights(regime) {
    const REGIME_WEIGHTS = {
      CRISIS: {
        technical: 0.02,
        sentiment: 0.02,
        insider: 0.15,
        fundamental: 0.18,
        alternativeData: 0.08,
        valuation: 0.18,
        thirteenF: 0.15,           // Super-investors are key in crisis
        earningsMomentum: 0.07,
        valueQuality: 0.15,        // Piotroski/Altman critical in crisis (quality matters)
        rationale: 'Crisis: Fundamentals, valuation, quality scores, and smart money matter most',
      },
      HIGH_VOL: {
        technical: 0.05,
        sentiment: 0.04,
        insider: 0.14,
        fundamental: 0.17,
        alternativeData: 0.10,
        valuation: 0.15,
        thirteenF: 0.12,
        earningsMomentum: 0.09,
        valueQuality: 0.14,        // Quality/safety scores important in volatility
        rationale: 'High volatility: Reduce noise, trust value and quality signals',
      },
      BEAR: {
        technical: 0.07,
        sentiment: 0.07,
        insider: 0.12,
        fundamental: 0.16,
        alternativeData: 0.10,
        valuation: 0.13,
        thirteenF: 0.12,           // What are smart investors buying in bear?
        earningsMomentum: 0.10,    // Companies still beating estimates
        valueQuality: 0.13,        // Piotroski helps find quality in downturns
        rationale: 'Bear market: Quality scores, insider buying, and value signal opportunity',
      },
      BULL: {
        technical: 0.14,
        sentiment: 0.13,
        insider: 0.09,
        fundamental: 0.13,
        alternativeData: 0.12,
        valuation: 0.07,           // Valuation matters less in bull
        thirteenF: 0.09,
        earningsMomentum: 0.14,    // Earnings momentum drives bull markets
        valueQuality: 0.09,        // Quality matters less when everything goes up
        rationale: 'Bull market: Momentum, sentiment, and earnings momentum are informative',
      },
      SIDEWAYS: {
        technical: 0.11,
        sentiment: 0.11,
        insider: 0.11,
        fundamental: 0.13,
        alternativeData: 0.11,
        valuation: 0.11,
        thirteenF: 0.11,
        earningsMomentum: 0.10,
        valueQuality: 0.11,
        rationale: 'Sideways: Balanced weights for range-bound market',
      },
    };

    const regimeType = regime?.regime || 'SIDEWAYS';
    const regimeWeights = REGIME_WEIGHTS[regimeType] || REGIME_WEIGHTS.SIDEWAYS;

    // Blend base weights with regime weights (configurable blend ratio)
    const blendRatio = 0.7; // 70% regime, 30% base
    return {
      technical: regimeWeights.technical * blendRatio + this.weights.technical * (1 - blendRatio),
      sentiment: regimeWeights.sentiment * blendRatio + this.weights.sentiment * (1 - blendRatio),
      insider: regimeWeights.insider * blendRatio + this.weights.insider * (1 - blendRatio),
      fundamental: regimeWeights.fundamental * blendRatio + this.weights.fundamental * (1 - blendRatio),
      alternativeData: regimeWeights.alternativeData * blendRatio + this.weights.alternativeData * (1 - blendRatio),
      valuation: regimeWeights.valuation * blendRatio + this.weights.valuation * (1 - blendRatio),
      thirteenF: regimeWeights.thirteenF * blendRatio + this.weights.thirteenF * (1 - blendRatio),
      earningsMomentum: regimeWeights.earningsMomentum * blendRatio + this.weights.earningsMomentum * (1 - blendRatio),
      valueQuality: regimeWeights.valueQuality * blendRatio + this.weights.valueQuality * (1 - blendRatio),
      rationale: regimeWeights.rationale,
    };
  }

  /**
   * Adjust score based on market regime
   */
  _adjustForRegime(score, regime) {
    const regimeMultipliers = {
      'BULL': 1.1,      // Slightly more aggressive
      'BEAR': 0.8,      // More conservative
      'SIDEWAYS': 1.0,  // Normal
      'HIGH_VOL': 0.6,  // Much more conservative
      'CRISIS': 0.4,    // Very conservative
    };

    const multiplier = regimeMultipliers[regime.regime] || 1.0;
    return Math.max(-1, Math.min(1, score * multiplier));
  }

  /**
   * Convert score to action
   */
  _scoreToAction(score) {
    if (score >= 0.5) {
      return { action: ACTIONS.STRONG_BUY, confidence: Math.min(0.95, 0.5 + Math.abs(score) * 0.4) };
    }
    if (score >= 0.25) {
      return { action: ACTIONS.BUY, confidence: 0.5 + Math.abs(score) * 0.3 };
    }
    if (score <= -0.5) {
      return { action: ACTIONS.STRONG_SELL, confidence: Math.min(0.95, 0.5 + Math.abs(score) * 0.4) };
    }
    if (score <= -0.25) {
      return { action: ACTIONS.SELL, confidence: 0.5 + Math.abs(score) * 0.3 };
    }
    return { action: ACTIONS.HOLD, confidence: 0.5 };
  }

  /**
   * Calculate position size based on conviction and context
   * Enhanced with capacity constraints and valuation uncertainty adjustment
   *
   * @param {number} score - Conviction score (-1 to 1)
   * @param {object} portfolioContext - Portfolio context
   * @param {object} regime - Market regime
   * @param {object} signals - All gathered signals (optional, for uncertainty adjustment)
   */
  _calculatePositionSize(score, portfolioContext, regime, signals = null) {
    // Base size on conviction (score strength)
    let baseSize = Math.abs(score) * 0.05; // Max 5% for max conviction

    // Regime adjustment
    const regimeMultipliers = {
      'BULL': 1.0,
      'BEAR': 0.7,
      'SIDEWAYS': 0.9,
      'HIGH_VOL': 0.5,
      'CRISIS': 0.3,
    };
    baseSize *= regimeMultipliers[regime.regime] || 1.0;

    // NEW: Valuation uncertainty adjustment from probabilistic DCF
    // Reduce position size when valuation has high uncertainty (wide CV)
    // or fat tails (extreme outcomes more likely)
    if (signals?.valuation?.details?.probabilistic) {
      const prob = signals.valuation.details.probabilistic;
      const cv = prob.coefficientOfVariation || 0;
      const kurtosis = prob.kurtosis || 3;

      // High uncertainty (CV > 50%) - reduce position size
      if (cv > 50) {
        baseSize *= 0.7;  // 30% reduction for high uncertainty
      } else if (cv > 30) {
        baseSize *= 0.85; // 15% reduction for moderate uncertainty
      }

      // Fat tails (kurtosis > 4) - extreme outcomes more likely
      // Reduce size to limit tail risk
      if (kurtosis > 6) {
        baseSize *= 0.8;  // 20% reduction for extreme fat tails
      } else if (kurtosis > 4) {
        baseSize *= 0.9;  // 10% reduction for fat tails
      }

      // BOOST: High conviction from probability + low uncertainty
      // If P(undervalued 20%+) > 70% AND CV < 30%, allow larger position
      const pUndervalued20 = prob.pUndervalued20 || 0;
      if (pUndervalued20 > 70 && cv < 30 && kurtosis < 4) {
        baseSize *= 1.15; // 15% boost for high confidence opportunities
      }
    }

    if (!portfolioContext) {
      return Math.max(0.01, Math.min(0.05, baseSize));
    }

    // Adjust for existing exposure
    const totalAssets = portfolioContext.totalValue + portfolioContext.cash;
    const currentExposure = totalAssets > 0 ? portfolioContext.totalValue / totalAssets : 0;

    // Reduce size if already heavily invested
    if (currentExposure > 0.9) {
      baseSize *= 0.3; // Very small if >90% invested
    } else if (currentExposure > 0.8) {
      baseSize *= 0.5; // Half size if >80% invested
    } else if (currentExposure > 0.7) {
      baseSize *= 0.75;
    }

    // Apply capacity constraints from backtesting analysis
    if (portfolioContext.portfolioId) {
      const capacityAdjustment = this._getCapacityAdjustment(portfolioContext.portfolioId);
      if (capacityAdjustment < 1.0) {
        baseSize *= capacityAdjustment;
      }
    }

    // Minimum 1%, maximum 5%
    return Math.max(0.01, Math.min(0.05, baseSize));
  }

  /**
   * Get capacity-based position size adjustment
   * Uses data from daily backtesting capacity analysis
   */
  _getCapacityAdjustment(portfolioId) {
    try {
      const capacityData = this.db.prepare(`
        SELECT scalability_ratio, liquidity_score, illiquid_positions
        FROM portfolio_capacity_constraints
        WHERE portfolio_id = ?
          AND updated_at >= datetime('now', '-2 days')
      `).get(portfolioId);

      if (!capacityData) {
        return 1.0; // No recent data, no adjustment
      }

      let adjustment = 1.0;

      // If scalability is low (< 2x), reduce position sizes
      if (capacityData.scalability_ratio < 1.5) {
        adjustment *= 0.7; // Capacity constrained - smaller positions
      } else if (capacityData.scalability_ratio < 3) {
        adjustment *= 0.85;
      }

      // If liquidity score is poor, reduce further
      if (capacityData.liquidity_score < 50) {
        adjustment *= 0.8; // Poor liquidity - even smaller
      } else if (capacityData.liquidity_score < 70) {
        adjustment *= 0.9;
      }

      // If many illiquid positions, be more conservative
      if (capacityData.illiquid_positions >= 3) {
        adjustment *= 0.8;
      } else if (capacityData.illiquid_positions >= 1) {
        adjustment *= 0.9;
      }

      return Math.max(0.5, adjustment); // Never reduce by more than 50%
    } catch (error) {
      // Table may not exist or query failed
      return 1.0;
    }
  }

  /**
   * Build reasoning explanation
   */
  _buildReasoning(contributions, signals, regime) {
    const reasoning = [];

    // Sort contributions by absolute contribution
    const sorted = [...contributions].sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    );

    for (const contrib of sorted) {
      if (Math.abs(contrib.contribution) < 0.02) continue; // Skip negligible

      const direction = contrib.contribution > 0 ? 'bullish' : 'bearish';
      const signal = signals[contrib.factor];

      let details = '';
      switch (contrib.factor) {
        case 'technical':
          details = signal.interpretation || `Technical score: ${signal.score.toFixed(2)}`;
          break;
        case 'sentiment':
          details = `Combined sentiment: ${signal.signal} (${signal.details?.sourcesUsed || 0} sources)`;
          break;
        case 'insider':
          const netVal = signal.details?.netValue;
          details = netVal
            ? `Insider signal: ${signal.signal} (net ${netVal > 0 ? '+' : ''}$${(netVal/1000).toFixed(0)}K)`
            : `Insider signal: ${signal.signal}`;
          break;
        case 'fundamental':
          const analysts = signal.details?.numberOfAnalysts;
          details = analysts
            ? `Analyst consensus: ${signal.details?.recommendationKey || signal.signal} (${analysts} analysts)`
            : `Fundamental score: ${signal.score.toFixed(2)}`;
          break;
        case 'alternativeData':
          details = signal.interpretation || `Alternative data score: ${signal.score.toFixed(2)}`;
          break;
        case 'valuation':
          details = signal.interpretation || `Valuation score: ${signal.score.toFixed(2)}`;
          break;
        case 'thirteenF':
          details = signal.interpretation || `13F signal: ${signal.score.toFixed(2)}`;
          break;
        case 'earningsMomentum':
          details = signal.interpretation || `Earnings momentum: ${signal.score.toFixed(2)}`;
          break;
      }

      reasoning.push({
        factor: this._formatFactorName(contrib.factor),
        direction,
        weight: Math.round(Math.abs(contrib.contribution) * 100) / 100,
        details,
      });
    }

    // Add regime context
    reasoning.push({
      factor: 'Market Regime',
      direction: regime.regime === 'BULL' ? 'supportive' :
                 regime.regime === 'BEAR' ? 'cautionary' : 'neutral',
      weight: 0,
      details: regime.description,
    });

    return reasoning;
  }

  _formatFactorName(factor) {
    const names = {
      'technical': 'Technical Analysis',
      'sentiment': 'Market Sentiment',
      'insider': 'Insider Activity',
      'fundamental': 'Fundamental Analysis',
      'alternativeData': 'Alternative Data',
      'valuation': 'Valuation/MOS',
      'thirteenF': '13F Filings',
      'earningsMomentum': 'Earnings Momentum',
    };
    return names[factor] || factor;
  }

  _getSignalLabel(score) {
    if (score >= 0.5) return 'strong_buy';
    if (score >= 0.2) return 'buy';
    if (score <= -0.5) return 'strong_sell';
    if (score <= -0.2) return 'sell';
    return 'hold';
  }

  _getTechnicalInterpretation(score, details) {
    const parts = [];

    if (details.alpha1m !== undefined) {
      const dir = details.alpha1m > 0 ? 'outperforming' : 'underperforming';
      parts.push(`${dir} market by ${Math.abs(details.alpha1m).toFixed(1)}% (1M)`);
    }

    if (details.position52w !== undefined) {
      if (details.position52w < 20) {
        parts.push('near 52-week low (potential value)');
      } else if (details.position52w > 80) {
        parts.push('near 52-week high');
      }
    }

    return parts.length > 0 ? parts.join('; ') : `Technical score: ${score.toFixed(2)}`;
  }

  /**
   * Store recommendation in database
   */
  _storeRecommendation(recommendation, portfolioId = null) {
    const result = this.stmts.storeRecommendation.run(
      recommendation.companyId,
      recommendation.action,
      recommendation.score,
      recommendation.rawScore,
      recommendation.confidence,
      recommendation.positionSize,
      recommendation.suggestedShares,
      recommendation.suggestedValue,
      JSON.stringify(recommendation.reasoning),
      JSON.stringify(recommendation.signals),
      recommendation.regime.regime,
      recommendation.currentPrice,
      portfolioId
    );

    return result.lastInsertRowid;
  }

  /**
   * Get recommendation history for a symbol
   */
  getRecommendationHistory(symbol, days = 30) {
    const rows = this.stmts.getRecommendationHistory.all(symbol, days);
    return rows.map(row => ({
      ...row,
      reasoning: row.reasoning ? JSON.parse(row.reasoning) : [],
      signals: row.signals ? JSON.parse(row.signals) : {},
    }));
  }

  /**
   * Get latest recommendation for a symbol
   */
  getLatestRecommendation(symbol) {
    const row = this.stmts.getLatestRecommendation.get(symbol);
    if (!row) return null;

    return {
      ...row,
      reasoning: row.reasoning ? JSON.parse(row.reasoning) : [],
      signals: row.signals ? JSON.parse(row.signals) : {},
    };
  }

  /**
   * Batch analyze multiple symbols
   */
  async batchRecommendations(symbols, portfolioContext = null, regime = null) {
    const results = [];
    const marketRegime = regime || this._estimateRegime();

    for (const symbol of symbols) {
      try {
        const rec = await this.getRecommendation(symbol, portfolioContext, marketRegime);
        results.push(rec);
      } catch (error) {
        results.push({
          symbol,
          error: error.message,
        });
      }
    }

    return {
      recommendations: results.filter(r => !r.error),
      errors: results.filter(r => r.error),
      regime: marketRegime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate confidence intervals for a trading signal using parametric distributions
   *
   * This method uses historical signal prediction errors to estimate a distribution,
   * then calculates confidence intervals around the signal score.
   *
   * @param {string} symbol - Stock symbol
   * @param {Object} signals - Current signals from _gatherSignals
   * @param {number} score - Combined signal score
   * @param {Object} options - Configuration options
   * @returns {Object} Confidence interval information
   */
  calculateConfidenceInterval(symbol, signals, score, options = {}) {
    const {
      confidenceLevels = [0.80, 0.90, 0.95],
      distributionType = 'studentT',
      lookbackDays = 180
    } = options;

    const pd = this._getParametricDist();
    if (!pd) {
      return {
        available: false,
        reason: 'Parametric distributions not available'
      };
    }

    try {
      // Get historical recommendations for this symbol to estimate prediction error distribution
      const history = this.stmts.getRecommendationHistory.all(symbol, lookbackDays);

      if (history.length < 10) {
        // Insufficient history - use default uncertainty based on signal confidence
        const avgConfidence = this._getAverageSignalConfidence(signals);
        const defaultUncertainty = 0.15 * (1 - avgConfidence); // Higher confidence = lower uncertainty

        return {
          available: true,
          method: 'default_uncertainty',
          score,
          intervals: confidenceLevels.map(level => {
            const z = pd.inverseCdf((1 + level) / 2, { mean: 0, std: 1 }, 'normal');
            const halfWidth = z * defaultUncertainty;
            return {
              level: level * 100,
              low: Math.max(-1, score - halfWidth),
              high: Math.min(1, score + halfWidth),
              width: halfWidth * 2
            };
          }),
          uncertainty: {
            type: 'default',
            std: defaultUncertainty,
            avgSignalConfidence: avgConfidence
          },
          interpretation: this._interpretConfidenceInterval(score, defaultUncertainty)
        };
      }

      // Calculate historical prediction errors
      // Compare historical scores to actual price movements
      const predictionErrors = [];

      for (let i = 0; i < history.length - 1; i++) {
        const rec = history[i];
        const nextRec = history[i + 1];

        // Simple error proxy: how much did the score change?
        // In a more sophisticated version, compare to actual forward returns
        const scoreDelta = Math.abs(rec.score - nextRec.score);
        predictionErrors.push(scoreDelta);
      }

      // Fit distribution to prediction errors
      const fitResult = pd.fitDistribution(predictionErrors, distributionType === 'auto' ? 'auto' : distributionType);

      // Calculate VaR-style confidence intervals
      const intervals = confidenceLevels.map(level => {
        const lowerQuantile = (1 - level) / 2;
        const upperQuantile = (1 + level) / 2;

        let lowError, highError;

        if (fitResult.type === 'studentT') {
          lowError = pd.inverseCdf(lowerQuantile, fitResult.params, 'studentT');
          highError = pd.inverseCdf(upperQuantile, fitResult.params, 'studentT');
        } else {
          lowError = pd.inverseCdf(lowerQuantile, fitResult.params, 'normal');
          highError = pd.inverseCdf(upperQuantile, fitResult.params, 'normal');
        }

        return {
          level: level * 100,
          low: Math.max(-1, score - highError),
          high: Math.min(1, score + highError),
          width: highError - lowError
        };
      });

      // Check for fat tails
      const hasFatTails = fitResult.moments?.kurtosis > 4;
      const isNegativelySkewed = fitResult.moments?.skewness < -0.5;

      return {
        available: true,
        method: 'historical_fitted',
        score,
        intervals,
        distribution: {
          type: fitResult.type,
          name: this._getDistributionName(fitResult.type),
          params: fitResult.params,
          moments: fitResult.moments
        },
        uncertainty: {
          type: 'fitted',
          std: fitResult.moments?.std || 0,
          kurtosis: fitResult.moments?.kurtosis,
          hasFatTails,
          isNegativelySkewed
        },
        riskWarnings: this._getRiskWarnings(fitResult.moments),
        interpretation: this._interpretConfidenceInterval(score, fitResult.moments?.std || 0.1, hasFatTails)
      };
    } catch (error) {
      console.warn('Error calculating confidence interval:', error.message);
      return {
        available: false,
        reason: error.message
      };
    }
  }

  /**
   * Get average confidence across all signals
   */
  _getAverageSignalConfidence(signals) {
    const confidences = [];
    for (const [key, signal] of Object.entries(signals)) {
      if (signal && signal.confidence > 0) {
        confidences.push(signal.confidence);
      }
    }
    if (confidences.length === 0) return 0.5;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  /**
   * Get distribution name for display
   */
  _getDistributionName(type) {
    const names = {
      'normal': 'Normal (Gaussian)',
      'studentT': "Student's t (Fat Tails)",
      'skewedT': 'Skewed t (Asymmetric)',
      'johnsonSU': 'Johnson SU'
    };
    return names[type] || type;
  }

  /**
   * Generate risk warnings based on distribution moments
   */
  _getRiskWarnings(moments) {
    const warnings = [];

    if (!moments) return warnings;

    if (moments.kurtosis > 6) {
      warnings.push({
        severity: 'high',
        message: 'EXTREME fat tails detected - signal may have large unexpected moves'
      });
    } else if (moments.kurtosis > 4) {
      warnings.push({
        severity: 'medium',
        message: 'Fat tails present - confidence intervals may underestimate tail risk'
      });
    }

    if (moments.skewness < -0.5) {
      warnings.push({
        severity: 'medium',
        message: 'Negative skew - larger downside moves more likely than upside'
      });
    } else if (moments.skewness > 0.5) {
      warnings.push({
        severity: 'low',
        message: 'Positive skew - larger upside moves more likely than downside'
      });
    }

    return warnings;
  }

  /**
   * Interpret confidence interval for display
   */
  _interpretConfidenceInterval(score, std, hasFatTails = false) {
    const interpretations = [];

    // Signal strength interpretation
    if (Math.abs(score) >= 0.5) {
      interpretations.push(`Strong ${score > 0 ? 'bullish' : 'bearish'} signal`);
    } else if (Math.abs(score) >= 0.25) {
      interpretations.push(`Moderate ${score > 0 ? 'bullish' : 'bearish'} signal`);
    } else {
      interpretations.push('Neutral signal - no strong directional bias');
    }

    // Uncertainty interpretation
    if (std < 0.1) {
      interpretations.push('Low uncertainty - signal is relatively stable');
    } else if (std < 0.2) {
      interpretations.push('Moderate uncertainty - some signal variability expected');
    } else {
      interpretations.push('High uncertainty - treat signal with caution');
    }

    // Fat tails warning
    if (hasFatTails) {
      interpretations.push('Fat tails detected - extreme moves more likely than normal');
    }

    return interpretations;
  }

  /**
   * Get recommendation with confidence intervals
   *
   * Enhanced version of getRecommendation that includes parametric confidence intervals
   */
  async getRecommendationWithCI(symbol, portfolioContext = null, regime = null) {
    // Get base recommendation
    const recommendation = await this.getRecommendation(symbol, portfolioContext, regime);

    if (recommendation.action === 'hold' && recommendation.reasoning[0]?.factor === 'Earnings Blackout') {
      // Skip confidence intervals for blackout period
      return recommendation;
    }

    // Calculate confidence intervals
    if (this.includeConfidenceIntervals) {
      try {
        const ci = this.calculateConfidenceInterval(
          symbol,
          recommendation.signals,
          recommendation.score
        );

        recommendation.confidenceInterval = ci;
      } catch (error) {
        console.warn('Failed to calculate confidence interval:', error.message);
        recommendation.confidenceInterval = { available: false, reason: error.message };
      }
    }

    return recommendation;
  }
}

module.exports = { TradingAgent, ACTIONS };
