// src/services/agent/configurableStrategyAgent.js
// Configurable Strategy Agent - Executes trading based on user-defined strategy parameters
// Works in both Single Strategy and Multi-Strategy modes

const { StrategyConfigManager } = require('./strategyConfig');
const { EnhancedQuantSystem } = require('../quant/enhancedQuantSystem');
const { InsiderTradingSignals } = require('../signals/insiderTradingSignals');
const { CongressionalTradingSignals } = require('../signals/congressionalTradingSignals');

/**
 * ConfigurableStrategyAgent - Executes a user-defined trading strategy
 *
 * Key features:
 * - Respects all user-configured parameters
 * - Uses only the signals/weights specified
 * - Enforces risk limits as configured
 * - Works with the enhanced quant system components selectively
 * - Supports historical backtesting via setSimulationDate()
 */
class ConfigurableStrategyAgent {
  constructor(db, strategyId) {
    this.db = db;
    this.strategyId = strategyId;
    this.simulationDate = null; // For backtesting - if set, queries use this date

    // Load configuration
    this.configManager = new StrategyConfigManager(db);
    this.config = this.configManager.getAgentConfig(strategyId);

    if (!this.config) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Initialize quant system (used selectively based on config)
    this.quantSystem = new EnhancedQuantSystem(db);

    // Initialize insider trading signals
    this.insiderSignals = new InsiderTradingSignals(db);

    // Initialize congressional trading signals
    this.congressionalSignals = new CongressionalTradingSignals(db);

    // Prepare statements
    this._prepareStatements();

    console.log(`🤖 ConfigurableStrategyAgent initialized: "${this.config.name}"`);
    console.log(`   Mode: ${this.config.mode}`);
    console.log(`   Weights: ${JSON.stringify(this.config.weights)}`);
  }

  /**
   * Set simulation date for backtesting
   * All price and data queries will return data as-of this date
   * @param {string} date - ISO date string (YYYY-MM-DD) or null for live mode
   */
  setSimulationDate(date) {
    this.simulationDate = date;
  }

  /**
   * Get the effective date for queries (simulation date or today)
   * @returns {string} ISO date string
   */
  _getEffectiveDate() {
    return this.simulationDate || new Date().toISOString().slice(0, 10);
  }

  /**
   * Get price as of the effective date
   * @param {number} companyId - Company ID
   * @returns {Object|null} Price data
   */
  _getPrice(companyId) {
    return this.stmtGetPriceAsOf.get(companyId, this._getEffectiveDate());
  }

  /**
   * Get price history as of the effective date
   * @param {number} companyId - Company ID
   * @param {number} days - Number of days of history
   * @returns {Array} Price history
   */
  _getPriceHistory(companyId, days) {
    return this.stmtGetPriceHistoryAsOf.all(companyId, this._getEffectiveDate(), days);
  }

  _prepareStatements() {
    this.stmtGetCompany = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE symbol = ? COLLATE NOCASE
    `);

    this.stmtGetCompanyById = this.db.prepare(`
      SELECT id, symbol, name, sector, market_cap
      FROM companies WHERE id = ?
    `);

    // Date-aware price query - requires date parameter for backtesting
    this.stmtGetPriceAsOf = this.db.prepare(`
      SELECT close as price, date, volume
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    // Date-aware price history
    this.stmtGetPriceHistoryAsOf = this.db.prepare(`
      SELECT close as price, date, volume
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT ?
    `);

    this.stmtGetMetrics = this.db.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ? AND fiscal_period <= ?
      ORDER BY fiscal_period DESC
      LIMIT 1
    `);

    this.stmtGetSentiment = this.db.prepare(`
      SELECT * FROM combined_sentiment
      WHERE company_id = ? AND calculated_at <= ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `);

    this.stmtGetFactorScores = this.db.prepare(`
      SELECT * FROM stock_factor_scores
      WHERE company_id = ? AND score_date <= ?
      ORDER BY score_date DESC
      LIMIT 1
    `);

    this.stmtGetIntrinsic = this.db.prepare(`
      SELECT * FROM intrinsic_value_estimates
      WHERE company_id = ? AND created_at <= ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
  }

