// src/services/features/featureStore.js
// Point-in-Time Feature Store - Centralized feature retrieval with caching

const { db } = require('../../database');
const { getRegistry, FEATURE_TYPES, FREQUENCIES } = require('./featureRegistry');

/**
 * Feature Store
 *
 * Provides point-in-time correct feature retrieval for:
 * - ML training (avoiding look-ahead bias)
 * - Backtesting (historical feature values)
 * - Live inference (current feature values)
 *
 * Key capabilities:
 * - Point-in-time semantics
 * - Batch retrieval for multiple symbols/features
 * - Caching for performance
 * - Automatic joins across tables
 */
class FeatureStore {
  constructor(options = {}) {
    this.registry = getRegistry();
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize || 10000;
    this.cacheTTLMs = options.cacheTTLMs || 5 * 60 * 1000; // 5 minutes
    this.enableLogging = options.enableLogging || false;

    // Pre-built SQL for common feature queries
    this._prepareStatements();
  }

  /**
   * Prepare commonly used SQL statements
   */
  _prepareStatements() {
    // Get company ID from symbol
    this._getCompanyId = db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `);

    // Price features with point-in-time
    this._getPriceFeatures = db.prepare(`
      SELECT
        company_id,
        date,
        open,
        high,
        low,
        close,
        COALESCE(adjusted_close, close) as adjusted_close,
        volume
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT ?
    `);

    // Fundamental features (quarterly, forward-filled)
    this._getFundamentalFeatures = db.prepare(`
      SELECT
        cm.*,
        cm.fiscal_period as data_date
      FROM calculated_metrics cm
      WHERE cm.company_id = ?
        AND cm.fiscal_period <= ?
      ORDER BY cm.fiscal_period DESC
      LIMIT 1
    `);

    // Factor scores with point-in-time
    this._getFactorFeatures = db.prepare(`
      SELECT *
      FROM stock_factor_scores
      WHERE company_id = ?
        AND score_date <= ?
      ORDER BY score_date DESC
      LIMIT 1
    `);

    // Sentiment with point-in-time
    this._getSentimentFeatures = db.prepare(`
      SELECT *
      FROM sentiment_summary
      WHERE company_id = ?
        AND date(calculated_at) <= ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `);
  }

  /**
   * Get a single feature value for a symbol as of a date
   *
   * @param {string} symbol - Stock symbol
   * @param {string} featureName - Feature name from registry
   * @param {string} asOfDate - Point-in-time date (YYYY-MM-DD)
   * @param {object} options - Additional options
   * @returns {number|null} Feature value
   */
  getFeature(symbol, featureName, asOfDate, options = {}) {
    const { logAccess = false, context = 'live' } = options;

    // Check cache
    const cacheKey = `${symbol}:${featureName}:${asOfDate}`;
    const cached = this._getFromCache(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Get feature definition
    const feature = this.registry.get(featureName);
    if (!feature) {
      console.warn(`Feature ${featureName} not found in registry`);
      return null;
    }

    // Get company ID
    const company = this._getCompanyId.get(symbol);
    if (!company) {
      return null;
    }

    // Retrieve based on feature type
    let value = null;

    switch (feature.type) {
      case FEATURE_TYPES.PRICE:
      case FEATURE_TYPES.DERIVED:
        value = this._getPriceFeature(company.id, featureName, asOfDate, feature);
        break;

      case FEATURE_TYPES.TECHNICAL:
        value = this._getTechnicalFeature(company.id, featureName, asOfDate, feature);
        break;

      case FEATURE_TYPES.FUNDAMENTAL:
        value = this._getFundamentalFeature(company.id, featureName, asOfDate, feature);
        break;

      case FEATURE_TYPES.FACTOR:
        value = this._getFactorFeature(company.id, featureName, asOfDate, feature);
        break;

      case FEATURE_TYPES.SENTIMENT:
        value = this._getSentimentFeature(company.id, featureName, asOfDate, feature);
        break;

      case FEATURE_TYPES.ALTERNATIVE:
        value = this._getAlternativeFeature(company.id, featureName, asOfDate, feature);
        break;

      default:
        console.warn(`Unknown feature type: ${feature.type}`);
    }

    // Cache the result
    this._setCache(cacheKey, value);

    // Log access if enabled
    if (logAccess) {
      this.registry.logAccess(featureName, company.id, asOfDate, context);
    }

    return value;
  }

  /**
   * Get multiple features for a single symbol
   *
   * @param {string} symbol - Stock symbol
   * @param {string[]} featureNames - Array of feature names
   * @param {string} asOfDate - Point-in-time date
   * @param {object} options - Additional options
   * @returns {object} Map of feature name -> value
   */
  getFeatures(symbol, featureNames, asOfDate, options = {}) {
    const result = {};

    for (const featureName of featureNames) {
      result[featureName] = this.getFeature(symbol, featureName, asOfDate, options);
    }

    return result;
  }

  /**
   * Get features for multiple symbols (batch retrieval)
   *
   * @param {string[]} symbols - Array of stock symbols
   * @param {string[]} featureNames - Array of feature names
   * @param {string} asOfDate - Point-in-time date
   * @param {object} options - Additional options
   * @returns {object} Map of symbol -> { feature -> value }
   */
  getBatchFeatures(symbols, featureNames, asOfDate, options = {}) {
    const result = {};

    for (const symbol of symbols) {
      result[symbol] = this.getFeatures(symbol, featureNames, asOfDate, options);
    }

    return result;
  }

  /**
   * Get feature time series for a symbol
   *
   * @param {string} symbol - Stock symbol
   * @param {string} featureName - Feature name
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Array} Array of { date, value }
   */
  getFeatureTimeSeries(symbol, featureName, startDate, endDate) {
    const feature = this.registry.get(featureName);
    if (!feature) {
      return [];
    }

    const company = this._getCompanyId.get(symbol);
    if (!company) {
      return [];
    }

    // Get dates in range
    const dates = db.prepare(`
      SELECT DISTINCT date
      FROM daily_prices
      WHERE company_id = ? AND date >= ? AND date <= ?
      ORDER BY date
    `).all(company.id, startDate, endDate);

    const result = [];
    for (const { date } of dates) {
      const value = this.getFeature(symbol, featureName, date);
      result.push({ date, value });
    }

    return result;
  }

  /**
   * Get ML training matrix
   * Returns a feature matrix suitable for ML training
   *
   * @param {string[]} symbols - Stock symbols to include
   * @param {string[]} featureNames - Features to include
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {object} options - Additional options
   * @returns {object} { features: [], target: [], dates: [], symbols: [] }
   */
  getMLMatrix(symbols, featureNames, startDate, endDate, options = {}) {
    const {
      targetName = 'return_5d',
      targetShift = 5,  // Forward shift for target
      dropNa = true
    } = options;

    const features = [];
    const target = [];
    const dates = [];
    const symbolsOut = [];

    // Get all trading dates
    const tradingDates = db.prepare(`
      SELECT DISTINCT date FROM daily_prices
      WHERE date >= ? AND date <= ?
      ORDER BY date
    `).all(startDate, endDate).map(r => r.date);

    for (const symbol of symbols) {
      const company = this._getCompanyId.get(symbol);
      if (!company) continue;

      for (let i = 0; i < tradingDates.length - targetShift; i++) {
        const date = tradingDates[i];
        const targetDate = tradingDates[i + targetShift];

        // Get features
        const featureRow = [];
        let hasNa = false;

        for (const featureName of featureNames) {
          const value = this.getFeature(symbol, featureName, date);
          if (value === null || value === undefined || isNaN(value)) {
            hasNa = true;
            if (dropNa) break;
          }
          featureRow.push(value);
        }

        if (dropNa && hasNa) continue;

        // Get forward return as target
        const targetValue = this._getForwardReturn(company.id, date, targetShift);
        if (targetValue === null && dropNa) continue;

        features.push(featureRow);
        target.push(targetValue);
        dates.push(date);
        symbolsOut.push(symbol);
      }
    }

    return {
      features,
      target,
      dates,
      symbols: symbolsOut,
      featureNames
    };
  }

  /**
   * Get price feature value
   */
  _getPriceFeature(companyId, featureName, asOfDate, feature) {
    // For simple price columns
    if (feature.sourceColumn) {
      const row = this._getPriceFeatures.get(companyId, asOfDate, 1);
      return row ? row[feature.sourceColumn] : null;
    }

    // For derived features, we need multiple rows
    const rows = this._getPriceFeatures.all(companyId, asOfDate, 252); // 1 year of data
    if (!rows || rows.length === 0) return null;

    switch (featureName) {
      case 'return_1d':
        return rows.length >= 2
          ? (rows[0].adjusted_close - rows[1].adjusted_close) / rows[1].adjusted_close
          : null;

      case 'return_5d':
        return rows.length >= 6
          ? (rows[0].adjusted_close - rows[5].adjusted_close) / rows[5].adjusted_close
          : null;

      case 'return_21d':
        return rows.length >= 22
          ? (rows[0].adjusted_close - rows[21].adjusted_close) / rows[21].adjusted_close
          : null;

      case 'volatility_20d':
        if (rows.length < 21) return null;
        const returns = [];
        for (let i = 0; i < 20; i++) {
          const ret = (rows[i].adjusted_close - rows[i + 1].adjusted_close) / rows[i + 1].adjusted_close;
          returns.push(ret);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        return Math.sqrt(variance) * Math.sqrt(252); // Annualized

      default:
        return null;
    }
  }

  /**
   * Get technical feature value
   */
  _getTechnicalFeature(companyId, featureName, asOfDate, feature) {
    // Get price history for calculation
    const rows = this._getPriceFeatures.all(companyId, asOfDate, 252);
    if (!rows || rows.length === 0) return null;

    const closes = rows.map(r => r.close).reverse(); // Oldest first
    const highs = rows.map(r => r.high).reverse();
    const lows = rows.map(r => r.low).reverse();

    switch (featureName) {
      case 'rsi_14':
        return this._calculateRSI(closes, 14);

      case 'macd':
        return this._calculateMACD(closes).macd;

      case 'macd_signal':
        return this._calculateMACD(closes).signal;

      case 'sma_20':
        return this._calculateSMA(closes, 20);

      case 'sma_50':
        return this._calculateSMA(closes, 50);

      case 'sma_200':
        return this._calculateSMA(closes, 200);

      case 'bollinger_upper':
      case 'bollinger_lower': {
        const bb = this._calculateBollingerBands(closes, 20);
        return featureName === 'bollinger_upper' ? bb.upper : bb.lower;
      }

      case 'atr_14':
        return this._calculateATR(highs, lows, closes, 14);

      case 'adx_14':
        return this._calculateADX(highs, lows, closes, 14);

      default:
        return null;
    }
  }

  /**
   * Get fundamental feature value
   */
  _getFundamentalFeature(companyId, featureName, asOfDate, feature) {
    const row = this._getFundamentalFeatures.get(companyId, asOfDate);
    if (!row) return null;

    // Map feature names to column names
    const columnMap = {
      'pe_ratio': 'pe_ratio',
      'pb_ratio': 'pb_ratio',
      'ps_ratio': 'ps_ratio',
      'roe': 'roe',
      'roa': 'roa',
      'gross_margin': 'gross_margin',
      'operating_margin': 'operating_margin',
      'net_margin': 'net_margin',
      'debt_to_equity': 'debt_to_equity',
      'current_ratio': 'current_ratio',
      'revenue_growth': 'revenue_growth_yoy',
      'earnings_growth': 'eps_growth_yoy'
    };

    const column = columnMap[featureName] || feature.sourceColumn;
    return row[column] ?? null;
  }

  /**
   * Get factor feature value
   */
  _getFactorFeature(companyId, featureName, asOfDate, feature) {
    const row = this._getFactorFeatures.get(companyId, asOfDate);
    if (!row) return null;

    const columnMap = {
      'factor_value': 'value_score',
      'factor_quality': 'quality_score',
      'factor_momentum': 'momentum_score',
      'factor_size': 'size_score',
      'factor_volatility': 'volatility_score',
      'factor_growth': 'growth_score',
      'composite_score': 'composite_score'
    };

    const column = columnMap[featureName] || feature.sourceColumn;
    return row[column] ?? null;
  }

  /**
   * Get sentiment feature value
   */
  _getSentimentFeature(companyId, featureName, asOfDate, feature) {
    const row = this._getSentimentFeatures.get(companyId, asOfDate);
    if (!row) return null;

    const columnMap = {
      'sentiment_composite': 'weighted_sentiment',
      'sentiment_news': 'avg_sentiment',
      'sentiment_social': 'reddit_sentiment'
    };

    const column = columnMap[featureName] || feature.sourceColumn;
    return row[column] ?? null;
  }

  /**
   * Get alternative data feature value
   */
  _getAlternativeFeature(companyId, featureName, asOfDate, feature) {
    // These are computed on-the-fly from various sources
    switch (featureName) {
      case 'insider_signal':
        return this._getInsiderSignal(companyId, asOfDate);

      case 'congressional_signal':
        return this._getCongressionalSignal(companyId, asOfDate);

      case 'institutional_ownership':
        return this._getInstitutionalOwnership(companyId, asOfDate);

      case 'analyst_rating':
        return this._getAnalystRating(companyId, asOfDate);

      default:
        return null;
    }
  }

  /**
   * Get insider trading signal
   */
  _getInsiderSignal(companyId, asOfDate) {
    try {
      const result = db.prepare(`
        SELECT
          SUM(CASE WHEN transaction_type = 'P' THEN value ELSE 0 END) as buys,
          SUM(CASE WHEN transaction_type = 'S' THEN value ELSE 0 END) as sells
        FROM insider_trades
        WHERE company_id = ?
          AND transaction_date BETWEEN date(?, '-90 days') AND ?
      `).get(companyId, asOfDate, asOfDate);

      if (!result || (!result.buys && !result.sells)) return 0;

      const total = (result.buys || 0) + (result.sells || 0);
      if (total === 0) return 0;

      // Net buying signal: (buys - sells) / total, scaled to [-1, 1]
      return ((result.buys || 0) - (result.sells || 0)) / total;
    } catch (e) {
      // Table may not exist
      return null;
    }
  }

  /**
   * Get congressional trading signal
   */
  _getCongressionalSignal(companyId, asOfDate) {
    try {
      const result = db.prepare(`
        SELECT
          SUM(CASE WHEN transaction_type = 'purchase' THEN 1 ELSE 0 END) as buys,
          SUM(CASE WHEN transaction_type = 'sale_full' OR transaction_type = 'sale_partial' THEN 1 ELSE 0 END) as sells
        FROM congressional_trades ct
        JOIN companies c ON LOWER(ct.ticker) = LOWER(c.symbol)
        WHERE c.id = ?
          AND ct.transaction_date BETWEEN date(?, '-90 days') AND ?
      `).get(companyId, asOfDate, asOfDate);

      if (!result || (!result.buys && !result.sells)) return 0;

      const total = (result.buys || 0) + (result.sells || 0);
      if (total === 0) return 0;

      return ((result.buys || 0) - (result.sells || 0)) / total;
    } catch (e) {
      // Table may not exist
      return null;
    }
  }

  /**
   * Get institutional ownership percentage
   */
  _getInstitutionalOwnership(companyId, asOfDate) {
    try {
      const result = db.prepare(`
        SELECT institutional_ownership
        FROM institutional_holdings ih
        JOIN companies c ON ih.company_id = c.id
        WHERE c.id = ?
          AND ih.report_date <= ?
        ORDER BY ih.report_date DESC
        LIMIT 1
      `).get(companyId, asOfDate);

      return result?.institutional_ownership ?? null;
    } catch (e) {
      // Table may not exist
      return null;
    }
  }

  /**
   * Get analyst rating
   */
  _getAnalystRating(companyId, asOfDate) {
    try {
      const result = db.prepare(`
        SELECT AVG(rating) as avg_rating
        FROM analyst_estimates
        WHERE company_id = ?
          AND date <= ?
        ORDER BY date DESC
        LIMIT 1
      `).get(companyId, asOfDate);

      return result?.avg_rating ?? null;
    } catch (e) {
      // Table may not exist
      return null;
    }
  }

  /**
   * Get forward return for target
   */
  _getForwardReturn(companyId, date, forwardDays) {
    const future = db.prepare(`
      SELECT adjusted_close
      FROM daily_prices
      WHERE company_id = ? AND date > ?
      ORDER BY date
      LIMIT 1 OFFSET ?
    `).get(companyId, date, forwardDays - 1);

    const current = db.prepare(`
      SELECT adjusted_close
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `).get(companyId, date);

    if (!future || !current || !future.adjusted_close || !current.adjusted_close) {
      return null;
    }

    return (future.adjusted_close - current.adjusted_close) / current.adjusted_close;
  }

  // Technical indicator calculations

  _calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _calculateEMA(prices, period) {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  _calculateMACD(prices) {
    const ema12 = this._calculateEMA(prices, 12);
    const ema26 = this._calculateEMA(prices, 26);

    if (ema12 === null || ema26 === null) {
      return { macd: null, signal: null };
    }

    const macd = ema12 - ema26;
    // For signal, we'd need MACD history - simplified here
    return { macd, signal: macd * 0.9 }; // Approximation
  }

  _calculateBollingerBands(prices, period = 20) {
    const sma = this._calculateSMA(prices, period);
    if (sma === null) return { upper: null, lower: null };

    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: sma + 2 * std,
      lower: sma - 2 * std
    };
  }

  _calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    // Wilder's smoothing
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return atr;
  }

  _calculateADX(highs, lows, closes, period = 14) {
    // Simplified ADX - full implementation would need +DI and -DI
    const atr = this._calculateATR(highs, lows, closes, period);
    if (atr === null) return null;

    // Placeholder - would need full DMI calculation
    return 25; // Default neutral trend strength
  }

  // Cache management

  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    if (Date.now() - cached.timestamp > this.cacheTTLMs) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  _setCache(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      ttlMs: this.cacheTTLMs
    };
  }

  /**
   * Prefetch features for a list of symbols
   * Useful for warming cache before backtest
   */
  async prefetch(symbols, featureNames, dates) {
    let count = 0;
    for (const date of dates) {
      for (const symbol of symbols) {
        for (const featureName of featureNames) {
          this.getFeature(symbol, featureName, date);
          count++;
        }
      }
    }
    return count;
  }
}

// Singleton instance
let storeInstance = null;

function getStore(options) {
  if (!storeInstance) {
    storeInstance = new FeatureStore(options);
  }
  return storeInstance;
}

module.exports = {
  FeatureStore,
  getStore
};
