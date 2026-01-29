// src/services/statistics/predictionIntervals.js
// Prediction Intervals System - Derman-inspired uncertainty quantification
// Replace dangerous point estimates with proper confidence intervals

/**
 * PredictionIntervalCalculator - Bootstrap-based prediction intervals
 *
 * Implements:
 * - Block bootstrap for signal intervals (preserving autocorrelation)
 * - Bayesian signal weight updating
 * - Calibration testing
 * - Position sizing with uncertainty
 */
class PredictionIntervalCalculator {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this._initializeTables();
    this._prepareStatements();
    console.log('📐 PredictionIntervalCalculator initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prediction_intervals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        signal_type TEXT,
        date TEXT,
        current_signal REAL,
        expected_return_mean REAL,
        expected_return_p5 REAL,
        expected_return_p25 REAL,
        expected_return_p50 REAL,
        expected_return_p75 REAL,
        expected_return_p95 REAL,
        interval_width REAL,
        is_significant INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS signal_calibration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_type TEXT,
        evaluation_date TEXT,
        interval_90_coverage REAL,
        interval_95_coverage REAL,
        interval_99_coverage REAL,
        is_calibrated INTEGER,
        num_observations INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS signal_ic_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_type TEXT,
        date TEXT,
        ic_value REAL,
        lookback_days INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtStoreInterval = this.db.prepare(`
      INSERT INTO prediction_intervals (
        company_id, signal_type, date, current_signal,
        expected_return_mean, expected_return_p5, expected_return_p25,
        expected_return_p50, expected_return_p75, expected_return_p95,
        interval_width, is_significant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtStoreCalibration = this.db.prepare(`
      INSERT INTO signal_calibration (
        signal_type, evaluation_date, interval_90_coverage,
        interval_95_coverage, interval_99_coverage, is_calibrated, num_observations
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetSignalHistory = this.db.prepare(`
      SELECT r.score as signal_score, r.confidence,
             (SELECT (dp2.close - dp1.close) / dp1.close
              FROM daily_prices dp1
              JOIN daily_prices dp2 ON dp1.company_id = dp2.company_id
              WHERE dp1.company_id = r.company_id
                AND dp1.date = r.date
                AND dp2.date = date(r.date, '+21 days')
             ) as forward_return
      FROM agent_recommendations r
      WHERE r.action IN ('strong_buy', 'buy', 'sell', 'strong_sell')
        AND r.date >= date('now', '-365 days')
      ORDER BY r.date
    `);
  }

  /**
   * Calculate bootstrap prediction interval for a signal
   * @param {string} signalType - Type of signal (technical, sentiment, etc.)
   * @param {number} companyId - Company ID
   * @param {number} numSamples - Bootstrap samples (default 1000)
   * @param {number} blockSize - Block size for block bootstrap (default 21)
   * @returns {Object} Prediction interval
   */
  bootstrapSignalInterval(signalType, companyId, numSamples = 1000, blockSize = 21) {
    // Get historical signal-return pairs
    const history = this._getSignalReturnHistory(signalType, companyId);

    if (history.length < 50) {
      return {
        error: 'Insufficient history',
        minRequired: 50,
        available: history.length
      };
    }

    // Block bootstrap
    const bootstrapReturns = [];

    for (let i = 0; i < numSamples; i++) {
      const sample = this._blockBootstrapSample(history, blockSize);
      const avgReturn = sample.reduce((sum, s) => sum + s.forward_return, 0) / sample.length;
      bootstrapReturns.push(avgReturn);
    }

    // Sort for percentile calculation
    bootstrapReturns.sort((a, b) => a - b);

    const percentiles = this._calculatePercentiles(bootstrapReturns, [5, 25, 50, 75, 95]);
    const mean = bootstrapReturns.reduce((a, b) => a + b, 0) / bootstrapReturns.length;
    const std = this._std(bootstrapReturns);

    const intervalWidth = percentiles.p95 - percentiles.p5;
    const isSignificant = percentiles.p5 > 0 || percentiles.p95 < 0;

    const result = {
      signalType,
      companyId,
      numSamples,
      blockSize,
      expectedReturn: {
        mean,
        median: percentiles.p50,
        percentile5: percentiles.p5,
        percentile25: percentiles.p25,
        percentile75: percentiles.p75,
        percentile95: percentiles.p95
      },
      confidence: {
        intervalWidth,
        standardError: std,
        isSignificant,
        confidenceLevel: isSignificant ? 0.95 : 0.50
      },
      sampleSize: history.length
    };

    // Store result
    this._storeInterval(result);

    return result;
  }

  _getSignalReturnHistory(signalType, companyId) {
    // Try to get from recommendations table
    try {
      const data = this.stmtGetSignalHistory.all(signalType);
      return data.filter(d => d.forward_return != null);
    } catch (e) {
      return [];
    }
  }

  _blockBootstrapSample(data, blockSize) {
    const sample = [];
    const numBlocks = Math.ceil(data.length / blockSize);

    for (let i = 0; i < numBlocks; i++) {
      const startIdx = Math.floor(Math.random() * (data.length - blockSize + 1));
      for (let j = 0; j < blockSize && sample.length < data.length; j++) {
        sample.push(data[startIdx + j]);
      }
    }

    return sample.slice(0, data.length);
  }

  _calculatePercentiles(sortedData, percentiles) {
    const result = {};
    for (const p of percentiles) {
      const idx = Math.floor((p / 100) * (sortedData.length - 1));
      result[`p${p}`] = sortedData[idx];
    }
    return result;
  }

  _storeInterval(result) {
    const date = new Date().toISOString().split('T')[0];
    try {
      this.stmtStoreInterval.run(
        result.companyId,
        result.signalType,
        date,
        null, // current_signal
        result.expectedReturn.mean,
        result.expectedReturn.percentile5,
        result.expectedReturn.percentile25,
        result.expectedReturn.percentile50,
        result.expectedReturn.percentile75,
        result.expectedReturn.percentile95,
        result.confidence.intervalWidth,
        result.confidence.isSignificant ? 1 : 0
      );
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Combine prediction intervals from multiple signals
   * @param {Array} signals - Array of {type, interval}
   * @param {Object} weights - Signal weights
   * @returns {Object} Combined prediction interval
   */
  calculateEnsembleInterval(signals, weights) {
    if (signals.length === 0) {
      return { error: 'No signals provided' };
    }

    // Weight-adjusted combination
    let totalWeight = 0;
    const combined = {
      mean: 0,
      p5: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p95: 0
    };

    for (const signal of signals) {
      const weight = weights[signal.type] || (1 / signals.length);
      const interval = signal.interval;

      if (interval && interval.expectedReturn) {
        combined.mean += interval.expectedReturn.mean * weight;
        combined.p5 += interval.expectedReturn.percentile5 * weight;
        combined.p25 += interval.expectedReturn.percentile25 * weight;
        combined.p50 += interval.expectedReturn.percentile50 * weight;
        combined.p75 += interval.expectedReturn.percentile75 * weight;
        combined.p95 += interval.expectedReturn.percentile95 * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return { error: 'No valid intervals' };
    }

    // Normalize
    for (const key in combined) {
      combined[key] /= totalWeight;
    }

    // Calculate agreement score
    const directions = signals.map(s =>
      s.interval?.expectedReturn?.median > 0 ? 1 : -1
    );
    const agreementScore = Math.abs(directions.reduce((a, b) => a + b, 0)) / directions.length;

    return {
      combinedExpectedReturn: {
        mean: combined.mean,
        percentile5: combined.p5,
        percentile25: combined.p25,
        percentile50: combined.p50,
        percentile75: combined.p75,
        percentile95: combined.p95
      },
      intervalWidth: combined.p95 - combined.p5,
      isSignificant: combined.p5 > 0 || combined.p95 < 0,
      agreementScore,
      signalCount: signals.length,
      dominantSignal: this._findDominantSignal(signals, weights)
    };
  }

  _findDominantSignal(signals, weights) {
    let maxWeight = 0;
    let dominant = null;

    for (const signal of signals) {
      const weight = weights[signal.type] || 0;
      if (weight > maxWeight && signal.interval?.confidence?.isSignificant) {
        maxWeight = weight;
        dominant = signal.type;
      }
    }

    return dominant;
  }

  /**
   * Bayesian update of signal quality
   * @param {string} signalType - Signal type
   * @param {number} priorIC - Prior information coefficient
   * @param {number} lookback - Days for recent performance
   * @returns {Object} Updated signal assessment
   */
  bayesianSignalUpdate(signalType, priorIC = 0.03, lookback = 63) {
    // Get recent signal performance
    const recentIC = this._calculateRecentIC(signalType, lookback);

    // Prior parameters (based on historical IC distribution)
    const priorMean = priorIC;
    const priorStd = 0.02; // Typical IC standard deviation

    // Likelihood (recent performance)
    const likelihoodMean = recentIC.ic || 0;
    const likelihoodStd = recentIC.std || 0.03;

    // Bayesian update (conjugate normal-normal)
    const priorPrecision = 1 / (priorStd ** 2);
    const likelihoodPrecision = 1 / (likelihoodStd ** 2);

    const posteriorPrecision = priorPrecision + likelihoodPrecision;
    const posteriorMean = (priorPrecision * priorMean + likelihoodPrecision * likelihoodMean) / posteriorPrecision;
    const posteriorStd = Math.sqrt(1 / posteriorPrecision);

    return {
      priorIC: { mean: priorMean, std: priorStd },
      likelihoodIC: { mean: likelihoodMean, std: likelihoodStd, sampleSize: recentIC.n },
      posteriorIC: { mean: posteriorMean, std: posteriorStd },
      effectiveWeight: Math.max(0.1, Math.min(1.0, posteriorMean / 0.05)),
      interpretation: posteriorMean > 0.03
        ? 'Signal showing strong predictive power'
        : posteriorMean > 0.01
        ? 'Signal has moderate predictive value'
        : posteriorMean > 0
        ? 'Signal has weak predictive value'
        : 'Signal may have negative predictive value'
    };
  }

  _calculateRecentIC(signalType, lookback) {
    // Simplified IC calculation
    const history = this._getSignalReturnHistory(signalType, null);
    const recent = history.slice(-lookback);

    if (recent.length < 20) {
      return { ic: 0, std: 0.05, n: recent.length };
    }

    // Spearman rank correlation
    const n = recent.length;
    const signalRanks = this._rankArray(recent.map(r => r.signal_score));
    const returnRanks = this._rankArray(recent.map(r => r.forward_return));

    let sumD2 = 0;
    for (let i = 0; i < n; i++) {
      sumD2 += (signalRanks[i] - returnRanks[i]) ** 2;
    }

    const ic = 1 - (6 * sumD2) / (n * (n * n - 1));
    const std = Math.sqrt((1 - ic ** 2) / (n - 2));

    return { ic, std, n };
  }

  _rankArray(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    return arr.map(v => sorted.indexOf(v) + 1);
  }

  /**
   * Assess prediction quality (calibration)
   * @param {string} signalType - Signal type
   * @param {number} lookback - Days to evaluate
   * @returns {Object} Calibration assessment
   */
  assessPredictionQuality(signalType, lookback = 252) {
    // Get historical predictions and actual outcomes
    const predictions = this.db.prepare(`
      SELECT expected_return_p5, expected_return_p50, expected_return_p95,
             expected_return_mean, date, company_id
      FROM prediction_intervals
      WHERE signal_type = ?
        AND date >= date('now', '-${lookback} days')
    `).all(signalType);

    if (predictions.length < 30) {
      return {
        error: 'Insufficient predictions for calibration',
        available: predictions.length
      };
    }

    // Match with actual outcomes
    let in90 = 0, in95 = 0, in99 = 0, total = 0;

    for (const pred of predictions) {
      const actual = this._getActualReturn(pred.company_id, pred.date, 21);
      if (actual === null) continue;

      total++;

      // 90% interval (p5 to p95)
      if (actual >= pred.expected_return_p5 && actual <= pred.expected_return_p95) {
        in90++;
      }

      // Wider intervals approximated
      const width = pred.expected_return_p95 - pred.expected_return_p5;
      const p2_5 = pred.expected_return_p5 - width * 0.1;
      const p97_5 = pred.expected_return_p95 + width * 0.1;

      if (actual >= p2_5 && actual <= p97_5) {
        in95++;
      }

      const p0_5 = pred.expected_return_p5 - width * 0.2;
      const p99_5 = pred.expected_return_p95 + width * 0.2;

      if (actual >= p0_5 && actual <= p99_5) {
        in99++;
      }
    }

    const coverage90 = total > 0 ? in90 / total : 0;
    const coverage95 = total > 0 ? in95 / total : 0;
    const coverage99 = total > 0 ? in99 / total : 0;

    const isCalibrated = Math.abs(coverage95 - 0.95) < 0.05;

    // Store calibration result
    this.stmtStoreCalibration.run(
      signalType,
      new Date().toISOString().split('T')[0],
      coverage90,
      coverage95,
      coverage99,
      isCalibrated ? 1 : 0,
      total
    );

    return {
      interval90Coverage: coverage90,
      interval95Coverage: coverage95,
      interval99Coverage: coverage99,
      isCalibrated,
      numObservations: total,
      interpretation: isCalibrated
        ? 'Prediction intervals are well-calibrated'
        : coverage95 < 0.95
        ? 'Intervals too narrow - predictions overconfident'
        : 'Intervals too wide - predictions underconfident'
    };
  }

  _getActualReturn(companyId, date, days) {
    const result = this.db.prepare(`
      SELECT (dp2.close - dp1.close) / dp1.close as return
      FROM daily_prices dp1
      JOIN daily_prices dp2 ON dp1.company_id = dp2.company_id
      WHERE dp1.company_id = ?
        AND dp1.date = ?
        AND dp2.date = date(?, '+${days} days')
    `).get(companyId, date, date);

    return result?.return || null;
  }

  /**
   * Generate uncertainty flags for a prediction
   * @param {Object} predictionInterval - Prediction interval object
   * @returns {Object} Uncertainty flags
   */
  generateUncertaintyFlags(predictionInterval) {
    const flags = [];

    if (!predictionInterval || predictionInterval.error) {
      return { isHighUncertainty: true, flags: ['NO_DATA'] };
    }

    const width = predictionInterval.confidence?.intervalWidth || 0;
    const isSignificant = predictionInterval.confidence?.isSignificant || false;

    // Wide interval flag
    if (width > 0.20) {
      flags.push('WIDE_INTERVAL');
    }

    // Crosses zero flag
    if (!isSignificant) {
      flags.push('CROSSES_ZERO');
    }

    // Limited history flag
    if (predictionInterval.sampleSize < 100) {
      flags.push('LIMITED_HISTORY');
    }

    // High standard error
    if (predictionInterval.confidence?.standardError > 0.05) {
      flags.push('HIGH_UNCERTAINTY');
    }

    return {
      isHighUncertainty: width > 0.20 || !isSignificant,
      isLowConfidence: !isSignificant,
      flags,
      summary: flags.length > 0
        ? `Prediction has ${flags.length} uncertainty flag(s): ${flags.join(', ')}`
        : 'Prediction has acceptable confidence'
    };
  }

  /**
   * Adjust position size based on prediction uncertainty
   * @param {number} baseSize - Base position size (fraction)
   * @param {Object} predictionInterval - Prediction interval
   * @returns {Object} Adjusted size recommendation
   */
  uncertaintyAdjustedSize(baseSize, predictionInterval) {
    const flags = this.generateUncertaintyFlags(predictionInterval);

    let adjustment = 1.0;
    const reasons = [];

    // Interval width adjustment
    const width = predictionInterval?.confidence?.intervalWidth || 0.15;
    if (width > 0.25) {
      adjustment *= 0.5;
      reasons.push('Very wide prediction interval');
    } else if (width > 0.15) {
      adjustment *= 0.7;
      reasons.push('Moderate interval width');
    }

    // Significance adjustment
    if (!predictionInterval?.confidence?.isSignificant) {
      adjustment *= 0.7;
      reasons.push('Prediction interval crosses zero');
    }

    // Sample size adjustment
    if (predictionInterval?.sampleSize < 50) {
      adjustment *= 0.8;
      reasons.push('Limited historical data');
    }

    // Minimum adjustment
    adjustment = Math.max(0.3, adjustment);

    return {
      baseSize,
      adjustedSize: baseSize * adjustment,
      adjustment,
      uncertaintyPenalty: 1 - adjustment,
      reasons,
      flags: flags.flags
    };
  }

  // ========== Helpers ==========

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }
}

/**
 * Helper function to check if should act on signal
 * @param {Object} interval - Prediction interval
 * @returns {boolean} Whether to act
 */
function shouldActOnSignal(interval) {
  if (!interval || interval.error) return false;

  // Only act if 5th percentile > 0 for buys (high confidence)
  const p5 = interval.expectedReturn?.percentile5 || 0;
  const p95 = interval.expectedReturn?.percentile95 || 0;

  // Buy signal: p5 > 0
  // Sell signal: p95 < 0
  return p5 > 0 || p95 < 0;
}

/**
 * Get weight adjustment based on interval
 * @param {string} signalType - Signal type
 * @param {Object} interval - Prediction interval
 * @returns {number} Weight multiplier
 */
function getIntervalAdjustedWeight(signalType, interval) {
  if (!interval || interval.error) return 0.5;

  const width = interval.confidence?.intervalWidth || 0.15;
  const isSignificant = interval.confidence?.isSignificant || false;

  let multiplier = 1.0;

  if (!isSignificant) multiplier *= 0.6;
  if (width > 0.20) multiplier *= 0.7;
  if (width > 0.30) multiplier *= 0.5;

  return Math.max(0.3, multiplier);
}

function createPredictionIntervalCalculator(db) {
  return new PredictionIntervalCalculator(db);
}

module.exports = {
  PredictionIntervalCalculator,
  createPredictionIntervalCalculator,
  shouldActOnSignal,
  getIntervalAdjustedWeight
};
