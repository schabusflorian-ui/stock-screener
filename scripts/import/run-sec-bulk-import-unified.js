#!/usr/bin/env node
// run-sec-bulk-import-unified.js

/**
 * SEC Bulk Import CLI - UNIFIED VERSION
 *
 * Imports bulk data into existing financial_data table
 * No separate line items table - everything in one place!
 */

const SECBulkDownloader = require('./src/bulk-import/downloadSECBulk');
const SECBulkImporterUnified = require('./src/bulk-import/importSECBulkUnified');
const SECImportVerifier = require('./src/bulk-import/verifySECImport');
const { runMigration } = require('./src/database-migrations/add-bulk-import-tables');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  const options = {
    startYear: 2009,
    endYear: 2024,
    downloadOnly: false,
    importOnly: false,
    verify: false,
    skipDownload: false,
    skipImport: false,
    skipVerify: false,
    force: false,
    limit: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--start':
        options.startYear = parseInt(args[++i]);
        break;
      case '--end':
        options.endYear = parseInt(args[++i]);
        break;
      case '--download-only':
        options.downloadOnly = true;
        break;
      case '--import-only':
        options.importOnly = true;
        options.skipDownload = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      case '--skip-download':
        options.skipDownload = true;
        break;
      case '--skip-import':
        options.skipImport = true;
        break;
      case '--skip-verify':
        options.skipVerify = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     SEC BULK IMPORT - UNIFIED (Single Table Version)      ║
╚════════════════════════════════════════════════════════════╝

Import historical financial data into your EXISTING financial_data table.
All new data is added alongside your current 54 companies.

USAGE:
  node run-sec-bulk-import-unified.js [options]

OPTIONS:
  --start YEAR       Start year (default: 2009)
  --end YEAR         End year (default: 2024)

  --download-only    Only download files, don't import
  --import-only      Only import (skip download)
  --verify           Run verification after import

  --skip-download    Skip download step
  --skip-import      Skip import step
  --skip-verify      Skip verification step

  --force            Force re-download/re-import
  --limit N          Limit records per quarter (for testing)

  --help, -h         Show this help

EXAMPLES:

  Test with recent data:
    node run-sec-bulk-import-unified.js --start 2023 --end 2024

  Full historical import:
    node run-sec-bulk-import-unified.js

  Import with verification:
    node run-sec-bulk-import-unified.js --start 2023 --verify

KEY BENEFITS:

  ✅ Everything in ONE table (financial_data)
  ✅ Works with existing metrics calculation
  ✅ New data just adds more records
  ✅ No duplicate structures
  ✅ Seamless integration

WHAT HAPPENS:

  1. Downloads SEC quarterly files (if needed)
  2. Groups line items into complete financial statements
  3. Inserts into financial_data table (balance_sheet, income_statement, cash_flow)
  4. Deduplicates automatically (keeps latest filing)
  5. Your existing 54 companies get historical data!
  6. Thousands of new companies added!

AFTER IMPORT:

  - Your current data: INTACT
  - New historical data: ADDED
  - Total companies: ~10,000-15,000
  - Total statements: ~500,000-1,000,000
  - Ready for metrics calculation!

For more information, see SEC_BULK_IMPORT_README.md
`);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║     SEC BULK IMPORT - UNIFIED (Single Table Version)      ║
╚════════════════════════════════════════════════════════════╝
  `);

  console.log(`📅 Date range: Q1 ${options.startYear} - Q4 ${options.endYear}`);
  console.log(`🎯 Target: financial_data table (unified approach)`);
  console.log(`⚙️  Options:`, {
    downloadOnly: options.downloadOnly,
    importOnly: options.importOnly,
    verify: options.verify,
    force: options.force,
    limit: options.limit || 'none'
  });
  console.log('');

  const totalStartTime = Date.now();

  try {
    // ========================================
    // Step 0: Database Migration
    // ========================================
    if (!options.importOnly && !options.downloadOnly) {
      console.log('📦 Step 0: Database Migration');
      console.log('='.repeat(60));
      runMigration();
    }

    // ========================================
    // Step 1: Download
    // ========================================
    if (!options.skipDownload && !options.importOnly) {
      console.log('\n📥 Step 1: Download SEC Bulk Files');
      console.log('='.repeat(60));

      const downloader = new SECBulkDownloader();
      const downloadResults = await downloader.downloadRange(
        options.startYear,
        options.endYear,
        { force: options.force }
      );

      if (downloadResults.failed > 0) {
        console.warn(`\n⚠️  Warning: ${downloadResults.failed} downloads failed`);
      }

      if (options.downloadOnly) {
        console.log('\n✅ Download complete! Use --import-only to import the data.\n');
        process.exit(0);
      }
    }

    // ========================================
    // Step 2: Import (UNIFIED VERSION)
    // ========================================
    if (!options.skipImport) {
      console.log('\n📊 Step 2: Import Data (Unified Approach)');
      console.log('='.repeat(60));

      const importer = new SECBulkImporterUnified();
      const importResults = await importer.importAll(
        options.startYear,
        options.endYear,
        { limit: options.limit }
      );

      if (importResults.failed > 0) {
        console.warn(`\n⚠️  Warning: ${importResults.failed} quarters failed to import`);
      }
    }

    // ========================================
    // Step 3: Verification
    // ========================================
    if (options.verify && !options.skipVerify) {
      console.log('\n🔍 Step 3: Verification');
      console.log('='.repeat(60));

      const verifier = new SECImportVerifier();
      verifier.runFullVerification();
    }

    // ========================================
    // Complete
    // ========================================
    const totalElapsed = ((Date.now() - totalStartTime) / 1000 / 60).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log(`⏱️  Total time: ${totalElapsed} minutes`);
    console.log('');

    console.log('💡 Next steps:');
    console.log('   1. Verify data: node run-sec-bulk-import-unified.js --skip-download --skip-import --verify');
    console.log('   2. Calculate metrics: node calculate-all-metrics.js');
    console.log('   3. Query your data!');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
