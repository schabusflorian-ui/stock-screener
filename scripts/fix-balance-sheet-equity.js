#!/usr/bin/env node

/**
 * Fix Balance Sheet Equity Data
 *
 * This script recalculates shareholder_equity using the balance sheet equation:
 * Equity = Assets - Liabilities
 *
 * This ensures the fundamental accounting equation always holds.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(DB_PATH);

const DRY_RUN = process.argv.includes('--dry-run');

console.log('='.repeat(80));
console.log('BALANCE SHEET EQUITY FIX');
console.log('='.repeat(80));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
console.log(`Database: ${DB_PATH}`);
console.log();

// Get counts before
const beforeStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE
      WHEN total_assets IS NOT NULL AND total_liabilities IS NOT NULL AND shareholder_equity IS NOT NULL
        AND ABS(total_assets - total_liabilities - shareholder_equity) / total_assets <= 0.01
      THEN 1 ELSE 0
    END) as balanced
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND total_assets > 0
`).get();

console.log('BEFORE FIX:');
console.log(`  Total balance sheet records: ${beforeStats.total.toLocaleString()}`);
console.log(`  Balanced within 1%: ${beforeStats.balanced.toLocaleString()} (${(beforeStats.balanced/beforeStats.total*100).toFixed(1)}%)`);
console.log();

// Strategy 1: Use balance sheet equation (Equity = Assets - Liabilities)
// This is the most reliable method when we have both Assets and Liabilities
console.log('Strategy: Calculate Equity = Assets - Liabilities');
console.log('-'.repeat(40));

// Count how many can be fixed
const fixableCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND total_assets IS NOT NULL
    AND total_assets > 0
    AND total_liabilities IS NOT NULL
    AND (
      shareholder_equity IS NULL
      OR ABS(total_assets - total_liabilities - shareholder_equity) / total_assets > 0.01
    )
`).get().count;

console.log(`Records that can be fixed: ${fixableCount.toLocaleString()}`);

if (!DRY_RUN) {
  // Perform the fix
  const updateStmt = db.prepare(`
    UPDATE financial_data
    SET shareholder_equity = total_assets - total_liabilities,
        updated_at = CURRENT_TIMESTAMP
    WHERE statement_type = 'balance_sheet'
      AND total_assets IS NOT NULL
      AND total_assets > 0
      AND total_liabilities IS NOT NULL
      AND (
        shareholder_equity IS NULL
        OR ABS(total_assets - total_liabilities - shareholder_equity) / total_assets > 0.01
      )
  `);

  const result = updateStmt.run();
  console.log(`Updated ${result.changes.toLocaleString()} records`);
} else {
  console.log('(Dry run - no changes made)');
}
console.log();

// Also fix records where we can calculate liabilities from the equation
// Liabilities = Assets - Equity (when liabilities is missing but equity is correct)
console.log('Strategy: Calculate missing Liabilities = Assets - Equity');
console.log('-'.repeat(40));

const fixableLiabCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND total_assets IS NOT NULL
    AND total_assets > 0
    AND total_liabilities IS NULL
    AND shareholder_equity IS NOT NULL
    AND shareholder_equity > 0
    AND shareholder_equity < total_assets
`).get().count;

console.log(`Records with missing liabilities that can be fixed: ${fixableLiabCount.toLocaleString()}`);

if (!DRY_RUN) {
  const updateLiabStmt = db.prepare(`
    UPDATE financial_data
    SET total_liabilities = total_assets - shareholder_equity,
        updated_at = CURRENT_TIMESTAMP
    WHERE statement_type = 'balance_sheet'
      AND total_assets IS NOT NULL
      AND total_assets > 0
      AND total_liabilities IS NULL
      AND shareholder_equity IS NOT NULL
      AND shareholder_equity > 0
      AND shareholder_equity < total_assets
  `);

  const liabResult = updateLiabStmt.run();
  console.log(`Updated ${liabResult.changes.toLocaleString()} records with calculated liabilities`);
} else {
  console.log('(Dry run - no changes made)');
}
console.log();

// Get counts after
if (!DRY_RUN) {
  const afterStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE
        WHEN total_assets IS NOT NULL AND total_liabilities IS NOT NULL AND shareholder_equity IS NOT NULL
          AND ABS(total_assets - total_liabilities - shareholder_equity) / total_assets <= 0.01
        THEN 1 ELSE 0
      END) as balanced
    FROM financial_data
    WHERE statement_type = 'balance_sheet'
      AND total_assets > 0
  `).get();

  console.log('AFTER FIX:');
  console.log(`  Total balance sheet records: ${afterStats.total.toLocaleString()}`);
  console.log(`  Balanced within 1%: ${afterStats.balanced.toLocaleString()} (${(afterStats.balanced/afterStats.total*100).toFixed(1)}%)`);
  console.log();

  const improvement = afterStats.balanced - beforeStats.balanced;
  console.log(`IMPROVEMENT: +${improvement.toLocaleString()} balanced records`);
  console.log(`  Before: ${(beforeStats.balanced/beforeStats.total*100).toFixed(1)}%`);
  console.log(`  After: ${(afterStats.balanced/afterStats.total*100).toFixed(1)}%`);
}

console.log();

// Verify major companies
console.log('VERIFICATION - Major Companies (Latest Annual):');
console.log('-'.repeat(80));

const majorCompanies = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'ABNB', 'UBER', 'TSLA'];

const companyCheck = db.prepare(`
  SELECT
    c.symbol,
    f.fiscal_date_ending,
    ROUND(f.total_assets / 1e9, 2) as assets_B,
    ROUND(f.total_liabilities / 1e9, 2) as liab_B,
    ROUND(f.shareholder_equity / 1e9, 2) as equity_B,
    ROUND((f.total_assets - f.total_liabilities) / 1e9, 2) as calc_equity_B,
    CASE
      WHEN f.total_assets IS NOT NULL AND f.total_liabilities IS NOT NULL AND f.shareholder_equity IS NOT NULL
        AND ABS(f.total_assets - f.total_liabilities - f.shareholder_equity) / f.total_assets <= 0.01
      THEN '✓ OK'
      ELSE '✗ ISSUE'
    END as status
  FROM financial_data f
  JOIN companies c ON f.company_id = c.id
  WHERE c.symbol = ?
    AND f.statement_type = 'balance_sheet'
    AND f.period_type = 'annual'
  ORDER BY f.fiscal_date_ending DESC
  LIMIT 1
`);

console.log('Symbol'.padEnd(8) + 'Date'.padEnd(12) + 'Assets'.padEnd(10) + 'Liab'.padEnd(10) + 'Equity'.padEnd(10) + 'Status');
console.log('-'.repeat(60));

for (const symbol of majorCompanies) {
  const row = companyCheck.get(symbol);
  if (row) {
    console.log(
      row.symbol.padEnd(8) +
      row.fiscal_date_ending.padEnd(12) +
      String(row.assets_B || 'N/A').padEnd(10) +
      String(row.liab_B || 'N/A').padEnd(10) +
      String(row.equity_B || 'N/A').padEnd(10) +
      row.status
    );
  }
}

db.close();
console.log();
console.log('='.repeat(80));
console.log('Fix complete.');

if (DRY_RUN) {
  console.log('\nTo apply changes, run without --dry-run flag:');
  console.log('  node scripts/fix-balance-sheet-equity.js');
}
