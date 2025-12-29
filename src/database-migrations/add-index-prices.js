/**
 * Database Migration: Add index prices for benchmark comparison
 *
 * This adds:
 * 1. index_prices table - stores price metrics for market indices (SPY, QQQ, DIA)
 * 2. alpha columns to price_metrics - performance vs benchmark
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('🔄 Running migration: add-index-prices');

// ============================================
// TABLE: Index Prices
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS index_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,       -- SPY, QQQ, DIA, IWM, etc.
    name TEXT,                         -- S&P 500 ETF, NASDAQ 100 ETF, etc.
    index_type TEXT DEFAULT 'market',  -- 'market', 'sector'

    -- Current price info
    last_price REAL,
    last_price_date DATE,

    -- 52-week range
    high_52w REAL,
    low_52w REAL,

    -- Price changes (percentage)
    change_1d REAL,
    change_1w REAL,
    change_1m REAL,
    change_3m REAL,
    change_6m REAL,
    change_1y REAL,
    change_ytd REAL,

    -- Technical indicators
    sma_50 REAL,
    sma_200 REAL,
    rsi_14 REAL,

    -- Metadata
    is_primary INTEGER DEFAULT 0,      -- 1 for SPY (default benchmark)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ Created index_prices table');

// Create index for fast lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_index_prices_symbol ON index_prices(symbol);
  CREATE INDEX IF NOT EXISTS idx_index_prices_type ON index_prices(index_type);
`);

// ============================================
// Add alpha columns to price_metrics
// ============================================
const alterStatements = [
  'ALTER TABLE price_metrics ADD COLUMN alpha_1d REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_1w REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_1m REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_3m REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_6m REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_1y REAL',
  'ALTER TABLE price_metrics ADD COLUMN alpha_ytd REAL',
  'ALTER TABLE price_metrics ADD COLUMN benchmark_symbol TEXT DEFAULT \'SPY\''
];

for (const stmt of alterStatements) {
  try {
    db.exec(stmt);
    console.log(`✅ Added column: ${stmt.split('ADD COLUMN ')[1].split(' ')[0]}`);
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log(`⏭️  Column already exists: ${stmt.split('ADD COLUMN ')[1].split(' ')[0]}`);
    } else {
      console.error(`❌ Error: ${e.message}`);
    }
  }
}

// ============================================
// Seed default market indices
// ============================================
const indices = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'market', primary: 1 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (NASDAQ 100)', type: 'market', primary: 0 },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'market', primary: 0 },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'market', primary: 0 },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'market', primary: 0 },
  // Sector ETFs
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR', type: 'sector', primary: 0 },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', type: 'sector', primary: 0 }
];

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO index_prices (symbol, name, index_type, is_primary)
  VALUES (?, ?, ?, ?)
`);

for (const idx of indices) {
  insertStmt.run(idx.symbol, idx.name, idx.type, idx.primary);
}

console.log(`✅ Seeded ${indices.length} market indices`);

db.close();

console.log('');
console.log('🎉 Migration complete: add-index-prices');
console.log('');
console.log('Next steps:');
console.log('  1. Run the index price fetcher to populate index_prices');
console.log('  2. Run alpha calculation to update price_metrics');
