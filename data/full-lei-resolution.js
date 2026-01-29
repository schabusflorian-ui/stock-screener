/**
 * Full LEI Resolution Script
 *
 * Uses the SymbolResolver to run GLEIF → ISIN → OpenFIGI pipeline
 * on all pending companies that have LEIs.
 */

const Database = require('better-sqlite3');
const path = require('path');
const { SymbolResolver } = require('../src/services/identifiers/symbolResolver');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Initialize SymbolResolver
const resolver = new SymbolResolver(db);

// Get all pending companies with LEIs
const pendingCompanies = db.prepare(`
  SELECT id, legal_name, lei, country
  FROM company_identifiers
  WHERE lei IS NOT NULL AND lei != ''
  AND (ticker IS NULL OR ticker = '')
  AND link_status = 'pending'
  ORDER BY country, legal_name
`).all();

console.log(`Found ${pendingCompanies.length} pending companies with LEIs`);

// Update statement
const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, figi = ?, link_status = 'linked'
  WHERE id = ?
`);

// Mark as no_symbol if resolution fails
const markNoSymbol = db.prepare(`
  UPDATE company_identifiers
  SET link_status = 'no_symbol'
  WHERE id = ?
`);

// Process in batches
const BATCH_SIZE = 20;
let resolved = 0;
let failed = 0;

async function processBatch(companies) {
  for (const company of companies) {
    try {
      console.log(`  Processing: ${company.legal_name} (${company.lei.substring(0, 8)}...)`);

      const result = await resolver.resolveFromLEI(company.lei);

      if (result && result.primaryListing) {
        const primary = result.primaryListing;
        console.log(`    ✓ Found: ${primary.ticker} (${primary.yahooSymbol})`);

        updateStmt.run(
          primary.ticker,
          primary.yahooSymbol,
          primary.figi || null,
          company.id
        );
        resolved++;
      } else if (result && result.listings && result.listings.length > 0) {
        // Use first listing if no primary
        const listing = result.listings[0];
        console.log(`    ✓ Found (alt): ${listing.ticker} (${listing.yahooSymbol})`);

        updateStmt.run(
          listing.ticker,
          listing.yahooSymbol,
          listing.figi || null,
          company.id
        );
        resolved++;
      } else {
        console.log(`    ✗ No listings found`);
        // Don't mark as no_symbol yet - might be private company
        failed++;
      }

      // Rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));

    } catch (error) {
      console.log(`    ✗ Error: ${error.message}`);
      failed++;
    }
  }
}

async function main() {
  console.log('\n=== Full LEI Resolution ===\n');

  const startTime = Date.now();

  for (let i = 0; i < pendingCompanies.length; i += BATCH_SIZE) {
    const batch = pendingCompanies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pendingCompanies.length / BATCH_SIZE);

    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} companies)`);

    await processBatch(batch);

    // Progress report
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (i + batch.length) / elapsed;
    const remaining = pendingCompanies.length - (i + batch.length);
    const eta = remaining / rate;

    console.log(`\nProgress: ${i + batch.length}/${pendingCompanies.length} | Resolved: ${resolved} | Failed: ${failed} | ETA: ${Math.round(eta)}s`);

    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < pendingCompanies.length) {
      console.log('Pausing 2s before next batch...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n=== Final Results ===');
  console.log(`Resolved: ${resolved}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${pendingCompanies.length}`);

  // Show updated stats
  const stats = db.prepare(`
    SELECT link_status, COUNT(*) as count
    FROM company_identifiers
    GROUP BY link_status
    ORDER BY count DESC
  `).all();

  console.log('\n=== Database Status ===');
  stats.forEach(s => console.log(`  ${s.link_status}: ${s.count}`));
}

main().catch(console.error);
