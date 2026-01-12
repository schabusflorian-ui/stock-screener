/**
 * LEI → ISIN Resolution Script
 *
 * Focuses on the GLEIF ISIN mapping path only (no OpenFIGI search fallback).
 * This is more reliable and has separate rate limits.
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Get pending companies with LEIs
const pendingCompanies = db.prepare(`
  SELECT id, legal_name, lei, country
  FROM company_identifiers
  WHERE lei IS NOT NULL AND lei != ''
  AND (ticker IS NULL OR ticker = '')
  AND link_status = 'pending'
  ORDER BY country, legal_name
`).all();

console.log(`Found ${pendingCompanies.length} pending companies with LEIs`);

// Update statements
const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, figi = ?, isin = ?, link_status = 'linked'
  WHERE id = ?
`);

// Exchange mapping for Yahoo symbols
const EXCHANGE_SUFFIX = {
  'XBRU': '.BR',
  'XPAR': '.PA',
  'XAMS': '.AS',
  'XETR': '.DE',
  'XFRA': '.F',
  'XLON': '.L',
  'XMIL': '.MI',
  'XMAD': '.MC',
  'XLIS': '.LS',
  'XWBO': '.VI',
  'XHEL': '.HE',
  'XCSE': '.CO',
  'XOSL': '.OL',
  'XSTO': '.ST',
  'XSWX': '.SW',
  'XDUB': '.IR',
  'XWAR': '.WA',
  'XATH': '.AT',
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getIsinMappings(lei) {
  const url = `https://api.gleif.org/api/v1/lei-records/${lei}/isins`;
  const data = await fetch(url);
  return data.data || [];
}

async function resolveIsinViaFigi(isin) {
  const url = 'https://api.openfigi.com/v3/mapping';

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]);

    const options = {
      hostname: 'api.openfigi.com',
      path: '/v3/mapping',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            if (result[0] && result[0].data) {
              resolve(result[0].data);
            } else {
              resolve([]);
            }
          } catch {
            resolve([]);
          }
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited'));
        } else {
          resolve([]);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

let resolved = 0;
let noIsin = 0;
let errors = 0;

async function processCompany(company) {
  try {
    console.log(`  ${company.legal_name.substring(0, 40)}...`);

    // Step 1: Get ISIN mappings from GLEIF
    const isinMappings = await getIsinMappings(company.lei);

    if (isinMappings.length === 0) {
      console.log(`    → No ISINs`);
      noIsin++;
      return;
    }

    // Step 2: For each ISIN, try to resolve via OpenFIGI
    for (const isinData of isinMappings) {
      const isin = isinData.attributes?.isin;
      if (!isin) continue;

      console.log(`    → Trying ISIN: ${isin}`);

      await new Promise(r => setTimeout(r, 500)); // Rate limit

      try {
        const figiResults = await resolveIsinViaFigi(isin);

        // Filter for equity securities
        const equities = figiResults.filter(r =>
          r.securityType2 === 'Common Stock' ||
          r.securityType === 'Common Stock' ||
          r.marketSector === 'Equity'
        );

        if (equities.length > 0) {
          const primary = equities[0];
          const suffix = EXCHANGE_SUFFIX[primary.exchCode] || '';
          const yahooSymbol = primary.ticker + suffix;

          console.log(`    ✓ Found: ${primary.ticker} (${yahooSymbol})`);

          updateStmt.run(
            primary.ticker,
            yahooSymbol,
            primary.figi || null,
            isin,
            company.id
          );
          resolved++;
          return;
        }
      } catch (e) {
        if (e.message === 'Rate limited') {
          console.log(`    ⚠ Rate limited, waiting 60s...`);
          await new Promise(r => setTimeout(r, 60000));
          // Retry once
          try {
            const figiResults = await resolveIsinViaFigi(isin);
            const equities = figiResults.filter(r => r.marketSector === 'Equity');
            if (equities.length > 0) {
              const primary = equities[0];
              const suffix = EXCHANGE_SUFFIX[primary.exchCode] || '';
              updateStmt.run(primary.ticker, primary.ticker + suffix, primary.figi, isin, company.id);
              resolved++;
              return;
            }
          } catch {}
        }
      }
    }

    console.log(`    → No equity listings found`);
    noIsin++;

  } catch (e) {
    console.log(`    ✗ Error: ${e.message}`);
    errors++;
  }
}

async function main() {
  console.log('\n=== LEI → ISIN Resolution ===\n');

  const BATCH_SIZE = 10;
  const startTime = Date.now();

  for (let i = 0; i < pendingCompanies.length; i += BATCH_SIZE) {
    const batch = pendingCompanies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pendingCompanies.length / BATCH_SIZE);

    console.log(`\nBatch ${batchNum}/${totalBatches}`);

    for (const company of batch) {
      await processCompany(company);
      await new Promise(r => setTimeout(r, 300)); // GLEIF rate limit
    }

    const progress = i + batch.length;
    console.log(`\nProgress: ${progress}/${pendingCompanies.length} | Resolved: ${resolved} | No ISIN: ${noIsin} | Errors: ${errors}`);

    // Pause between batches
    if (i + BATCH_SIZE < pendingCompanies.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n=== Final Results ===');
  console.log(`Resolved: ${resolved}`);
  console.log(`No ISIN found: ${noIsin}`);
  console.log(`Errors: ${errors}`);

  // Show updated stats
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM company_identifiers WHERE ticker IS NOT NULL AND ticker != '') as with_ticker,
      (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'pending') as pending,
      (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'no_symbol') as no_symbol
  `).get();

  console.log('\n=== Database Status ===');
  console.log(`With ticker: ${stats.with_ticker}`);
  console.log(`Pending: ${stats.pending}`);
  console.log(`No symbol: ${stats.no_symbol}`);
}

main().catch(console.error);
