#!/usr/bin/env node
/**
 * Slow Incremental Financials Backfill
 *
 * Designed to work around Yahoo Finance aggressive rate limiting.
 * Processes ONE company at a time with very long delays.
 * Tracks progress to resume across sessions.
 *
 * Usage:
 *   node src/jobs/slowBackfillFinancials.js                    # Run next company
 *   node src/jobs/slowBackfillFinancials.js --count 3          # Run next 3 companies
 *   node src/jobs/slowBackfillFinancials.js --symbol SAP       # Specific company
 *   node src/jobs/slowBackfillFinancials.js --country FR       # French companies
 *   node src/jobs/slowBackfillFinancials.js --status           # Show progress
 *   node src/jobs/slowBackfillFinancials.js --reset            # Reset progress tracking
 */

require('dotenv').config();

const { getDatabaseAsync } = require('../lib/db');
const YahooFetcher = require('../validation/yahooFetcher');
const fs = require('fs');
const path = require('path');

// Progress file location
const PROGRESS_FILE = path.join(__dirname, '../../data/backfill-progress.json');

// Yahoo Finance suffix by country
const COUNTRY_SUFFIX = {
  'DE': '.DE',
  'FR': '.PA',
  'NL': '.AS',
  'IT': '.MI',
  'ES': '.MC',
  'GB': '.L',
  'CH': '.SW',
  'BE': '.BR',
  'AT': '.VI',
  'SE': '.ST',
  'DK': '.CO',
  'NO': '.OL',
  'FI': '.HE',
  'PT': '.LS',
  'PL': '.WA',
  'GR': '.AT',
  'IE': '.IR',
  'LU': '.LU',
};

// European countries
const EUROPEAN_COUNTRIES = Object.keys(COUNTRY_SUFFIX);

class SlowBackfiller {
  constructor() {
    this.databasePromise = null;
    // Very conservative: 30 second delay, 5 retries, 2 minute wait on rate limit
    this.fetcher = new YahooFetcher({
      delay: 30000,
      maxRetries: 5,
      rateLimitWaitMs: 120000 // 2 minutes on rate limit
    });
    this.progress = this.loadProgress();
  }

