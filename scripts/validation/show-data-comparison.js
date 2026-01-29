const db = require('./src/database').getDatabase();

// Get our metrics for a few companies
const companies = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'JPM'];

console.log('=== OUR DATA (Annual vs TTM from Quarters) ===\n');

for (const symbol of companies) {
  // Annual data
  const annual = db.prepare(`
    SELECT m.*, c.symbol
    FROM calculated_metrics m
    JOIN companies c ON c.id = m.company_id
    WHERE c.symbol = ? AND m.period_type = 'annual'
    ORDER BY m.fiscal_year DESC
    LIMIT 1
  `).get(symbol);

  // Last 4 quarters for TTM
  const quarters = db.prepare(`
    SELECT m.*
    FROM calculated_metrics m
    JOIN companies c ON c.id = m.company_id
    WHERE c.symbol = ? AND m.period_type = 'quarterly'
    ORDER BY m.fiscal_period DESC
    LIMIT 4
  `).all(symbol);

  const avg = (arr, key) => {
    const vals = arr.map(q => q[key]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
  };

  const fmt = (v) => v != null ? v.toFixed(1) : 'N/A';
  const fmt2 = (v) => v != null ? v.toFixed(2) : 'N/A';

  console.log('━'.repeat(60));
  console.log(`${symbol} | Annual: ${annual?.fiscal_period || 'N/A'} | Latest Q: ${quarters[0]?.fiscal_period || 'N/A'}`);
  console.log('━'.repeat(60));

  console.log('                    Annual     TTM (avg Q)');
  console.log(`  gross_margin:     ${fmt(annual?.gross_margin).padEnd(10)} ${fmt(avg(quarters, 'gross_margin'))}`);
  console.log(`  operating_margin: ${fmt(annual?.operating_margin).padEnd(10)} ${fmt(avg(quarters, 'operating_margin'))}`);
  console.log(`  net_margin:       ${fmt(annual?.net_margin).padEnd(10)} ${fmt(avg(quarters, 'net_margin'))}`);
  console.log(`  roe:              ${fmt(annual?.roe).padEnd(10)} ${fmt(avg(quarters, 'roe'))}`);
  console.log(`  roa:              ${fmt(annual?.roa).padEnd(10)} ${fmt(avg(quarters, 'roa'))}`);
  console.log(`  current_ratio:    ${fmt2(annual?.current_ratio).padEnd(10)} ${fmt2(quarters[0]?.current_ratio)}`);
  console.log(`  quick_ratio:      ${fmt2(annual?.quick_ratio).padEnd(10)} ${fmt2(quarters[0]?.quick_ratio)}`);
  console.log(`  debt_to_equity:   ${fmt2(annual?.debt_to_equity).padEnd(10)} ${fmt2(quarters[0]?.debt_to_equity)}`);
  console.log('');
}

console.log('\n=== YAHOO FINANCE REFERENCE VALUES (approximate) ===');
console.log('Source: Yahoo Finance Statistics tab (TTM values)');
console.log('');
console.log('AAPL:  gross_margin ~46%, operating_margin ~30%, net_margin ~24%, ROE ~147%');
console.log('MSFT:  gross_margin ~70%, operating_margin ~45%, net_margin ~36%, ROE ~35%');
console.log('GOOGL: gross_margin ~58%, operating_margin ~32%, net_margin ~26%, ROE ~30%');
console.log('NVDA:  gross_margin ~75%, operating_margin ~62%, net_margin ~55%, ROE ~115%');
console.log('JPM:   gross_margin N/A (bank), operating_margin N/A, net_margin ~30%, ROE ~17%');
console.log('\nNote: Yahoo values are approximate and may vary slightly by date.');
