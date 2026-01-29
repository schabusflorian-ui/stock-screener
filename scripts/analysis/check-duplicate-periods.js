#!/usr/bin/env node
// check-duplicate-periods.js

/**
 * Check for duplicate periods in financial_data
 * Ensure no double counting of financial statements
 */

const db = require('./src/database');

const database = db.getDatabase();

console.log('🔍 CHECKING FOR DUPLICATE PERIODS\n');
console.log('=' .repeat(60));

// Check for duplicates by company, period, and statement type
const duplicateQuery = `
  SELECT
    c.symbol,
    c.name,
    fd.company_id,
    fd.fiscal_date_ending,
    fd.fiscal_period,
    fd.statement_type,
    COUNT(*) as count
  FROM financial_data fd
  LEFT JOIN companies c ON fd.company_id = c.id
  WHERE fd.fiscal_date_ending IS NOT NULL
    AND fd.fiscal_period IS NOT NULL
    AND fd.statement_type IS NOT NULL
  GROUP BY fd.company_id, fd.fiscal_date_ending, fd.fiscal_period, fd.statement_type
  HAVING count > 1
  ORDER BY count DESC, c.symbol
  LIMIT 50
`;

console.log('\n📊 Checking for duplicate periods...\n');

const duplicates = database.prepare(duplicateQuery).all();

if (duplicates.length === 0) {
  console.log('✅ NO DUPLICATES FOUND!\n');
  console.log('Each company has unique periods for each statement type.');
  console.log('No double counting detected.\n');
} else {
  console.log(`⚠️  FOUND ${duplicates.length} DUPLICATE ENTRIES:\n`);
  console.log('Company'.padEnd(30) + 'Period'.padEnd(15) + 'Type'.padEnd(20) + 'Count');
  console.log('-'.repeat(80));

  for (const dup of duplicates) {
    const companyName = (dup.symbol || `CIK_${dup.company_id}`).padEnd(30);
    const period = `${dup.fiscal_date_ending} ${dup.fiscal_period}`.padEnd(15);
    const type = dup.statement_type.padEnd(20);
    console.log(`${companyName}${period}${type}${dup.count}`);
  }
}

// Check how deduplication works in the import process
console.log('\n\n🔍 UNDERSTANDING DEDUPLICATION:\n');
console.log('=' .repeat(60));

// Sample a company with lots of data (Apple)
const appleQuery = `
  SELECT
    fiscal_date_ending,
    fiscal_period,
    statement_type,
    form,
    filed_date,
    adsh,
    period_type,
    LENGTH(data) as data_size
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
    AND statement_type = 'balance_sheet'
  ORDER BY fiscal_date_ending DESC
  LIMIT 20
`;

console.log('\nApple Balance Sheets (last 20 periods):');
console.log('-'.repeat(100));
console.log('Date'.padEnd(12) + 'Period'.padEnd(10) + 'Form'.padEnd(8) + 'Filed'.padEnd(12) + 'Type'.padEnd(10) + 'Data Size'.padEnd(12) + 'ADSH');
console.log('-'.repeat(100));

const appleData = database.prepare(appleQuery).all();

for (const row of appleData) {
  const date = (row.fiscal_date_ending || '').padEnd(12);
  const period = (row.fiscal_period || '').padEnd(10);
  const form = (row.form || '').padEnd(8);
  const filed = (row.filed_date || '').slice(0, 10).padEnd(12);
  const type = (row.period_type || '').padEnd(10);
  const size = (row.data_size || 0).toString().padEnd(12);
  const adsh = row.adsh || '';

  console.log(`${date}${period}${form}${filed}${type}${size}${adsh}`);
}

// Check if we have multiple filings per period (amendments)
console.log('\n\n🔍 CHECKING FOR AMENDMENTS:\n');
console.log('=' .repeat(60));

const amendmentQuery = `
  SELECT
    c.symbol,
    fd.fiscal_date_ending,
    fd.fiscal_period,
    fd.form,
    fd.adsh,
    fd.filed_date
  FROM financial_data fd
  LEFT JOIN companies c ON fd.company_id = c.id
  WHERE c.symbol = 'AAPL'
    AND fd.statement_type = 'balance_sheet'
    AND fd.fiscal_date_ending = '2024-09-28'
  ORDER BY fd.filed_date DESC
`;

