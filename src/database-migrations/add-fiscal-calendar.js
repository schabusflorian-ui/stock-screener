// src/database-migrations/add-fiscal-calendar.js
// Creates fiscal calendar table and imports fiscal year end data from SEC

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

  try {
    // Create tables
    createFiscalCalendarTable(db);

    // Import fiscal year ends from SEC data
    await importFiscalYearEnds(db);

    // Build fiscal calendar from existing financial data
    await buildFiscalCalendar(db);

    // Show some examples
    console.log('\n📊 Sample fiscal configurations:');
    const samples = db.prepare(`
      SELECT c.symbol, c.name, fc.fiscal_year_end,
             CASE fc.fiscal_year_end_month
               WHEN 1 THEN 'January'
               WHEN 2 THEN 'February'
               WHEN 3 THEN 'March'
               WHEN 4 THEN 'April'
               WHEN 5 THEN 'May'
               WHEN 6 THEN 'June'
               WHEN 7 THEN 'July'
               WHEN 8 THEN 'August'
               WHEN 9 THEN 'September'
               WHEN 10 THEN 'October'
               WHEN 11 THEN 'November'
               WHEN 12 THEN 'December'
             END as fiscal_year_end_month_name
      FROM companies c
      JOIN company_fiscal_config fc ON fc.company_id = c.id
      WHERE c.symbol IN ('AAPL', 'MSFT', 'NVDA', 'COST', 'NKE', 'WMT')
      ORDER BY c.symbol
    `).all();

    samples.forEach(s => {
      console.log(`  ${s.symbol}: Fiscal year ends ${s.fiscal_year_end_month_name} ${parseInt(s.fiscal_year_end.substring(2))}`);
    });

    // Show fiscal calendar sample
    console.log('\n📅 Sample fiscal calendar (AAPL):');
    const calendar = db.prepare(`
      SELECT fiscal_year, fiscal_period, period_start, period_end,
             filed_date, calendar_quarter, calendar_year
      FROM fiscal_calendar fc
      JOIN companies c ON c.id = fc.company_id
      WHERE c.symbol = 'AAPL'
      ORDER BY period_end DESC
      LIMIT 8
    `).all();

    calendar.forEach(c => {
      console.log(`  FY${c.fiscal_year} ${c.fiscal_period}: ${c.period_start} to ${c.period_end} (Cal Q${c.calendar_quarter} ${c.calendar_year})`);
    });

    console.log('\n✅ Migration complete!');

  } finally {
  }
}

main().catch(console.error);