  async getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = getDatabaseAsync();
    }
    return this.databasePromise;
  }

  /**
   * Load progress from file
   */
  loadProgress() {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('Could not load progress file, starting fresh');
    }
    return {
      processed: [],
      successful: [],
      failed: [],
      lastRun: null,
      totalRecordsAdded: 0
    };
  }

  /**
   * Save progress to file
   */
  saveProgress() {
    try {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
    } catch (e) {
      console.error('Could not save progress:', e.message);
    }
  }

  /**
   * Reset progress tracking
   */
  resetProgress() {
    this.progress = {
      processed: [],
      successful: [],
      failed: [],
      lastRun: null,
      totalRecordsAdded: 0
    };
    this.saveProgress();
    console.log('✓ Progress reset');
  }

  /**
   * Get Yahoo symbol for a company
   */
  getYahooSymbol(symbol, country) {
    if (symbol.includes('.')) return symbol;
    const suffix = COUNTRY_SUFFIX[country] || '';
    return symbol + suffix;
  }

  /**
   * Get next companies to process
   */
  async getNextCompanies(options = {}) {
    const { country, symbol, count = 1 } = options;

    if (symbol) {
      const database = await this.getDatabase();
      const companyResult = await database.query(`
        SELECT id, symbol, name, country
        FROM companies
        WHERE symbol = $1 COLLATE NOCASE
      `, [symbol]);
      const company = companyResult.rows[0];
      return company ? [company] : [];
    }

    // Get companies that need financial data and haven't been processed
    const processedSet = new Set(this.progress.processed);

    let query = `
      SELECT c.id, c.symbol, c.name, c.country,
             COUNT(f.id) as financial_count
      FROM companies c
      LEFT JOIN financial_data f ON f.company_id = c.id
      WHERE c.symbol IS NOT NULL
        AND c.symbol != ''
        AND LENGTH(c.symbol) <= 10
    `;
    const params = [];

    if (country) {
      query += ' AND c.country = $1';
      params.push(country.toUpperCase());
    } else {
      // Default to European companies
      const placeholders = EUROPEAN_COUNTRIES.map((_, index) => `$${index + 1}`).join(',');
      query += ` AND c.country IN (${placeholders})`;
      params.push(...EUROPEAN_COUNTRIES);
    }

    query += `
      GROUP BY c.id
      HAVING financial_count < 3
      ORDER BY c.market_cap DESC NULLS LAST
    `;

    const database = await this.getDatabase();
    const candidatesResult = await database.query(query, params);
    const candidates = candidatesResult.rows;

    // Filter out already processed
    const unprocessed = candidates.filter(c => !processedSet.has(c.symbol));

    return unprocessed.slice(0, count);
  }

  /**
   * Store financial statements in database
   */
  async storeFinancials(companyId, data) {
    let recordsAdded = 0;

    const database = await this.getDatabase();
    const insertSql = `
      INSERT INTO financial_data (
        company_id, statement_type, fiscal_date_ending,
        fiscal_year, period_type,
        data,
        total_assets, total_liabilities, shareholder_equity,
        current_assets, current_liabilities, cash_and_equivalents,
        long_term_debt, short_term_debt,
        total_revenue, net_income, operating_income,
        cost_of_revenue, gross_profit,
        operating_cashflow, capital_expenditures
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
      DO UPDATE SET
        data = excluded.data,
        total_assets = COALESCE(excluded.total_assets, financial_data.total_assets),
        total_liabilities = COALESCE(excluded.total_liabilities, financial_data.total_liabilities),
        shareholder_equity = COALESCE(excluded.shareholder_equity, financial_data.shareholder_equity),
        current_assets = COALESCE(excluded.current_assets, financial_data.current_assets),
        current_liabilities = COALESCE(excluded.current_liabilities, financial_data.current_liabilities),
        cash_and_equivalents = COALESCE(excluded.cash_and_equivalents, financial_data.cash_and_equivalents),
        long_term_debt = COALESCE(excluded.long_term_debt, financial_data.long_term_debt),
        short_term_debt = COALESCE(excluded.short_term_debt, financial_data.short_term_debt),
        total_revenue = COALESCE(excluded.total_revenue, financial_data.total_revenue),
        net_income = COALESCE(excluded.net_income, financial_data.net_income),
        operating_income = COALESCE(excluded.operating_income, financial_data.operating_income),
        cost_of_revenue = COALESCE(excluded.cost_of_revenue, financial_data.cost_of_revenue),
        gross_profit = COALESCE(excluded.gross_profit, financial_data.gross_profit),
        operating_cashflow = COALESCE(excluded.operating_cashflow, financial_data.operating_cashflow),
        capital_expenditures = COALESCE(excluded.capital_expenditures, financial_data.capital_expenditures),
        updated_at = CURRENT_TIMESTAMP
    `;

    const storeStatements = async (reports, statementType, periodType) => {
      for (const report of (reports || [])) {
        try {
          const isIncome = statementType === 'income_statement';
          const isBalance = statementType === 'balance_sheet';
          const isCashFlow = statementType === 'cash_flow';

          await database.query(
            insertSql,
            [
              companyId,
              statementType,
              report.fiscalDateEnding,
              report.fiscalYear,
              periodType,
              JSON.stringify(report),
              isBalance ? report.totalAssets : null,
              isBalance ? report.totalLiabilities : null,
              isBalance ? report.shareholderEquity : null,
              isBalance ? report.currentAssets : null,
              isBalance ? report.currentLiabilities : null,
              isBalance ? report.cashAndEquivalents : null,
              isBalance ? report.longTermDebt : null,
              isBalance ? report.shortTermDebt : null,
              isIncome ? report.totalRevenue : null,
              isIncome ? report.netIncome : null,
              isIncome ? report.operatingIncome : null,
              isIncome ? report.costOfRevenue : null,
              isIncome ? report.grossProfit : null,
              isCashFlow ? report.operatingCashflow : null,
              isCashFlow ? report.capitalExpenditures : null
            ]
          );
          recordsAdded++;
        } catch (e) {
          // Likely duplicate, which is fine
        }
      }
    };

    // Store all statement types
    for (const period of ['annual', 'quarterly']) {
      await storeStatements(data.incomeStatement[period], 'income_statement', period);
      await storeStatements(data.balanceSheet[period], 'balance_sheet', period);
      await storeStatements(data.cashFlow[period], 'cash_flow', period);
    }

    return recordsAdded;
  }

  /**
   * Process a single company
   */
  async processCompany(company) {
    const yahooSymbol = this.getYahooSymbol(company.symbol, company.country);

    console.log(`\n📊 Processing: ${company.symbol} (${company.name || 'N/A'})`);
    console.log(`   Yahoo symbol: ${yahooSymbol}`);
    console.log(`   Country: ${company.country}`);

    try {
      console.log('   Fetching financials (this may take a while)...');
      const result = await this.fetcher.fetchFinancials(yahooSymbol);

      if (result.success) {
        const recordsAdded = await this.storeFinancials(company.id, result.data);
        console.log(`   ✓ Success: ${recordsAdded} records added`);

        this.progress.successful.push(company.symbol);
        this.progress.totalRecordsAdded += recordsAdded;
        return { success: true, records: recordsAdded };
      } else {
        console.log(`   ✗ Failed: ${result.error}`);
        this.progress.failed.push({ symbol: company.symbol, error: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.log(`   ⚠ Error: ${error.message}`);
      this.progress.failed.push({ symbol: company.symbol, error: error.message });
      return { success: false, error: error.message };
    } finally {
      this.progress.processed.push(company.symbol);
      this.progress.lastRun = new Date().toISOString();
      this.saveProgress();
    }
  }

  /**
   * Show current status
   */
  async showStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('  Slow Backfill Progress');
    console.log('='.repeat(60));
    console.log(`  Last run:        ${this.progress.lastRun || 'Never'}`);
    console.log(`  Total processed: ${this.progress.processed.length}`);
    console.log(`  Successful:      ${this.progress.successful.length}`);
    console.log(`  Failed:          ${this.progress.failed.length}`);
    console.log(`  Records added:   ${this.progress.totalRecordsAdded}`);

    // Show remaining companies
    const remaining = await this.getNextCompanies({ count: 1000 });
    console.log(`  Remaining:       ${remaining.length}`);

    if (remaining.length > 0) {
      console.log('\n  Next companies to process:');
      for (const c of remaining.slice(0, 5)) {
        console.log(`    - ${c.symbol.padEnd(12)} ${(c.name || '').substring(0, 30)}`);
      }
      if (remaining.length > 5) {
        console.log(`    ... and ${remaining.length - 5} more`);
      }
    }

    if (this.progress.failed.length > 0) {
      console.log('\n  Recent failures:');
      for (const f of this.progress.failed.slice(-5)) {
        console.log(`    - ${f.symbol}: ${f.error}`);
      }
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Run the backfill
   */
  async run(options = {}) {
    if (options.status) {
      await this.showStatus();
      return;
    }

    if (options.reset) {
      this.resetProgress();
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('  Slow Incremental Financials Backfill');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log(`  Delay: 30 seconds between companies`);
    console.log(`  Rate limit wait: 2 minutes`);
    if (options.country) console.log(`  Country: ${options.country}`);
    if (options.symbol) console.log(`  Symbol: ${options.symbol}`);
    console.log(`  Count: ${options.count || 1}`);
    console.log('='.repeat(60));

    const companies = await this.getNextCompanies(options);

    if (companies.length === 0) {
      console.log('\n✓ No companies to process (all done or none match criteria)');
      await this.showStatus();
      return;
    }

    console.log(`\nFound ${companies.length} company(s) to process\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];

      if (i > 0) {
        console.log('\n⏳ Waiting 30 seconds before next company...');
        await new Promise(r => setTimeout(r, 30000));
      }

      const result = await this.processCompany(company);

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('  Batch Complete');
    console.log('='.repeat(60));
    console.log(`  Processed: ${companies.length}`);
    console.log(`  ✓ Successful: ${successCount}`);
    console.log(`  ✗ Failed: ${failCount}`);
    console.log('='.repeat(60));

    await this.showStatus();
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    country: null,
    symbol: null,
    count: 1,
    status: false,
    reset: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--country' || args[i] === '-c') && args[i + 1]) {
      options.country = args[i + 1].toUpperCase();
      i++;
    } else if ((args[i] === '--count' || args[i] === '-n') && args[i + 1]) {
      options.count = parseInt(args[i + 1]);
      i++;
    } else if ((args[i] === '--symbol' || args[i] === '-s') && args[i + 1]) {
      options.symbol = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--status') {
      options.status = true;
    } else if (args[i] === '--reset') {
      options.reset = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Slow Incremental Financials Backfill

Designed for Yahoo Finance rate limiting. Processes ONE company at a time
with 30-second delays and tracks progress across sessions.

Usage:
  node src/jobs/slowBackfillFinancials.js [options]

Options:
  --count, -n N       Process N companies (default: 1)
  --country, -c XX    Country code (default: all European)
  --symbol, -s SYM    Process specific symbol only
  --status            Show progress status
  --reset             Reset progress tracking
  --help, -h          Show this help

Examples:
  node src/jobs/slowBackfillFinancials.js                    # Next 1 company
  node src/jobs/slowBackfillFinancials.js --count 3          # Next 3 companies
  node src/jobs/slowBackfillFinancials.js --country DE       # German companies
  node src/jobs/slowBackfillFinancials.js --symbol SAP       # Just SAP
  node src/jobs/slowBackfillFinancials.js --status           # Show progress
`);
      process.exit(0);
    }
  }

  // Run backfill
  const backfiller = new SlowBackfiller();
  backfiller.run(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = SlowBackfiller;
