// Analyze how SEC items are grouped during import
const fs = require('fs');
const readline = require('readline');

async function analyze() {
  const filePath = 'data/sec-bulk/2020q4/num.txt';
  const adsh = '0000320193-20-000096'; // Apple 10-K FY2020

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
        value: parts[8]
      };
      if (item.uom === 'USD') {
        items.push(item);
      }
    }
  }

  console.log('Total USD items for Apple 10-K FY2020:', items.length);

  // Group by ddate_qtrs as the import does
  const byPeriod = new Map();
  for (const item of items) {
    const qtrs = parseInt(item.qtrs) || 0;
    // 10-K filter
    if (qtrs !== 0 && qtrs !== 3 && qtrs !== 4) continue;

    const key = item.ddate + '_' + item.qtrs;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(item);
  }

  console.log('\nGroups created:');
  for (const [key, groupItems] of byPeriod) {
    // Count unique tags
    const tags = [...new Set(groupItems.map(i => i.tag))];
    console.log('  ' + key + ': ' + groupItems.length + ' items, ' + tags.length + ' unique tags');

    // Show some sample tags for 20200930 groups
    if (key === '20200930_0') {
      const hasAssets = groupItems.some(i => i.tag === 'Assets');
      const hasLiabilities = groupItems.some(i => i.tag === 'Liabilities');
      const hasEquity = groupItems.some(i => i.tag === 'StockholdersEquity');
      console.log('    Has Assets: ' + hasAssets);
      console.log('    Has Liabilities: ' + hasLiabilities);
      console.log('    Has StockholdersEquity: ' + hasEquity);
      console.log('    Sample tags:', tags.slice(0, 10).join(', '));
    }
    if (key === '20200930_4') {
      const hasRevenue = groupItems.some(i => i.tag === 'Revenues' || i.tag === 'RevenueFromContractWithCustomerExcludingAssessedTax');
      const hasNetIncome = groupItems.some(i => i.tag === 'NetIncomeLoss');
      console.log('    Has Revenue: ' + hasRevenue);
      console.log('    Has NetIncome: ' + hasNetIncome);
    }
  }

  // Check what happens in groupLineItemsByStatement for 20200930_0
  console.log('\n--- Simulating groupLineItemsByStatement for 20200930_0 ---');
  const group0 = byPeriod.get('20200930_0');
  if (group0) {
    // Filter same as in the actual code
    let balanceSheetItems = 0;
    let assetsFound = false;
    for (const item of group0) {
      const itemQtrs = parseInt(item.qtrs) || 0;
      // Balance sheet filter: only qtrs=0
      if (itemQtrs === 0) {
        // Check tag exclusions
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
        balanceSheetItems++;
        if (item.tag === 'Assets') {
          assetsFound = true;
          console.log('Found Assets tag with value: ' + item.value);
        }
      }
    }
    console.log('Balance sheet items after filtering: ' + balanceSheetItems);
    console.log('Assets tag found: ' + assetsFound);
  }
}

analyze().catch(console.error);
