#!/usr/bin/env node
// run-sec-bulk-import.js

/**
 * SEC Bulk Import CLI
 *
 * Complete pipeline for importing historical SEC financial data
 *
 * Steps:
 * 1. Run database migration
 * 2. Download SEC bulk files
 * 3. Import data into database
 * 4. Verify import
 */

const SECBulkDownloader = require('./src/bulk-import/downloadSECBulk');
const SECBulkImporter = require('./src/bulk-import/importSECBulk');
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
║          SEC BULK IMPORT - Complete Pipeline              ║
╚════════════════════════════════════════════════════════════╝

Import historical financial data for all US public companies from
SEC bulk downloads (2009-2024).

USAGE:
  node run-sec-bulk-import.js [options]

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

  Full import (all years):
    node run-sec-bulk-import.js

  Import recent data only:
    node run-sec-bulk-import.js --start 2020 --end 2024

  Download only:
    node run-sec-bulk-import.js --download-only --start 2023

  Import with verification:
    node run-sec-bulk-import.js --start 2023 --verify

  Test import (limited records):
    node run-sec-bulk-import.js --start 2024 --end 2024 --limit 100000

  Import without re-downloading:
    node run-sec-bulk-import.js --skip-download

WORKFLOW:

  1. Database Migration
     Adds necessary tables and columns for bulk import

  2. Download SEC Files
     Downloads quarterly ZIP files from SEC website
     Extracts sub.txt, num.txt, tag.txt files

  3. Import Data
     Processes submissions and financial data
     Maps XBRL tags to canonical names
     Inserts into financial_line_items table

  4. Verification (optional)
     Validates imported data
     Shows statistics and data quality report

ESTIMATED TIME:
  Download:  ~30-60 minutes (all years)
  Import:    ~4-6 hours (all years)
  Total:     ~5-7 hours for complete historical data

DISK SPACE:
  Downloads:  ~20 GB (compressed)
  Extracted:  ~50 GB
  Database:   ~10-20 GB (after import)
  Total:      ~80-90 GB

DATA RANGE:
  2009 Q1 - 2024 Q4 (current)
  All US public companies
  10-K and 10-Q filings only

For more information, see:
  https://www.sec.gov/data-research/sec-markets-data/financial-statement-data-sets
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
║          SEC BULK IMPORT - Complete Pipeline              ║
╚════════════════════════════════════════════════════════════╝
  `);

  console.log(`📅 Date range: Q1 ${options.startYear} - Q4 ${options.endYear}`);
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
    // Step 2: Import
    // ========================================
    if (!options.skipImport) {
      console.log('\n📊 Step 2: Import Data into Database');
      console.log('='.repeat(60));

      const importer = new SECBulkImporter();
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

    if (!options.verify && !options.skipVerify) {
      console.log('💡 Tip: Run verification with:');
      console.log('   node run-sec-bulk-import.js --skip-download --skip-import --verify');
      console.log('');
    }

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
