// calculate-and-store-robust.js
const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');
const SchemaManager = require('./src/utils/schemaManager');

const calculator = new MetricCalculator();
const database = db.getDatabase();
const schemaManager = new SchemaManager();

console.log('\n📊 CALCULATING AND STORING METRICS (ROBUST)\n');
console.log('='.repeat(60));

// STEP 1: Ensure schema is complete
console.log('\n🔧 Step 1: Checking schema...');
schemaManager.ensureCalculatedMetricsSchema();

// STEP 2: Get available columns
const availableColumns = schemaManager.getAvailableMetricColumns();
console.log(`\n✅ Found ${availableColumns.length} metric columns available`);

// Get all companies
const companies = db.getAllCompanies();
console.log(`\n📊 Found ${companies.length} companies to process\n`);

let totalMetricsCalculated = 0;

// For each company
for (const company of companies) {
  console.log(`\n📈 Processing ${company.symbol}...`);
  
  // Get all fiscal periods with complete data
  const periods = database.prepare(`
    SELECT DISTINCT fiscal_date_ending
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending IN (
        SELECT fiscal_date_ending
        FROM financial_data
        WHERE company_id = ?
        GROUP BY fiscal_date_ending
        HAVING COUNT(DISTINCT statement_type) = 3
      )
    ORDER BY fiscal_date_ending DESC
  `).all(company.id, company.id);
  
  console.log(`   Found ${periods.length} complete fiscal periods`);
  
  // Calculate metrics for each period
  for (const period of periods) {
    const fiscalDate = period.fiscal_date_ending;
    
    // Get financial statements for this period
    const financials = database.prepare(`
      SELECT statement_type, data
      FROM financial_data
      WHERE company_id = ?
        AND fiscal_date_ending = ?
    `).all(company.id, fiscalDate);
    
    // Parse and organize
    const financialData = {};
    financials.forEach(f => {
      financialData[f.statement_type] = JSON.parse(f.data);
    });
    
    // Calculate metrics
    const metrics = calculator.calculateAllMetrics(
      financialData,
      company.market_cap,
      null
    );
    
    if (metrics) {
      // Build dynamic INSERT based on available columns and calculated metrics
      const columnsToInsert = ['company_id', 'fiscal_period', 'period_type'];
      const valuesToInsert = [company.id, fiscalDate, 'annual'];
      const updateSetClauses = [];
      
      // Map metric calculator output to database columns
      const metricMapping = {
        roic: 'roic',
        roe: 'roe',
        roa: 'roa',
        gross_margin: 'gross_margin',
        operating_margin: 'operating_margin',
        net_margin: 'net_margin',
        fcf: 'fcf',
        fcf_margin: 'fcf_margin',
        fcf_yield: 'fcf_yield',
        debt_to_equity: 'debt_to_equity',
        debt_to_assets: 'debt_to_assets',
        current_ratio: 'current_ratio',
        quick_ratio: 'quick_ratio',
        interest_coverage: 'interest_coverage',
        pe_ratio: 'pe_ratio',
        pb_ratio: 'pb_ratio',
        ps_ratio: 'ps_ratio',
        tobins_q: 'tobins_q',
        asset_turnover: 'asset_turnover',
        earnings_yield: 'earnings_yield',
        owner_earnings: 'owner_earnings',
        quality_score: 'data_quality_score'
      };
      
      // Only add columns that exist in both the metrics and the database
      for (const [metricKey, dbColumn] of Object.entries(metricMapping)) {
        if (availableColumns.includes(dbColumn) && metrics[metricKey] !== undefined) {
          columnsToInsert.push(dbColumn);
          valuesToInsert.push(metrics[metricKey]);
          updateSetClauses.push(`${dbColumn} = excluded.${dbColumn}`);
        }
      }
      
      // Build and execute query
      const placeholders = valuesToInsert.map(() => '?').join(', ');
      const sql = `
        INSERT INTO calculated_metrics (${columnsToInsert.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT(company_id, fiscal_period, period_type) DO UPDATE SET
          ${updateSetClauses.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      `;
      
      try {
        const stmt = database.prepare(sql);
        stmt.run(...valuesToInsert);
        
        totalMetricsCalculated++;
        console.log(`   ✓ ${fiscalDate}: ROIC=${metrics.roic}%, Quality=${metrics.quality_score}`);
      } catch (error) {
        console.error(`   ✗ Error storing metrics for ${fiscalDate}:`, error.message);
      }
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✅ COMPLETE: Calculated ${totalMetricsCalculated} metric sets`);
console.log('='.repeat(60) + '\n');

// Show summary
try {
  const summary = database.prepare(`
    SELECT 
      c.symbol,
      c.name,
      COUNT(m.id) as periods,
      ROUND(AVG(m.roic), 1) as avg_roic,
      ROUND(AVG(m.fcf_yield), 1) as avg_fcf_yield,
      ROUND(AVG(m.data_quality_score), 0) as avg_quality
    FROM companies c
    JOIN calculated_metrics m ON c.id = m.company_id
    GROUP BY c.symbol, c.name
    ORDER BY avg_roic DESC
  `).all();

  console.log('📊 SUMMARY BY COMPANY:\n');
  console.log('Symbol | Name           | Periods | Avg ROIC | FCF Yield | Quality');
  console.log('-'.repeat(70));
  summary.forEach(s => {
    console.log(
      `${s.symbol.padEnd(6)} | ${s.name.substring(0, 14).padEnd(14)} | ` +
      `${String(s.periods).padStart(7)} | ${String(s.avg_roic + '%').padStart(8)} | ` +
      `${String(s.avg_fcf_yield + '%').padStart(9)} | ${String(s.avg_quality).padStart(7)}`
    );
  });

  console.log('');
} catch (error) {
  console.warn('⚠️  Could not generate summary:', error.message);
}