// src/bulk-import/verifySECImport.js
const { getDatabaseAsync } = require('../lib/db');

/**
 * SEC Import Verification
 *
 * Validates the imported data and generates quality reports
 */

class SECImportVerifier {
  /**
   * Get basic statistics
   */
  async getBasicStats() {
    const database = await getDatabaseAsync();

    console.log('\n📊 BASIC STATISTICS\n');
    console.log('='.repeat(60));

    const [companies, companiesWithData, totalLineItems, byStatementType, byFormType, dateRange] = await Promise.all([
      database.query('SELECT COUNT(*) as count FROM companies WHERE cik IS NOT NULL').then(r => r.rows?.[0]),
      database.query('SELECT COUNT(DISTINCT company_id) as count FROM financial_line_items').then(r => r.rows?.[0]),
      database.query('SELECT COUNT(*) as count FROM financial_line_items').then(r => r.rows?.[0]),
      database.query(`SELECT statement_type, COUNT(*) as count
        FROM financial_line_items
        GROUP BY statement_type
        ORDER BY count DESC`).then(r => r.rows || []),
      database.query(`SELECT form_type, COUNT(*) as count
        FROM financial_line_items
        GROUP BY form_type
        ORDER BY count DESC`).then(r => r.rows || []),
      database.query(`SELECT MIN(fiscal_date_ending) as earliest, MAX(fiscal_date_ending) as latest
        FROM financial_line_items`).then(r => r.rows?.[0])
    ]);

    const stats = {
      companies,
      companiesWithData,
      totalLineItems,
      byStatementType,
      byFormType,
      dateRange
    };

    console.log(`Companies (with CIK): ${(stats.companies?.count ?? 0).toLocaleString()}`);
    console.log(`Companies with data: ${(stats.companiesWithData?.count ?? 0).toLocaleString()}`);
    console.log(`Total line items: ${(stats.totalLineItems?.count ?? 0).toLocaleString()}`);
    console.log(`\nDate range: ${stats.dateRange?.earliest ?? 'N/A'} to ${stats.dateRange?.latest ?? 'N/A'}`);

    console.log('\nBy Statement Type:');
    (stats.byStatementType || []).forEach(row => {
      console.log(`  ${row.statement_type}: ${(row.count ?? 0).toLocaleString()}`);
    });

    console.log('\nBy Form Type:');
    (stats.byFormType || []).forEach(row => {
      console.log(`  ${row.form_type}: ${(row.count ?? 0).toLocaleString()}`);
    });

    return stats;
  }

