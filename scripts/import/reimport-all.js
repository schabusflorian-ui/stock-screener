// Re-import all companies in database with quarterly data support
const SECProvider = require('./src/providers/SECProvider');
const StockImporter = require('./src/services/stockImporter');
const db = require('./src/database');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('RE-IMPORT ALL COMPANIES WITH QUARTERLY DATA');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // Get all companies currently in database
    const database = db.getDatabase();
    const companies = database.prepare(`
      SELECT symbol, name FROM companies
      WHERE is_active = 1
      ORDER BY symbol
    `).all();

    if (companies.length === 0) {
      console.log('❌ No companies found in database');
      console.log('   Import some companies first!\n');
      process.exit(1);
    }

    console.log(`📊 Found ${companies.length} companies to re-import:\n`);
    companies.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.symbol} - ${c.name}`);
    });

    console.log('\n' + '═'.repeat(50));
    console.log('Starting re-import process...');
    console.log('═'.repeat(50) + '\n');

    // Initialize provider and importer
    const provider = new SECProvider();
    const importer = new StockImporter(provider);

    const symbols = companies.map(c => c.symbol);

    // Use bulk import with delay to respect SEC rate limits
    const result = await importer.bulkImport(symbols, {
      delayBetweenImports: 200, // 200ms between requests (SEC allows 10/sec)
      stopOnError: false          // Continue even if some fail
    });

    console.log('\n' + '═'.repeat(50));
    console.log('📊 FINAL STATISTICS');
    console.log('═'.repeat(50));

    // Get updated statistics
    const stats = database.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as companies,
        COUNT(CASE WHEN f.period_type = 'annual' THEN 1 END) as annual_reports,
        COUNT(CASE WHEN f.period_type = 'quarterly' THEN 1 END) as quarterly_reports,
        COUNT(DISTINCT f.id) as total_reports
      FROM companies c
      LEFT JOIN financial_data f ON c.id = f.company_id
      WHERE c.is_active = 1
    `).get();

    console.log(`Companies: ${stats.companies}`);
    console.log(`Annual Reports: ${stats.annual_reports}`);
    console.log(`Quarterly Reports: ${stats.quarterly_reports}`);
    console.log(`Total Reports: ${stats.total_reports}`);

    // Show quarterly data breakdown
    console.log('\n📊 Quarterly Data by Statement Type:');
    const breakdown = database.prepare(`
      SELECT
        statement_type,
        COUNT(*) as count
      FROM financial_data
      WHERE period_type = 'quarterly'
      GROUP BY statement_type
      ORDER BY statement_type
    `).all();

    breakdown.forEach(row => {
      console.log(`   ${row.statement_type}: ${row.count} reports`);
    });

    console.log('\n═'.repeat(50));
    console.log('✅ RE-IMPORT COMPLETE');
    console.log('═'.repeat(50));

    // Verify some quarterly data
    console.log('\n🔍 Sample Verification:');
    const sample = database.prepare(`
      SELECT
        c.symbol,
        f.fiscal_date_ending,
        f.fiscal_period,
        f.statement_type
      FROM financial_data f
      JOIN companies c ON c.id = f.company_id
      WHERE f.period_type = 'quarterly'
        AND f.statement_type = 'balance_sheet'
      ORDER BY f.fiscal_date_ending DESC
      LIMIT 5
    `).all();

    console.log('   Recent quarterly balance sheets:');
    sample.forEach(s => {
      console.log(`   - ${s.symbol}: ${s.fiscal_period} ${s.fiscal_date_ending}`);
    });

    console.log('\n💡 Use these scripts to query the data:');
    console.log('   node query-quarterly-data.js     - See examples');
    console.log('   node get-field.js SYMBOL DATE FIELD - Quick field access\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
