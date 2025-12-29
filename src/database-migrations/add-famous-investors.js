// src/database-migrations/add-famous-investors.js
// Database migration for famous investors and 13F holdings tracking

const db = require('../database').db;
const { FAMOUS_INVESTORS } = require('../constants/portfolio');

console.log('🏛️ Running famous investors migration...');

// ============================================
// TABLE: Famous Investors
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS famous_investors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fund_name TEXT,
    cik TEXT UNIQUE,
    investment_style TEXT,
    description TEXT,
    wikipedia_url TEXT,
    image_url TEXT,
    latest_filing_date DATE,
    latest_filing_url TEXT,
    latest_portfolio_value REAL,
    latest_positions_count INTEGER,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 100,
    followers_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_famous_investors_cik ON famous_investors(cik);
  CREATE INDEX IF NOT EXISTS idx_famous_investors_active ON famous_investors(is_active, display_order);
  CREATE INDEX IF NOT EXISTS idx_famous_investors_style ON famous_investors(investment_style);
`);

console.log('✅ Created famous_investors table');

// ============================================
// TABLE: Investor Holdings (13F positions)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,
    company_id INTEGER,
    filing_date DATE NOT NULL,
    report_date DATE,
    cusip TEXT,
    security_name TEXT,
    shares REAL NOT NULL,
    market_value REAL NOT NULL,
    portfolio_weight REAL,
    prev_shares REAL,
    shares_change REAL,
    shares_change_pct REAL,
    value_change REAL,
    change_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_lookup ON investor_holdings(investor_id, filing_date DESC);
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_company ON investor_holdings(company_id, filing_date DESC);
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_change ON investor_holdings(investor_id, change_type);
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_cusip ON investor_holdings(cusip);
`);

console.log('✅ Created investor_holdings table');

// ============================================
// TABLE: Investor Filing History
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,
    filing_date DATE NOT NULL,
    report_date DATE,
    form_type TEXT DEFAULT '13F-HR',
    accession_number TEXT,
    filing_url TEXT,
    total_value REAL,
    positions_count INTEGER,
    new_positions INTEGER DEFAULT 0,
    increased_positions INTEGER DEFAULT 0,
    decreased_positions INTEGER DEFAULT 0,
    sold_positions INTEGER DEFAULT 0,
    unchanged_positions INTEGER DEFAULT 0,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE,
    UNIQUE(investor_id, filing_date)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_filings_lookup ON investor_filings(investor_id, filing_date DESC);
`);

console.log('✅ Created investor_filings table');

// ============================================
// TABLE: CUSIP to Symbol Mapping
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS cusip_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cusip TEXT UNIQUE NOT NULL,
    symbol TEXT,
    company_id INTEGER,
    security_name TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cusip_mapping_symbol ON cusip_mapping(symbol);
  CREATE INDEX IF NOT EXISTS idx_cusip_mapping_company ON cusip_mapping(company_id);
`);

console.log('✅ Created cusip_mapping table');

// ============================================
// Seed Famous Investors
// ============================================
const insertInvestor = db.prepare(`
  INSERT OR IGNORE INTO famous_investors (cik, name, fund_name, investment_style, description, display_order)
  VALUES (@cik, @manager, @name, @investment_style, @description, @display_order)
`);

const insertMany = db.transaction((investors) => {
  for (const investor of investors) {
    insertInvestor.run(investor);
  }
});

const investorData = Object.values(FAMOUS_INVESTORS).map(inv => ({
  cik: inv.cik,
  manager: inv.manager,
  name: inv.name,
  investment_style: inv.investment_style,
  description: inv.description,
  display_order: inv.display_order
}));

insertMany(investorData);

const count = db.prepare('SELECT COUNT(*) as count FROM famous_investors').get();
console.log(`✅ Seeded ${count.count} famous investors`);

console.log('🏛️ Famous investors migration complete!');

module.exports = { success: true };
