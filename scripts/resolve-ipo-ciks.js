#!/usr/bin/env node
/**
 * Resolve Real CIKs for Backfilled IPOs
 *
 * Looks up real SEC CIKs for IPOs that have placeholder BACKFILL- CIKs.
 * Uses SEC EDGAR company search to find matches by ticker or company name.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/resolve-ipo-ciks.js [--dry-run]
 */

require('dotenv').config();
const https = require('https');
const { getDatabaseAsync, isUsingPostgres } = require('../src/lib/db');

// SEC EDGAR API endpoints
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index?q=';

// Rate limiting for SEC API (10 requests per second max)
const SEC_DELAY_MS = 150;

/**
 * Fetch JSON from URL with proper headers
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Investment Project contact@example.com',
        'Accept': 'application/json'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch SEC company tickers list (maps tickers to CIKs)
 */
async function fetchSECTickers() {
  console.log('Fetching SEC company tickers list...');
  try {
    const data = await fetchJSON(SEC_TICKERS_URL);
    // Convert to lookup by ticker
    const byTicker = {};
    const byName = {};

    for (const [key, company] of Object.entries(data)) {
      const ticker = company.ticker?.toUpperCase();
      const cik = String(company.cik_str).padStart(10, '0');
      const name = company.title?.toUpperCase();

      if (ticker) {
        byTicker[ticker] = { cik, name: company.title };
      }
      if (name) {
        byName[name] = { cik, ticker };
      }
    }

    console.log(`  Loaded ${Object.keys(byTicker).length} tickers`);
    return { byTicker, byName };
  } catch (error) {
    console.error('  Failed to fetch SEC tickers:', error.message);
    return { byTicker: {}, byName: {} };
  }
}

/**
 * Search SEC EDGAR for a company by name
 */
