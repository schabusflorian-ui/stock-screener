// src/database-migrations/add-congressional-trading-tables.js
// Migration: Add congressional trading tables

const { getDb } = require('./_migrationHelper');

const db = getDb();

console.log('🏛️  Creating congressional trading tables...\n');

try {
  db.exec(`
    -- Politicians table (senators, representatives)
    CREATE TABLE IF NOT EXISTS politicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bioguide_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      party TEXT, -- 'Republican', 'Democratic', 'Independent'
      state TEXT,
      district TEXT, -- NULL for senators
      chamber TEXT NOT NULL, -- 'Senate', 'House'

      -- Position/leadership
      is_leadership INTEGER DEFAULT 0,
      leadership_role TEXT, -- 'Speaker', 'Majority Leader', etc.

      -- Committee memberships (JSON array)
      committees TEXT, -- JSON: [{"committee": "Finance", "role": "Chair"}, ...]

      -- Dates
      first_elected DATE,
      term_start DATE,
      term_end DATE,
      is_current INTEGER DEFAULT 1,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_politicians_bioguide ON politicians(bioguide_id);
    CREATE INDEX IF NOT EXISTS idx_politicians_name ON politicians(last_name, first_name);
    CREATE INDEX IF NOT EXISTS idx_politicians_chamber ON politicians(chamber);
    CREATE INDEX IF NOT EXISTS idx_politicians_party ON politicians(party);
    CREATE INDEX IF NOT EXISTS idx_politicians_current ON politicians(is_current) WHERE is_current = 1;
  `);

  console.log('✅ Created politicians table');

  db.exec(`
    -- Congressional trades table (similar to insider_transactions)
    CREATE TABLE IF NOT EXISTS congressional_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      politician_id INTEGER NOT NULL,
      company_id INTEGER,

      -- Filing info
      disclosure_id TEXT, -- Unique identifier from source
      filing_date TEXT NOT NULL,
      disclosure_year INTEGER,

      -- Transaction details
      transaction_date TEXT NOT NULL,
      transaction_type TEXT, -- 'purchase', 'sale', 'exchange'

      -- Asset information
      asset_type TEXT, -- 'stock', 'bond', 'option', 'corporate_bond', etc.
      ticker TEXT, -- May be NULL if not matched to company
      asset_description TEXT, -- Full description from filing

      -- Amount (often reported as range)
      amount_min REAL,
      amount_max REAL,
      amount_range TEXT, -- '$1,001 - $15,000', '$15,001 - $50,000', etc.

      -- Context
      owner TEXT, -- 'self', 'spouse', 'dependent_child', 'joint'
      is_periodic_transaction INTEGER DEFAULT 0, -- Automatic/planned trades

      -- Metadata
      disclosure_url TEXT,
      source TEXT, -- 'house_disclosures', 'senate_disclosures', 'quiver_api'
      data_quality TEXT, -- 'complete', 'partial', 'manual_entry'

      -- Matching
      symbol_matched INTEGER DEFAULT 0,
      match_confidence REAL, -- 0-1 confidence in company matching
      manual_review_needed INTEGER DEFAULT 0,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (politician_id) REFERENCES politicians(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
      UNIQUE(politician_id, transaction_date, asset_description, amount_range)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cong_trades_politician ON congressional_trades(politician_id);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_company ON congressional_trades(company_id);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_date ON congressional_trades(transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_ticker ON congressional_trades(ticker);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_type ON congressional_trades(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_filing ON congressional_trades(filing_date DESC);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_periodic ON congressional_trades(is_periodic_transaction);
    CREATE INDEX IF NOT EXISTS idx_cong_trades_matched ON congressional_trades(symbol_matched, company_id)
      WHERE symbol_matched = 1;
  `);

  console.log('✅ Created congressional_trades table');

  db.exec(`
    -- Committee assignments (for analysis of trades related to oversight)
    CREATE TABLE IF NOT EXISTS politician_committees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      politician_id INTEGER NOT NULL,
      committee_name TEXT NOT NULL,
      subcommittee_name TEXT,
      role TEXT, -- 'Chair', 'Ranking Member', 'Member'
      start_date TEXT,
      end_date TEXT,
      is_current INTEGER DEFAULT 1,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (politician_id) REFERENCES politicians(id) ON DELETE CASCADE,
      UNIQUE(politician_id, committee_name, subcommittee_name, start_date)
    );

    CREATE INDEX IF NOT EXISTS idx_pol_committee_politician ON politician_committees(politician_id);
    CREATE INDEX IF NOT EXISTS idx_pol_committee_name ON politician_committees(committee_name);
    CREATE INDEX IF NOT EXISTS idx_pol_committee_current ON politician_committees(is_current)
      WHERE is_current = 1;
  `);

  console.log('✅ Created politician_committees table');

  console.log('\n✅ Congressional trading tables created successfully!');
  console.log('\n📊 Summary:');
  console.log('   - politicians: Track senators and representatives');
  console.log('   - congressional_trades: Stock transactions by politicians');
  console.log('   - politician_committees: Committee assignments (for conflict analysis)');
  console.log('\n💡 Next Step: Implement data fetcher to populate these tables');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.error(error);
  process.exit(1);
}
