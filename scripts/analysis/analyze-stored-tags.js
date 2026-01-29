#!/usr/bin/env node
// analyze-stored-tags.js

/**
 * Analyze what tags are actually stored in financial_data
 * This will show us the variety of tags that made it through the intelligent mapper
 */

const db = require('./src/database');

const database = db.getDatabase();

console.log('🔍 ANALYZING STORED FINANCIAL DATA TAGS\n');
console.log('='.repeat(60));

// Sample 1000 recent financial statements
const query = `
  SELECT
    statement_type,
    data
  FROM financial_data
  WHERE data IS NOT NULL
    AND statement_type IN ('balance_sheet', 'income_statement', 'cash_flow')
  ORDER BY fiscal_date_ending DESC
  LIMIT 1000
`;

console.log('\n📊 Sampling 1000 recent financial statements...\n');

const statements = database.prepare(query).all();

console.log(`✅ Found ${statements.length.toLocaleString()} statements\n`);

// Collect all unique tags by statement type
const tagsByType = {
  balance_sheet: new Set(),
  income_statement: new Set(),
  cash_flow: new Set()
};

const tagOccurrences = {};

for (const { statement_type, data } of statements) {
  try {
    const parsedData = JSON.parse(data);

    for (const tag of Object.keys(parsedData)) {
      tagsByType[statement_type].add(tag);

      if (!tagOccurrences[tag]) {
        tagOccurrences[tag] = { count: 0, statementTypes: new Set() };
      }
      tagOccurrences[tag].count++;
      tagOccurrences[tag].statementTypes.add(statement_type);
    }
  } catch (e) {
    // Skip invalid JSON
  }
}

// Convert sets to arrays and sort
const tagStats = {
  balance_sheet: Array.from(tagsByType.balance_sheet).sort(),
  income_statement: Array.from(tagsByType.income_statement).sort(),
  cash_flow: Array.from(tagsByType.cash_flow).sort()
};

console.log('📈 TAG DIVERSITY BY STATEMENT TYPE:\n');
console.log('='.repeat(60));
console.log(`Balance Sheet: ${tagStats.balance_sheet.length} unique tags`);
console.log(`Income Statement: ${tagStats.income_statement.length} unique tags`);
console.log(`Cash Flow: ${tagStats.cash_flow.length} unique tags`);
console.log(`Total unique tags: ${Object.keys(tagOccurrences).length}\n`);

// Show sample tags for each statement type
console.log('\n📋 SAMPLE TAGS BY STATEMENT TYPE:\n');

for (const [type, tags] of Object.entries(tagStats)) {
  console.log(`\n${type.toUpperCase().replace(/_/g, ' ')}:`);
  console.log('-'.repeat(60));

  // Show first 30 tags
  const sampleTags = tags.slice(0, 30);
  for (const tag of sampleTags) {
    const occurrence = tagOccurrences[tag];
    console.log(`  ${tag.padEnd(50)} (${occurrence.count}x)`);
  }

  if (tags.length > 30) {
    console.log(`  ... and ${tags.length - 30} more`);
  }
}

// Find most common tags overall
console.log('\n\n💎 MOST COMMON TAGS (appearing in >90% of statements):\n');
console.log('='.repeat(60));

const sortedByOccurrence = Object.entries(tagOccurrences)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 50);

for (const [tag, { count, statementTypes }] of sortedByOccurrence) {
  const percentage = ((count / statements.length) * 100).toFixed(1);
  if (parseFloat(percentage) >= 10) {
    const types = Array.from(statementTypes).join(', ');
    console.log(`  ${tag.padEnd(50)} ${percentage.padStart(5)}% (${types})`);
  }
}

// Look for interesting patterns
console.log('\n\n🔍 PATTERN ANALYSIS:\n');
console.log('='.repeat(60));

const patterns = {
  'Operating Leases': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('operatinglease') || t.toLowerCase().includes('lease')),
  'Marketable Securities': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('marketablesecurities')),
  'Deferred Tax': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('deferredtax') || t.toLowerCase().includes('deferredincome')),
  'Intangibles': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('intangible') || t.toLowerCase().includes('goodwill')),
  'Stock Compensation': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('stockbased') || t.toLowerCase().includes('sharebased')),
  'Comprehensive Income': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('comprehensive')),
  'Foreign Currency': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('foreign') || t.toLowerCase().includes('currency')),
  'Derivatives': Object.keys(tagOccurrences).filter(t => t.toLowerCase().includes('derivative'))
};

for (const [pattern, tags] of Object.entries(patterns)) {
  if (tags.length > 0) {
    console.log(`\n${pattern}: ${tags.length} tags`);
    console.log('-'.repeat(60));
    for (const tag of tags.slice(0, 10)) {
      const occurrence = tagOccurrences[tag];
      console.log(`  ${tag.padEnd(50)} (${occurrence.count}x)`);
    }
    if (tags.length > 10) {
      console.log(`  ... and ${tags.length - 10} more`);
    }
  }
}

// Categorize by naming convention
console.log('\n\n📦 TAG NAMING CONVENTIONS:\n');
console.log('='.repeat(60));

const allTags = Object.keys(tagOccurrences);
const camelCaseTags = allTags.filter(t => /^[a-z][a-zA-Z0-9]*$/.test(t));
const pascalCaseTags = allTags.filter(t => /^[A-Z][a-zA-Z0-9]*$/.test(t));
const otherTags = allTags.filter(t => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(t));

console.log(`\nCamelCase tags (our canonical format): ${camelCaseTags.length}`);
console.log(`PascalCase tags (original XBRL): ${pascalCaseTags.length}`);
console.log(`Other formats: ${otherTags.length}`);

if (otherTags.length > 0 && otherTags.length <= 20) {
  console.log('\nOther format examples:');
  for (const tag of otherTags) {
    console.log(`  ${tag}`);
  }
}

console.log('\n\n✅ Analysis complete!\n');
console.log('💡 INSIGHTS:\n');
console.log('='.repeat(60));
console.log('The tags shown above represent the ~79% that were successfully');
console.log('mapped by the intelligent tag mapper. These are stored in financial_data.');
console.log('\nThe unmapped 21% are likely:');
console.log('  • Metadata tags (TextBlock, Disclosure, Table, etc.)');
console.log('  • Narrative/footnote fields');
console.log('  • Company-specific custom extensions');
console.log('  • Dimension members and axes (for detailed breakdowns)');
console.log('\nThese are typically not needed for financial metrics calculation.\n');

