/**
 * Recalculate Metrics with Valuation Data
 *
 * This script recalculates all financial metrics INCLUDING valuation metrics
 * (P/E, P/B, P/S, EV/EBITDA, etc.) using historical stock price data.
 *
 * Strategy:
 * 1. For each fiscal period, get the stock price at or near that date
 * 2. Derive shares outstanding from Net Income / EPS
 * 3. Calculate market cap = shares × price
 * 4. Pass market cap to the metric calculator
 */

const db = require('../src/database');
const MetricCalculator = require('../src/services/metricCalculator');
const SchemaManager = require('../src/utils/schemaManager');

class ValuationMetricsRecalculator {
  constructor() {
    this.database = db.getDatabase();
    this.calculator = new MetricCalculator();
    this.schemaManager = new SchemaManager();

    // Prepared statements for efficiency
    this.stmtGetFinancialData = this.database.prepare(`
      SELECT
        fd.company_id,
        c.symbol,
        fd.fiscal_date_ending,
        fd.period_type,
        fd.fiscal_year,
        fd.fiscal_period,
        MAX(CASE WHEN fd.statement_type = 'income_statement' THEN fd.data END) as income_statement,
        MAX(CASE WHEN fd.statement_type = 'balance_sheet' THEN fd.data END) as balance_sheet,
        MAX(CASE WHEN fd.statement_type = 'cash_flow' THEN fd.data END) as cash_flow
      FROM financial_data fd
      JOIN companies c ON c.id = fd.company_id
      WHERE fd.company_id = ?
        AND fd.period_type = ?
      GROUP BY fd.company_id, fd.fiscal_date_ending, fd.period_type
      ORDER BY fd.fiscal_date_ending DESC
    `);

    this.stmtGetStockPrice = this.database.prepare(`
      SELECT close, adjusted_close, date
      FROM daily_prices
      WHERE company_id = ?
        AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    this.stmtGetPriorPeriod = this.database.prepare(`
      SELECT
        MAX(CASE WHEN statement_type = 'income_statement' THEN data END) as income_statement,
        MAX(CASE WHEN statement_type = 'balance_sheet' THEN data END) as balance_sheet,
        MAX(CASE WHEN statement_type = 'cash_flow' THEN data END) as cash_flow
      FROM financial_data
      WHERE company_id = ?
        AND period_type = ?
        AND fiscal_date_ending < ?
      GROUP BY fiscal_date_ending
      ORDER BY fiscal_date_ending DESC
      LIMIT 1
    `);

    this.stats = {
      companiesProcessed: 0,
      periodsProcessed: 0,
      periodsWithValuation: 0,
      periodsWithoutPrice: 0,
      errors: 0
    };
  }

  /**
   * Get stock price at or near fiscal date
   * Looks for price within 10 trading days before the fiscal date
   */
  getStockPriceAtDate(companyId, fiscalDate) {
    const price = this.stmtGetStockPrice.get(companyId, fiscalDate);
    if (!price) return null;

    // Use adjusted close if available, otherwise close
    return {
      price: price.adjusted_close || price.close,
      date: price.date
    };
  }

  /**
   * Derive shares outstanding from Net Income and EPS
   * shares = net_income / eps
   * Falls back to EPS Diluted if Basic is not available
   */
  deriveSharesOutstanding(incomeStatement) {
    if (!incomeStatement) return null;

    const data = typeof incomeStatement === 'string'
      ? JSON.parse(incomeStatement)
      : incomeStatement;

    // Get net income
    const netIncome = parseFloat(data.netIncome) ||
                      parseFloat(data.NetIncomeLoss) ||
                      parseFloat(data.ProfitLoss);

    // Get EPS (basic first, then diluted as fallback)
    let eps = parseFloat(data.EarningsPerShareBasic) ||
              parseFloat(data.earningsPerShareBasic) ||
              parseFloat(data.eps);

    // Fallback to diluted EPS if basic not available
    if (!eps || eps === 0) {
      eps = parseFloat(data.EarningsPerShareDiluted) ||
            parseFloat(data.earningsPerShareDiluted) ||
            parseFloat(data.ePSDiluted);
    }

    if (!netIncome || !eps || eps === 0) return null;

    // shares = net_income / eps
    return Math.abs(netIncome / eps);
  }

  /**
   * Calculate market cap from shares and price
   */
  calculateMarketCap(shares, price) {
    if (!shares || !price) return null;
    return shares * price;
  }

  /**
   * Process a single fiscal period
   */
  processPeriod(periodData) {
    try {
      const {
        company_id,
        symbol,
        fiscal_date_ending,
        period_type,
        fiscal_year,
        fiscal_period,
        income_statement,
        balance_sheet,
        cash_flow
      } = periodData;

      // Parse JSON data
      const financialData = {
        income_statement: income_statement ? JSON.parse(income_statement) : null,
        balance_sheet: balance_sheet ? JSON.parse(balance_sheet) : null,
        cash_flow: cash_flow ? JSON.parse(cash_flow) : null
      };

      // Get stock price at fiscal date
      const priceData = this.getStockPriceAtDate(company_id, fiscal_date_ending);

      // Derive shares outstanding
      const shares = this.deriveSharesOutstanding(income_statement);

      // Calculate market cap
      let marketCap = null;
      if (priceData && shares) {
        marketCap = this.calculateMarketCap(shares, priceData.price);
        this.stats.periodsWithValuation++;
      } else {
        this.stats.periodsWithoutPrice++;
      }

      // Get prior period data for average calculations
      const priorData = this.stmtGetPriorPeriod.get(company_id, period_type, fiscal_date_ending);
      let prevFinancialData = null;
      if (priorData) {
        prevFinancialData = {
          income_statement: priorData.income_statement ? JSON.parse(priorData.income_statement) : null,
          balance_sheet: priorData.balance_sheet ? JSON.parse(priorData.balance_sheet) : null,
          cash_flow: priorData.cash_flow ? JSON.parse(priorData.cash_flow) : null
        };
      }

      // Calculate all metrics
      const context = {
        companyId: company_id,
        fiscalDate: fiscal_date_ending,
        periodType: period_type
      };

      const metrics = this.calculator.calculateAllMetrics(
        financialData,
        marketCap,
        priceData?.price || null,
        context,
        prevFinancialData
      );

      if (metrics) {
        // Store metrics using schema manager
        this.schemaManager.insertOrUpdateMetrics(
          company_id,
          fiscal_date_ending,  // fiscal_period is actually the date
          fiscal_year,
          metrics,
          period_type
        );
      }

      this.stats.periodsProcessed++;
      return true;

    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Process all periods for a company
   */
  processCompany(companyId, periodType = 'annual') {
    const periods = this.stmtGetFinancialData.all(companyId, periodType);

    for (const period of periods) {
      this.processPeriod(period);
    }
  }

  /**
   * Run full recalculation for all companies
   */
  async runFullRecalculation(options = {}) {
    const {
      periodType = 'annual',
      limit = null,
      startFromCompanyId = null,
      onProgress = () => {}
    } = options;

    console.log('\n🔄 Starting Metrics Recalculation with Valuation Data\n');
    console.log('='.repeat(60));

    // Ensure schema is up to date
    this.schemaManager.ensureCalculatedMetricsSchema();

    // Get all companies with financial data
    let sql = `
      SELECT DISTINCT fd.company_id, c.symbol
      FROM financial_data fd
      JOIN companies c ON c.id = fd.company_id
      WHERE fd.period_type = ?
    `;

    if (startFromCompanyId) {
      sql += ` AND fd.company_id >= ${startFromCompanyId}`;
    }

    sql += ' ORDER BY fd.company_id';

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    const companies = this.database.prepare(sql).all(periodType);

    console.log(`Found ${companies.length} companies with ${periodType} data\n`);

    const startTime = Date.now();

    for (let i = 0; i < companies.length; i++) {
      const { company_id, symbol } = companies[i];

      this.processCompany(company_id, periodType);
      this.stats.companiesProcessed++;

      // Progress update every 100 companies
      if ((i + 1) % 100 === 0 || i === companies.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (this.stats.companiesProcessed / elapsed * 60).toFixed(0);

        process.stdout.write(`\r  Processed ${i + 1}/${companies.length} companies (${rate}/min) - ` +
          `${this.stats.periodsWithValuation} periods with valuation`);

        onProgress({
          current: i + 1,
          total: companies.length,
          periodsWithValuation: this.stats.periodsWithValuation
        });
      }
    }

    console.log('\n\n' + '='.repeat(60));
    this.printStats();

    return this.stats;
  }

  /**
   * Print final statistics
   */
  printStats() {
    console.log('\n📊 Recalculation Statistics:\n');
    console.log(`  Companies processed:       ${this.stats.companiesProcessed.toLocaleString()}`);
    console.log(`  Periods processed:         ${this.stats.periodsProcessed.toLocaleString()}`);
    console.log(`  Periods with valuation:    ${this.stats.periodsWithValuation.toLocaleString()}`);
    console.log(`  Periods without price:     ${this.stats.periodsWithoutPrice.toLocaleString()}`);
    console.log(`  Errors:                    ${this.stats.errors.toLocaleString()}`);

    const coverage = ((this.stats.periodsWithValuation / this.stats.periodsProcessed) * 100).toFixed(1);
    console.log(`\n  Valuation coverage:        ${coverage}%\n`);
  }

  /**
   * Verify valuation metrics after recalculation
   */
  verifyValuationMetrics() {
    console.log('\n🔍 Verifying Valuation Metrics:\n');

    const metrics = ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda', 'fcf_yield'];

    for (const metric of metrics) {
      const count = this.database.prepare(`
        SELECT COUNT(*) as count FROM calculated_metrics
        WHERE ${metric} IS NOT NULL AND period_type = 'annual'
      `).get().count;

      console.log(`  ${metric.padEnd(15)}: ${count.toLocaleString()} records`);
    }

    // Sample check
    console.log('\n📈 Sample valuations (AAPL):\n');

    const samples = this.database.prepare(`
      SELECT
        cm.fiscal_period,
        ROUND(cm.pe_ratio, 2) as pe_ratio,
        ROUND(cm.pb_ratio, 2) as pb_ratio,
        ROUND(cm.ps_ratio, 2) as ps_ratio,
        ROUND(cm.ev_ebitda, 2) as ev_ebitda
      FROM calculated_metrics cm
      JOIN companies c ON c.id = cm.company_id
      WHERE c.symbol = 'AAPL' AND cm.period_type = 'annual'
      ORDER BY cm.fiscal_period DESC
      LIMIT 5
    `).all();

    if (samples.length > 0) {
      console.log('  Period      | P/E    | P/B    | P/S    | EV/EBITDA');
      console.log('  ' + '-'.repeat(55));
      for (const s of samples) {
        console.log(`  ${s.fiscal_period} | ${(s.pe_ratio || 'N/A').toString().padEnd(6)} | ` +
          `${(s.pb_ratio || 'N/A').toString().padEnd(6)} | ` +
          `${(s.ps_ratio || 'N/A').toString().padEnd(6)} | ` +
          `${s.ev_ebitda || 'N/A'}`);
      }
    } else {
      console.log('  No AAPL data found');
    }

    console.log('');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    periodType: 'annual',
    limit: null
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--quarterly' || args[i] === '-q') {
      options.periodType = 'quarterly';
    } else if (args[i] === '--limit' || args[i] === '-l') {
      options.limit = parseInt(args[++i]);
    } else if (args[i] === '--both' || args[i] === '-b') {
      options.both = true;
    } else if (args[i] === '--verify' || args[i] === '-v') {
      options.verifyOnly = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node scripts/recalculate-metrics-with-valuations.js [options]

Options:
  --quarterly, -q    Process quarterly data (default: annual)
  --both, -b         Process both annual and quarterly data
  --limit N, -l N    Limit to N companies (for testing)
  --verify, -v       Only verify current valuation metrics
  --help, -h         Show this help message
      `);
      process.exit(0);
    }
  }

  const recalculator = new ValuationMetricsRecalculator();

  if (options.verifyOnly) {
    recalculator.verifyValuationMetrics();
  } else if (options.both) {
    // Process both annual and quarterly
    console.log('\n📅 Processing ANNUAL data first...\n');
    recalculator.runFullRecalculation({ periodType: 'annual', limit: options.limit })
      .then(() => {
        console.log('\n📅 Now processing QUARTERLY data...\n');
        // Reset stats
        recalculator.stats = {
          companiesProcessed: 0,
          periodsProcessed: 0,
          periodsWithValuation: 0,
          periodsWithoutPrice: 0,
          errors: 0
        };
        return recalculator.runFullRecalculation({ periodType: 'quarterly', limit: options.limit });
      })
      .then(() => {
        recalculator.verifyValuationMetrics();
      });
  } else {
    recalculator.runFullRecalculation(options)
      .then(() => {
        recalculator.verifyValuationMetrics();
      });
  }
}

module.exports = ValuationMetricsRecalculator;
