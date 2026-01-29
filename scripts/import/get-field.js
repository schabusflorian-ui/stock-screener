#!/usr/bin/env node
// Quick utility to get any field from any company/quarter
// Usage: node get-field.js NVDA 2023-10-29 accountsReceivable

const db = require('./src/database');

const database = db.getDatabase();

function getField(symbol, fiscalDate, fieldName, statementType = 'balance_sheet') {
  const result = database.prepare(`
    SELECT
      c.symbol,
      c.name,
      f.fiscal_period,
      f.period_type,
      f.data
    FROM financial_data f
    JOIN companies c ON c.id = f.company_id
    WHERE c.symbol = ? COLLATE NOCASE
      AND f.fiscal_date_ending = ?
      AND f.statement_type = ?
  `).get(symbol.toUpperCase(), fiscalDate, statementType);

  if (!result) {
    console.log(`\n❌ No data found for ${symbol} on ${fiscalDate}`);
    console.log(`   Statement type: ${statementType}`);
    console.log(`   Period type: quarterly\n`);
    return null;
  }

  const data = JSON.parse(result.data);

  // Try to find the field
  let value = null;
  let location = null;

  // Check top-level
  if (data[fieldName] !== undefined && data[fieldName] !== null) {
    value = data[fieldName];
    location = 'top-level';
  }
  // Check XBRL
  else if (data.xbrl && data.xbrl[fieldName] !== undefined && data.xbrl[fieldName] !== null) {
    value = data.xbrl[fieldName];
    location = 'xbrl';
  }

  if (value === null) {
    console.log(`\n⚠️  Field '${fieldName}' not found in ${statementType}`);
    console.log(`\n📋 Available fields:`);
    console.log(`\nTop-level (${Object.keys(data).length} fields):`);
    Object.keys(data).filter(k => k !== 'xbrl').forEach(k => {
      if (data[k] !== null && data[k] !== undefined) {
        console.log(`  - ${k}`);
      }
    });
    if (data.xbrl) {
      console.log(`\nXBRL (${Object.keys(data.xbrl).length} fields):`);
      Object.keys(data.xbrl).forEach(k => {
        if (data.xbrl[k] !== null && data.xbrl[k] !== undefined) {
          console.log(`  - ${k}`);
        }
      });
    }
    return null;
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`${result.name} (${result.symbol})`);
  console.log('═══════════════════════════════════════════════');
  console.log(`Period: ${result.fiscal_period} (${result.period_type}) - ${fiscalDate}`);
  console.log(`Statement: ${statementType}`);
  console.log(`\n📊 ${fieldName}:`);
  console.log(`   Value: ${typeof value === 'number' ? '$' + value.toLocaleString() : value}`);
  if (typeof value === 'number') {
    console.log(`   Millions: $${(value / 1e6).toFixed(2)}M`);
    console.log(`   Billions: $${(value / 1e9).toFixed(2)}B`);
  }
  console.log(`   Location: ${location}`);
  console.log('═══════════════════════════════════════════════\n');

  return value;
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('\n📊 Get Field Utility');
  console.log('═══════════════════════════════════════════════\n');
  console.log('Usage: node get-field.js <SYMBOL> <DATE> <FIELD> [STATEMENT_TYPE]\n');
  console.log('Arguments:');
  console.log('  SYMBOL         Stock symbol (e.g., NVDA)');
  console.log('  DATE           Fiscal date ending (e.g., 2023-10-29)');
  console.log('  FIELD          Field name (e.g., accountsReceivable)');
  console.log('  STATEMENT_TYPE Optional: balance_sheet, income_statement, or cash_flow');
  console.log('                 Default: balance_sheet\n');
  console.log('Examples:');
  console.log('  node get-field.js NVDA 2023-10-29 accountsReceivable');
  console.log('  node get-field.js NVDA 2023-10-29 totalRevenue income_statement');
  console.log('  node get-field.js AAPL 2023-09-30 cashAndEquivalents');
  console.log('  node get-field.js MSFT 2023-06-30 goodwill\n');
  console.log('Common Fields:');
  console.log('  Balance Sheet: accountsReceivable, accountsPayable, inventory,');
  console.log('                 goodwill, propertyPlantEquipment, intangibleAssets');
  console.log('  Income: totalRevenue, netIncome, researchAndDevelopment,');
  console.log('          operatingIncome, grossProfit');
  console.log('  Cash Flow: operatingCashflow, capitalExpenditures, freeCashFlow\n');
  process.exit(0);
}

const [symbol, date, field, statementType] = args;

console.log('📊 Initializing database...');
console.log('✅ Database schema created successfully!');
console.log(`📁 Database location: ${require('path').join(__dirname, 'data/stocks.db')}`);

getField(symbol, date, field, statementType || 'balance_sheet');
