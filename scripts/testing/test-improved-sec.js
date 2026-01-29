// test-improved-sec.js - Test improved SEC data cleaning
require('dotenv').config();
const SECProvider = require('./src/providers/SECProvider');

async function testImprovedCleaning() {
  console.log('\n🧪 TESTING IMPROVED SEC DATA CLEANING\n');
  console.log('='.repeat(80));

  const sec = new SECProvider({
    userAgent: 'Stock Analyzer test@example.com'
  });

  try {
    // Test with Apple (known to have had duplicates)
    console.log('\n📊 Testing with AAPL (Apple Inc.)\n');

    const balanceSheet = await sec.getBalanceSheet('AAPL');

    console.log('Annual Periods:');
    console.log(`  Total: ${balanceSheet.annual.length} periods`);

    // Check for duplicates in fiscal years
    const fiscalYears = new Map();
    for (const period of balanceSheet.annual) {
      const year = period.fiscalDateEnding.substring(0, 4);
      if (fiscalYears.has(year)) {
        console.log(`  ⚠️  DUPLICATE YEAR FOUND: ${year}`);
        console.log(`     Date 1: ${fiscalYears.get(year)}`);
        console.log(`     Date 2: ${period.fiscalDateEnding}`);
      } else {
        fiscalYears.set(year, period.fiscalDateEnding);
      }
    }

    if (fiscalYears.size === balanceSheet.annual.length) {
      console.log('  ✅ No duplicate fiscal years');
    }

    console.log('\nRecent annual periods:');
    balanceSheet.annual.slice(0, 5).forEach(p => {
      console.log(`  ${p.fiscalDateEnding}: Assets=$${(p.totalAssets/1e9).toFixed(1)}B, Equity=$${(p.shareholderEquity/1e9).toFixed(1)}B`);
    });

    console.log('\n\nQuarterly Periods:');
    console.log(`  Total: ${balanceSheet.quarterly.length} periods`);

    // Check quarterly duplicates
    const quarterlyKeys = new Map();
    for (const period of balanceSheet.quarterly) {
      const key = `${period.fiscalDateEnding}`;
      if (quarterlyKeys.has(key)) {
        console.log(`  ⚠️  DUPLICATE QUARTER FOUND: ${key}`);
      } else {
        quarterlyKeys.set(key, true);
      }
    }

    if (quarterlyKeys.size === balanceSheet.quarterly.length) {
      console.log('  ✅ No duplicate quarterly periods');
    }

    console.log('\nRecent quarterly periods:');
    balanceSheet.quarterly.slice(0, 8).forEach(p => {
      console.log(`  ${p.fiscalDateEnding}: Assets=$${(p.totalAssets/1e9).toFixed(1)}B`);
    });

    // Test with P&G to verify equity calculation still works
    console.log('\n\n📊 Testing with PG (Procter & Gamble)\n');

    const pgBalance = await sec.getBalanceSheet('PG');
    const latest = pgBalance.annual[0];

    console.log('Latest Annual Period:');
    console.log(`  Date: ${latest.fiscalDateEnding}`);
    console.log(`  Total Assets: $${(latest.totalAssets/1e9).toFixed(2)}B`);
    console.log(`  Total Liabilities: $${(latest.totalLiabilities/1e9).toFixed(2)}B`);
    console.log(`  Shareholder Equity: $${(latest.shareholderEquity/1e9).toFixed(2)}B`);

    const calculatedEquity = latest.totalAssets - latest.totalLiabilities;
    console.log(`  Calculated Equity: $${(calculatedEquity/1e9).toFixed(2)}B`);

    if (Math.abs(latest.shareholderEquity - calculatedEquity) < 1e6) {
      console.log('  ✅ Equity matches accounting equation');
    } else {
      console.log(`  ⚠️  Equity mismatch: ${((latest.shareholderEquity - calculatedEquity)/1e9).toFixed(2)}B difference`);
    }

    // Check for duplicate years in P&G
    const pgYears = new Map();
    for (const period of pgBalance.annual) {
      const year = period.fiscalDateEnding.substring(0, 4);
      if (pgYears.has(year)) {
        console.log(`\n  ⚠️  DUPLICATE YEAR FOUND in P&G: ${year}`);
      } else {
        pgYears.set(year, period.fiscalDateEnding);
      }
    }

    if (pgYears.size === pgBalance.annual.length) {
      console.log('\n  ✅ No duplicate fiscal years in P&G');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

testImprovedCleaning();
