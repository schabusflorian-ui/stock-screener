/**
 * Update Detector Service
 *
 * Detects which companies have new SEC filings that need to be imported.
 * Compares our database records with SEC bulk files to identify updates.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { getDatabaseAsync } = require('../lib/db');

class UpdateDetector {
  /**
   * No database parameter - uses getDatabaseAsync() in methods
   */
  constructor() {
    // No database parameter needed
  }

  /**
   * Initialize freshness tracking for all companies
   * Run once after initial bulk import to populate company_data_freshness table
   */
  async initializeFreshnessTracking(onProgress = () => {}) {
    console.log('Initializing freshness tracking for all companies...');

    const database = await getDatabaseAsync();

    // Get all companies with CIK
    const companiesResult = await database.query(`
      SELECT id, symbol, cik, name
      FROM companies
      WHERE cik IS NOT NULL AND cik != ''
    `);
    const companies = companiesResult.rows;
    const total = companies.length;
    let processed = 0;

    console.log(`Found ${total} companies with CIK numbers`);

    // Process in batches with transaction
    await database.query('BEGIN');

    try {
      for (const company of companies) {
        // Get latest filings for this company - check BOTH tables
        // financial_data is the main table, financial_line_items is for raw imports
        let latestDataResult = await database.query(`
          SELECT
            MAX(filed_date) as latest_filed_date,
            MAX(CASE WHEN form = '10-K' THEN filed_date END) as latest_10k_filed,
            MAX(CASE WHEN form = '10-Q' THEN filed_date END) as latest_10q_filed,
            MAX(CASE WHEN form = '10-K' THEN fiscal_date_ending END) as latest_10k_period,
            MAX(CASE WHEN form = '10-Q' THEN fiscal_date_ending END) as latest_10q_period
          FROM financial_data
          WHERE company_id = $1
        `, [company.id]);

        let latestData = latestDataResult.rows[0];

        // Fallback to financial_line_items if financial_data is empty
        if (!latestData?.latest_filed_date) {
          latestDataResult = await database.query(`
            SELECT
              MAX(filed_date) as latest_filed_date,
              MAX(CASE WHEN form_type = '10-K' THEN filed_date END) as latest_10k_filed,
              MAX(CASE WHEN form_type = '10-Q' THEN filed_date END) as latest_10q_filed,
              MAX(CASE WHEN form_type = '10-K' THEN fiscal_date_ending END) as latest_10k_period,
              MAX(CASE WHEN form_type = '10-Q' THEN fiscal_date_ending END) as latest_10q_period
            FROM financial_line_items
            WHERE company_id = $1
          `, [company.id]);
          latestData = latestDataResult.rows[0];
        }

        // Upsert freshness record
        await database.query(`
          INSERT INTO company_data_freshness (
            company_id, cik, symbol, latest_filing_date,
            latest_10k_date, latest_10q_date, latest_10k_period, latest_10q_period,
            last_checked_at, last_updated_at, needs_update, pending_filings
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(company_id) DO UPDATE SET
            latest_filing_date = excluded.latest_filing_date,
            latest_10k_date = excluded.latest_10k_date,
            latest_10q_date = excluded.latest_10q_date,
            latest_10k_period = excluded.latest_10k_period,
            latest_10q_period = excluded.latest_10q_period,
            last_checked_at = excluded.last_checked_at,
            last_updated_at = excluded.last_updated_at,
            needs_update = excluded.needs_update,
            pending_filings = excluded.pending_filings
        `, [
          company.id,
          company.cik,
          company.symbol,
          latestData?.latest_filed_date || null,
          latestData?.latest_10k_filed || null,
          latestData?.latest_10q_filed || null,
          latestData?.latest_10k_period || null,
          latestData?.latest_10q_period || null,
          new Date().toISOString(),
          latestData?.latest_filed_date ? new Date().toISOString() : null,
          0, // needs_update = false initially
          null // no pending filings
        ]);

        processed++;
        if (processed % 100 === 0) {
          onProgress({
            stage: 'initializing',
            processed,
            total,
            percent: Math.round((processed / total) * 100)
          });
        }
      }

      await database.query('COMMIT');
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }

    console.log(`Freshness tracking initialized for ${processed} companies`);

    return {
      companiesProcessed: processed,
      success: true
    };
  }

  /**
   * Parse the sub.txt file from SEC bulk download to build a map of filings
   * @param {string} subFilePath - Path to sub.txt file
   * @returns {Promise<Map>} Map of CIK -> filing info
   */
  async parseSubmissionsFile(subFilePath) {
    console.log(`Parsing submissions file: ${subFilePath}`);

    if (!fs.existsSync(subFilePath)) {
      throw new Error(`Submissions file not found: ${subFilePath}`);
    }

    const filings = new Map(); // CIK -> { filings: [...] }

    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(subFilePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let headers = null;
      let lineCount = 0;
      let relevantFilings = 0;

      rl.on('line', (line) => {
        lineCount++;

        // First line is headers
        if (!headers) {
          headers = line.split('\t').map(h => h.toLowerCase().trim());
          return;
        }

        const values = line.split('\t');
        const row = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        // Process 10-K, 10-Q, and their amendments (10-K/A, 10-Q/A)
        const form = row.form?.toUpperCase();
        if (!form || (!form.startsWith('10-K') && !form.startsWith('10-Q'))) {
          return;
        }

        // Normalize CIK to 10 digits with leading zeros
        const cik = row.cik?.padStart(10, '0');
        if (!cik) return;

        relevantFilings++;

        // Build filing info
        const filing = {
          adsh: row.adsh,
          cik: cik,
          name: row.name,
          form: form,
          filed: row.filed, // Filing date YYYYMMDD
          period: row.period, // Period end date YYYYMMDD
          fy: row.fy, // Fiscal year
          fp: row.fp, // Fiscal period (FY, Q1, Q2, Q3, Q4)
        };

        // Convert dates to ISO format for comparison
        if (filing.filed && filing.filed.length === 8) {
          filing.filedDate = `${filing.filed.slice(0, 4)}-${filing.filed.slice(4, 6)}-${filing.filed.slice(6, 8)}`;
        }
        if (filing.period && filing.period.length === 8) {
          filing.periodDate = `${filing.period.slice(0, 4)}-${filing.period.slice(4, 6)}-${filing.period.slice(6, 8)}`;
        }

        // Add to filings map
        if (!filings.has(cik)) {
          filings.set(cik, { name: row.name, filings: [] });
        }
        filings.get(cik).filings.push(filing);
      });

      rl.on('close', () => {
        console.log(`Parsed ${lineCount} lines, found ${relevantFilings} relevant filings for ${filings.size} companies`);
        resolve(filings);
      });

      rl.on('error', reject);
    });
  }

  /**
   * Detect which companies have new filings in the bulk file
   * @param {string} subFilePath - Path to sub.txt from SEC bulk download
   * @param {function} onProgress - Progress callback
   * @returns {Promise<Array>} List of companies needing updates with their new filings
   */
  async detectUpdatesFromBulkFile(subFilePath, onProgress = () => {}) {
    console.log('Detecting updates from bulk file...');

    const database = await getDatabaseAsync();

    // Parse submissions file
    const bulkFilings = await this.parseSubmissionsFile(subFilePath);
    console.log(`Found filings for ${bulkFilings.size} unique CIKs in bulk file`);

    // Get our companies
    const ourCompaniesResult = await database.query(`
      SELECT id, symbol, cik, name
      FROM companies
      WHERE cik IS NOT NULL AND cik != ''
    `);
    const ourCompanies = ourCompaniesResult.rows;
    const companiesByCik = new Map();
    for (const company of ourCompanies) {
      const normalizedCik = company.cik.padStart(10, '0');
      companiesByCik.set(normalizedCik, company);
    }

    console.log(`Checking against ${companiesByCik.size} companies in our database`);

    const companiesNeedingUpdate = [];
    let processed = 0;
    const total = companiesByCik.size;

    // Check each of our companies against bulk file
    for (const [cik, company] of companiesByCik) {
      const bulkData = bulkFilings.get(cik);

      if (!bulkData || !bulkData.filings.length) {
        processed++;
        continue;
      }

      // Get our latest filing dates for this company (check financial_data first, then financial_line_items)
      let ourLatestResult = await database.query(`
        SELECT
          MAX(filed_date) as latest_filed_date,
          MAX(CASE WHEN form = '10-K' THEN filed_date END) as latest_10k_date,
          MAX(CASE WHEN form = '10-Q' THEN filed_date END) as latest_10q_date
        FROM financial_data
        WHERE company_id = $1
      `, [company.id]);

      let ourLatest = ourLatestResult.rows[0];

      // Fallback to financial_line_items
      if (!ourLatest?.latest_filed_date) {
        ourLatestResult = await database.query(`
          SELECT
            MAX(filed_date) as latest_filed_date,
            MAX(CASE WHEN form_type = '10-K' THEN filed_date END) as latest_10k_date,
            MAX(CASE WHEN form_type = '10-Q' THEN filed_date END) as latest_10q_date
          FROM financial_line_items
          WHERE company_id = $1
        `, [company.id]);
        ourLatest = ourLatestResult.rows[0];
      }

      // Find filings newer than what we have
      const newFilings = bulkData.filings.filter(filing => {
        if (!filing.filedDate) return false;

        // Check if we have this filing already
        if (ourLatest?.latest_filed_date) {
          // Compare filing dates - only include if newer
          return filing.filedDate > ourLatest.latest_filed_date;
        }

        // If we have no data for this company, all filings are "new"
        return true;
      });

      if (newFilings.length > 0) {
        companiesNeedingUpdate.push({
          company_id: company.id,
          cik: cik,
          symbol: company.symbol,
          name: company.name,
          latestInDb: ourLatest?.latest_filed_date || null,
          newFilings: newFilings,
          newFilingsCount: newFilings.length
        });

        // Update freshness record
        await database.query(`
          INSERT INTO company_data_freshness (
            company_id, cik, symbol, latest_filing_date,
            latest_10k_date, latest_10q_date, latest_10k_period, latest_10q_period,
            last_checked_at, last_updated_at, needs_update, pending_filings
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT(company_id) DO UPDATE SET
            latest_filing_date = excluded.latest_filing_date,
            latest_10k_date = excluded.latest_10k_date,
            latest_10q_date = excluded.latest_10q_date,
            latest_10k_period = excluded.latest_10k_period,
            latest_10q_period = excluded.latest_10q_period,
            last_checked_at = excluded.last_checked_at,
            last_updated_at = excluded.last_updated_at,
            needs_update = excluded.needs_update,
            pending_filings = excluded.pending_filings
        `, [
          company.id,
          cik,
          company.symbol,
          ourLatest?.latest_filed_date || null,
          ourLatest?.latest_10k_date || null,
          ourLatest?.latest_10q_date || null,
          null, // Will be updated after import
          null,
          new Date().toISOString(),
          null, // Not updated yet
          1, // needs_update = true
          JSON.stringify(newFilings.map(f => f.adsh))
        ]);
      }

      processed++;

      if (processed % 100 === 0) {
        onProgress({
          stage: 'detecting',
          processed,
          total,
          percent: Math.round((processed / total) * 100),
          foundSoFar: companiesNeedingUpdate.length
        });
      }
    }

    console.log(`Detection complete: ${companiesNeedingUpdate.length} companies need updates`);

    return companiesNeedingUpdate;
  }

  /**
   * Quick check using SEC submissions API for a single company
   * @param {string} cik - Company CIK (10 digits with leading zeros)
   * @returns {Promise<Object>} { needsUpdate: boolean, newFilings: [...] }
   */
  async checkCompanyForUpdates(cik) {
    const normalizedCik = cik.padStart(10, '0');
    const database = await getDatabaseAsync();

    // Get company from our database
    const companyResult = await database.query(`
      SELECT id, symbol, cik, name FROM companies WHERE cik = $1
    `, [normalizedCik]);
    const company = companyResult.rows[0];

    if (!company) {
      return { needsUpdate: false, error: 'Company not found in database' };
    }

    // Get our latest filing (check financial_data first, then financial_line_items)
    let ourLatestResult = await database.query(`
      SELECT
        MAX(filed_date) as latest_filed_date,
        MAX(CASE WHEN form = '10-K' THEN filed_date END) as latest_10k_date,
        MAX(CASE WHEN form = '10-Q' THEN filed_date END) as latest_10q_date
      FROM financial_data
      WHERE company_id = $1
    `, [company.id]);

    let ourLatest = ourLatestResult.rows[0];

    if (!ourLatest?.latest_filed_date) {
      ourLatestResult = await database.query(`
        SELECT
          MAX(filed_date) as latest_filed_date,
          MAX(CASE WHEN form_type = '10-K' THEN filed_date END) as latest_10k_date,
          MAX(CASE WHEN form_type = '10-Q' THEN filed_date END) as latest_10q_date
        FROM financial_line_items
        WHERE company_id = $1
      `, [company.id]);
      ourLatest = ourLatestResult.rows[0];
    }

    // Fetch from SEC API
    const url = `https://data.sec.gov/submissions/CIK${normalizedCik}.json`;

    try {
      // Dynamic import for node-fetch (if using CommonJS)
      const fetch = (await import('node-fetch')).default;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'InvestmentAnalyzer/1.0 (contact@example.com)',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`SEC API returned ${response.status}`);
      }

      const data = await response.json();

      // Get recent filings from response
      const recentFilings = data.filings?.recent || {};
      const forms = recentFilings.form || [];
      const filingDates = recentFilings.filingDate || [];
      const accessionNumbers = recentFilings.accessionNumber || [];
      const reportDates = recentFilings.reportDate || [];

      // Find 10-K and 10-Q filings newer than what we have
      const newFilings = [];
      for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        const filedDate = filingDates[i];

        if (!form || (!form.startsWith('10-K') && !form.startsWith('10-Q'))) continue;

        // Check if newer than our latest
        if (!ourLatest?.latest_filed_date || filedDate > ourLatest.latest_filed_date) {
          newFilings.push({
            adsh: accessionNumbers[i]?.replace(/-/g, ''),
            form: form,
            filedDate: filedDate,
            periodDate: reportDates[i]
          });
        }
      }

      // Update freshness tracking
      await database.query(`
        INSERT INTO company_data_freshness (
          company_id, cik, symbol, latest_filing_date,
          latest_10k_date, latest_10q_date, latest_10k_period, latest_10q_period,
          last_checked_at, last_updated_at, needs_update, pending_filings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(company_id) DO UPDATE SET
          latest_filing_date = excluded.latest_filing_date,
          latest_10k_date = excluded.latest_10k_date,
          latest_10q_date = excluded.latest_10q_date,
          latest_10k_period = excluded.latest_10k_period,
          latest_10q_period = excluded.latest_10q_period,
          last_checked_at = excluded.last_checked_at,
          last_updated_at = excluded.last_updated_at,
          needs_update = excluded.needs_update,
          pending_filings = excluded.pending_filings
      `, [
        company.id,
        normalizedCik,
        company.symbol,
        ourLatest?.latest_filed_date || null,
        ourLatest?.latest_10k_date || null,
        ourLatest?.latest_10q_date || null,
        null,
        null,
        new Date().toISOString(),
        null,
        newFilings.length > 0 ? 1 : 0,
        newFilings.length > 0 ? JSON.stringify(newFilings.map(f => f.adsh)) : null
      ]);

      return {
        needsUpdate: newFilings.length > 0,
        newFilings,
        company: {
          id: company.id,
          symbol: company.symbol,
          name: company.name,
          cik: normalizedCik
        },
        ourLatest: ourLatest?.latest_filed_date
      };

    } catch (error) {
      console.error(`Error checking company ${company.symbol}: ${error.message}`);
      return {
        needsUpdate: false,
        error: error.message,
        company: {
          id: company.id,
          symbol: company.symbol,
          cik: normalizedCik
        }
      };
    }
  }

  /**
   * Get list of companies that need updates (from freshness table)
   * @returns {Array} Companies marked as needing update
   */
  async getCompaniesNeedingUpdate() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        f.company_id,
        f.cik,
        f.symbol,
        f.latest_filing_date,
        f.pending_filings,
        c.name
      FROM company_data_freshness f
      JOIN companies c ON c.id = f.company_id
      WHERE f.needs_update = 1
    `);

    return result.rows.map(row => ({
      ...row,
      pendingFilings: row.pending_filings ? JSON.parse(row.pending_filings) : []
    }));
  }

  /**
   * Mark company as updated
   * @param {number} companyId - Company ID
   */
  async markCompanyUpdated(companyId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE company_data_freshness
      SET
        needs_update = 0,
        pending_filings = NULL,
        last_updated_at = $1
      WHERE company_id = $2
    `, [new Date().toISOString(), companyId]);
  }

  /**
   * Get summary of data freshness across all companies
   * @returns {Object} Freshness summary statistics
   */
  async getUpdateSummary() {
    const database = await getDatabaseAsync();

    // Check if freshness tracking is initialized
    const countResult = await database.query(`
      SELECT COUNT(*) as count FROM company_data_freshness
    `);
    const count = countResult.rows[0];

    if (!count || count.count === 0) {
      // Freshness not initialized - calculate from actual data
      const companiesResult = await database.query(`
        SELECT id, symbol, cik, name
        FROM companies
        WHERE cik IS NOT NULL AND cik != ''
      `);
      const companies = companiesResult.rows;

      // Check financial_data first, then financial_line_items
      let lastFilingResult = await database.query(`
        SELECT MAX(filed_date) as date FROM financial_data
      `);
      let lastFiling = lastFilingResult.rows[0];

      let oldestFilingResult = await database.query(`
        SELECT MIN(fiscal_date_ending) as date FROM financial_data
        WHERE fiscal_date_ending >= '1990-01-01' AND fiscal_date_ending <= CURRENT_DATE
      `);
      let oldestFiling = oldestFilingResult.rows[0];

      // Fallback to financial_line_items
      if (!lastFiling?.date) {
        lastFilingResult = await database.query(`
          SELECT MAX(filed_date) as date FROM financial_line_items
        `);
        lastFiling = lastFilingResult.rows[0];
      }
      if (!oldestFiling?.date) {
        oldestFilingResult = await database.query(`
          SELECT MIN(fiscal_date_ending) as date FROM financial_line_items
        `);
        oldestFiling = oldestFilingResult.rows[0];
      }

      return {
        totalCompanies: companies.length,
        needingUpdate: 0,
        lastUpdateDate: null,
        oldestData: oldestFiling?.date || null,
        latestFiling: lastFiling?.date || null,
        freshnessInitialized: false
      };
    }

    // Get from freshness table
    const summaryResult = await database.query(`
      SELECT
        COUNT(*) as total_companies,
        SUM(CASE WHEN needs_update = 1 THEN 1 ELSE 0 END) as needing_update,
        MAX(last_updated_at) as last_update_date,
        MIN(latest_filing_date) as oldest_data
      FROM company_data_freshness
    `);
    const summary = summaryResult.rows[0];

    // Get additional stats
    const latestUpdateResult = await database.query(`
      SELECT * FROM update_history
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `);
    const latestUpdate = latestUpdateResult.rows[0];

    return {
      totalCompanies: summary.total_companies,
      needingUpdate: summary.needing_update || 0,
      lastUpdateDate: summary.last_update_date,
      oldestData: summary.oldest_data,
      latestFiling: summary.latest_filing,
      lastCompletedUpdate: latestUpdate ? {
        quarter: latestUpdate.quarter,
        completedAt: latestUpdate.completed_at,
        companiesUpdated: latestUpdate.companies_updated,
        recordsAdded: latestUpdate.records_added
      } : null,
      freshnessInitialized: true
    };
  }

  /**
   * Get detailed freshness info for a specific company
   * @param {number} companyId - Company ID
   * @returns {Object|null} Freshness details
   */
  async getCompanyFreshness(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM company_data_freshness WHERE company_id = $1
    `, [companyId]);
    const freshness = result.rows[0];

    if (!freshness) return null;

    return {
      ...freshness,
      pendingFilings: freshness.pending_filings ? JSON.parse(freshness.pending_filings) : []
    };
  }

  /**
   * Reset all companies' update status
   */
  async resetUpdateFlags() {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE company_data_freshness
      SET needs_update = 0, pending_filings = NULL
    `);
  }
}

module.exports = UpdateDetector;
