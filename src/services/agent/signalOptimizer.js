// src/services/agent/signalOptimizer.js
// Dynamically adjusts signal weights based on historical Information Coefficient (IC)
// Enhanced with alpha validation gate from HF-style backtesting framework

const { RecommendationTracker } = require('./recommendationTracker');

// Lazy load alpha validation module
let alphaValidation = null;
function loadAlphaValidation() {
  try {
    if (!alphaValidation) {
      alphaValidation = require('../backtesting/alphaValidation');
    }
    return true;
  } catch (error) {
    return false;
  }
}

class SignalOptimizer {
  constructor(db) {
    this.db = db;
    this.tracker = new RecommendationTracker(db);
    this.alphaValidationEnabled = loadAlphaValidation();

    // Base weights (fallback when no IC data available)
    this.baseWeights = {
      technical: 0.12,
      sentiment: 0.12,
      insider: 0.12,
      fundamental: 0.15,
      alternative: 0.12,
      valuation: 0.12,
      filing_13f: 0.13,
      earnings: 0.12
    };

    // Constraints
    this.minWeight = 0.05;  // No signal below 5%
    this.maxWeight = 0.30;  // No signal above 30%
    this.baseBlendRatio = 0.5;  // 50% base, 50% IC-optimized

    // Alpha validation thresholds
    this.alphaValidation = {
      minICForFullWeight: 0.02,    // IC > 0.02 = full weight
      minICForReducedWeight: 0.01, // IC > 0.01 = 70% weight
      penaltyForNoSignificance: 0.5, // 50% weight if not significant
      minSampleSize: 30,           // Need 30+ samples for validity
    };

    // Regime-specific adjustments
    this.regimeAdjustments = {
      BULL: {
        technical: 1.1,
        sentiment: 1.2,
        fundamental: 1.0,
        valuation: 0.9
      },
      BEAR: {
        technical: 0.9,
        sentiment: 0.8,
        insider: 1.3,
        valuation: 1.2
      },
      SIDEWAYS: {
        technical: 1.2,
        valuation: 1.1,
        fundamental: 1.0
      },
      HIGH_VOL: {
        technical: 0.8,
        sentiment: 0.7,
        insider: 1.2,
        alternative: 1.3
      },
      CRISIS: {
        technical: 0.6,
        sentiment: 0.5,
        insider: 1.5,
        alternative: 1.4,
        valuation: 1.3
      }
    };

    // Cache for calculated weights
    this.weightCache = new Map();
    this.cacheDurationMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Calculate optimal weights based on recent IC
   * @param {string} regime - Market regime (null for all)
   * @param {number} lookbackDays - Days to look back for IC calculation
   * @returns {Object} Optimized weights
   */
  async calculateOptimalWeights(regime = null, lookbackDays = 90) {
    const cacheKey = `${regime || 'ALL'}_${lookbackDays}`;
    const cached = this.weightCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheDurationMs) {
      return cached.weights;
    }

    // Get IC for each signal type
    const { weights: icWeights, ics } = await this.tracker.getOptimalWeights(lookbackDays);

    // Check if we have enough data
    const icValues = Object.values(ics).filter(i => i.ic !== null);
    const hasEnoughData = icValues.length >= 3;

    if (!hasEnoughData) {
      // Fall back to base weights with regime adjustments
      const adjustedWeights = this.applyRegimeAdjustments(this.baseWeights, regime);
      return this.normalizeWeights(adjustedWeights);
    }

    // Blend IC-optimized weights with base weights
    const blendedWeights = this.blendWithBaseWeights(icWeights, this.baseBlendRatio);

    // NEW: Apply alpha validation gate (penalize signals without statistical significance)
    const validatedWeights = await this.applyAlphaValidationGate(blendedWeights, ics);

    // Apply regime-specific adjustments
    const regimeAdjusted = this.applyRegimeAdjustments(validatedWeights, regime);

    // Apply constraints and normalize
    const finalWeights = this.constrainAndNormalize(regimeAdjusted);

    // Cache the result
    this.weightCache.set(cacheKey, {
      weights: finalWeights,
      timestamp: Date.now(),
      ics
    });

    return finalWeights;
  }

