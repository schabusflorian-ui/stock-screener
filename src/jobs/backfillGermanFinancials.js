/**
 * Backfill German Company Financials from Yahoo Finance
 *
 * German companies don't file with SEC, so we use Yahoo Finance
 * to get their financial statements (income, balance sheet, cash flow).
 *
 * Usage:
 *   node src/jobs/backfillGermanFinancials.js              # All German companies missing data
 *   node src/jobs/backfillGermanFinancials.js --limit 50   # Limit batch size
 *   node src/jobs/backfillGermanFinancials.js --symbol SAP # Specific company
 *   node src/jobs/backfillGermanFinancials.js --country FR # Other European country
 */

const { getDatabaseAsync } = require('../lib/db');
const YahooFetcher = require('../validation/yahooFetcher');

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

class GermanFinancialsBackfiller {
  constructor() {
    this.fetcher = new YahooFetcher({ delay: 10000, maxRetries: 5 }); // 10 second delay for aggressive rate limiting
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      recordsAdded: 0,
    };
  }

  /**
   * Get companies that need financial data backfill
   */
  async getCompaniesNeedingBackfill(options = {}) {
    const { country = 'DE', limit, symbol } = options;
    const database = await getDatabaseAsync();

    if (symbol) {
      const result = await database.query(`
        SELECT id, symbol, name, country
        FROM companies
        WHERE LOWER(symbol) = LOWER($1)
      `, [symbol]);
      const company = (result.rows && result.rows[0]) || null;
      return company ? [company] : [];
    }

    const limitClause = limit ? ` LIMIT ${parseInt(limit, 10)}` : '';
    const result = await database.query(`
      SELECT c.id, c.symbol, c.name, c.country,
             COUNT(f.id) as financial_count
      FROM companies c
      LEFT JOIN financial_data f ON f.company_id = c.id
      WHERE c.country = $1
        AND c.symbol IS NOT NULL
        AND c.symbol != ''
        AND LENGTH(c.symbol) <= 10
      GROUP BY c.id
      HAVING financial_count < 3
      ORDER BY c.symbol
      ${limitClause}
    `, [country]);
    return result.rows || [];
  }

  /**
   * Get Yahoo symbol for a company
   */
  getYahooSymbol(symbol, country) {
    // If already has suffix, return as-is
    if (symbol.includes('.')) return symbol;

    const suffix = COUNTRY_SUFFIX[country] || '';
    return symbol + suffix;
  }

  /**
   * Store financial statements in database
   */
  async storeFinancials(companyId, data) {
    let recordsAdded = 0;
    const database = await getDatabaseAsync();

    const runRow = async (row) => {
      try {
        await database.query(`
          INSERT INTO financial_data (
            company_id, statement_type, fiscal_date_ending,
            fiscal_year, period_type,
            data,
            total_assets, total_liabilities, shareholder_equity,
            current_assets, current_liabilities, cash_and_equivalents,
            long_term_debt, short_term_debt,
            total_revenue, net_income, operating_income,
            cost_of_revenue, gross_profit,
            operating_cashflow, capital_expenditures,
            data_source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'yahoo_finance')
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
            data_source = 'yahoo_finance',
            updated_at = CURRENT_TIMESTAMP
        `, row);
        recordsAdded++;
      } catch (e) {
        // Likely duplicate, which is fine
      }
    };

    // Store income statements
    for (const period of ['annual', 'quarterly']) {
      for (const report of (data.incomeStatement[period] || [])) {
        await runRow([
          companyId,
          'income_statement',
          report.fiscalDateEnding,
          report.fiscalYear,
          period,
          JSON.stringify(report),
          null, null, null, null, null, null, null, null,
          report.totalRevenue,
          report.netIncome,
          report.operatingIncome,
          report.costOfRevenue,
          report.grossProfit,
          null, null
        ]);
      }
    }

    // Store balance sheets
    for (const period of ['annual', 'quarterly']) {
      for (const report of (data.balanceSheet[period] || [])) {
        await runRow([
          companyId,
          'balance_sheet',
          report.fiscalDateEnding,
          report.fiscalYear,
          period,
          JSON.stringify(report),
          report.totalAssets,
          report.totalLiabilities,
          report.shareholderEquity,
          report.currentAssets,
          report.currentLiabilities,
          report.cashAndEquivalents,
          report.longTermDebt,
          report.shortTermDebt,
          null, null, null, null, null,
          null, null
        ]);
      }
    }

    // Store cash flows
    for (const period of ['annual', 'quarterly']) {
      for (const report of (data.cashFlow[period] || [])) {
        await runRow([
          companyId,
          'cash_flow',
          report.fiscalDateEnding,
          report.fiscalYear,
          period,
          JSON.stringify(report),
          null, null, null, null, null, null, null, null,
          null, null, null, null, null,
          report.operatingCashflow,
          report.capitalExpenditures
        ]);
      }
    }

    return recordsAdded;
  }

  /**
   * Run the backfill
   */
  async run(options = {}) {
    console.log('\n' + '='.repeat(60));
    console.log('  European Financials Backfill (Yahoo Finance)');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log(`  Country: ${options.country || 'DE'}`);
    if (options.limit) console.log(`  Limit: ${options.limit}`);
    if (options.symbol) console.log(`  Symbol: ${options.symbol}`);
    console.log('='.repeat(60) + '\n');

    const companies = await this.getCompaniesNeedingBackfill(options);
    this.stats.total = companies.length;

    console.log(`Found ${companies.length} companies to backfill\n`);

    if (companies.length === 0) {
      console.log('No companies need backfill.');
      return this.stats;
    }

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const yahooSymbol = this.getYahooSymbol(company.symbol, company.country);

      const pct = ((i + 1) / companies.length * 100).toFixed(1);
      process.stdout.write(`[${i + 1}/${companies.length}] ${pct}% ${company.symbol.padEnd(12)}`);

      try {
        const result = await this.fetcher.fetchFinancials(yahooSymbol);

        if (result.success) {
          const recordsAdded = await this.storeFinancials(company.id, result.data);
          console.log(`  ✓ ${recordsAdded} records (${yahooSymbol})`);
          this.stats.successful++;
          this.stats.recordsAdded += recordsAdded;
        } else {
          console.log(`  ✗ ${result.error}`);
          this.stats.failed++;
        }
      } catch (error) {
        console.log(`  ⚠ Error: ${error.message}`);
        this.stats.failed++;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('  Backfill Complete');
    console.log('='.repeat(60));
    console.log(`  Total companies:   ${this.stats.total}`);
    console.log(`  ✓ Successful:      ${this.stats.successful}`);
    console.log(`  ✗ Failed:          ${this.stats.failed}`);
    console.log(`  Records added:     ${this.stats.recordsAdded}`);
    console.log('='.repeat(60) + '\n');

    return this.stats;
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    country: 'DE',
    limit: null,
    symbol: null,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--country' || args[i] === '-c') && args[i + 1]) {
      options.country = args[i + 1].toUpperCase();
      i++;
    } else if ((args[i] === '--limit' || args[i] === '-l') && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if ((args[i] === '--symbol' || args[i] === '-s') && args[i + 1]) {
      options.symbol = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
European Financials Backfiller (Yahoo Finance)

Usage:
  node src/jobs/backfillGermanFinancials.js [options]

Options:
  --country, -c XX    Country code (default: DE)
  --limit, -l N       Limit to N companies
  --symbol, -s SYM    Backfill specific symbol only
  --help, -h          Show this help

Examples:
  node src/jobs/backfillGermanFinancials.js                     # All German companies
  node src/jobs/backfillGermanFinancials.js --country FR        # French companies
  node src/jobs/backfillGermanFinancials.js --limit 10          # First 10
  node src/jobs/backfillGermanFinancials.js --symbol SAP        # Just SAP
`);
      process.exit(0);
    }
  }

  // Run backfill
  const backfiller = new GermanFinancialsBackfiller();
  backfiller.run(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = GermanFinancialsBackfiller;
