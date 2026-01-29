// Test intelligent tag mapping system
const IntelligentTagMapper = require('./src/bulk-import/intelligentTagMapper');
const { shouldImportTag } = require('./src/bulk-import/tagMappings');

console.log('\n🧪 Testing Intelligent Tag Mapping System\n');
console.log('='.repeat(100));

// Test tags from our analysis (the top missing tags)
const testTags = [
  // Currently MISSING but critical
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  'MarketableSecuritiesCurrent',
  'MarketableSecuritiesNoncurrent',
  'OperatingLeaseRightOfUseAsset',
  'OperatingLeaseLiabilityCurrent',
  'OperatingLeaseLiabilityNoncurrent',
  'LongTermDebtAndCapitalLeaseObligations',
  'DeferredIncomeTaxAssetsNet',
  'DeferredIncomeTaxLiabilitiesNet',
  'AdditionalPaidInCapital',
  'PreferredStockValue',
  'TreasuryStockCommonValue',
  'OtherAssetsNoncurrent',
  'OtherLiabilitiesNoncurrent',
  'CommercialPaper',
  'PrepaidExpenseAndOtherAssetsCurrent',

  // Currently CAPTURED
  'Assets',
  'Liabilities',
  'StockholdersEquity',
  'CashAndCashEquivalentsAtCarryingValue',

  // Edge cases
  'LiabilitiesAndStockholdersEquity',
  'RestrictedCashAndCashEquivalents',
  'SubordinatedLongTermDebt'
];

const mapper = new IntelligentTagMapper();

console.log('\n📊 COMPARISON: Old System vs New Intelligent Mapper\n');
console.log('Tag Name                                                     | Old | New | Method         | Canonical');
console.log('-'.repeat(140));

let oldImported = 0;
let newImported = 0;

for (const tag of testTags) {
  const oldSystem = shouldImportTag(tag) ? '✅' : '❌';
  const newMapping = mapper.mapTag(tag);
  const newSystem = newMapping.method !== 'unmapped' ? '✅' : '❌';

  if (oldSystem === '✅') oldImported++;
  if (newSystem === '✅') newImported++;

  const tagDisplay = tag.substring(0, 60).padEnd(60);
  const methodDisplay = newMapping.method.padEnd(14);
  const canonicalDisplay = (newMapping.canonical || tag).substring(0, 30);

  console.log(`${tagDisplay} |  ${oldSystem}  |  ${newSystem}  | ${methodDisplay} | ${canonicalDisplay}`);
}

console.log('\n' + '='.repeat(140));

console.log(`\n📈 COVERAGE IMPROVEMENT:\n`);
console.log(`Old System: ${oldImported}/${testTags.length} tags imported (${((oldImported/testTags.length)*100).toFixed(1)}%)`);
console.log(`New System: ${newImported}/${testTags.length} tags imported (${((newImported/testTags.length)*100).toFixed(1)}%)`);
console.log(`Improvement: +${newImported - oldImported} tags (+${(((newImported - oldImported)/testTags.length)*100).toFixed(1)} percentage points)\n`);

const stats = mapper.getStats();
console.log('📊 MAPPING METHOD BREAKDOWN:\n');
console.log(`   Exact Matches:     ${stats.exactMatches} (hardcoded mappings)`);
console.log(`   Pattern Matches:   ${stats.patternMatches} (intelligent rules)`);
console.log(`   Auto-Categorized:  ${stats.autoCategorized} (semantic inference)`);
console.log(`   Unmapped:          ${stats.unmapped} (unknown)\n`);

// Show some examples of pattern matching
console.log('🔍 PATTERN MATCHING EXAMPLES:\n');
const log = mapper.getMappingLog();
const patternExamples = log.filter(m => m.method === 'pattern').slice(0, 10);

for (const example of patternExamples) {
  console.log(`   ${example.original}`);
  console.log(`   → Mapped to: ${example.canonical} (rule: ${example.rule})\n`);
}

console.log('='.repeat(100));
console.log('\n💡 KEY BENEFITS:\n');
console.log('1. ✅ Automatically handles tag variations');
console.log('2. ✅ No manual mapping needed for common patterns');
console.log('3. ✅ Future-proof - new tags auto-categorized');
console.log('4. ✅ Preserves data that would otherwise be lost');
console.log('5. ✅ Can be refined and expanded over time\n');
