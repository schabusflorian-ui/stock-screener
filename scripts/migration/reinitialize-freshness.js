/**
 * Reinitialize Freshness Tracking
 *
 * This script reinitializes the company_data_freshness table with data from financial_data
 * Run this after the migration to properly track existing data freshness
 */

const db = require('./src/database').getDatabase();
const UpdateDetector = require('./src/services/updateDetector');

async function reinitializeFreshness() {
  console.log('Reinitializing freshness tracking from financial_data table...\n');

  // Clear existing freshness data
  console.log('Clearing existing freshness data...');
  db.prepare('DELETE FROM company_data_freshness').run();

  // Initialize detector
  const detector = new UpdateDetector(db);

  // Reinitialize
  console.log('Reinitializing...\n');
  const result = await detector.initializeFreshnessTracking((progress) => {
    if (progress.processed % 500 === 0) {
      console.log(`   Processed ${progress.processed}/${progress.total} companies (${progress.percent}%)`);
    }
  });

  console.log(`\n✅ Freshness tracking reinitialized for ${result.companiesProcessed} companies`);

  // Show summary
  const summary = detector.getUpdateSummary();
  console.log('\nSummary:');
  console.log(`  Total companies: ${summary.totalCompanies}`);
  console.log(`  Needing update: ${summary.needingUpdate}`);
  console.log(`  Freshness initialized: ${summary.freshnessInitialized}`);

  // Sample some companies to verify
  const sample = db.prepare(`
    SELECT symbol, cik, latest_filing_date, latest_10k_date, latest_10q_date
    FROM company_data_freshness
    WHERE latest_filing_date IS NOT NULL
    ORDER BY latest_filing_date DESC
    LIMIT 10
  `).all();

  console.log('\nSample of tracked companies (most recent filings):');
  console.table(sample);
}

reinitializeFreshness().catch(console.error);
