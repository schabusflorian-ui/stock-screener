// src/services/agent/strategyConfig.js
// Strategy Configuration Schema - User-definable trading strategy parameters
// Supports both Single Strategy and Multi-Strategy modes

const { getDatabaseAsync, isPostgres } = require('../../database');

/**
 * StrategyConfigManager - Manages user-defined trading strategies
 *
 * Users can create strategies by configuring:
 * - Universe selection (what to trade)
 * - Signal weights (what signals to use and how much)
 * - Risk management (position sizing, stops, hedging)
 * - Holding period (time horizon)
 * - Regime sensitivity (market condition adjustments)
 */
class StrategyConfigManager {
  constructor(db, options = {}) {
    this.db = db;
    this.readOnly = options.readOnly || false;
    this.isPostgres = isPostgres;
    console.log('📋 StrategyConfigManager initialized');
  }

  async initialize() {
    if (!this.readOnly) {
      if (this.isPostgres) {
        // PostgreSQL tables are managed via migrations
        // Just initialize presets
        try {
          await this._initializePresets();
        } catch (e) {
          console.warn('Warning: Could not initialize presets:', e.message);
        }
      } else {
        // SQLite: Create tables and initialize presets
        try {
          this._initializeTables();
          await this._initializePresets();
        } catch (e) {
          if (e.code === 'SQLITE_BUSY') {
            // Database is locked, continue in read-only mode
            console.log('📋 StrategyConfigManager initialized (read-only, DB busy)');
            this.readOnly = true;
          } else {
            throw e;
          }
        }
      }
    }
    if (!this.isPostgres) {
      this._prepareStatements();
    }
    return this;
  }

  _initializeTables() {
    this.db.exec(`
      -- Main strategy configuration table
      CREATE TABLE IF NOT EXISTS strategy_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        mode TEXT NOT NULL DEFAULT 'single' CHECK (mode IN ('single', 'multi')),
        is_active INTEGER DEFAULT 1,

        -- Universe Selection
        universe_min_market_cap REAL DEFAULT 1e9,
        universe_max_market_cap REAL,
        universe_sectors TEXT,              -- JSON array of included sectors (null = all)
        universe_excluded_sectors TEXT,     -- JSON array of excluded sectors
        universe_countries TEXT,            -- JSON array: ['US', 'GB', 'DE', etc.]
        universe_min_avg_volume REAL,       -- Minimum average daily volume
        universe_custom_symbols TEXT,       -- JSON array of specific symbols to include

        -- Signal Weights (0-100, must sum to 100 or will be normalized)
        weight_technical INTEGER DEFAULT 15,
        weight_fundamental INTEGER DEFAULT 15,
        weight_sentiment INTEGER DEFAULT 10,
        weight_momentum INTEGER DEFAULT 15,
        weight_value INTEGER DEFAULT 15,
        weight_quality INTEGER DEFAULT 10,
        weight_insider INTEGER DEFAULT 10,
        weight_congressional INTEGER DEFAULT 10,

        -- Signal Thresholds
        min_signal_score REAL DEFAULT 0.30,     -- Minimum score to generate signal
        min_confidence REAL DEFAULT 0.60,       -- Minimum confidence threshold

        -- Risk Management
        max_position_size REAL DEFAULT 0.05,        -- Max 5% per position
        max_sector_concentration REAL DEFAULT 0.25, -- Max 25% per sector
        max_positions INTEGER DEFAULT 20,
        min_positions INTEGER DEFAULT 5,
        stop_loss_pct REAL DEFAULT 0.10,            -- 10% stop loss
        take_profit_pct REAL,                       -- Optional take profit
        trailing_stop_pct REAL,                     -- Optional trailing stop
        max_correlation REAL DEFAULT 0.7,           -- Max correlation between positions
        tail_hedge_allocation REAL DEFAULT 0,       -- 0-10% for crash protection

        -- Holding Period
        min_holding_days INTEGER DEFAULT 1,
        target_holding_days INTEGER DEFAULT 30,
        max_holding_days INTEGER,

        -- Regime Sensitivity
        regime_overlay_enabled INTEGER DEFAULT 0,
        regime_exposure_high_risk REAL DEFAULT 0.50,   -- 50% exposure in high risk regime
        regime_exposure_elevated REAL DEFAULT 0.75,    -- 75% exposure in elevated risk
        regime_exposure_normal REAL DEFAULT 1.0,

        -- Rebalancing
        rebalance_frequency TEXT DEFAULT 'weekly' CHECK (rebalance_frequency IN ('daily', 'weekly', 'monthly')),
        rebalance_threshold REAL DEFAULT 0.05,      -- Rebalance if drift > 5%

        -- Metadata
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        created_by TEXT,
        version INTEGER DEFAULT 1
      );

      -- Strategy performance tracking
      CREATE TABLE IF NOT EXISTS strategy_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        portfolio_value REAL,
        daily_return REAL,
        cumulative_return REAL,
        sharpe_ratio_30d REAL,
        max_drawdown REAL,
        position_count INTEGER,
        cash_pct REAL,
        FOREIGN KEY (strategy_id) REFERENCES strategy_configs(id) ON DELETE CASCADE,
        UNIQUE(strategy_id, date)
      );

      -- Multi-strategy allocations (for multi-strategy mode)
      CREATE TABLE IF NOT EXISTS multi_strategy_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_strategy_id INTEGER NOT NULL,      -- The multi-strategy parent
        child_strategy_id INTEGER NOT NULL,       -- The single strategy being allocated to
        target_allocation REAL NOT NULL,          -- Target % allocation (0-1)
        current_allocation REAL,                  -- Current actual allocation
        min_allocation REAL DEFAULT 0,            -- Floor
        max_allocation REAL DEFAULT 1,            -- Ceiling
        allocation_rationale TEXT,                -- AI reasoning for allocation
        last_rebalance TEXT,
        FOREIGN KEY (parent_strategy_id) REFERENCES strategy_configs(id) ON DELETE CASCADE,
        FOREIGN KEY (child_strategy_id) REFERENCES strategy_configs(id) ON DELETE CASCADE,
        UNIQUE(parent_strategy_id, child_strategy_id)
      );

      -- Strategy presets (templates users can start from)
      CREATE TABLE IF NOT EXISTS strategy_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT,                          -- 'value', 'growth', 'momentum', 'defensive', 'balanced'
        config_json TEXT NOT NULL,              -- Full strategy config as JSON
        risk_profile TEXT,                      -- 'conservative', 'moderate', 'aggressive'
        typical_holding_period TEXT,            -- 'short', 'medium', 'long'
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_strategy_active ON strategy_configs(is_active);
      CREATE INDEX IF NOT EXISTS idx_strategy_perf_date ON strategy_performance(strategy_id, date);
      CREATE INDEX IF NOT EXISTS idx_multi_alloc_parent ON multi_strategy_allocations(parent_strategy_id);
    `);
  }

