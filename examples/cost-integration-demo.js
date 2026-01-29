#!/usr/bin/env node
/**
 * Cost Integration Demo
 *
 * Shows how to integrate the new transaction cost model into backtesting.
 * Run with: node examples/cost-integration-demo.js
 */

const path = require('path');
const { db } = require(path.join(__dirname, '../src/database'));

// Import cost modules
const {
  BacktestCostCalculator,
  createCostAwareSimulator,
  compareCostProfiles,
  COST_PROFILES
} = require('../src/services/costs');

console.log('='.repeat(70));
console.log('TRANSACTION COST INTEGRATION DEMO');
console.log('='.repeat(70));

// ============================================================================
// DEMO 1: Basic cost calculator usage
// ============================================================================

console.log('\n1. BASIC COST CALCULATOR');
console.log('-'.repeat(50));

const calculator = new BacktestCostCalculator(db, {
  profile: 'HEDGE_FUND',
  trackTaxes: true,
  lotMethod: 'hifo'
});

// Simulate some trades
const trades = [
  { symbol: 'AAPL', price: 175, shares: 500, side: 'buy', date: '2024-01-15' },
  { symbol: 'MSFT', price: 390, shares: 300, side: 'buy', date: '2024-01-15' },
  { symbol: 'GOOGL', price: 145, shares: 1000, side: 'buy', date: '2024-01-15' },
  { symbol: 'AAPL', price: 180, shares: 250, side: 'sell', date: '2024-03-15' },
];

console.log('\nTrade Execution with Costs:');
console.log('-'.repeat(50));

for (const trade of trades) {
  const fillPrice = calculator.getExecutionPrice(
    trade.symbol,
    trade.price,
    trade.shares,
    trade.side,
    trade.date
  );

  const costBps = Math.abs((fillPrice - trade.price) / trade.price * 10000);

  console.log(`  ${trade.side.toUpperCase()} ${trade.shares} ${trade.symbol} @ $${trade.price}`);
  console.log(`    -> Fill Price: $${fillPrice.toFixed(2)} (${costBps.toFixed(1)} bps cost)`);

  // Track for taxes
  if (trade.side === 'buy') {
    calculator.recordBuy(trade.symbol, trade.shares, fillPrice, trade.date);
  }
}

// Show statistics
const stats = calculator.getStatistics();
console.log('\nCost Statistics:');
console.log(`  Profile: ${stats.profile}`);
console.log(`  Total Trades: ${stats.totalTrades}`);
console.log(`  Average Cost: ${stats.averageCostBps} bps`);
console.log('  Breakdown:');
console.log(`    Commission: ${stats.breakdown.avgCommissionBps} bps`);
console.log(`    Spread: ${stats.breakdown.avgSpreadBps} bps`);
console.log(`    Market Impact: ${stats.breakdown.avgMarketImpactBps} bps`);
console.log(`    Slippage: ${stats.breakdown.avgSlippageBps} bps`);

// ============================================================================
// DEMO 2: Compare cost profiles
// ============================================================================

console.log('\n\n2. COST PROFILE COMPARISON');
console.log('-'.repeat(50));

// Sample trade data with exit prices
const roundTripTrades = [
  { symbol: 'AAPL', price: 175, shares: 1000, side: 'buy', date: '2024-01-15', exitPrice: 185 },
  { symbol: 'MSFT', price: 390, shares: 500, side: 'buy', date: '2024-01-15', exitPrice: 400 },
  { symbol: 'NVDA', price: 480, shares: 200, side: 'buy', date: '2024-01-15', exitPrice: 520 },
  { symbol: 'GOOGL', price: 145, shares: 2000, side: 'buy', date: '2024-01-15', exitPrice: 150 },
];

console.log('\nSimulating trades across different cost models:');
console.log('(Same trades, different assumptions about costs)\n');

const comparison = compareCostProfiles(db, roundTripTrades);

console.log('Profile          | Avg Cost | P&L After Costs');
console.log('-'.repeat(50));

for (const [profile, result] of Object.entries(comparison)) {
  console.log(
    `${result.name.padEnd(16)} | ${result.avgCostBps.padStart(6)} bps | $${parseFloat(result.totalReturn).toLocaleString()}`
  );
}

// ============================================================================
// DEMO 3: How to integrate into UnifiedBacktestEngine
// ============================================================================

