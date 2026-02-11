// src/services/strategy/strategyManager.js
// Strategy Manager - CRUD operations for unified strategies

const { DEFAULT_SIGNAL_WEIGHTS } = require('./unifiedStrategyEngine');
const { isUsingPostgres, dialect } = require('../../lib/db');

/**
 * Default risk parameters
 */
const DEFAULT_RISK_PARAMS = {
  maxPositionSize: 0.10,
  maxSectorConcentration: 0.25,
  stopLoss: 0.10,
  takeProfit: null,
  trailingStop: null,
  maxCorrelation: 0.70,
  maxPositions: 20,
  minPositions: 5,
  maxDrawdown: 0.20,
  minCashReserve: 0.05
};

/**
 * Default universe configuration
 */
const DEFAULT_UNIVERSE_CONFIG = {
  minMarketCap: 1e9,
  maxMarketCap: null,
  sectors: [],
  excludedSectors: [],
  minAvgVolume: 500000,
  excludeADRs: true,
  excludePennyStocks: true,
  minPrice: 5,
  customSymbols: []
};

/**
 * Default holding period
 */
const DEFAULT_HOLDING_PERIOD = {
  min: 1,
  target: 30,
  max: null
};

/**
 * Default regime configuration
 */
const DEFAULT_REGIME_CONFIG = {
  enabled: true,
  useHMM: true,
  exposureHighRisk: 0.5,
  exposureElevated: 0.75,
  exposureNormal: 1.0,
  pauseInCrisis: true,
  vixThreshold: 25
};

/**
 * Default feature flags
 */
const DEFAULT_FEATURE_FLAGS = {
  useMLCombiner: false,
  useOptimizedWeights: true,
  useFactorExposure: true,
  useProbabilisticDCF: true,
  useSignalDecorrelation: true,
  applyEarningsFilter: true,
  earningsBlackoutDays: 7
};

/**
 * StrategyManager
 *
 * Handles all CRUD operations for unified strategies:
 * - Create, read, update, delete strategies
 * - Manage presets
 * - Handle multi-strategy relationships
 * - Validate configurations
 */