  async _initializePresets() {
    const presets = [
      {
        name: 'Deep Value',
        description: 'Focus on undervalued companies with strong fundamentals. Long holding periods, concentrated positions.',
        category: 'value',
        risk_profile: 'moderate',
        typical_holding_period: 'long',
        config: {
          weight_technical: 5,
          weight_fundamental: 25,
          weight_sentiment: 5,
          weight_momentum: 10,
          weight_value: 30,
          weight_quality: 15,
          weight_insider: 10,
          max_position_size: 0.08,
          max_positions: 15,
          min_holding_days: 30,
          target_holding_days: 180,
          stop_loss_pct: 0.15,
          regime_overlay_enabled: 0
        }
      },
      {
        name: 'Momentum Growth',
        description: 'Ride trends in high-growth stocks. Shorter holding periods, follows price momentum.',
        category: 'momentum',
        risk_profile: 'aggressive',
        typical_holding_period: 'short',
        config: {
          weight_technical: 30,
          weight_fundamental: 10,
          weight_sentiment: 15,
          weight_momentum: 30,
          weight_value: 0,
          weight_quality: 10,
          weight_insider: 5,
          max_position_size: 0.05,
          max_positions: 25,
          min_holding_days: 5,
          target_holding_days: 30,
          stop_loss_pct: 0.08,
          trailing_stop_pct: 0.12,
          regime_overlay_enabled: 1
        }
      },
      {
        name: 'Quality Compounder',
        description: 'Wide-moat companies with consistent earnings growth. Very long holding periods.',
        category: 'growth',
        risk_profile: 'moderate',
        typical_holding_period: 'long',
        config: {
          weight_technical: 5,
          weight_fundamental: 20,
          weight_sentiment: 5,
          weight_momentum: 10,
          weight_value: 15,
          weight_quality: 35,
          weight_insider: 10,
          max_position_size: 0.10,
          max_positions: 12,
          min_holding_days: 90,
          target_holding_days: 365,
          stop_loss_pct: 0.20,
          regime_overlay_enabled: 0
        }
      },
      {
        name: 'Defensive Income',
        description: 'Low volatility stocks with dividends. Focus on capital preservation.',
        category: 'defensive',
        risk_profile: 'conservative',
        typical_holding_period: 'long',
        config: {
          weight_technical: 10,
          weight_fundamental: 20,
          weight_sentiment: 10,
          weight_momentum: 5,
          weight_value: 20,
          weight_quality: 25,
          weight_insider: 10,
          max_position_size: 0.05,
          max_positions: 25,
          min_positions: 15,
          stop_loss_pct: 0.12,
          tail_hedge_allocation: 0.03,
          regime_overlay_enabled: 1,
          regime_exposure_high_risk: 0.4
        }
      },
      {
        name: 'Tactical Trader',
        description: 'Active trading based on technical signals and sentiment. Short holding periods.',
        category: 'momentum',
        risk_profile: 'aggressive',
        typical_holding_period: 'short',
        config: {
          weight_technical: 35,
          weight_fundamental: 5,
          weight_sentiment: 25,
          weight_momentum: 20,
          weight_value: 5,
          weight_quality: 5,
          weight_insider: 5,
          max_position_size: 0.04,
          max_positions: 30,
          min_holding_days: 1,
          target_holding_days: 14,
          max_holding_days: 45,
          stop_loss_pct: 0.05,
          trailing_stop_pct: 0.08,
          rebalance_frequency: 'daily'
        }
      },
      {
        name: 'Tail Risk Protected',
        description: 'Growth exposure with systematic crash protection. Sacrifices some upside for downside protection.',
        category: 'defensive',
        risk_profile: 'moderate',
        typical_holding_period: 'medium',
        config: {
          weight_technical: 15,
          weight_fundamental: 15,
          weight_sentiment: 10,
          weight_momentum: 15,
          weight_value: 15,
          weight_quality: 20,
          weight_insider: 10,
          max_position_size: 0.05,
          max_positions: 20,
          stop_loss_pct: 0.10,
          tail_hedge_allocation: 0.05,
          regime_overlay_enabled: 1,
          regime_exposure_high_risk: 0.3,
          regime_exposure_elevated: 0.6
        }
      }
    ];

    for (const preset of presets) {
      const params = [
        preset.name,
        preset.description,
        preset.category,
        preset.risk_profile,
        preset.typical_holding_period,
        JSON.stringify(preset.config)
      ];

      if (this.isPostgres) {
        await this.db.query(`
          INSERT INTO strategy_presets (name, description, category, risk_profile, typical_holding_period, config_json)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (name) DO NOTHING
        `, params);
      } else {
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO strategy_presets (name, description, category, risk_profile, typical_holding_period, config_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(...params);
      }
    }
  }

  _prepareStatements() {
    // Only prepare statements for SQLite
    if (this.isPostgres) return;

    this.stmtGetStrategy = this.db.prepare(`
      SELECT * FROM strategy_configs WHERE id = ?
    `);

    this.stmtGetStrategyByName = this.db.prepare(`
      SELECT * FROM strategy_configs WHERE name = ?
    `);

    this.stmtGetActiveStrategies = this.db.prepare(`
      SELECT * FROM strategy_configs WHERE is_active = 1 ORDER BY name
    `);

    this.stmtGetPresets = this.db.prepare(`
      SELECT * FROM strategy_presets ORDER BY category, name
    `);

    this.stmtGetPreset = this.db.prepare(`
      SELECT * FROM strategy_presets WHERE name = ?
    `);

    this.stmtGetMultiStrategyAllocations = this.db.prepare(`
      SELECT msa.*, sc.name as child_name, sc.description as child_description
      FROM multi_strategy_allocations msa
      JOIN strategy_configs sc ON sc.id = msa.child_strategy_id
      WHERE msa.parent_strategy_id = ?
    `);

    this.stmtStorePerformance = this.db.prepare(`
      INSERT OR REPLACE INTO strategy_performance (
        strategy_id, date, portfolio_value, daily_return, cumulative_return,
        sharpe_ratio_30d, max_drawdown, position_count, cash_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateAllocation = this.db.prepare(`
      UPDATE multi_strategy_allocations
      SET current_allocation = ?, allocation_rationale = ?, last_rebalance = datetime('now')
      WHERE parent_strategy_id = ? AND child_strategy_id = ?
    `);
  }

  // Helper methods for async database operations
  async _getPresetByName(name) {
    if (this.isPostgres) {
      const result = await this.db.query(
        'SELECT * FROM strategy_presets WHERE name = $1',
        [name]
      );
      return result.rows[0];
    } else {
      return this.stmtGetPreset.get(name);
    }
  }

  async _getMultiStrategyAllocations(parentStrategyId) {
    if (this.isPostgres) {
      const result = await this.db.query(`
        SELECT msa.*, sc.name as child_name, sc.description as child_description
        FROM multi_strategy_allocations msa
        JOIN strategy_configs sc ON sc.id = msa.child_strategy_id
        WHERE msa.parent_strategy_id = $1
      `, [parentStrategyId]);
      return result.rows;
    } else {
      return this.stmtGetMultiStrategyAllocations.all(parentStrategyId);
    }
  }

  async _storePerformance(strategyId, date, portfolioValue, dailyReturn, cumulativeReturn, sharpeRatio30d, maxDrawdown, positionCount, cashPct) {
    const params = [strategyId, date, portfolioValue, dailyReturn, cumulativeReturn, sharpeRatio30d, maxDrawdown, positionCount, cashPct];

    if (this.isPostgres) {
      await this.db.query(`
        INSERT INTO strategy_performance (
          strategy_id, date, portfolio_value, daily_return, cumulative_return,
          sharpe_ratio_30d, max_drawdown, position_count, cash_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (strategy_id, date) DO UPDATE SET
          portfolio_value = EXCLUDED.portfolio_value,
          daily_return = EXCLUDED.daily_return,
          cumulative_return = EXCLUDED.cumulative_return,
          sharpe_ratio_30d = EXCLUDED.sharpe_ratio_30d,
          max_drawdown = EXCLUDED.max_drawdown,
          position_count = EXCLUDED.position_count,
          cash_pct = EXCLUDED.cash_pct
      `, params);
    } else {
      this.stmtStorePerformance.run(...params);
    }
  }

  async _updateAllocation(parentStrategyId, childStrategyId, currentAllocation, allocationRationale) {
    if (this.isPostgres) {
      await this.db.query(`
        UPDATE multi_strategy_allocations
        SET current_allocation = $1, allocation_rationale = $2, last_rebalance = CURRENT_TIMESTAMP
        WHERE parent_strategy_id = $3 AND child_strategy_id = $4
      `, [currentAllocation, allocationRationale, parentStrategyId, childStrategyId]);
    } else {
      this.stmtUpdateAllocation.run(currentAllocation, allocationRationale, parentStrategyId, childStrategyId);
    }
  }

  /**
   * Create a new strategy from scratch or from a preset
   * @param {Object} config - Strategy configuration
   * @param {string} presetName - Optional preset to start from
   * @returns {Object} Created strategy
   */
  async createStrategy(config, presetName = null) {
    let baseConfig = {};

    // Start from preset if specified
    if (presetName) {
      const preset = await this._getPresetByName(presetName);
      if (preset) {
        baseConfig = JSON.parse(preset.config_json);
      }
    }

    // Merge with user config (user config takes precedence)
    const finalConfig = { ...baseConfig, ...config };

    // Normalize signal weights to sum to 100
    const weights = [
      'weight_technical', 'weight_fundamental', 'weight_sentiment',
      'weight_momentum', 'weight_value', 'weight_quality', 'weight_insider', 'weight_congressional'
    ];
    const totalWeight = weights.reduce((sum, w) => sum + (finalConfig[w] || 0), 0);
    if (totalWeight > 0 && totalWeight !== 100) {
      for (const w of weights) {
        if (finalConfig[w]) {
          finalConfig[w] = Math.round((finalConfig[w] / totalWeight) * 100);
        }
      }
    }

    // Build INSERT statement
    const columns = Object.keys(finalConfig).filter(k => k !== 'id');
    const placeholders = this.isPostgres
      ? columns.map((_, i) => `$${i + 1}`).join(', ')
      : columns.map(() => '?').join(', ');
    const values = columns.map(c => {
      const val = finalConfig[c];
      return Array.isArray(val) || typeof val === 'object' ? JSON.stringify(val) : val;
    });

    const sql = `
      INSERT INTO strategy_configs (${columns.join(', ')})
      VALUES (${placeholders})
      ${this.isPostgres ? 'RETURNING *' : ''}
    `;

    if (this.isPostgres) {
      const result = await this.db.query(sql, values);
      return result.rows[0];
    } else {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);
      return this.stmtGetStrategy.get(result.lastInsertRowid);
    }
  }

  /**
   * Update an existing strategy
   * @param {number} strategyId - Strategy ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated strategy
   */
  async updateStrategy(strategyId, updates) {
    const keys = Object.keys(updates);
    const setClause = this.isPostgres
      ? keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      : keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates).map(v =>
      Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v
    );

    const timestamp = this.isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";
    const sql = `
      UPDATE strategy_configs
      SET ${setClause}, updated_at = ${timestamp}, version = version + 1
      WHERE id = ${this.isPostgres ? `$${values.length + 1}` : '?'}
      ${this.isPostgres ? 'RETURNING *' : ''}
    `;

    if (this.isPostgres) {
      const result = await this.db.query(sql, [...values, strategyId]);
      return result.rows[0];
    } else {
      const stmt = this.db.prepare(sql);
      stmt.run(...values, strategyId);
      return this.stmtGetStrategy.get(strategyId);
    }
  }

  /**
   * Create a multi-strategy configuration
   * @param {string} name - Multi-strategy name
   * @param {Array} childStrategies - Array of {strategyId, targetAllocation}
   * @returns {Object} Created multi-strategy
   */
  async createMultiStrategy(name, description, childStrategies) {
    // Create the parent strategy in multi mode
    const parent = await this.createStrategy({
      name,
      description,
      mode: 'multi'
    });

    // Add child allocations
    for (const child of childStrategies) {
      const sql = this.isPostgres
        ? `INSERT INTO multi_strategy_allocations (
             parent_strategy_id, child_strategy_id, target_allocation, min_allocation, max_allocation
           ) VALUES ($1, $2, $3, $4, $5)`
        : `INSERT INTO multi_strategy_allocations (
             parent_strategy_id, child_strategy_id, target_allocation, min_allocation, max_allocation
           ) VALUES (?, ?, ?, ?, ?)`;

      const params = [
        parent.id,
        child.strategyId,
        child.targetAllocation,
        child.minAllocation || 0,
        child.maxAllocation || 1
      ];

      if (this.isPostgres) {
        await this.db.query(sql, params);
      } else {
        const stmt = this.db.prepare(sql);
        stmt.run(...params);
      }
    }

    const allocations = await this._getMultiStrategyAllocations(parent.id);
    return {
      ...parent,
      allocations
    };
  }

  /**
   * Get strategy with full details
   * @param {number} strategyId - Strategy ID
   * @returns {Object} Strategy with allocations if multi-strategy
   */
  async getStrategy(strategyId) {
    let strategy;
    if (this.isPostgres) {
      const result = await this.db.query(
        'SELECT * FROM strategy_configs WHERE id = $1',
        [strategyId]
      );
      strategy = result.rows[0];
    } else {
      strategy = this.stmtGetStrategy.get(strategyId);
    }

    if (!strategy) return null;

    // Parse JSON fields
    const jsonFields = ['universe_sectors', 'universe_excluded_sectors', 'universe_countries', 'universe_custom_symbols'];
    for (const field of jsonFields) {
      if (strategy[field]) {
        try {
          strategy[field] = JSON.parse(strategy[field]);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }
    }

    // Add allocations for multi-strategy
    if (strategy.mode === 'multi') {
      strategy.allocations = await this._getMultiStrategyAllocations(strategyId);
    }

    return strategy;
  }

  /**
   * Get all available presets
   * @returns {Array} Strategy presets
   */
  async getPresets() {
    let presets;
    if (this.isPostgres) {
      const result = await this.db.query(
        'SELECT * FROM strategy_presets ORDER BY category, name'
      );
      presets = result.rows;
    } else {
      presets = this.stmtGetPresets.all();
    }

    return presets.map(p => ({
      ...p,
      config: JSON.parse(p.config_json)
    }));
  }

  /**
   * Get all active strategies
   * @returns {Array} Active strategies
   */
  async getActiveStrategies() {
    if (this.isPostgres) {
      const result = await this.db.query(
        'SELECT * FROM strategy_configs WHERE is_active = 1 ORDER BY name'
      );
      return result.rows;
    } else {
      return this.stmtGetActiveStrategies.all();
    }
  }

  /**
   * Validate a strategy configuration
   * @param {Object} config - Strategy config to validate
   * @returns {Object} Validation result with errors if any
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.name) errors.push('Strategy name is required');

    // Signal weights
    const weights = [
      config.weight_technical, config.weight_fundamental, config.weight_sentiment,
      config.weight_momentum, config.weight_value, config.weight_quality
    ].filter(w => w != null);

    if (weights.length > 0) {
      const total = weights.reduce((a, b) => a + b, 0);
      if (total === 0) errors.push('At least one signal weight must be > 0');
      if (weights.some(w => w < 0)) errors.push('Signal weights cannot be negative');
    }

    // Risk parameters
    if (config.max_position_size && (config.max_position_size <= 0 || config.max_position_size > 1)) {
      errors.push('max_position_size must be between 0 and 1');
    }
    if (config.max_sector_concentration && (config.max_sector_concentration <= 0 || config.max_sector_concentration > 1)) {
      errors.push('max_sector_concentration must be between 0 and 1');
    }
    if (config.stop_loss_pct && (config.stop_loss_pct <= 0 || config.stop_loss_pct > 0.5)) {
      warnings.push('stop_loss_pct above 50% may result in large losses');
    }
    if (config.tail_hedge_allocation && config.tail_hedge_allocation > 0.10) {
      warnings.push('tail_hedge_allocation above 10% may significantly drag returns');
    }

    // Holding period logic
    if (config.min_holding_days && config.max_holding_days && config.min_holding_days > config.max_holding_days) {
      errors.push('min_holding_days cannot exceed max_holding_days');
    }

    // Position count logic
    if (config.min_positions && config.max_positions && config.min_positions > config.max_positions) {
      errors.push('min_positions cannot exceed max_positions');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get configuration as normalized weights object for the agent
   * @param {number} strategyId - Strategy ID
   * @returns {Object} Normalized config for agent consumption
   */
  async getAgentConfig(strategyId) {
    const strategy = await this.getStrategy(strategyId);
    if (!strategy) return null;

    // Normalize weights
    const rawWeights = {
      technical: strategy.weight_technical || 0,
      fundamental: strategy.weight_fundamental || 0,
      sentiment: strategy.weight_sentiment || 0,
      momentum: strategy.weight_momentum || 0,
      value: strategy.weight_value || 0,
      quality: strategy.weight_quality || 0,
      insider: strategy.weight_insider || 0,
      congressional: strategy.weight_congressional || 0
    };

    const total = Object.values(rawWeights).reduce((a, b) => a + b, 0);
    const weights = {};
    for (const [k, v] of Object.entries(rawWeights)) {
      weights[k] = total > 0 ? v / total : 0;
    }

    return {
      strategyId: strategy.id,
      name: strategy.name,
      mode: strategy.mode,

      universe: {
        minMarketCap: strategy.universe_min_market_cap,
        maxMarketCap: strategy.universe_max_market_cap,
        sectors: strategy.universe_sectors,
        excludedSectors: strategy.universe_excluded_sectors,
        countries: strategy.universe_countries,
        minAvgVolume: strategy.universe_min_avg_volume,
        customSymbols: strategy.universe_custom_symbols
      },

      weights,

      thresholds: {
        minScore: strategy.min_signal_score,
        minConfidence: strategy.min_confidence
      },

      risk: {
        maxPositionSize: strategy.max_position_size,
        maxSectorConcentration: strategy.max_sector_concentration,
        maxPositions: strategy.max_positions,
        minPositions: strategy.min_positions,
        stopLoss: strategy.stop_loss_pct,
        takeProfit: strategy.take_profit_pct,
        trailingStop: strategy.trailing_stop_pct,
        maxCorrelation: strategy.max_correlation,
        tailHedgeAllocation: strategy.tail_hedge_allocation
      },

      holdingPeriod: {
        min: strategy.min_holding_days,
        target: strategy.target_holding_days,
        max: strategy.max_holding_days
      },

      regime: {
        enabled: !!strategy.regime_overlay_enabled,
        exposureHighRisk: strategy.regime_exposure_high_risk,
        exposureElevated: strategy.regime_exposure_elevated,
        exposureNormal: strategy.regime_exposure_normal
      },

      rebalancing: {
        frequency: strategy.rebalance_frequency,
        threshold: strategy.rebalance_threshold
      },

      // For multi-strategy mode
      allocations: strategy.allocations || null
    };
  }
}

module.exports = { StrategyConfigManager };
