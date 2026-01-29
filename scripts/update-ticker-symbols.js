/**
 * Update company symbols from CIK_XXXXXXX to real ticker symbols
 * using SEC's company_tickers.json mapping
 */

const https = require('https');
const db = require('../src/database');

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

async function fetchSecTickers() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'InvestmentProject/1.0 (contact@example.com)'
      }
    };

    https.get(SEC_TICKERS_URL, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function updateTickerSymbols() {
  const database = db.getDatabase();

  console.log('Fetching SEC ticker mappings...');
  const tickerData = await fetchSecTickers();

  // Build CIK -> ticker mapping (pad CIK to 10 digits)
  const cikToTicker = {};
  for (const entry of Object.values(tickerData)) {
    const paddedCik = String(entry.cik_str).padStart(10, '0');
    cikToTicker[paddedCik] = {
      ticker: entry.ticker,
      name: entry.title
    };
  }

  console.log(`Loaded ${Object.keys(cikToTicker).length} ticker mappings`);

  // Get all companies with CIK_ symbols
  const cikCompanies = database.prepare(`
    SELECT id, symbol, name, cik
    FROM companies
    WHERE symbol LIKE 'CIK_%'
  `).all();

  console.log(`Found ${cikCompanies.length} companies with CIK symbols`);

  // Check for existing symbols to avoid conflicts
  const existingSymbols = new Set(
    database.prepare(`SELECT symbol FROM companies WHERE symbol NOT LIKE 'CIK_%'`).all().map(r => r.symbol)
  );

  const updateStmt = database.prepare(`
    UPDATE companies
    SET symbol = ?, name = COALESCE(?, name)
    WHERE id = ?
  `);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  const transaction = database.transaction(() => {
    for (const company of cikCompanies) {
      // Extract CIK from symbol (CIK_0001234567 -> 0001234567)
      const cik = company.symbol.replace('CIK_', '');

      const mapping = cikToTicker[cik];

      if (!mapping) {
        notFound++;
        continue;
      }

      // Check if ticker already exists
      if (existingSymbols.has(mapping.ticker)) {
        skipped++;
        continue;
      }

      // Update the symbol
      updateStmt.run(mapping.ticker, mapping.name, company.id);
      existingSymbols.add(mapping.ticker);
      updated++;

      if (updated % 1000 === 0) {
        console.log(`  Updated ${updated} companies...`);
      }
    }
  });

  transaction();

  console.log('\n=== Summary ===');
  console.log(`Updated: ${updated} companies`);
  console.log(`Skipped (duplicate ticker): ${skipped}`);
  console.log(`Not found in SEC mapping: ${notFound}`);

  // Show remaining CIK companies
  const remaining = database.prepare(`
    SELECT COUNT(*) as count FROM companies WHERE symbol LIKE 'CIK_%'
  `).get();
  console.log(`Remaining CIK symbols: ${remaining.count}`);

  // Show sample of updated companies
  console.log('\nSample updated companies:');
  const samples = database.prepare(`
    SELECT symbol, name, sector
    FROM companies
    WHERE symbol NOT LIKE 'CIK_%'
    ORDER BY RANDOM()
    LIMIT 10
  `).all();

  for (const s of samples) {
    console.log(`  ${s.symbol}: ${s.name} (${s.sector || 'N/A'})`);
  }
}

updateTickerSymbols()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
