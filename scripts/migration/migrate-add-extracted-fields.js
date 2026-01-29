// migrate-add-extracted-fields.js - Add extracted financial fields for query performance
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🔄 MIGRATING DATABASE: Adding extracted financial fields\n');
console.log('='.repeat(80));

// Check current columns
const columns = database.prepare(`PRAGMA table_info(financial_data)`).all();
const columnNames = columns.map(c => c.name);

console.log('\nCurrent financial_data columns:');
columnNames.forEach(name => console.log(`  - ${name}`));

const columnsToAdd = [
  // Balance Sheet
  { name: 'total_assets', type: 'REAL', comment: 'Total assets (extracted for performance)' },
  { name: 'total_liabilities', type: 'REAL', comment: 'Total liabilities' },
  { name: 'shareholder_equity', type: 'REAL', comment: 'Shareholder equity' },
  { name: 'current_assets', type: 'REAL', comment: 'Current assets' },
  { name: 'current_liabilities', type: 'REAL', comment: 'Current liabilities' },
  { name: 'cash_and_equivalents', type: 'REAL', comment: 'Cash and equivalents' },
  { name: 'long_term_debt', type: 'REAL', comment: 'Long-term debt' },
  { name: 'short_term_debt', type: 'REAL', comment: 'Short-term debt' },

  // Income Statement
  { name: 'total_revenue', type: 'REAL', comment: 'Total revenue' },
  { name: 'net_income', type: 'REAL', comment: 'Net income' },
  { name: 'operating_income', type: 'REAL', comment: 'Operating income' },
  { name: 'cost_of_revenue', type: 'REAL', comment: 'Cost of revenue' },
  { name: 'gross_profit', type: 'REAL', comment: 'Gross profit' },

  // Cash Flow
  { name: 'operating_cashflow', type: 'REAL', comment: 'Operating cash flow' },
  { name: 'capital_expenditures', type: 'REAL', comment: 'Capital expenditures' }
];

let addedCount = 0;

for (const col of columnsToAdd) {
  if (!columnNames.includes(col.name)) {
    console.log(`\n➕ Adding column: ${col.name} (${col.comment})`);

    try {
      database.exec(`
        ALTER TABLE financial_data
        ADD COLUMN ${col.name} ${col.type}
      `);
      console.log(`   ✅ Added ${col.name}`);
      addedCount++;
    } catch (error) {
      console.error(`   ❌ Failed to add ${col.name}: ${error.message}`);
    }
  } else {
    console.log(`\n✓ Column ${col.name} already exists`);
  }
}

console.log('\n' + '='.repeat(80));

if (addedCount > 0) {
  console.log(`\n✅ Migration complete! Added ${addedCount} new column(s).`);
  console.log('\nBENEFITS:');
  console.log('  ✓ Fast queries without JSON parsing');
  console.log('  ✓ Can use SQL aggregations (SUM, AVG, etc.)');
  console.log('  ✓ Easy filtering and sorting on financial fields');
  console.log('  ✓ Complete XBRL data still in "data" JSON for custom queries');

  console.log('\nNEXT STEPS:');
  console.log('  1. Re-import companies to populate extracted fields');
  console.log('  2. Query any XBRL field from "data" JSON:');
  console.log('     SELECT json_extract(data, "$.xbrl.AccountsReceivableNetCurrent")');
  console.log('  3. Use extracted fields for fast queries:');
  console.log('     SELECT * FROM financial_data WHERE total_revenue > 100000000000');
} else {
  console.log('\n✅ No migration needed - all columns already exist.');
}

// Show updated schema
console.log('\n📋 Updated financial_data schema:\n');
const updatedColumns = database.prepare(`PRAGMA table_info(financial_data)`).all();
updatedColumns.forEach(col => {
  const pk = col.pk ? ' [PRIMARY KEY]' : '';
  const notnull = col.notnull ? ' NOT NULL' : '';
  const dflt = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
  console.log(`  ${col.name.padEnd(25)} ${col.type.padEnd(10)}${notnull}${dflt}${pk}`);
});

console.log('\n' + '='.repeat(80) + '\n');
