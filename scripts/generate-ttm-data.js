#!/usr/bin/env node
/**
 * Generate TTM (Trailing Twelve Months) Financial Data
 *
 * This script calculates TTM financial statements from quarterly data:
 * - For income statement and cash flow: Sum of last 4 quarters
 * - For balance sheet: Use most recent quarter
 *
 * TTM data provides a rolling 12-month view that's more current than annual data.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('\n📊 TTM FINANCIAL DATA GENERATOR\n');

// Get all companies with quarterly data
const companiesWithQuarterly = db.prepare(`
  SELECT DISTINCT c.id, c.symbol, c.name
  FROM companies c
  JOIN financial_data fd ON c.id = fd.company_id
  WHERE fd.period_type = 'quarterly'
  ORDER BY c.symbol
`).all();

console.log(`Found ${companiesWithQuarterly.length} companies with quarterly data\n`);

let processedCompanies = 0;
let ttmRecordsCreated = 0;
let errors = 0;

// Process each company
for (const company of companiesWithQuarterly) {
  try {
    // Get all quarterly data for this company, ordered by date
    const quarterlyData = db.prepare(`
      SELECT *
      FROM financial_data
      WHERE company_id = ? AND period_type = 'quarterly'
      ORDER BY fiscal_date_ending DESC
    `).all(company.id);

    if (quarterlyData.length < 4) {
      // Need at least 4 quarters for TTM
      continue;
    }

    // Group by statement type
    const byStatement = {
      balance_sheet: quarterlyData.filter(d => d.statement_type === 'balance_sheet'),
      income_statement: quarterlyData.filter(d => d.statement_type === 'income_statement'),
      cash_flow: quarterlyData.filter(d => d.statement_type === 'cash_flow')
    };

    // Find unique dates where we have complete data (all 3 statement types)
    const dateMap = new Map();
    for (const record of quarterlyData) {
      const date = record.fiscal_date_ending;
      if (!dateMap.has(date)) {
        dateMap.set(date, new Set());
      }
      dateMap.get(date).add(record.statement_type);
    }

    // Get dates with all 3 statement types, sorted desc
    const completeDates = Array.from(dateMap.entries())
      .filter(([_, types]) => types.size === 3)
      .map(([date]) => date)
      .sort((a, b) => b.localeCompare(a));

    if (completeDates.length === 0) {
      continue;
    }

    // For each complete date, try to create TTM data
    for (const endDate of completeDates) {
      // Get the 4 most recent quarters up to and including this date
      const incomeQuarters = byStatement.income_statement
        .filter(d => d.fiscal_date_ending <= endDate)
        .slice(0, 4);

      const cashFlowQuarters = byStatement.cash_flow
        .filter(d => d.fiscal_date_ending <= endDate)
        .slice(0, 4);

      const balanceSheet = byStatement.balance_sheet
        .find(d => d.fiscal_date_ending === endDate);

      // Need 4 quarters of income/cash flow data
      if (incomeQuarters.length < 4 || cashFlowQuarters.length < 4 || !balanceSheet) {
        continue;
      }

      // Calculate fiscal year and period from the end date
      const fiscalYear = new Date(endDate).getFullYear();
      const fiscalPeriod = `TTM-${endDate}`;

      // Check if TTM record already exists
      const existing = db.prepare(`
        SELECT id FROM financial_data
        WHERE company_id = ? AND fiscal_date_ending = ? AND period_type = 'ttm' AND statement_type = ?
      `).get(company.id, endDate, 'income_statement');

      if (existing) {
        // TTM already exists for this date
        continue;
      }

      // Calculate TTM income statement (sum of 4 quarters)
      const ttmIncome = sumQuarters(incomeQuarters);

      // Calculate TTM cash flow (sum of 4 quarters)
      const ttmCashFlow = sumQuarters(cashFlowQuarters);

      // Balance sheet uses most recent quarter (no summing needed)
      const ttmBalanceSheet = JSON.parse(balanceSheet.data);

      // Insert TTM records
      const insertStmt = db.prepare(`
        INSERT INTO financial_data (
          company_id, statement_type, fiscal_date_ending, fiscal_year,
          period_type, data, fiscal_period, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'ttm', ?, ?, datetime('now'), datetime('now'))
      `);

      insertStmt.run(company.id, 'income_statement', endDate, fiscalYear, JSON.stringify(ttmIncome), fiscalPeriod);
      insertStmt.run(company.id, 'cash_flow', endDate, fiscalYear, JSON.stringify(ttmCashFlow), fiscalPeriod);
      insertStmt.run(company.id, 'balance_sheet', endDate, fiscalYear, JSON.stringify(ttmBalanceSheet), fiscalPeriod);

      ttmRecordsCreated += 3;

      // Only create one TTM period per company (most recent)
      break;
    }

    processedCompanies++;

    if (processedCompanies % 100 === 0) {
      console.log(`  Processed ${processedCompanies} companies, created ${ttmRecordsCreated} TTM records`);
    }

  } catch (error) {
    errors++;
    console.error(`  Error processing ${company.symbol}: ${error.message}`);
  }
}

console.log(`\n✅ Complete!\n`);
console.log(`  Companies processed: ${processedCompanies}`);
console.log(`  TTM records created: ${ttmRecordsCreated}`);
console.log(`  Errors: ${errors}\n`);

db.close();

/**
 * Sum quarterly data for income statement and cash flow
 * Adds up numeric fields across 4 quarters
 * Handles both number and string representations of numbers
 */
function sumQuarters(quarters) {
  const result = {};
  const parsedQuarters = quarters.map(q => JSON.parse(q.data));

  // Get all unique keys across all quarters
  const allKeys = new Set();
  for (const quarter of parsedQuarters) {
    Object.keys(quarter).forEach(key => allKeys.add(key));
  }

  // For each key, sum the values
  for (const key of allKeys) {
    let sum = 0;
    let hasValue = false;

    for (const quarter of parsedQuarters) {
      const value = quarter[key];
      if (value !== null && value !== undefined) {
        // Handle both numbers and string representations
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (!isNaN(numValue) && typeof numValue === 'number') {
          sum += numValue;
          hasValue = true;
        }
      }
    }

    result[key] = hasValue ? sum : null;
  }

  return result;
}
