// Test Apple 2020 import logic
const fs = require('fs');
const { getCanonicalTag, getStatementType, shouldImportTag } = require('./src/bulk-import/tagMappings');

console.log('\n📊 Testing Apple 2020 Import Logic\n');
console.log('='.repeat(80));

// Read the SEC bulk data file
const numFilePath = 'data/sec-bulk/2020q4/num.txt';
const lines = fs.readFileSync(numFilePath, 'utf-8').split('\n');

// Find all Apple (CIK 0000320193-20-000096) balance sheet items for 2020-09-30
const appleLines = lines.filter(line => {
  return line.startsWith('0000320193-20-000096') &&
         line.includes('20200930') &&
         line.includes('\t0\tUSD') && // qtrs=0 (point in time)
         !line.includes('EquityComponents=') && // Skip equity component details
         !line.includes('Reclassification');
});

console.log(`\n📥 Found ${appleLines.length} Apple balance sheet line items in SEC data\n`);

// Parse and group by statement type
const statements = {
  balance_sheet: {},
  income_statement: {},
  cash_flow: {},
  unknown: {}
};

let importedCount = 0;
let skippedCount = 0;

console.log('Processing line items:\n');

for (const line of appleLines) {
  const parts = line.split('\t');
  if (parts.length < 9) continue;

  const [adsh, tag, version, ddate, qtrs, uom, segments, coreg, value] = parts;

  const canonical = getCanonicalTag(tag);
  const statementType = getStatementType(canonical);
  const shouldImport = shouldImportTag(tag);

  if (shouldImport) {
    const camelCase = canonical.charAt(0).toLowerCase() + canonical.slice(1);
    const numValue = parseFloat(value) || 0;

    if (!statements[statementType][camelCase] || numValue > (parseFloat(statements[statementType][camelCase]) || 0)) {
      statements[statementType][camelCase] = value;
      statements[statementType][tag] = value; // Also store original
    }

    importedCount++;
    console.log(`  ✅ ${tag} → ${camelCase} = $${(numValue / 1e9).toFixed(2)}B`);
  } else {
    skippedCount++;
    console.log(`  ❌ ${tag} (unknown category - SKIPPED)`);
    statements.unknown[tag] = value;
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Import Summary:`);
console.log(`   ✅ Imported: ${importedCount} line items`);
console.log(`   ❌ Skipped:  ${skippedCount} line items`);

console.log(`\n📋 Balance Sheet Data Structure:`);
const bs = statements.balance_sheet;
console.log(`   Fields in balance_sheet object: ${Object.keys(bs).length}`);

if (Object.keys(bs).length > 0) {
  console.log('\n   Sample fields:');
  const sampleFields = Object.keys(bs).slice(0, 10);
  for (const field of sampleFields) {
    const value = parseFloat(bs[field]) || 0;
    console.log(`      ${field}: $${(value / 1e9).toFixed(2)}B`);
  }

  if (Object.keys(bs).length > 10) {
    console.log(`      ... and ${Object.keys(bs).length - 10} more fields`);
  }
}

console.log('\n' + '='.repeat(80));

// Check for the critical fields we need
const criticalFields = ['totalAssets', 'currentAssets', 'totalLiabilities', 'currentLiabilities',
                        'shareholderEquity', 'cashAndEquivalents'];
console.log('\n✅ Critical Fields Check:\n');

for (const field of criticalFields) {
  const value = bs[field];
  if (value) {
    const num = parseFloat(value) / 1e9;
    console.log(`   ✅ ${field}: $${num.toFixed(2)}B`);
  } else {
    console.log(`   ❌ ${field}: MISSING`);
  }
}

console.log('\n');
