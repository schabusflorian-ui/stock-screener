// Diagnostic script to check data availability for Sectors, Factors, and Alpha
const { getDatabaseAsync } = require('../database');

async function diagnoseDataIssues() {
  try {
    const database = await getDatabaseAsync();
    console.log('\n=== Data Availability Diagnostic ===\n');

    // Check 1: Sectors data (calculated_metrics)
    console.log('1. SECTORS DATA:');
    const sectorsCount = await database.query(`
      SELECT COUNT(DISTINCT company_id) as companies_with_metrics,
             COUNT(*) as total_metrics,
             MAX(fiscal_period) as latest_period
      FROM calculated_metrics
      WHERE period_type = 'annual'
    `);
    console.log('  - Companies with calculated metrics:', sectorsCount.rows[0].companies_with_metrics);
    console.log('  - Total metric records:', sectorsCount.rows[0].total_metrics);
    console.log('  - Latest fiscal period:', sectorsCount.rows[0].latest_period);

    const sectorBreakdown = await database.query(`
      SELECT c.sector, COUNT(DISTINCT c.id) as company_count
      FROM companies c
      JOIN calculated_metrics m ON c.id = m.company_id
      WHERE m.period_type = 'annual'
        AND c.sector IS NOT NULL
      GROUP BY c.sector
      ORDER BY company_count DESC
      LIMIT 5
    `);
    console.log('  - Top sectors:', sectorBreakdown.rows.map(r => `${r.sector}: ${r.company_count}`).join(', '));

    // Check 2: Factor Analysis data
    console.log('\n2. FACTOR ANALYSIS DATA:');

    // Check if factor_performance table exists
    try {
      const factorCount = await database.query(`
        SELECT COUNT(*) as records, MAX(date) as latest_date
        FROM factor_performance
      `);
      console.log('  - Factor performance records:', factorCount.rows[0].records);
      console.log('  - Latest date:', factorCount.rows[0].latest_date);
    } catch (e) {
      console.log('  - factor_performance table:', e.message.includes('does not exist') ? 'DOES NOT EXIST' : `ERROR: ${e.message}`);
    }

    // Check factor_scores table
    try {
      const scoresCount = await database.query(`
        SELECT COUNT(*) as records,
               COUNT(DISTINCT company_id) as companies,
               MAX(date) as latest_date
        FROM factor_scores
      `);
      console.log('  - Factor score records:', scoresCount.rows[0].records);
      console.log('  - Companies with scores:', scoresCount.rows[0].companies);
      console.log('  - Latest date:', scoresCount.rows[0].latest_date);
    } catch (e) {
      console.log('  - factor_scores table:', e.message.includes('does not exist') ? 'DOES NOT EXIST' : `ERROR: ${e.message}`);
    }

    // Check 3: Alpha vs S&P 500 data (index_prices)
    console.log('\n3. ALPHA / INDEX DATA:');

    try {
      const indexCount = await database.query(`
        SELECT COUNT(*) as records,
               COUNT(DISTINCT index_symbol) as indices,
               MAX(date) as latest_date
        FROM index_prices
      `);
      console.log('  - Index price records:', indexCount.rows[0].records);
      console.log('  - Tracked indices:', indexCount.rows[0].indices);
      console.log('  - Latest date:', indexCount.rows[0].latest_date);

      // Check for SPY specifically
      const spyCount = await database.query(`
        SELECT COUNT(*) as records,
               MIN(date) as earliest,
               MAX(date) as latest
        FROM index_prices
        WHERE index_symbol = 'SPY'
      `);
      console.log('  - SPY records:', spyCount.rows[0].records);
      console.log('  - SPY date range:', `${spyCount.rows[0].earliest} to ${spyCount.rows[0].latest}`);
    } catch (e) {
      console.log('  - index_prices table:', e.message.includes('does not exist') ? 'DOES NOT EXIST' : `ERROR: ${e.message}`);
    }

    // Check price_metrics for companies (needed for alpha calculation)
    try {
      const priceMetricsCount = await database.query(`
        SELECT COUNT(DISTINCT company_id) as companies_with_prices
        FROM price_metrics
        WHERE last_price IS NOT NULL
      `);
      console.log('  - Companies with price data:', priceMetricsCount.rows[0].companies_with_prices);
    } catch (e) {
      console.log('  - price_metrics table:', `ERROR: ${e.message}`);
    }

    // Check 4: Check for PostgreSQL-specific issues
    console.log('\n4. POSTGRESQL COMPATIBILITY CHECK:');

    // Test date functions
    const dateTest = await database.query(`SELECT NOW() as current_timestamp, CURRENT_DATE as current_date`);
    console.log('  - PostgreSQL date functions:', 'Working ✓');

    // Test if data exists but with wrong case
    const caseTest = await database.query(`
      SELECT COUNT(*) as count FROM companies WHERE sector IS NOT NULL
    `);
    console.log('  - Companies with sector field:', caseTest.rows[0].count);

    console.log('\n=== Diagnostic Complete ===\n');
    console.log('RECOMMENDATIONS:');

    if (parseInt(sectorsCount.rows[0].companies_with_metrics) === 0) {
      console.log('  ⚠️  No calculated_metrics data - Run metrics calculation job');
    } else {
      console.log('  ✓ Sectors data available');
    }

  } catch (error) {
    console.error('Diagnostic error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  diagnoseDataIssues()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { diagnoseDataIssues };
