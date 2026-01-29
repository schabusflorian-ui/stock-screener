// src/database-migrations/add-xbrl-tables.js
const db = require('../database');

/**
 * Database Migration: Add XBRL Data Infrastructure Tables
 *
 * Adds schema for EU/UK XBRL data from filings.xbrl.org and Companies House:
 * - company_identifiers: LEI, ISIN, Companies House numbers, cross-references
 * - xbrl_filings: Filing metadata and tracking
 * - xbrl_fundamental_metrics: Parsed financial metrics from XBRL filings
 */

function runMigration() {
  console.log('\n📦 DATABASE MIGRATION: XBRL Data Infrastructure\n');
  console.log('='.repeat(60));

  const database = db.getDatabase();

  try {
    database.exec('BEGIN TRANSACTION');

    // ========================================
    // 1. Add LEI/ISIN columns to companies table
    // ========================================
    console.log('\n1️⃣  Adding identifier columns to companies table...');

    const companiesColumns = database.prepare('PRAGMA table_info(companies)').all();
    const companiesColumnNames = companiesColumns.map(col => col.name);

    const columnsToAdd = [
      { name: 'lei', type: 'TEXT', description: 'Legal Entity Identifier (20 chars)' },
      { name: 'isin', type: 'TEXT', description: 'International Securities Identification Number' },
      { name: 'companies_house_number', type: 'TEXT', description: 'UK Companies House number' },
      { name: 'sedol', type: 'TEXT', description: 'Stock Exchange Daily Official List number' }
    ];

    for (const col of columnsToAdd) {
      if (!companiesColumnNames.includes(col.name)) {
        database.exec(`ALTER TABLE companies ADD COLUMN ${col.name} ${col.type}`);
        console.log(`   ✓ Added ${col.name} column (${col.description})`);
      } else {
        console.log(`   ✓ ${col.name} column already exists`);
      }
    }

    // ========================================
    // 2. Create company_identifiers table for cross-referencing
    // ========================================
    console.log('\n2️⃣  Creating company_identifiers table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS company_identifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lei TEXT UNIQUE,
        isin TEXT,
        sedol TEXT,
        cusip TEXT,
        figi TEXT,
        composite_figi TEXT,
        cik TEXT,
        companies_house_number TEXT,
        ticker TEXT,
        exchange TEXT,
        yahoo_symbol TEXT,
        country TEXT,
        legal_name TEXT NOT NULL,
        jurisdiction TEXT,
        company_id INTEGER,
        link_status TEXT DEFAULT 'pending',
        link_method TEXT,
        link_confidence REAL,
        data_source TEXT DEFAULT 'xbrl',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        linked_at DATETIME,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
      )
    `);
    console.log('   ✓ Created company_identifiers table');

    // ========================================
    // 3. Create xbrl_filings table
    // ========================================
    console.log('\n3️⃣  Creating xbrl_filings table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS xbrl_filings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filing_hash TEXT UNIQUE NOT NULL,
        identifier_id INTEGER,
        lei TEXT,
        entity_name TEXT,
        country TEXT,
        period_end DATE,
        period_start DATE,
        filing_date DATE,
        document_type TEXT,
        source TEXT DEFAULT 'filings.xbrl.org',
        source_url TEXT,
        json_url TEXT,
        currency TEXT DEFAULT 'EUR',
        parsed INTEGER DEFAULT 0,
        parse_errors TEXT,
        raw_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (identifier_id) REFERENCES company_identifiers(id) ON DELETE SET NULL
      )
    `);
    console.log('   ✓ Created xbrl_filings table');

    // ========================================
    // 4. Create xbrl_fundamental_metrics table
    // ========================================
    console.log('\n4️⃣  Creating xbrl_fundamental_metrics table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS xbrl_fundamental_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier_id INTEGER,
        filing_id INTEGER,
        company_id INTEGER,
        period_end DATE NOT NULL,
        period_type TEXT DEFAULT 'annual',
        currency TEXT DEFAULT 'EUR',

        -- Balance Sheet
        total_assets REAL,
        current_assets REAL,
        non_current_assets REAL,
        cash_and_equivalents REAL,
        inventories REAL,
        trade_receivables REAL,
        total_liabilities REAL,
        current_liabilities REAL,
        non_current_liabilities REAL,
        trade_payables REAL,
        total_debt REAL,
        short_term_debt REAL,
        long_term_debt REAL,
        total_equity REAL,
        retained_earnings REAL,
        share_capital REAL,

        -- Income Statement
        revenue REAL,
        cost_of_sales REAL,
        gross_profit REAL,
        operating_expenses REAL,
        operating_income REAL,
        ebitda REAL,
        interest_expense REAL,
        interest_income REAL,
        profit_before_tax REAL,
        income_tax_expense REAL,
        net_income REAL,
        eps_basic REAL,
        eps_diluted REAL,
        shares_outstanding REAL,
        dividends_per_share REAL,

        -- Cash Flow Statement
        operating_cash_flow REAL,
        investing_cash_flow REAL,
        financing_cash_flow REAL,
        capital_expenditure REAL,
        depreciation_amortization REAL,
        free_cash_flow REAL,
        dividends_paid REAL,
        share_repurchases REAL,

        -- Calculated Ratios
        gross_margin REAL,
        operating_margin REAL,
        net_margin REAL,
        roe REAL,
        roa REAL,
        roic REAL,
        current_ratio REAL,
        quick_ratio REAL,
        debt_to_equity REAL,
        debt_to_assets REAL,
        interest_coverage REAL,
        asset_turnover REAL,
        inventory_turnover REAL,

        -- Metadata
        data_quality_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (identifier_id) REFERENCES company_identifiers(id) ON DELETE CASCADE,
        FOREIGN KEY (filing_id) REFERENCES xbrl_filings(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        UNIQUE(identifier_id, period_end, period_type)
      )
    `);
    console.log('   ✓ Created xbrl_fundamental_metrics table');

    // ========================================
    // 5. Create xbrl_sync_log table for tracking sync operations
    // ========================================
    console.log('\n5️⃣  Creating xbrl_sync_log table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS xbrl_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        country TEXT,
        target_country TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        filings_processed INTEGER DEFAULT 0,
        filings_added INTEGER DEFAULT 0,
        filings_updated INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        error_details TEXT,
        status TEXT DEFAULT 'running',
        last_filing_hash TEXT,
        current_page INTEGER DEFAULT 1
      )
    `);
    console.log('   ✓ Created xbrl_sync_log table');

    // ========================================
    // 6. Create IFRS concept mappings table
    // ========================================
    console.log('\n6️⃣  Creating ifrs_concept_mappings table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS ifrs_concept_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ifrs_concept TEXT UNIQUE NOT NULL,
        standard_field TEXT NOT NULL,
        category TEXT,
        description TEXT,
        priority INTEGER DEFAULT 0
      )
    `);
    console.log('   ✓ Created ifrs_concept_mappings table');

    // Insert default IFRS mappings
    console.log('\n   Populating IFRS concept mappings...');

    const mappings = [
      // Balance Sheet
      ['ifrs-full:Assets', 'total_assets', 'balance_sheet', 'Total assets'],
      ['ifrs-full:CurrentAssets', 'current_assets', 'balance_sheet', 'Current assets'],
      ['ifrs-full:NoncurrentAssets', 'non_current_assets', 'balance_sheet', 'Non-current assets'],
      ['ifrs-full:CashAndCashEquivalents', 'cash_and_equivalents', 'balance_sheet', 'Cash and cash equivalents'],
      ['ifrs-full:Inventories', 'inventories', 'balance_sheet', 'Inventories'],
      ['ifrs-full:TradeAndOtherCurrentReceivables', 'trade_receivables', 'balance_sheet', 'Trade receivables'],
      ['ifrs-full:Liabilities', 'total_liabilities', 'balance_sheet', 'Total liabilities'],
      ['ifrs-full:CurrentLiabilities', 'current_liabilities', 'balance_sheet', 'Current liabilities'],
      ['ifrs-full:NoncurrentLiabilities', 'non_current_liabilities', 'balance_sheet', 'Non-current liabilities'],
      ['ifrs-full:TradeAndOtherCurrentPayables', 'trade_payables', 'balance_sheet', 'Trade payables'],
      ['ifrs-full:Equity', 'total_equity', 'balance_sheet', 'Total equity'],
      ['ifrs-full:RetainedEarnings', 'retained_earnings', 'balance_sheet', 'Retained earnings'],
      ['ifrs-full:IssuedCapital', 'share_capital', 'balance_sheet', 'Share capital'],
      // Income Statement
      ['ifrs-full:Revenue', 'revenue', 'income_statement', 'Revenue'],
      ['ifrs-full:CostOfSales', 'cost_of_sales', 'income_statement', 'Cost of sales'],
      ['ifrs-full:GrossProfit', 'gross_profit', 'income_statement', 'Gross profit'],
      ['ifrs-full:ProfitLossFromOperatingActivities', 'operating_income', 'income_statement', 'Operating income'],
      ['ifrs-full:ProfitLossBeforeTax', 'profit_before_tax', 'income_statement', 'Profit before tax'],
      ['ifrs-full:IncomeTaxExpenseContinuingOperations', 'income_tax_expense', 'income_statement', 'Income tax expense'],
      ['ifrs-full:ProfitLoss', 'net_income', 'income_statement', 'Net income'],
      ['ifrs-full:BasicEarningsLossPerShare', 'eps_basic', 'income_statement', 'Basic EPS'],
      ['ifrs-full:DilutedEarningsLossPerShare', 'eps_diluted', 'income_statement', 'Diluted EPS'],
      ['ifrs-full:InterestExpense', 'interest_expense', 'income_statement', 'Interest expense'],
      ['ifrs-full:InterestIncome', 'interest_income', 'income_statement', 'Interest income'],
      // Cash Flow
      ['ifrs-full:CashFlowsFromUsedInOperatingActivities', 'operating_cash_flow', 'cash_flow', 'Operating cash flow'],
      ['ifrs-full:CashFlowsFromUsedInInvestingActivities', 'investing_cash_flow', 'cash_flow', 'Investing cash flow'],
      ['ifrs-full:CashFlowsFromUsedInFinancingActivities', 'financing_cash_flow', 'cash_flow', 'Financing cash flow'],
      ['ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'capital_expenditure', 'cash_flow', 'Capital expenditure'],
      ['ifrs-full:DepreciationAndAmortisationExpense', 'depreciation_amortization', 'cash_flow', 'Depreciation and amortization'],
      ['ifrs-full:DividendsPaid', 'dividends_paid', 'cash_flow', 'Dividends paid'],
      // Alternative IFRS names
      ['ifrs-full:ProfitLossAttributableToOwnersOfParent', 'net_income', 'income_statement', 'Net income (parent)', 1],
      ['ifrs-full:RevenueFromContractsWithCustomers', 'revenue', 'income_statement', 'Revenue from contracts', 1],
    ];

    const insertMapping = database.prepare(`
      INSERT OR IGNORE INTO ifrs_concept_mappings (ifrs_concept, standard_field, category, description, priority)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [concept, field, category, desc, priority = 0] of mappings) {
      insertMapping.run(concept, field, category, desc, priority);
    }
    console.log(`   ✓ Inserted ${mappings.length} IFRS concept mappings`);

    // ========================================
    // 7. Create performance indexes
    // ========================================
    console.log('\n7️⃣  Creating performance indexes...');

    const indexes = [
      // company_identifiers indexes
      { name: 'idx_ci_lei', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_lei ON company_identifiers(lei)' },
      { name: 'idx_ci_isin', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_isin ON company_identifiers(isin)' },
      { name: 'idx_ci_ticker_exchange', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_ticker_exchange ON company_identifiers(ticker, exchange)' },
      { name: 'idx_ci_country', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_country ON company_identifiers(country)' },
      { name: 'idx_ci_ch_number', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_ch_number ON company_identifiers(companies_house_number)' },
      { name: 'idx_ci_company_id', sql: 'CREATE INDEX IF NOT EXISTS idx_ci_company_id ON company_identifiers(company_id)' },
      // xbrl_filings indexes
      { name: 'idx_xf_lei', sql: 'CREATE INDEX IF NOT EXISTS idx_xf_lei ON xbrl_filings(lei)' },
      { name: 'idx_xf_country_period', sql: 'CREATE INDEX IF NOT EXISTS idx_xf_country_period ON xbrl_filings(country, period_end)' },
      { name: 'idx_xf_identifier', sql: 'CREATE INDEX IF NOT EXISTS idx_xf_identifier ON xbrl_filings(identifier_id)' },
      { name: 'idx_xf_parsed', sql: 'CREATE INDEX IF NOT EXISTS idx_xf_parsed ON xbrl_filings(parsed)' },
      // xbrl_fundamental_metrics indexes
      { name: 'idx_xfm_identifier_period', sql: 'CREATE INDEX IF NOT EXISTS idx_xfm_identifier_period ON xbrl_fundamental_metrics(identifier_id, period_end)' },
      { name: 'idx_xfm_company_id', sql: 'CREATE INDEX IF NOT EXISTS idx_xfm_company_id ON xbrl_fundamental_metrics(company_id)' },
      { name: 'idx_xfm_filing_id', sql: 'CREATE INDEX IF NOT EXISTS idx_xfm_filing_id ON xbrl_fundamental_metrics(filing_id)' },
      { name: 'idx_xfm_period_end', sql: 'CREATE INDEX IF NOT EXISTS idx_xfm_period_end ON xbrl_fundamental_metrics(period_end DESC)' },
      // companies table indexes for new columns
      { name: 'idx_companies_lei', sql: 'CREATE INDEX IF NOT EXISTS idx_companies_lei ON companies(lei)' },
      { name: 'idx_companies_isin', sql: 'CREATE INDEX IF NOT EXISTS idx_companies_isin ON companies(isin)' },
      { name: 'idx_companies_ch', sql: 'CREATE INDEX IF NOT EXISTS idx_companies_ch ON companies(companies_house_number)' },
    ];

    for (const index of indexes) {
      database.exec(index.sql);
      console.log(`   ✓ Created index: ${index.name}`);
    }

    // Commit transaction
    database.exec('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!\n');

    // Show summary
    console.log('📊 Summary:');
    console.log('   • companies table: +4 columns (lei, isin, companies_house_number, sedol)');
    console.log('   • company_identifiers table: created (cross-reference EU/UK identifiers)');
    console.log('   • xbrl_filings table: created (filing metadata)');
    console.log('   • xbrl_fundamental_metrics table: created (parsed financial data)');
    console.log('   • xbrl_sync_log table: created (sync tracking)');
    console.log('   • ifrs_concept_mappings table: created with default mappings');
    console.log(`   • Performance indexes: ${indexes.length} created`);
    console.log('\n✨ Database ready for XBRL data infrastructure!\n');

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