  /**
   * Get the universe of stocks to consider based on config
   * @returns {Array} Filtered universe of companies
   */
  getUniverse() {
    const { universe } = this.config;
    let query = `
      SELECT c.id, c.symbol, c.name, c.sector, c.market_cap
      FROM companies c
      WHERE c.market_cap > 0
    `;
    const params = [];

    // Market cap filter
    if (universe.minMarketCap) {
      query += ` AND c.market_cap >= ?`;
      params.push(universe.minMarketCap);
    }
    if (universe.maxMarketCap) {
      query += ` AND c.market_cap <= ?`;
      params.push(universe.maxMarketCap);
    }

    // Sector filters
    if (universe.sectors && universe.sectors.length > 0) {
      const placeholders = universe.sectors.map(() => '?').join(',');
      query += ` AND c.sector IN (${placeholders})`;
      params.push(...universe.sectors);
    }
    if (universe.excludedSectors && universe.excludedSectors.length > 0) {
      const placeholders = universe.excludedSectors.map(() => '?').join(',');
      query += ` AND c.sector NOT IN (${placeholders})`;
      params.push(...universe.excludedSectors);
    }

    // Country filter (if implemented in companies table)
    // if (universe.countries) { ... }

    // Exclude non-stocks
    query += ` AND c.symbol NOT LIKE '^%' AND c.symbol NOT LIKE '%.%'`;

    query += ` ORDER BY c.market_cap DESC LIMIT 500`;

    let stocks = this.db.prepare(query).all(...params);

    // Add custom symbols if specified
    if (universe.customSymbols && universe.customSymbols.length > 0) {
      const customStocks = universe.customSymbols
        .map(symbol => this.stmtGetCompany.get(symbol))
        .filter(Boolean);

      // Merge, avoiding duplicates
      const existingIds = new Set(stocks.map(s => s.id));
      for (const cs of customStocks) {
        if (!existingIds.has(cs.id)) {
          stocks.push(cs);
        }
      }
    }

    // Volume filter (if configured)
    if (universe.minAvgVolume) {
      stocks = stocks.filter(stock => {
        const history = this._getPriceHistory(stock.id, 20);
        if (history.length < 5) return false;
        const avgVolume = history.reduce((sum, h) => sum + (h.volume || 0), 0) / history.length;
        return avgVolume >= universe.minAvgVolume;
      });
    }

    return stocks;
  }