  /**
   * Blend IC-optimized weights with base weights
   */
  blendWithBaseWeights(icWeights, blendRatio) {
    const blended = {};

    for (const signal of Object.keys(this.baseWeights)) {
      const baseWeight = this.baseWeights[signal];
      const icWeight = icWeights[signal] || baseWeight;

      // Blend: (1 - ratio) * base + ratio * IC
      blended[signal] = (1 - blendRatio) * baseWeight + blendRatio * icWeight;
    }

    return blended;
  }

  /**
   * Apply alpha validation gate to weights
   * Penalizes signals that haven't demonstrated statistical significance
   * This prevents overfitting to noise
   */
  async applyAlphaValidationGate(weights, ics) {
    if (!this.alphaValidationEnabled) {
      return weights;
    }

    const validated = {};

    // Get stored IC summary from daily backtesting analysis
    const icSummary = await this.getStoredICAnalysis();

    for (const signal of Object.keys(weights)) {
      const weight = weights[signal];
      const signalIC = ics[signal];

      // Get enhanced IC data from backtesting if available
      const backtestIC = icSummary[signal];

      // Apply validation penalty based on IC and significance
      let validationMultiplier = 1.0;

      if (signalIC && signalIC.sampleSize !== undefined) {
        const ic = Math.abs(signalIC.ic || 0);
        const sampleSize = signalIC.sampleSize || 0;

        // Check sample size threshold
        if (sampleSize < this.alphaValidation.minSampleSize) {
          validationMultiplier *= 0.7; // Penalize low sample size
        }

        // Check IC magnitude
        if (ic >= this.alphaValidation.minICForFullWeight) {
          // Good IC - no penalty
          validationMultiplier *= 1.0;
        } else if (ic >= this.alphaValidation.minICForReducedWeight) {
          // Marginal IC - slight penalty
          validationMultiplier *= 0.85;
        } else if (ic > 0) {
          // Weak IC - significant penalty
          validationMultiplier *= 0.7;
        } else {
          // Zero or negative IC - major penalty
          validationMultiplier *= this.alphaValidation.penaltyForNoSignificance;
        }
      }

      // Apply backtesting significance if available
      if (backtestIC) {
        if (backtestIC.is_significant) {
          // Boost signals with statistically significant IC
          validationMultiplier *= 1.1;
        } else if (backtestIC.optimal_ic < 0) {
          // Penalize signals with negative IC from backtesting
          validationMultiplier *= 0.6;
        }
      }

      // Apply multiplier (but keep within bounds)
      validated[signal] = weight * Math.max(0.5, Math.min(1.2, validationMultiplier));
    }

    return validated;
  }

  /**
   * Get stored IC analysis from daily backtesting job
   */
  async getStoredICAnalysis() {
    try {
      const result = await this.db.query(`
        SELECT signal_type, optimal_horizon, optimal_ic, decay_rate, is_significant
        FROM signal_ic_summary
        WHERE updated_at >= NOW() - INTERVAL '3 days'
      `);

      const summary = {};
      for (const row of result.rows) {
        summary[row.signal_type] = {
          optimal_horizon: row.optimal_horizon,
          optimal_ic: row.optimal_ic,
          decay_rate: row.decay_rate,
          is_significant: row.is_significant === true || row.is_significant === 1
        };
      }
      return summary;
    } catch (error) {
      // Table may not exist
      return {};
    }
  }

  /**
   * Apply regime-specific adjustments to weights
   */
  applyRegimeAdjustments(weights, regime) {
    if (!regime || !this.regimeAdjustments[regime]) {
      return { ...weights };
    }

    const adjustments = this.regimeAdjustments[regime];
    const adjusted = {};

    for (const signal of Object.keys(weights)) {
      const multiplier = adjustments[signal] || 1.0;
      adjusted[signal] = weights[signal] * multiplier;
    }

    return adjusted;
  }

