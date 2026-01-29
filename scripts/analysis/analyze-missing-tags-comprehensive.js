// Comprehensive analysis of missing tags across many companies
const fs = require('fs');
const { shouldImportTag } = require('./src/bulk-import/tagMappings');

console.log('\n📊 Comprehensive Missing Tags Analysis (2024q3 - 50 Companies)\n');
console.log('='.repeat(100));

const quarter = '2024q3';
const numFilePath = `data/sec-bulk/${quarter}/num.txt`;
const subFilePath = `data/sec-bulk/${quarter}/sub.txt`;

// Read submission file to get 10-K filings
const subLines = fs.readFileSync(subFilePath, 'utf-8').split('\n');
const tenKSubmissions = subLines
  .filter(line => line.includes('10-K'))
  .slice(0, 50) // Take first 50 companies
  .map(line => {
    const parts = line.split('\t');
    return {
      adsh: parts[0],
      name: parts[2]
    };
  });

console.log(`Found ${tenKSubmissions.length} 10-K filings to analyze\n`);

// Read numbers file once
const numLines = fs.readFileSync(numFilePath, 'utf-8').split('\n');

// Track all tags across all companies
const skippedTagFreq = new Map(); // tag -> {count, exampleCompany}
const importedTagFreq = new Map();
let totalLinesProcessed = 0;
let companiesProcessed = 0;

for (const sub of tenKSubmissions) {
  // Find balance sheet items (qtrs=0) for this company
  const companyLines = numLines.filter(line => {
    return line.startsWith(sub.adsh) &&
           line.includes('\t0\tUSD') && // qtrs=0 (balance sheet)
           !line.includes('EquityComponents=') &&
           !line.includes('Reclassification');
  });

  if (companyLines.length === 0) continue;

  companiesProcessed++;
  totalLinesProcessed += companyLines.length;

  // Process each line
  for (const line of companyLines) {
    const parts = line.split('\t');
    if (parts.length < 9) continue;

    const tag = parts[1];
    const shouldImport = shouldImportTag(tag);

    if (shouldImport) {
      const current = importedTagFreq.get(tag) || {count: 0, exampleCompany: sub.name};
      importedTagFreq.set(tag, {count: current.count + 1, exampleCompany: current.exampleCompany});
    } else {
      const current = skippedTagFreq.get(tag) || {count: 0, exampleCompany: sub.name};
      skippedTagFreq.set(tag, {count: current.count + 1, exampleCompany: current.exampleCompany});
    }
  }
}

console.log(`✅ Processed ${companiesProcessed} companies`);
console.log(`📊 Analyzed ${totalLinesProcessed} balance sheet line items\n`);
console.log('='.repeat(100));

// Sort and display top skipped tags
const sortedSkipped = Array.from(skippedTagFreq.entries())
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 50);

console.log('\n🚫 TOP 50 MOST FREQUENTLY SKIPPED TAGS:\n');
console.log('Rank | Tag Name                                           | Occurrences | Example Company');
console.log('-'.repeat(115));

sortedSkipped.forEach(([tag, data], idx) => {
  const rank = String(idx + 1).padStart(4);
  const tagName = tag.substring(0, 50).padEnd(50);
  const count = String(data.count).padStart(11);
  const company = data.exampleCompany.substring(0, 30);
  console.log(`${rank} | ${tagName} | ${count} | ${company}`);
});

console.log('\n' + '='.repeat(100));
console.log('\n📊 SUMMARY STATISTICS:\n');

const totalUniqueSkipped = skippedTagFreq.size;
const totalUniqueImported = importedTagFreq.size;
const totalUnique = totalUniqueSkipped + totalUniqueImported;

console.log(`Total unique tags found:       ${totalUnique}`);
console.log(`Unique tags imported:          ${totalUniqueImported} (${((totalUniqueImported / totalUnique) * 100).toFixed(1)}%)`);
console.log(`Unique tags skipped:           ${totalUniqueSkipped} (${((totalUniqueSkipped / totalUnique) * 100).toFixed(1)}%)`);

// Categorize skipped tags
const categories = {
  'Marketable Securities': [],
  'Other Assets/Liabilities': [],
  'Debt': [],
  'Equity/Stock': [],
  'Derivatives/Hedging': [],
  'Leases': [],
  'Tax': [],
  'Pension/Benefits': [],
  'Other': []
};

for (const [tag] of skippedTagFreq) {
  if (tag.includes('MarketableSecurities') || tag.includes('Investment')) {
    categories['Marketable Securities'].push(tag);
  } else if (tag.includes('OtherAssets') || tag.includes('OtherLiabilities')) {
    categories['Other Assets/Liabilities'].push(tag);
  } else if (tag.includes('Debt') || tag.includes('CommercialPaper') || tag.includes('Note')) {
    categories['Debt'].push(tag);
  } else if (tag.includes('Equity') || tag.includes('Stock') || tag.includes('Share')) {
    categories['Equity/Stock'].push(tag);
  } else if (tag.includes('Derivative') || tag.includes('Hedge') || tag.includes('Fair')) {
    categories['Derivatives/Hedging'].push(tag);
  } else if (tag.includes('Lease') || tag.includes('Lessee')) {
    categories['Leases'].push(tag);
  } else if (tag.includes('Tax') || tag.includes('Deferred')) {
    categories['Tax'].push(tag);
  } else if (tag.includes('Pension') || tag.includes('Retirement') || tag.includes('Benefit')) {
    categories['Pension/Benefits'].push(tag);
  } else {
    categories['Other'].push(tag);
  }
}

console.log('\n📂 SKIPPED TAGS BY CATEGORY:\n');
for (const [category, tags] of Object.entries(categories)) {
  if (tags.length > 0) {
    console.log(`${category.padEnd(25)}: ${String(tags.length).padStart(3)} unique tags`);
  }
}

console.log('\n');
