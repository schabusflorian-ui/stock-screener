// src/database-migrations/add-trade-attributions.js
// Migration for Agent 3: Performance Attribution tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting trade attributions migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // TABLE 1: Trade Attributions
    // Stores factor-level attribution for each closed trade
    // ============================================
    console.log('  Creating trade_attributions table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS trade_attributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        factor TEXT NOT NULL CHECK (factor IN ('technical', 'sentiment', 'insider', 'fundamental')),
        contribution REAL,
        direction TEXT CHECK (direction IN ('positive', 'negative')),
        signal_at_entry TEXT,  -- JSON with signal details
        weight REAL,           -- Weight used in calculation
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (transaction_id) REFERENCES portfolio_transactions(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 2: Factor Performance Summary
    // Cached aggregate factor performance for faster queries
    // ============================================
    console.log('  Creating factor_performance_summary table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS factor_performance_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        period TEXT NOT NULL,  -- '7d', '30d', '90d', '1y', 'all'
        factor TEXT NOT NULL CHECK (factor IN ('technical', 'sentiment', 'insider', 'fundamental')),

        -- Performance metrics
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        win_rate REAL,
        total_contribution REAL DEFAULT 0,
        avg_contribution REAL,
        avg_signal_strength REAL,

        -- Timestamps
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(portfolio_id, period, factor),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 3: Regime Performance
    // Tracks trading performance by market regime
    // ============================================
    console.log('  Creating regime_performance table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS regime_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        regime TEXT NOT NULL CHECK (regime IN ('BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS')),
        period TEXT NOT NULL,  -- '30d', '90d', '1y', 'all'

        -- Performance metrics
        total_trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_rate REAL,
        avg_return REAL,
        total_pnl REAL DEFAULT 0,

        -- Timestamps
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(portfolio_id, regime, period),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 4: Sector Performance
    // Tracks trading performance by sector
    // ============================================
    console.log('  Creating sector_performance table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS sector_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        sector TEXT NOT NULL,
        period TEXT NOT NULL,  -- '30d', '90d', '1y', 'all'

        -- Performance metrics
        total_trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_rate REAL,
        avg_return REAL,
        total_pnl REAL DEFAULT 0,

        -- Timestamps
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(portfolio_id, sector, period),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');

    // Trade attributions indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_attributions_transaction ON trade_attributions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_attributions_factor ON trade_attributions(factor);
      CREATE INDEX IF NOT EXISTS idx_attributions_direction ON trade_attributions(direction);
    `);

    // Factor performance indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_factor_perf_portfolio ON factor_performance_summary(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_factor_perf_period ON factor_performance_summary(period);
    `);

    // Regime performance indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_regime_perf_portfolio ON regime_performance(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_regime_perf_regime ON regime_performance(regime);
    `);

    // Sector performance indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_sector_perf_portfolio ON sector_performance(portfolio_id);
      CREATE INDEX IF NOT EXISTS idx_sector_perf_sector ON sector_performance(sector);
    `);

    database.exec('COMMIT');

    console.log('Trade attributions migration completed!');
    console.log('');
    console.log('Tables created:');
    console.log('  - trade_attributions');
    console.log('  - factor_performance_summary');
    console.log('  - regime_performance');
    console.log('  - sector_performance');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (
        'trade_attributions',
        'factor_performance_summary',
        'regime_performance',
        'sector_performance'
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
    WHERE type='table' AND name='trade_attributions'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Trade attribution tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
