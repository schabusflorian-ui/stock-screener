// calculate-all-metrics.js
const path = require('path');
const projectRoot = path.join(__dirname, '../..');
const db = require(path.join(projectRoot, 'src/database'));
const MetricCalculator = require(path.join(projectRoot, 'src/services/metricCalculator'));
const SchemaManager = require(path.join(projectRoot, 'src/utils/schemaManager'));

const database = db.getDatabase();
const calculator = new MetricCalculator();
const schemaManager = new SchemaManager(database);

function mergeFinancialStatements(financials) {
  // Group by fiscal period (fiscal_year + fiscal_quarter + period_type)
  // instead of fiscal_date_ending to handle cases where different statement types
  // have different dates (e.g., Adobe Q3: balance sheet on 08-31, cash flow on 09-30)
  const periods = new Map();

  for (const f of financials) {
    // Create key from fiscal period info, not date
    // Use fiscal_quarter for period identification (Q1, Q2, Q3, Q4, FY)
    const periodKey = `${f.fiscal_year}_${f.fiscal_quarter || 'FY'}_${f.period_type}`;

    if (!periods.has(periodKey)) {
      // Use period_type directly from database
      const periodType = f.period_type || 'annual';

      periods.set(periodKey, {
        fiscalDateEnding: f.fiscal_date_ending, // Use the first date encountered
        fiscalYear: f.fiscal_year,
        fiscalQuarter: f.fiscal_quarter,
        periodType: periodType,
        balance_sheet: null,
        income_statement: null,
        cash_flow: null,
        dates: [] // Track all dates for this period
      });
    }

    // Parse and assign data to the correct statement type
    const data = JSON.parse(f.data);
    const period = periods.get(periodKey);

    // Track the date for this statement type
    period.dates.push(f.fiscal_date_ending);

    if (f.statement_type === 'balance_sheet') {
      period.balance_sheet = data;
      // Prefer balance sheet date as the canonical date (point-in-time)
      period.fiscalDateEnding = f.fiscal_date_ending;
    } else if (f.statement_type === 'income_statement') {
      period.income_statement = data;
      // If no balance sheet date yet, use income statement date
      if (!period.balance_sheet) {
        period.fiscalDateEnding = f.fiscal_date_ending;
      }
    } else if (f.statement_type === 'cash_flow') {
      period.cash_flow = data;
      // Cash flow is last priority for date (often offset by a month)
      if (!period.balance_sheet && !period.income_statement) {
        period.fiscalDateEnding = f.fiscal_date_ending;
      }
    }
  }

  return Array.from(periods.values());
}

async function calculateAllMetrics() {
  console.log('\n📊 CALCULATING METRICS FOR ALL COMPANIES\n');
  console.log('='.repeat(60));
  
  // Get all companies
  const companies = database.prepare(`
    SELECT id, symbol FROM companies WHERE is_active = 1
  `).all();
  
  console.log(`\n📋 Found ${companies.length} companies\n`);
  
  let processed = 0;
  let failed = 0;
  let totalMetrics = 0;
  
  for (const company of companies) {
    try {
      // Get all financial statements for this company
      const financials = database.prepare(`
        SELECT
          fiscal_date_ending,
          fiscal_year,
          fiscal_period as fiscal_quarter,
          period_type,
          statement_type,
          data
        FROM financial_data
        WHERE company_id = ?
        ORDER BY fiscal_date_ending DESC
      `).all(company.id);
      
      if (financials.length === 0) {
        console.log(`⚠️  ${company.symbol}: No financial data`);
        failed++;
        continue;
      }
      
      // Check if we have all three statement types
      const statementTypes = new Set(financials.map(f => f.statement_type));
      const hasAllStatements = 
        statementTypes.has('balance_sheet') &&
        statementTypes.has('income_statement') &&
        statementTypes.has('cash_flow');
      
      if (!hasAllStatements) {
        console.log(`⚠️  ${company.symbol}: Missing statements (have: ${Array.from(statementTypes).join(', ')})`);
        failed++;
        continue;
      }
      
      // Merge statements by period
      const periods = mergeFinancialStatements(financials);
      
      // Calculate metrics for each period
      let metricsCount = 0;
      for (let i = 0; i < periods.length; i++) {
        const periodData = periods[i];
        // Previous period is next in array (sorted DESC), same period_type preferred
        let prevPeriodData = null;
        for (let j = i + 1; j < periods.length; j++) {
          if (periods[j].periodType === periodData.periodType) {
            prevPeriodData = periods[j];
            break;
          }
        }

        try {
          // Prepare context for growth metrics
          const context = {
            companyId: company.id,
            fiscalDate: periodData.fiscalDateEnding,
            periodType: periodData.periodType
          };

          const metrics = calculator.calculateAllMetrics(
            periodData,
            null, // marketCap - not available in this script
            null, // currentPrice - not available in this script
            context,
            prevPeriodData // Pass previous period for average calculations (ROA, ROE)
          );

          schemaManager.insertOrUpdateMetrics(
            company.id,
            periodData.fiscalDateEnding,
            periodData.fiscalYear,
            metrics,
            periodData.periodType  // Pass the determined period type
          );

          metricsCount++;
          totalMetrics++;
        } catch (error) {
          console.log(`  ⚠️  Period ${periodData.fiscalDateEnding}: ${error.message}`);
        }
      }
      
      console.log(`✅ ${company.symbol}: ${metricsCount} periods calculated`);
      processed++;
      
    } catch (error) {
      console.log(`❌ ${company.symbol}: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Successfully processed: ${processed}/${companies.length}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total metrics calculated: ${totalMetrics}`);
  console.log('='.repeat(60) + '\n');
}

calculateAllMetrics();