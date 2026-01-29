#!/usr/bin/env node

/**
 * Fetch German (DAX 40) Company Data
 *
 * Uses Yahoo Finance to get fundamentals for German companies.
 * Stores in company_identifiers and creates companies entries.
 *
 * Usage: node scripts/fetch-german-companies.js
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { spawn } = require('child_process');

// Load DAX 40 companies
const germanCompanies = require('../data/german_companies.json').companies;

async function fetchYahooData(ticker) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [path.join(__dirname, 'helpers', 'fetch_yahoo_german.py'), ticker]);
    let output = '';
    let error = '';

    python.stdout.on('data', (data) => { output += data.toString(); });
    python.stderr.on('data', (data) => { error += data.toString(); });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python error: ${error || 'Unknown error'}`));
      } else {
        try {
          // Find last complete JSON object in output (handles warnings before it)
          const lines = output.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          if (jsonLine && jsonLine.startsWith('{')) {
            resolve(JSON.parse(jsonLine));
          } else {
            reject(new Error(`No JSON found in output: ${output.substring(0, 100)}`));
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message} - Output: ${output.substring(0, 200)}`));
        }
      }
    });
  });
}

async function main() {
  console.log('🇩🇪 German (DAX 40) Company Data Fetcher');
  console.log('=========================================\n');

  // Connect to database
  const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Prepare statements
  const stmtCheckCompany = db.prepare(`SELECT id FROM companies WHERE symbol = ?`);
  const stmtInsertCompany = db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, exchange, country, is_active, last_updated)
    VALUES (?, ?, ?, ?, ?, 'DE', 1, CURRENT_TIMESTAMP)
  `);
  const stmtUpdateCompany = db.prepare(`
    UPDATE companies SET
      name = COALESCE(?, name),
      sector = COALESCE(?, sector),
      industry = COALESCE(?, industry),
      exchange = COALESCE(?, exchange),
      last_updated = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const stmtCheckIdentifier = db.prepare(`SELECT id FROM company_identifiers WHERE yahoo_symbol = ?`);
  const stmtInsertIdentifier = db.prepare(`
    INSERT INTO company_identifiers (yahoo_symbol, ticker, exchange, legal_name, country, link_status, link_method, company_id)
    VALUES (?, ?, ?, ?, 'DE', 'linked', 'yahoo_direct', ?)
  `);

  // calculated_metrics stores derived ratios, not raw financials
  // We'll store what we can: roe, roa, margins, pe_ratio, fcf, debt_to_equity
  const stmtInsertMetric = db.prepare(`
    INSERT OR REPLACE INTO calculated_metrics (
      company_id, fiscal_period, period_type, data_source,
      roe, roa, net_margin, operating_margin,
      pe_ratio, fcf, debt_to_equity,
      created_at
    ) VALUES (?, ?, ?, 'yahoo', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const stats = { success: 0, failed: 0, errors: [] };

  console.log(`Processing ${germanCompanies.length} companies...\n`);

  for (const company of germanCompanies) {
    const { ticker, name: expectedName, sector: expectedSector } = company;

    process.stdout.write(`  ${ticker.padEnd(12)}`);

    try {
      const data = await fetchYahooData(ticker);

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      // Get or create company
      let companyRow = stmtCheckCompany.get(ticker);
      let companyId;

      if (companyRow) {
        companyId = companyRow.id;
        stmtUpdateCompany.run(
          data.name || expectedName,
          data.sector || expectedSector,
          data.industry,
          data.exchange,
          companyId
        );
      } else {
        const result = stmtInsertCompany.run(
          ticker,
          data.name || expectedName,
          data.sector || expectedSector,
          data.industry,
          data.exchange
        );
        companyId = result.lastInsertRowid;
      }

      // Create company_identifier if not exists
      const identifierRow = stmtCheckIdentifier.get(ticker);
      if (!identifierRow) {
        stmtInsertIdentifier.run(
          ticker,
          ticker.replace('.DE', ''),
          'XETR',
          data.name || expectedName,
          companyId
        );
      }

      // Store quarterly metrics (derived ratios only)
      let metricsStored = 0;
      for (const q of data.quarterly_data || []) {
        if (q.period_end) {
          // Calculate debt_to_equity if we have the data
          let debtToEquity = null;
          if (data.balance_sheet?.total_debt && data.balance_sheet?.total_equity && data.balance_sheet.total_equity > 0) {
            debtToEquity = data.balance_sheet.total_debt / data.balance_sheet.total_equity;
          }

          // Calculate net margin from quarterly data if available
          let netMargin = data.info?.profit_margins;
          if (q.net_income && q.revenue && q.revenue > 0) {
            netMargin = q.net_income / q.revenue;
          }

          // Calculate operating margin
          let opMargin = data.info?.operating_margins;
          if (q.operating_income && q.revenue && q.revenue > 0) {
            opMargin = q.operating_income / q.revenue;
          }

          stmtInsertMetric.run(
            companyId,
            q.period_end,
            'quarterly',
            data.info?.roe,
            data.info?.roa,
            netMargin,
            opMargin,
            data.trailing_pe,
            data.cash_flow?.free_cash_flow,
            debtToEquity
          );
          metricsStored++;
        }
      }

      console.log(`✅ ${(data.name || expectedName).substring(0, 30).padEnd(32)} ${metricsStored} quarters`);
      stats.success++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.log(`❌ ${error.message.substring(0, 50)}`);
      stats.failed++;
      stats.errors.push({ ticker, error: error.message });
    }
  }

  // Summary
  console.log('\n=========================================');
  console.log('📊 SUMMARY');
  console.log('=========================================');
  console.log(`  ✅ Success: ${stats.success}`);
  console.log(`  ❌ Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\nFailed companies:');
    stats.errors.forEach(e => console.log(`  - ${e.ticker}: ${e.error}`));
  }

  // Show final counts
  const countResult = db.prepare(`
    SELECT COUNT(*) as companies,
           (SELECT COUNT(*) FROM calculated_metrics WHERE company_id IN
             (SELECT id FROM companies WHERE country = 'DE')) as metrics
    FROM companies WHERE country = 'DE'
  `).get();

  console.log(`\n📈 Database now has:`);
  console.log(`  - ${countResult.companies} German companies`);
  console.log(`  - ${countResult.metrics} German quarterly metrics`);

  db.close();
  console.log('\n✅ Done!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
