#!/usr/bin/env node
/**
 * Simple Financial Data Deduplication - Batch Processing
 *
 * Processes deduplication in smaller batches to avoid timeout issues.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('\n🔧 BATCH FINANCIAL DATA DEDUPLICATION\n');

// Count duplicates first
const countQuery = db.prepare(`
  SELECT COUNT(*) as cnt FROM (
    SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type
    FROM financial_data
    GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
    HAVING COUNT(*) > 1
  )
`);

let remaining = countQuery.get().cnt;
console.log(`📊 Found ${remaining} duplicate groups to process\n`);

if (remaining === 0) {
  console.log('✅ No duplicates found!\n');
  process.exit(0);
}

// Delete duplicates in batches
const BATCH_SIZE = 10000;
let totalDeleted = 0;
let iteration = 0;

while (remaining > 0 && iteration < 100) {
  iteration++;

  // Step 1: Delete records with shorter data (less complete)
  const deleteShort = db.prepare(`
    DELETE FROM financial_data
    WHERE rowid IN (
      SELECT fd.rowid
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
      LIMIT ${BATCH_SIZE}
    )
  `);

  let result = deleteShort.run();
  totalDeleted += result.changes;

  if (result.changes > 0) {
    console.log(`  Batch ${iteration}: Deleted ${result.changes} shorter records (total: ${totalDeleted})`);
  }

  // Step 2: Delete remaining duplicates by keeping max rowid
  const deleteDups = db.prepare(`
    DELETE FROM financial_data
    WHERE rowid IN (
      SELECT fd.rowid
      FROM financial_data fd
      INNER JOIN (
        SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type,
               MAX(rowid) as max_rowid
        FROM financial_data
        GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
        HAVING COUNT(*) > 1
      ) dup ON fd.company_id = dup.company_id
           AND fd.fiscal_year = dup.fiscal_year
           AND fd.fiscal_period = dup.fiscal_period
           AND fd.period_type = dup.period_type
           AND fd.statement_type = dup.statement_type
      WHERE fd.rowid < dup.max_rowid
      LIMIT ${BATCH_SIZE}
    )
  `);

  result = deleteDups.run();
  totalDeleted += result.changes;

  if (result.changes > 0) {
    console.log(`  Batch ${iteration}: Deleted ${result.changes} older records (total: ${totalDeleted})`);
  }

  // Check remaining
  remaining = countQuery.get().cnt;

  if (result.changes === 0 && remaining > 0) {
    console.log(`\n⚠️  No progress made but ${remaining} duplicates remain. Breaking.\n`);
    break;
  }
}

console.log(`\n📊 Final duplicate count: ${remaining}`);
console.log(`✅ Total records deleted: ${totalDeleted}\n`);

db.close();