  /**
   * Generate trading signal for a stock
   * @param {Object} stock - Stock to analyze
   * @param {Map} currentPositions - Current portfolio positions
   * @returns {Object|null} Signal or null if no signal
   */
  generateSignal(stock, currentPositions = new Map()) {
    const { weights, thresholds, regime, risk } = this.config;

    // Get current price (as of simulation date if set)
    const priceData = this._getPrice(stock.id);
    if (!priceData) return null;

    // Calculate component scores based on configured weights
    const scores = {};
    let totalWeight = 0;
    let weightedScore = 0;

    // Technical score
    if (weights.technical > 0) {
      const techScore = this._calculateTechnicalScore(stock.id);
      if (techScore !== null) {
        scores.technical = techScore;
        weightedScore += techScore * weights.technical;
        totalWeight += weights.technical;
      }
    }

    // Fundamental score
    if (weights.fundamental > 0) {
      const fundScore = this._calculateFundamentalScore(stock.id);
      if (fundScore !== null) {
        scores.fundamental = fundScore;
        weightedScore += fundScore * weights.fundamental;
        totalWeight += weights.fundamental;
      }
    }

    // Sentiment score
    if (weights.sentiment > 0) {
      const sentScore = this._calculateSentimentScore(stock.id);
      if (sentScore !== null) {
        scores.sentiment = sentScore;
        weightedScore += sentScore * weights.sentiment;
        totalWeight += weights.sentiment;
      }
    }

    // Momentum score
    if (weights.momentum > 0) {
      const momScore = this._calculateMomentumScore(stock.id);
      if (momScore !== null) {
        scores.momentum = momScore;
        weightedScore += momScore * weights.momentum;
        totalWeight += weights.momentum;
      }
    }

    // Value score
    if (weights.value > 0) {
      const valScore = this._calculateValueScore(stock.id, priceData.price);
      if (valScore !== null) {
        scores.value = valScore;
        weightedScore += valScore * weights.value;
        totalWeight += weights.value;
      }
    }

    // Quality/Moat score
    if (weights.quality > 0) {
      const qualScore = this._calculateQualityScore(stock.id);
      if (qualScore !== null) {
        scores.quality = qualScore;
        weightedScore += qualScore * weights.quality;
        totalWeight += weights.quality;
      }
    }

    // Insider trading score
    if (weights.insider > 0) {
      const insiderScore = this._calculateInsiderScore(stock.id);
      if (insiderScore !== null) {
        scores.insider = insiderScore;
        weightedScore += insiderScore * weights.insider;
        totalWeight += weights.insider;
      }
    }

    // Congressional trading score
    if (weights.congressional > 0) {
      const congressionalScore = this._calculateCongressionalScore(stock.id);
      if (congressionalScore !== null) {
        scores.congressional = congressionalScore;
        weightedScore += congressionalScore * weights.congressional;
        totalWeight += weights.congressional;
      }
    }

    if (totalWeight === 0) return null;

    // Normalize score
    const normalizedScore = weightedScore / totalWeight;

    // Apply regime overlay if enabled
    let adjustedScore = normalizedScore;
    let regimeMultiplier = 1.0;

    if (regime.enabled) {
      const marketAssessment = this.quantSystem.getMarketAssessment();
      const riskLevel = marketAssessment.overallRisk;

      if (riskLevel === 'extreme' || riskLevel === 'high') {
        regimeMultiplier = regime.exposureHighRisk;
      } else if (riskLevel === 'elevated' || riskLevel === 'cautious') {
        regimeMultiplier = regime.exposureElevated;
      } else {
        regimeMultiplier = regime.exposureNormal;
      }

      // Reduce buy conviction in high-risk environments
      if (adjustedScore > 0) {
        adjustedScore *= regimeMultiplier;
      }
    }

    // Calculate confidence
    const dataCompleteness = Object.keys(scores).length / 8; // How many signals available (now 8 with insider + congressional)
    const signalStrength = Math.abs(adjustedScore);
    const confidence = 0.4 + (dataCompleteness * 0.3) + (signalStrength * 0.3);

    // Check against thresholds
    if (Math.abs(adjustedScore) < thresholds.minScore) return null;
    if (confidence < thresholds.minConfidence) return null;

    // Determine action
    let action = 'hold';
    if (adjustedScore > 0.3) action = 'strong_buy';
    else if (adjustedScore > 0.1) action = 'buy';
    else if (adjustedScore < -0.3) action = 'strong_sell';
    else if (adjustedScore < -0.1) action = 'sell';

    // Correlation check if we have positions
    let correlationPenalty = 0;
    if (currentPositions.size > 0 && (action === 'buy' || action === 'strong_buy')) {
      const positions = Array.from(currentPositions.entries()).map(([symbol, pos]) => ({
        symbol,
        value: pos.marketValue || pos.shares * pos.currentPrice
      }));

      try {
        const corrCheck = this.quantSystem.correlationManager.checkNewPositionCorrelation(
          stock.symbol,
          positions,
          risk.maxCorrelation
        );

        if (!corrCheck.canAdd) {
          correlationPenalty = 0.3;
          adjustedScore *= 0.7;
        }
      } catch (e) {
        // Continue without correlation check
      }
    }

    return {
      symbol: stock.symbol,
      companyId: stock.id,
      sector: stock.sector,
      price: priceData.price,
      action,
      score: adjustedScore,
      rawScore: normalizedScore,
      confidence: Math.min(0.95, confidence),
      scores,
      regimeMultiplier,
      correlationPenalty,
      hasPosition: currentPositions.has(stock.symbol)
    };
  }

