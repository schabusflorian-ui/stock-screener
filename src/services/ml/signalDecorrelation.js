// src/services/ml/signalDecorrelation.js
// Signal Decorrelation System - Derman recommendation
// Adjusts weights for correlated signals to avoid double-counting information

/**
 * SignalDecorrelator - Manages signal correlations and weight adjustments
 *
 * Implements:
 * - Correlation matrix calculation (Spearman)
 * - Weight adjustment for correlated signals
 * - Principal component transformation
 * - Redundant signal detection
 */
class SignalDecorrelator {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this.correlationCache = new Map();
    this._initializeTables();
    this._prepareStatements();
    console.log('🔗 SignalDecorrelator initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signal_correlations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        signal1 TEXT NOT NULL,
        signal2 TEXT NOT NULL,
        correlation REAL,
        sample_size INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(date, signal1, signal2)
      );

      CREATE TABLE IF NOT EXISTS decorrelation_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        base_weight REAL,
        adjusted_weight REAL,
        correlation_penalty REAL,
        highly_correlated_with TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtStoreCorrelation = this.db.prepare(`
      INSERT OR REPLACE INTO signal_correlations (
        date, signal1, signal2, correlation, sample_size
      ) VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtGetCorrelations = this.db.prepare(`
      SELECT signal1, signal2, correlation
      FROM signal_correlations
      WHERE date = ?
    `);

    this.stmtStoreAdjustment = this.db.prepare(`
      INSERT INTO decorrelation_adjustments (
        date, signal_type, base_weight, adjusted_weight,
        correlation_penalty, highly_correlated_with
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Calculate correlation matrix between all signal types
   * @param {Object} signals - Object with signal arrays {technical: [...], sentiment: [...], ...}
   * @param {number} lookback - Lookback period in days
   * @returns {Object} Correlation matrix and analysis
   */
  calculateSignalCorrelationMatrix(signals, lookback = 63) {
    const signalTypes = Object.keys(signals);
    const n = signalTypes.length;

    // Initialize correlation matrix
    const matrix = [];
    for (let i = 0; i < n; i++) {
      matrix[i] = new Array(n).fill(0);
      matrix[i][i] = 1; // Diagonal is 1
    }

    // Calculate pairwise Spearman correlations
    const correlationPairs = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const signal1 = signals[signalTypes[i]];
        const signal2 = signals[signalTypes[j]];

        const correlation = this._spearmanCorrelation(signal1, signal2);

        matrix[i][j] = correlation;
        matrix[j][i] = correlation;

        correlationPairs.push({
          signal1: signalTypes[i],
          signal2: signalTypes[j],
          correlation
        });
      }
    }

    // Store correlations
    const date = new Date().toISOString().split('T')[0];
    for (const pair of correlationPairs) {
      this.stmtStoreCorrelation.run(
        date, pair.signal1, pair.signal2, pair.correlation, lookback
      );
    }

    // Find highly correlated pairs
    const highlyCorrelated = correlationPairs.filter(p => Math.abs(p.correlation) > 0.7);

    // Calculate average correlation
    const allCorrs = correlationPairs.map(p => Math.abs(p.correlation));
    const avgCorrelation = allCorrs.reduce((a, b) => a + b, 0) / allCorrs.length;

    return {
      matrix,
      signalTypes,
      correlationPairs,
      highlyCorrelatedPairs: highlyCorrelated,
      avgCorrelation,
      maxCorrelation: Math.max(...allCorrs),
      interpretation: avgCorrelation > 0.5
        ? 'High average correlation - signals are redundant'
        : avgCorrelation > 0.3
        ? 'Moderate correlation - some redundancy'
        : 'Low correlation - good signal diversity'
    };
  }

  _spearmanCorrelation(x, y) {
    // Handle different length arrays
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    // Rank the values
    const xRanks = this._rankArray(xSlice);
    const yRanks = this._rankArray(ySlice);

    // Calculate Spearman correlation
    let sumD2 = 0;
    for (let i = 0; i < n; i++) {
      sumD2 += (xRanks[i] - yRanks[i]) ** 2;
    }

    return 1 - (6 * sumD2) / (n * (n * n - 1));
  }

