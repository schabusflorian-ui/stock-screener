// Analyze missing tags across multiple companies
const fs = require('fs');
const { getCanonicalTag, getStatementType, shouldImportTag } = require('./src/bulk-import/tagMappings');
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 Analyzing Missing Balance Sheet Tags Across Companies\n');
console.log('='.repeat(100));

// Select diverse companies: tech, retail, finance, industrial, energy
const companies = [
  { symbol: 'AAPL', name: 'Apple', cik: '0000320193' },
  { symbol: 'MSFT', name: 'Microsoft', cik: '0000789019' },
  { symbol: 'WMT', name: 'Walmart', cik: '0000104169' },
  { symbol: 'JPM', name: 'JPMorgan', cik: '0000019617' },
  { symbol: 'BA', name: 'Boeing', cik: '0000012927' },
  { symbol: 'XOM', name: 'ExxonMobil', cik: '0000034088' }
];

// Track all unique tags found and their frequencies
const allTagsFound = new Map(); // tag -> count
const skippedTags = new Map(); // tag -> count
const importedTags = new Map(); // tag -> count

// Check which quarters we have data for
const quarters = ['2020q4', '2021q4', '2022q4', '2023q4'];

for (const company of companies) {
  console.log(`\n📋 ${company.name} (${company.symbol})`);
  console.log('-'.repeat(100));

  let companySkipped = new Set();
  let companyImported = new Set();

  for (const quarter of quarters) {
    const numFilePath = `data/sec-bulk/${quarter}/num.txt`;

    if (!fs.existsSync(numFilePath)) {
      continue;
    }

    const lines = fs.readFileSync(numFilePath, 'utf-8').split('\n');

    // Find company's 10-K filing in this quarter
    const subFilePath = `data/sec-bulk/${quarter}/sub.txt`;
    const subLines = fs.readFileSync(subFilePath, 'utf-8').split('\n');

    const companySubs = subLines.filter(line =>
      line.startsWith(company.cik) && line.includes('10-K')
    );

    if (companySubs.length === 0) continue;

    // Get the adsh for this company's 10-K
    const subParts = companySubs[0].split('\t');
    const adsh = subParts[0];

    // Find balance sheet items (qtrs=0, point in time)
    const companyLines = lines.filter(line => {
      return line.startsWith(adsh) &&
             line.includes('\t0\tUSD') && // qtrs=0
             !line.includes('EquityComponents=') &&
             !line.includes('Reclassification');
    });

    // Process each line
    for (const line of companyLines) {
      const parts = line.split('\t');
      if (parts.length < 9) continue;

      const [, tag, , , , , , , value] = parts;

      // Track all tags
      allTagsFound.set(tag, (allTagsFound.get(tag) || 0) + 1);

      const shouldImport = shouldImportTag(tag);

      if (shouldImport) {
        companyImported.add(tag);
        importedTags.set(tag, (importedTags.get(tag) || 0) + 1);
      } else {
        companySkipped.add(tag);
        skippedTags.set(tag, (skippedTags.get(tag) || 0) + 1);
      }
    }
  }

  console.log(`   ✅ Imported tags: ${companyImported.size}`);
  console.log(`   ❌ Skipped tags:  ${companySkipped.size}`);

  // Show top 5 skipped tags for this company
  const companySkippedArray = Array.from(companySkipped);
  if (companySkippedArray.length > 0) {
    console.log(`   Top skipped: ${companySkippedArray.slice(0, 5).join(', ')}`);
  }
}

console.log('\n' + '='.repeat(100));
console.log('\n📊 AGGREGATE ANALYSIS ACROSS ALL COMPANIES\n');

console.log('Most Frequently Skipped Tags (appearing in multiple companies):');
console.log('-'.repeat(100));

// Sort skipped tags by frequency
const sortedSkipped = Array.from(skippedTags.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

let count = 1;
for (const [tag, freq] of sortedSkipped) {
  const canonical = getCanonicalTag(tag);
  const statementType = getStatementType(canonical);
  console.log(`${String(count).padStart(2)}. ${tag.padEnd(55)} | Count: ${String(freq).padStart(2)} | Category: ${statementType}`);
  count++;
}

console.log('\n' + '='.repeat(100));
console.log('\n📋 SUMMARY STATISTICS\n');

console.log(`Total unique tags found:     ${allTagsFound.size}`);
console.log(`Unique tags imported:        ${importedTags.size}`);
console.log(`Unique tags skipped:         ${skippedTags.size}`);
console.log(`Coverage rate:               ${((importedTags.size / allTagsFound.size) * 100).toFixed(1)}%`);

// Categorize skipped tags
const categorized = {
  marketableSecurities: [],
  otherAssets: [],
  otherLiabilities: [],
  equity: [],
  other: []
};

for (const [tag] of skippedTags) {
  if (tag.includes('MarketableSecurities')) {
    categorized.marketableSecurities.push(tag);
  } else if (tag.includes('OtherAssets')) {
    categorized.otherAssets.push(tag);
  } else if (tag.includes('OtherLiabilities')) {
    categorized.otherLiabilities.push(tag);
  } else if (tag.includes('Equity') || tag.includes('Stock')) {
    categorized.equity.push(tag);
  } else {
    categorized.other.push(tag);
  }
}

console.log('\n📂 SKIPPED TAGS BY CATEGORY:\n');
console.log(`   Marketable Securities: ${categorized.marketableSecurities.length} tags`);
console.log(`   Other Assets:          ${categorized.otherAssets.length} tags`);
console.log(`   Other Liabilities:     ${categorized.otherLiabilities.length} tags`);
console.log(`   Equity:                ${categorized.equity.length} tags`);
console.log(`   Other:                 ${categorized.other.length} tags`);

console.log('\n');