console.log('\n\n3. INTEGRATION EXAMPLE');
console.log('-'.repeat(50));

console.log(`
HOW TO UPGRADE UnifiedBacktestEngine:

CURRENT CODE (unifiedBacktestEngine.js line 46-47):
  this.options = {
    transactionCosts: 0.001, // 10 bps
    slippage: 0.0005, // 5 bps
    ...
  };

UPGRADED CODE:
  const { BacktestCostCalculator } = require('../costs');

  constructor(db, options = {}) {
    ...
    // Initialize cost calculator
    this.costCalculator = new BacktestCostCalculator(db, {
      profile: options.costProfile || 'HEDGE_FUND',
      trackTaxes: options.trackTaxes || false
    });
  }

CURRENT TRADE EXECUTION:
  const slippage = this.options.slippage;
  const fillPrice = side === 'buy'
    ? price * (1 + slippage)
    : price * (1 - slippage);

UPGRADED TRADE EXECUTION:
  const fillPrice = this.costCalculator.getExecutionPrice(
    symbol, price, shares, side, date
  );

BENEFITS:
  1. Dynamic costs based on order size & liquidity
  2. Market impact modeling (large orders cost more)
  3. Per-symbol cost tracking
  4. Tax lot tracking (if enabled)
  5. Cost profile comparison (retail vs institutional)
`);

// ============================================================================
// DEMO 4: Market impact scaling
// ============================================================================

console.log('\n4. MARKET IMPACT SCALING');
console.log('-'.repeat(50));

console.log('\nHow costs scale with order size (AAPL example):');
console.log('Order Size    | % of ADV | Total Cost');
console.log('-'.repeat(45));

const testSizes = [100, 500, 1000, 5000, 10000, 50000];
const scalingCalculator = new BacktestCostCalculator(db, { profile: 'HEDGE_FUND' });

for (const shares of testSizes) {
  scalingCalculator.reset();
  const fillPrice = scalingCalculator.getExecutionPrice('AAPL', 175, shares, 'buy', '2024-01-15');
  const costBps = (fillPrice - 175) / 175 * 10000;
  const stats = scalingCalculator.getStatistics();

  // Estimate ADV percentage (rough)
  const advPct = (shares / 50000000 * 100).toFixed(2); // Assume 50M ADV

  console.log(
    `${shares.toString().padStart(8)} shares | ${advPct.padStart(5)}% | ${costBps.toFixed(1).padStart(6)} bps`
  );
}

// ============================================================================
// DEMO 5: Tax implications
// ============================================================================

console.log('\n\n5. TAX TRACKING DEMO');
console.log('-'.repeat(50));

const taxCalculator = new BacktestCostCalculator(db, {
  profile: 'HEDGE_FUND',
  trackTaxes: true,
  lotMethod: 'hifo'
});

// Build positions
console.log('\nBuilding position in AAPL:');
const purchases = [
  { shares: 100, price: 150, date: '2023-06-01' },
  { shares: 100, price: 170, date: '2023-09-01' },
  { shares: 100, price: 160, date: '2024-01-01' },
];

for (const p of purchases) {
  taxCalculator.recordBuy('AAPL', p.shares, p.price, p.date);
  console.log(`  Bought ${p.shares} @ $${p.price} on ${p.date}`);
}

// Sell some shares
console.log('\nSelling 150 shares @ $165 (HIFO method):');
const sale = taxCalculator.recordSell('AAPL', 150, 165, '2024-06-01');

if (sale) {
  console.log(`  Total Proceeds: $${sale.totalProceeds.toFixed(2)}`);
  console.log(`  Cost Basis: $${sale.totalBasis.toFixed(2)}`);
  console.log(`  Realized Gain/Loss: $${sale.totalGainLoss.toFixed(2)}`);
  console.log(`  Short-term portion: $${sale.shortTermGainLoss.toFixed(2)}`);
  console.log(`  Long-term portion: $${sale.longTermGainLoss.toFixed(2)}`);

  console.log('\n  Lots sold (HIFO = highest cost first):');
  for (const lot of sale.lotsSold) {
    console.log(`    ${lot.sharesSold} shares from ${lot.purchaseDate} @ $${lot.basis.toFixed(2)}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('SUMMARY: Cost modeling is now integrated and ready for backtesting');
console.log('='.repeat(70));

process.exit(0);