  /**
   * Calculate position size based on strategy config
   * @param {Object} signal - Trading signal
   * @param {number} portfolioValue - Total portfolio value
   * @param {Map} currentPositions - Current positions
   * @returns {Object} Position sizing details
   */
  calculatePositionSize(signal, portfolioValue, currentPositions) {
    const { risk, regime } = this.config;

    // Base size from config
    let targetSize = risk.maxPositionSize;

    // Scale by signal strength
    const signalScale = 0.5 + Math.abs(signal.score) * 0.5; // 50-100% of max
    targetSize *= signalScale;

    // Apply regime multiplier if enabled
    if (regime.enabled) {
      targetSize *= signal.regimeMultiplier;
    }

    // Check sector concentration
    const sectorPositions = Array.from(currentPositions.values())
      .filter(p => p.sector === signal.sector);
    const sectorValue = sectorPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const currentSectorPct = sectorValue / portfolioValue;

    if (currentSectorPct + targetSize > risk.maxSectorConcentration) {
      targetSize = Math.max(0, risk.maxSectorConcentration - currentSectorPct);
    }

    // Check max positions
    if (currentPositions.size >= risk.maxPositions) {
      return { approved: false, reason: 'max_positions_reached' };
    }

    // Minimum viable position
    const minPositionValue = 1000;
    const positionValue = portfolioValue * targetSize;
    if (positionValue < minPositionValue) {
      return { approved: false, reason: 'position_too_small' };
    }

    return {
      approved: true,
      targetSize,
      positionValue,
      shares: Math.floor(positionValue / signal.price),
      reasoning: {
        baseSize: risk.maxPositionSize,
        signalScale,
        regimeMultiplier: signal.regimeMultiplier,
        sectorConstraint: currentSectorPct + targetSize <= risk.maxSectorConcentration
      }
    };
  }

  /**
   * Check if position should be exited
   * @param {Object} position - Current position
   * @param {number} currentPrice - Current price
   * @param {string} currentDate - Current date
   * @returns {Object} Exit decision
   */
  checkExit(position, currentPrice, currentDate) {
    const { risk, holdingPeriod } = this.config;

    const pnlPct = (currentPrice - position.avgCost) / position.avgCost;
    const holdingDays = this._daysBetween(position.entryDate, currentDate);

    // Stop loss
    if (risk.stopLoss && pnlPct < -risk.stopLoss) {
      return { shouldExit: true, reason: 'stop_loss', pnlPct };
    }

    // Take profit
    if (risk.takeProfit && pnlPct > risk.takeProfit) {
      return { shouldExit: true, reason: 'take_profit', pnlPct };
    }

    // Trailing stop
    if (risk.trailingStop && position.highWaterMark) {
      const drawdownFromHigh = (position.highWaterMark - currentPrice) / position.highWaterMark;
      if (drawdownFromHigh > risk.trailingStop) {
        return { shouldExit: true, reason: 'trailing_stop', pnlPct };
      }
    }

    // Max holding period
    if (holdingPeriod.max && holdingDays > holdingPeriod.max) {
      return { shouldExit: true, reason: 'max_holding_exceeded', pnlPct };
    }

    // Time-based exit if underwater after target period
    if (holdingDays > holdingPeriod.target && pnlPct < 0) {
      return { shouldExit: true, reason: 'time_exit_underwater', pnlPct };
    }

    return { shouldExit: false };
  }

  // ========== Signal Calculation Methods ==========

