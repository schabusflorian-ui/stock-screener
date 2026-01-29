// Analyze how different companies report the same concepts
const fs = require('fs');
const { getCanonicalTag, shouldImportTag } = require('./src/bulk-import/tagMappings');

console.log('\n📊 Analyzing Tag Variation Across Companies\n');
console.log('='.repeat(100));

const quarter = '2024q3';
const numFilePath = `data/sec-bulk/${quarter}/num.txt`;
const subFilePath = `data/sec-bulk/${quarter}/sub.txt`;

// Read submission file to get 10-K filings
const subLines = fs.readFileSync(subFilePath, 'utf-8').split('\n');
const tenKSubmissions = subLines
  .filter(line => line.includes('10-K'))
  .slice(0, 30) // Analyze 30 companies
  .map(line => {
    const parts = line.split('\t');
    return {
      adsh: parts[0],
      name: parts[2]
    };
  });

// Read numbers file
const numLines = fs.readFileSync(numFilePath, 'utf-8').split('\n');

// Track how companies report key concepts
const conceptVariations = {
  'Total Assets': new Map(),
  'Total Liabilities': new Map(),
  'Cash': new Map(),
  'Long-term Debt': new Map(),
  'Shareholder Equity': new Map(),
  'Accounts Receivable': new Map()
};

for (const sub of tenKSubmissions) {
  const companyLines = numLines.filter(line => {
    return line.startsWith(sub.adsh) &&
           line.includes('\t0\tUSD') && // qtrs=0
           !line.includes('EquityComponents=');
  });

  if (companyLines.length === 0) continue;

  const companyTags = new Set();

  for (const line of companyLines) {
    const parts = line.split('\t');
    if (parts.length < 9) continue;
    const tag = parts[1];
    companyTags.add(tag);
  }

  // Check which tags this company uses for each concept
  for (const tag of companyTags) {
    if (tag === 'Assets') {
      conceptVariations['Total Assets'].set(tag, (conceptVariations['Total Assets'].get(tag) || 0) + 1);
    } else if (tag.includes('Cash') && !tag.includes('Flow')) {
      conceptVariations['Cash'].set(tag, (conceptVariations['Cash'].get(tag) || 0) + 1);
    } else if (tag.includes('Liabilities') && !tag.includes('Current') && !tag.includes('Noncurrent')) {
      conceptVariations['Total Liabilities'].set(tag, (conceptVariations['Total Liabilities'].get(tag) || 0) + 1);
    } else if (tag.includes('Debt') && tag.includes('Long')) {
      conceptVariations['Long-term Debt'].set(tag, (conceptVariations['Long-term Debt'].get(tag) || 0) + 1);
    } else if (tag.includes('Stockholders') || tag.includes('Shareholders')) {
      conceptVariations['Shareholder Equity'].set(tag, (conceptVariations['Shareholder Equity'].get(tag) || 0) + 1);
    } else if (tag.includes('Receivable') && !tag.includes('Nontrade')) {
      conceptVariations['Accounts Receivable'].set(tag, (conceptVariations['Accounts Receivable'].get(tag) || 0) + 1);
    }
  }
}

console.log(`Analyzed ${tenKSubmissions.length} companies\n`);
console.log('='.repeat(100));

for (const [concept, variations] of Object.entries(conceptVariations)) {
  console.log(`\n📋 ${concept.toUpperCase()}`);
  console.log('-'.repeat(100));

  if (variations.size === 0) {
    console.log('   No variations found');
    continue;
  }

  const sorted = Array.from(variations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log(`   Found ${variations.size} different tags used by companies:`);
  console.log('');

  for (const [tag, count] of sorted) {
    const canonical = getCanonicalTag(tag);
    const imported = shouldImportTag(tag) ? '✅' : '❌';
    const percent = ((count / tenKSubmissions.length) * 100).toFixed(0);
    console.log(`   ${imported} ${tag.padEnd(60)} | ${String(count).padStart(2)} companies (${String(percent).padStart(3)}%)`);
  }
}

console.log('\n' + '='.repeat(100));
console.log('\n💡 KEY INSIGHTS:\n');
console.log('1. Different companies use different XBRL tags for the same financial concept');
console.log('2. Some concepts have 10+ different tag variations');
console.log('3. ✅ = Tag is mapped and imported');
console.log('4. ❌ = Tag is NOT mapped and gets discarded');
console.log('');
console.log('This explains why our tag mapping needs to be comprehensive - companies report');
console.log('the same information using different XBRL tag names!\n');
