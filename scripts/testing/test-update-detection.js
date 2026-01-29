/**
 * Test Update Detection
 *
 * Tests the detection phase of quarterly updates by:
 * 1. Checking for new bulk file availability
 * 2. Parsing the bulk file to detect companies with new filings
 * 3. Showing which companies would be updated
 */

const path = require('path');
const fs = require('fs');
const db = require('./src/database').getDatabase();
const QuarterlyUpdater = require('./src/services/quarterlyUpdater');

async function testUpdateDetection() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           TEST UPDATE DETECTION                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const updater = new QuarterlyUpdater(db);

  // 1. Get current quarter
  const currentQuarter = updater.getCurrentQuarter();
  console.log(`Current quarter: ${currentQuarter}`);
  console.log(`Next quarter: ${updater.getNextQuarter()}\n`);

  // 2. Check if bulk file is available
  console.log('Checking bulk file availability...');
  const isAvailable = await updater.checkBulkFileAvailable(currentQuarter);
  console.log(`${currentQuarter} bulk file available: ${isAvailable}\n`);

  // 3. Check data freshness summary
  console.log('Data freshness summary:');
  const summary = updater.detector.getUpdateSummary();
  console.log(`  Total companies tracked: ${summary.totalCompanies}`);
  console.log(`  Companies needing update: ${summary.needingUpdate}`);
  console.log(`  Freshness initialized: ${summary.freshnessInitialized}\n`);

  // 4. Check if we have the bulk files locally
  const bulkPath = path.join(process.cwd(), 'data', 'sec-bulk', currentQuarter);
  const hasLocalFiles = fs.existsSync(path.join(bulkPath, 'sub.txt'));
  console.log(`Local bulk files for ${currentQuarter}: ${hasLocalFiles ? 'Yes' : 'No'}`);

  if (hasLocalFiles) {
    // 5. Parse submissions to detect updates
    console.log(`\nDetecting updates from ${currentQuarter} bulk file...`);
    console.log('(This may take a minute)\n');

    const companiesNeedingUpdate = await updater.detector.detectUpdatesFromBulkFile(
      path.join(bulkPath, 'sub.txt'),
      (progress) => {
        if (progress.processed % 1000 === 0) {
          console.log(`  Progress: ${progress.processed}/${progress.total} (${progress.percent}%) - Found ${progress.foundSoFar} needing update`);
        }
      }
    );

    console.log(`\n✅ Detection complete!`);
    console.log(`  Companies in bulk file: ${companiesNeedingUpdate.length > 0 ? 'many' : '0'}`);
    console.log(`  Companies needing update: ${companiesNeedingUpdate.length}`);

    if (companiesNeedingUpdate.length > 0) {
      console.log(`\nSample of companies needing update (first 10):`);
      const sample = companiesNeedingUpdate.slice(0, 10);
      for (const company of sample) {
        console.log(`  - ${company.symbol || company.cik}: ${company.newFilingsCount} new filings (latest in DB: ${company.latestInDb || 'none'})`);
      }

      if (companiesNeedingUpdate.length > 10) {
        console.log(`  ... and ${companiesNeedingUpdate.length - 10} more`);
      }
    }

    // 6. Show filing types breakdown
    if (companiesNeedingUpdate.length > 0) {
      const filingTypes = {};
      for (const company of companiesNeedingUpdate) {
        for (const filing of company.newFilings || []) {
          filingTypes[filing.form] = (filingTypes[filing.form] || 0) + 1;
        }
      }
      console.log(`\nNew filings by type:`);
      for (const [type, count] of Object.entries(filingTypes)) {
        console.log(`  ${type}: ${count}`);
      }
    }
  } else {
    console.log(`\nNo local bulk files found for ${currentQuarter}.`);
    console.log('To download, run the quarterly update via the frontend or API.');

    // Try an older quarter that we have
    const availableQuarters = fs.readdirSync(path.join(process.cwd(), 'data', 'sec-bulk'))
      .filter(d => d.match(/^\d{4}q\d$/))
      .sort()
      .reverse();

    if (availableQuarters.length > 0) {
      const latestLocal = availableQuarters[0];
      console.log(`\nLatest local quarter available: ${latestLocal}`);
      console.log(`You could run update detection against ${latestLocal} to test.`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testUpdateDetection().catch(console.error);
