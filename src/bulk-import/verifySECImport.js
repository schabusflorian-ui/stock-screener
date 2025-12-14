// src/bulk-import/verifySECImport.js
const db = require('../database');

/**
 * SEC Import Verification
 *
 * Validates the imported data and generates quality reports
 */

class SECImportVerifier {
  constructor() {
    this.database = db.getDatabase();
  }

  /**
   * Get basic statistics
   */
  getBasicStats() {
    console.log('\n📊 BASIC STATISTICS\n');
    console.log('='.repeat(60));

    const stats = {
      companies: this.database.prepare(`
        SELECT COUNT(*) as count FROM companies WHERE cik IS NOT NULL
      `).get(),

      companiesWithData: this.database.prepare(`
        SELECT COUNT(DISTINCT company_id) as count FROM financial_line_items
      `).get(),

      totalLineItems: this.database.prepare(`
        SELECT COUNT(*) as count FROM financial_line_items
      `).get(),

      byStatementType: this.database.prepare(`
        SELECT statement_type, COUNT(*) as count
        FROM financial_line_items
        GROUP BY statement_type
        ORDER BY count DESC
      `).all(),

      byFormType: this.database.prepare(`
        SELECT form_type, COUNT(*) as count
        FROM financial_line_items
        GROUP BY form_type
        ORDER BY count DESC
      `).all(),

      dateRange: this.database.prepare(`
        SELECT
          MIN(fiscal_date_ending) as earliest,
          MAX(fiscal_date_ending) as latest
        FROM financial_line_items
      `).get()
    };

    console.log(`Companies (with CIK): ${stats.companies.count.toLocaleString()}`);
    console.log(`Companies with data: ${stats.companiesWithData.count.toLocaleString()}`);
    console.log(`Total line items: ${stats.totalLineItems.count.toLocaleString()}`);
    console.log(`\nDate range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}`);

    console.log(`\nBy Statement Type:`);
    stats.byStatementType.forEach(row => {
      console.log(`  ${row.statement_type}: ${row.count.toLocaleString()}`);
    });

    console.log(`\nBy Form Type:`);
    stats.byFormType.forEach(row => {
      console.log(`  ${row.form_type}: ${row.count.toLocaleString()}`);
    });

    return stats;
  }

