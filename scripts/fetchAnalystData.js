#!/usr/bin/env node
/**
 * Batch Analyst Data Fetcher
 *
 * Fetches analyst estimates from Yahoo Finance for all companies in the database.
 * Prioritizes companies that have financial data (more likely to have analyst coverage).
 *
 * Usage:
 *   node scripts/fetchAnalystData.js [options]
 *
 * Options:
 *   --limit N       Limit to N companies (default: all)
 *   --skip N        Skip first N companies (for resuming)
 *   --delay MS      Delay between requests in ms (default: 600)
 *   --priority      Only fetch for companies with financial data (recommended)
 */

const Database = require('better-sqlite3');
const path = require('path');
const AnalystEstimatesFetcher = require('../src/services/analystEstimates');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const limit = parseInt(getArg('limit', '0')) || 0;
const skip = parseInt(getArg('skip', '0')) || 0;
const delay = parseInt(getArg('delay', '600')) || 600;
const priorityOnly = args.includes('--priority');

// Database setup
const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);
const fetcher = new AnalystEstimatesFetcher(db);
fetcher.minDelay = delay;

// Stats tracking
let processed = 0;
let success = 0;
let failed = 0;
let noData = 0;
let skipped = 0;
const startTime = Date.now();

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function printProgress(current, total, symbol) {
  const elapsed = Date.now() - startTime;
  const rate = processed / (elapsed / 1000);
  const remaining = (total - current) / rate;

  process.stdout.write(`\r[${current}/${total}] ${symbol.padEnd(8)} | ✓${success} ✗${failed} ø${noData} | ${rate.toFixed(1)}/s | ETA: ${formatDuration(remaining * 1000)}    `);
}

async function main() {
  console.log('\n📊 Analyst Data Batch Fetcher');
  console.log('=' .repeat(50));

  // Get companies to process
  let query = `
    SELECT c.id, c.symbol, c.name,
           (SELECT COUNT(*) FROM financial_data fd WHERE fd.company_id = c.id) as has_financials
    FROM companies c
    WHERE c.symbol IS NOT NULL AND c.symbol != ''
  `;

  if (priorityOnly) {
    query += ` AND EXISTS (SELECT 1 FROM financial_data fd WHERE fd.company_id = c.id)`;
    console.log('Mode: Priority only (companies with financial data)');
  } else {
    console.log('Mode: All companies');
  }

  // Skip companies that already have recent analyst data (< 7 days old)
  query += `
    AND NOT EXISTS (
      SELECT 1 FROM analyst_estimates ae
      WHERE ae.company_id = c.id
      AND ae.fetched_at > datetime('now', '-7 days')
    )
  `;

  query += ` ORDER BY has_financials DESC, c.symbol ASC`;

  if (limit > 0) {
    query += ` LIMIT ${limit}`;
  }
  if (skip > 0) {
    query += ` OFFSET ${skip}`;
  }

  const companies = db.prepare(query).all();
  const total = companies.length;

  console.log(`Found ${total} companies to process`);
  console.log(`Delay: ${delay}ms between requests`);
  console.log(`Estimated time: ${formatDuration(total * delay)}`);
  console.log('=' .repeat(50));
  console.log('');

  if (total === 0) {
    console.log('No companies to process. All analyst data is up to date.');
    return;
  }

  // Process companies
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    try {
      printProgress(i + 1, total, company.symbol);

      const data = await fetcher.fetchAnalystData(company.symbol);
      processed++;

      if (data && data.priceTargets && data.priceTargets.numberOfAnalysts > 0) {
        await fetcher.storeAnalystData(company.id, data);
        success++;
      } else if (data) {
        noData++;
      } else {
        failed++;
      }
    } catch (error) {
      processed++;
      failed++;
      // Log errors but continue
      if (!error.message.includes('Quote not found')) {
        console.error(`\n  Error for ${company.symbol}: ${error.message}`);
      }
    }
  }

  // Final summary
  console.log('\n\n' + '=' .repeat(50));
  console.log('📈 Fetch Complete!');
  console.log('=' .repeat(50));
  console.log(`Total processed: ${processed}`);
  console.log(`  ✓ With analyst data: ${success}`);
  console.log(`  ø No analyst coverage: ${noData}`);
  console.log(`  ✗ Failed/not found: ${failed}`);
  console.log(`Time taken: ${formatDuration(Date.now() - startTime)}`);

  // Show current database stats
  const dbStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN signal = 'strong_buy' THEN 1 END) as strong_buys,
      COUNT(CASE WHEN signal = 'buy' THEN 1 END) as buys,
      COUNT(CASE WHEN upside_potential > 20 THEN 1 END) as high_upside
    FROM analyst_estimates
  `).get();

  console.log('\nDatabase totals:');
  console.log(`  Total analyst records: ${dbStats.total}`);
  console.log(`  Strong Buy signals: ${dbStats.strong_buys}`);
  console.log(`  Buy signals: ${dbStats.buys}`);
  console.log(`  High upside (>20%): ${dbStats.high_upside}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Partial results saved.');
  console.log(`Processed: ${processed} | Success: ${success} | Failed: ${failed}`);
  console.log(`Resume with: --skip ${skip + processed}`);
  process.exit(0);
});

main().catch(console.error);
