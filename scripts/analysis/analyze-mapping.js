// Analyze tag mapping for Apple 2020 balance sheet
const fs = require('fs');
const readline = require('readline');
const IntelligentTagMapper = require('./src/bulk-import/intelligentTagMapper');

async function analyze() {
  const filePath = 'data/sec-bulk/2020q4/num.txt';
  const adsh = '0000320193-20-000096'; // Apple 10-K FY2020
  const mapper = new IntelligentTagMapper();

  const items = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.startsWith(adsh)) {
      const parts = line.split('\t');
      const item = {
        tag: parts[1],
        ddate: parts[3],
        qtrs: parts[4],
        uom: parts[5],
        coreg: parts[6] + parts[7], // Combined coreg fields
        value: parts[8]
      };
      // Only USD, qtrs=0, ddate=20200930
      if (item.uom === 'USD' && item.qtrs === '0' && item.ddate === '20200930') {
        items.push(item);
      }
    }
  }

  console.log('Total balance sheet items for Apple FY2020:', items.length);

  // Simulate groupLineItemsByStatement
  const statements = {
    balance_sheet: {},
    income_statement: {},
    cash_flow: {}
  };

  for (const item of items) {
    const mapping = mapper.mapTag(item.tag);

    if (mapping.statementType !== 'unknown') {
      const itemQtrs = parseInt(item.qtrs) || 0;

      // Balance sheet filter
      if (mapping.statementType === 'balance_sheet') {
        if (itemQtrs !== 0) continue;
      } else {
        if (itemQtrs === 0) continue;
      }

      // Tag exclusion check
      if (mapping.statementType === 'balance_sheet') {
        const tag = item.tag.toLowerCase();
        if (tag.includes('increasedecrease') ||
            tag.includes('proceedsfrom') ||
            tag.includes('paymentsto') ||
            tag.includes('paymentsfor') ||
            tag.includes('duringperiod') ||
            tag.includes('repurchased') ||
            tag.includes('issued')) {
          continue;
        }
      }

      const camelCase = mapping.canonical.charAt(0).toLowerCase() + mapping.canonical.slice(1);
      const currentValue = parseFloat(item.value) || 0;
      const existingValue = parseFloat(statements[mapping.statementType][camelCase]) || 0;

      if (Math.abs(currentValue) > Math.abs(existingValue)) {
        statements[mapping.statementType][camelCase] = item.value;
        statements[mapping.statementType][item.tag] = item.value;
      }

      // Log key items
      if (item.tag === 'Assets' || item.tag === 'Liabilities' || item.tag === 'StockholdersEquity') {
        console.log(`\nProcessed ${item.tag}:`);
        console.log(`  Mapping: ${mapping.statementType} / ${mapping.canonical}`);
        console.log(`  camelCase: ${camelCase}`);
        console.log(`  Value: ${item.value}`);
        console.log(`  Coreg: "${item.coreg}"`);
      }
    }
  }

  console.log('\n--- Balance Sheet Result ---');
  console.log('Keys in balance_sheet:', Object.keys(statements.balance_sheet).length);
  console.log('\nKey fields:');
  console.log('  totalAssets:', statements.balance_sheet.totalAssets || 'NOT FOUND');
  console.log('  Assets:', statements.balance_sheet.Assets || 'NOT FOUND');
  console.log('  totalLiabilities:', statements.balance_sheet.totalLiabilities || 'NOT FOUND');
  console.log('  Liabilities:', statements.balance_sheet.Liabilities || 'NOT FOUND');
  console.log('  shareholderEquity:', statements.balance_sheet.shareholderEquity || 'NOT FOUND');
  console.log('  StockholdersEquity:', statements.balance_sheet.StockholdersEquity || 'NOT FOUND');

  console.log('\nAll balance_sheet keys:', Object.keys(statements.balance_sheet).sort().join(', '));
}

analyze().catch(console.error);