  /**
   * Get top concepts
   */
  getTopConcepts(limit = 20) {
    console.log(`\n📋 TOP ${limit} CONCEPTS\n`);
    console.log('='.repeat(60));

    const concepts = this.database.prepare(`
      SELECT
        concept,
        statement_type,
        COUNT(*) as count,
        COUNT(DISTINCT company_id) as companies
      FROM financial_line_items
      GROUP BY concept
      ORDER BY count DESC
      LIMIT ?
    `).all(limit);

    concepts.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.concept.padEnd(35)} ${row.statement_type.padEnd(18)} ${row.count.toLocaleString().padStart(10)} records  ${row.companies.toLocaleString().padStart(6)} companies`);
    });

    return concepts;
  }

  /**
   * Check data completeness for major metrics
   */
  checkDataCompleteness() {
    console.log('\n🔍 DATA COMPLETENESS CHECK\n');
    console.log('='.repeat(60));

    const keyMetrics = [
      'Revenue',
      'NetIncome',
      'TotalAssets',
      'ShareholderEquity',
      'OperatingCashFlow',
      'EarningsPerShareBasic'
    ];

    const completeness = keyMetrics.map(metric => {
      const result = this.database.prepare(`
        SELECT
          COUNT(DISTINCT company_id) as companies,
          COUNT(*) as records,
          MIN(fiscal_date_ending) as earliest,
          MAX(fiscal_date_ending) as latest
        FROM financial_line_items
        WHERE concept = ?
      `).get(metric);

      return { metric, ...result };
    });

    completeness.forEach(row => {
      console.log(`\n${row.metric}:`);
      console.log(`  Companies: ${row.companies.toLocaleString()}`);
      console.log(`  Records: ${row.records.toLocaleString()}`);
      console.log(`  Date range: ${row.earliest} to ${row.latest}`);
    });

    return completeness;
  }

  /**
   * Sample company data
   */
  sampleCompanyData(symbol = null, cik = null, limit = 10) {
    console.log('\n📈 SAMPLE COMPANY DATA\n');
    console.log('='.repeat(60));

    let company;

    if (symbol) {
      company = this.database.prepare(`
        SELECT * FROM companies WHERE symbol = ? LIMIT 1
      `).get(symbol);
    } else if (cik) {
      const paddedCik = cik.padStart(10, '0');
      company = this.database.prepare(`
        SELECT * FROM companies WHERE cik = ? LIMIT 1
      `).get(paddedCik);
    } else {
      // Get a random company with lots of data
      company = this.database.prepare(`
        SELECT c.*, COUNT(f.id) as record_count
        FROM companies c
        JOIN financial_line_items f ON f.company_id = c.id
        WHERE c.cik IS NOT NULL
        GROUP BY c.id
        ORDER BY record_count DESC
        LIMIT 1
      `).get();
    }

    if (!company) {
      console.log('❌ Company not found');
      return null;
    }

    console.log(`Company: ${company.name} (CIK: ${company.cik})`);

    const lineItems = this.database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_period,
        concept,
        value,
        statement_type
      FROM financial_line_items
      WHERE company_id = ?
      ORDER BY fiscal_date_ending DESC, concept
      LIMIT ?
    `).all(company.id, limit);

    console.log(`\nRecent line items (latest ${limit}):\n`);

    lineItems.forEach(item => {
      const valueFormatted = item.value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      console.log(`  ${item.fiscal_date_ending}  ${item.fiscal_period.padEnd(8)}  ${item.concept.padEnd(30)}  ${valueFormatted.padStart(20)}  [${item.statement_type}]`);
    });

    // Get concept count
    const conceptCount = this.database.prepare(`
      SELECT COUNT(DISTINCT concept) as count
      FROM financial_line_items
      WHERE company_id = ?
    `).get(company.id);

    console.log(`\nTotal unique concepts: ${conceptCount.count}`);

    return { company, lineItems };
  }

  /**
   * Check for missing data
   */
  checkMissingData() {
    console.log('\n⚠️  MISSING DATA ANALYSIS\n');
    console.log('='.repeat(60));

    // Companies with CIK but no financial data
    const companiesNoData = this.database.prepare(`
      SELECT c.name, c.cik, c.symbol
      FROM companies c
      WHERE c.cik IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM financial_line_items f
          WHERE f.company_id = c.id
        )
      LIMIT 50
    `).all();

    console.log(`\nCompanies with CIK but no financial data: ${companiesNoData.length}`);
    if (companiesNoData.length > 0) {
      console.log('Sample:');
      companiesNoData.slice(0, 10).forEach(c => {
        console.log(`  ${c.name} (${c.cik})`);
      });
    }

    // Companies with sparse data
    const sparseCompanies = this.database.prepare(`
      SELECT c.name, c.cik, COUNT(f.id) as record_count
      FROM companies c
      JOIN financial_line_items f ON f.company_id = c.id
      WHERE c.cik IS NOT NULL
      GROUP BY c.id
      HAVING record_count < 100
      ORDER BY record_count
      LIMIT 20
    `).all();

    console.log(`\nCompanies with sparse data (< 100 records): ${sparseCompanies.length}`);
    if (sparseCompanies.length > 0) {
      console.log('Sample:');
      sparseCompanies.slice(0, 10).forEach(c => {
        console.log(`  ${c.name} (${c.cik}): ${c.record_count} records`);
      });
    }
  }

  /**
   * Compare with existing API data
   */
  compareWithAPIData(symbol) {
    console.log(`\n🔄 COMPARING BULK vs API DATA: ${symbol}\n`);
    console.log('='.repeat(60));

    const company = this.database.prepare(`
      SELECT * FROM companies WHERE symbol = ? LIMIT 1
    `).get(symbol);

    if (!company) {
      console.log(`❌ Company ${symbol} not found`);
      return;
    }

    // Get API data (from financial_data table)
    const apiData = this.database.prepare(`
      SELECT COUNT(*) as count, MIN(fiscal_date_ending) as earliest, MAX(fiscal_date_ending) as latest
      FROM financial_data
      WHERE company_id = ?
    `).get(company.id);

    // Get bulk data
    const bulkData = this.database.prepare(`
      SELECT COUNT(*) as count, MIN(fiscal_date_ending) as earliest, MAX(fiscal_date_ending) as latest
      FROM financial_line_items
      WHERE company_id = ?
    `).get(company.id);

    console.log('API Data (financial_data table):');
    console.log(`  Records: ${apiData.count}`);
    console.log(`  Date range: ${apiData.earliest || 'N/A'} to ${apiData.latest || 'N/A'}`);

    console.log('\nBulk Data (financial_line_items table):');
    console.log(`  Records: ${bulkData.count}`);
    console.log(`  Date range: ${bulkData.earliest || 'N/A'} to ${bulkData.latest || 'N/A'}`);

    if (bulkData.count > 0) {
      const topConcepts = this.database.prepare(`
        SELECT concept, COUNT(*) as count
        FROM financial_line_items
        WHERE company_id = ?
        GROUP BY concept
        ORDER BY count DESC
        LIMIT 10
      `).all(company.id);

      console.log('\nTop concepts in bulk data:');
      topConcepts.forEach(c => {
        console.log(`  ${c.concept.padEnd(30)} ${c.count} records`);
      });
    }
  }

  /**
   * Run full verification suite
   */
  runFullVerification(options = {}) {
    const { sampleSymbol = null, sampleCik = null } = options;

    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEC BULK IMPORT VERIFICATION');
    console.log('='.repeat(60));

    this.getBasicStats();
    this.getTopConcepts(20);
    this.checkDataCompleteness();
    this.sampleCompanyData(sampleSymbol, sampleCik);
    this.checkMissingData();

    if (sampleSymbol) {
      this.compareWithAPIData(sampleSymbol);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Verification complete!\n');
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  const verifier = new SECImportVerifier();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SEC Import Verification

Usage:
  node verifySECImport.js [options]

Options:
  --full              Run full verification suite
  --stats             Show basic statistics only
  --concepts [n]      Show top n concepts (default: 20)
  --sample <symbol>   Show sample data for company
  --compare <symbol>  Compare bulk vs API data
  --help, -h          Show this help

Examples:
  node verifySECImport.js --full
  node verifySECImport.js --stats
  node verifySECImport.js --concepts 50
  node verifySECImport.js --sample AAPL
  node verifySECImport.js --compare NVDA
`);
    process.exit(0);
  }

  if (args.includes('--full')) {
    const symbolIndex = args.indexOf('--sample');
    const symbol = symbolIndex >= 0 ? args[symbolIndex + 1] : null;
    verifier.runFullVerification({ sampleSymbol: symbol });
  } else if (args.includes('--stats')) {
    verifier.getBasicStats();
  } else if (args.includes('--concepts')) {
    const limit = parseInt(args[args.indexOf('--concepts') + 1]) || 20;
    verifier.getTopConcepts(limit);
  } else if (args.includes('--sample')) {
    const symbol = args[args.indexOf('--sample') + 1];
    verifier.sampleCompanyData(symbol);
  } else if (args.includes('--compare')) {
    const symbol = args[args.indexOf('--compare') + 1];
    verifier.compareWithAPIData(symbol);
  } else {
    verifier.runFullVerification();
  }
}

module.exports = SECImportVerifier;
