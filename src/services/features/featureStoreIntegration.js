// src/services/features/featureStoreIntegration.js
// Integration layer between Feature Store and existing signal calculators

const { getStore } = require('./featureStore');
const { getRegistry, FEATURE_TYPES } = require('./featureRegistry');

/**
 * FeatureStoreIntegration
 *
 * Bridges the Feature Store with existing signal calculators in UnifiedStrategyEngine.
 * Provides:
 * - Unified data retrieval interface
 * - Point-in-time correct lookups for backtesting
 * - Feature caching across signal calculators
 * - Gradual migration path from direct DB queries
 *
 * Migration Strategy:
 * 1. Start by wrapping existing data fetches with Feature Store calls
 * 2. Use Feature Store for new features
 * 3. Gradually replace direct DB queries in signal calculators
 * 4. Enable drift monitoring once baseline is established
 */
class FeatureStoreIntegration {
  constructor(db, options = {}) {
    this.db = db;
    this.store = getStore();
    this.registry = getRegistry();
    this.simulationDate = null;

    // Feature sets for different signal types
    this.signalFeatureSets = this._defineSignalFeatureSets();
  }

  /**
   * Define which features each signal type needs
   */
  _defineSignalFeatureSets() {
    return {
      technical: [
        'close', 'volume', 'rsi_14', 'macd', 'macd_signal',
        'sma_20', 'sma_50', 'sma_200', 'atr_14', 'adx_14',
        'bollinger_upper', 'bollinger_lower'
      ],

      fundamental: [
        'pe_ratio', 'pb_ratio', 'ps_ratio', 'roe', 'roa',
        'gross_margin', 'operating_margin', 'net_margin',
        'debt_to_equity', 'current_ratio', 'revenue_growth', 'earnings_growth'
      ],

      valuation: [
        'pe_ratio', 'pb_ratio', 'ps_ratio',
        'factor_value', 'factor_quality'
      ],

      momentum: [
        'return_1d', 'return_5d', 'return_21d', 'volatility_20d',
        'factor_momentum', 'rsi_14'
      ],

      sentiment: [
        'sentiment_composite', 'sentiment_news', 'sentiment_social'
      ],

      insider: ['insider_signal'],

      congressional: ['congressional_signal'],

      alternative: [
        'insider_signal', 'congressional_signal',
        'institutional_ownership', 'analyst_rating'
      ],

      factors: [
        'factor_value', 'factor_quality', 'factor_momentum',
        'factor_size', 'factor_volatility', 'factor_growth',
        'composite_score'
      ],

      ml: [
        // All ML features
        'return_1d', 'return_5d', 'return_21d', 'volatility_20d',
        'rsi_14', 'macd', 'sma_20', 'sma_50', 'atr_14',
        'pe_ratio', 'pb_ratio', 'roe', 'roa', 'gross_margin', 'debt_to_equity',
        'factor_value', 'factor_quality', 'factor_momentum', 'factor_size', 'factor_volatility',
        'sentiment_composite',
        'insider_signal', 'institutional_ownership'
      ]
    };
  }

  /**
   * Set simulation date for point-in-time lookups
   */
  setSimulationDate(date) {
    this.simulationDate = date;
    return this;
  }