  /**
   * Get top concepts
   */
  async getTopConcepts(limit = 20) {
    const database = await getDatabaseAsync();

    console.log(`\n📋 TOP ${limit} CONCEPTS\n`);
    console.log('='.repeat(60));

    const result = await database.query(`
      SELECT
        concept,
        statement_type,
        COUNT(*) as count,
        COUNT(DISTINCT company_id) as companies
      FROM financial_line_items
      GROUP BY concept
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);
    const concepts = result.rows || [];

    concepts.forEach((row, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${row.concept.padEnd(35)} ${row.statement_type.padEnd(18)} ${row.count.toLocaleString().padStart(10)} records  ${row.companies.toLocaleString().padStart(6)} companies`);
    });

    return concepts;
  }

  /**
   * Check data completeness for major metrics
   */
  async checkDataCompleteness() {
    const database = await getDatabaseAsync();

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

    const completeness = await Promise.all(keyMetrics.map(async metric => {
      const result = await database.query(`
        SELECT
          COUNT(DISTINCT company_id) as companies,
          COUNT(*) as records,
          MIN(fiscal_date_ending) as earliest,
          MAX(fiscal_date_ending) as latest
        FROM financial_line_items
        WHERE concept = $1
      `, [metric]);
      const row = result.rows?.[0];
      return { metric, ...row };
    }));

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
  async sampleCompanyData(symbol = null, cik = null, limit = 10) {
    const database = await getDatabaseAsync();

    console.log('\n📈 SAMPLE COMPANY DATA\n');
    console.log('='.repeat(60));

    let company;

    if (symbol) {
      const r = await database.query('SELECT * FROM companies WHERE symbol = $1 LIMIT 1', [symbol]);
      company = r.rows?.[0];
    } else if (cik) {
      const paddedCik = cik.padStart(10, '0');
      const r = await database.query('SELECT * FROM companies WHERE cik = $1 LIMIT 1', [paddedCik]);
      company = r.rows?.[0];
    } else {
      const r = await database.query(`
        SELECT c.*, COUNT(f.id) as record_count
        FROM companies c
        JOIN financial_line_items f ON f.company_id = c.id
        WHERE c.cik IS NOT NULL
        GROUP BY c.id
        ORDER BY record_count DESC
        LIMIT 1
      `);
      company = r.rows?.[0];
    }

    if (!company) {
      console.log('❌ Company not found');
      return null;
    }

    console.log(`Company: ${company.name} (CIK: ${company.cik})`);

    const lineResult = await database.query(`
      SELECT
        fiscal_date_ending,
        fiscal_period,
        concept,
        value,
        statement_type
      FROM financial_line_items
      WHERE company_id = $1
      ORDER BY fiscal_date_ending DESC, concept
      LIMIT $2
    `, [company.id, limit]);
    const lineItems = lineResult.rows || [];

    console.log(`\nRecent line items (latest ${limit}):\n`);

    lineItems.forEach(item => {
      const valueFormatted = (item.value ?? 0).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
      console.log(`  ${item.fiscal_date_ending}  ${(item.fiscal_period || '').padEnd(8)}  ${(item.concept || '').padEnd(30)}  ${valueFormatted.padStart(20)}  [${item.statement_type || ''}]`);
    });

    const conceptResult = await database.query(`
      SELECT COUNT(DISTINCT concept) as count
      FROM financial_line_items
      WHERE company_id = $1
    `, [company.id]);
    const conceptCount = conceptResult.rows?.[0];

    console.log(`\nTotal unique concepts: ${conceptCount?.count ?? 0}`);

    return { company, lineItems };
  }

  /**
   * Check for missing data
   */
  async checkMissingData() {
    const database = await getDatabaseAsync();

    console.log('\n⚠️  MISSING DATA ANALYSIS\n');
    console.log('='.repeat(60));

    const noDataResult = await database.query(`
      SELECT c.name, c.cik, c.symbol
      FROM companies c
      WHERE c.cik IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM financial_line_items f
          WHERE f.company_id = c.id
        )
      LIMIT 50
    `);
    const companiesNoData = noDataResult.rows || [];

    console.log(`\nCompanies with CIK but no financial data: ${companiesNoData.length}`);
    if (companiesNoData.length > 0) {
      console.log('Sample:');
      companiesNoData.slice(0, 10).forEach(c => {
        console.log(`  ${c.name} (${c.cik})`);
      });
    }

    const sparseResult = await database.query(`
      SELECT c.name, c.cik, COUNT(f.id) as record_count
      FROM companies c
      JOIN financial_line_items f ON f.company_id = c.id
      WHERE c.cik IS NOT NULL
      GROUP BY c.id
      HAVING record_count < 100
      ORDER BY record_count
      LIMIT 20
    `);
    const sparseCompanies = sparseResult.rows || [];

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
  async compareWithAPIData(symbol) {
    const database = await getDatabaseAsync();

    console.log(`\n🔄 COMPARING BULK vs API DATA: ${symbol}\n`);
    console.log('='.repeat(60));

    const companyResult = await database.query('SELECT * FROM companies WHERE symbol = $1 LIMIT 1', [symbol]);
    const company = companyResult.rows?.[0];

    if (!company) {
      console.log(`❌ Company ${symbol} not found`);
      return;
    }

    const [apiResult, bulkResult] = await Promise.all([
      database.query(`
        SELECT COUNT(*) as count, MIN(fiscal_date_ending) as earliest, MAX(fiscal_date_ending) as latest
        FROM financial_data
        WHERE company_id = $1
      `, [company.id]),
      database.query(`
        SELECT COUNT(*) as count, MIN(fiscal_date_ending) as earliest, MAX(fiscal_date_ending) as latest
        FROM financial_line_items
        WHERE company_id = $1
      `, [company.id])
    ]);
    const apiData = apiResult.rows?.[0];
    const bulkData = bulkResult.rows?.[0];

    console.log('API Data (financial_data table):');
    console.log(`  Records: ${apiData?.count ?? 0}`);
    console.log(`  Date range: ${apiData?.earliest || 'N/A'} to ${apiData?.latest || 'N/A'}`);

    console.log('\nBulk Data (financial_line_items table):');
    console.log(`  Records: ${bulkData?.count ?? 0}`);
    console.log(`  Date range: ${bulkData?.earliest || 'N/A'} to ${bulkData?.latest || 'N/A'}`);

    if (bulkData?.count > 0) {
      const topResult = await database.query(`
        SELECT concept, COUNT(*) as count
        FROM financial_line_items
        WHERE company_id = $1
        GROUP BY concept
        ORDER BY count DESC
        LIMIT 10
      `, [company.id]);
      const topConcepts = topResult.rows || [];

      console.log('\nTop concepts in bulk data:');
      topConcepts.forEach(c => {
        console.log(`  ${(c.concept || '').padEnd(30)} ${c.count} records`);
      });
    }
  }

  /**
   * Run full verification suite
   */
  async runFullVerification(options = {}) {
    const { sampleSymbol = null, sampleCik = null } = options;

    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEC BULK IMPORT VERIFICATION');
    console.log('='.repeat(60));

    await this.getBasicStats();
    await this.getTopConcepts(20);
    await this.checkDataCompleteness();
    await this.sampleCompanyData(sampleSymbol, sampleCik);
    await this.checkMissingData();

    if (sampleSymbol) {
      await this.compareWithAPIData(sampleSymbol);
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

  (async () => {
    try {
      if (args.includes('--full')) {
        const symbolIndex = args.indexOf('--sample');
        const symbol = symbolIndex >= 0 ? args[symbolIndex + 1] : null;
        await verifier.runFullVerification({ sampleSymbol: symbol });
      } else if (args.includes('--stats')) {
        await verifier.getBasicStats();
      } else if (args.includes('--concepts')) {
        const limit = parseInt(args[args.indexOf('--concepts') + 1], 10) || 20;
        await verifier.getTopConcepts(limit);
      } else if (args.includes('--sample')) {
        const symbol = args[args.indexOf('--sample') + 1];
        await verifier.sampleCompanyData(symbol);
      } else if (args.includes('--compare')) {
        const symbol = args[args.indexOf('--compare') + 1];
        await verifier.compareWithAPIData(symbol);
      } else {
        await verifier.runFullVerification();
      }
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

module.exports = SECImportVerifier;
