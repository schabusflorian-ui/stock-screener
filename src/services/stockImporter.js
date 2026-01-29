// src/services/stockImporter-v2.js
const db = require('../database');

/**
 * Stock Importer V2
 *
 * Now uses the provider pattern!
 * Works with any data provider (Alpha Vantage, SEC, Yahoo, etc.)
 * Automatically uses the best source via CompositeProvider
 */
// Country code normalization map (common variations → ISO 2-letter code)
const COUNTRY_NORMALIZATION = {
  // Full names to ISO codes
  'Germany': 'DE',
  'United States': 'US',
  'United States of America': 'US',
  'USA': 'US',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Great Britain': 'GB',
  'France': 'FR',
  'Netherlands': 'NL',
  'Holland': 'NL',
  'Spain': 'ES',
  'Italy': 'IT',
  'Belgium': 'BE',
  'Austria': 'AT',
  'Switzerland': 'CH',
  'Denmark': 'DK',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Finland': 'FI',
  'Poland': 'PL',
  'Portugal': 'PT',
  'Greece': 'GR',
  'Ireland': 'IE',
  'Luxembourg': 'LU',
  'Canada': 'CA',
  'Australia': 'AU',
  'Japan': 'JP',
  'China': 'CN',
  'Hong Kong': 'HK',
  'Singapore': 'SG',
  'South Korea': 'KR',
  'Korea': 'KR',
  'Taiwan': 'TW',
  'India': 'IN',
  'Brazil': 'BR',
  'Mexico': 'MX',
};

/**
 * Normalize country to ISO 2-letter code
 */
function normalizeCountry(country) {
  if (!country) return 'US';

  // Check if it's already a 2-letter code
  const upper = country.toUpperCase().trim();
  if (upper.length === 2) return upper;

  // Check normalization map
  const normalized = COUNTRY_NORMALIZATION[country];
  if (normalized) return normalized;

  // Try case-insensitive lookup
  const lowerKey = Object.keys(COUNTRY_NORMALIZATION).find(
    k => k.toLowerCase() === country.toLowerCase()
  );
  if (lowerKey) return COUNTRY_NORMALIZATION[lowerKey];

  // Default to original value (but warn)
  console.warn(`Unknown country format: "${country}" - keeping as-is`);
  return country;
}

class StockImporter {
  constructor(dataProvider) {
    this.provider = dataProvider;
    this.db = db.getDatabase();

    console.log('✅ Stock Importer V2 initialized');

    // Show which provider we're using
    if (dataProvider.constructor.name === 'CompositeProvider') {
      console.log('   Using CompositeProvider with:');
      const providers = dataProvider.getProviders();
      providers.forEach(p => {
        console.log(`     - ${p.name} (priority: ${p.priority})`);
      });
    } else {
      console.log(`   Using provider: ${dataProvider.constructor.name}`);
    }
  }