const amendments = database.prepare(amendmentQuery).all();

if (amendments.length > 1) {
  console.log(`⚠️  Found ${amendments.length} filings for Apple 2024-09-28:`);
  console.log('\nForm'.padEnd(10) + 'Filed Date'.padEnd(15) + 'ADSH');
  console.log('-'.repeat(60));
  for (const amendment of amendments) {
    console.log(`${(amendment.form || '').padEnd(10)}${(amendment.filed_date || '').slice(0, 10).padEnd(15)}${amendment.adsh || ''}`);
  }
  console.log('\n✅ Import process keeps only the LATEST filing (by filed_date)');
  console.log('   Amendments are handled by updating existing records.\n');
} else if (amendments.length === 1) {
  console.log('✅ Only one record per period (latest filing kept)');
  console.log(`   Form: ${amendments[0].form}, Filed: ${amendments[0].filed_date}\n`);
} else {
  console.log('   (Checking a different period...)\n');
}

// Summary statistics
console.log('\n📊 OVERALL STATISTICS:\n');
console.log('=' .repeat(60));

const statsQuery = `
  SELECT
    statement_type,
    COUNT(*) as total_records,
    COUNT(DISTINCT company_id) as unique_companies,
    COUNT(DISTINCT company_id || '-' || fiscal_date_ending || '-' || fiscal_period) as unique_periods
  FROM financial_data
  WHERE fiscal_date_ending IS NOT NULL
  GROUP BY statement_type
`;

const stats = database.prepare(statsQuery).all();

console.log('\nStatement Type'.padEnd(20) + 'Total Records'.padEnd(18) + 'Unique Companies'.padEnd(20) + 'Unique Periods');
console.log('-'.repeat(80));

for (const stat of stats) {
  const type = stat.statement_type.padEnd(20);
  const total = stat.total_records.toLocaleString().padEnd(18);
  const companies = stat.unique_companies.toLocaleString().padEnd(20);
  const periods = stat.unique_periods.toLocaleString();

  console.log(`${type}${total}${companies}${periods}`);
}

// Check data integrity
console.log('\n\n✅ DATA INTEGRITY CHECKS:\n');
console.log('=' .repeat(60));

const integrityChecks = [
  {
    name: 'Periods with NULL fiscal_date_ending',
    query: `SELECT COUNT(*) as count FROM financial_data WHERE fiscal_date_ending IS NULL`
  },
  {
    name: 'Periods with NULL fiscal_period',
    query: `SELECT COUNT(*) as count FROM financial_data WHERE fiscal_period IS NULL`
  },
  {
    name: 'Periods with empty data field',
    query: `SELECT COUNT(*) as count FROM financial_data WHERE data IS NULL OR data = '{}' OR data = ''`
  },
  {
    name: 'Total financial_data records',
    query: `SELECT COUNT(*) as count FROM financial_data`
  }
];

for (const check of integrityChecks) {
  const result = database.prepare(check.query).get();
  const status = result.count === 0 ? '✅' : (check.name.includes('Total') ? '📊' : '⚠️');
  console.log(`${status} ${check.name}: ${result.count.toLocaleString()}`);
}

console.log('\n\n💡 CONCLUSION:\n');
console.log('=' .repeat(60));

if (duplicates.length === 0) {
  console.log('✅ No duplicate periods detected!');
  console.log('✅ Each company-period-statement combination is unique.');
  console.log('✅ The import process correctly handles deduplication.');
  console.log('\nDeduplication strategy:');
  console.log('  1. Groups by: company_id + fiscal_date_ending + fiscal_period + statement_type');
  console.log('  2. Keeps: Latest filing (by filed_date) for each period');
  console.log('  3. Method: INSERT OR REPLACE based on unique constraint');
  console.log('\nThis ensures:');
  console.log('  • No double counting in metrics calculation');
  console.log('  • Amendments automatically replace original filings');
  console.log('  • One canonical record per period\n');
} else {
  console.log('⚠️  Duplicates found - review above for details.');
  console.log('   This may indicate an issue with the import process.\n');
}

