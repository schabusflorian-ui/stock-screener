// src/database-migrations/add-fiscal-calendar.js
// Creates fiscal calendar table and imports fiscal year end data from SEC

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DB_PATH = path.join(__dirname, '../../data/stocks.db');
const SEC_BULK_PATH = path.join(__dirname, '../../data/sec-bulk');

function createFiscalCalendarTable(db) {
  console.log('Creating fiscal_calendar table...');

  db.exec(`
    -- Company fiscal year configuration
    CREATE TABLE IF NOT EXISTS company_fiscal_config (
      company_id INTEGER PRIMARY KEY,
      fiscal_year_end TEXT NOT NULL,  -- MMDD format (e.g., "0930" for Sep 30)
      fiscal_year_end_month INTEGER,  -- 1-12
      fiscal_year_end_day INTEGER,    -- 1-31
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    -- Fiscal calendar with all periods for each company
    CREATE TABLE IF NOT EXISTS fiscal_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      fiscal_year INTEGER NOT NULL,
      fiscal_period TEXT NOT NULL,      -- Q1, Q2, Q3, Q4, FY
      period_start DATE NOT NULL,       -- Start of period
      period_end DATE NOT NULL,         -- End of period
      filing_deadline DATE,             -- Expected filing deadline
      filed_date DATE,                  -- Actual filing date (if filed)
      form TEXT,                        -- 10-K, 10-Q
      adsh TEXT,                        -- SEC accession number
      calendar_quarter INTEGER,         -- Calendar quarter (1-4) for easy reference
      calendar_year INTEGER,            -- Calendar year of period_end
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      UNIQUE(company_id, fiscal_year, fiscal_period)
    );

    CREATE INDEX IF NOT EXISTS idx_fiscal_config_company ON company_fiscal_config(company_id);
    CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_company ON fiscal_calendar(company_id);
    CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_period_end ON fiscal_calendar(period_end DESC);
    CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_filed ON fiscal_calendar(filed_date DESC);
    CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_lookup ON fiscal_calendar(company_id, period_end);
  `);

  console.log('✅ fiscal_calendar tables created');
}

async function importFiscalYearEnds(db) {
  console.log('\nImporting fiscal year end data from SEC bulk files...');

  // Get all companies with CIK
  const companies = db.prepare(`
    SELECT id, cik, symbol, name FROM companies WHERE cik IS NOT NULL
  `).all();

  const cikToCompany = new Map();
  companies.forEach(c => {
    // Normalize CIK to match SEC format (10 digits with leading zeros)
    const normalizedCik = String(c.cik).padStart(10, '0');
    cikToCompany.set(normalizedCik, c);
  });

  console.log(`Found ${companies.length} companies with CIK numbers`);

  // Track fiscal year ends we've found
  const fiscalYearEnds = new Map(); // company_id -> { fye, forms }

  // Get list of all quarterly folders
  const quarters = fs.readdirSync(SEC_BULK_PATH)
    .filter(d => /^\d{4}q\d$/.test(d))
    .sort()
    .reverse(); // Most recent first

  console.log(`Processing ${quarters.length} quarterly SEC bulk files...`);

  // Process each quarter's sub.txt
  for (const quarter of quarters.slice(0, 8)) { // Last 8 quarters for speed
    const subPath = path.join(SEC_BULK_PATH, quarter, 'sub.txt');
    if (!fs.existsSync(subPath)) continue;

    const fileStream = fs.createReadStream(subPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isHeader = true;
    let headers = [];

    for await (const line of rl) {
      const fields = line.split('\t');

      if (isHeader) {
        headers = fields;
        isHeader = false;
        continue;
      }

      // Parse the row
      const row = {};
      headers.forEach((h, i) => row[h] = fields[i]);

      // Get company by CIK
      const cik = String(row.cik).padStart(10, '0');
      const company = cikToCompany.get(cik);
      if (!company) continue;

      // Skip if not 10-K or 10-Q
      if (!['10-K', '10-Q'].includes(row.form)) continue;

      // Record fiscal year end
      if (row.fye && !fiscalYearEnds.has(company.id)) {
        fiscalYearEnds.set(company.id, {
          fye: row.fye,
          form: row.form,
          filed: row.filed
        });
      }
    }
  }

  console.log(`Found fiscal year ends for ${fiscalYearEnds.size} companies`);

  // Insert fiscal year end data
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO company_fiscal_config
    (company_id, fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries) => {
    for (const [companyId, data] of entries) {
      const month = parseInt(data.fye.substring(0, 2));
      const day = parseInt(data.fye.substring(2, 4));
      insertStmt.run(companyId, data.fye, month, day);
    }
  });

  insertMany(fiscalYearEnds);
  console.log(`✅ Inserted fiscal year ends for ${fiscalYearEnds.size} companies`);

  return fiscalYearEnds;
}

async function buildFiscalCalendar(db) {
  console.log('\nBuilding fiscal calendar from financial_data...');

  // Get all fiscal configurations
  const configs = db.prepare(`
    SELECT c.id as company_id, c.symbol, fc.fiscal_year_end,
           fc.fiscal_year_end_month, fc.fiscal_year_end_day
    FROM companies c
    JOIN company_fiscal_config fc ON fc.company_id = c.id
  `).all();

  console.log(`Processing ${configs.length} companies with fiscal config...`);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO fiscal_calendar
    (company_id, fiscal_year, fiscal_period, period_start, period_end,
     filed_date, form, adsh, calendar_quarter, calendar_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;

  for (const config of configs) {
    // Get all financial data periods for this company
    const periods = db.prepare(`
      SELECT DISTINCT
        fiscal_year, fiscal_period, fiscal_date_ending, filed_date, form
      FROM financial_data
      WHERE company_id = ?
        AND fiscal_period IS NOT NULL
        AND fiscal_date_ending IS NOT NULL
      ORDER BY fiscal_date_ending DESC
    `).all(config.company_id);

    for (const period of periods) {
      // Calculate period start based on fiscal year end and period
      const periodEnd = new Date(period.fiscal_date_ending);
      const calendarYear = periodEnd.getFullYear();
      const calendarQuarter = Math.ceil((periodEnd.getMonth() + 1) / 3);

      // Calculate period start (roughly 3 months before end for quarterly)
      let periodStart;
      if (period.fiscal_period === 'FY') {
        // Annual: 12 months before
        periodStart = new Date(periodEnd);
        periodStart.setFullYear(periodStart.getFullYear() - 1);
        periodStart.setDate(periodStart.getDate() + 1);
      } else {
        // Quarterly: 3 months before
        periodStart = new Date(periodEnd);
        periodStart.setMonth(periodStart.getMonth() - 3);
        periodStart.setDate(periodStart.getDate() + 1);
      }

      try {
        insertStmt.run(
          config.company_id,
          period.fiscal_year || calendarYear,
          period.fiscal_period,
          periodStart.toISOString().split('T')[0],
          period.fiscal_date_ending,
          period.filed_date || null,
          period.form || null,
          null, // adsh - could be added later
          calendarQuarter,
          calendarYear
        );
        inserted++;
      } catch (err) {
        // Ignore duplicates
      }
    }
  }

  console.log(`✅ Inserted ${inserted} fiscal calendar entries`);
}

async function main() {
  console.log('=== Fiscal Calendar Migration ===\n');

  const db = new Database(DB_PATH);

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
    db.close();
  }
}

main().catch(console.error);