class StrategyManager {
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;
  }

  /**
   * Create a new strategy
   * @param {Object} config - Strategy configuration
   * @returns {Object} Created strategy with ID
   */
  async createStrategy(config) {
    // Validate required fields
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Strategy name is required');
    }

    // Merge with defaults
    const signalWeights = { ...DEFAULT_SIGNAL_WEIGHTS, ...config.signal_weights };
    const riskParams = { ...DEFAULT_RISK_PARAMS, ...config.risk_params };
    const universeConfig = { ...DEFAULT_UNIVERSE_CONFIG, ...config.universe_config };
    const holdingPeriod = { ...DEFAULT_HOLDING_PERIOD, ...config.holding_period };
    const regimeConfig = { ...DEFAULT_REGIME_CONFIG, ...config.regime_config };
    const featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...config.feature_flags };

    // Validate signal weights sum to ~1
    const weightSum = Object.values(signalWeights).reduce((sum, w) => sum + (w || 0), 0);
    if (Math.abs(weightSum - 1) > 0.1) {
      console.warn(`Signal weights sum to ${weightSum}, expected ~1.0`);
    }

    const returningClause = dialect.returningId ? ' RETURNING id' : '';
    const result = await this.db.query(
      `INSERT INTO unified_strategies (
        name, description, strategy_type, is_template,
        signal_weights, risk_params, universe_config, holding_period,
        regime_config, feature_flags, min_confidence, min_signal_score,
        rebalance_frequency, rebalance_threshold,
        parent_strategy_id, target_allocation, min_allocation, max_allocation, regime_trigger,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)${returningClause}`,
      [
        config.name,
        config.description || null,
        config.strategy_type || 'single',
        config.is_template ? 1 : 0,
        JSON.stringify(signalWeights),
        JSON.stringify(riskParams),
        JSON.stringify(universeConfig),
        JSON.stringify(holdingPeriod),
        JSON.stringify(regimeConfig),
        JSON.stringify(featureFlags),
        config.min_confidence || 0.6,
        config.min_signal_score || 0.3,
        config.rebalance_frequency || 'weekly',
        config.rebalance_threshold || 0.05,
        config.parent_strategy_id || null,
        config.target_allocation || null,
        config.min_allocation || null,
        config.max_allocation || null,
        config.regime_trigger ? JSON.stringify(config.regime_trigger) : null,
        config.created_by || null
      ]
    );

    const newId = dialect.returningId
      ? (result.rows?.[0]?.id ?? null)
      : (result.lastInsertRowid ?? null);
    return this.getStrategy(newId);
  }

  /**
   * Get strategy by ID
   * @param {number} id - Strategy ID
   * @returns {Object|null} Strategy or null
   */
  async getStrategy(id) {
    const result = await this.db.query(
      'SELECT * FROM unified_strategies WHERE id = $1',
      [id]
    );
    const row = result.rows?.[0];
    return row ? this._parseStrategy(row) : null;
  }

  /**
   * Get all active strategies
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of strategies
   */
  async getAllStrategies(filters = {}) {
    let result;

    if (filters.type) {
      result = await this.db.query(
        `SELECT * FROM unified_strategies
         WHERE strategy_type = $1 AND is_active = 1 AND parent_strategy_id IS NULL
         ORDER BY created_at DESC`,
        [filters.type]
      );
    } else if (filters.templates) {
      result = await this.db.query(
        `SELECT * FROM unified_strategies
         WHERE is_template = 1 AND is_active = 1
         ORDER BY name`
      );
    } else {
      result = await this.db.query(
        `SELECT * FROM unified_strategies
         WHERE is_active = 1 AND parent_strategy_id IS NULL
         ORDER BY created_at DESC`
      );
    }

    const rows = result.rows || [];
    return rows.map(row => this._parseStrategy(row));
  }

  /**
   * Get child strategies for a multi-strategy
   * @param {number} parentId - Parent strategy ID
   * @returns {Array} Array of child strategies
   */
  async getChildStrategies(parentId) {
    const result = await this.db.query(
      `SELECT * FROM unified_strategies
       WHERE parent_strategy_id = $1 AND is_active = 1
       ORDER BY target_allocation DESC`,
      [parentId]
    );
    const rows = result.rows || [];
    return rows.map(row => this._parseStrategy(row));
  }

  /**
   * Update a strategy
   * @param {number} id - Strategy ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated strategy
   */
  async updateStrategy(id, updates) {
    const strategy = await this.getStrategy(id);
    if (!strategy) {
      throw new Error(`Strategy ${id} not found`);
    }

    await this.db.query(
      `UPDATE unified_strategies SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        strategy_type = COALESCE($3, strategy_type),
        signal_weights = COALESCE($4, signal_weights),
        risk_params = COALESCE($5, risk_params),
        universe_config = COALESCE($6, universe_config),
        holding_period = COALESCE($7, holding_period),
        regime_config = COALESCE($8, regime_config),
        feature_flags = COALESCE($9, feature_flags),
        min_confidence = COALESCE($10, min_confidence),
        min_signal_score = COALESCE($11, min_signal_score),
        rebalance_frequency = COALESCE($12, rebalance_frequency),
        rebalance_threshold = COALESCE($13, rebalance_threshold),
        target_allocation = COALESCE($14, target_allocation),
        regime_trigger = COALESCE($15, regime_trigger),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16`,
      [
        updates.name || null,
        updates.description || null,
        updates.strategy_type || null,
        updates.signal_weights ? JSON.stringify(updates.signal_weights) : null,
        updates.risk_params ? JSON.stringify(updates.risk_params) : null,
        updates.universe_config ? JSON.stringify(updates.universe_config) : null,
        updates.holding_period ? JSON.stringify(updates.holding_period) : null,
        updates.regime_config ? JSON.stringify(updates.regime_config) : null,
        updates.feature_flags ? JSON.stringify(updates.feature_flags) : null,
        updates.min_confidence || null,
        updates.min_signal_score || null,
        updates.rebalance_frequency || null,
        updates.rebalance_threshold || null,
        updates.target_allocation || null,
        updates.regime_trigger ? JSON.stringify(updates.regime_trigger) : null,
        id
      ]
    );

    return this.getStrategy(id);
  }

  /**
   * Delete a strategy (soft delete)
   * @param {number} id - Strategy ID
   * @returns {boolean} Success
   */
  async deleteStrategy(id) {
    const result = await this.db.query(
      'UPDATE unified_strategies SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    const rowCount = result.rowCount ?? result.rows?.length ?? 0;
    return rowCount > 0;
  }

  /**
   * Permanently delete a strategy
   * @param {number} id - Strategy ID
   * @returns {boolean} Success
   */
  async hardDeleteStrategy(id) {
    const result = await this.db.query(
      'DELETE FROM unified_strategies WHERE id = $1',
      [id]
    );
    const rowCount = result.rowCount ?? result.changes ?? 0;
    return rowCount > 0;
  }

  /**
   * Create a multi-strategy with child strategies
   * @param {Object} parentConfig - Parent strategy config
   * @param {Array} childConfigs - Array of child strategy configs with allocations
   * @returns {Object} Created multi-strategy with children
   */
  async createMultiStrategy(parentConfig, childConfigs) {
    if (!childConfigs || childConfigs.length < 2) {
      throw new Error('Multi-strategy requires at least 2 child strategies');
    }

    // Validate allocations sum to 1
    const totalAllocation = childConfigs.reduce((sum, c) => sum + (c.target_allocation || 0), 0);
    if (Math.abs(totalAllocation - 1) > 0.01) {
      throw new Error(`Child allocations must sum to 100% (currently ${(totalAllocation * 100).toFixed(1)}%)`);
    }

    // Create parent
    const parent = await this.createStrategy({
      ...parentConfig,
      strategy_type: parentConfig.strategy_type || 'multi'
    });

    // Create children
    const children = await Promise.all(
      childConfigs.map(childConfig =>
        this.createStrategy({
          ...childConfig,
          parent_strategy_id: parent.id
        })
      )
    );

    return {
      ...parent,
      children
    };
  }

  /**
   * Create a strategy from a preset
   * @param {string} presetName - Name of the preset
   * @param {Object} overrides - Optional overrides
   * @returns {Object} Created strategy
   */
  async createFromPreset(presetName, overrides = {}) {
    const result = await this.db.query(
      'SELECT * FROM strategy_presets_v2 WHERE name = $1 AND is_active = 1',
      [presetName]
    );
    const preset = result.rows?.[0];
    if (!preset) {
      throw new Error(`Preset "${presetName}" not found`);
    }

    const config = {
      name: overrides.name || `My ${presetName} Strategy`,
      description: overrides.description || preset.description,
      signal_weights: JSON.parse(preset.signal_weights),
      risk_params: preset.risk_params ? JSON.parse(preset.risk_params) : DEFAULT_RISK_PARAMS,
      universe_config: preset.universe_config ? JSON.parse(preset.universe_config) : DEFAULT_UNIVERSE_CONFIG,
      holding_period: preset.holding_period ? JSON.parse(preset.holding_period) : DEFAULT_HOLDING_PERIOD,
      regime_config: preset.regime_config ? JSON.parse(preset.regime_config) : DEFAULT_REGIME_CONFIG,
      feature_flags: preset.feature_flags ? JSON.parse(preset.feature_flags) : DEFAULT_FEATURE_FLAGS,
      min_confidence: preset.min_confidence || 0.6,
      min_signal_score: preset.min_signal_score || 0.3,
      ...overrides
    };

    return this.createStrategy(config);
  }

  /**
   * Get all available presets
   * @returns {Array} Array of presets
   */
  async getPresets() {
    const result = await this.db.query(
      `SELECT * FROM strategy_presets_v2
       WHERE is_active = 1
       ORDER BY sort_order, name`
    );
    const rows = result.rows || [];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      riskProfile: row.risk_profile,
      holdingPeriodType: row.holding_period_type,
      signalWeights: JSON.parse(row.signal_weights),
      riskParams: row.risk_params ? JSON.parse(row.risk_params) : null,
      sortOrder: row.sort_order
    }));
  }

  /**
   * Update backtest results cache
   * @param {number} id - Strategy ID
   * @param {Object} results - Backtest results
   */
  async updateBacktestCache(id, results) {
    await this.db.query(
      `UPDATE unified_strategies SET
        backtest_sharpe = $1,
        backtest_alpha = $2,
        backtest_max_drawdown = $3,
        last_backtest_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4`,
      [
        results.sharpe || null,
        results.alpha || null,
        results.maxDrawdown || null,
        id
      ]
    );
  }

  /**
   * Duplicate a strategy
   * @param {number} id - Strategy ID to duplicate
   * @param {string} newName - Name for the duplicate
   * @returns {Object} Duplicated strategy
   */
  async duplicateStrategy(id, newName) {
    const original = await this.getStrategy(id);
    if (!original) {
      throw new Error(`Strategy ${id} not found`);
    }

    return this.createStrategy({
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      strategy_type: original.strategy_type,
      signal_weights: original.signal_weights,
      risk_params: original.risk_params,
      universe_config: original.universe_config,
      holding_period: original.holding_period,
      regime_config: original.regime_config,
      feature_flags: original.feature_flags,
      min_confidence: original.min_confidence,
      min_signal_score: original.min_signal_score,
      rebalance_frequency: original.rebalance_frequency,
      rebalance_threshold: original.rebalance_threshold
    });
  }

  /**
   * Validate a strategy configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result with errors and warnings
   */
  validateStrategy(config) {
    const errors = [];
    const warnings = [];

    // Name validation
    if (!config.name || config.name.trim().length === 0) {
      errors.push('Strategy name is required');
    } else if (config.name.length > 100) {
      errors.push('Strategy name must be less than 100 characters');
    }

    // Signal weights validation
    if (config.signal_weights) {
      const weightSum = Object.values(config.signal_weights).reduce((sum, w) => sum + (w || 0), 0);
      if (weightSum < 0.9) {
        warnings.push(`Signal weights sum to ${(weightSum * 100).toFixed(1)}%, consider adding more weight`);
      } else if (weightSum > 1.1) {
        warnings.push(`Signal weights sum to ${(weightSum * 100).toFixed(1)}%, exceeds 100%`);
      }

      // Check for extremely concentrated strategies
      const maxWeight = Math.max(...Object.values(config.signal_weights));
      if (maxWeight > 0.5) {
        warnings.push('Strategy is highly concentrated in one signal type');
      }
    }

    // Risk params validation
    if (config.risk_params) {
      if (config.risk_params.maxPositionSize > 0.25) {
        warnings.push('Max position size exceeds 25%, high concentration risk');
      }
      if (config.risk_params.stopLoss && config.risk_params.stopLoss > 0.20) {
        warnings.push('Stop loss is set high (>20%), consider tighter risk management');
      }
    }

    // Multi-strategy validation
    if (config.strategy_type === 'multi' || config.strategy_type === 'regime_switching') {
      if (!config.children || config.children.length < 2) {
        errors.push('Multi-strategy requires at least 2 child strategies');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ============================================
  // Model Version Binding Methods
  // ============================================

  /**
   * Update the ML model version for a strategy
   * @param {number} strategyId - Strategy ID
   * @param {string} modelVersion - Model version string (e.g., "lstm_20240115_123456")
   * @returns {Object} Updated strategy
   */
  async updateModelVersion(strategyId, modelVersion) {
    const strategy = await this.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Check if model is locked
    if (strategy.ml_model_locked) {
      throw new Error(`Strategy ${strategyId} has model version locked. Unlock first to update.`);
    }

    await this.db.query(
      `UPDATE unified_strategies SET
        ml_model_version = $1,
        ml_model_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
      [modelVersion, strategyId]
    );
    return this.getStrategy(strategyId);
  }

  /**
   * Lock/unlock the model version for a strategy
   * @param {number} strategyId - Strategy ID
   * @param {boolean} locked - Whether to lock (true) or unlock (false)
   * @returns {Object} Updated strategy
   */
  async setModelLock(strategyId, locked) {
    const strategy = await this.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    await this.db.query(
      `UPDATE unified_strategies SET
        ml_model_locked = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
      [locked ? 1 : 0, strategyId]
    );
    return this.getStrategy(strategyId);
  }

  /**
   * Get all strategies using a specific model version
   * @param {string} modelVersion - Model version string
   * @returns {Array} Array of strategies
   */
  async getStrategiesByModelVersion(modelVersion) {
    const result = await this.db.query(
      `SELECT * FROM unified_strategies
       WHERE ml_model_version = $1 AND is_active = 1
       ORDER BY name`,
      [modelVersion]
    );
    const rows = result.rows || [];
    return rows.map(row => this._parseStrategy(row));
  }

  /**
   * Get all strategies with ML combiner enabled
   * @returns {Array} Array of strategies using ML
   */
  async getMLEnabledStrategies() {
    const mlCondition = isUsingPostgres()
      ? "(feature_flags::jsonb->>'useMLCombiner') IN ('1', 'true')"
      : "json_extract(feature_flags, '$.useMLCombiner') = 1";
    const result = await this.db.query(
      `SELECT * FROM unified_strategies
       WHERE is_active = 1 AND ${mlCondition}
       ORDER BY name`
    );
    const rows = result.rows || [];
    return rows.map(row => this._parseStrategy(row));
  }

  /**
   * Get all unlocked strategies with ML combiner enabled
   * @returns {Array} Array of strategies
   */
  async getUnlockedMLStrategies() {
    const mlCondition = isUsingPostgres()
      ? "(feature_flags::jsonb->>'useMLCombiner') IN ('1', 'true')"
      : "json_extract(feature_flags, '$.useMLCombiner') = 1";
    const result = await this.db.query(
      `SELECT * FROM unified_strategies
       WHERE is_active = 1
         AND ${mlCondition}
         AND (ml_model_locked = 0 OR ml_model_locked IS NULL)
       ORDER BY name`
    );
    const rows = result.rows || [];
    return rows.map(row => this._parseStrategy(row));
  }

  /**
   * Update all unlocked ML strategies to use a new model version
   * @param {string} newModelVersion - New model version string
   * @returns {Object} Update results
   */
  async updateAllUnlockedToModelVersion(newModelVersion) {
    const strategies = await this.getUnlockedMLStrategies();
    const results = {
      updated: [],
      skipped: [],
      errors: []
    };

    for (const strategy of strategies) {
      try {
        await this.db.query(
          `UPDATE unified_strategies SET
            ml_model_version = $1,
            ml_model_updated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
          [newModelVersion, strategy.id]
        );
        results.updated.push({
          id: strategy.id,
          name: strategy.name,
          previousVersion: strategy.ml_model_version
        });
      } catch (err) {
        results.errors.push({
          id: strategy.id,
          name: strategy.name,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Get model binding summary for all strategies
   * @returns {Object} Summary of model bindings
   */
  async getModelBindingSummary() {
    const allStrategies = await this.getAllStrategies();
    const mlStrategies = await this.getMLEnabledStrategies();

    const versionCounts = {};
    for (const s of mlStrategies) {
      const version = s.ml_model_version || 'unset';
      versionCounts[version] = (versionCounts[version] || 0) + 1;
    }

    return {
      totalStrategies: allStrategies.length,
      mlEnabledCount: mlStrategies.length,
      lockedCount: mlStrategies.filter(s => s.ml_model_locked).length,
      unlockedCount: mlStrategies.filter(s => !s.ml_model_locked).length,
      versionDistribution: versionCounts,
      strategiesWithoutModel: mlStrategies.filter(s => !s.ml_model_version).map(s => ({
        id: s.id,
        name: s.name
      }))
    };
  }

  /**
   * Parse database row to strategy object
   */
  _parseStrategy(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      strategy_type: row.strategy_type,
      is_template: row.is_template === 1,
      signal_weights: JSON.parse(row.signal_weights || '{}'),
      risk_params: JSON.parse(row.risk_params || '{}'),
      universe_config: JSON.parse(row.universe_config || '{}'),
      holding_period: JSON.parse(row.holding_period || '{}'),
      regime_config: JSON.parse(row.regime_config || '{}'),
      feature_flags: JSON.parse(row.feature_flags || '{}'),
      min_confidence: row.min_confidence,
      min_signal_score: row.min_signal_score,
      rebalance_frequency: row.rebalance_frequency,
      rebalance_threshold: row.rebalance_threshold,
      parent_strategy_id: row.parent_strategy_id,
      target_allocation: row.target_allocation,
      min_allocation: row.min_allocation,
      max_allocation: row.max_allocation,
      regime_trigger: row.regime_trigger ? JSON.parse(row.regime_trigger) : null,
      backtest_sharpe: row.backtest_sharpe,
      backtest_alpha: row.backtest_alpha,
      backtest_max_drawdown: row.backtest_max_drawdown,
      last_backtest_at: row.last_backtest_at,
      ml_model_version: row.ml_model_version,
      ml_model_locked: row.ml_model_locked === 1,
      ml_model_updated_at: row.ml_model_updated_at,
      is_active: row.is_active === 1,
      version: row.version,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

module.exports = {
  StrategyManager,
  DEFAULT_SIGNAL_WEIGHTS,
  DEFAULT_RISK_PARAMS,
  DEFAULT_UNIVERSE_CONFIG,
  DEFAULT_HOLDING_PERIOD,
  DEFAULT_REGIME_CONFIG,
  DEFAULT_FEATURE_FLAGS
};