  /**
   * Apply min/max constraints and normalize to sum to 1
   */
  constrainAndNormalize(weights) {
    // First pass: apply constraints
    const constrained = {};
    for (const signal of Object.keys(weights)) {
      constrained[signal] = Math.max(
        this.minWeight,
        Math.min(this.maxWeight, weights[signal])
      );
    }

    // Normalize to sum to 1.0
    return this.normalizeWeights(constrained);
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum === 0) return this.baseWeights;

    const normalized = {};
    for (const signal of Object.keys(weights)) {
      normalized[signal] = weights[signal] / sum;
    }
    return normalized;
  }

  /**
   * Get weights for current regime
   * @param {string} regime - Market regime
   * @returns {Object} Optimized weights for the regime
   */
  async getWeightsForRegime(regime) {
    // Try to get stored optimized weights first
    const stored = await this.getStoredWeights(regime);

    if (stored && !stored.isDefault) {
      // Check if weights are still valid
      const validUntil = new Date(stored.validUntil);
      if (validUntil > new Date()) {
        return stored.weights;
      }
    }

    // Calculate fresh weights
    return await this.calculateOptimalWeights(regime);
  }

  /**
   * Daily recalculation job
   */
  async recalculateAllWeights() {
    const regimes = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];
    const results = {};

    for (const regime of regimes) {
      try {
        // Clear cache for this regime
        this.weightCache.delete(`${regime}_90`);

        // Calculate new weights
        const weights = await this.calculateOptimalWeights(regime === 'ALL' ? null : regime, 90);

        // Store in database
        await this.storeOptimizedWeights(weights, regime);

        results[regime] = { success: true, weights };
      } catch (error) {
        console.error(`Failed to recalculate weights for ${regime}:`, error.message);
        results[regime] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Store optimized weights in database
   */
  async storeOptimizedWeights(weights, regime) {
    // Calculate average IC for metadata
    const { ics } = await this.tracker.getOptimalWeights(90);
    const icValues = Object.values(ics)
      .map(i => i.ic)
      .filter(ic => ic !== null && !isNaN(ic));
    const avgIC = icValues.length > 0
      ? icValues.reduce((a, b) => a + b, 0) / icValues.length
      : null;

    await this.db.query(`
      INSERT INTO optimized_signal_weights (
        regime,
        technical_weight,
        sentiment_weight,
        insider_weight,
        fundamental_weight,
        alternative_weight,
        valuation_weight,
        filing_13f_weight,
        earnings_weight,
        lookback_days,
        avg_ic,
        calculated_at,
        valid_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW() + INTERVAL '1 day')
      ON CONFLICT (regime) DO UPDATE SET
        technical_weight = EXCLUDED.technical_weight,
        sentiment_weight = EXCLUDED.sentiment_weight,
        insider_weight = EXCLUDED.insider_weight,
        fundamental_weight = EXCLUDED.fundamental_weight,
        alternative_weight = EXCLUDED.alternative_weight,
        valuation_weight = EXCLUDED.valuation_weight,
        filing_13f_weight = EXCLUDED.filing_13f_weight,
        earnings_weight = EXCLUDED.earnings_weight,
        lookback_days = EXCLUDED.lookback_days,
        avg_ic = EXCLUDED.avg_ic,
        calculated_at = EXCLUDED.calculated_at,
        valid_until = EXCLUDED.valid_until
    `, [
      regime,
      weights.technical || this.baseWeights.technical,
      weights.sentiment || this.baseWeights.sentiment,
      weights.insider || this.baseWeights.insider,
      weights.fundamental || this.baseWeights.fundamental,
      weights.alternative || this.baseWeights.alternative,
      weights.valuation || this.baseWeights.valuation,
      weights.filing_13f || this.baseWeights.filing_13f,
      weights.earnings || this.baseWeights.earnings,
      90,
      avgIC
    ]);
  }

  /**
   * Get stored weights from database
   */
  async getStoredWeights(regime) {
    const result = await this.db.query(`
      SELECT *
      FROM optimized_signal_weights
      WHERE regime = $1
    `, [regime]);

    if (result.rows.length === 0) {
      return {
        regime,
        weights: this.baseWeights,
        isDefault: true
      };
    }

    const row = result.rows[0];

    return {
      regime,
      weights: {
        technical: row.technical_weight,
        sentiment: row.sentiment_weight,
        insider: row.insider_weight,
        fundamental: row.fundamental_weight,
        alternative: row.alternative_weight,
        valuation: row.valuation_weight,
        filing_13f: row.filing_13f_weight,
        earnings: row.earnings_weight
      },
      avgIC: row.avg_ic,
      calculatedAt: row.calculated_at,
      validUntil: row.valid_until,
      lookbackDays: row.lookback_days,
      isDefault: false
    };
  }

  /**
   * Get all stored weights
   */
  async getAllStoredWeights() {
    const result = await this.db.query(`
      SELECT *
      FROM optimized_signal_weights
      ORDER BY regime
    `);

    return result.rows.map(row => ({
      regime: row.regime,
      weights: {
        technical: row.technical_weight,
        sentiment: row.sentiment_weight,
        insider: row.insider_weight,
        fundamental: row.fundamental_weight,
        alternative: row.alternative_weight,
        valuation: row.valuation_weight,
        filing_13f: row.filing_13f_weight,
        earnings: row.earnings_weight
      },
      avgIC: row.avg_ic,
      calculatedAt: row.calculated_at,
      validUntil: row.valid_until
    }));
  }

  /**
   * Get weight comparison (base vs optimized)
   */
  async getWeightComparison(regime = 'ALL') {
    const optimized = await this.getStoredWeights(regime);
    const comparison = {};

    for (const signal of Object.keys(this.baseWeights)) {
      comparison[signal] = {
        base: this.baseWeights[signal],
        optimized: optimized.weights[signal],
        difference: optimized.weights[signal] - this.baseWeights[signal],
        percentChange: ((optimized.weights[signal] - this.baseWeights[signal]) / this.baseWeights[signal] * 100).toFixed(1) + '%'
      };
    }

    return {
      regime,
      avgIC: optimized.avgIC,
      isDefault: optimized.isDefault,
      comparison
    };
  }

  /**
   * Clear weight cache
   */
  clearCache() {
    this.weightCache.clear();
  }

  /**
   * Use optimized weights from weight optimization run
   * Loads best weights from grid search optimization
   * @param {number} runId - Optimization run ID (optional, uses most recent if not specified)
   * @returns {Object} Result with loaded weights
   */
  async useOptimizedWeightsFromRun(runId = null) {
    try {
      let result;

      if (runId) {
        // Get specific run
        result = await this.db.query(`
          SELECT best_weights, best_alpha, walk_forward_efficiency
          FROM weight_optimization_runs
          WHERE id = $1 AND status = 'completed' AND best_weights IS NOT NULL
        `, [runId]);
      } else {
        // Get most recent successful run
        result = await this.db.query(`
          SELECT id, best_weights, best_alpha, walk_forward_efficiency
          FROM weight_optimization_runs
          WHERE status = 'completed' AND best_weights IS NOT NULL
          ORDER BY completed_at DESC
          LIMIT 1
        `);
      }

      if (result.rows.length === 0 || !result.rows[0].best_weights) {
        return {
          success: false,
          error: 'No optimization run found with valid weights',
          usingDefaults: true,
          weights: this.baseWeights
        };
      }

      const weightData = result.rows[0];
      const optimizedWeights = typeof weightData.best_weights === 'string'
        ? JSON.parse(weightData.best_weights)
        : weightData.best_weights;

      // Map the 6 backtester signals to the 8 signalOptimizer signals
      // The backtester uses: technical, fundamental, sentiment, insider, valuation, factor
      // SignalOptimizer uses: technical, sentiment, insider, fundamental, alternative, valuation, filing_13f, earnings
      const mappedWeights = {
        technical: optimizedWeights.technical || this.baseWeights.technical,
        sentiment: optimizedWeights.sentiment || this.baseWeights.sentiment,
        insider: optimizedWeights.insider || this.baseWeights.insider,
        fundamental: optimizedWeights.fundamental || this.baseWeights.fundamental,
        alternative: optimizedWeights.factor ? optimizedWeights.factor * 0.5 : this.baseWeights.alternative,
        valuation: optimizedWeights.valuation || this.baseWeights.valuation,
        filing_13f: optimizedWeights.factor ? optimizedWeights.factor * 0.3 : this.baseWeights.filing_13f,
        earnings: optimizedWeights.factor ? optimizedWeights.factor * 0.2 : this.baseWeights.earnings
      };

      // Normalize
      const normalized = this.normalizeWeights(mappedWeights);

      // Update base weights with optimized values
      this.baseWeights = normalized;

      // Clear cache to use new weights
      this.clearCache();

      return {
        success: true,
        runId: weightData.id || runId,
        alpha: weightData.best_alpha,
        walkForwardEfficiency: weightData.walk_forward_efficiency,
        weights: normalized,
        sourceWeights: optimizedWeights
      };
    } catch (error) {
      console.error('Error loading optimized weights:', error);
      return {
        success: false,
        error: error.message,
        usingDefaults: true,
        weights: this.baseWeights
      };
    }
  }

  /**
   * Load regime-specific weights from optimization
   * @param {string} regime - Market regime
   * @returns {Object} Weights for the specified regime
   */
  async loadRegimeOptimizedWeights(regime) {
    try {
      const result = await this.db.query(`
        SELECT technical_weight, fundamental_weight, sentiment_weight,
               insider_weight, valuation_weight, factor_weight,
               alpha, sharpe_ratio, walk_forward_efficiency
        FROM regime_optimal_weights
        WHERE regime = $1 AND is_active = true
        ORDER BY valid_from DESC
        LIMIT 1
      `, [regime]);

      if (result.rows.length === 0) {
        return null;
      }

      const regimeData = result.rows[0];

      // Map to signalOptimizer format
      const weights = {
        technical: regimeData.technical_weight,
        sentiment: regimeData.sentiment_weight,
        insider: regimeData.insider_weight,
        fundamental: regimeData.fundamental_weight,
        alternative: regimeData.factor_weight * 0.5,
        valuation: regimeData.valuation_weight,
        filing_13f: regimeData.factor_weight * 0.3,
        earnings: regimeData.factor_weight * 0.2
      };

      return this.normalizeWeights(weights);
    } catch (error) {
      console.error('Error loading regime weights:', error);
      return null;
    }
  }

  /**
   * Get signal contribution analysis
   * Shows how each signal contributes to overall performance
   */
  async getSignalContributionAnalysis(lookbackDays = 90) {
    const { weights, ics } = await this.tracker.getOptimalWeights(lookbackDays);

    const contributions = {};
    let totalContribution = 0;

    for (const signal of Object.keys(weights)) {
      const ic = ics[signal]?.ic || 0;
      const weight = weights[signal];
      const contribution = ic * weight;

      contributions[signal] = {
        weight: weight.toFixed(3),
        ic: ic.toFixed(3),
        contribution: contribution.toFixed(4),
        sampleSize: ics[signal]?.sampleSize || 0
      };

      totalContribution += contribution;
    }

    // Calculate percentage contribution
    for (const signal of Object.keys(contributions)) {
      const contrib = parseFloat(contributions[signal].contribution);
      contributions[signal].pctOfTotal = totalContribution !== 0
        ? ((contrib / totalContribution) * 100).toFixed(1) + '%'
        : 'N/A';
    }

    return {
      lookbackDays,
      totalExpectedIC: totalContribution.toFixed(4),
      contributions,
      topContributors: Object.entries(contributions)
        .sort((a, b) => parseFloat(b[1].contribution) - parseFloat(a[1].contribution))
        .slice(0, 3)
        .map(([signal]) => signal)
    };
  }
}

module.exports = { SignalOptimizer };
