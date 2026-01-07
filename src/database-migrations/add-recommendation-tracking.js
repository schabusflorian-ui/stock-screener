// src/database-migrations/add-recommendation-tracking.js
// Migration to add recommendation tracking, signal optimization, and auto-execution tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting recommendation tracking migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // TABLE 1: Recommendation Outcomes
    // Tracks recommendation performance over time
    // ============================================
    console.log('  Creating recommendation_outcomes table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS recommendation_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER,           -- Which portfolio (NULL = general)
        symbol TEXT NOT NULL,
        company_id INTEGER,

        -- Recommendation details
        action TEXT NOT NULL,           -- BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL
        signal_score REAL,              -- -1 to +1 weighted score
        confidence REAL,                -- 0 to 1
        regime TEXT,                    -- BULL, BEAR, SIDEWAYS, HIGH_VOL, CRISIS
        signal_breakdown TEXT,          -- JSON of individual signal scores

        -- Timing
        recommended_at DATETIME NOT NULL,
        price_at_recommendation REAL,

        -- Forward returns (updated daily by job)
        return_1d REAL,
        return_5d REAL,
        return_21d REAL,
        return_63d REAL,

        -- Benchmark comparison (SPY returns)
        benchmark_return_1d REAL,
        benchmark_return_5d REAL,
        benchmark_return_21d REAL,
        benchmark_return_63d REAL,

        -- Alpha (excess return vs benchmark)
        alpha_1d REAL,
        alpha_5d REAL,
        alpha_21d REAL,
        alpha_63d REAL,

        -- Outcome classification
        outcome TEXT DEFAULT 'PENDING', -- WIN, LOSS, PENDING
        outcome_updated_at DATETIME,

        -- Execution tracking
        was_executed INTEGER DEFAULT 0,
        executed_at DATETIME,
        executed_price REAL,

        -- Link to original recommendation
        original_recommendation_id INTEGER,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 2: Signal Performance
    // Aggregated performance metrics by signal type
    // ============================================
    console.log('  Creating signal_performance table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS signal_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_type TEXT NOT NULL,      -- technical, sentiment, insider, fundamental, alternative, valuation, filing_13f, earnings
        regime TEXT,                    -- Market regime or 'ALL'
        period TEXT NOT NULL,           -- '30d', '90d', '1y', 'all'

        -- Sample info
        sample_count INTEGER,

        -- Performance metrics
        hit_rate REAL,                  -- % of WIN outcomes
        avg_return_1d REAL,
        avg_return_5d REAL,
        avg_return_21d REAL,
        avg_return_63d REAL,

        -- Information Coefficient (correlation of signal to return)
        ic_1d REAL,
        ic_5d REAL,
        ic_21d REAL,
        ic_63d REAL,

        -- Statistical significance
        ic_t_stat REAL,

        -- Risk-adjusted metrics
        sharpe_ratio REAL,

        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(signal_type, regime, period)
      );
    `);

    // ============================================
    // TABLE 3: Optimized Signal Weights
    // Stores IC-optimized weights per regime
    // ============================================
    console.log('  Creating optimized_signal_weights table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS optimized_signal_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime TEXT NOT NULL,           -- BULL, BEAR, SIDEWAYS, HIGH_VOL, CRISIS, ALL

        -- Weights by signal type (should sum to 1.0)
        technical_weight REAL DEFAULT 0.12,
        sentiment_weight REAL DEFAULT 0.12,
        insider_weight REAL DEFAULT 0.12,
        fundamental_weight REAL DEFAULT 0.15,
        alternative_weight REAL DEFAULT 0.12,
        valuation_weight REAL DEFAULT 0.12,
        filing_13f_weight REAL DEFAULT 0.13,
        earnings_weight REAL DEFAULT 0.12,

        -- Metadata
        lookback_days INTEGER DEFAULT 90,
        sample_count INTEGER,
        avg_ic REAL,

        -- Timestamps
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        valid_until DATETIME,           -- When weights should be recalculated

        UNIQUE(regime)
      );
    `);

    // ============================================
    // TABLE 4: Pending Executions Queue
    // Tracks trades awaiting user approval
    // ============================================
    console.log('  Creating pending_executions table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS pending_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        recommendation_outcome_id INTEGER,

        -- Trade details
        symbol TEXT NOT NULL,
        company_id INTEGER,
        action TEXT NOT NULL,           -- BUY, SELL
        shares REAL,
        estimated_price REAL,
        estimated_value REAL,

        -- Signal info
        signal_score REAL,
        confidence REAL,
        regime TEXT,

        -- Position sizing details
        position_pct REAL,              -- % of portfolio

        -- Status
        status TEXT DEFAULT 'pending',  -- pending, approved, rejected, executed, expired

        -- Decision tracking
        decided_at DATETIME,
        decided_by TEXT,                -- 'user', 'auto', 'system'
        rejection_reason TEXT,

        -- Execution tracking
        executed_at DATETIME,
        executed_price REAL,
        executed_shares REAL,

        -- Expiry
        expires_at DATETIME,            -- Auto-expire old pending trades

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (recommendation_outcome_id) REFERENCES recommendation_outcomes(id) ON DELETE SET NULL
      );
    `);

    // ============================================
    // Add columns to portfolios table for execution settings
    // ============================================
    console.log('  Adding execution settings columns to portfolios...');

    // Check if columns exist before adding
    const portfolioColumns = database.prepare(`PRAGMA table_info(portfolios)`).all();
    const existingCols = portfolioColumns.map(c => c.name);

    if (!existingCols.includes('auto_execute')) {
      database.exec(`ALTER TABLE portfolios ADD COLUMN auto_execute INTEGER DEFAULT 0`);
    }
    if (!existingCols.includes('execution_threshold')) {
      database.exec(`ALTER TABLE portfolios ADD COLUMN execution_threshold REAL DEFAULT 0.3`);
    }
    if (!existingCols.includes('max_auto_position_pct')) {
      database.exec(`ALTER TABLE portfolios ADD COLUMN max_auto_position_pct REAL DEFAULT 0.05`);
    }
    if (!existingCols.includes('require_confirmation')) {
      database.exec(`ALTER TABLE portfolios ADD COLUMN require_confirmation INTEGER DEFAULT 1`);
    }
    if (!existingCols.includes('auto_execute_actions')) {
      database.exec(`ALTER TABLE portfolios ADD COLUMN auto_execute_actions TEXT DEFAULT 'buy,sell'`);
    }

    // ============================================
    // TABLE 5: Hedge Suggestions History
    // Tracks hedge recommendations
    // ============================================
    console.log('  Creating hedge_suggestions table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS hedge_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,

        -- Market context
        regime TEXT,
        vix_level REAL,
        portfolio_beta REAL,
        portfolio_var_95 REAL,

        -- Suggestion details
        suggestion_type TEXT,           -- INDEX_PUT, VIX_CALL, SECTOR_HEDGE, CASH_INCREASE
        underlying TEXT,                -- SPY, VIX, sector ETF, or 'CASH'
        action TEXT,                    -- BUY, INCREASE

        -- For options
        strike_type TEXT,               -- '5% OTM', 'ATM', etc.
        expiry_dte INTEGER,             -- Days to expiry
        contracts INTEGER,
        estimated_cost REAL,

        -- For cash
        target_cash_pct REAL,
        current_cash_pct REAL,

        -- Hedge metrics
        hedge_ratio REAL,
        notional_hedged REAL,

        -- Rationale
        rationale TEXT,

        -- Status
        status TEXT DEFAULT 'suggested', -- suggested, implemented, dismissed
        implemented_at DATETIME,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');

    // Recommendation outcomes indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_symbol ON recommendation_outcomes(symbol);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_date ON recommendation_outcomes(recommended_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_portfolio ON recommendation_outcomes(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_outcome ON recommendation_outcomes(outcome);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_regime ON recommendation_outcomes(regime);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_action ON recommendation_outcomes(action);
      CREATE INDEX IF NOT EXISTS idx_rec_outcomes_executed ON recommendation_outcomes(was_executed);
    `);

    // Signal performance indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_signal_perf_type ON signal_performance(signal_type);
      CREATE INDEX IF NOT EXISTS idx_signal_perf_regime ON signal_performance(regime);
      CREATE INDEX IF NOT EXISTS idx_signal_perf_period ON signal_performance(period);
    `);

    // Pending executions indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_exec_portfolio ON pending_executions(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_pending_exec_status ON pending_executions(status);
      CREATE INDEX IF NOT EXISTS idx_pending_exec_symbol ON pending_executions(symbol);
      CREATE INDEX IF NOT EXISTS idx_pending_exec_created ON pending_executions(created_at DESC);
    `);

    // Hedge suggestions indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_hedge_suggestions_portfolio ON hedge_suggestions(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_hedge_suggestions_status ON hedge_suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_hedge_suggestions_created ON hedge_suggestions(created_at DESC);
    `);

    database.exec('COMMIT');

    console.log('Recommendation tracking migration completed!');
    console.log('');
    console.log('Tables created/modified:');
    console.log('  - recommendation_outcomes');
    console.log('  - signal_performance');
    console.log('  - optimized_signal_weights');
    console.log('  - pending_executions');
    console.log('  - hedge_suggestions');
    console.log('  - portfolios (added auto_execute columns)');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (
        'recommendation_outcomes',
        'signal_performance',
        'optimized_signal_weights',
        'pending_executions',
        'hedge_suggestions'
      )
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

    // Initialize default weights for all regimes
    console.log('');
    console.log('Initializing default signal weights...');

    const regimes = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'];
    const insertWeights = database.prepare(`
      INSERT OR IGNORE INTO optimized_signal_weights (regime) VALUES (?)
    `);

    for (const regime of regimes) {
      insertWeights.run(regime);
    }
    console.log('Default weights initialized for', regimes.length, 'regimes');

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
    WHERE type='table' AND name='recommendation_outcomes'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Recommendation tracking tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
