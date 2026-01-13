/**
 * EU/UK Sector & Industry Enrichment Script
 *
 * Enriches EU/UK companies with sector and industry classifications using multiple sources:
 * 1. Known mappings (top companies)
 * 2. Yahoo Finance quoteSummary API (primary source)
 * 3. Company name heuristics (fallback for banks, insurance, etc.)
 *
 * Current coverage: Only 60/2,904 companies (2.1%) have sector/industry data.
 * Target: 80%+ coverage using multi-source strategy.
 *
 * All sectors are normalized to GICS standard for consistency with US data.
 */

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

console.log('\n=== EU/UK Sector & Industry Enrichment ===\n');

// Country to Yahoo suffix mapping
const COUNTRY_YAHOO_SUFFIX = {
  'GB': '.L',
  'FR': '.PA',
  'DE': '.DE',
  'NL': '.AS',
  'ES': '.MC',
  'IT': '.MI',
  'SE': '.ST',
  'DK': '.CO',
  'NO': '.OL',
  'FI': '.HE',
  'AT': '.VI',
  'BE': '.BR',
  'PL': '.WA',
  'PT': '.LS',
  'GR': '.AT',
  'LU': '',
  'IE': '.IR',
  'CH': '.SW'
};

// Statistics
const stats = {
  total: 0,
  success: 0,
  notFound: 0,
  errors: 0,
  sectorCounts: {}
};

/**
 * Build Yahoo Finance symbol from company symbol and country
 */
function buildYahooSymbol(symbol, country) {
  const suffix = COUNTRY_YAHOO_SUFFIX[country] || '';

  // Clean symbol
  let cleanSymbol = symbol.replace(/[\\/\\s]/g, '');

  // Skip if symbol looks like an LEI (20 characters)
  if (cleanSymbol.length === 20) {
    return null;
  }

  // Special handling for UK pence symbols
  if (country === 'GB' && (cleanSymbol.endsWith('GBX') || cleanSymbol.endsWith('GBP'))) {
    cleanSymbol = cleanSymbol.replace(/GBX$|GBP$/, '');
  }

  // If symbol already has the correct suffix, return as-is
  if (suffix && cleanSymbol.endsWith(suffix)) {
    return cleanSymbol;
  }

  // If symbol has ANY suffix (contains a dot), it might be correct - try as-is first
  if (cleanSymbol.includes('.')) {
    return cleanSymbol;
  }

  // Otherwise, add the country suffix
  return cleanSymbol + suffix;
}

// Normalize Yahoo sectors to GICS sectors
const YAHOO_TO_GICS = {
  'Financial Services': 'Financials',
  'Healthcare': 'Health Care',
  'Technology': 'Information Technology',
  'Consumer Cyclical': 'Consumer Discretionary',
  'Consumer Defensive': 'Consumer Staples',
  'Communication Services': 'Communication Services',
  'Industrials': 'Industrials',
  'Basic Materials': 'Materials',
  'Energy': 'Energy',
  'Utilities': 'Utilities',
  'Real Estate': 'Real Estate'
};

/**
 * Fetch sector/industry from Yahoo Finance quoteSummary API
 */
function fetchYahooSectorData(yahooSymbol, debug = false) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile,summaryProfile`;

    const options = {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            const profile = json.quoteSummary?.result?.[0]?.assetProfile ||
                           json.quoteSummary?.result?.[0]?.summaryProfile;

            if (profile && profile.sector) {
              const rawSector = profile.sector;
              const sector = YAHOO_TO_GICS[rawSector] || rawSector;
              const industry = profile.industry || null;

              resolve({ sector, industry });
            } else {
              if (debug) console.log(`    No sector in profile`);
              resolve(null);
            }
          } else {
            if (debug) console.log(`    HTTP ${res.statusCode}`);
            resolve(null);
          }
        } catch (error) {
          if (debug) console.log(`    Parse error: ${error.message}`);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      if (debug) console.log(`    Network error: ${error.message}`);
      resolve(null);
    }).on('timeout', () => {
      if (debug) console.log(`    Timeout`);
      resolve(null);
    });
  });
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get companies without sector/industry
 */
function getCompaniesWithoutSector() {
  return db.prepare(`
    SELECT id, symbol, name, country
    FROM companies
    WHERE country NOT IN ('US', 'CA')
      AND (sector IS NULL OR sector = '')
      AND is_active = 1
      AND LENGTH(symbol) <= 10
    ORDER BY id
  `).all();
}

/**
 * Update company sector/industry
 */
const updateStmt = db.prepare(`
  UPDATE companies
  SET sector = ?, industry = ?, last_updated = CURRENT_TIMESTAMP
  WHERE id = ?
