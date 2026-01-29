// deduplicate-financial-data.js
// Remove duplicate financial records, keeping the most complete one
// Run: node scripts/deduplicate-financial-data.js [--dry-run]

const path = require('path');
const projectRoot = path.join(__dirname, '..');
const db = require(path.join(projectRoot, 'src/database'));

const database = db.getDatabase();
const isDryRun = process.argv.includes('--dry-run');

// Key fields to check for completeness (prioritize records with these)
const IMPORTANT_FIELDS = {
  balance_sheet: ['shareholderEquity', 'StockholdersEquity', 'totalAssets', 'Assets', 'currentAssets', 'AssetsCurrent', 'currentLiabilities', 'LiabilitiesCurrent'],
  income_statement: ['revenue', 'totalRevenue', 'Revenues', 'netIncome', 'NetIncomeLoss', 'operatingIncome', 'OperatingIncomeLoss'],
  cash_flow: ['operatingCashFlow', 'NetCashProvidedByUsedInOperatingActivities', 'capitalExpenditure', 'PaymentsToAcquirePropertyPlantAndEquipment']
};

function countImportantFields(data, statementType) {
  const fields = IMPORTANT_FIELDS[statementType] || [];
  let count = 0;

  for (const field of fields) {
    if (data[field] !== null && data[field] !== undefined && data[field] !== '') {
      count++;
    }
  }

  return count;
}

function countAllFields(data) {
  return Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '').length;
}

async function deduplicateFinancialData() {
  console.log('\n🔧 FINANCIAL DATA DEDUPLICATION\n');
  console.log(isDryRun ? '⚠️  DRY RUN - No changes will be made\n' : '');
  console.log('='.repeat(60));

  // Find all duplicates
  const duplicates = database.prepare(`
    SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type,
           COUNT(*) as count,
           GROUP_CONCAT(id) as ids
    FROM financial_data
    GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
    HAVING COUNT(*) > 1
  `).all();

  console.log(`\n📊 Found ${duplicates.length} duplicate groups\n`);

  let totalDeleted = 0;
  let processedGroups = 0;

  // Process each duplicate group
  for (const dup of duplicates) {
    const ids = dup.ids.split(',').map(Number);

    // Get all records for this group
    const records = database.prepare(`
      SELECT id, data, updated_at
      FROM financial_data
      WHERE id IN (${ids.join(',')})
    `).all();

    // Score each record
    const scored = records.map(r => {
      const data = JSON.parse(r.data);
      return {
        id: r.id,
        data,
        updatedAt: r.updated_at,
        importantFieldCount: countImportantFields(data, dup.statement_type),
        totalFieldCount: countAllFields(data)
      };
    });

    // Sort by: important fields (desc), total fields (desc), updated_at (desc)
    scored.sort((a, b) => {
      if (b.importantFieldCount !== a.importantFieldCount) {
        return b.importantFieldCount - a.importantFieldCount;
      }
      if (b.totalFieldCount !== a.totalFieldCount) {
        return b.totalFieldCount - a.totalFieldCount;
      }
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    // Keep the first (best), delete the rest
    const keepId = scored[0].id;
    const deleteIds = scored.slice(1).map(s => s.id);

    if (deleteIds.length > 0) {
      // Get company symbol for logging
      const company = database.prepare('SELECT symbol FROM companies WHERE id = ?').get(dup.company_id);
      const symbol = company?.symbol || `ID:${dup.company_id}`;

      if (!isDryRun) {
        database.prepare(`DELETE FROM financial_data WHERE id IN (${deleteIds.join(',')})`).run();
      }

      totalDeleted += deleteIds.length;
      processedGroups++;

      // Log significant cases
      if (scored[0].importantFieldCount > scored[1]?.importantFieldCount) {
        console.log(`✅ ${symbol} ${dup.fiscal_year} ${dup.fiscal_period} ${dup.statement_type}: Kept ID ${keepId} (${scored[0].importantFieldCount} key fields), deleted ${deleteIds.length} inferior records`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📋 SUMMARY`);
  console.log(`   Duplicate groups processed: ${processedGroups}`);
  console.log(`   Records ${isDryRun ? 'to delete' : 'deleted'}: ${totalDeleted}`);

  if (isDryRun) {
    console.log(`\n⚠️  This was a dry run. Run without --dry-run to apply changes.`);
  } else {
    console.log(`\n✅ Deduplication complete!`);

    // Verify
    const remainingDuplicates = database.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type
        FROM financial_data
        GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
        HAVING COUNT(*) > 1
      )
    `).get();

    console.log(`   Remaining duplicate groups: ${remainingDuplicates.count}`);
  }

  console.log('\n');
}

deduplicateFinancialData().catch(console.error);
