#!/usr/bin/env node

/**
 * Balance Sheet Validation Script
 *
 * Validates balance sheet data integrity and identifies issues:
 * 1. Balance sheet equation: Assets = Liabilities + Equity
 * 2. Missing data fields
 * 3. SEC data quality issues (equity = APIC instead of total equity)
 * 4. Negative values where unexpected
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(DB_PATH);

console.log('='.repeat(80));
console.log('BALANCE SHEET VALIDATION REPORT');
console.log('='.repeat(80));
console.log(`Generated: ${new Date().toISOString()}`);
console.log();

// 1. Overall statistics
console.log('1. OVERALL STATISTICS');
console.log('-'.repeat(40));

const stats = db.prepare(`
  SELECT
    COUNT(*) as total_records,
    SUM(CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END) as has_assets,
    SUM(CASE WHEN total_liabilities IS NOT NULL THEN 1 ELSE 0 END) as has_liabilities,
    SUM(CASE WHEN shareholder_equity IS NOT NULL THEN 1 ELSE 0 END) as has_equity,
    SUM(CASE WHEN total_assets IS NOT NULL AND total_liabilities IS NOT NULL AND shareholder_equity IS NOT NULL THEN 1 ELSE 0 END) as has_all_three
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
`).get();

console.log(`Total balance sheet records: ${stats.total_records.toLocaleString()}`);
console.log(`  - Has total_assets: ${stats.has_assets.toLocaleString()} (${(stats.has_assets/stats.total_records*100).toFixed(1)}%)`);
console.log(`  - Has total_liabilities: ${stats.has_liabilities.toLocaleString()} (${(stats.has_liabilities/stats.total_records*100).toFixed(1)}%)`);
console.log(`  - Has shareholder_equity: ${stats.has_equity.toLocaleString()} (${(stats.has_equity/stats.total_records*100).toFixed(1)}%)`);
console.log(`  - Has all three: ${stats.has_all_three.toLocaleString()} (${(stats.has_all_three/stats.total_records*100).toFixed(1)}%)`);
console.log();

// 2. Balance equation validation (Assets = Liabilities + Equity)
console.log('2. BALANCE EQUATION VALIDATION (Assets = Liabilities + Equity)');
console.log('-'.repeat(40));

const equationCheck = db.prepare(`
  SELECT
    SUM(CASE WHEN ABS(total_assets - total_liabilities - shareholder_equity) / total_assets <= 0.001 THEN 1 ELSE 0 END) as balanced_0_1pct,
    SUM(CASE WHEN ABS(total_assets - total_liabilities - shareholder_equity) / total_assets <= 0.01 THEN 1 ELSE 0 END) as balanced_1pct,
    SUM(CASE WHEN ABS(total_assets - total_liabilities - shareholder_equity) / total_assets <= 0.05 THEN 1 ELSE 0 END) as balanced_5pct,
    SUM(CASE WHEN ABS(total_assets - total_liabilities - shareholder_equity) / total_assets > 0.05 THEN 1 ELSE 0 END) as unbalanced_5pct,
    COUNT(*) as total_checked
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND total_assets IS NOT NULL AND total_assets > 0
    AND total_liabilities IS NOT NULL
    AND shareholder_equity IS NOT NULL
`).get();

console.log(`Records with all three fields: ${equationCheck.total_checked.toLocaleString()}`);
console.log(`  - Balanced within 0.1%: ${equationCheck.balanced_0_1pct.toLocaleString()} (${(equationCheck.balanced_0_1pct/equationCheck.total_checked*100).toFixed(1)}%)`);
console.log(`  - Balanced within 1%: ${equationCheck.balanced_1pct.toLocaleString()} (${(equationCheck.balanced_1pct/equationCheck.total_checked*100).toFixed(1)}%)`);
console.log(`  - Balanced within 5%: ${equationCheck.balanced_5pct.toLocaleString()} (${(equationCheck.balanced_5pct/equationCheck.total_checked*100).toFixed(1)}%)`);
console.log(`  - UNBALANCED (>5%): ${equationCheck.unbalanced_5pct.toLocaleString()} (${(equationCheck.unbalanced_5pct/equationCheck.total_checked*100).toFixed(1)}%)`);
console.log();

// 3. Identify equity = APIC issue
console.log('3. SEC DATA QUALITY: Equity = APIC Issue');
console.log('-'.repeat(40));

const apicIssue = db.prepare(`
  SELECT
    SUM(CASE
      WHEN shareholder_equity IS NOT NULL
        AND json_extract(data, '$.additionalPaidInCapital') IS NOT NULL
        AND ABS(shareholder_equity - json_extract(data, '$.additionalPaidInCapital')) < 1000
      THEN 1 ELSE 0
    END) as equity_equals_apic,
    SUM(CASE
      WHEN shareholder_equity IS NOT NULL
        AND json_extract(data, '$.additionalPaidInCapital') IS NOT NULL
        AND ABS(shareholder_equity - json_extract(data, '$.additionalPaidInCapital')) >= 1000
      THEN 1 ELSE 0
    END) as equity_not_apic,
    COUNT(*) as total
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND period_type = 'annual'
    AND fiscal_date_ending >= '2020-01-01'
`).get();

console.log(`Annual balance sheets since 2020: ${apicIssue.total.toLocaleString()}`);
console.log(`  - Equity = APIC (incorrect): ${apicIssue.equity_equals_apic.toLocaleString()} (${(apicIssue.equity_equals_apic/apicIssue.total*100).toFixed(1)}%)`);
console.log(`  - Equity ≠ APIC: ${apicIssue.equity_not_apic.toLocaleString()} (${(apicIssue.equity_not_apic/apicIssue.total*100).toFixed(1)}%)`);
console.log();

// 4. Calculate what equity SHOULD be
console.log('4. CORRECTABLE RECORDS (Can calculate equity from components)');
console.log('-'.repeat(40));

const correctableCheck = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE
      WHEN json_extract(data, '$.additionalPaidInCapital') IS NOT NULL
        AND json_extract(data, '$.retainedEarnings') IS NOT NULL
      THEN 1 ELSE 0
    END) as has_components,
    SUM(CASE
      WHEN total_assets IS NOT NULL
        AND total_liabilities IS NOT NULL
      THEN 1 ELSE 0
    END) as can_calculate_from_equation
  FROM financial_data
  WHERE statement_type = 'balance_sheet'
    AND period_type = 'annual'
    AND fiscal_date_ending >= '2020-01-01'
`).get();

console.log(`Total annual records since 2020: ${correctableCheck.total.toLocaleString()}`);
console.log(`  - Has APIC + Retained (can sum): ${correctableCheck.has_components.toLocaleString()} (${(correctableCheck.has_components/correctableCheck.total*100).toFixed(1)}%)`);
console.log(`  - Has Assets + Liab (can subtract): ${correctableCheck.can_calculate_from_equation.toLocaleString()} (${(correctableCheck.can_calculate_from_equation/correctableCheck.total*100).toFixed(1)}%)`);
console.log();

// 5. Sample of worst discrepancies
console.log('5. LARGEST DISCREPANCIES (Sample of 15)');
console.log('-'.repeat(40));

const worstDiscrepancies = db.prepare(`
  SELECT
    c.symbol,
    c.name,
    f.fiscal_date_ending,
    f.period_type,
    ROUND(f.total_assets / 1e9, 2) as assets_B,
    ROUND(f.total_liabilities / 1e9, 2) as liabilities_B,
    ROUND(f.shareholder_equity / 1e9, 2) as equity_B,
    ROUND((f.total_assets - f.total_liabilities - f.shareholder_equity) / 1e9, 2) as discrepancy_B,
    ROUND(ABS(f.total_assets - f.total_liabilities - f.shareholder_equity) / f.total_assets * 100, 1) as discrepancy_pct
  FROM financial_data f
  JOIN companies c ON f.company_id = c.id
  WHERE f.statement_type = 'balance_sheet'
    AND f.total_assets IS NOT NULL AND f.total_assets > 1e9
    AND f.total_liabilities IS NOT NULL
    AND f.shareholder_equity IS NOT NULL
    AND f.period_type = 'annual'
    AND f.fiscal_date_ending >= '2022-01-01'
    AND c.symbol NOT LIKE 'CIK_%'
  ORDER BY ABS(f.total_assets - f.total_liabilities - f.shareholder_equity) DESC
  LIMIT 15
`).all();

console.log('Symbol'.padEnd(10) + 'Date'.padEnd(12) + 'Assets(B)'.padEnd(12) + 'Liab(B)'.padEnd(12) + 'Equity(B)'.padEnd(12) + 'Diff(B)'.padEnd(12) + 'Diff%');
console.log('-'.repeat(80));
for (const row of worstDiscrepancies) {
  console.log(
    row.symbol.padEnd(10) +
    row.fiscal_date_ending.padEnd(12) +
    String(row.assets_B).padEnd(12) +
    String(row.liabilities_B).padEnd(12) +
    String(row.equity_B).padEnd(12) +
    String(row.discrepancy_B).padEnd(12) +
    row.discrepancy_pct + '%'
  );
}
console.log();

// 6. Check specific well-known companies
console.log('6. VALIDATION OF MAJOR COMPANIES (Latest Annual)');
console.log('-'.repeat(40));

const majorCompanies = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'BRK-B', 'JPM', 'V', 'ABNB', 'UBER'];

const companyCheck = db.prepare(`
  SELECT
    c.symbol,
    f.fiscal_date_ending,
    ROUND(f.total_assets / 1e9, 2) as assets_B,
    ROUND(f.total_liabilities / 1e9, 2) as liab_B,
    ROUND(f.shareholder_equity / 1e9, 2) as stored_equity_B,
    ROUND((f.total_assets - f.total_liabilities) / 1e9, 2) as calculated_equity_B,
    ROUND(json_extract(f.data, '$.additionalPaidInCapital') / 1e9, 2) as apic_B,
    ROUND(json_extract(f.data, '$.retainedEarnings') / 1e9, 2) as retained_B,
    CASE
      WHEN ABS(f.shareholder_equity - json_extract(f.data, '$.additionalPaidInCapital')) < 1000 THEN 'WRONG (=APIC)'
      WHEN ABS(f.total_assets - f.total_liabilities - f.shareholder_equity) / f.total_assets > 0.05 THEN 'WRONG (unbalanced)'
      WHEN f.total_liabilities IS NULL THEN 'MISSING LIAB'
      ELSE 'OK'
    END as status
  FROM financial_data f
  JOIN companies c ON f.company_id = c.id
  WHERE c.symbol = ?
    AND f.statement_type = 'balance_sheet'
    AND f.period_type = 'annual'
  ORDER BY f.fiscal_date_ending DESC
  LIMIT 1
`);

console.log('Symbol'.padEnd(8) + 'Date'.padEnd(12) + 'Assets'.padEnd(10) + 'Liab'.padEnd(10) + 'Stored Eq'.padEnd(12) + 'Calc Eq'.padEnd(10) + 'Status');
console.log('-'.repeat(80));

for (const symbol of majorCompanies) {
  const row = companyCheck.get(symbol);
  if (row) {
    console.log(
      row.symbol.padEnd(8) +
      row.fiscal_date_ending.padEnd(12) +
      String(row.assets_B || 'N/A').padEnd(10) +
      String(row.liab_B || 'N/A').padEnd(10) +
      String(row.stored_equity_B || 'N/A').padEnd(12) +
      String(row.calculated_equity_B || 'N/A').padEnd(10) +
      row.status
    );
  } else {
    console.log(`${symbol.padEnd(8)}NOT FOUND`);
  }
}
console.log();

// 7. Recommendations
console.log('7. RECOMMENDATIONS');
console.log('-'.repeat(40));
console.log(`
ISSUES IDENTIFIED:
1. ~35% of records have equity = APIC (missing retained earnings in stored value)
2. ~12% of records are missing liabilities data
3. ~24% have other large discrepancies (>5%)

RECOMMENDED FIXES:
1. Recalculate shareholder_equity as: total_assets - total_liabilities
   This ensures the balance sheet equation always holds.

2. Alternative: Sum equity components:
   equity = APIC + retained_earnings + accumulated_OCI + treasury_stock

3. For records missing liabilities:
   - Many of these are insurance/financial companies with different structures
   - Consider calculating: liabilities = assets - equity

4. Add validation during import to flag/fix these issues automatically.
`);

// 8. Summary counts
console.log('8. SUMMARY');
console.log('-'.repeat(40));

const summary = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN f.total_liabilities IS NULL AND f.total_assets IS NOT NULL THEN 1 ELSE 0 END) as missing_liab,
    SUM(CASE
      WHEN f.total_assets IS NOT NULL AND f.total_liabilities IS NOT NULL
        AND ABS(f.shareholder_equity - json_extract(f.data, '$.additionalPaidInCapital')) < 1000
      THEN 1 ELSE 0
    END) as equity_is_apic,
    SUM(CASE
      WHEN f.total_assets IS NOT NULL AND f.total_liabilities IS NOT NULL AND f.shareholder_equity IS NOT NULL
        AND ABS(f.total_assets - f.total_liabilities - f.shareholder_equity) / f.total_assets <= 0.01
      THEN 1 ELSE 0
    END) as balanced
  FROM financial_data f
  WHERE f.statement_type = 'balance_sheet'
    AND f.period_type = 'annual'
    AND f.fiscal_date_ending >= '2020-01-01'
`).get();

console.log(`Annual records since 2020: ${summary.total.toLocaleString()}`);
console.log(`  ✗ Missing liabilities: ${summary.missing_liab.toLocaleString()}`);
console.log(`  ✗ Equity = APIC (wrong): ${summary.equity_is_apic.toLocaleString()}`);
console.log(`  ✓ Balanced within 1%: ${summary.balanced.toLocaleString()}`);
console.log();

db.close();
console.log('='.repeat(80));
console.log('Validation complete.');
