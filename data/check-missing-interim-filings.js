/**
 * Check for Missing Interim Filings
 *
 * Queries filings.xbrl.org API to see if there are H1 2024/2025 interim reports
 * available that we haven't imported yet.
 *
 * Samples top companies from each country to assess the opportunity.
 */

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

console.log('\n=== Check Missing Interim Filings ===\n');

const stats = {
  companiesChecked: 0,
  filingsFound: 0,
  interimFilingsFound: 0,
  alreadyImported: 0,
  missing: 0,
  byCountry: {}
};

/**
 * Get sample companies to check (top 10 per country)
 */
function getSampleCompanies() {
  return db.prepare(`
    SELECT
      c.id,
      c.symbol,
      c.name,
      c.country,
      ci.lei,
      COUNT(DISTINCT xfm.period_end) as periods_count,
      MAX(xfm.period_end) as latest_period
    FROM companies c
    JOIN company_identifiers ci ON c.id = ci.company_id
    LEFT JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
    WHERE c.country IN ('GB', 'DE', 'FR', 'NL', 'DK', 'NO', 'FI', 'SE')
      AND ci.lei IS NOT NULL
      AND LENGTH(ci.lei) = 20
    GROUP BY c.id
    ORDER BY c.country, c.market_cap DESC
  `).all().slice(0, 40); // Sample 40 companies
}

/**
 * Check existing filings in our database for this company
 */
function getExistingFilings(lei) {
  return db.prepare(`
    SELECT filing_hash, period_end, period_start
    FROM xbrl_filings
    WHERE lei = ?
  `).all(lei);
}

/**
 * Query filings.xbrl.org API
 */
function fetchFilingsFromAPI(lei) {
  return new Promise((resolve) => {
    const url = `https://filings.xbrl.org/api/filings?filter[entity_lei]=${lei}&page[size]=50&sort=-period_end`;

    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve(json.data || []);
          } else {
            resolve([]);
          }
        } catch {
          resolve([]);
        }
      });
    }).on('error', () => resolve([])).on('timeout', () => resolve([]));
  });
}

/**
 * Calculate period duration in days
 */
function getPeriodDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * Check if filing is interim (semi-annual or quarterly)
 */
function isInterimFiling(filing) {
  const days = getPeriodDays(filing.attributes.period_start, filing.attributes.period_end);
  if (!days) return false;

  // Semi-annual: 170-195 days
  // Quarterly: 85-95 days
  return (days >= 170 && days <= 195) || (days >= 85 && days <= 95);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check one company
 */
async function checkCompany(company) {
  stats.companiesChecked++;

  // Get existing filings
  const existing = getExistingFilings(company.lei);
  const existingHashes = new Set(existing.map(f => f.filing_hash));

  // Fetch from API
  const apiFilings = await fetchFilingsFromAPI(company.lei);
  stats.filingsFound += apiFilings.length;

  // Check for missing interim filings
  const missingInterim = [];

  for (const filing of apiFilings) {
    const hash = filing.id;
    const periodEnd = filing.attributes.period_end;
    const periodStart = filing.attributes.period_start;
    const days = getPeriodDays(periodStart, periodEnd);

    // Check if it's an interim filing
    if (isInterimFiling(filing)) {
      stats.interimFilingsFound++;

      if (existingHashes.has(hash)) {
        stats.alreadyImported++;
      } else {
        stats.missing++;
        missingInterim.push({
          hash,
          periodEnd,
          periodStart,
          days,
          type: days >= 170 && days <= 195 ? 'semi-annual' : 'quarterly'
        });
      }
    }
  }

  // Track by country
  if (!stats.byCountry[company.country]) {
    stats.byCountry[company.country] = {
      companies: 0,
      interimFound: 0,
      missing: 0
    };
  }
  stats.byCountry[company.country].companies++;
  stats.byCountry[company.country].interimFound += apiFilings.filter(f => isInterimFiling(f)).length;
  stats.byCountry[company.country].missing += missingInterim.length;

  // Log if missing interim filings
  if (missingInterim.length > 0) {
    console.log(`\n📊 ${company.symbol} (${company.name})`);
    console.log(`   Country: ${company.country}, LEI: ${company.lei}`);
    console.log(`   Missing ${missingInterim.length} interim filing(s):`);

    missingInterim.forEach(f => {
      console.log(`   - ${f.type}: ${f.periodStart} to ${f.periodEnd} (${f.days} days)`);
    });
  }

  return missingInterim;
}

/**
 * Main check process
 */
async function checkMissingFilings() {
  const companies = getSampleCompanies();
  console.log(`Checking ${companies.length} sample companies across 8 countries...\n`);

  let allMissing = [];

  for (const company of companies) {
    const missing = await checkCompany(company);
    allMissing = allMissing.concat(missing);

    // Rate limiting
    await sleep(200);
  }

  return allMissing;
}

// Run check
checkMissingFilings().then((missingFilings) => {
  console.log('\n\n=== Summary ===');
  console.log(`Companies checked: ${stats.companiesChecked}`);
  console.log(`Total filings found on API: ${stats.filingsFound}`);
  console.log(`Interim filings found: ${stats.interimFilingsFound}`);
  console.log(`Already imported: ${stats.alreadyImported}`);
  console.log(`Missing from our database: ${stats.missing}`);
  console.log('');

  console.log('=== By Country ===');
  Object.entries(stats.byCountry)
    .sort((a, b) => b[1].missing - a[1].missing)
    .forEach(([country, data]) => {
      console.log(`${country}: ${data.missing} missing interim filings (${data.interimFound} total available, ${data.companies} companies checked)`);
    });
  console.log('');

  if (stats.missing > 0) {
    const extrapolation = Math.round((stats.missing / stats.companiesChecked) * 2088);
    console.log('=== Extrapolation ===');
    console.log(`Based on sample of ${stats.companiesChecked} companies:`);
    console.log(`Estimated total missing interim filings: ~${extrapolation} across all ${2088} EU/UK companies`);
    console.log('');
    console.log('✅ Recommendation: Run bulk import to capture interim filings');
  } else {
    console.log('✅ No missing interim filings found in sample - database is up to date!');
  }
  console.log('');

  db.close();
}).catch((error) => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
