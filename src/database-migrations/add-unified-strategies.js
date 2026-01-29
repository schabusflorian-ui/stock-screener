// src/database-migrations/add-unified-strategies.js
// Migration to add unified_strategies table
// Consolidates strategy_configs and trading_agents strategy data into a single system

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('🔧 Running unified strategies migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // TABLE 1: Unified Strategies (Core Entity)
    // Single source of truth for all trading strategies
    // ============================================
    console.log('  Creating unified_strategies table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS unified_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Identity
        name TEXT NOT NULL,
        description TEXT,
        strategy_type TEXT DEFAULT 'single' CHECK (strategy_type IN ('single', 'multi', 'regime_switching')),
        is_template INTEGER DEFAULT 0,

        -- Signal Weights (JSON - all 15 signals)
        -- Format: {
        --   "technical": 0.10, "fundamental": 0.10, "sentiment": 0.08,
        --   "insider": 0.10, "congressional": 0.08, "valuation": 0.10,
        --   "thirteenF": 0.08, "earningsMomentum": 0.06, "valueQuality": 0.08,
        --   "momentum": 0.08, "analyst": 0.06, "alternative": 0.04,
        --   "contrarian": 0.02, "magicFormula": 0.02, "factorScores": 0.00
        -- }
        signal_weights TEXT NOT NULL DEFAULT '{}',

        -- Risk Parameters (JSON)
        -- Format: {
        --   "maxPositionSize": 0.10, "maxSectorConcentration": 0.25,
        --   "stopLoss": 0.10, "takeProfit": null, "trailingStop": null,
        --   "maxCorrelation": 0.70, "maxPositions": 20, "minPositions": 5,
        --   "maxDrawdown": 0.20, "minCashReserve": 0.05
        -- }
        risk_params TEXT DEFAULT '{}',

        -- Universe Configuration (JSON)
        -- Format: {
        --   "minMarketCap": 1e9, "maxMarketCap": null,
        --   "sectors": [], "excludedSectors": [],
        --   "minAvgVolume": 500000, "excludeADRs": true,
        --   "excludePennyStocks": true, "minPrice": 5,
        --   "customSymbols": []
        -- }
        universe_config TEXT DEFAULT '{}',

        -- Holding Period (JSON)
        -- Format: {"min": 1, "target": 30, "max": null}
        holding_period TEXT DEFAULT '{}',

        -- Regime Configuration (JSON)
        -- Format: {
        --   "enabled": true, "useHMM": true,
        --   "exposureHighRisk": 0.5, "exposureElevated": 0.75, "exposureNormal": 1.0,
        --   "pauseInCrisis": true, "vixThreshold": 25
        -- }
        regime_config TEXT DEFAULT '{}',

        -- Feature Flags (JSON)
        -- Format: {
        --   "useMLCombiner": false, "useOptimizedWeights": true,
        --   "useFactorExposure": true, "useProbabilisticDCF": true,
        --   "useSignalDecorrelation": true, "applyEarningsFilter": true,
        --   "earningsBlackoutDays": 7
        -- }
        feature_flags TEXT DEFAULT '{}',

        -- Thresholds
        min_confidence REAL DEFAULT 0.6,
        min_signal_score REAL DEFAULT 0.3,

        -- Rebalancing
        rebalance_frequency TEXT DEFAULT 'weekly' CHECK (rebalance_frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
        rebalance_threshold REAL DEFAULT 0.05,

        -- Multi-strategy / Regime-Switching Support
        parent_strategy_id INTEGER REFERENCES unified_strategies(id) ON DELETE CASCADE,
        target_allocation REAL,
        min_allocation REAL,
        max_allocation REAL,

        -- Regime Trigger (for child strategies in regime_switching mode)
        -- Format: {"regimes": ["crisis", "high_vol"], "action": "activate"}
        -- Or: {"regimes": ["bull", "normal"], "action": "deactivate"}
        regime_trigger TEXT,

        -- Performance Cache (denormalized for fast queries)
        backtest_sharpe REAL,
        backtest_alpha REAL,
        backtest_max_drawdown REAL,
        last_backtest_at DATETIME,

        -- Metadata
        is_active INTEGER DEFAULT 1,
        version INTEGER DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('  Creating unified_strategies indexes...');
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_unified_strategies_active ON unified_strategies(is_active, strategy_type);
      CREATE INDEX IF NOT EXISTS idx_unified_strategies_template ON unified_strategies(is_template);
      CREATE INDEX IF NOT EXISTS idx_unified_strategies_parent ON unified_strategies(parent_strategy_id);
      CREATE INDEX IF NOT EXISTS idx_unified_strategies_type ON unified_strategies(strategy_type);
    `);

    // ============================================
    // TABLE 2: Strategy Presets (Templates)
    // Pre-configured strategy templates
    // ============================================
    console.log('  Creating strategy_presets_v2 table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS strategy_presets_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        category TEXT DEFAULT 'general' CHECK (category IN ('general', 'conservative', 'moderate', 'aggressive', 'specialized')),
        risk_profile TEXT DEFAULT 'moderate' CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
        holding_period_type TEXT DEFAULT 'medium' CHECK (holding_period_type IN ('short', 'medium', 'long')),

        -- Full strategy configuration (matches unified_strategies)
        signal_weights TEXT NOT NULL,
        risk_params TEXT,
        universe_config TEXT,
        holding_period TEXT,
        regime_config TEXT,
        feature_flags TEXT,
        min_confidence REAL DEFAULT 0.6,
        min_signal_score REAL DEFAULT 0.3,

        -- Display order
        sort_order INTEGER DEFAULT 0,

        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ============================================
    // TABLE 3: Strategy Backtest Results Link
    // Links backtest results to strategies
    // ============================================
    console.log('  Adding strategy_id column to backtest_results...');
    const backtestColumns = database.prepare('PRAGMA table_info(backtest_results)').all();
    const hasStrategyId = backtestColumns.some(col => col.name === 'unified_strategy_id');

    if (!hasStrategyId) {
      database.exec(`
        ALTER TABLE backtest_results ADD COLUMN unified_strategy_id INTEGER REFERENCES unified_strategies(id);
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_backtest_results_strategy ON backtest_results(unified_strategy_id);
      `);
      console.log('    Added unified_strategy_id column to backtest_results');
    } else {
      console.log('    unified_strategy_id column already exists, skipping');
    }

    // ============================================
    // TABLE 4: Alter trading_agents to reference unified_strategies
    // ============================================
    console.log('  Adding strategy_id column to trading_agents...');
    const agentColumns = database.prepare('PRAGMA table_info(trading_agents)').all();
    const hasAgentStrategyId = agentColumns.some(col => col.name === 'unified_strategy_id');

    if (!hasAgentStrategyId) {
      database.exec(`
        ALTER TABLE trading_agents ADD COLUMN unified_strategy_id INTEGER REFERENCES unified_strategies(id);
      `);
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_trading_agents_strategy ON trading_agents(unified_strategy_id);
      `);
      console.log('    Added unified_strategy_id column to trading_agents');
    } else {
      console.log('    unified_strategy_id column already exists, skipping');
    }

    // ============================================
    // Insert Default Presets
    // ============================================
    console.log('  Inserting default strategy presets...');

    const defaultPresets = [
      {
        name: 'Balanced Hybrid',
        description: 'Balanced approach using all signal types with equal weighting',
        category: 'general',
        risk_profile: 'moderate',
        holding_period_type: 'medium',
        signal_weights: JSON.stringify({
          technical: 0.08, fundamental: 0.10, sentiment: 0.07,
          insider: 0.10, congressional: 0.08, valuation: 0.10,
          thirteenF: 0.08, earningsMomentum: 0.07, valueQuality: 0.08,
          momentum: 0.08, analyst: 0.06, alternative: 0.04,
          contrarian: 0.02, magicFormula: 0.02, factorScores: 0.02
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.10, maxSectorConcentration: 0.25,
          stopLoss: 0.10, maxCorrelation: 0.70, maxPositions: 20
        }),
        sort_order: 1
      },
      {
        name: 'Value Investor',
        description: 'Focus on fundamentals, valuations, and quality metrics (Buffett-style)',
        category: 'conservative',
        risk_profile: 'conservative',
        holding_period_type: 'long',
        signal_weights: JSON.stringify({
          technical: 0.02, fundamental: 0.20, sentiment: 0.02,
          insider: 0.12, congressional: 0.05, valuation: 0.20,
          thirteenF: 0.10, earningsMomentum: 0.05, valueQuality: 0.15,
          momentum: 0.02, analyst: 0.02, alternative: 0.02,
          contrarian: 0.01, magicFormula: 0.01, factorScores: 0.01
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.08, maxSectorConcentration: 0.20,
          stopLoss: 0.15, maxCorrelation: 0.60, maxPositions: 15
        }),
        sort_order: 2
      },
      {
        name: 'Smart Money Tracker',
        description: 'Follow insider buying, congressional trades, and famous investors',
        category: 'specialized',
        risk_profile: 'moderate',
        holding_period_type: 'medium',
        signal_weights: JSON.stringify({
          technical: 0.05, fundamental: 0.10, sentiment: 0.05,
          insider: 0.25, congressional: 0.20, valuation: 0.05,
          thirteenF: 0.20, earningsMomentum: 0.02, valueQuality: 0.03,
          momentum: 0.02, analyst: 0.02, alternative: 0.01,
          contrarian: 0.00, magicFormula: 0.00, factorScores: 0.00
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.10, maxSectorConcentration: 0.30,
          stopLoss: 0.12, maxCorrelation: 0.75, maxPositions: 20
        }),
        sort_order: 3
      },
      {
        name: 'Momentum Growth',
        description: 'Ride momentum and earnings momentum for growth stocks',
        category: 'aggressive',
        risk_profile: 'aggressive',
        holding_period_type: 'short',
        signal_weights: JSON.stringify({
          technical: 0.20, fundamental: 0.05, sentiment: 0.10,
          insider: 0.05, congressional: 0.02, valuation: 0.02,
          thirteenF: 0.05, earningsMomentum: 0.20, valueQuality: 0.02,
          momentum: 0.20, analyst: 0.05, alternative: 0.02,
          contrarian: 0.00, magicFormula: 0.00, factorScores: 0.02
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.12, maxSectorConcentration: 0.35,
          stopLoss: 0.08, maxCorrelation: 0.80, maxPositions: 25
        }),
        sort_order: 4
      },
      {
        name: 'Sentiment & Social',
        description: 'Track social sentiment, news, and analyst recommendations',
        category: 'aggressive',
        risk_profile: 'aggressive',
        holding_period_type: 'short',
        signal_weights: JSON.stringify({
          technical: 0.15, fundamental: 0.05, sentiment: 0.30,
          insider: 0.05, congressional: 0.05, valuation: 0.02,
          thirteenF: 0.02, earningsMomentum: 0.05, valueQuality: 0.02,
          momentum: 0.10, analyst: 0.15, alternative: 0.04,
          contrarian: 0.00, magicFormula: 0.00, factorScores: 0.00
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.08, maxSectorConcentration: 0.25,
          stopLoss: 0.07, maxCorrelation: 0.70, maxPositions: 30
        }),
        sort_order: 5
      },
      {
        name: 'Contrarian Value',
        description: 'Buy when insiders are buying in drawdowns, focus on unloved stocks',
        category: 'specialized',
        risk_profile: 'moderate',
        holding_period_type: 'long',
        signal_weights: JSON.stringify({
          technical: 0.05, fundamental: 0.15, sentiment: 0.02,
          insider: 0.20, congressional: 0.05, valuation: 0.15,
          thirteenF: 0.05, earningsMomentum: 0.03, valueQuality: 0.10,
          momentum: 0.00, analyst: 0.00, alternative: 0.05,
          contrarian: 0.15, magicFormula: 0.00, factorScores: 0.00
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.08, maxSectorConcentration: 0.20,
          stopLoss: 0.15, maxCorrelation: 0.65, maxPositions: 15
        }),
        sort_order: 6
      },
      {
        name: 'Magic Formula Plus',
        description: 'Greenblatt Magic Formula enhanced with quality and momentum',
        category: 'moderate',
        risk_profile: 'moderate',
        holding_period_type: 'medium',
        signal_weights: JSON.stringify({
          technical: 0.05, fundamental: 0.15, sentiment: 0.02,
          insider: 0.08, congressional: 0.02, valuation: 0.15,
          thirteenF: 0.05, earningsMomentum: 0.08, valueQuality: 0.15,
          momentum: 0.05, analyst: 0.02, alternative: 0.02,
          contrarian: 0.02, magicFormula: 0.12, factorScores: 0.02
        }),
        risk_params: JSON.stringify({
          maxPositionSize: 0.08, maxSectorConcentration: 0.25,
          stopLoss: 0.12, maxCorrelation: 0.70, maxPositions: 20
        }),
        sort_order: 7
      }
    ];

    const insertPreset = database.prepare(`
      INSERT OR IGNORE INTO strategy_presets_v2 (
        name, description, category, risk_profile, holding_period_type,
        signal_weights, risk_params, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const preset of defaultPresets) {
      insertPreset.run(
        preset.name, preset.description, preset.category,
        preset.risk_profile, preset.holding_period_type,
        preset.signal_weights, preset.risk_params, preset.sort_order
      );
    }
    console.log(`    Inserted ${defaultPresets.length} default presets`);

    database.exec('COMMIT');

    console.log('');
    console.log('🔧 Unified strategies migration completed!');
    console.log('');
    console.log('Tables created/modified:');
    console.log('  - unified_strategies (new core table)');
    console.log('  - strategy_presets_v2 (new presets table)');
    console.log('  - backtest_results (added unified_strategy_id)');
    console.log('  - trading_agents (added unified_strategy_id)');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (
        'unified_strategies',
        'strategy_presets_v2'
      )
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

    // Count presets
    const presetCount = database.prepare('SELECT COUNT(*) as count FROM strategy_presets_v2').get();
    console.log('Strategy presets available:', presetCount.count);

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  }
}

// Helper function to check if migration has been run
function isMigrationNeeded() {
  const database = db.getDatabase();
  const result = database.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='unified_strategies'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Unified strategies table already exists. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
