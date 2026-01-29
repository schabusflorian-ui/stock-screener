// migrate-add-sec-fields.js - Add SEC metadata fields to financial_data table
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🔄 MIGRATING DATABASE: Adding SEC metadata fields\n');
console.log('='.repeat(80));

// Check if columns already exist
const columns = database.prepare(`PRAGMA table_info(financial_data)`).all();
const columnNames = columns.map(c => c.name);

console.log('\nCurrent financial_data columns:');
columnNames.forEach(name => console.log(`  - ${name}`));

const columnsToAdd = [
  { name: 'fiscal_period', type: 'TEXT', comment: 'FY, Q1, Q2, Q3 (from SEC)' },
  { name: 'form', type: 'TEXT', comment: '10-K or 10-Q (from SEC)' },
  { name: 'filed_date', type: 'TEXT', comment: 'When filed with SEC' }
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
  console.log('\nNew columns will be populated on next import.');
  console.log('To populate existing data, re-import companies with:');
  console.log('  node reimport-single.js SYMBOL');
  console.log('  node import-sp500.js');
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
