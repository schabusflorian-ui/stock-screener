#!/usr/bin/env node
/**
 * SQL-based Financial Data Deduplication
 *
 * This script uses efficient SQL to deduplicate financial_data records.
 * For each duplicate group, it keeps the record with the most non-null important fields.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

const isDryRun = process.argv.includes('--dry-run');

console.log('\n🔧 SQL-BASED FINANCIAL DATA DEDUPLICATION\n');
if (isDryRun) {
  console.log('⚠️  DRY RUN - No changes will be made\n');
}

// First, let's understand what we're dealing with
console.log('📊 Analyzing duplicates...\n');

// Count duplicates by type
const duplicateStats = db.prepare(`
  SELECT statement_type, COUNT(*) as groups, SUM(cnt - 1) as duplicates_to_remove
  FROM (
    SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type, COUNT(*) as cnt
    FROM financial_data
    GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
    HAVING COUNT(*) > 1
  )
  GROUP BY statement_type
`).all();

console.log('Duplicate groups by statement type:');
let totalToRemove = 0;
for (const stat of duplicateStats) {
  console.log(`  ${stat.statement_type}: ${stat.groups} groups, ${stat.duplicates_to_remove} records to remove`);
  totalToRemove += stat.duplicates_to_remove;
}
console.log(`\nTotal records to remove: ${totalToRemove}\n`);

if (isDryRun) {
  // Show sample duplicates
  console.log('📋 Sample duplicates (first 5 groups):');
  const sampleDuplicates = db.prepare(`
    SELECT c.symbol, fd.fiscal_year, fd.fiscal_period, fd.period_type, fd.statement_type,
           COUNT(*) as cnt
    FROM financial_data fd
    JOIN companies c ON fd.company_id = c.id
    GROUP BY fd.company_id, fd.fiscal_year, fd.fiscal_period, fd.period_type, fd.statement_type
    HAVING COUNT(*) > 1
    LIMIT 5
  `).all();

  for (const dup of sampleDuplicates) {
    console.log(`  ${dup.symbol} ${dup.fiscal_year} ${dup.fiscal_period} ${dup.period_type} ${dup.statement_type}: ${dup.cnt} records`);
  }

  console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.\n');
  process.exit(0);
}

// For actual deduplication, we'll use a strategy that keeps the record with the most data
console.log('🔄 Starting deduplication...\n');

// Start a transaction for safety
db.exec('BEGIN TRANSACTION');

try {
  // Strategy: For each duplicate group, keep the record with the largest data length
  // (more data = more complete record)

  const deleteStmt = db.prepare(`
    DELETE FROM financial_data
    WHERE id IN (
      SELECT fd.id
      FROM financial_data fd
      INNER JOIN (
        SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type,
               MAX(LENGTH(COALESCE(data, ''))) as max_len
        FROM financial_data
        GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
        HAVING COUNT(*) > 1
      ) dup ON fd.company_id = dup.company_id
           AND fd.fiscal_year = dup.fiscal_year
           AND fd.fiscal_period = dup.fiscal_period
           AND fd.period_type = dup.period_type
           AND fd.statement_type = dup.statement_type
      WHERE LENGTH(COALESCE(fd.data, '')) < dup.max_len
    )
  `);

  let result = deleteStmt.run();
  console.log(`✅ Removed ${result.changes} duplicate records (shorter data_json)\n`);

  // Now handle ties (same data_json length) - keep the one with highest id (most recent)
  const deleteTiesStmt = db.prepare(`
    DELETE FROM financial_data
    WHERE id IN (
      SELECT fd.id
      FROM financial_data fd
      INNER JOIN (
        SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type,
               MAX(id) as max_id
        FROM financial_data
        GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
        HAVING COUNT(*) > 1
      ) dup ON fd.company_id = dup.company_id
           AND fd.fiscal_year = dup.fiscal_year
           AND fd.fiscal_period = dup.fiscal_period
           AND fd.period_type = dup.period_type
           AND fd.statement_type = dup.statement_type
      WHERE fd.id < dup.max_id
    )
  `);

  result = deleteTiesStmt.run();
  console.log(`✅ Removed ${result.changes} additional duplicate records (lower id)\n`);

  // Verify no duplicates remain
  const remainingDuplicates = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM (
      SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type
      FROM financial_data
      GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
      HAVING COUNT(*) > 1
    )
  `).get();

  if (remainingDuplicates.cnt > 0) {
    console.log(`⚠️  ${remainingDuplicates.cnt} duplicate groups still remain. Running additional cleanup...\n`);

    // Final cleanup - keep only max id for any remaining duplicates
    const finalCleanup = db.prepare(`
      DELETE FROM financial_data
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM financial_data
        GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
      )
    `);
    result = finalCleanup.run();
    console.log(`✅ Final cleanup removed ${result.changes} records\n`);
  }

  db.exec('COMMIT');
  console.log('✅ Transaction committed successfully!\n');

  // Final verification
  const finalCheck = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM (
      SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type
      FROM financial_data
      GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
      HAVING COUNT(*) > 1
    )
  `).get();

  console.log(`📊 Final duplicate count: ${finalCheck.cnt}`);

  if (finalCheck.cnt === 0) {
    console.log('✅ All duplicates have been removed!\n');
  }

} catch (error) {
  db.exec('ROLLBACK');
  console.error('❌ Error during deduplication:', error.message);
  console.log('Transaction rolled back. No changes were made.\n');
  process.exit(1);
}

db.close();
console.log('Done!\n');