  /**
   * Import a single stock
   */
  async importStock(symbol) {
    console.log('\n' + '='.repeat(60));
    console.log(`📥 IMPORTING ${symbol.toUpperCase()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
      // Step 1: Fetch data using the provider
      console.log('\n📡 Step 1: Fetching data from provider...');
      const data = await this.provider.fetchAllData(symbol);

      // Step 2: Store company information
      console.log('\n💾 Step 2: Storing company information...');
      const companyId = this.storeCompany(symbol, data.overview);
      console.log(`   ✓ Company stored with ID: ${companyId}`);

      // Step 3: Store financial statements
      console.log('\n💾 Step 3: Storing financial statements...');
      const financialsCount = this.storeFinancialStatements(companyId, data);
      console.log(`   ✓ Stored ${financialsCount} financial reports`);

      // Step 4: Log successful import
      this.logImport(companyId, 'complete', true, null);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n' + '='.repeat(60));
      console.log(`✅ IMPORT COMPLETE: ${symbol.toUpperCase()}`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Source: ${data.overview._source || 'Unknown'}`);
      console.log('='.repeat(60) + '\n');

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        companyId,
        duration: parseFloat(duration),
        financialsCount,
        source: data.overview._source
      };

    } catch (error) {
      console.log('\n' + '='.repeat(60));
      console.log(`❌ IMPORT FAILED: ${symbol.toUpperCase()}`);
      console.log(`   Error: ${error.message}`);
      console.log('='.repeat(60) + '\n');

      this.logImport(null, 'complete', false, error.message);

      return {
        success: false,
        symbol: symbol.toUpperCase(),
        error: error.message
      };
    }
  }

  /**
   * Store company information in database
   */
  storeCompany(symbol, overview) {
    const stmt = this.db.prepare(`
      INSERT INTO companies (
        symbol, name, sector, industry, exchange, 
        country, market_cap, description
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        name = excluded.name,
        sector = excluded.sector,
        industry = excluded.industry,
        exchange = excluded.exchange,
        market_cap = excluded.market_cap,
        description = excluded.description,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(
      symbol.toUpperCase(),
      overview.name || null,
      overview.sector || null,
      overview.industry || null,
      overview.exchange || (overview.exchanges ? overview.exchanges[0] : null),
      normalizeCountry(overview.country),
      overview.marketCap || null,
      overview.description || null
    );

    const company = this.db.prepare('SELECT id FROM companies WHERE symbol = ?')
      .get(symbol.toUpperCase());

    return company.id;
  }

  /**
   * Store financial statements in database
   * Handles both SEC and Alpha Vantage data formats
   */
  storeFinancialStatements(companyId, data) {
    let count = 0;

    const stmt = this.db.prepare(`
      INSERT INTO financial_data (
        company_id, statement_type, fiscal_date_ending,
        fiscal_year, period_type, fiscal_period, form, filed_date,
        data,
        total_assets, total_liabilities, shareholder_equity,
        current_assets, current_liabilities, cash_and_equivalents,
        long_term_debt, short_term_debt,
        total_revenue, net_income, operating_income,
        cost_of_revenue, gross_profit,
        operating_cashflow, capital_expenditures
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
      DO UPDATE SET
        fiscal_period = excluded.fiscal_period,
        form = excluded.form,
        filed_date = excluded.filed_date,
        data = excluded.data,
        total_assets = excluded.total_assets,
        total_liabilities = excluded.total_liabilities,
        shareholder_equity = excluded.shareholder_equity,
        current_assets = excluded.current_assets,
        current_liabilities = excluded.current_liabilities,
        cash_and_equivalents = excluded.cash_and_equivalents,
        long_term_debt = excluded.long_term_debt,
        short_term_debt = excluded.short_term_debt,
        total_revenue = excluded.total_revenue,
        net_income = excluded.net_income,
        operating_income = excluded.operating_income,
        cost_of_revenue = excluded.cost_of_revenue,
        gross_profit = excluded.gross_profit,
        operating_cashflow = excluded.operating_cashflow,
        capital_expenditures = excluded.capital_expenditures,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Store balance sheets (annual)
    console.log('   • Balance sheets (annual)...');
    for (const report of data.balanceSheet.annual.slice(0, 5)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      // Extract SEC metadata
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'balance_sheet',
        report.fiscalDateEnding,
        fiscalYear,
        'annual',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        report.totalAssets,
        report.totalLiabilities,
        report.shareholderEquity,
        report.currentAssets,
        report.currentLiabilities,
        report.cashAndEquivalents,
        report.longTermDebt,
        report.shortTermDebt,
        null, null, null, null, null, null, null // Income/CF fields
      );
      count++;
    }

    // Store balance sheets (quarterly)
    console.log('   • Balance sheets (quarterly)...');
    for (const report of data.balanceSheet.quarterly.slice(0, 20)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'balance_sheet',
        report.fiscalDateEnding,
        fiscalYear,
        'quarterly',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        report.totalAssets,
        report.totalLiabilities,
        report.shareholderEquity,
        report.currentAssets,
        report.currentLiabilities,
        report.cashAndEquivalents,
        report.longTermDebt,
        report.shortTermDebt,
        null, null, null, null, null, null, null // Income/CF fields
      );
      count++;
    }

    // Store income statements (annual)
    console.log('   • Income statements (annual)...');
    for (const report of data.incomeStatement.annual.slice(0, 5)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'income_statement',
        report.fiscalDateEnding,
        fiscalYear,
        'annual',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        null, null, null, null, null, null, null, null, // BS fields
        report.totalRevenue,
        report.netIncome,
        report.operatingIncome,
        report.costOfRevenue,
        report.grossProfit,
        null, null // CF fields
      );
      count++;
    }

    // Store income statements (quarterly)
    console.log('   • Income statements (quarterly)...');
    for (const report of data.incomeStatement.quarterly.slice(0, 20)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'income_statement',
        report.fiscalDateEnding,
        fiscalYear,
        'quarterly',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        null, null, null, null, null, null, null, null, // BS fields
        report.totalRevenue,
        report.netIncome,
        report.operatingIncome,
        report.costOfRevenue,
        report.grossProfit,
        null, null // CF fields
      );
      count++;
    }

    // Store cash flows (annual)
    console.log('   • Cash flows (annual)...');
    for (const report of data.cashFlow.annual.slice(0, 5)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'cash_flow',
        report.fiscalDateEnding,
        fiscalYear,
        'annual',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        null, null, null, null, null, null, null, null, // BS fields
        null, null, null, null, null, // Income fields
        report.operatingCashflow,
        report.capitalExpenditures
      );
      count++;
    }

    // Store cash flows (quarterly)
    console.log('   • Cash flows (quarterly)...');
    for (const report of data.cashFlow.quarterly.slice(0, 20)) {
      const fiscalYear = new Date(report.fiscalDateEnding).getFullYear();
      const fiscalPeriod = report.fiscalPeriod || null;
      const form = report.form || null;
      const filedDate = report.filed || null;

      stmt.run(
        companyId,
        'cash_flow',
        report.fiscalDateEnding,
        fiscalYear,
        'quarterly',
        fiscalPeriod,
        form,
        filedDate,
        JSON.stringify(report), // Complete XBRL data
        null, null, null, null, null, null, null, null, // BS fields
        null, null, null, null, null, // Income fields
        report.operatingCashflow,
        report.capitalExpenditures
      );
      count++;
    }

    return count;
  }

  /**
   * Log import activity
   */
  logImport(companyId, endpointType, success, errorMessage) {
    const stmt = this.db.prepare(`
      INSERT INTO data_fetch_log (
        company_id, endpoint_type, success, error_message
      )
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(companyId, endpointType, success ? 1 : 0, errorMessage);
  }

  /**
   * Get company data from database
   */
  getCompanyData(symbol) {
    const company = this.db.prepare(`
      SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol.toUpperCase());

    if (!company) {
      return null;
    }

    const financials = this.db.prepare(`
      SELECT 
        statement_type,
        fiscal_date_ending,
        period_type,
        data
      FROM financial_data
      WHERE company_id = ?
      ORDER BY fiscal_date_ending DESC
    `).all(company.id);

    const parsed = financials.map(f => ({
      ...f,
      data: JSON.parse(f.data)
    }));

    return {
      company,
      financials: parsed
    };
  }

  /**
   * List all imported companies
   */
  listImportedCompanies() {
    const companies = this.db.prepare(`
      SELECT 
        c.*,
        COUNT(DISTINCT f.fiscal_date_ending) as years_of_data
      FROM companies c
      LEFT JOIN financial_data f ON c.id = f.company_id
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.symbol
    `).all();

    return companies;
  }

  /**
   * Get import statistics
   */
  getImportStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT c.id) as total_companies,
        COUNT(DISTINCT f.id) as total_financial_reports,
        COUNT(DISTINCT CASE WHEN f.statement_type = 'balance_sheet' THEN f.id END) as balance_sheets,
        COUNT(DISTINCT CASE WHEN f.statement_type = 'income_statement' THEN f.id END) as income_statements,
        COUNT(DISTINCT CASE WHEN f.statement_type = 'cash_flow' THEN f.id END) as cash_flows,
        COUNT(DISTINCT l.id) as total_api_calls,
        SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END) as successful_calls,
        SUM(CASE WHEN l.success = 0 THEN 1 ELSE 0 END) as failed_calls
      FROM companies c
      LEFT JOIN financial_data f ON c.id = f.company_id
      LEFT JOIN data_fetch_log l ON c.id = l.company_id
      WHERE c.is_active = 1
    `).get();

    return stats;
  }

  /**
   * Bulk import multiple stocks
   */
  async bulkImport(symbols, options = {}) {
    const {
      delayBetweenImports = 0, // Milliseconds to wait between imports
      stopOnError = false       // Whether to stop if one import fails
    } = options;

    console.log('\n' + '█'.repeat(60));
    console.log(`🚀 BULK IMPORT: ${symbols.length} stocks`);
    if (delayBetweenImports > 0) {
      console.log(`   Delay between imports: ${delayBetweenImports}ms`);
    }
    console.log('█'.repeat(60));

    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      console.log(`\n[${i + 1}/${symbols.length}] Importing ${symbol}...`);

      const result = await this.importStock(symbol);
      results.push(result);

      // Stop on error if requested
      if (!result.success && stopOnError) {
        console.log('\n⚠️  Stopping bulk import due to error');
        break;
      }

      // Show progress
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`📊 Progress: ${i + 1}/${symbols.length} (✓ ${successful}, ✗ ${failed})`);

      // Wait before next import (if not last one)
      if (i < symbols.length - 1 && delayBetweenImports > 0) {
        console.log(`   ⏳ Waiting ${delayBetweenImports}ms before next import...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenImports));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n' + '█'.repeat(60));
    console.log('📊 BULK IMPORT COMPLETE');
    console.log('█'.repeat(60));
    console.log(`   Total: ${symbols.length}`);
    console.log(`   ✓ Successful: ${successful}`);
    console.log(`   ✗ Failed: ${failed}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Average: ${(parseFloat(duration) / symbols.length).toFixed(1)}s per stock`);
    console.log('█'.repeat(60) + '\n');

    // Show failed imports if any
    if (failed > 0) {
      console.log('❌ Failed imports:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.symbol}: ${r.error}`);
      });
      console.log('');
    }

    return {
      total: symbols.length,
      successful,
      failed,
      duration: parseFloat(duration),
      results
    };
  }

  /**
   * Check if a company exists in database
   */
  companyExists(symbol) {
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol.toUpperCase());

    return !!company;
  }

  /**
   * Update existing company (re-import)
   */
  async updateCompany(symbol) {
    console.log(`\n🔄 Updating ${symbol}...`);
    return await this.importStock(symbol);
  }

  /**
   * Bulk update (re-import existing companies)
   */
  async bulkUpdate(symbols) {
    console.log('\n🔄 BULK UPDATE MODE');
    console.log('   Re-importing existing companies...\n');
    return await this.bulkImport(symbols);
  }
}

module.exports = StockImporter;
