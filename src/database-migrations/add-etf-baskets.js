// Database migration: Add ETF baskets support
// Run: node src/database-migrations/add-etf-baskets.js

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Adding ETF basket tables...');

  // ETF definitions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS etf_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      issuer TEXT,
      category TEXT,
      asset_class TEXT,
      expense_ratio REAL,
      aum REAL,
      inception_date DATE,
      benchmark_index TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_etf_symbol ON etf_definitions(symbol);
    CREATE INDEX IF NOT EXISTS idx_etf_category ON etf_definitions(category);
  `);

  // ETF holdings/components table
  database.exec(`
    CREATE TABLE IF NOT EXISTS etf_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_id INTEGER NOT NULL,
      company_id INTEGER,
      symbol TEXT NOT NULL,
      security_name TEXT,
      weight REAL NOT NULL,
      shares REAL,
      market_value REAL,
      sector TEXT,
      as_of_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (etf_id) REFERENCES etf_definitions(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE INDEX IF NOT EXISTS idx_etf_holdings_etf ON etf_holdings(etf_id, as_of_date);
    CREATE INDEX IF NOT EXISTS idx_etf_holdings_company ON etf_holdings(company_id);
  `);

  // Model portfolios based on ETF allocations
  database.exec(`
    CREATE TABLE IF NOT EXISTS model_portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      risk_level TEXT,
      investment_style TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Model portfolio allocations (ETF-based)
  database.exec(`
    CREATE TABLE IF NOT EXISTS model_portfolio_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      etf_id INTEGER NOT NULL,
      target_weight REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (model_id) REFERENCES model_portfolios(id),
      FOREIGN KEY (etf_id) REFERENCES etf_definitions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_model_alloc ON model_portfolio_allocations(model_id);
  `);

  console.log('✅ ETF basket tables created');

  // Insert some common ETF definitions
  const insertEtf = database.prepare(`
    INSERT OR IGNORE INTO etf_definitions (symbol, name, issuer, category, asset_class, expense_ratio, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const etfs = [
    ['SPY', 'SPDR S&P 500 ETF Trust', 'State Street', 'Large Blend', 'Equity', 0.0945, 'Tracks the S&P 500 Index'],
    ['QQQ', 'Invesco QQQ Trust', 'Invesco', 'Large Growth', 'Equity', 0.20, 'Tracks the NASDAQ-100 Index'],
    ['VTI', 'Vanguard Total Stock Market ETF', 'Vanguard', 'Large Blend', 'Equity', 0.03, 'Tracks the CRSP US Total Market Index'],
    ['VOO', 'Vanguard S&P 500 ETF', 'Vanguard', 'Large Blend', 'Equity', 0.03, 'Tracks the S&P 500 Index'],
    ['IWM', 'iShares Russell 2000 ETF', 'BlackRock', 'Small Blend', 'Equity', 0.19, 'Tracks the Russell 2000 Index'],
    ['VEA', 'Vanguard FTSE Developed Markets ETF', 'Vanguard', 'Foreign Large Blend', 'Equity', 0.05, 'Tracks FTSE Developed All Cap ex US Index'],
    ['VWO', 'Vanguard FTSE Emerging Markets ETF', 'Vanguard', 'Diversified Emerging Mkts', 'Equity', 0.08, 'Tracks FTSE Emerging Markets Index'],
    ['BND', 'Vanguard Total Bond Market ETF', 'Vanguard', 'Intermediate Core Bond', 'Fixed Income', 0.03, 'Tracks Bloomberg US Aggregate Float Adjusted Index'],
    ['AGG', 'iShares Core US Aggregate Bond ETF', 'BlackRock', 'Intermediate Core Bond', 'Fixed Income', 0.03, 'Tracks Bloomberg US Aggregate Bond Index'],
    ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'BlackRock', 'Long Government', 'Fixed Income', 0.15, 'Tracks ICE US Treasury 20+ Year Bond Index'],
    ['GLD', 'SPDR Gold Shares', 'State Street', 'Commodities Precious Metals', 'Commodity', 0.40, 'Tracks gold bullion price'],
    ['VNQ', 'Vanguard Real Estate ETF', 'Vanguard', 'Real Estate', 'Real Estate', 0.12, 'Tracks MSCI US Investable Market Real Estate 25/50 Index'],
    ['XLK', 'Technology Select Sector SPDR', 'State Street', 'Technology', 'Equity', 0.10, 'Tracks the Technology Select Sector Index'],
    ['XLF', 'Financial Select Sector SPDR', 'State Street', 'Financial', 'Equity', 0.10, 'Tracks the Financial Select Sector Index'],
    ['XLE', 'Energy Select Sector SPDR', 'State Street', 'Energy', 'Equity', 0.10, 'Tracks the Energy Select Sector Index'],
    ['XLV', 'Health Care Select Sector SPDR', 'State Street', 'Health', 'Equity', 0.10, 'Tracks the Health Care Select Sector Index'],
    ['ARKK', 'ARK Innovation ETF', 'ARK Invest', 'Large Growth', 'Equity', 0.75, 'Actively managed disruptive innovation ETF'],
    ['SCHD', 'Schwab US Dividend Equity ETF', 'Schwab', 'Large Value', 'Equity', 0.06, 'Tracks Dow Jones US Dividend 100 Index']
  ];

  for (const etf of etfs) {
    insertEtf.run(...etf);
  }

  console.log(`✅ Inserted ${etfs.length} ETF definitions`);

  // Insert some model portfolios
  const insertModel = database.prepare(`
    INSERT OR IGNORE INTO model_portfolios (name, description, risk_level, investment_style)
    VALUES (?, ?, ?, ?)
  `);

  const models = [
    ['Conservative', '20% stocks, 70% bonds, 10% alternatives', 'low', 'income'],
    ['Moderate', '60% stocks, 35% bonds, 5% alternatives', 'medium', 'balanced'],
    ['Aggressive Growth', '90% stocks, 10% bonds', 'high', 'growth'],
    ['All Weather', 'Ray Dalio inspired all-weather allocation', 'medium', 'balanced'],
    ['Three Fund', 'Classic Bogleheads three-fund portfolio', 'medium', 'passive'],
    ['Dividend Income', 'Focus on dividend-paying ETFs', 'medium-low', 'income']
  ];

  for (const model of models) {
    insertModel.run(...model);
  }

  console.log(`✅ Inserted ${models.length} model portfolios`);

  // Get model IDs and ETF IDs for allocations
  const getModelId = database.prepare('SELECT id FROM model_portfolios WHERE name = ?');
  const getEtfId = database.prepare('SELECT id FROM etf_definitions WHERE symbol = ?');

  const insertAlloc = database.prepare(`
    INSERT OR IGNORE INTO model_portfolio_allocations (model_id, etf_id, target_weight)
    VALUES (?, ?, ?)
  `);

  // Conservative: 20% VTI, 70% BND, 10% GLD
  const conservative = getModelId.get('Conservative');
  if (conservative) {
    insertAlloc.run(conservative.id, getEtfId.get('VTI')?.id, 20);
    insertAlloc.run(conservative.id, getEtfId.get('BND')?.id, 70);
    insertAlloc.run(conservative.id, getEtfId.get('GLD')?.id, 10);
  }

  // Moderate: 40% VTI, 20% VEA, 35% BND, 5% VNQ
  const moderate = getModelId.get('Moderate');
  if (moderate) {
    insertAlloc.run(moderate.id, getEtfId.get('VTI')?.id, 40);
    insertAlloc.run(moderate.id, getEtfId.get('VEA')?.id, 20);
    insertAlloc.run(moderate.id, getEtfId.get('BND')?.id, 35);
    insertAlloc.run(moderate.id, getEtfId.get('VNQ')?.id, 5);
  }

  // Aggressive Growth: 50% VTI, 30% QQQ, 10% VWO, 10% IWM
  const aggressive = getModelId.get('Aggressive Growth');
  if (aggressive) {
    insertAlloc.run(aggressive.id, getEtfId.get('VTI')?.id, 50);
    insertAlloc.run(aggressive.id, getEtfId.get('QQQ')?.id, 30);
    insertAlloc.run(aggressive.id, getEtfId.get('VWO')?.id, 10);
    insertAlloc.run(aggressive.id, getEtfId.get('IWM')?.id, 10);
  }

  // All Weather: 30% VTI, 40% TLT, 15% BND, 7.5% GLD, 7.5% commodities (using GLD)
  const allWeather = getModelId.get('All Weather');
  if (allWeather) {
    insertAlloc.run(allWeather.id, getEtfId.get('VTI')?.id, 30);
    insertAlloc.run(allWeather.id, getEtfId.get('TLT')?.id, 40);
    insertAlloc.run(allWeather.id, getEtfId.get('BND')?.id, 15);
    insertAlloc.run(allWeather.id, getEtfId.get('GLD')?.id, 15);
  }

  // Three Fund: 60% VTI, 30% VEA, 10% BND
  const threeFund = getModelId.get('Three Fund');
  if (threeFund) {
    insertAlloc.run(threeFund.id, getEtfId.get('VTI')?.id, 60);
    insertAlloc.run(threeFund.id, getEtfId.get('VEA')?.id, 30);
    insertAlloc.run(threeFund.id, getEtfId.get('BND')?.id, 10);
  }

  // Dividend Income: 50% SCHD, 30% VNQ, 20% BND
  const dividend = getModelId.get('Dividend Income');
  if (dividend) {
    insertAlloc.run(dividend.id, getEtfId.get('SCHD')?.id, 50);
    insertAlloc.run(dividend.id, getEtfId.get('VNQ')?.id, 30);
    insertAlloc.run(dividend.id, getEtfId.get('BND')?.id, 20);
  }

  console.log('✅ Inserted model portfolio allocations');
  console.log('');
  console.log('ETF basket migration complete!');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