  _rankArray(arr) {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);

    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].i] = i + 1;
    }

    return ranks;
  }

  /**
   * Get decorrelated weights based on correlation matrix
   * @param {Object} baseWeights - Original signal weights
   * @param {Object} correlationMatrix - Result from calculateSignalCorrelationMatrix
   * @param {number} threshold - Correlation threshold for adjustment
   * @returns {Object} Adjusted weights
   */
  getDecorrelatedWeights(baseWeights, correlationMatrix, threshold = 0.5) {
    const { matrix, signalTypes, correlationPairs } = correlationMatrix;

    // Deep copy weights
    const adjustedWeights = { ...baseWeights };
    const penalties = {};
    const correlatedWith = {};

    // For each highly correlated pair, reduce weights
    for (const pair of correlationPairs) {
      if (Math.abs(pair.correlation) > threshold) {
        const penalty = pair.correlation * 0.3; // 30% reduction per correlation point

        // Apply penalty to both signals
        for (const signal of [pair.signal1, pair.signal2]) {
          if (!penalties[signal]) {
            penalties[signal] = 0;
            correlatedWith[signal] = [];
          }
          penalties[signal] += penalty;
          correlatedWith[signal].push(signal === pair.signal1 ? pair.signal2 : pair.signal1);
        }
      }
    }

    // Apply penalties
    let totalWeight = 0;
    for (const signal of signalTypes) {
      const penalty = Math.min(0.5, penalties[signal] || 0); // Max 50% reduction
      adjustedWeights[signal] = baseWeights[signal] * (1 - penalty);
      totalWeight += adjustedWeights[signal];
    }

    // Renormalize to sum to 1
    for (const signal of signalTypes) {
      adjustedWeights[signal] /= totalWeight;
    }

    // Store adjustments
    const date = new Date().toISOString().split('T')[0];
    for (const signal of signalTypes) {
      this.stmtStoreAdjustment.run(
        date,
        signal,
        baseWeights[signal],
        adjustedWeights[signal],
        penalties[signal] || 0,
        JSON.stringify(correlatedWith[signal] || [])
      );
    }

    return {
      adjustedWeights,
      correlationPenalties: penalties,
      correlatedWith,
      totalPenalty: Object.values(penalties).reduce((a, b) => a + b, 0),
      interpretation: Object.keys(penalties).length > 0
        ? `${Object.keys(penalties).length} signals had weights reduced due to correlation`
        : 'No weight adjustments needed'
    };
  }

  /**
   * Identify redundant signals that could be removed
   * @param {Object} correlationMatrix - Correlation matrix result
   * @param {number} threshold - High correlation threshold
   * @returns {Array} Recommendations for signal removal
   */
  identifyRedundantSignals(correlationMatrix, threshold = 0.7) {
    const recommendations = [];

    for (const pair of correlationMatrix.correlationPairs) {
      if (Math.abs(pair.correlation) > threshold) {
        recommendations.push({
          signal1: pair.signal1,
          signal2: pair.signal2,
          correlation: pair.correlation.toFixed(3),
          recommendation: `Consider removing one of ${pair.signal1}/${pair.signal2} (r=${pair.correlation.toFixed(2)})`,
          keepSuggestion: pair.signal1 // Keep the first one alphabetically
        });
      }
    }

    return {
      redundantPairs: recommendations,
      totalRedundant: recommendations.length,
      signalsToRemove: [...new Set(recommendations.map(r =>
        r.signal1 > r.signal2 ? r.signal1 : r.signal2
      ))],
      interpretation: recommendations.length === 0
        ? 'No highly redundant signals detected'
        : `${recommendations.length} signal pairs are highly correlated (r>${threshold})`
    };
  }

  /**
   * Transform signals to principal components (orthogonal)
   * @param {Object} signals - Signal values {technical: [...], sentiment: [...], ...}
   * @param {number} numComponents - Number of PCs to return
   * @returns {Object} Principal components
   */
  transformToPrincipalComponents(signals, numComponents = 5) {
    const signalTypes = Object.keys(signals);
    const n = signals[signalTypes[0]].length;

    // Build data matrix (rows = observations, cols = signals)
    const data = [];
    for (let i = 0; i < n; i++) {
      const row = signalTypes.map(s => signals[s][i] || 0);
      data.push(row);
    }

    // Standardize columns
    const standardized = this._standardizeMatrix(data);

    // Calculate covariance matrix
    const covMatrix = this._calculateCovarianceMatrix(standardized);

    // Get eigenvalues and eigenvectors (power iteration)
    const { eigenvalues, eigenvectors } = this._eigenDecomposition(covMatrix, numComponents);

    // Project data onto principal components
    const principalComponents = [];
    for (let pc = 0; pc < numComponents; pc++) {
      const pcValues = [];
      for (let i = 0; i < n; i++) {
        let value = 0;
        for (let j = 0; j < signalTypes.length; j++) {
          value += standardized[i][j] * eigenvectors[pc][j];
        }
        pcValues.push(value);
      }
      principalComponents.push(pcValues);
    }

    // Calculate variance explained
    const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
    const varianceExplained = eigenvalues.map(e => e / totalVariance);

    return {
      principalComponents,
      varianceExplained,
      cumulativeVariance: varianceExplained.map((_, i) =>
        varianceExplained.slice(0, i + 1).reduce((a, b) => a + b, 0)
      ),
      loadings: eigenvectors,
      signalTypes,
      interpretation: `First ${numComponents} PCs explain ${(varianceExplained.slice(0, numComponents).reduce((a, b) => a + b, 0) * 100).toFixed(1)}% of variance`
    };
  }

  _standardizeMatrix(data) {
    const n = data.length;
    const m = data[0].length;
    const result = [];

    // Calculate means and stds
    const means = new Array(m).fill(0);
    const stds = new Array(m).fill(0);

    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        means[j] += data[i][j];
      }
      means[j] /= n;

      for (let i = 0; i < n; i++) {
        stds[j] += (data[i][j] - means[j]) ** 2;
      }
      stds[j] = Math.sqrt(stds[j] / (n - 1)) || 1;
    }

    // Standardize
    for (let i = 0; i < n; i++) {
      result[i] = [];
      for (let j = 0; j < m; j++) {
        result[i][j] = (data[i][j] - means[j]) / stds[j];
      }
    }

    return result;
  }

  _calculateCovarianceMatrix(data) {
    const n = data.length;
    const m = data[0].length;
    const cov = [];

    for (let i = 0; i < m; i++) {
      cov[i] = [];
      for (let j = 0; j < m; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += data[k][i] * data[k][j];
        }
        cov[i][j] = sum / (n - 1);
      }
    }

    return cov;
  }

  _eigenDecomposition(matrix, numComponents) {
    const m = matrix.length;
    const eigenvalues = [];
    const eigenvectors = [];

    // Power iteration for each component
    let A = matrix.map(row => [...row]);

    for (let comp = 0; comp < Math.min(numComponents, m); comp++) {
      // Initial random vector
      let v = new Array(m).fill(0).map(() => Math.random());

      // Power iteration
      for (let iter = 0; iter < 100; iter++) {
        // Multiply A * v
        const Av = new Array(m).fill(0);
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < m; j++) {
            Av[i] += A[i][j] * v[j];
          }
        }

        // Normalize
        const norm = Math.sqrt(Av.reduce((sum, x) => sum + x * x, 0));
        v = Av.map(x => x / (norm || 1));
      }

      // Eigenvalue = v^T * A * v
      let eigenvalue = 0;
      for (let i = 0; i < m; i++) {
        let sum = 0;
        for (let j = 0; j < m; j++) {
          sum += A[i][j] * v[j];
        }
        eigenvalue += v[i] * sum;
      }

      eigenvalues.push(eigenvalue);
      eigenvectors.push(v);

      // Deflate: A = A - eigenvalue * v * v^T
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          A[i][j] -= eigenvalue * v[i] * v[j];
        }
      }
    }

    return { eigenvalues, eigenvectors };
  }

  /**
   * Combine signals using PCA-based scores
   * @param {Object} signals - Current signal values
   * @param {Object} pcaResult - Result from transformToPrincipalComponents
   * @returns {number} Combined score
   */
  combineWithPCA(signals, pcaResult) {
    const { loadings, varianceExplained, signalTypes } = pcaResult;

    // Weight each PC by variance explained
    let combinedScore = 0;
    const signalValues = signalTypes.map(s => signals[s] || 0);

    for (let pc = 0; pc < loadings.length; pc++) {
      // Project current signals onto PC
      let pcScore = 0;
      for (let j = 0; j < signalTypes.length; j++) {
        pcScore += signalValues[j] * loadings[pc][j];
      }

      // Weight by variance explained
      combinedScore += pcScore * varianceExplained[pc];
    }

    return combinedScore;
  }

  /**
   * Update rolling correlation with new signal data
   * @param {Object} newSignals - New signal observations
   * @param {number} decayFactor - Exponential decay (0.94 = ~15-day half-life)
   */
  updateRollingCorrelation(newSignals, decayFactor = 0.94) {
    const signalTypes = Object.keys(newSignals);
    const cacheKey = signalTypes.sort().join('_');

    // Get or initialize cache
    if (!this.correlationCache.has(cacheKey)) {
      this.correlationCache.set(cacheKey, {
        sumXY: {},
        sumX: {},
        sumX2: {},
        sumY: {},
        sumY2: {},
        n: 0
      });
    }

    const cache = this.correlationCache.get(cacheKey);

    // Apply decay
    cache.n *= decayFactor;
    for (const key in cache.sumXY) {
      cache.sumXY[key] *= decayFactor;
    }
    for (const key in cache.sumX) {
      cache.sumX[key] *= decayFactor;
      cache.sumX2[key] *= decayFactor;
    }

    // Add new observation
    cache.n += 1;

    for (let i = 0; i < signalTypes.length; i++) {
      const xi = newSignals[signalTypes[i]] || 0;
      cache.sumX[signalTypes[i]] = (cache.sumX[signalTypes[i]] || 0) + xi;
      cache.sumX2[signalTypes[i]] = (cache.sumX2[signalTypes[i]] || 0) + xi * xi;

      for (let j = i + 1; j < signalTypes.length; j++) {
        const yj = newSignals[signalTypes[j]] || 0;
        const key = `${signalTypes[i]}_${signalTypes[j]}`;
        cache.sumXY[key] = (cache.sumXY[key] || 0) + xi * yj;
      }
    }
  }

  /**
   * Get current rolling correlation from cache
   * @returns {Object} Current correlation estimates
   */
  getRollingCorrelation() {
    const results = {};

    for (const [cacheKey, cache] of this.correlationCache) {
      const signalTypes = cacheKey.split('_');

      for (let i = 0; i < signalTypes.length; i++) {
        for (let j = i + 1; j < signalTypes.length; j++) {
          const key = `${signalTypes[i]}_${signalTypes[j]}`;

          const n = cache.n;
          const sumX = cache.sumX[signalTypes[i]] || 0;
          const sumY = cache.sumX[signalTypes[j]] || 0;
          const sumX2 = cache.sumX2[signalTypes[i]] || 0;
          const sumY2 = cache.sumX2[signalTypes[j]] || 0;
          const sumXY = cache.sumXY[key] || 0;

          const numerator = n * sumXY - sumX * sumY;
          const denominator = Math.sqrt(
            (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
          );

          results[key] = denominator > 0 ? numerator / denominator : 0;
        }
      }
    }

    return results;
  }
}

function createSignalDecorrelator(db) {
  return new SignalDecorrelator(db);
}

module.exports = { SignalDecorrelator, createSignalDecorrelator };
