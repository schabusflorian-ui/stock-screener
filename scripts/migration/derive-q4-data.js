#!/usr/bin/env node
// derive-q4-data.js

/**
 * Derive Q4 financial data from: Q4 = FY - (Q1 + Q2 + Q3)
 *
 * This script processes 10-K filings and calculates Q4 values
 * by subtracting Q1, Q2, and Q3 from the annual (FY) totals.
 */

const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 Deriving Q4 Financial Data\n');
console.log('='.repeat(60));

// Get all companies with FY data
const companiesWithFY = database.prepare(`
  SELECT DISTINCT
    company_id,
    fiscal_date_ending,
    fiscal_year
  FROM financial_data
  WHERE statement_type = 'income_statement'
    AND period_type = 'annual'
    AND form = '10-K'
  ORDER BY company_id, fiscal_date_ending DESC
`).all();

console.log(`Found ${companiesWithFY.length} annual filings to process\n`);

let processed = 0;
let q4Created = 0;
let skipped = 0;

for (const fy of companiesWithFY) {
  const { company_id, fiscal_date_ending, fiscal_year } = fy;

  // Get FY data for all statement types
  const fyStatements = database.prepare(`
    SELECT statement_type, data
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending = ?
      AND period_type = 'annual'
  `).all(company_id, fiscal_date_ending);

  if (fyStatements.length === 0) continue;

  // Get Q1, Q2, Q3 data for the same fiscal year
  // Find quarters with fiscal_date_ending within 12 months before the FY end date
  const fyEndDate = new Date(fiscal_date_ending);
  const oneYearBefore = new Date(fyEndDate);
  oneYearBefore.setFullYear(fyEndDate.getFullYear() - 1);
  const oneYearBeforeStr = oneYearBefore.toISOString().split('T')[0];

  const quarterlyStatements = database.prepare(`
    SELECT fiscal_date_ending, fiscal_period, statement_type, data
    FROM financial_data
    WHERE company_id = ?
      AND period_type = 'quarterly'
      AND fiscal_period IN ('Q1', 'Q2', 'Q3')
      AND fiscal_date_ending > ?
      AND fiscal_date_ending <= ?
    ORDER BY fiscal_date_ending
  `).all(company_id, oneYearBeforeStr, fiscal_date_ending);

  // Group quarterly data by statement type and period
  // For each statement type, keep the 3 most recent quarters
  const quarterlyByType = {};
  for (const stmt of quarterlyStatements) {
    if (!quarterlyByType[stmt.statement_type]) {
      quarterlyByType[stmt.statement_type] = {};
    }
    quarterlyByType[stmt.statement_type][stmt.fiscal_period] = JSON.parse(stmt.data);
  }

  // Calculate Q4 for each statement type
  let hasQ4 = false;

  for (const fyStmt of fyStatements) {
    const statementType = fyStmt.statement_type;
    const fyData = JSON.parse(fyStmt.data);
    const quarters = quarterlyByType[statementType] || {};

    // Check if we have all three quarters
    if (!quarters.Q1 || !quarters.Q2 || !quarters.Q3) {
      continue;
    }

    // Calculate Q4 = FY - (Q1 + Q2 + Q3)
    const q4Data = {};

    for (const [key, fyValue] of Object.entries(fyData)) {
      const fy = parseFloat(fyValue) || 0;
      const q1 = parseFloat(quarters.Q1[key]) || 0;
      const q2 = parseFloat(quarters.Q2[key]) || 0;
      const q3 = parseFloat(quarters.Q3[key]) || 0;

      const q4 = fy - (q1 + q2 + q3);

      // Only include if Q4 value is significant
      if (Math.abs(q4) > 0.01) {
        q4Data[key] = q4.toString();
      }
    }

    // Extract commonly used fields from Q4 data
    const q4Revenue = parseFloat(q4Data.revenue) || parseFloat(q4Data.totalRevenue) || null;
    const q4NetIncome = parseFloat(q4Data.netIncome) || null;
    const q4OperatingIncome = parseFloat(q4Data.operatingIncome) || null;

    // Insert Q4 record if we have data
    if (Object.keys(q4Data).length > 0) {
      const stmt = database.prepare(`
        INSERT INTO financial_data (
          company_id, statement_type, fiscal_date_ending, fiscal_year,
          period_type, fiscal_period, form, data,
          total_revenue, net_income, operating_income
        ) VALUES (?, ?, ?, ?, 'quarterly', 'Q4', '10-K', ?, ?, ?, ?)
        ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
        DO UPDATE SET
          data = excluded.data,
          total_revenue = excluded.total_revenue,
          net_income = excluded.net_income,
          operating_income = excluded.operating_income,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(
        company_id,
        statementType,
        fiscal_date_ending,
        fiscal_year,
        JSON.stringify(q4Data),
        q4Revenue,
        q4NetIncome,
        q4OperatingIncome
      );

      hasQ4 = true;
    }
  }

  if (hasQ4) {
    q4Created++;
  } else {
    skipped++;
  }

  processed++;

  if (processed % 100 === 0) {
    console.log(`Processed ${processed}/${companiesWithFY.length} (Q4 created: ${q4Created}, skipped: ${skipped})`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ Q4 Derivation Complete');
console.log('='.repeat(60));
console.log(`Total FY filings: ${companiesWithFY.length}`);
console.log(`Q4 records created: ${q4Created}`);
console.log(`Skipped (incomplete quarters): ${skipped}`);
console.log('');