  /**
   * Get the effective date for lookups (simulation or current)
   */
  _getEffectiveDate() {
    if (this.simulationDate) {
      return this.simulationDate;
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get features for a specific signal type
   *
   * @param {string} symbol - Stock symbol
   * @param {string} signalType - One of: technical, fundamental, valuation, etc.
   * @returns {object} Feature values
   */
  async getFeaturesForSignal(symbol, signalType) {
    const featureNames = this.signalFeatureSets[signalType];
    if (!featureNames) {
      console.warn(`Unknown signal type: ${signalType}`);
      return {};
    }

    const date = this._getEffectiveDate();
    return await this.store.getFeatures(symbol, featureNames, date);
  }

  /**
   * Get technical features for a symbol
   */
  async getTechnicalFeatures(symbol) {
    return await this.getFeaturesForSignal(symbol, 'technical');
  }

  /**
   * Get fundamental features for a symbol
   */
  async getFundamentalFeatures(symbol) {
    return await this.getFeaturesForSignal(symbol, 'fundamental');
  }

  /**
   * Get factor features for a symbol
   */
  async getFactorFeatures(symbol) {
    return await this.getFeaturesForSignal(symbol, 'factors');
  }

  /**
   * Get sentiment features for a symbol
   */
  async getSentimentFeatures(symbol) {
    return await this.getFeaturesForSignal(symbol, 'sentiment');
  }

  /**
   * Get all ML features for a symbol
   */
  async getMLFeatures(symbol) {
    return await this.getFeaturesForSignal(symbol, 'ml');
  }

  /**
   * Get features for multiple symbols (batch)
   *
   * @param {string[]} symbols - Stock symbols
   * @param {string} signalType - Signal type
   * @returns {object} Map of symbol -> features
   */
  async getBatchFeaturesForSignal(symbols, signalType) {
    const featureNames = this.signalFeatureSets[signalType];
    if (!featureNames) {
      console.warn(`Unknown signal type: ${signalType}`);
      return {};
    }

    const date = this._getEffectiveDate();
    return await this.store.getBatchFeatures(symbols, featureNames, date);
  }

  /**
   * Get price data for a symbol
   * Compatibility method for existing signal calculators
   */
  getPriceData(symbol, lookback = 252) {
    const date = this._getEffectiveDate();
    const companyStmt = this.db.prepare('SELECT id FROM companies WHERE symbol = ?');
    const company = companyStmt.get(symbol);
    if (!company) return [];

    const pricesStmt = this.db.prepare(`
      SELECT date, open, high, low, close,
             COALESCE(adjusted_close, close) as adjusted_close, volume
      FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT ?
    `);

    return pricesStmt.all(company.id, date, lookback);
  }

  /**
   * Get fundamental data for a symbol
   * Compatibility method for existing signal calculators
   */
  getFundamentalData(symbol) {
    const date = this._getEffectiveDate();
    const companyStmt = this.db.prepare('SELECT id FROM companies WHERE symbol = ?');
    const company = companyStmt.get(symbol);
    if (!company) return null;

    const fundamentalStmt = this.db.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
        AND calculation_date <= ?
      ORDER BY calculation_date DESC
      LIMIT 1
    `);

    return fundamentalStmt.get(company.id, date);
  }

  /**
   * Get factor scores for a symbol
   * Compatibility method for existing signal calculators
   */
  getFactorScores(symbol) {
    const date = this._getEffectiveDate();
    const companyStmt = this.db.prepare('SELECT id FROM companies WHERE symbol = ?');
    const company = companyStmt.get(symbol);
    if (!company) return null;

    const factorStmt = this.db.prepare(`
      SELECT * FROM stock_factor_scores
      WHERE company_id = ?
        AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    return factorStmt.get(company.id, date);
  }

  /**
   * Create feature vector for ML model
   *
   * @param {string} symbol - Stock symbol
   * @returns {Promise<object>} { features: number[], featureNames: string[] }
   */
  async createMLFeatureVector(symbol) {
    const features = await this.getMLFeatures(symbol);
    const mlFeatureNames = this.signalFeatureSets.ml;

    const vector = mlFeatureNames.map(name => {
      const value = features[name];
      // Handle missing/invalid values
      if (value === null || value === undefined || isNaN(value)) {
        return 0; // Default to 0 or could use mean imputation
      }
      return value;
    });

    return {
      features: vector,
      featureNames: mlFeatureNames
    };
  }

  /**
   * Create feature matrix for multiple symbols
   *
   * @param {string[]} symbols - Stock symbols
   * @returns {Promise<object>} { matrix: number[][], featureNames: string[], symbols: string[] }
   */
  async createMLFeatureMatrix(symbols) {
    const matrix = [];
    const validSymbols = [];
    const mlFeatureNames = this.signalFeatureSets.ml;

    for (const symbol of symbols) {
      const { features } = await this.createMLFeatureVector(symbol);
      const validCount = features.filter(v => v !== 0).length;

      // Only include if we have enough valid features
      if (validCount >= mlFeatureNames.length * 0.7) {
        matrix.push(features);
        validSymbols.push(symbol);
      }
    }

    return {
      matrix,
      featureNames: mlFeatureNames,
      symbols: validSymbols
    };
  }

  /**
   * Normalize features (z-score)
   *
   * @param {number[][]} matrix - Feature matrix
   * @returns {object} { normalized: number[][], means: number[], stds: number[] }
   */
  normalizeFeatures(matrix) {
    if (matrix.length === 0) {
      return { normalized: [], means: [], stds: [] };
    }

    const numFeatures = matrix[0].length;
    const means = new Array(numFeatures).fill(0);
    const stds = new Array(numFeatures).fill(0);

    // Calculate means
    for (const row of matrix) {
      for (let j = 0; j < numFeatures; j++) {
        means[j] += row[j];
      }
    }
    for (let j = 0; j < numFeatures; j++) {
      means[j] /= matrix.length;
    }

    // Calculate stds
    for (const row of matrix) {
      for (let j = 0; j < numFeatures; j++) {
        stds[j] += Math.pow(row[j] - means[j], 2);
      }
    }
    for (let j = 0; j < numFeatures; j++) {
      stds[j] = Math.sqrt(stds[j] / matrix.length) || 1; // Avoid division by zero
    }

    // Normalize
    const normalized = matrix.map(row =>
      row.map((value, j) => (value - means[j]) / stds[j])
    );

    return { normalized, means, stds };
  }

  /**
   * Get feature statistics for monitoring
   */
  async getFeatureStats(symbol) {
    const features = await this.getMLFeatures(symbol);
    const stats = {};

    for (const [name, value] of Object.entries(features)) {
      const feature = this.registry.get(name);
      stats[name] = {
        value,
        expected: feature ? {
          min: feature.expectedMin,
          max: feature.expectedMax,
          mean: feature.expectedMean,
          std: feature.expectedStd
        } : null,
        outOfBounds: feature && feature.expectedMin !== undefined &&
          (value < feature.expectedMin || value > feature.expectedMax)
      };
    }

    return stats;
  }
}

// Factory function
function createFeatureStoreIntegration(db, options = {}) {
  return new FeatureStoreIntegration(db, options);
}

module.exports = {
  FeatureStoreIntegration,
  createFeatureStoreIntegration
};
