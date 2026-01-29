// src/database-migrations/migrate-to-unified-strategies.js
// Migration script to add unified_strategy_id column to trading_agents
// and migrate existing agent configurations to the unified_strategies table

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
/**
 * Run the migration
 * @param {Object} db - Database instance
 */
function migrate(db) {
  const database = db.getDatabase();

  console.log('Starting unified strategies migration...');

  // Start transaction
  const transaction = database.transaction(() => {
    // Step 1: Create unified_strategies table if not exists
    console.log('Creating unified_strategies table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS unified_strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        strategy_type TEXT DEFAULT 'single',
        is_template BOOLEAN DEFAULT FALSE,
        signal_weights TEXT NOT NULL,
        risk_params TEXT,
        universe_config TEXT,
        holding_period TEXT,
        regime_config TEXT,
        feature_flags TEXT,
        min_confidence REAL DEFAULT 0.6,
        min_signal_score REAL DEFAULT 0.3,
        parent_strategy_id INTEGER REFERENCES unified_strategies(id),
        target_allocation REAL,
        regime_trigger TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 2: Add unified_strategy_id column to trading_agents if not exists
    console.log('Adding unified_strategy_id column to trading_agents...');
    try {
      database.exec('ALTER TABLE trading_agents ADD COLUMN unified_strategy_id INTEGER REFERENCES unified_strategies(id)');
      console.log('  Column added successfully');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('  Column already exists, skipping...');
      } else {
        throw err;
      }
    }

    // Step 3: Add unified_strategy_id column to backtest_results if not exists
    console.log('Adding unified_strategy_id column to backtest_results...');
    try {
      database.exec('ALTER TABLE backtest_results ADD COLUMN unified_strategy_id INTEGER REFERENCES unified_strategies(id)');
      console.log('  Column added successfully');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('  Column already exists, skipping...');
      } else {
        throw err;
      }
    }

    // Step 4: Migrate existing agents to unified strategies
    console.log('Migrating existing agents to unified strategies...');

    const agents = database.prepare(`
      SELECT * FROM trading_agents
      WHERE unified_strategy_id IS NULL
    `).all();

    console.log(`  Found ${agents.length} agents to migrate`);

    const insertStrategy = database.prepare(`
      INSERT INTO unified_strategies (
        name, description, strategy_type, signal_weights, risk_params,
        universe_config, regime_config, feature_flags, min_confidence,
        min_signal_score, is_template
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateAgent = database.prepare(`
      UPDATE trading_agents SET unified_strategy_id = ? WHERE id = ?
    `);

    for (const agent of agents) {
      // Build signal weights from legacy columns
      const signalWeights = {
        technical: agent.technical_weight || 0.15,
        fundamental: agent.fundamental_weight || 0.15,
        sentiment: agent.sentiment_weight || 0.10,
        insider: agent.insider_weight || 0.12,
        congressional: 0.05,
        valuation: agent.valuation_weight || 0.15,
        thirteenF: agent.thirteenf_weight || 0.10,
        earningsMomentum: agent.earnings_weight || 0.08,
        valueQuality: agent.value_quality_weight || 0.07,
        momentum: 0.08,
        analyst: 0.06,
        alternative: agent.alternative_weight || 0.08,
        contrarian: 0.02,
        magicFormula: 0.03,
        factorScores: 0.02
      };

      // Normalize weights to sum to 1
      const totalWeight = Object.values(signalWeights).reduce((sum, w) => sum + w, 0);
      for (const key of Object.keys(signalWeights)) {
        signalWeights[key] = signalWeights[key] / totalWeight;
      }

      // Build risk params
      const riskParams = {
        minConfidence: agent.min_confidence || 0.6,
        minSignalScore: agent.min_signal_score || 0.3,
        maxPositionSize: agent.max_position_size || 0.10,
        maxSectorConcentration: agent.max_sector_exposure || 0.30,
        minCashReserve: agent.min_cash_reserve || 0.05,
        maxDrawdown: agent.max_drawdown || 0.20,
        maxCorrelation: agent.max_correlation || 0.70,
        stopLoss: agent.stop_loss || null,
        takeProfit: agent.take_profit || null,
        trailingStop: agent.trailing_stop || null
      };

      // Build universe config (default for now)
      const universeConfig = {
        minMarketCap: 1000000000,
        maxMarketCap: null,
        sectors: [],
        excludedSectors: [],
        minAvgVolume: 500000,
        minPrice: 5,
        excludePennyStocks: true,
        excludeADRs: true
      };

      // Build regime config
      const regimeConfig = {
        enabled: agent.regime_scaling_enabled || false,
        useHMM: agent.use_hmm_regime || false,
        exposures: {
          CRISIS: 0.25,
          HIGH_VOL: 0.5,
          NORMAL: 0.75,
          LOW_VOL: 1.0
        },
        pauseInCrisis: agent.pause_in_crisis || true,
        vixThreshold: agent.vix_threshold || 25
      };

      // Build feature flags
      const featureFlags = {
        useMLCombiner: false,
        useOptimizedWeights: agent.use_optimized_weights || true,
        useFactorExposure: agent.use_factor_exposure || true,
        useProbabilisticDCF: agent.use_probabilistic_dcf || true,
        useSignalDecorrelation: true
      };

      // Insert strategy
      const result = insertStrategy.run(
        `${agent.name} Strategy`,
        `Auto-migrated from agent: ${agent.name}`,
        'single',
        JSON.stringify(signalWeights),
        JSON.stringify(riskParams),
        JSON.stringify(universeConfig),
        JSON.stringify(regimeConfig),
        JSON.stringify(featureFlags),
        agent.min_confidence || 0.6,
        agent.min_signal_score || 0.3,
        false
      );

      // Update agent with strategy ID
      updateAgent.run(result.lastInsertRowid, agent.id);

      console.log(`  Migrated agent ${agent.id} (${agent.name}) to strategy ${result.lastInsertRowid}`);
    }

    // Step 5: Create default strategy presets as templates
    console.log('Creating default strategy presets...');

    const presets = [
      {
        name: 'Balanced Hybrid',
        description: 'Equal emphasis on technical, fundamental, and alternative data',
        weights: {
          technical: 0.12, fundamental: 0.12, sentiment: 0.08, insider: 0.10,
          congressional: 0.05, valuation: 0.12, thirteenF: 0.08, earningsMomentum: 0.06,
          valueQuality: 0.08, momentum: 0.08, analyst: 0.05, alternative: 0.04,
          contrarian: 0.02, magicFormula: 0.02, factorScores: 0.00
        }
      },
      {
        name: 'Deep Value',
        description: 'Focus on undervalued companies with strong fundamentals',
        weights: {
          technical: 0.05, fundamental: 0.20, sentiment: 0.03, insider: 0.10,
          congressional: 0.02, valuation: 0.25, thirteenF: 0.08, earningsMomentum: 0.02,
          valueQuality: 0.15, momentum: 0.02, analyst: 0.03, alternative: 0.02,
          contrarian: 0.02, magicFormula: 0.05, factorScores: 0.00
        }
      },
      {
        name: 'Smart Money Tracker',
        description: 'Follow institutional and insider buying patterns',
        weights: {
          technical: 0.08, fundamental: 0.10, sentiment: 0.05, insider: 0.25,
          congressional: 0.12, valuation: 0.08, thirteenF: 0.20, earningsMomentum: 0.02,
          valueQuality: 0.05, momentum: 0.03, analyst: 0.02, alternative: 0.02,
          contrarian: 0.00, magicFormula: 0.00, factorScores: 0.00
        }
      },
      {
        name: 'Momentum Growth',
        description: 'High momentum stocks with strong earnings growth',
        weights: {
          technical: 0.20, fundamental: 0.10, sentiment: 0.08, insider: 0.05,
          congressional: 0.02, valuation: 0.05, thirteenF: 0.05, earningsMomentum: 0.15,
          valueQuality: 0.05, momentum: 0.20, analyst: 0.05, alternative: 0.02,
          contrarian: 0.00, magicFormula: 0.00, factorScores: 0.00
        }
      },
      {
        name: 'Contrarian Value',
        description: 'Buy quality companies during selloffs',
        weights: {
          technical: 0.05, fundamental: 0.15, sentiment: 0.02, insider: 0.15,
          congressional: 0.03, valuation: 0.20, thirteenF: 0.08, earningsMomentum: 0.02,
          valueQuality: 0.15, momentum: 0.02, analyst: 0.03, alternative: 0.02,
          contrarian: 0.10, magicFormula: 0.05, factorScores: 0.00
        }
      }
    ];

    // Check if presets already exist
    const existingPresets = database.prepare(`
      SELECT COUNT(*) as count FROM unified_strategies WHERE is_template = 1
    `).get();

    if (existingPresets.count === 0) {
      for (const preset of presets) {
        insertStrategy.run(
          preset.name,
          preset.description,
          'single',
          JSON.stringify(preset.weights),
          JSON.stringify({
            minConfidence: 0.6, minSignalScore: 0.3, maxPositionSize: 0.10,
            maxSectorConcentration: 0.30, maxDrawdown: 0.20, maxCorrelation: 0.70
          }),
          JSON.stringify({
            minMarketCap: 1000000000, minAvgVolume: 500000, minPrice: 5,
            excludePennyStocks: true, excludeADRs: true
          }),
          JSON.stringify({
            enabled: true, useHMM: true, exposures: { CRISIS: 0.25, HIGH_VOL: 0.5, NORMAL: 0.75, LOW_VOL: 1.0 },
            pauseInCrisis: true
          }),
          JSON.stringify({ useOptimizedWeights: true, useFactorExposure: true, useProbabilisticDCF: true }),
          0.6,
          0.3,
          true
        );
        console.log(`  Created preset: ${preset.name}`);
      }
    } else {
      console.log(`  ${existingPresets.count} presets already exist, skipping...`);
    }

    // Step 6: Create indices for performance
    console.log('Creating indices...');
    try {
      database.exec('CREATE INDEX IF NOT EXISTS idx_unified_strategies_type ON unified_strategies(strategy_type)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_unified_strategies_template ON unified_strategies(is_template)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_unified_strategies_parent ON unified_strategies(parent_strategy_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_trading_agents_strategy ON trading_agents(unified_strategy_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_backtest_results_strategy ON backtest_results(unified_strategy_id)');
      console.log('  Indices created successfully');
    } catch (err) {
      console.log('  Some indices may already exist:', err.message);
    }

    console.log('Migration completed successfully!');
  });

  // Execute transaction
  transaction();

  return true;
}

/**
 * Rollback the migration (remove unified strategy links)
 * @param {Object} db - Database instance
 */
function rollback(db) {
  const database = db.getDatabase();

  console.log('Rolling back unified strategies migration...');

  const transaction = database.transaction(() => {
    // Clear unified_strategy_id from agents
    database.exec('UPDATE trading_agents SET unified_strategy_id = NULL');

    // Delete non-template strategies (migrated ones)
    database.exec('DELETE FROM unified_strategies WHERE is_template = 0');

    console.log('Rollback completed');
  });

  transaction();

  return true;
}

/**
 * Verify the migration
 * @param {Object} db - Database instance
 */
function verify(db) {
  const database = db.getDatabase();

  console.log('Verifying migration...');

  // Check unified_strategies table exists
  const tableExists = database.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='unified_strategies'
  `).get();

  if (!tableExists) {
    console.error('  ERROR: unified_strategies table does not exist');
    return false;
  }
  console.log('  unified_strategies table exists');

  // Count strategies
  const strategyCount = database.prepare('SELECT COUNT(*) as count FROM unified_strategies').get();
  console.log(`  ${strategyCount.count} strategies in database`);

  // Count templates
  const templateCount = database.prepare('SELECT COUNT(*) as count FROM unified_strategies WHERE is_template = 1').get();
  console.log(`  ${templateCount.count} strategy templates`);

  // Check agents with strategy links
  const linkedAgents = database.prepare('SELECT COUNT(*) as count FROM trading_agents WHERE unified_strategy_id IS NOT NULL').get();
  const totalAgents = database.prepare('SELECT COUNT(*) as count FROM trading_agents').get();
  console.log(`  ${linkedAgents.count}/${totalAgents.count} agents linked to strategies`);

  // Check for orphaned strategies
  const orphanedStrategies = database.prepare(`
    SELECT COUNT(*) as count FROM unified_strategies us
    WHERE us.is_template = 0
    AND NOT EXISTS (SELECT 1 FROM trading_agents ta WHERE ta.unified_strategy_id = us.id)
  `).get();
  if (orphanedStrategies.count > 0) {
    console.log(`  WARNING: ${orphanedStrategies.count} orphaned strategies (not linked to any agent)`);
  }

  console.log('Verification completed');
  return true;
}

// CLI support
if (require.main === module) {
  const dbPath = path.join(__dirname, '../../data/stocks.db');
  
  const db = {
    getDatabase: () => new Database(dbPath)
  };

  const command = process.argv[2] || 'migrate';

  switch (command) {
    case 'migrate':
      migrate(db);
      break;
    case 'rollback':
      rollback(db);
      break;
    case 'verify':
      verify(db);
      break;
    default:
      console.log('Usage: node migrate-to-unified-strategies.js [migrate|rollback|verify]');
  }
}

module.exports = { migrate, rollback, verify };