  _calculateTechnicalScore(companyId) {
    const history = this._getPriceHistory(companyId, 200);
    if (history.length < 50) return null;

    const prices = history.map(h => h.price).reverse();
    const current = prices[prices.length - 1];

    // Calculate indicators
    const sma20 = this._sma(prices, 20);
    const sma50 = this._sma(prices, 50);
    const sma200 = prices.length >= 200 ? this._sma(prices, 200) : null;
    const rsi = this._rsi(prices, 14);

    let score = 0;

    // RSI
    if (rsi < 30) score += 0.3;
    else if (rsi > 70) score -= 0.3;
    else if (rsi < 40) score += 0.1;
    else if (rsi > 60) score -= 0.1;

    // Price vs MAs
    if (current > sma20) score += 0.15;
    else score -= 0.15;

    if (current > sma50) score += 0.15;
    else score -= 0.15;

    if (sma200 && current > sma200) score += 0.2;
    else if (sma200) score -= 0.2;

    // Trend (20 > 50 > 200)
    if (sma50 && sma20 > sma50) score += 0.1;
    if (sma200 && sma50 > sma200) score += 0.1;

    return Math.max(-1, Math.min(1, score));
  }

  _calculateFundamentalScore(companyId) {
    const metrics = this.stmtGetMetrics.get(companyId, this._getEffectiveDate());
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

  _calculateSentimentScore(companyId) {
    const sentiment = this.stmtGetSentiment.get(companyId, this._getEffectiveDate());
    if (!sentiment) return null;

    // Combined score is typically 0-100
    const combined = sentiment.combined_score || sentiment.sentiment_score || 50;
    return (combined - 50) / 50; // Normalize to -1 to 1
  }

  _calculateMomentumScore(companyId) {
    const history = this._getPriceHistory(companyId, 252);
    if (history.length < 63) return null;

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

    // 1-month momentum (short-term reversal check)
    if (prices.length >= 21) {
      const price1MonthAgo = prices[prices.length - 21];
      const mom1m = (current - price1MonthAgo) / price1MonthAgo;

      // Short-term reversal: extreme recent moves often reverse
      if (mom1m > 0.15) score -= 0.1; // Overbought short-term
      else if (mom1m < -0.15) score += 0.1; // Oversold short-term
    }

    return Math.max(-1, Math.min(1, score));
  }

  _calculateValueScore(companyId, currentPrice) {
    const effectiveDate = this._getEffectiveDate();
    const metrics = this.stmtGetMetrics.get(companyId, effectiveDate);
    const intrinsic = this.stmtGetIntrinsic.get(companyId, effectiveDate);

    if (!metrics && !intrinsic) return null;

    let score = 0;
    let components = 0;

    // P/E ratio
    if (metrics?.pe_ratio) {
      if (metrics.pe_ratio > 0 && metrics.pe_ratio < 12) score += 0.3;
      else if (metrics.pe_ratio > 0 && metrics.pe_ratio < 18) score += 0.15;
      else if (metrics.pe_ratio > 35) score -= 0.25;
      else if (metrics.pe_ratio > 25) score -= 0.1;
      components++;
    }

    // P/B ratio
    if (metrics?.pb_ratio) {
      if (metrics.pb_ratio > 0 && metrics.pb_ratio < 1.5) score += 0.25;
      else if (metrics.pb_ratio > 0 && metrics.pb_ratio < 3) score += 0.1;
      else if (metrics.pb_ratio > 6) score -= 0.2;
      components++;
    }

    // FCF Yield
    if (metrics?.fcf_yield) {
      if (metrics.fcf_yield > 0.08) score += 0.25;
      else if (metrics.fcf_yield > 0.05) score += 0.1;
      else if (metrics.fcf_yield < 0) score -= 0.2;
      components++;
    }

    // Margin of safety from intrinsic value
    if (intrinsic?.intrinsic_value && currentPrice) {
      const mos = (intrinsic.intrinsic_value - currentPrice) / intrinsic.intrinsic_value;
      if (mos > 0.3) score += 0.4;
      else if (mos > 0.15) score += 0.25;
      else if (mos > 0) score += 0.1;
      else if (mos < -0.2) score -= 0.3;
      components++;
    }

    if (components === 0) return null;
    return Math.max(-1, Math.min(1, score / (components * 0.3)));
  }

  _calculateQualityScore(companyId) {
    try {
      const moatScore = this.quantSystem.moatScorer.calculateMoatScore(companyId);
      if (moatScore.error) return null;

      // Convert moat strength to score
      const strengthMap = { 'wide': 0.8, 'narrow': 0.4, 'none': -0.2 };
      let score = strengthMap[moatScore.moatStrength] || 0;

      // Adjust by threat level
      if (moatScore.threatLevel === 'high') score -= 0.2;
      else if (moatScore.threatLevel === 'low') score += 0.1;

      return Math.max(-1, Math.min(1, score));
    } catch (e) {
      return null;
    }
  }

  _calculateInsiderScore(companyId) {
    try {
      // Get insider trading signal as of effective date
      const signal = this.insiderSignals.generateSignal(companyId, this._getEffectiveDate());
      if (!signal) return null;

      // Insider signal already provides score 0-1, convert to -1 to 1 range
      // Score is already weighted by signal strength (weak/moderate/strong/very strong)
      // Map to our scoring range:
      // - 0.0-0.3 (weak) → 0.2
      // - 0.3-0.5 (moderate) → 0.4
      // - 0.5-0.7 (strong) → 0.7
      // - 0.7+ (very strong) → 0.9
      let score = 0;
      if (signal.score >= 0.7) {
        score = 0.9;
      } else if (signal.score >= 0.5) {
        score = 0.7;
      } else if (signal.score >= 0.3) {
        score = 0.4;
      } else {
        score = 0.2;
      }

      // Additional boost for clusters (3+ insiders)
      if (signal.metrics.isCluster) {
        score = Math.min(1.0, score * 1.15);
      }

      return score;
    } catch (e) {
      return null;
    }
  }

  _calculateCongressionalScore(companyId) {
    try {
      // Get congressional trading signal as of effective date
      const signal = this.congressionalSignals.generateSignal(companyId, this._getEffectiveDate());
      if (!signal) return null;

      // Congressional signal provides score 0-1, convert to our scoring range
      // Research shows congressional trades outperform by 6-10% annually
      // Map to our scoring range with boost for strong signals:
      // - 0.0-0.3 (weak) → 0.3
      // - 0.3-0.5 (moderate) → 0.5
      // - 0.5-0.7 (strong) → 0.8
      // - 0.7+ (very strong) → 1.0
      let score = 0;
      if (signal.score >= 0.7) {
        score = 1.0; // Very strong congressional consensus
      } else if (signal.score >= 0.5) {
        score = 0.8;
      } else if (signal.score >= 0.3) {
        score = 0.5;
      } else {
        score = 0.3;
      }

      // Additional boost for bipartisan support (reduces political risk)
      if (signal.metrics.isBipartisan) {
        score = Math.min(1.0, score * 1.1);
      }

      // Additional boost for Senate purchases (historically higher alpha)
      if (signal.metrics.senatePurchases > 0) {
        score = Math.min(1.0, score * 1.05);
      }

      return score;
    } catch (e) {
      return null;
    }
  }

  // ========== Helper Methods ==========

  _sma(prices, period) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _rsi(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }

  _daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get strategy summary
   * @returns {Object} Strategy description
   */
  getSummary() {
    return {
      id: this.config.strategyId,
      name: this.config.name,
      mode: this.config.mode,
      weights: this.config.weights,
      risk: this.config.risk,
      holdingPeriod: this.config.holdingPeriod,
      regimeEnabled: this.config.regime.enabled
    };
  }
}

module.exports = { ConfigurableStrategyAgent };
