const { TAG_MAPPINGS, getCanonicalTag, getStatementType, shouldImportTag } = require('./src/bulk-import/tagMappings');

// Apple 2020 balance sheet tags found in SEC data
const appleTags = [
  'Assets',
  'AssetsCurrent',
  'AssetsNoncurrent',
  'CashAndCashEquivalentsAtCarryingValue',
  'AccountsReceivableNetCurrent',
  'InventoryNet',
  'Liabilities',
  'LiabilitiesCurrent',
  'LiabilitiesNoncurrent',
  'AccountsPayableCurrent',
  'StockholdersEquity',
  'LongTermDebt',
  'LongTermDebtNoncurrent',
  'OtherAssetsCurrent',
  'OtherAssetsNoncurrent',
  'OtherLiabilitiesCurrent',
  'PropertyPlantAndEquipmentNet',
  'CommercialPaper',
  'ContractWithCustomerLiabilityCurrent',
  'RetainedEarningsAccumulatedDeficit'
];

console.log('\n🔍 Checking which Apple 2020 tags are mapped:\n');
console.log('Tag Name                                      | Canonical         | Statement Type | Imported?');
console.log('='.repeat(100));

let importedCount = 0;
let skippedCount = 0;

for (const tag of appleTags) {
  const canonical = getCanonicalTag(tag);
  const statementType = getStatementType(canonical);
  const shouldImport = shouldImportTag(tag);
  const imported = shouldImport ? '✅ YES' : '❌ NO';

  if (shouldImport) importedCount++;
  else skippedCount++;

  const tagPadded = (tag + ' '.repeat(45)).substring(0, 45);
  const canonicalPadded = (canonical + ' '.repeat(17)).substring(0, 17);
  const statementPadded = (statementType + ' '.repeat(14)).substring(0, 14);

  console.log(`${tagPadded} | ${canonicalPadded} | ${statementPadded} | ${imported}`);
}

console.log('\n' + '='.repeat(100));
console.log(`✅ Imported: ${importedCount} tags`);
console.log(`❌ Skipped:  ${skippedCount} tags`);
console.log('\n');
