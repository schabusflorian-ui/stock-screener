// Analyze income statement and cash flow tag variations
const fs = require('fs');
const { shouldImportTag } = require('./src/bulk-import/tagMappings');

console.log('\n📊 Analyzing Income Statement & Cash Flow Tag Variations\n');
console.log('='.repeat(100));

const quarter = '2024q3';
const numFilePath = `data/sec-bulk/${quarter}/num.txt`;
const subFilePath = `data/sec-bulk/${quarter}/sub.txt`;

// Read submission file to get 10-K filings
const subLines = fs.readFileSync(subFilePath, 'utf-8').split('\n');
const tenKSubmissions = subLines
  .filter(line => line.includes('10-K'))
  .slice(0, 50)
  .map(line => {
    const parts = line.split('\t');
    return {
      adsh: parts[0],
      name: parts[2]
    };
  });

// Read numbers file
const numLines = fs.readFileSync(numFilePath, 'utf-8').split('\n');

// Track tags by qtrs value
const tagsByQtrs = {
  income_qtrs1: new Map(),      // Single quarter income/cash flow
  income_qtrs4: new Map(),      // Annual income/cash flow
  balance_qtrs0: new Map()      // Point-in-time balance sheet
};

const importedByType = {
  income_qtrs1: { imported: 0, skipped: 0 },
  income_qtrs4: { imported: 0, skipped: 0 },
  balance_qtrs0: { imported: 0, skipped: 0 }
};

let companiesProcessed = 0;

for (const sub of tenKSubmissions) {
  const companyLines = numLines.filter(line => {
    return line.startsWith(sub.adsh) &&
           line.includes('\tUSD') &&
           !line.includes('EquityComponents=') &&
           !line.includes('Reclassification');
  });

  if (companyLines.length === 0) continue;
  companiesProcessed++;

  for (const line of companyLines) {
    const parts = line.split('\t');
    if (parts.length < 9) continue;

    const tag = parts[1];
    const qtrs = parts[4];

    // Categorize by qtrs value
    if (qtrs === '0') {
      // Balance sheet (point in time)
      tagsByQtrs.balance_qtrs0.set(tag, (tagsByQtrs.balance_qtrs0.get(tag) || 0) + 1);
      if (shouldImportTag(tag)) {
        importedByType.balance_qtrs0.imported++;
      } else {
        importedByType.balance_qtrs0.skipped++;
      }
    } else if (qtrs === '1') {
      // Single quarter activity (income/cash flow for 10-Q)
      tagsByQtrs.income_qtrs1.set(tag, (tagsByQtrs.income_qtrs1.get(tag) || 0) + 1);
      if (shouldImportTag(tag)) {
        importedByType.income_qtrs1.imported++;
      } else {
        importedByType.income_qtrs1.skipped++;
      }
    } else if (qtrs === '4') {
      // Full year activity (income/cash flow for 10-K)
      tagsByQtrs.income_qtrs4.set(tag, (tagsByQtrs.income_qtrs4.get(tag) || 0) + 1);
      if (shouldImportTag(tag)) {
        importedByType.income_qtrs4.imported++;
      } else {
        importedByType.income_qtrs4.skipped++;
      }
    }
  }
}

console.log(`Analyzed ${companiesProcessed} companies\n`);
console.log('='.repeat(100));

// Analyze each category
console.log('\n📋 BALANCE SHEET (qtrs=0) - Point in Time\n');
console.log(`   Total unique tags: ${tagsByQtrs.balance_qtrs0.size}`);
console.log(`   ✅ Imported: ${importedByType.balance_qtrs0.imported} instances`);
console.log(`   ❌ Skipped:  ${importedByType.balance_qtrs0.skipped} instances`);
const balanceCoverage = (importedByType.balance_qtrs0.imported / (importedByType.balance_qtrs0.imported + importedByType.balance_qtrs0.skipped)) * 100;
console.log(`   Coverage: ${balanceCoverage.toFixed(1)}%`);

console.log('\n📋 INCOME/CASH FLOW - QUARTERLY (qtrs=1) - Single Quarter Activity\n');
console.log(`   Total unique tags: ${tagsByQtrs.income_qtrs1.size}`);
console.log(`   ✅ Imported: ${importedByType.income_qtrs1.imported} instances`);
console.log(`   ❌ Skipped:  ${importedByType.income_qtrs1.skipped} instances`);
const quarterlyCoverage = (importedByType.income_qtrs1.imported / (importedByType.income_qtrs1.imported + importedByType.income_qtrs1.skipped)) * 100;
console.log(`   Coverage: ${quarterlyCoverage.toFixed(1)}%`);