async function searchSECByName(companyName) {
  try {
    // Clean company name for search
    const searchTerm = companyName
      .replace(/[,.'"\-]/g, ' ')
      .replace(/\s+(Inc|Corp|LLC|Ltd|PLC|N\.?V\.?|PBC)\.?$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const url = `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(searchTerm)}"&dateRange=custom&startdt=2024-01-01&enddt=2026-12-31&forms=S-1`;

    const response = await fetchJSON(url);

    if (response.hits?.hits?.length > 0) {
      // Get the first result's CIK
      const hit = response.hits.hits[0];
      const cik = hit._source?.ciks?.[0];
      const name = hit._source?.display_names?.[0];
      if (cik) {
        return { cik: String(cik).padStart(10, '0'), name };
      }
    }
    return null;
  } catch (error) {
    // Silently fail - will try other methods
    return null;
  }
}

/**
 * Search SEC for S-1 filings by company name using EDGAR full-text search
 */
async function searchEDGARFilings(companyName, ticker) {
  try {
    // Try searching for S-1 filings with company name
    const searchTerm = companyName
      .replace(/[,.'"\-]/g, '')
      .replace(/\s+(Inc|Corp|LLC|Ltd|PLC|N\.?V\.?|PBC)\.?$/i, '')
      .trim();

    const url = `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(searchTerm)}"&forms=S-1,S-1/A&dateRange=custom&startdt=2025-01-01&enddt=2026-12-31`;

    const response = await fetchJSON(url);

    if (response.hits?.hits?.length > 0) {
      for (const hit of response.hits.hits) {
        const ciks = hit._source?.ciks;
        const displayName = hit._source?.display_names?.[0] || '';

        // Check if display name matches reasonably
        const nameMatch = displayName.toUpperCase().includes(searchTerm.toUpperCase().split(' ')[0]);

        if (ciks?.length > 0 && nameMatch) {
          return {
            cik: String(ciks[0]).padStart(10, '0'),
            name: displayName,
            confidence: 'medium'
          };
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Main resolution logic
 */
async function resolveIPOCIKs(dryRun = false) {
  console.log('\n========================================');
  console.log('IPO CIK Resolution');
  console.log('========================================\n');

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  const db = await getDatabaseAsync();
  const usePostgres = isUsingPostgres();
  console.log(`Database: ${usePostgres ? 'PostgreSQL' : 'SQLite'}\n`);

  // Get SEC tickers list
  const secData = await fetchSECTickers();

  // Get all IPOs with BACKFILL CIKs
  const query = usePostgres
    ? "SELECT id, cik, company_name, ticker_proposed, ticker_final, status FROM ipo_tracker WHERE cik LIKE 'BACKFILL-%' ORDER BY id"
    : "SELECT id, cik, company_name, ticker_proposed, ticker_final, status FROM ipo_tracker WHERE cik LIKE 'BACKFILL-%' ORDER BY id";

  const result = await db.query(query);
  const backfilledIPOs = result.rows;

  console.log(`Found ${backfilledIPOs.length} IPOs with placeholder CIKs\n`);

  let resolved = 0;
  let notFound = 0;
  const results = [];

  for (const ipo of backfilledIPOs) {
    const ticker = (ipo.ticker_final || ipo.ticker_proposed)?.toUpperCase();
    const companyName = ipo.company_name;

    console.log(`\nProcessing: ${ticker} - ${companyName}`);

    let foundCIK = null;
    let source = null;

    // Method 1: Direct ticker lookup
    if (ticker && secData.byTicker[ticker]) {
      foundCIK = secData.byTicker[ticker].cik;
      source = 'SEC tickers (exact match)';
      console.log(`  Found via ticker: ${foundCIK}`);
    }

    // Method 2: Company name lookup in SEC tickers
    if (!foundCIK && companyName) {
      const upperName = companyName.toUpperCase();
      if (secData.byName[upperName]) {
        foundCIK = secData.byName[upperName].cik;
        source = 'SEC tickers (name match)';
        console.log(`  Found via name: ${foundCIK}`);
      }
    }

    // Method 3: Partial name match in SEC tickers (stricter matching)
    if (!foundCIK && companyName) {
      const searchName = companyName
        .toUpperCase()
        .replace(/[,.'"\-]/g, '')
        .replace(/\s+(INC|CORP|LLC|LTD|PLC|NV|PBC)$/i, '')
        .trim();

      const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);

      for (const [name, data] of Object.entries(secData.byName)) {
        const nameWords = name.split(/\s+/).filter(w => w.length > 2);

        // Require first word to match exactly AND at least 50% of words to match
        if (searchWords[0] === nameWords[0]) {
          const matchingWords = searchWords.filter(w => nameWords.includes(w));
          const matchRatio = matchingWords.length / Math.min(searchWords.length, nameWords.length);

          if (matchRatio >= 0.5 && matchingWords.length >= 2) {
            foundCIK = data.cik;
            source = 'SEC tickers (partial name)';
            console.log(`  Found via partial name match: ${foundCIK} (${name})`);
            break;
          }
        }
      }
    }

    // Method 4: EDGAR full-text search for S-1 filings
    if (!foundCIK) {
      await sleep(SEC_DELAY_MS);
      const edgarResult = await searchEDGARFilings(companyName, ticker);
      if (edgarResult) {
        foundCIK = edgarResult.cik;
        source = `EDGAR S-1 search (${edgarResult.confidence})`;
        console.log(`  Found via EDGAR search: ${foundCIK} (${edgarResult.name})`);
      }
    }

    if (foundCIK) {
      resolved++;
      results.push({
        id: ipo.id,
        ticker,
        company: companyName,
        oldCIK: ipo.cik,
        newCIK: foundCIK,
        source,
        status: 'resolved'
      });

      if (!dryRun) {
        // Update the CIK in database
        const updateQuery = usePostgres
          ? 'UPDATE ipo_tracker SET cik = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
          : 'UPDATE ipo_tracker SET cik = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';

        await db.query(updateQuery, [foundCIK, ipo.id]);
        console.log(`  UPDATED: ${ipo.cik} -> ${foundCIK}`);
      } else {
        console.log(`  WOULD UPDATE: ${ipo.cik} -> ${foundCIK}`);
      }
    } else {
      notFound++;
      results.push({
        id: ipo.id,
        ticker,
        company: companyName,
        oldCIK: ipo.cik,
        newCIK: null,
        source: null,
        status: 'not_found'
      });
      console.log(`  NOT FOUND - keeping placeholder CIK`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total processed: ${backfilledIPOs.length}`);
  console.log(`Resolved: ${resolved}`);
  console.log(`Not found: ${notFound}`);

  if (notFound > 0) {
    console.log('\nIPOs without CIKs (may not have filed S-1 yet):');
    results
      .filter(r => r.status === 'not_found')
      .forEach(r => console.log(`  - ${r.ticker}: ${r.company}`));
  }

  console.log('\n');
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

resolveIPOCIKs(dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
