#!/usr/bin/env node
/**
 * Austrian Tax (KESt) Demo
 *
 * Demonstrates tax tracking for Austrian investors:
 * - 27.5% flat KESt on all capital gains
 * - No short/long-term distinction
 * - Loss offsetting within calendar year
 * - Dividend withholding tax handling
 *
 * Run with: node examples/austrian-tax-demo.js
 */

const { AustrianTaxTracker, KEST_RATE } = require('../src/services/costs');

console.log('='.repeat(70));
console.log('AUSTRIAN TAX (KESt) DEMO');
console.log('='.repeat(70));
console.log(`\nKESt Rate: ${(KEST_RATE * 100).toFixed(1)}% flat on all capital gains\n`);

// Create tracker
const tracker = new AustrianTaxTracker({ year: 2024 });

// ============================================================================
// DEMO 1: Build positions throughout the year
// ============================================================================

console.log('1. BUILDING POSITIONS');
console.log('-'.repeat(50));

const purchases = [
  { symbol: 'AAPL', shares: 50, price: 170, date: '2024-01-15' },
  { symbol: 'AAPL', shares: 30, price: 185, date: '2024-03-10' },
  { symbol: 'MSFT', shares: 25, price: 380, date: '2024-02-01' },
  { symbol: 'NVDA', shares: 20, price: 500, date: '2024-04-15' },
];

for (const p of purchases) {
  const totalCost = p.shares * p.price;
  tracker.addLot(p.symbol, p.shares, totalCost, p.date);
  console.log(`  Bought ${p.shares} ${p.symbol} @ €${p.price} = €${totalCost.toLocaleString()}`);
}

// ============================================================================
// DEMO 2: Selling with gains (KESt due)
// ============================================================================

console.log('\n2. SELLING WITH GAIN');
console.log('-'.repeat(50));

const sale1 = tracker.sellShares('AAPL', 40, 195, '2024-06-15');
console.log('\nSold 40 AAPL @ €195:');
console.log(`  Proceeds: €${sale1.totalProceeds.toFixed(2)}`);
console.log(`  Cost Basis: €${sale1.totalBasis.toFixed(2)}`);
console.log(`  Gain: €${sale1.totalGainLoss.toFixed(2)}`);
console.log(`  KESt (27.5%): €${sale1.kest.toFixed(2)}`);
console.log(`  Net after tax: €${(sale1.totalProceeds - sale1.kest).toFixed(2)}`);

console.log('\n  Lots sold (FIFO):');
for (const lot of sale1.lotsSold) {
  console.log(`    ${lot.sharesSold} shares from ${lot.purchaseDate.split('T')[0]} @ €${lot.purchasePrice.toFixed(2)} -> €${lot.gainLoss.toFixed(2)} gain`);
}

// ============================================================================
// DEMO 3: Selling with loss (offsets gains)
// ============================================================================

console.log('\n3. SELLING WITH LOSS (Tax Loss Harvesting)');
console.log('-'.repeat(50));

// NVDA dropped - sell for a loss
const sale2 = tracker.sellShares('NVDA', 20, 420, '2024-08-01');
console.log('\nSold 20 NVDA @ €420 (bought at €500):');
console.log(`  Proceeds: €${sale2.totalProceeds.toFixed(2)}`);
console.log(`  Cost Basis: €${sale2.totalBasis.toFixed(2)}`);
console.log(`  Loss: €${sale2.totalGainLoss.toFixed(2)}`);
console.log(`  KESt: €${sale2.kest.toFixed(2)} (no tax on losses)`);

// ============================================================================
// DEMO 4: Dividend handling
// ============================================================================

console.log('\n4. DIVIDEND WITH FOREIGN WITHHOLDING');
console.log('-'.repeat(50));

// US dividend with 15% withholding
const dividend = tracker.recordDividend('AAPL', 50, 7.5, '2024-03-15');
console.log('\nAPPL Dividend:');
console.log(`  Gross: €${dividend.grossAmount.toFixed(2)}`);
console.log(`  US Withholding (15%): €${dividend.withholdingTax.toFixed(2)}`);
console.log(`  Austrian KESt due: €${dividend.kestDue.toFixed(2)}`);
console.log(`  Withholding credit: €${dividend.withholdingCredit.toFixed(2)}`);
console.log(`  Net KESt to pay: €${dividend.netKest.toFixed(2)}`);

// ============================================================================
// DEMO 5: Year-end summary
// ============================================================================

console.log('\n5. YEAR-END TAX SUMMARY (2024)');
console.log('-'.repeat(50));

const summary = tracker.getYearSummary(2024);
console.log('\nCapital Gains:');
console.log(`  Total Gains: €${summary.capitalGains.totalGains.toFixed(2)}`);
console.log(`  Total Losses: €${summary.capitalGains.totalLosses.toFixed(2)}`);
console.log(`  Net Gain: €${summary.capitalGains.netGain.toFixed(2)}`);
console.log(`  KESt on gains: €${summary.capitalGains.kest.toFixed(2)}`);

console.log('\nDividends:');
console.log(`  Gross: €${summary.dividends.grossAmount.toFixed(2)}`);
console.log(`  KESt: €${summary.dividends.kest.toFixed(2)}`);

console.log('\nTOTAL:');
console.log(`  Taxable Income: €${summary.total.taxableIncome.toFixed(2)}`);
console.log(`  Total KESt Due: €${summary.total.totalKest.toFixed(2)}`);

// ============================================================================
// DEMO 6: Open positions
// ============================================================================

console.log('\n6. OPEN POSITIONS');
console.log('-'.repeat(50));

const currentPrices = {
  'AAPL': 200,
  'MSFT': 420
};

const positions = tracker.getOpenPositions(currentPrices);
console.log('\nCurrent Holdings:');
for (const pos of positions) {
  console.log(`\n  ${pos.symbol}:`);
  console.log(`    Shares: ${pos.shares}`);
  console.log(`    Avg Cost: €${pos.avgCost.toFixed(2)}`);
  console.log(`    Current: €${pos.currentPrice.toFixed(2)}`);
  console.log(`    Unrealized: €${pos.unrealizedGain.toFixed(2)} (${pos.unrealizedGainPct.toFixed(1)}%)`);
  console.log(`    Potential KESt: €${pos.potentialKest.toFixed(2)}`);
}

// ============================================================================
// DEMO 7: Tax planning
// ============================================================================

console.log('\n7. TAX PLANNING');
console.log('-'.repeat(50));

const taxPlan = tracker.estimateYearEndTax(currentPrices, 2024);
console.log(`\n${taxPlan.recommendation}`);

// ============================================================================
// Comparison: Austria vs US
// ============================================================================

console.log('\n\n8. AUSTRIA vs US TAX COMPARISON');
console.log('-'.repeat(50));

console.log(`
| Aspect              | Austria                | USA                    |
|---------------------|------------------------|------------------------|
| Rate                | 27.5% flat (KESt)      | 0-37% (varies)         |
| Holding period      | No distinction         | <1yr: ordinary income  |
|                     |                        | >1yr: 0-20% LTCG       |
| Loss offsetting     | Same calendar year     | $3k/yr + carryforward  |
| Wash sale rule      | None                   | 30-day rule applies    |
| Reporting           | E1kv form              | Schedule D, 8949       |
| Broker withholding  | Austrian brokers auto  | Rare (except 1099)     |
`);

console.log('\n' + '='.repeat(70));
console.log('For Austrian investors: Use AustrianTaxTracker instead of TaxTracker');
console.log('='.repeat(70));