console.log('\n📋 INCOME/CASH FLOW - ANNUAL (qtrs=4) - Full Year Activity\n');
console.log(`   Total unique tags: ${tagsByQtrs.income_qtrs4.size}`);
console.log(`   ✅ Imported: ${importedByType.income_qtrs4.imported} instances`);
console.log(`   ❌ Skipped:  ${importedByType.income_qtrs4.skipped} instances`);
const annualCoverage = (importedByType.income_qtrs4.imported / (importedByType.income_qtrs4.imported + importedByType.income_qtrs4.skipped)) * 100;
console.log(`   Coverage: ${annualCoverage.toFixed(1)}%`);

// Show top skipped tags for income/cash flow
console.log('\n' + '='.repeat(100));
console.log('\n🚫 TOP 30 SKIPPED INCOME/CASH FLOW TAGS (qtrs=4, Annual):\n');

const skippedAnnual = Array.from(tagsByQtrs.income_qtrs4.entries())
  .filter(([tag]) => !shouldImportTag(tag))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

console.log('Rank | Tag Name                                                     | Occurrences');
console.log('-'.repeat(100));

skippedAnnual.forEach(([tag, count], idx) => {
  const rank = String(idx + 1).padStart(4);
  const tagName = tag.substring(0, 60).padEnd(60);
  const occurrences = String(count).padStart(11);
  console.log(`${rank} | ${tagName} | ${occurrences}`);
});

// Categorize the skipped income/cash flow tags
const categories = {
  'Revenue': [],
  'Expenses': [],
  'Income/Earnings': [],
  'Tax': [],
  'Share-based Comp': [],
  'Depreciation/Amortization': [],
  'Interest': [],
  'Other Income/Expense': [],
  'EPS': [],
  'Cash Flow Operations': [],
  'Cash Flow Investing': [],
  'Cash Flow Financing': [],
  'Other': []
};

for (const [tag] of skippedAnnual) {
  const lower = tag.toLowerCase();

  if (lower.includes('revenue') || lower.includes('sales')) {
    categories['Revenue'].push(tag);
  } else if (lower.includes('expense') || lower.includes('cost')) {
    categories['Expenses'].push(tag);
  } else if (lower.includes('income') || lower.includes('earnings') || lower.includes('profit') || lower.includes('loss')) {
    categories['Income/Earnings'].push(tag);
  } else if (lower.includes('tax')) {
    categories['Tax'].push(tag);
  } else if (lower.includes('sharebasedcompensation') || lower.includes('stockoption')) {
    categories['Share-based Comp'].push(tag);
  } else if (lower.includes('depreciation') || lower.includes('amortization')) {
    categories['Depreciation/Amortization'].push(tag);
  } else if (lower.includes('interest')) {
    categories['Interest'].push(tag);
  } else if (lower.includes('gain') || lower.includes('otherincome') || lower.includes('otherexpense')) {
    categories['Other Income/Expense'].push(tag);
  } else if (lower.includes('earningspershare') || lower.includes('eps')) {
    categories['EPS'].push(tag);
  } else if (lower.includes('operating') && lower.includes('cash')) {
    categories['Cash Flow Operations'].push(tag);
  } else if (lower.includes('investing') && lower.includes('cash')) {
    categories['Cash Flow Investing'].push(tag);
  } else if (lower.includes('financing') && lower.includes('cash')) {
    categories['Cash Flow Financing'].push(tag);
  } else {
    categories['Other'].push(tag);
  }
}

console.log('\n' + '='.repeat(100));
console.log('\n📂 SKIPPED INCOME/CASH FLOW TAGS BY CATEGORY:\n');

for (const [category, tags] of Object.entries(categories)) {
  if (tags.length > 0) {
    console.log(`${category.padEnd(25)}: ${String(tags.length).padStart(3)} unique tags`);
  }
}

console.log('\n' + '='.repeat(100));
console.log('\n💡 RECOMMENDATION:\n');

if (quarterlyCoverage < 50 || annualCoverage < 50) {
  console.log('❌ CRITICAL: Income/Cash Flow coverage is LOW (<50%)');
  console.log('   → YES, intelligent mapping is needed for these statement types too!\n');
} else if (quarterlyCoverage < 80 || annualCoverage < 80) {
  console.log('⚠️  MODERATE: Income/Cash Flow coverage is MEDIUM (50-80%)');
  console.log('   → Intelligent mapping would significantly improve data completeness\n');
} else {
  console.log('✅ GOOD: Income/Cash Flow coverage is HIGH (>80%)');
  console.log('   → Intelligent mapping would still help, but less critical than balance sheet\n');
}

console.log('');
