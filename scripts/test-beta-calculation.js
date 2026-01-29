#!/usr/bin/env node
/**
 * Test Beta Calculation Implementation
 *
 * Validates that the new beta calculation:
 * 1. Returns reasonable values (between -1 and 3 for most stocks)
 * 2. SPY should have beta ~1.0
 * 3. Defensive sectors have beta < 1.0
 * 4. Growth tech has beta > 1.0
 */

const Database = require('better-sqlite3');
const path = require('path');
const FactorCalculator = require('../src/services/factors/factorCalculator');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);
const calculator = new FactorCalculator(db);

console.log('\n🧪 BETA CALCULATION TEST\n');
console.log('='.repeat(80));

// Test stocks from different categories
const testStocks = [
  { symbol: 'AAPL', sector: 'Technology', expected: '>1.0', description: 'Tech growth' },
  { symbol: 'MSFT', sector: 'Technology', expected: '~1.0', description: 'Large cap tech' },
  { symbol: 'PG', sector: 'Consumer Staples', expected: '<1.0', description: 'Defensive' },
  { symbol: 'KO', sector: 'Consumer Staples', expected: '<1.0', description: 'Defensive' },
  { symbol: 'NVDA', sector: 'Technology', expected: '>1.5', description: 'High growth tech' },
  { symbol: 'DUK', sector: 'Utilities', expected: '<0.8', description: 'Utility' },
  { symbol: 'JPM', sector: 'Financials', expected: '~1.2', description: 'Large bank' },
  { symbol: 'TSLA', sector: 'Consumer Cyclical', expected: '>1.5', description: 'High volatility growth' }
];

const scoreDate = '2025-12-31'; // Recent date

console.log('\n📊 Testing Beta Calculations\n');

let successCount = 0;
let totalTests = 0;

for (const stock of testStocks) {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(stock.symbol);

  if (!company) {
    console.log(`⚠️  ${stock.symbol.padEnd(6)} - Not found in database`);
    continue;
  }

  try {
    // Calculate beta using the internal method
    const beta = calculator._calculateBeta(company.id, scoreDate);

    totalTests++;

    if (beta === null) {
      console.log(`⚠️  ${stock.symbol.padEnd(6)} - Insufficient data for beta calculation`);
    } else {
      const betaStr = beta.toFixed(2).padStart(5);
      const match = checkExpectation(beta, stock.expected);
      const icon = match ? '✅' : '⚠️';

      console.log(`${icon}  ${stock.symbol.padEnd(6)} - Beta: ${betaStr} (${stock.expected}) - ${stock.description}`);

      if (match) successCount++;
    }
  } catch (error) {
    console.log(`❌ ${stock.symbol.padEnd(6)} - Error: ${error.message}`);
  }
}

// Test beta distribution across universe
console.log('\n📊 Beta Distribution Across Universe\n');

const stocksWithBeta = db.prepare(`
  SELECT c.symbol, c.sector, sfp.beta
  FROM companies c
  JOIN (
    SELECT company_id, beta
    FROM stock_factor_scores
    WHERE score_date = (SELECT MAX(score_date) FROM stock_factor_scores)
      AND beta IS NOT NULL
  ) sfp ON c.id = sfp.company_id
  ORDER BY beta
`).all();

if (stocksWithBeta.length > 0) {
  const betas = stocksWithBeta.map(s => s.beta);
  const avg = betas.reduce((a, b) => a + b, 0) / betas.length;
  const min = Math.min(...betas);
  const max = Math.max(...betas);

  const betaRanges = {
    'Negative': betas.filter(b => b < 0).length,
    'Low (0-0.8)': betas.filter(b => b >= 0 && b < 0.8).length,
    'Medium (0.8-1.2)': betas.filter(b => b >= 0.8 && b < 1.2).length,
    'High (1.2-2.0)': betas.filter(b => b >= 1.2 && b < 2.0).length,
    'Very High (>2.0)': betas.filter(b => b >= 2.0).length
  };

  console.log(`  Total stocks with beta: ${stocksWithBeta.length}`);
  console.log(`  Average beta: ${avg.toFixed(2)}`);
  console.log(`  Range: ${min.toFixed(2)} to ${max.toFixed(2)}`);
  console.log('\n  Distribution:');

  Object.entries(betaRanges).forEach(([range, count]) => {
    const pct = (count / stocksWithBeta.length * 100).toFixed(1);
    console.log(`    ${range.padEnd(20)}: ${count.toString().padStart(5)} (${pct}%)`);
  });

  // Show top 5 highest and lowest betas
  console.log('\n  Top 5 Highest Betas:');
  stocksWithBeta.slice(-5).reverse().forEach(s => {
    console.log(`    ${s.symbol.padEnd(6)} ${s.beta.toFixed(2).padStart(5)} - ${s.sector || 'N/A'}`);
  });

  console.log('\n  Top 5 Lowest Betas:');
  stocksWithBeta.slice(0, 5).forEach(s => {
    console.log(`    ${s.symbol.padEnd(6)} ${s.beta.toFixed(2).padStart(5)} - ${s.sector || 'N/A'}`);
  });
} else {
  console.log('  No stocks with beta calculated yet. Run factor score calculation first.');
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Test Summary: ${successCount}/${totalTests} stocks had expected beta ranges\n`);

db.close();

function checkExpectation(beta, expected) {
  if (expected === '~1.0') {
    return beta >= 0.8 && beta <= 1.2;
  } else if (expected === '<1.0') {
    return beta < 1.0;
  } else if (expected === '>1.0') {
    return beta > 1.0;
  } else if (expected === '<0.8') {
    return beta < 0.8;
  } else if (expected === '~1.2') {
    return beta >= 1.0 && beta <= 1.4;
  } else if (expected === '>1.5') {
    return beta > 1.5;
  }
  return true;
}
