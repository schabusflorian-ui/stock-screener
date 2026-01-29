// src/services/strategy/strategyManager.js
// Strategy Manager - CRUD operations for unified strategies

const { DEFAULT_SIGNAL_WEIGHTS } = require('./unifiedStrategyEngine');

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
    this._prepareStatements();
  }

  _prepareStatements() {
    // Create strategy
    this.stmtCreate = this.db.prepare(`
      INSERT INTO unified_strategies (
        name, description, strategy_type, is_template,
        signal_weights, risk_params, universe_config, holding_period,
        regime_config, feature_flags, min_confidence, min_signal_score,
        rebalance_frequency, rebalance_threshold,
        parent_strategy_id, target_allocation, min_allocation, max_allocation, regime_trigger,
        created_by
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )
    `);

    // Get strategy by ID
    this.stmtGetById = this.db.prepare(`
      SELECT * FROM unified_strategies WHERE id = ?
    `);

    // Get all active strategies
    this.stmtGetAll = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE is_active = 1 AND parent_strategy_id IS NULL
      ORDER BY created_at DESC
    `);

    // Get strategies by type
    this.stmtGetByType = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE strategy_type = ? AND is_active = 1 AND parent_strategy_id IS NULL
      ORDER BY created_at DESC
    `);

    // Get templates only
    this.stmtGetTemplates = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE is_template = 1 AND is_active = 1
      ORDER BY name
    `);

    // Get child strategies
    this.stmtGetChildren = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE parent_strategy_id = ? AND is_active = 1
      ORDER BY target_allocation DESC
    `);

    // Update strategy
    this.stmtUpdate = this.db.prepare(`
      UPDATE unified_strategies SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        strategy_type = COALESCE(?, strategy_type),
        signal_weights = COALESCE(?, signal_weights),
        risk_params = COALESCE(?, risk_params),
        universe_config = COALESCE(?, universe_config),
        holding_period = COALESCE(?, holding_period),
        regime_config = COALESCE(?, regime_config),
        feature_flags = COALESCE(?, feature_flags),
        min_confidence = COALESCE(?, min_confidence),
        min_signal_score = COALESCE(?, min_signal_score),
        rebalance_frequency = COALESCE(?, rebalance_frequency),
        rebalance_threshold = COALESCE(?, rebalance_threshold),
        target_allocation = COALESCE(?, target_allocation),
        regime_trigger = COALESCE(?, regime_trigger),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Soft delete
    this.stmtDelete = this.db.prepare(`
      UPDATE unified_strategies SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    // Hard delete
    this.stmtHardDelete = this.db.prepare(`
      DELETE FROM unified_strategies WHERE id = ?
    `);

    // Update backtest cache
    this.stmtUpdateBacktestCache = this.db.prepare(`
      UPDATE unified_strategies SET
        backtest_sharpe = ?,
        backtest_alpha = ?,
        backtest_max_drawdown = ?,
        last_backtest_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Get presets
    this.stmtGetPresets = this.db.prepare(`
      SELECT * FROM strategy_presets_v2
      WHERE is_active = 1
      ORDER BY sort_order, name
    `);

    // Get preset by name
    this.stmtGetPresetByName = this.db.prepare(`
      SELECT * FROM strategy_presets_v2
      WHERE name = ? AND is_active = 1
    `);

    // Model version binding statements
    this.stmtUpdateModelVersion = this.db.prepare(`
      UPDATE unified_strategies SET
        ml_model_version = ?,
        ml_model_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtSetModelLock = this.db.prepare(`
      UPDATE unified_strategies SET
        ml_model_locked = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtGetByModelVersion = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE ml_model_version = ? AND is_active = 1
      ORDER BY name
    `);

    this.stmtGetMLStrategies = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE is_active = 1
        AND json_extract(feature_flags, '$.useMLCombiner') = 1
      ORDER BY name
    `);

    this.stmtGetUnlockedMLStrategies = this.db.prepare(`
      SELECT * FROM unified_strategies
      WHERE is_active = 1
        AND json_extract(feature_flags, '$.useMLCombiner') = 1
        AND (ml_model_locked = 0 OR ml_model_locked IS NULL)
      ORDER BY name
    `);
  }

  /**
   * Create a new strategy
   * @param {Object} config - Strategy configuration
   * @returns {Object} Created strategy with ID
   */
  createStrategy(config) {
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

    // Insert
    const result = this.stmtCreate.run(
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
    );

    return this.getStrategy(result.lastInsertRowid);
  }

  /**
   * Get strategy by ID
   * @param {number} id - Strategy ID
   * @returns {Object|null} Strategy or null
   */
  getStrategy(id) {
    const row = this.stmtGetById.get(id);
    return row ? this._parseStrategy(row) : null;
  }

  /**
   * Get all active strategies
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of strategies
   */
  getAllStrategies(filters = {}) {
    let strategies;

    if (filters.type) {
      strategies = this.stmtGetByType.all(filters.type);
    } else if (filters.templates) {
      strategies = this.stmtGetTemplates.all();
    } else {
      strategies = this.stmtGetAll.all();
    }

    return strategies.map(row => this._parseStrategy(row));
  }

  /**
   * Get child strategies for a multi-strategy
   * @param {number} parentId - Parent strategy ID
   * @returns {Array} Array of child strategies
   */
  getChildStrategies(parentId) {
    const children = this.stmtGetChildren.all(parentId);
    return children.map(row => this._parseStrategy(row));
  }

  /**
   * Update a strategy
   * @param {number} id - Strategy ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated strategy
   */
  updateStrategy(id, updates) {
    const strategy = this.getStrategy(id);
    if (!strategy) {
      throw new Error(`Strategy ${id} not found`);
    }

    this.stmtUpdate.run(
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
    );

    return this.getStrategy(id);
  }

  /**
   * Delete a strategy (soft delete)
   * @param {number} id - Strategy ID
   * @returns {boolean} Success
   */
  deleteStrategy(id) {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Permanently delete a strategy
   * @param {number} id - Strategy ID
   * @returns {boolean} Success
   */
  hardDeleteStrategy(id) {
    const result = this.stmtHardDelete.run(id);
    return result.changes > 0;
  }

  /**
   * Create a multi-strategy with child strategies
   * @param {Object} parentConfig - Parent strategy config
   * @param {Array} childConfigs - Array of child strategy configs with allocations
   * @returns {Object} Created multi-strategy with children
   */
  createMultiStrategy(parentConfig, childConfigs) {
    if (!childConfigs || childConfigs.length < 2) {
      throw new Error('Multi-strategy requires at least 2 child strategies');
    }

    // Validate allocations sum to 1
    const totalAllocation = childConfigs.reduce((sum, c) => sum + (c.target_allocation || 0), 0);
    if (Math.abs(totalAllocation - 1) > 0.01) {
      throw new Error(`Child allocations must sum to 100% (currently ${(totalAllocation * 100).toFixed(1)}%)`);
    }

    // Create parent
    const parent = this.createStrategy({
      ...parentConfig,
      strategy_type: parentConfig.strategy_type || 'multi'
    });

    // Create children
    const children = childConfigs.map(childConfig => {
      return this.createStrategy({
        ...childConfig,
        parent_strategy_id: parent.id
      });
    });

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
  createFromPreset(presetName, overrides = {}) {
    const preset = this.stmtGetPresetByName.get(presetName);
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
  getPresets() {
    const presets = this.stmtGetPresets.all();
    return presets.map(row => ({
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
  updateBacktestCache(id, results) {
    this.stmtUpdateBacktestCache.run(
      results.sharpe || null,
      results.alpha || null,
      results.maxDrawdown || null,
      id
    );
  }

  /**
   * Duplicate a strategy
   * @param {number} id - Strategy ID to duplicate
   * @param {string} newName - Name for the duplicate
   * @returns {Object} Duplicated strategy
   */
  duplicateStrategy(id, newName) {
    const original = this.getStrategy(id);
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
  updateModelVersion(strategyId, modelVersion) {
    const strategy = this.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Check if model is locked
    if (strategy.ml_model_locked) {
      throw new Error(`Strategy ${strategyId} has model version locked. Unlock first to update.`);
    }

    this.stmtUpdateModelVersion.run(modelVersion, strategyId);
    return this.getStrategy(strategyId);
  }

  /**
   * Lock/unlock the model version for a strategy
   * Locked strategies won't have their model version auto-updated
   * @param {number} strategyId - Strategy ID
   * @param {boolean} locked - Whether to lock (true) or unlock (false)
   * @returns {Object} Updated strategy
   */
  setModelLock(strategyId, locked) {
    const strategy = this.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    this.stmtSetModelLock.run(locked ? 1 : 0, strategyId);
    return this.getStrategy(strategyId);
  }

  /**
   * Get all strategies using a specific model version
   * @param {string} modelVersion - Model version string
   * @returns {Array} Array of strategies
   */
  getStrategiesByModelVersion(modelVersion) {
    const strategies = this.stmtGetByModelVersion.all(modelVersion);
    return strategies.map(row => this._parseStrategy(row));
  }

  /**
   * Get all strategies with ML combiner enabled
   * @returns {Array} Array of strategies using ML
   */
  getMLEnabledStrategies() {
    const strategies = this.stmtGetMLStrategies.all();
    return strategies.map(row => this._parseStrategy(row));
  }

  /**
   * Get all unlocked strategies with ML combiner enabled
   * These are eligible for auto-update when a new model is promoted
   * @returns {Array} Array of strategies
   */
  getUnlockedMLStrategies() {
    const strategies = this.stmtGetUnlockedMLStrategies.all();
    return strategies.map(row => this._parseStrategy(row));
  }

  /**
   * Update all unlocked ML strategies to use a new model version
   * Called when a model is promoted to production
   * @param {string} newModelVersion - New model version string
   * @returns {Object} Update results
   */
  updateAllUnlockedToModelVersion(newModelVersion) {
    const strategies = this.getUnlockedMLStrategies();
    const results = {
      updated: [],
      skipped: [],
      errors: []
    };

    for (const strategy of strategies) {
      try {
        this.stmtUpdateModelVersion.run(newModelVersion, strategy.id);
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
  getModelBindingSummary() {
    const allStrategies = this.getAllStrategies();
    const mlStrategies = this.getMLEnabledStrategies();

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
      // Model binding fields
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
