#!/usr/bin/env node
// Comprehensive validation of the import fix
// Tests whether the data completeness logic will actually fix the missing balance sheets

const fs = require('fs');
const readline = require('readline');
const db = require('./src/database');
const SECBulkImporterUnified = require('./src/bulk-import/importSECBulkUnified');
const IntelligentTagMapper = require('./src/bulk-import/intelligentTagMapper');

const database = db.getDatabase();

async function validateFix() {
  console.log('\n=== COMPREHENSIVE IMPORT FIX VALIDATION ===\n');

  // Sample companies with different fiscal year ends
  const testCases = [
    { symbol: 'AAPL', cik: '0000320193', fyEnd: '2018-09-30', quarter: '2018q4' },
    { symbol: 'AAPL', cik: '0000320193', fyEnd: '2019-09-30', quarter: '2019q4' },
    { symbol: 'AAPL', cik: '0000320193', fyEnd: '2020-09-30', quarter: '2020q4' },
    { symbol: 'AAPL', cik: '0000320193', fyEnd: '2021-09-30', quarter: '2021q4' },
    { symbol: 'AMZN', cik: '0001018724', fyEnd: '2018-12-31', quarter: '2019q1' },
    { symbol: 'AMZN', cik: '0001018724', fyEnd: '2019-12-31', quarter: '2020q1' },
    { symbol: 'MSFT', cik: '0000789019', fyEnd: '2019-06-30', quarter: '2019q3' },
    { symbol: 'MSFT', cik: '0000789019', fyEnd: '2020-06-30', quarter: '2020q3' },
  ];

  const mapper = new IntelligentTagMapper();
  const results = [];

  for (const tc of testCases) {
    console.log(`\n--- Testing ${tc.symbol} FY ${tc.fyEnd} ---`);

    // 1. Check current database state
    const dbRecord = database.prepare(`
      SELECT total_assets, shareholder_equity, LENGTH(data) as data_size, filed_date
      FROM financial_data
      WHERE company_id = (SELECT id FROM companies WHERE symbol = ?)
        AND statement_type = 'balance_sheet'
        AND fiscal_date_ending = ?
        AND period_type = 'annual'
    `).get(tc.symbol, tc.fyEnd);

    console.log('Current DB state:', dbRecord || 'NOT FOUND');

    // 2. Check raw SEC data
    const subFile = `data/sec-bulk/${tc.quarter}/sub.txt`;
    const numFile = `data/sec-bulk/${tc.quarter}/num.txt`;

    if (!fs.existsSync(subFile)) {
      console.log(`  Quarter ${tc.quarter} not found, skipping`);
      continue;
    }

    // Find submission
    const subContent = fs.readFileSync(subFile, 'utf8');
    const subLine = subContent.split('\n').find(line => {
      const parts = line.split('\t');
      return parts[1] === tc.cik.replace(/^0+/, '') && parts[23] === '10-K';
    });

    if (!subLine) {
      console.log(`  10-K submission not found in ${tc.quarter}`);
      continue;
    }

    const adsh = subLine.split('\t')[0];
    const filedDate = subLine.split('\t')[26];
    console.log(`  Found submission: ${adsh}, filed: ${filedDate}`);

    // 3. Count balance sheet items in raw data
    const numContent = fs.readFileSync(numFile, 'utf8');
    const lines = numContent.split('\n').filter(line => line.startsWith(adsh));

    let assetsCount = 0;
    let assetsValue = null;
    let balanceSheetItems = 0;

    for (const line of lines) {
      const parts = line.split('\t');
      const tag = parts[1];
      const qtrs = parts[4];
      const uom = parts[5];
      const coreg = parts[6] + parts[7];
      const value = parts[8];

      if (uom !== 'USD') continue;
      if (qtrs !== '0') continue; // Balance sheet items only

      const mapping = mapper.mapTag(tag);
      if (mapping.statementType === 'balance_sheet') {
        balanceSheetItems++;

        if (tag === 'Assets' && coreg === '') {
          assetsCount++;
          assetsValue = value;
        }
      }
    }

    console.log(`  Raw data: ${balanceSheetItems} BS items, Assets tag: ${assetsValue ? '$' + (parseFloat(assetsValue)/1e9).toFixed(1) + 'B' : 'NOT FOUND'}`);

    // 4. Determine if fix will work
    const willFix = assetsValue !== null && (!dbRecord || !dbRecord.total_assets);
    const currentHasAssets = dbRecord && dbRecord.total_assets !== null;

    results.push({
      symbol: tc.symbol,
      fyEnd: tc.fyEnd,
      currentHasAssets,
      rawHasAssets: assetsValue !== null,
      rawAssetsValue: assetsValue,
      willFix,
      currentFiledDate: dbRecord?.filed_date,
      newFiledDate: filedDate
    });

    if (willFix) {
      console.log(`  ✅ FIX WILL WORK: Raw data has Assets, DB missing`);
    } else if (currentHasAssets) {
      console.log(`  ⏭️  ALREADY OK: DB already has total_assets`);
    } else {
      console.log(`  ❌ FIX WON'T HELP: Raw data also missing Assets`);
    }
  }

  // Summary
  console.log('\n\n=== SUMMARY ===\n');
  console.log('Symbol | FY End     | DB Has Assets | Raw Has Assets | Will Fix');
  console.log('-------|------------|---------------|----------------|----------');
  for (const r of results) {
    console.log(`${r.symbol.padEnd(6)} | ${r.fyEnd} | ${(r.currentHasAssets ? 'YES' : 'NO').padEnd(13)} | ${(r.rawHasAssets ? 'YES' : 'NO').padEnd(14)} | ${r.willFix ? '✅ YES' : (r.currentHasAssets ? '⏭️ SKIP' : '❌ NO')}`);
  }

  // Count how many will be fixed
  const willFixCount = results.filter(r => r.willFix).length;
  const alreadyOkCount = results.filter(r => r.currentHasAssets).length;
  const cantFixCount = results.filter(r => !r.willFix && !r.currentHasAssets).length;

  console.log(`\nTotal: ${results.length} test cases`);
  console.log(`  Will be fixed: ${willFixCount}`);
  console.log(`  Already OK: ${alreadyOkCount}`);
  console.log(`  Can't fix (raw data missing): ${cantFixCount}`);

  // Now check broader coverage: How many balance sheets in DB are missing assets
  // but the raw SEC quarterly files should have them?
  console.log('\n\n=== BROADER ANALYSIS ===\n');

  const missingAssets = database.prepare(`
    SELECT COUNT(*) as count
    FROM financial_data
    WHERE statement_type = 'balance_sheet'
      AND period_type = 'annual'
      AND total_assets IS NULL
      AND fiscal_date_ending >= '2010-01-01'
  `).get();

  console.log(`Total annual balance sheets missing total_assets (2010+): ${missingAssets.count}`);

  // The key question: Does the raw SEC data actually have the Assets tag?
  // Let's sample 100 random missing records
  const sampleMissing = database.prepare(`
    SELECT c.symbol, c.cik, f.fiscal_date_ending, f.filed_date
    FROM financial_data f
    JOIN companies c ON f.company_id = c.id
    WHERE f.statement_type = 'balance_sheet'
      AND f.period_type = 'annual'
      AND f.total_assets IS NULL
      AND f.fiscal_date_ending >= '2015-01-01'
      AND c.cik IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 20
  `).all();

  console.log(`\nSampling ${sampleMissing.length} random missing records to check if raw data exists...\n`);

  let rawDataExists = 0;
  let rawDataMissing = 0;

  for (const rec of sampleMissing) {
    const fyDate = new Date(rec.fiscal_date_ending);
    const fyMonth = fyDate.getMonth() + 1;
    const fyYear = fyDate.getFullYear();

    // Determine which quarter the 10-K would be filed in
    // 10-K is typically filed within 60 days of fiscal year end
    let quarterYear = fyYear;
    let quarter;
    if (fyMonth <= 3) quarter = 1;
    else if (fyMonth <= 6) quarter = 2;
    else if (fyMonth <= 9) quarter = 3;
    else { quarter = 4; }

    // 10-K filed after FY end, so check next quarter
    if (fyMonth === 12) { quarter = 1; quarterYear++; }
    else if (fyMonth >= 9) { quarter = 4; }
    else if (fyMonth >= 6) { quarter = 3; }
    else if (fyMonth >= 3) { quarter = 2; }

    const quarterKey = `${quarterYear}q${quarter}`;
    const subFile = `data/sec-bulk/${quarterKey}/sub.txt`;
    const numFile = `data/sec-bulk/${quarterKey}/num.txt`;

    if (!fs.existsSync(subFile)) {
      rawDataMissing++;
      continue;
    }

    // Quick check for Assets tag with this CIK
    const cikNum = rec.cik.replace(/^0+/, '');
    const numContent = fs.readFileSync(numFile, 'utf8');
    const hasAssets = numContent.includes(`${cikNum}`) && numContent.match(new RegExp(`[^\t]+\tAssets\t[^\t]+\t${rec.fiscal_date_ending.replace(/-/g, '')}\t0\tUSD\t\t\t`));

    if (hasAssets) {
      rawDataExists++;
    } else {
      rawDataMissing++;
    }
  }

  console.log(`Raw data check results:`);
  console.log(`  Has Assets in raw data: ${rawDataExists}/${sampleMissing.length} (${(100*rawDataExists/sampleMissing.length).toFixed(0)}%)`);
  console.log(`  Missing from raw data: ${rawDataMissing}/${sampleMissing.length} (${(100*rawDataMissing/sampleMissing.length).toFixed(0)}%)`);

  if (rawDataExists / sampleMissing.length > 0.5) {
    console.log('\n✅ Fix should help the MAJORITY of missing balance sheets');
  } else {
    console.log('\n⚠️  Fix may not help the majority - raw data might be missing too');
  }
}

validateFix().catch(console.error);
