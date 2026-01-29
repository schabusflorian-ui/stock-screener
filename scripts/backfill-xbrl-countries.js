#!/usr/bin/env node

/**
 * Backfill XBRL data for specific countries
 *
 * This script imports EU/UK XBRL filings for countries that haven't been fetched yet.
 * It uses the XBRLBulkImporter with resume capability to avoid duplicates.
 *
 * Usage: node scripts/backfill-xbrl-countries.js [country1] [country2] ...
 * Example: node scripts/backfill-xbrl-countries.js DE SE NL
 */

const path = require('path');
const Database = require('better-sqlite3');
const { XBRLBulkImporter } = require('../src/services/xbrl/xbrlBulkImporter');

// Default countries to backfill (those not yet imported)
const DEFAULT_COUNTRIES = ['DE', 'SE', 'NL'];

async function main() {
  // Get countries from command line args or use defaults
  const countries = process.argv.slice(2).length > 0
    ? process.argv.slice(2).map(c => c.toUpperCase())
    : DEFAULT_COUNTRIES;

  console.log('🚀 XBRL Country Backfill Script');
  console.log('================================');
  console.log(`Target countries: ${countries.join(', ')}`);

  // Connect to database
  const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Check what's already imported
  console.log('\n📊 Current import status:');
  const existingFilings = db.prepare(`
    SELECT country, COUNT(*) as filings, COUNT(DISTINCT lei) as companies
    FROM xbrl_filings
    GROUP BY country
    ORDER BY filings DESC
  `).all();

  if (existingFilings.length > 0) {
    console.log('  Country | Filings | Companies');
    console.log('  --------|---------|----------');
    existingFilings.forEach(row => {
      console.log(`  ${row.country.padEnd(7)} | ${String(row.filings).padStart(7)} | ${String(row.companies).padStart(9)}`);
    });
  } else {
    console.log('  No existing filings found');
  }

  // Filter out countries that already have data
  const existingCountries = new Set(existingFilings.map(r => r.country));
  const toImport = countries.filter(c => !existingCountries.has(c));
  const alreadyDone = countries.filter(c => existingCountries.has(c));

  if (alreadyDone.length > 0) {
    console.log(`\n⏭️  Skipping already imported: ${alreadyDone.join(', ')}`);
  }

  if (toImport.length === 0) {
    console.log('\n✅ All requested countries already imported!');
    db.close();
    return;
  }

  console.log(`\n📥 Will import: ${toImport.join(', ')}`);

  // Initialize the importer
  const importer = new XBRLBulkImporter(db, {
    startYear: 2021,
    batchSize: 100,
    maxErrorsPerCountry: 50
  });

  // Import each country
  const results = {};
  for (const country of toImport) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📥 Importing ${country}...`);
    console.log(`${'='.repeat(50)}`);

    try {
      const stats = await importer.importCountry(country, {
        progressCallback: (progress) => {
          if (progress.stats.processed % 50 === 0) {
            console.log(`    Progress: ${progress.stats.processed} processed, ${progress.stats.added} added, ${progress.stats.parsed} parsed`);
          }
        }
      });

      results[country] = stats;
      console.log(`\n✅ ${country} complete: ${stats.added} filings, ${stats.parsed} parsed, ${stats.errors} errors`);
    } catch (error) {
      console.error(`\n❌ Error importing ${country}: ${error.message}`);
      results[country] = { error: error.message };
    }
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 FINAL SUMMARY');
  console.log(`${'='.repeat(50)}`);

  for (const [country, stats] of Object.entries(results)) {
    if (stats.error) {
      console.log(`  ${country}: ❌ ${stats.error}`);
    } else {
      console.log(`  ${country}: ✅ ${stats.added} filings, ${stats.parsed} parsed, ${stats.errors} errors`);
    }
  }

  // Show updated totals
  const finalFilings = db.prepare(`
    SELECT country, COUNT(*) as filings, COUNT(DISTINCT lei) as companies
    FROM xbrl_filings
    GROUP BY country
    ORDER BY filings DESC
  `).all();

  console.log('\n📊 Updated import status:');
  console.log('  Country | Filings | Companies');
  console.log('  --------|---------|----------');
  finalFilings.forEach(row => {
    console.log(`  ${row.country.padEnd(7)} | ${String(row.filings).padStart(7)} | ${String(row.companies).padStart(9)}`);
  });

  db.close();
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
