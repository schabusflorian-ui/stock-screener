#!/usr/bin/env node
/**
 * Batch PRISM Report Generator
 * Generates PRISM reports for top stocks WITHOUT using Claude API
 * Uses rule-based generation for narratives, full DCF/valuation calculations
 */

const path = require('path');
const Database = require('better-sqlite3');

// Initialize database
const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

// Top 50 stocks by market cap / popularity
const TOP_STOCKS = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  // Other mega-caps
  'BRK.B', 'JPM', 'V', 'MA', 'UNH', 'JNJ', 'XOM', 'PG', 'HD', 'CVX',
  // Large-cap growth
  'COST', 'NFLX', 'AMD', 'ADBE', 'INTC', 'CSCO', 'PEP', 'KO', 'MRK', 'ABBV',
  // Large-cap value
  'BAC', 'WFC', 'DIS', 'VZ', 'T', 'CMCSA', 'NKE', 'MCD', 'WMT', 'TGT',
  // Popular mid-caps
  'PYPL', 'SQ', 'SHOP', 'UBER', 'ABNB', 'ZM', 'SNOW', 'PLTR', 'COIN', 'RBLX'
];

async function main() {
  console.log('='.repeat(60));
  console.log('BATCH PRISM REPORT GENERATOR');
  console.log('='.repeat(60));
  console.log(`Generating reports for ${TOP_STOCKS.length} stocks`);
  console.log('Mode: Rule-based (no AI API calls)\n');

  // Dynamically import the report generator
  const PRISMReportGeneratorV2 = require('../src/services/prismReportGeneratorV2');
  const generator = new PRISMReportGeneratorV2(db);

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  const startTime = Date.now();

  for (let i = 0; i < TOP_STOCKS.length; i++) {
    const symbol = TOP_STOCKS[i];
    const progress = `[${i + 1}/${TOP_STOCKS.length}]`;

    try {
      // Check if company exists in database
      const company = db.prepare('SELECT id, symbol, name FROM companies WHERE symbol = ?').get(symbol);
      if (!company) {
        console.log(`${progress} ${symbol}: SKIPPED - Company not in database`);
        results.skipped.push({ symbol, reason: 'Not in database' });
        continue;
      }

      // Check if we have minimum data (financials + prices)
      const hasFinancials = db.prepare('SELECT 1 FROM financial_data WHERE company_id = ? LIMIT 1').get(company.id);
      const hasPrices = db.prepare('SELECT 1 FROM daily_prices WHERE company_id = ? LIMIT 1').get(company.id);

      if (!hasFinancials || !hasPrices) {
        console.log(`${progress} ${symbol}: SKIPPED - Missing ${!hasFinancials ? 'financials' : 'prices'}`);
        results.skipped.push({ symbol, reason: `Missing ${!hasFinancials ? 'financials' : 'prices'}` });
        continue;
      }

      console.log(`${progress} ${symbol}: Generating...`);
      const reportStart = Date.now();

      // Generate report WITHOUT AI (rule-based)
      const report = await generator.generateReport(symbol, {
        useAI: false,      // No Claude API calls
        useV2: true,       // Use V2 format with Data Fusion
        forceRefresh: true // Regenerate even if cached
      });

      const reportTime = ((Date.now() - reportStart) / 1000).toFixed(1);
      console.log(`${progress} ${symbol}: SUCCESS in ${reportTime}s - Score: ${report.overallScore}/10`);

      results.success.push({
        symbol,
        score: report.overallScore,
        time: parseFloat(reportTime),
        dcfBase: report.triangulatedValuation?.perspectives?.dcfIntrinsic?.baseCase
      });

    } catch (error) {
      console.log(`${progress} ${symbol}: FAILED - ${error.message}`);
      results.failed.push({ symbol, error: error.message });
    }

    // Small delay to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('BATCH GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total time: ${totalTime} minutes`);
  console.log(`Success: ${results.success.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Skipped: ${results.skipped.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed stocks:');
    results.failed.forEach(f => console.log(`  - ${f.symbol}: ${f.error}`));
  }

  if (results.skipped.length > 0) {
    console.log('\nSkipped stocks:');
    results.skipped.forEach(s => console.log(`  - ${s.symbol}: ${s.reason}`));
  }

  console.log('\nAverage generation time:',
    (results.success.reduce((sum, r) => sum + r.time, 0) / results.success.length).toFixed(1), 'seconds');

  // Close database
  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});