// scripts/preload-etf-holdings.js
// Pre-populate ETF holdings with static data (fallback when Yahoo Finance rate limits)

const db = require('../src/database').getDatabase();

const staticHoldings = {
  'SPY': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight: 7.2 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.8 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.4 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 3.2 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 2.1 },
    { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.8 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.4 },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.7 },
    { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.9 },
    { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.3 },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.2 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.1 },
    { symbol: 'V', name: 'Visa Inc.', weight: 1.0 },
    { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 1.0 },
    { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.9 }
  ],
  'QQQ': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight: 11.5 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 10.2 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 5.8 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 5.1 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight: 4.2 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 3.5 },
    { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 3.3 },
    { symbol: 'TSLA', name: 'Tesla Inc.', weight: 3.0 },
    { symbol: 'AVGO', name: 'Broadcom Inc.', weight: 2.8 },
    { symbol: 'COST', name: 'Costco Wholesale Corp.', weight: 2.5 },
    { symbol: 'ADBE', name: 'Adobe Inc.', weight: 2.0 },
    { symbol: 'PEP', name: 'PepsiCo Inc.', weight: 1.8 },
    { symbol: 'CSCO', name: 'Cisco Systems Inc.', weight: 1.7 },
    { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', weight: 1.6 },
    { symbol: 'NFLX', name: 'Netflix Inc.', weight: 1.5 }
  ],
  'VTI': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight: 6.5 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.1 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.0 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 2.9 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 1.9 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.1 },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.5 },
    { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.7 },
    { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.2 },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.1 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.0 },
    { symbol: 'V', name: 'Visa Inc.', weight: 0.9 },
    { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 0.9 },
    { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.8 },
    { symbol: 'MA', name: 'Mastercard Inc.', weight: 0.8 }
  ],
  'VOO': [
    { symbol: 'AAPL', name: 'Apple Inc.', weight: 7.2 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.8 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.4 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 3.2 },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 2.1 },
    { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.8 },
    { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.4 },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.7 },
    { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.9 },
    { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.3 },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.2 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.1 },
    { symbol: 'V', name: 'Visa Inc.', weight: 1.0 },
    { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 1.0 },
    { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.9 }
  ],
  'BND': [
    { symbol: null, name: 'U.S. Treasury Bonds', weight: 45.0 },
    { symbol: null, name: 'Government-Related Bonds', weight: 6.0 },
    { symbol: null, name: 'Corporate Bonds', weight: 25.0 },
    { symbol: null, name: 'Securitized Bonds', weight: 22.0 },
    { symbol: null, name: 'Other Bonds', weight: 2.0 }
  ],
  'AGG': [
    { symbol: null, name: 'U.S. Treasury Bonds', weight: 42.0 },
    { symbol: null, name: 'Government-Related Bonds', weight: 5.0 },
    { symbol: null, name: 'Corporate Bonds', weight: 27.0 },
    { symbol: null, name: 'Securitized Bonds', weight: 24.0 },
    { symbol: null, name: 'Other Bonds', weight: 2.0 }
  ],
  'IWM': [
    { symbol: 'SMCI', name: 'Super Micro Computer Inc.', weight: 0.8 },
    { symbol: 'MSTR', name: 'MicroStrategy Inc.', weight: 0.7 },
    { symbol: 'FTNT', name: 'Fortinet Inc.', weight: 0.5 },
    { symbol: 'RCL', name: 'Royal Caribbean Cruises', weight: 0.5 },
    { symbol: 'DECK', name: 'Deckers Outdoor Corp.', weight: 0.5 },
    { symbol: 'TOST', name: 'Toast Inc.', weight: 0.4 },
    { symbol: 'FIX', name: 'Comfort Systems USA', weight: 0.4 },
    { symbol: 'WING', name: 'Wingstop Inc.', weight: 0.4 },
    { symbol: 'WSM', name: 'Williams-Sonoma Inc.', weight: 0.4 },
    { symbol: 'EME', name: 'EMCOR Group Inc.', weight: 0.4 }
  ],
  'VEA': [
    { symbol: null, name: 'Nestlé SA', weight: 1.8 },
    { symbol: null, name: 'ASML Holding NV', weight: 1.7 },
    { symbol: null, name: 'Novo Nordisk A/S', weight: 1.6 },
    { symbol: null, name: 'Samsung Electronics', weight: 1.5 },
    { symbol: null, name: 'LVMH', weight: 1.3 },
    { symbol: null, name: 'Toyota Motor Corp', weight: 1.2 },
    { symbol: null, name: 'AstraZeneca PLC', weight: 1.1 },
    { symbol: null, name: 'Shell PLC', weight: 1.0 },
    { symbol: null, name: 'SAP SE', weight: 0.9 },
    { symbol: null, name: 'Roche Holding AG', weight: 0.9 }
  ],
  'VWO': [
    { symbol: null, name: 'Taiwan Semiconductor', weight: 6.5 },
    { symbol: null, name: 'Tencent Holdings', weight: 3.8 },
    { symbol: null, name: 'Alibaba Group', weight: 2.1 },
    { symbol: null, name: 'Reliance Industries', weight: 1.5 },
    { symbol: null, name: 'Meituan', weight: 1.2 },
    { symbol: null, name: 'China Construction Bank', weight: 1.0 },
    { symbol: null, name: 'ICICI Bank', weight: 0.9 },
    { symbol: null, name: 'Infosys', weight: 0.8 },
    { symbol: null, name: 'Vale SA', weight: 0.8 },
    { symbol: null, name: 'JD.com', weight: 0.7 }
  ]
};

function preloadHoldings() {
  const insertStmt = db.prepare(`
    INSERT INTO etf_holdings (etf_id, symbol, security_name, weight, company_id, as_of_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const getCompanyId = db.prepare('SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE');

  let totalInserted = 0;

  for (const [etfSymbol, holdings] of Object.entries(staticHoldings)) {
    // Get ETF ID
    const etf = db.prepare('SELECT id FROM etf_definitions WHERE symbol = ?').get(etfSymbol);
    if (!etf) {
      console.log(`ETF ${etfSymbol} not found in database, skipping...`);
      continue;
    }

    // Delete existing holdings
    db.prepare('DELETE FROM etf_holdings WHERE etf_id = ?').run(etf.id);

    // Insert new holdings
    for (const holding of holdings) {
      const company = holding.symbol ? getCompanyId.get(holding.symbol) : null;
      insertStmt.run(
        etf.id,
        holding.symbol || 'BOND',
        holding.name,
        holding.weight,
        company?.id || null,
        new Date().toISOString().split('T')[0]
      );
      totalInserted++;
    }

    // Update last_holdings_update
    db.prepare('UPDATE etf_definitions SET last_holdings_update = CURRENT_TIMESTAMP WHERE id = ?').run(etf.id);

    console.log(`✓ ${etfSymbol}: ${holdings.length} holdings inserted`);
  }

  console.log(`\nTotal holdings inserted: ${totalInserted}`);

  // Verify
  const count = db.prepare('SELECT COUNT(*) as cnt FROM etf_holdings').get();
  console.log('Total holdings in DB:', count.cnt);
}

preloadHoldings();
