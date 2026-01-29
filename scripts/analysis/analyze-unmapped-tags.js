#!/usr/bin/env node
// analyze-unmapped-tags.js

/**
 * Analyze the 20.8% of unmapped XBRL tags to identify patterns
 * This will help us understand what additional mapping rules we might need
 */

const db = require('./src/database');
const IntelligentTagMapper = require('./src/bulk-import/intelligentTagMapper');

const database = db.getDatabase();
const mapper = new IntelligentTagMapper();

console.log('🔍 ANALYZING UNMAPPED XBRL TAGS\n');
console.log('=' .repeat(60));

// Query to get all unique tags from financial_line_items
// We'll sample from a recent quarter to get a good cross-section
const query = `
  SELECT
    original_concept as tag,
    COUNT(*) as occurrence_count
  FROM financial_line_items
  WHERE original_concept IS NOT NULL
    AND adsh LIKE '0001%'  -- Sample recent filings
  GROUP BY original_concept
  ORDER BY occurrence_count DESC
  LIMIT 5000
`;

console.log('\n📊 Sampling tags from financial_line_items table...\n');

const tags = database.prepare(query).all();

console.log(`✅ Found ${tags.length.toLocaleString()} unique tags\n`);

// Categorize tags
const categorized = {
  mapped: [],
  unmapped: []
};

for (const { tag, occurrence_count } of tags) {
  const mapping = mapper.mapTag(tag);

  if (mapping.statementType === 'unknown') {
    categorized.unmapped.push({ tag, count: occurrence_count, method: 'unmapped' });
  } else {
    categorized.mapped.push({ tag, count: occurrence_count, method: mapping.method });
  }
}

console.log('📈 MAPPING RESULTS:');
console.log('='.repeat(60));
console.log(`✅ Mapped: ${categorized.mapped.length} tags (${((categorized.mapped.length / tags.length) * 100).toFixed(1)}%)`);
console.log(`❌ Unmapped: ${categorized.unmapped.length} tags (${((categorized.unmapped.length / tags.length) * 100).toFixed(1)}%)`);

// Analyze unmapped tags by category
console.log('\n\n🔍 ANALYZING UNMAPPED TAGS:\n');
console.log('='.repeat(60));

// Group unmapped tags by common patterns
const patterns = {
  disclosure: [],
  textBlock: [],
  axis: [],
  member: [],
  domain: [],
  abstract: [],
  table: [],
  lineItems: [],
  policyTextBlock: [],
  percentages: [],
  perShare: [],
  other: []
};

for (const { tag, count } of categorized.unmapped) {
  // Categorize by common XBRL metadata patterns
  if (tag.includes('Disclosure') || tag.includes('DisclosureText')) {
    patterns.disclosure.push({ tag, count });
  } else if (tag.includes('TextBlock')) {
    patterns.textBlock.push({ tag, count });
  } else if (tag.includes('Axis')) {
    patterns.axis.push({ tag, count });
  } else if (tag.includes('Member')) {
    patterns.member.push({ tag, count });
  } else if (tag.includes('Domain')) {
    patterns.domain.push({ tag, count });
  } else if (tag.includes('Abstract')) {
    patterns.abstract.push({ tag, count });
  } else if (tag.includes('Table')) {
    patterns.table.push({ tag, count });
  } else if (tag.includes('LineItems')) {
    patterns.lineItems.push({ tag, count });
  } else if (tag.includes('PolicyTextBlock')) {
    patterns.policyTextBlock.push({ tag, count });
  } else if (tag.includes('Percent') || tag.includes('Rate')) {
    patterns.percentages.push({ tag, count });
  } else if (tag.includes('PerShare')) {
    patterns.perShare.push({ tag, count });
  } else {
    patterns.other.push({ tag, count });
  }
}

// Print category summaries
console.log('\n📋 UNMAPPED TAG CATEGORIES:\n');

const categoryOrder = [
  'textBlock',
  'disclosure',
  'policyTextBlock',
  'table',
  'lineItems',
  'axis',
  'member',
  'domain',
  'abstract',
  'percentages',
  'perShare',
  'other'
];

for (const category of categoryOrder) {
  const items = patterns[category];
  if (items.length > 0) {
    console.log(`\n${category.toUpperCase()}: ${items.length} tags`);
    console.log('-'.repeat(60));

    // Show top 10 most common
    const topTags = items.sort((a, b) => b.count - a.count).slice(0, 10);
    for (const { tag, count } of topTags) {
      console.log(`  ${count.toLocaleString().padStart(8)} × ${tag}`);
    }

    if (items.length > 10) {
      console.log(`  ... and ${items.length - 10} more`);
    }
  }
}

// Look for potentially valuable unmapped financial tags
console.log('\n\n💰 POTENTIALLY VALUABLE UNMAPPED FINANCIAL TAGS:\n');
console.log('='.repeat(60));

const financialKeywords = [
  'Revenue', 'Income', 'Expense', 'Asset', 'Liability', 'Equity',
  'Cash', 'Debt', 'Investment', 'Dividend', 'Tax', 'Depreciation',
  'Amortization', 'Interest', 'Lease', 'Inventory', 'Receivable',
  'Payable', 'Property', 'Goodwill', 'Intangible'
];

const valuableUnmapped = categorized.unmapped.filter(({ tag }) => {
  // Exclude metadata tags
  if (tag.includes('TextBlock') || tag.includes('Table') ||
      tag.includes('Axis') || tag.includes('Member') ||
      tag.includes('Domain') || tag.includes('Abstract') ||
      tag.includes('LineItems') || tag.includes('Disclosure')) {
    return false;
  }

  // Include if it contains financial keywords
  return financialKeywords.some(keyword => tag.includes(keyword));
}).sort((a, b) => b.count - a.count).slice(0, 50);

console.log('\nTop 50 valuable unmapped tags (excluding metadata):');
console.log('-'.repeat(60));

for (const { tag, count } of valuableUnmapped) {
  console.log(`  ${count.toLocaleString().padStart(8)} × ${tag}`);
}

// Summary statistics
console.log('\n\n📊 SUMMARY STATISTICS:\n');
console.log('='.repeat(60));

const metadataTags = ['textBlock', 'disclosure', 'policyTextBlock', 'table',
                      'lineItems', 'axis', 'member', 'domain', 'abstract'];
const metadataCount = metadataTags.reduce((sum, cat) => sum + patterns[cat].length, 0);

console.log(`Total unmapped tags: ${categorized.unmapped.length}`);
console.log(`  • Metadata tags (TextBlock, Disclosure, etc.): ${metadataCount} (${((metadataCount / categorized.unmapped.length) * 100).toFixed(1)}%)`);
console.log(`  • Potentially valuable financial tags: ${valuableUnmapped.length}`);
console.log(`  • Other: ${categorized.unmapped.length - metadataCount - valuableUnmapped.length}`);

console.log('\n💡 RECOMMENDATIONS:\n');
console.log('='.repeat(60));

if (metadataCount / categorized.unmapped.length > 0.5) {
  console.log('✅ Most unmapped tags are metadata (TextBlock, Disclosure, etc.)');
  console.log('   These are typically narrative text fields, not financial data.');
  console.log('   Current 79.2% coverage is excellent for financial metrics!\n');
}

if (valuableUnmapped.length > 0) {
  console.log('⚠️  Found potentially valuable unmapped financial tags.');
  console.log('   Review the list above to identify new patterns to add.\n');
}

console.log('\nDone! ✨\n');
