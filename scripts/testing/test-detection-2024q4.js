/**
 * Test Update Detection with 2024Q4 Local Data
 *
 * Uses the 2024q4 bulk files we have locally to test
 * the update detection functionality.
 */

const path = require('path');
const fs = require('fs');
const db = require('./src/database').getDatabase();
const QuarterlyUpdater = require('./src/services/quarterlyUpdater');

async function testWith2024Q4() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       TEST UPDATE DETECTION WITH 2024Q4 LOCAL DATA        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const updater = new QuarterlyUpdater(db);

  // Use 2024q4 which we have locally
  const quarter = '2024q4';
  const bulkPath = path.join(process.cwd(), 'data', 'sec-bulk', quarter);
  const subFilePath = path.join(bulkPath, 'sub.txt');

  console.log('Testing with quarter:', quarter);
  console.log('Bulk file path:', subFilePath);
  console.log('File exists:', fs.existsSync(subFilePath), '\n');

  if (!fs.existsSync(subFilePath)) {
    console.log('ERROR: Bulk file not found');
    return;
  }

  console.log('Detecting updates from bulk file...');
  console.log('(This may take a minute)\n');

  const companiesNeedingUpdate = await updater.detector.detectUpdatesFromBulkFile(
    subFilePath,
    (progress) => {
      if (progress.processed % 5000 === 0) {
        console.log(`  Progress: ${progress.processed}/${progress.total} (${progress.percent}%) - Found ${progress.foundSoFar} needing update`);
      }
    }
  );

  console.log('\n✅ Detection complete!');
  console.log(`  Companies needing update: ${companiesNeedingUpdate.length}`);

  if (companiesNeedingUpdate.length > 0) {
    console.log('\nSample of companies needing update (first 10):');
    const sample = companiesNeedingUpdate.slice(0, 10);
    for (const company of sample) {
      console.log(`  - ${company.symbol || company.cik}: ${company.newFilingsCount} new filings (latest in DB: ${company.latestInDb || 'none'})`);
    }

    if (companiesNeedingUpdate.length > 10) {
      console.log(`  ... and ${companiesNeedingUpdate.length - 10} more`);
    }

    // Show filing types breakdown
    const filingTypes = {};
    for (const company of companiesNeedingUpdate) {
      for (const filing of company.newFilings || []) {
        filingTypes[filing.form] = (filingTypes[filing.form] || 0) + 1;
      }
    }
    console.log('\nNew filings by type:');
    const sortedTypes = Object.entries(filingTypes).sort((a,b) => b[1] - a[1]).slice(0, 15);
    for (const [type, count] of sortedTypes) {
      console.log(`  ${type}: ${count}`);
    }
  } else {
    console.log('\n📝 Note: This could mean:');
    console.log('  - All companies are up to date with 2024q4 data');
    console.log('  - The freshness tracking already has the latest dates');
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testWith2024Q4().catch(console.error);