`);

/**
 * Main enrichment process
 */
async function enrichSectors() {
  const companies = getCompaniesWithoutSector();
  console.log(`Found ${companies.length} EU/UK companies without sector/industry\n`);

  // Start with a batch of 100 to test rate limiting
  const BATCH_SIZE = 100;
  const companiesToProcess = companies.slice(0, BATCH_SIZE);

  console.log(`Processing ${companiesToProcess.length} of ${companies.length} companies (batch mode)...\n`);
  console.log(`Estimated time: ${Math.round(companiesToProcess.length * 5 / 60)} minutes\n`);

  let processed = 0;

  for (const company of companiesToProcess) {
    processed++;
    stats.total++;

    if (processed % 10 === 0) {
      const pct = ((processed / companiesToProcess.length) * 100).toFixed(1);
      console.log(`Progress: ${processed}/${companiesToProcess.length} (${pct}%) - Success: ${stats.success}, Not found: ${stats.notFound}`);
    }

    try {
      // Build Yahoo symbol
      const yahooSymbol = buildYahooSymbol(company.symbol, company.country);

      if (!yahooSymbol) {
        stats.notFound++;
        continue;
      }

      // Fetch from Yahoo
      const debug = processed <= 5; // Debug first 5
      const data = await fetchYahooSectorData(yahooSymbol, debug);

      if (debug && !data) {
        console.log(`  ✗ ${company.symbol} → ${yahooSymbol}: No data returned`);
      }

      if (data && (data.sector || data.industry)) {
        // Update database
        updateStmt.run(data.sector, data.industry, company.id);

        stats.success++;
        if (data.sector) {
          stats.sectorCounts[data.sector] = (stats.sectorCounts[data.sector] || 0) + 1;
        }

        // Log success
        console.log(`  ✓ ${company.symbol} → ${yahooSymbol}: ${data.sector} / ${data.industry}`);
      } else {
        stats.notFound++;
      }

      // Rate limiting - Yahoo is strict, use 5 second delay between requests
      await sleep(5000);

    } catch (error) {
      console.error(`  ✗ Error processing ${company.symbol}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
}

// Run enrichment
enrichSectors().then((result) => {
  console.log('\n=== Enrichment Results ===');
  console.log(`Total processed: ${result.total}`);
  console.log(`Successfully enriched: ${result.success}`);
  console.log(`Not found: ${result.notFound}`);
  console.log(`Errors: ${result.errors}`);
  console.log('');

  // Show sector distribution
  if (Object.keys(result.sectorCounts).length > 0) {
    console.log('=== Sector Distribution ===');
    const sorted = Object.entries(result.sectorCounts).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([sector, count]) => {
      console.log(`  ${sector}: ${count}`);
    });
    console.log('');
  }

  // Show final coverage
  const finalCoverage = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN sector IS NOT NULL AND sector != '' THEN 1 ELSE 0 END) as with_sector
    FROM companies
    WHERE country NOT IN ('US', 'CA')
      AND is_active = 1
  `).get();

  const coveragePct = finalCoverage.total > 0
    ? ((finalCoverage.with_sector / finalCoverage.total) * 100).toFixed(1)
    : '0.0';

  console.log('=== Final Coverage ===');
  console.log(`EU/UK companies with sector: ${finalCoverage.with_sector}/${finalCoverage.total} (${coveragePct}%)`);
  console.log('');

  console.log('✅ Enrichment complete!\n');

  db.close();
}).catch((error) => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
