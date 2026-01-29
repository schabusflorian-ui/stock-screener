// Database migration: Add ETF expansion support for tiered architecture
// Run: node src/database-migrations/add-etf-expansion.js

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Starting ETF expansion migration...');

  // ============================================
  // 1. Extend etf_definitions with new columns
  // ============================================
  console.log('Adding new columns to etf_definitions...');

  const columnsToAdd = [
    { name: 'tier', type: 'INTEGER DEFAULT 1' },
    { name: 'is_essential', type: 'INTEGER DEFAULT 0' },
    { name: 'subcategory', type: 'TEXT' },
    { name: 'strategy', type: 'TEXT' },
    { name: 'dividend_yield', type: 'REAL' },
    { name: 'beta', type: 'REAL' },
    { name: 'ytd_return', type: 'REAL' },
    { name: 'one_year_return', type: 'REAL' },
    { name: 'three_year_return', type: 'REAL' },
    { name: 'five_year_return', type: 'REAL' },
    { name: 'avg_volume', type: 'INTEGER' },
    { name: 'index_tracked', type: 'TEXT' },
    { name: 'sec_cik', type: 'TEXT' },
    { name: 'access_count', type: 'INTEGER DEFAULT 0' },
    { name: 'last_accessed', type: 'DATETIME' },
    { name: 'last_fundamentals_update', type: 'DATETIME' },
    { name: 'last_holdings_update', type: 'DATETIME' },
    { name: 'data_source', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    try {
      database.exec(`ALTER TABLE etf_definitions ADD COLUMN ${col.name} ${col.type}`);
      console.log(`  Added column: ${col.name}`);
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log(`  Column ${col.name} already exists, skipping`);
      } else {
        console.error(`  Error adding ${col.name}:`, e.message);
      }
    }
  }

  // Add indexes for new columns
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_etf_tier ON etf_definitions(tier)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_etf_essential ON etf_definitions(is_essential)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_etf_issuer ON etf_definitions(issuer)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_etf_access ON etf_definitions(access_count DESC)');
    console.log('  Added indexes for tier, essential, issuer, access_count');
  } catch (e) {
    console.log('  Indexes may already exist:', e.message);
  }

  // ============================================
  // 2. Create etf_categories table (hierarchical)
  // ============================================
  console.log('Creating etf_categories table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS etf_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      parent_id INTEGER REFERENCES etf_categories(id),
      description TEXT,
      icon TEXT,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_etf_categories_slug ON etf_categories(slug);
    CREATE INDEX IF NOT EXISTS idx_etf_categories_parent ON etf_categories(parent_id);
  `);

  // ============================================
  // 3. Create etf_issuers table
  // ============================================
  console.log('Creating etf_issuers table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS etf_issuers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      full_name TEXT,
      website TEXT,
      etf_count INTEGER DEFAULT 0,
      total_aum INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_etf_issuers_slug ON etf_issuers(slug);
  `);

  // ============================================
  // 4. Create lazy_portfolios table
  // ============================================
  console.log('Creating lazy_portfolios table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS lazy_portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      source TEXT,
      risk_level INTEGER,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lazy_portfolios_slug ON lazy_portfolios(slug);
    CREATE INDEX IF NOT EXISTS idx_lazy_portfolios_featured ON lazy_portfolios(is_featured);
  `);

  // ============================================
  // 5. Create lazy_portfolio_allocations table
  // ============================================
  console.log('Creating lazy_portfolio_allocations table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS lazy_portfolio_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL REFERENCES lazy_portfolios(id) ON DELETE CASCADE,
      etf_symbol TEXT NOT NULL,
      weight REAL NOT NULL,
      asset_class TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(portfolio_id, etf_symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_lazy_alloc_portfolio ON lazy_portfolio_allocations(portfolio_id);
  `);

  // ============================================
  // 6. Create etf_update_log table
  // ============================================
  console.log('Creating etf_update_log table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS etf_update_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      update_type TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      etfs_processed INTEGER DEFAULT 0,
      etfs_updated INTEGER DEFAULT 0,
      etfs_failed INTEGER DEFAULT 0,
      error_log TEXT,
      status TEXT DEFAULT 'running',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_etf_update_log_type ON etf_update_log(update_type);
    CREATE INDEX IF NOT EXISTS idx_etf_update_log_status ON etf_update_log(status);
  `);

  // ============================================
  // 7. Mark existing ETFs as Tier 1
  // ============================================
  console.log('Marking existing ETFs as Tier 1...');

  const result = database.prepare(`
    UPDATE etf_definitions
    SET tier = 1, data_source = 'manual'
    WHERE tier IS NULL OR tier = 0
  `).run();

  console.log(`  Updated ${result.changes} existing ETFs to Tier 1`);

  console.log('');
  console.log('ETF expansion migration complete!');
  console.log('');
  console.log('Tables created/updated:');
  console.log('  - etf_definitions (extended with tier system columns)');
  console.log('  - etf_categories (new - hierarchical categories)');
  console.log('  - etf_issuers (new - issuer metadata)');
  console.log('  - lazy_portfolios (new - pre-defined portfolios)');
  console.log('  - lazy_portfolio_allocations (new - portfolio allocations)');
  console.log('  - etf_update_log (new - update tracking)');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
