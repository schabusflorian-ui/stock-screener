// src/database-migrations/add-beginner-strategies.js
// Migration to add beginner trading strategies support

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
const MIGRATION_NAME = 'add-beginner-strategies';

async function up(db) {
  console.log(`Running migration: ${MIGRATION_NAME}`);

  // 1. Add agent_category column to trading_agents
  // 'advanced' = existing ML/signal-based agents
  // 'beginner' = simple rule-based strategies (DCA, rebalancing, etc.)
  try {
    await db.run(`
      ALTER TABLE trading_agents
      ADD COLUMN agent_category TEXT DEFAULT 'advanced'
    `);
    console.log('  Added agent_category column to trading_agents');
  } catch (err) {
    if (!err.message.includes('duplicate column')) {
      throw err;
    }
    console.log('  agent_category column already exists');
  }

  // 2. Add beginner_config JSON column for strategy-specific configuration
  try {
    await db.run(`
      ALTER TABLE trading_agents
      ADD COLUMN beginner_config TEXT
    `);
    console.log('  Added beginner_config column to trading_agents');
  } catch (err) {
    if (!err.message.includes('duplicate column')) {
      throw err;
    }
    console.log('  beginner_config column already exists');
  }

  // 3. Add contribution_type to agent_signals for tracking beginner strategy signals
  try {
    await db.run(`
      ALTER TABLE agent_signals
      ADD COLUMN contribution_type TEXT
    `);
    console.log('  Added contribution_type column to agent_signals');
  } catch (err) {
    if (!err.message.includes('duplicate column')) {
      throw err;
    }
    console.log('  contribution_type column already exists');
  }

  // 4. Add contribution_amount to agent_signals for tracking dollar amounts
  try {
    await db.run(`
      ALTER TABLE agent_signals
      ADD COLUMN contribution_amount REAL
    `);
    console.log('  Added contribution_amount column to agent_signals');
  } catch (err) {
    if (!err.message.includes('duplicate column')) {
      throw err;
    }
    console.log('  contribution_amount column already exists');
  }

  // 5. Create beginner_contributions table for detailed contribution history
  await db.run(`
    CREATE TABLE IF NOT EXISTS beginner_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      portfolio_id INTEGER,
      contribution_date DATE NOT NULL,
      strategy_type TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      actual_amount REAL,
      status TEXT DEFAULT 'pending',
      execution_details TEXT,
      signal_ids TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_at DATETIME,
      FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
    )
  `);
  console.log('  Created beginner_contributions table');

  // 6. Create index for efficient queries
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_beginner_contributions_agent
    ON beginner_contributions(agent_id, contribution_date)
  `);
  console.log('  Created index on beginner_contributions');

  // 7. Create index for agent category queries
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_trading_agents_category
    ON trading_agents(agent_category)
  `);
  console.log('  Created index on trading_agents category');

  // 8. Add beginner strategy presets
  // Note: Using 'specialized' category since the CHECK constraint limits values
  // The beginner_strategy_type in risk_params identifies these as beginner strategies
  const presets = [
    {
      name: 'Simple: DCA Monthly',
      description: 'Fixed monthly investment into diversified ETFs. Simple, consistent, and effective for long-term wealth building.',
      category: 'specialized',
      risk_profile: 'moderate',
      holding_period_type: 'long',
      signal_weights: JSON.stringify({
        // Beginner strategies don't use signal weights
        technical: 0, fundamental: 0, sentiment: 0
      }),
      risk_params: JSON.stringify({
        beginner_strategy_type: 'dca',
        maxPositionSize: 0.25,
        maxSectorConcentration: 0.40
      })
    },
    {
      name: 'Simple: Value Averaging',
      description: 'Adjust contributions to maintain a target portfolio growth path. Invests more when market is down, less when up.',
      category: 'specialized',
      risk_profile: 'moderate',
      holding_period_type: 'long',
      signal_weights: JSON.stringify({
        technical: 0, fundamental: 0, sentiment: 0
      }),
      risk_params: JSON.stringify({
        beginner_strategy_type: 'value_averaging',
        maxPositionSize: 0.30,
        maxSectorConcentration: 0.40
      })
    },
    {
      name: 'Simple: DRIP Compounder',
      description: 'Automatically reinvest all dividends to compound returns over time. Perfect for dividend-focused portfolios.',
      category: 'specialized',
      risk_profile: 'conservative',
      holding_period_type: 'long',
      signal_weights: JSON.stringify({
        technical: 0, fundamental: 0, sentiment: 0
      }),
      risk_params: JSON.stringify({
        beginner_strategy_type: 'drip',
        maxPositionSize: 0.20,
        maxSectorConcentration: 0.35
      })
    },
    {
      name: 'Simple: Quarterly Rebalance',
      description: 'Maintain target asset allocation by rebalancing quarterly. Enforces discipline by selling winners and buying losers.',
      category: 'specialized',
      risk_profile: 'conservative',
      holding_period_type: 'long',
      signal_weights: JSON.stringify({
        technical: 0, fundamental: 0, sentiment: 0
      }),
      risk_params: JSON.stringify({
        beginner_strategy_type: 'rebalance',
        maxPositionSize: 0.25,
        rebalanceThreshold: 0.05
      })
    },
    {
      name: 'Simple: Lump Sum Hybrid',
      description: 'Invest half immediately, DCA the rest over 6 months. Balances time-in-market with risk management for windfalls.',
      category: 'specialized',
      risk_profile: 'moderate',
      holding_period_type: 'long',
      signal_weights: JSON.stringify({
        technical: 0, fundamental: 0, sentiment: 0
      }),
      risk_params: JSON.stringify({
        beginner_strategy_type: 'lump_dca',
        maxPositionSize: 0.25,
        lumpSumPct: 0.50,
        dcaMonths: 6
      })
    }
  ];

  // Check if presets exist in strategy_presets_v2
  const existingPresets = await db.get(`
    SELECT COUNT(*) as count FROM strategy_presets_v2
    WHERE name LIKE 'Simple:%'
  `);

  if (!existingPresets || existingPresets.count === 0) {
    for (const preset of presets) {
      await db.run(`
        INSERT INTO strategy_presets_v2
        (name, description, category, risk_profile, holding_period_type, signal_weights, risk_params)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        preset.name,
        preset.description,
        preset.category,
        preset.risk_profile,
        preset.holding_period_type,
        preset.signal_weights,
        preset.risk_params
      ]);
    }
    console.log(`  Added ${presets.length} beginner strategy presets`);
  } else {
    console.log('  Beginner presets already exist, skipping');
  }

  console.log(`Migration ${MIGRATION_NAME} completed successfully`);
}

async function down(db) {
  console.log(`Rolling back migration: ${MIGRATION_NAME}`);

  // Remove presets
  await db.run('DELETE FROM strategy_presets_v2 WHERE category = \'beginner\'');

  // Drop table
  await db.run('DROP TABLE IF EXISTS beginner_contributions');

  // Note: SQLite doesn't support DROP COLUMN, so we can't easily remove columns
  // In production, would need to recreate tables

  console.log(`Rollback of ${MIGRATION_NAME} completed`);
}

// Self-executing migration runner
async function runMigration() {
    
  const dbPath = path.join(__dirname, '../../data/stocks.db');
  const db = getDb();

  // Wrap better-sqlite3 with async-like interface
  const asyncDb = {
    run: (sql, params = []) => {
      try {
        if (params.length > 0) {
          db.prepare(sql).run(...params);
        } else {
          db.exec(sql);
        }
        return Promise.resolve();
      } catch (err) {
        return Promise.reject(err);
      }
    },
    get: (sql, params = []) => {
      try {
        const result = params.length > 0
          ? db.prepare(sql).get(...params)
          : db.prepare(sql).get();
        return Promise.resolve(result);
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };

  try {
    await up(asyncDb);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
  }
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { up, down, MIGRATION_NAME };
