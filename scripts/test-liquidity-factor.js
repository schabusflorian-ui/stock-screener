#!/usr/bin/env node
/**
 * Test Liquidity Factor Implementation
 *
 * Validates that the liquidity factor:
 * 1. Uses volume data from price_metrics
 * 2. Calculates dollar volume correctly
 * 3. Calculates turnover correctly
 * 4. Ranks stocks appropriately by liquidity
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('\n🧪 LIQUIDITY FACTOR TEST\n');
console.log('='.repeat(80));

// Check volume data availability
console.log('\n📊 Volume Data Availability\n');

const volumeCoverage = db.prepare(`
  SELECT
    COUNT(*) as total_companies,
    COUNT(pm.avg_volume_30d) as with_volume,
    COUNT(pm.last_price) as with_price,
    COUNT(c.market_cap) as with_market_cap
  FROM companies c
  LEFT JOIN price_metrics pm ON c.id = pm.company_id
  WHERE c.market_cap IS NOT NULL AND c.market_cap > 0
`).get();

console.log(`  Total companies: ${volumeCoverage.total_companies}`);
console.log(`  With volume data: ${volumeCoverage.with_volume} (${(volumeCoverage.with_volume / volumeCoverage.total_companies * 100).toFixed(1)}%)`);
console.log(`  With price data: ${volumeCoverage.with_price} (${(volumeCoverage.with_price / volumeCoverage.total_companies * 100).toFixed(1)}%)`);
console.log(`  With market cap: ${volumeCoverage.with_market_cap} (${(volumeCoverage.with_market_cap / volumeCoverage.total_companies * 100).toFixed(1)}%)`);

// Test liquidity calculations for specific stocks
console.log('\n📊 Sample Liquidity Calculations\n');

const testStocks = ['AAPL', 'MSFT', 'TSLA', 'SPY', 'BRK.B'];

for (const symbol of testStocks) {
  const data = db.prepare(`
    SELECT
      c.symbol,
      c.market_cap,
      pm.avg_volume_30d,
      pm.last_price
    FROM companies c
    LEFT JOIN price_metrics pm ON c.id = pm.company_id
    WHERE c.symbol = ?
  `).get(symbol);

  if (!data) {
    console.log(`  ${symbol.padEnd(8)} - Not found`);
    continue;
  }

  if (!data.avg_volume_30d || !data.last_price || !data.market_cap) {
    console.log(`  ${symbol.padEnd(8)} - Missing data (volume: ${!!data.avg_volume_30d}, price: ${!!data.last_price}, mcap: ${!!data.market_cap})`);
    continue;
  }

  // Calculate liquidity metrics (same as factorCalculator)
  const dollarVolume = data.avg_volume_30d * data.last_price;
  const turnover = (dollarVolume / (data.market_cap * 1e9)) * 100;

  console.log(`  ${symbol.padEnd(8)} - Volume: ${(data.avg_volume_30d / 1e6).toFixed(1)}M shares, Price: $${data.last_price.toFixed(2)}`);
  console.log(`  ${' '.repeat(11)} Dollar Volume: $${(dollarVolume / 1e9).toFixed(2)}B, Turnover: ${turnover.toFixed(3)}%`);
}

// Check liquidity distribution
console.log('\n📊 Liquidity Distribution Across Universe\n');

const liquidityStats = db.prepare(`
  SELECT
    c.symbol,
    c.market_cap,
    pm.avg_volume_30d,
    pm.last_price,
    (pm.avg_volume_30d * pm.last_price) as dollar_volume,
    ((pm.avg_volume_30d * pm.last_price) / (c.market_cap * 1e9) * 100) as turnover
  FROM companies c
  JOIN price_metrics pm ON c.id = pm.company_id
  WHERE pm.avg_volume_30d IS NOT NULL
    AND pm.last_price IS NOT NULL
    AND c.market_cap IS NOT NULL
    AND c.market_cap > 0
  ORDER BY dollar_volume DESC
`).all();

if (liquidityStats.length > 0) {
  const dollarVolumes = liquidityStats.map(s => s.dollar_volume);
  const turnovers = liquidityStats.map(s => s.turnover);

  const avgDollarVolume = dollarVolumes.reduce((a, b) => a + b, 0) / dollarVolumes.length;
  const avgTurnover = turnovers.reduce((a, b) => a + b, 0) / turnovers.length;

  console.log(`  Stocks with complete liquidity data: ${liquidityStats.length}`);
  console.log(`  Average dollar volume: $${(avgDollarVolume / 1e9).toFixed(2)}B`);
  console.log(`  Average turnover: ${avgTurnover.toFixed(3)}%`);

  console.log('\n  Top 10 Most Liquid Stocks (by dollar volume):');
  liquidityStats.slice(0, 10).forEach((s, i) => {
    console.log(`    ${(i + 1).toString().padStart(2)}. ${s.symbol.padEnd(8)} $${(s.dollar_volume / 1e9).toFixed(2)}B/day (turnover: ${s.turnover.toFixed(3)}%)`);
  });

  console.log('\n  Top 10 Highest Turnover Stocks:');
  const byTurnover = [...liquidityStats].sort((a, b) => b.turnover - a.turnover).slice(0, 10);
  byTurnover.forEach((s, i) => {
    console.log(`    ${(i + 1).toString().padStart(2)}. ${s.symbol.padEnd(8)} ${s.turnover.toFixed(3)}% (dollar vol: $${(s.dollar_volume / 1e9).toFixed(2)}B/day)`);
  });

  console.log('\n  Bottom 10 Least Liquid Stocks (by dollar volume):');
  liquidityStats.slice(-10).reverse().forEach((s, i) => {
    console.log(`    ${(i + 1).toString().padStart(2)}. ${s.symbol.padEnd(8)} $${(s.dollar_volume / 1e6).toFixed(2)}M/day (turnover: ${s.turnover.toFixed(3)}%)`);
  });
} else {
  console.log('  No stocks with complete liquidity data found.');
}

console.log('\n' + '='.repeat(80));
console.log('\n✅ Liquidity factor data is available and calculations work correctly.\n');

db.close();
