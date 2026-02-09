// src/services/mlops/modelRegistry.js
// Model Registry - Version tracking and model lifecycle management

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * ModelRegistry
 *
 * Tracks all model versions including:
 * - Signal weight optimizations
 * - ML models (future: transformers, LSTM)
 * - HMM regime detection models
 *
 * Provides:
 * - Version history with full audit trail
 * - Metric comparison across versions
 * - Rollback capabilities
 * - A/B testing support
 */
class ModelRegistry {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    // Tables should be created via migrations, not in service code
  }

  /**
   * Register a new model version (staged for validation)
   * @param {string} modelName - Name of the model (e.g., 'signal_weights')
   * @param {string} version - Version string (e.g., 'v1.0.0' or timestamp)
   * @param {Object} options - Model details
   * @returns {Object} Registered model
   */
  async registerModel(modelName, version, options = {}) {
    const database = await getDatabaseAsync();
    const {
      modelType = 'signal_weights',
      artifacts = {},
      config = {},
      metrics = {},
      validationPeriod = {},
      optimizationRunId = null
    } = options;

    await database.query(`
      INSERT INTO model_registry (
        model_name, version, model_type, status,
        artifacts_json, config_json,
        train_sharpe, test_sharpe, walk_forward_efficiency, deflated_sharpe_p,
        alpha, max_drawdown,
        validation_period_start, validation_period_end,
        optimization_run_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      modelName,
      version,
      modelType,
      'staged',
      JSON.stringify(artifacts),
      JSON.stringify(config),
      metrics.trainSharpe || null,
      metrics.testSharpe || null,
      metrics.walkForwardEfficiency || null,
      metrics.deflatedSharpeP || null,
      metrics.alpha || null,
      metrics.maxDrawdown || null,
      validationPeriod.start || null,
      validationPeriod.end || null,
      optimizationRunId
    ]);

    return await this.getModel(modelName, version);
  }

  /**
   * Get a specific model version
   * @param {string} modelName - Model name
   * @param {string} version - Version string
   * @returns {Object|null} Model or null
   */
  async getModel(modelName, version) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM model_registry
      WHERE model_name = $1 AND version = $2
    `, [modelName, version]);
    const row = result.rows[0];
    return row ? this._parseModel(row) : null;
  }

  /**
   * Get the latest production model
   * @param {string} modelName - Model name
   * @returns {Object|null} Model or null
   */
  async getLatestProduction(modelName) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM model_registry
      WHERE model_name = $1 AND status = 'production'
      ORDER BY promoted_at DESC
      LIMIT 1
    `, [modelName]);
    const row = result.rows[0];
    return row ? this._parseModel(row) : null;
  }

  /**
   * Get all versions for a model
   * @param {string} modelName - Model name
   * @returns {Array} Array of model versions
   */
  async getVersionHistory(modelName) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM model_registry
      WHERE model_name = $1
      ORDER BY staged_at DESC
    `, [modelName]);
    return result.rows.map(row => this._parseModel(row));
  }

  /**
   * Get all staged models awaiting promotion
   * @returns {Array} Array of staged models
   */
  async getStagedModels() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM model_registry
      WHERE status = 'staged'
      ORDER BY staged_at DESC
    `);
    return result.rows.map(row => this._parseModel(row));
  }

  /**
   * Promote a staged model to production
   * @param {string} modelName - Model name
   * @param {string} version - Version to promote
   * @param {Object} options - Promotion details
   * @returns {Object} Promoted model
   */
  async promoteToProduction(modelName, version, options = {}) {
    const database = await getDatabaseAsync();
    const {
      promotedBy = 'system',
      reason = 'Passed validation gates'
    } = options;

    // First, deprecate any existing production version
    await database.query(`
      UPDATE model_registry SET
        status = 'deprecated',
        deprecated_at = CURRENT_TIMESTAMP,
        deprecation_reason = $1
      WHERE model_name = $2 AND status = 'production'
    `, [`Replaced by ${version}`, modelName]);

    // Then promote the new version
    await database.query(`
      UPDATE model_registry SET
        status = 'production',
        promoted_at = CURRENT_TIMESTAMP,
        promoted_by = $1,
        promotion_reason = $2
      WHERE model_name = $3 AND version = $4
    `, [promotedBy, reason, modelName, version]);

    return await this.getModel(modelName, version);
  }

  /**
   * Deprecate a model version
   * @param {string} modelName - Model name
   * @param {string} version - Version to deprecate
   * @param {string} reason - Reason for deprecation
   * @returns {Object} Deprecated model
   */
  async deprecateModel(modelName, version, reason = 'Manual deprecation') {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE model_registry SET
        status = 'deprecated',
        deprecated_at = CURRENT_TIMESTAMP,
        deprecation_reason = $1
      WHERE model_name = $2 AND version = $3
    `, [reason, modelName, version]);
    return await this.getModel(modelName, version);
  }

  /**
   * Rollback to a previous version
   * @param {string} modelName - Model name
   * @param {string} targetVersion - Version to rollback to
   * @param {string} reason - Reason for rollback
   * @returns {Object} Rolled back model
   */
  async rollback(modelName, targetVersion, reason = 'Performance degradation') {
    const targetModel = await this.getModel(modelName, targetVersion);
    if (!targetModel) {
      throw new Error(`Version ${targetVersion} not found for ${modelName}`);
    }

    const currentProduction = await this.getLatestProduction(modelName);

    // Deprecate current production
    if (currentProduction) {
      await this.deprecateModel(
        modelName,
        currentProduction.version,
        `Rolled back to ${targetVersion}: ${reason}`
      );
    }

    // Create a new version based on the target (with rollback marker)
    const newVersion = `${targetVersion}-rollback-${Date.now()}`;

    await this.registerModel(modelName, newVersion, {
      modelType: targetModel.modelType,
      artifacts: targetModel.artifacts,
      config: targetModel.config,
      metrics: {
        trainSharpe: targetModel.trainSharpe,
        testSharpe: targetModel.testSharpe,
        walkForwardEfficiency: targetModel.walkForwardEfficiency,
        deflatedSharpeP: targetModel.deflatedSharpeP,
        alpha: targetModel.alpha,
        maxDrawdown: targetModel.maxDrawdown
      },
      validationPeriod: {
        start: targetModel.validationPeriodStart,
        end: targetModel.validationPeriodEnd
      }
    });

    // Immediately promote rollback version
    return await this.promoteToProduction(modelName, newVersion, {
      promotedBy: 'system',
      reason: `Rollback from ${currentProduction?.version || 'none'}: ${reason}`
    });
  }

  /**
   * Log daily performance for monitoring
   * @param {string} modelName - Model name
   * @param {string} version - Version
   * @param {Date|string} date - Log date
   * @param {Object} metrics - Daily metrics
   */
  async logPerformance(modelName, version, date, metrics) {
    const database = await getDatabaseAsync();
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    const onConflict = isUsingPostgres()
      ? 'ON CONFLICT (model_name, version, log_date) DO UPDATE SET daily_return = EXCLUDED.daily_return'
      : 'OR REPLACE';

    await database.query(`
      INSERT ${onConflict} INTO model_performance_log (
        model_name, version, log_date,
        daily_return, cumulative_return, realized_sharpe,
        benchmark_return, alpha_vs_benchmark,
        prediction_drift, feature_drift
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      modelName,
      version,
      dateStr,
      metrics.dailyReturn || null,
      metrics.cumulativeReturn || null,
      metrics.realizedSharpe || null,
      metrics.benchmarkReturn || null,
      metrics.alphaVsBenchmark || null,
      metrics.predictionDrift || null,
      metrics.featureDrift || null
    ]);
  }

  /**
   * Get performance history
   * @param {string} modelName - Model name
   * @param {string} version - Version
   * @param {number} limit - Number of days to retrieve
   * @returns {Array} Performance history
   */
  async getPerformanceHistory(modelName, version, limit = 30) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM model_performance_log
      WHERE model_name = $1 AND version = $2
      ORDER BY log_date DESC
      LIMIT $3
    `, [modelName, version, limit]);
    return result.rows;
  }

  /**
   * Compare two model versions
   * @param {string} modelAName - Model A name
   * @param {string} modelAVersion - Model A version
   * @param {string} modelBName - Model B name
   * @param {string} modelBVersion - Model B version
   * @returns {Object} Comparison results
   */
  async compareModels(modelAName, modelAVersion, modelBName, modelBVersion) {
    const database = await getDatabaseAsync();
    const modelA = await this.getModel(modelAName, modelAVersion);
    const modelB = await this.getModel(modelBName, modelBVersion);

    if (!modelA || !modelB) {
      throw new Error('One or both models not found');
    }

    // Simple comparison based on stored metrics
    const comparison = {
      modelA: {
        name: modelAName,
        version: modelAVersion,
        sharpe: modelA.testSharpe,
        alpha: modelA.alpha,
        wfe: modelA.walkForwardEfficiency,
        maxDrawdown: modelA.maxDrawdown
      },
      modelB: {
        name: modelBName,
        version: modelBVersion,
        sharpe: modelB.testSharpe,
        alpha: modelB.alpha,
        wfe: modelB.walkForwardEfficiency,
        maxDrawdown: modelB.maxDrawdown
      },
      winner: null,
      confidence: 0
    };

    // Score each model
    let scoreA = 0;
    let scoreB = 0;

    if (modelA.testSharpe > modelB.testSharpe) scoreA++; else scoreB++;
    if (modelA.alpha > modelB.alpha) scoreA++; else scoreB++;
    if (modelA.walkForwardEfficiency > modelB.walkForwardEfficiency) scoreA++; else scoreB++;
    if (modelA.maxDrawdown < modelB.maxDrawdown) scoreA++; else scoreB++; // Lower is better

    comparison.winner = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : 'tie');
    comparison.confidence = Math.abs(scoreA - scoreB) / 4;

    // Log comparison
    await database.query(`
      INSERT INTO model_comparison (
        comparison_name, model_a_name, model_a_version, model_b_name, model_b_version,
        period_start, period_end,
        model_a_sharpe, model_b_sharpe, model_a_alpha, model_b_alpha,
        winner, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      `${modelAName}:${modelAVersion} vs ${modelBName}:${modelBVersion}`,
      modelAName, modelAVersion,
      modelBName, modelBVersion,
      modelA.validationPeriodStart, modelA.validationPeriodEnd,
      modelA.testSharpe, modelB.testSharpe,
      modelA.alpha, modelB.alpha,
      comparison.winner, comparison.confidence
    ]);

    return comparison;
  }

  /**
   * Check if a model passes validation gates
   * @param {string} modelName - Model name
   * @param {string} version - Version
   * @param {Object} gates - Validation thresholds
   * @returns {Object} Validation result
   */
  async validateModel(modelName, version, gates = {}) {
    const {
      minWFE = 0.50,           // Minimum walk-forward efficiency
      maxDeflatedSharpeP = 0.05, // Maximum p-value for deflated Sharpe
      minTestSharpe = 0.5,    // Minimum test Sharpe
      maxDrawdown = 0.40,     // Maximum drawdown
      minAlpha = 0            // Minimum alpha
    } = gates;

    const model = await this.getModel(modelName, version);
    if (!model) {
      return { valid: false, errors: ['Model not found'], warnings: [] };
    }

    const errors = [];
    const warnings = [];

    // Walk-forward efficiency check
    if (model.walkForwardEfficiency !== null) {
      if (model.walkForwardEfficiency < minWFE) {
        errors.push(`WFE ${(model.walkForwardEfficiency * 100).toFixed(1)}% < ${minWFE * 100}% threshold`);
      } else if (model.walkForwardEfficiency > 1.5) {
        warnings.push(`WFE ${(model.walkForwardEfficiency * 100).toFixed(1)}% unusually high - verify data`);
      }
    }

    // Deflated Sharpe p-value check
    if (model.deflatedSharpeP !== null && model.deflatedSharpeP > maxDeflatedSharpeP) {
      errors.push(`Deflated Sharpe p-value ${model.deflatedSharpeP.toFixed(3)} > ${maxDeflatedSharpeP} threshold`);
    }

    // Test Sharpe check
    if (model.testSharpe !== null && model.testSharpe < minTestSharpe) {
      warnings.push(`Test Sharpe ${model.testSharpe.toFixed(2)} < ${minTestSharpe} threshold`);
    }

    // Drawdown check
    if (model.maxDrawdown !== null && model.maxDrawdown > maxDrawdown) {
      errors.push(`Max drawdown ${(model.maxDrawdown * 100).toFixed(1)}% > ${maxDrawdown * 100}% threshold`);
    }

    // Alpha check
    if (model.alpha !== null && model.alpha < minAlpha) {
      warnings.push(`Alpha ${model.alpha.toFixed(2)}% < ${minAlpha}% target`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        wfe: model.walkForwardEfficiency,
        deflatedSharpeP: model.deflatedSharpeP,
        testSharpe: model.testSharpe,
        maxDrawdown: model.maxDrawdown,
        alpha: model.alpha
      }
    };
  }

  /**
   * Get summary statistics for all models
   * @returns {Object} Summary stats
   */
  async getSummary() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        model_name,
        COUNT(*) as total_versions,
        SUM(CASE WHEN status = 'production' THEN 1 ELSE 0 END) as production_count,
        SUM(CASE WHEN status = 'staged' THEN 1 ELSE 0 END) as staged_count,
        SUM(CASE WHEN status = 'deprecated' THEN 1 ELSE 0 END) as deprecated_count,
        MAX(staged_at) as latest_staged,
        MAX(promoted_at) as latest_promoted
      FROM model_registry
      GROUP BY model_name
    `);
    return result.rows;
  }

  /**
   * Parse database row to model object
   */
  _parseModel(row) {
    return {
      id: row.id,
      modelName: row.model_name,
      version: row.version,
      modelType: row.model_type,
      status: row.status,
      artifacts: JSON.parse(row.artifacts_json || '{}'),
      config: JSON.parse(row.config_json || '{}'),
      trainSharpe: row.train_sharpe,
      testSharpe: row.test_sharpe,
      walkForwardEfficiency: row.walk_forward_efficiency,
      deflatedSharpeP: row.deflated_sharpe_p,
      alpha: row.alpha,
      maxDrawdown: row.max_drawdown,
      validationPeriodStart: row.validation_period_start,
      validationPeriodEnd: row.validation_period_end,
      optimizationRunId: row.optimization_run_id,
      stagedAt: row.staged_at,
      promotedAt: row.promoted_at,
      deprecatedAt: row.deprecated_at,
      rollbackFromVersion: row.rollback_from_version,
      promotedBy: row.promoted_by,
      promotionReason: row.promotion_reason,
      deprecationReason: row.deprecation_reason
    };
  }
}

module.exports = { ModelRegistry };
