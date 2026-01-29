// src/services/mlops/modelRegistry.js
// Model Registry - Version tracking and model lifecycle management

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
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this._ensureTables();
    this._prepareStatements();
  }

  _ensureTables() {
    // Model registry table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        version TEXT NOT NULL,
        model_type TEXT NOT NULL DEFAULT 'signal_weights',
        status TEXT NOT NULL DEFAULT 'staged',

        -- Artifacts
        artifacts_json TEXT,
        config_json TEXT,

        -- Metrics from validation
        train_sharpe REAL,
        test_sharpe REAL,
        walk_forward_efficiency REAL,
        deflated_sharpe_p REAL,
        alpha REAL,
        max_drawdown REAL,

        -- Validation details
        validation_period_start DATE,
        validation_period_end DATE,
        optimization_run_id INTEGER,

        -- Lifecycle
        staged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        promoted_at DATETIME,
        deprecated_at DATETIME,
        rollback_from_version TEXT,

        -- Audit
        promoted_by TEXT,
        promotion_reason TEXT,
        deprecation_reason TEXT,

        UNIQUE(model_name, version)
      )
    `);

    // Model performance tracking (live monitoring)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        version TEXT NOT NULL,
        log_date DATE NOT NULL,

        -- Daily metrics
        daily_return REAL,
        cumulative_return REAL,
        realized_sharpe REAL,
        benchmark_return REAL,
        alpha_vs_benchmark REAL,

        -- Drift detection
        prediction_drift REAL,
        feature_drift REAL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(model_name, version, log_date)
      )
    `);

    // Model comparison snapshots
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_comparison (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comparison_name TEXT NOT NULL,
        model_a_name TEXT NOT NULL,
        model_a_version TEXT NOT NULL,
        model_b_name TEXT NOT NULL,
        model_b_version TEXT NOT NULL,

        -- Comparison results
        period_start DATE,
        period_end DATE,
        model_a_sharpe REAL,
        model_b_sharpe REAL,
        model_a_alpha REAL,
        model_b_alpha REAL,
        winner TEXT,
        confidence REAL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_model_registry_name_status
      ON model_registry(model_name, status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_model_perf_log_name_date
      ON model_performance_log(model_name, version, log_date)
    `);
  }

  _prepareStatements() {
    // Register new model version
    this.stmtRegister = this.db.prepare(`
      INSERT INTO model_registry (
        model_name, version, model_type, status,
        artifacts_json, config_json,
        train_sharpe, test_sharpe, walk_forward_efficiency, deflated_sharpe_p,
        alpha, max_drawdown,
        validation_period_start, validation_period_end,
        optimization_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Get model by name and version
    this.stmtGetVersion = this.db.prepare(`
      SELECT * FROM model_registry
      WHERE model_name = ? AND version = ?
    `);

    // Get latest production model
    this.stmtGetLatestProduction = this.db.prepare(`
      SELECT * FROM model_registry
      WHERE model_name = ? AND status = 'production'
      ORDER BY promoted_at DESC
      LIMIT 1
    `);

    // Get all versions for a model
    this.stmtGetVersions = this.db.prepare(`
      SELECT * FROM model_registry
      WHERE model_name = ?
      ORDER BY staged_at DESC
    `);

    // Get staged models awaiting promotion
    this.stmtGetStaged = this.db.prepare(`
      SELECT * FROM model_registry
      WHERE status = 'staged'
      ORDER BY staged_at DESC
    `);

    // Promote model to production
    this.stmtPromote = this.db.prepare(`
      UPDATE model_registry SET
        status = 'production',
        promoted_at = CURRENT_TIMESTAMP,
        promoted_by = ?,
        promotion_reason = ?
      WHERE model_name = ? AND version = ?
    `);

    // Deprecate model
    this.stmtDeprecate = this.db.prepare(`
      UPDATE model_registry SET
        status = 'deprecated',
        deprecated_at = CURRENT_TIMESTAMP,
        deprecation_reason = ?
      WHERE model_name = ? AND version = ?
    `);

    // Deprecate all production versions (before promoting new one)
    this.stmtDeprecateProduction = this.db.prepare(`
      UPDATE model_registry SET
        status = 'deprecated',
        deprecated_at = CURRENT_TIMESTAMP,
        deprecation_reason = ?
      WHERE model_name = ? AND status = 'production'
    `);

    // Log performance
    this.stmtLogPerformance = this.db.prepare(`
      INSERT OR REPLACE INTO model_performance_log (
        model_name, version, log_date,
        daily_return, cumulative_return, realized_sharpe,
        benchmark_return, alpha_vs_benchmark,
        prediction_drift, feature_drift
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Get performance history
    this.stmtGetPerformanceHistory = this.db.prepare(`
      SELECT * FROM model_performance_log
      WHERE model_name = ? AND version = ?
      ORDER BY log_date DESC
      LIMIT ?
    `);

    // Log comparison
    this.stmtLogComparison = this.db.prepare(`
      INSERT INTO model_comparison (
        comparison_name, model_a_name, model_a_version, model_b_name, model_b_version,
        period_start, period_end,
        model_a_sharpe, model_b_sharpe, model_a_alpha, model_b_alpha,
        winner, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Register a new model version (staged for validation)
   * @param {string} modelName - Name of the model (e.g., 'signal_weights')
   * @param {string} version - Version string (e.g., 'v1.0.0' or timestamp)
   * @param {Object} options - Model details
   * @returns {Object} Registered model
   */
  registerModel(modelName, version, options = {}) {
    const {
      modelType = 'signal_weights',
      artifacts = {},
      config = {},
      metrics = {},
      validationPeriod = {},
      optimizationRunId = null
    } = options;

    this.stmtRegister.run(
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
    );

    return this.getModel(modelName, version);
  }

  /**
   * Get a specific model version
   * @param {string} modelName - Model name
   * @param {string} version - Version string
   * @returns {Object|null} Model or null
   */
  getModel(modelName, version) {
    const row = this.stmtGetVersion.get(modelName, version);
    return row ? this._parseModel(row) : null;
  }

  /**
   * Get the latest production model
   * @param {string} modelName - Model name
   * @returns {Object|null} Model or null
   */
  getLatestProduction(modelName) {
    const row = this.stmtGetLatestProduction.get(modelName);
    return row ? this._parseModel(row) : null;
  }

  /**
   * Get all versions for a model
   * @param {string} modelName - Model name
   * @returns {Array} Array of model versions
   */
  getVersionHistory(modelName) {
    const rows = this.stmtGetVersions.all(modelName);
    return rows.map(row => this._parseModel(row));
  }

  /**
   * Get all staged models awaiting promotion
   * @returns {Array} Array of staged models
   */
  getStagedModels() {
    const rows = this.stmtGetStaged.all();
    return rows.map(row => this._parseModel(row));
  }

  /**
   * Promote a staged model to production
   * @param {string} modelName - Model name
   * @param {string} version - Version to promote
   * @param {Object} options - Promotion details
   * @returns {Object} Promoted model
   */
  promoteToProduction(modelName, version, options = {}) {
    const {
      promotedBy = 'system',
      reason = 'Passed validation gates'
    } = options;

    // First, deprecate any existing production version
    this.stmtDeprecateProduction.run(
      `Replaced by ${version}`,
      modelName
    );

    // Then promote the new version
    this.stmtPromote.run(promotedBy, reason, modelName, version);

    return this.getModel(modelName, version);
  }

  /**
   * Deprecate a model version
   * @param {string} modelName - Model name
   * @param {string} version - Version to deprecate
   * @param {string} reason - Reason for deprecation
   * @returns {Object} Deprecated model
   */
  deprecateModel(modelName, version, reason = 'Manual deprecation') {
    this.stmtDeprecate.run(reason, modelName, version);
    return this.getModel(modelName, version);
  }

  /**
   * Rollback to a previous version
   * @param {string} modelName - Model name
   * @param {string} targetVersion - Version to rollback to
   * @param {string} reason - Reason for rollback
   * @returns {Object} Rolled back model
   */
  rollback(modelName, targetVersion, reason = 'Performance degradation') {
    const targetModel = this.getModel(modelName, targetVersion);
    if (!targetModel) {
      throw new Error(`Version ${targetVersion} not found for ${modelName}`);
    }

    const currentProduction = this.getLatestProduction(modelName);

    // Deprecate current production
    if (currentProduction) {
      this.deprecateModel(
        modelName,
        currentProduction.version,
        `Rolled back to ${targetVersion}: ${reason}`
      );
    }

    // Create a new version based on the target (with rollback marker)
    const newVersion = `${targetVersion}-rollback-${Date.now()}`;

    this.registerModel(modelName, newVersion, {
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
    return this.promoteToProduction(modelName, newVersion, {
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
  logPerformance(modelName, version, date, metrics) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    this.stmtLogPerformance.run(
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
    );
  }

  /**
   * Get performance history
   * @param {string} modelName - Model name
   * @param {string} version - Version
   * @param {number} limit - Number of days to retrieve
   * @returns {Array} Performance history
   */
  getPerformanceHistory(modelName, version, limit = 30) {
    return this.stmtGetPerformanceHistory.all(modelName, version, limit);
  }

  /**
   * Compare two model versions
   * @param {string} modelAName - Model A name
   * @param {string} modelAVersion - Model A version
   * @param {string} modelBName - Model B name
   * @param {string} modelBVersion - Model B version
   * @returns {Object} Comparison results
   */
  compareModels(modelAName, modelAVersion, modelBName, modelBVersion) {
    const modelA = this.getModel(modelAName, modelAVersion);
    const modelB = this.getModel(modelBName, modelBVersion);

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
    this.stmtLogComparison.run(
      `${modelAName}:${modelAVersion} vs ${modelBName}:${modelBVersion}`,
      modelAName, modelAVersion,
      modelBName, modelBVersion,
      modelA.validationPeriodStart, modelA.validationPeriodEnd,
      modelA.testSharpe, modelB.testSharpe,
      modelA.alpha, modelB.alpha,
      comparison.winner, comparison.confidence
    );

    return comparison;
  }

  /**
   * Check if a model passes validation gates
   * @param {string} modelName - Model name
   * @param {string} version - Version
   * @param {Object} gates - Validation thresholds
   * @returns {Object} Validation result
   */
  validateModel(modelName, version, gates = {}) {
    const {
      minWFE = 0.50,           // Minimum walk-forward efficiency
      maxDeflatedSharpeP = 0.05, // Maximum p-value for deflated Sharpe
      minTestSharpe = 0.5,    // Minimum test Sharpe
      maxDrawdown = 0.40,     // Maximum drawdown
      minAlpha = 0            // Minimum alpha
    } = gates;

    const model = this.getModel(modelName, version);
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
  getSummary() {
    const stats = this.db.prepare(`
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
    `).all();

    return stats;
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
