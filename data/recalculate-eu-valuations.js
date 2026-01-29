/**
 * Recalculate EU/UK Valuation Metrics
 *
 * Combines price_metrics (market cap, last_price) with xbrl_fundamental_metrics
 * to calculate valuation ratios (P/E, P/B, P/S, EV/EBITDA) and update calculated_metrics table.
 */

const Database = require('better-sqlite3');
const path = require('path');
const { ValuationService } = require('../src/services/xbrl/valuationService');

const dbPath = path.join(__dirname, 'stocks.db');
const db = new Database(dbPath);

console.log('\n=== EU/UK Valuation Metrics Recalculation ===\n');

// Initialize ValuationService
const valuationService = new ValuationService(db);

// Get current stats
console.log('Current coverage:');
const statsBefore = valuationService.getStats();
console.log(statsBefore);
console.log('');

// Run valuation update
console.log('Calculating valuation metrics...');
const result = valuationService.updateAllValuations();

console.log('\n=== Results ===');
console.log(`Processed: ${result.processed} company-periods`);
console.log(`Updated: ${result.updated}`);
console.log(`Skipped (no calculation possible): ${result.skipped}`);
console.log(`No price data: ${result.noPrice}`);
console.log(`Errors: ${result.errors}`);

// Get updated stats
console.log('\n=== Updated Coverage ===');
const statsAfter = valuationService.getStats();
console.log(statsAfter);

db.close();
console.log('\n✅ Done!\n');
