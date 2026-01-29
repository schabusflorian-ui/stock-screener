// test-screening.js
const ScreeningService = require('./src/services/screeningService');

const screener = new ScreeningService();

console.log('\n🔍 TESTING STOCK SCREENER\n');
console.log('='.repeat(60));

// Test 1: Buffett Quality
const buffett = screener.buffettQuality();
console.log('Results:');
buffett.forEach((stock, i) => {
  console.log(`${i + 1}. ${stock.symbol} - ${stock.name}`);
  console.log(`   ROIC: ${stock.roic}% | FCF Yield: ${stock.fcf_yield}% | Debt/Eq: ${stock.debt_to_equity}`);
  console.log('');
});

// Test 2: Magic Formula
const magic = screener.magicFormula();
console.log('\n📊 Magic Formula results:');
magic.forEach((stock, i) => {
  console.log(`${i + 1}. ${stock.symbol}: ROIC=${stock.roic}%, P/E=${stock.pe_ratio}`);
});

// Test 3: Custom screen
console.log('\n🎯 CUSTOM SCREEN: Tech stocks with ROIC > 30%\n');
const custom = screener.screen({
  minROIC: 30,
  sectors: ['TECHNOLOGY', 'Manufacturing'],
  sortBy: 'roic',
  limit: 10
});

custom.forEach((stock, i) => {
  console.log(`${i + 1}. ${stock.symbol} (${stock.sector}): ROIC=${stock.roic}%`);
});

console.log('\n' + '='.repeat(60) + '\n');