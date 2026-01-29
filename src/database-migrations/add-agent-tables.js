// src/database-migrations/add-agent-tables.js
// Migration to add AI trading agent tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting AI trading agent tables migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // TABLE 1: Agent Recommendations
    // Stores trading recommendations from the AI agent
    // ============================================
    console.log('  Creating agent_recommendations table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS agent_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        date TEXT NOT NULL,

        -- Action and scoring
        action TEXT NOT NULL CHECK (action IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
        score REAL,
        raw_score REAL,
        confidence REAL,

        -- Position sizing
        position_size REAL,
        suggested_shares INTEGER,
        suggested_value REAL,

        -- Reasoning and signals
        reasoning TEXT,  -- JSON array of reasoning items
        signals TEXT,    -- JSON object with all signal snapshots

        -- Context at time of recommendation
        regime_at_time TEXT,
        price_at_time REAL,

        -- Portfolio context (if provided)
        portfolio_id INTEGER,

        -- Execution tracking
        was_executed INTEGER DEFAULT 0,
        executed_at DATETIME,
        execution_price REAL,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL
      );
    `);

    // ============================================
    // TABLE 2: Daily Analyses
    // Stores complete daily analysis runs for portfolios
    // ============================================
    console.log('  Creating daily_analyses table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS daily_analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        date TEXT NOT NULL,

        -- Market regime at time of analysis
        regime TEXT,
        regime_confidence REAL,
        regime_description TEXT,

        -- Opportunities found
        opportunities_count INTEGER DEFAULT 0,
        opportunities TEXT,  -- JSON array of opportunities

        -- Recommendations generated
        recommendations_count INTEGER DEFAULT 0,
        recommendations TEXT,  -- JSON array of recommendations

        -- Execution summary
        executed_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        blocked_count INTEGER DEFAULT 0,

        -- Analysis summary
        summary TEXT,  -- JSON object with summary stats

        -- Performance
        execution_time_ms INTEGER,
        errors TEXT,  -- JSON array of any errors encountered

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(portfolio_id, date),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 3: Risk Check History
    // Tracks risk check results for audit trail
    // ============================================
    console.log('  Creating risk_check_history table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS risk_check_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommendation_id INTEGER,
        portfolio_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,

        -- Overall result
        approved INTEGER NOT NULL,

        -- Individual checks (JSON)
        checks TEXT,  -- JSON array of check results

        -- Adjustments made
        original_position_size REAL,
        adjusted_position_size REAL,

        -- Warnings and blockers
        warnings TEXT,  -- JSON array
        blockers TEXT,  -- JSON array

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (recommendation_id) REFERENCES agent_recommendations(id) ON DELETE CASCADE,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 4: Market Regime History
    // Tracks detected market regimes over time
    // ============================================
    console.log('  Creating market_regime_history table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS market_regime_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,

        -- Regime classification
        regime TEXT NOT NULL CHECK (regime IN ('BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS')),
        confidence REAL,

        -- Underlying indicators
        vix_level REAL,
        vix_percentile REAL,
        market_breadth REAL,
        trend_strength REAL,
        fear_greed_index REAL,

        -- Derived metrics
        description TEXT,

        -- Raw data
        indicators TEXT,  -- JSON with all indicator values

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');

    // Agent recommendations indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_recs_company ON agent_recommendations(company_id);
      CREATE INDEX IF NOT EXISTS idx_agent_recs_date ON agent_recommendations(date DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_recs_action ON agent_recommendations(action);
      CREATE INDEX IF NOT EXISTS idx_agent_recs_portfolio ON agent_recommendations(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_agent_recs_score ON agent_recommendations(score DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_recs_executed ON agent_recommendations(was_executed);
    `);

    // Daily analyses indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_daily_analyses_portfolio ON daily_analyses(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_daily_analyses_date ON daily_analyses(date DESC);
      CREATE INDEX IF NOT EXISTS idx_daily_analyses_regime ON daily_analyses(regime);
    `);

    // Risk check history indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_risk_history_rec ON risk_check_history(recommendation_id);
      CREATE INDEX IF NOT EXISTS idx_risk_history_portfolio ON risk_check_history(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_risk_history_company ON risk_check_history(company_id);
    `);

    // Market regime history indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_regime_history_date ON market_regime_history(date DESC);
      CREATE INDEX IF NOT EXISTS idx_regime_history_regime ON market_regime_history(regime);
    `);

    database.exec('COMMIT');

    console.log('AI trading agent tables migration completed!');
    console.log('');
    console.log('Tables created:');
    console.log('  - agent_recommendations');
    console.log('  - daily_analyses');
    console.log('  - risk_check_history');
    console.log('  - market_regime_history');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND (
        name LIKE 'agent_%' OR
        name = 'daily_analyses' OR
        name = 'risk_check_history' OR
        name = 'market_regime_history'
      )
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

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
    WHERE type='table' AND name='agent_recommendations'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Agent tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
