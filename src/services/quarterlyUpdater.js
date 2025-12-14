/**
 * Quarterly Updater Service
 *
 * Main orchestrator for quarterly SEC data updates.
 * Downloads latest bulk files, detects changes, and imports only new data.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const { createWriteStream, createReadStream } = require('fs');
const { pipeline } = require('stream/promises');
const AdmZip = require('adm-zip');

const UpdateDetector = require('./updateDetector');
const { getCanonicalTag, getStatementType } = require('../bulk-import/tagMappings');
const SECBulkImporterUnified = require('../bulk-import/importSECBulkUnified');

// Constants
const SEC_BULK_BASE_URL = 'https://www.sec.gov/files/dera/data/financial-statement-data-sets';
const DATA_DIR = path.join(process.cwd(), 'data');
const BULK_DIR = path.join(DATA_DIR, 'sec-bulk');

class QuarterlyUpdater {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this.detector = new UpdateDetector(db);
    this.currentUpdate = null;
    this.currentProgress = null;
    this.prepareStatements();
  }

  /**
   * Prepare commonly used SQL statements
   */
  prepareStatements() {
    // Insert update history record
    this.stmtInsertUpdate = this.db.prepare(`
      INSERT INTO update_history (
        update_type, quarter, started_at, status
      ) VALUES (?, ?, ?, 'running')
    `);

    // Complete update record
    this.stmtCompleteUpdate = this.db.prepare(`
      UPDATE update_history
      SET
        completed_at = ?,
        status = 'completed',
        companies_checked = ?,
        companies_updated = ?,
        records_added = ?,
        records_updated = ?,
        records_skipped = ?,
        details = ?
      WHERE id = ?
    `);

    // Fail update record
    this.stmtFailUpdate = this.db.prepare(`
      UPDATE update_history
      SET
        completed_at = ?,
        status = 'failed',
        error_message = ?
      WHERE id = ?
    `);

    // Get latest update record
    this.stmtGetLatestUpdate = this.db.prepare(`
      SELECT * FROM update_history
      ORDER BY started_at DESC
      LIMIT 1
    `);

    // Get update history
    this.stmtGetUpdateHistory = this.db.prepare(`
      SELECT * FROM update_history
      ORDER BY started_at DESC
      LIMIT ?
    `);

    // Insert financial line item
    this.stmtInsertLineItem = this.db.prepare(`
      INSERT INTO financial_line_items (
        company_id, concept, original_concept, fiscal_date_ending,
        fiscal_period, fiscal_year, value, unit, statement_type,
        adsh, qtrs, filed_date, form_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, concept, fiscal_date_ending, fiscal_period)
      DO UPDATE SET
        value = excluded.value,
        unit = excluded.unit,
        filed_date = excluded.filed_date,
        form_type = excluded.form_type
      WHERE excluded.filed_date >= financial_line_items.filed_date
    `);

    // Get company by CIK
    this.stmtGetCompanyByCik = this.db.prepare(`
      SELECT id, symbol, cik, name FROM companies WHERE cik = ?
    `);

    // Check if update already exists for quarter
    this.stmtCheckExistingUpdate = this.db.prepare(`
      SELECT * FROM update_history
      WHERE quarter = ? AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `);
  }

  /**
   * Main entry point - run quarterly update
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update report
   */
  async runQuarterlyUpdate(options = {}) {
    const {
      quarter = this.getCurrentQuarter(),
      forceFullUpdate = false,
      onProgress = () => {}
    } = options;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`QUARTERLY UPDATE: ${quarter}`);
    console.log(`${'='.repeat(60)}\n`);

    // Check if already completed
    if (!forceFullUpdate) {
      const existing = this.stmtCheckExistingUpdate.get(quarter);
      if (existing) {
        console.log(`Quarter ${quarter} already imported on ${existing.completed_at}`);
        console.log('Use forceFullUpdate=true to reimport');
        return {
          status: 'skipped',
          reason: 'already_imported',
          previousImport: existing
        };
      }
    }

    // Create update record
    const result = this.stmtInsertUpdate.run('quarterly_bulk', quarter, new Date().toISOString());
    const updateId = result.lastInsertRowid;
    this.currentUpdate = { id: updateId, quarter };

    const stats = {
      companiesChecked: 0,
      companiesUpdated: 0,
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: []
    };

    try {
      // Step 1: Download bulk file
      onProgress({ stage: 'downloading', percent: 0, message: 'Downloading SEC bulk file...' });
      console.log('1. Downloading bulk file...');

      const bulkPath = await this.downloadBulkFile(quarter, (downloadProgress) => {
        onProgress({
          stage: 'downloading',
          percent: Math.round(downloadProgress * 20),
          message: `Downloading: ${Math.round(downloadProgress * 100)}%`
        });
      });

      console.log(`   Downloaded to: ${bulkPath}`);

      // Step 2: Detect which companies need updates
      onProgress({ stage: 'analyzing', percent: 20, message: 'Analyzing submissions...' });
      console.log('2. Detecting updates...');

      const companiesNeedingUpdate = await this.detector.detectUpdatesFromBulkFile(
        path.join(bulkPath, 'sub.txt'),
        (detectProgress) => {
          onProgress({
            stage: 'analyzing',
            percent: 20 + Math.round(detectProgress.percent * 0.1),
            message: `Analyzing: ${detectProgress.processed}/${detectProgress.total} companies`,
            companiesFound: detectProgress.foundSoFar
          });
        }
      );

      stats.companiesChecked = companiesNeedingUpdate.length > 0 ?
        companiesNeedingUpdate[0]?.totalCompaniesInBulk || companiesNeedingUpdate.length : 0;

      console.log(`   Found ${companiesNeedingUpdate.length} companies needing update`);

      if (companiesNeedingUpdate.length === 0) {
        console.log('   No updates needed - data is current');
        this.completeUpdateRecord(updateId, stats);
        return {
          status: 'completed',
          message: 'No updates needed',
          stats
        };
      }

      // Step 3: Import updates for affected companies
      onProgress({
        stage: 'importing',
        percent: 30,
        message: 'Importing financial data...',
        companiesTotal: companiesNeedingUpdate.length
      });
      console.log('3. Importing new data...');

      const importResult = await this.importUpdatesForCompanies(
        companiesNeedingUpdate,
        bulkPath,
        (importProgress) => {
          onProgress({
            stage: 'importing',
            percent: 30 + Math.round(importProgress.percent * 0.5),
            message: `Importing: ${importProgress.current}/${importProgress.total}`,
            currentCompany: importProgress.currentCompany,
            companiesProcessed: importProgress.current,
            companiesTotal: importProgress.total,
            recordsAdded: importProgress.recordsAdded
          });
        }
      );

      stats.companiesUpdated = importResult.companiesUpdated;
      stats.recordsAdded = importResult.recordsAdded;
      stats.recordsUpdated = importResult.recordsUpdated;
      stats.recordsSkipped = importResult.recordsSkipped;
      stats.errors = importResult.errors;

      console.log(`   Updated ${stats.companiesUpdated} companies`);
      console.log(`   Added ${stats.recordsAdded} records`);

      // Step 4: Recalculate metrics (optional - can be heavy)
      onProgress({ stage: 'calculating_metrics', percent: 90, message: 'Updating metrics...' });
      console.log('4. Recalculating metrics for updated companies...');

      await this.recalculateMetricsForCompanies(companiesNeedingUpdate.map(c => c.company_id));

      // Step 5: Complete update
      onProgress({ stage: 'completed', percent: 100, message: 'Update complete!' });

      this.completeUpdateRecord(updateId, stats);

      console.log(`\n${'='.repeat(60)}`);
      console.log('UPDATE COMPLETE');
      console.log(`${'='.repeat(60)}`);
      console.log(`Companies checked: ${stats.companiesChecked}`);
      console.log(`Companies updated: ${stats.companiesUpdated}`);
      console.log(`Records added: ${stats.recordsAdded}`);
      console.log(`Records updated: ${stats.recordsUpdated}`);
      console.log(`Errors: ${stats.errors.length}`);

      return {
        status: 'completed',
        updateId,
        quarter,
        stats
      };

    } catch (error) {
      console.error(`Update failed: ${error.message}`);
      this.failUpdateRecord(updateId, error.message);

      return {
        status: 'failed',
        updateId,
        quarter,
        error: error.message,
        stats
      };
    } finally {
      this.currentUpdate = null;
      this.currentProgress = null;
    }
  }

  /**
   * Download SEC bulk file for quarter
   * @param {string} quarter - Quarter string (e.g., '2024q3')
   * @param {function} onProgress - Progress callback (0-1)
   * @returns {Promise<string>} Path to extracted folder
   */
  async downloadBulkFile(quarter, onProgress = () => {}) {
    const destDir = path.join(BULK_DIR, quarter);
    const zipPath = path.join(BULK_DIR, `${quarter}.zip`);

    // Check if already downloaded and extracted
    if (fs.existsSync(path.join(destDir, 'sub.txt'))) {
      console.log(`   Bulk file ${quarter} already downloaded`);
      onProgress(1);
      return destDir;
    }

    // Ensure directories exist
    if (!fs.existsSync(BULK_DIR)) {
      fs.mkdirSync(BULK_DIR, { recursive: true });
    }

    const url = `${SEC_BULK_BASE_URL}/${quarter}.zip`;
    console.log(`   Downloading from: ${url}`);

    // Download with progress
    await this.downloadWithProgress(url, zipPath, onProgress);

    // Extract
    console.log(`   Extracting to: ${destDir}`);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);

    // Clean up zip file
    fs.unlinkSync(zipPath);

    return destDir;
  }

  /**
   * Download file with progress reporting
   */
  downloadWithProgress(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destPath);

      const request = https.get(url, {
        headers: {
          'User-Agent': 'InvestmentAnalyzer/1.0 (contact@example.com)'
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          return this.downloadWithProgress(response.headers.location, destPath, onProgress)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            onProgress(downloadedBytes / totalBytes);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      });

      request.on('error', (error) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(error);
      });

      file.on('error', (error) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(error);
      });
    });
  }

  /**
   * Check if bulk file is available for download
   * @param {string} quarter - Quarter string
   * @returns {Promise<boolean>}
   */
  async checkBulkFileAvailable(quarter) {
    const url = `${SEC_BULK_BASE_URL}/${quarter}.zip`;

    return new Promise((resolve) => {
      const request = https.request(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'InvestmentAnalyzer/1.0 (contact@example.com)'
        }
      }, (response) => {
        resolve(response.statusCode === 200);
      });

      request.on('error', () => resolve(false));
      request.end();
    });
  }

  /**
   * Import updates for specific companies from bulk file
   * This is a lightweight import that only imports raw line items for new filings
   * NOTE: Does NOT interfere with existing importSECBulkUnified - they use different tables
   * - This method imports to: financial_line_items (raw data)
   * - importSECBulkUnified imports to: financial_data (aggregated statements)
   */
  async importUpdatesForCompanies(companies, bulkPath, onProgress = () => {}) {
    const numFilePath = path.join(bulkPath, 'num.txt');
    const subFilePath = path.join(bulkPath, 'sub.txt');

    // Build set of ADSHs we need to import
    const targetAdshs = new Set();
    const adshToCompany = new Map();

    for (const company of companies) {
      for (const filing of company.newFilings || []) {
        if (filing.adsh) {
          targetAdshs.add(filing.adsh);
          adshToCompany.set(filing.adsh, {
            company_id: company.company_id,
            cik: company.cik,
            symbol: company.symbol
          });
        }
      }
    }

    console.log(`   Target ADSHs: ${targetAdshs.size}`);

    // Parse submissions to get filing metadata
    const submissionsMap = await this.parseSubmissionsForAdshs(subFilePath, targetAdshs);

    const stats = {
      companiesUpdated: 0,
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: []
    };

    const companiesProcessed = new Set();

    // Stream through num.txt and import matching records
    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(numFilePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let headers = null;
      let lineCount = 0;
      let processedCount = 0;
      const batchSize = 5000;
      let batch = [];

      const processBatch = () => {
        if (batch.length === 0) return;

        const insertMany = this.db.transaction((items) => {
          for (const item of items) {
            try {
              // Get canonical tag
              const canonicalTag = getCanonicalTag(item.tag);
              const statementType = getStatementType(canonicalTag);

              // Skip unknown tags
              if (statementType === 'unknown') {
                stats.recordsSkipped++;
                continue;
              }

              // Get submission info
              const submission = submissionsMap.get(item.adsh);
              if (!submission) {
                stats.recordsSkipped++;
                continue;
              }

              // Get company
              const companyInfo = adshToCompany.get(item.adsh);
              if (!companyInfo) {
                stats.recordsSkipped++;
                continue;
              }

              // Parse value
              const value = parseFloat(item.value);
              if (isNaN(value)) {
                stats.recordsSkipped++;
                continue;
              }

              // Determine fiscal period from qtrs
              const qtrs = parseInt(item.qtrs) || 0;
              let fiscalPeriod;
              switch (qtrs) {
                case 0: fiscalPeriod = 'INSTANT'; break;
                case 1: fiscalPeriod = 'Q1'; break;
                case 2: fiscalPeriod = 'Q2'; break;
                case 3: fiscalPeriod = 'Q3'; break;
                case 4: fiscalPeriod = 'FY'; break;
                default: fiscalPeriod = 'FY';
              }

              // Insert line item
              const result = this.stmtInsertLineItem.run(
                companyInfo.company_id,
                canonicalTag,
                item.tag,
                item.ddate,
                fiscalPeriod,
                parseInt(submission.fy) || null,
                value,
                item.uom,
                statementType,
                item.adsh,
                qtrs,
                submission.filed,
                submission.form
              );

              if (result.changes > 0) {
                stats.recordsAdded++;
                companiesProcessed.add(companyInfo.company_id);
              }

            } catch (error) {
              stats.errors.push({
                adsh: item.adsh,
                tag: item.tag,
                error: error.message
              });
            }
          }
        });

        insertMany(batch);
        batch = [];
      };

      rl.on('line', (line) => {
        lineCount++;

        // First line is headers
        if (!headers) {
          headers = line.split('\t').map(h => h.toLowerCase().trim());
          return;
        }

        // Parse line
        const values = line.split('\t');
        const row = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        // Filter to our target submissions and USD only
        if (!targetAdshs.has(row.adsh) || row.uom !== 'USD') {
          return;
        }

        batch.push(row);
        processedCount++;

        // Process batch
        if (batch.length >= batchSize) {
          processBatch();

          // Report progress
          onProgress({
            percent: Math.min(99, (companiesProcessed.size / companies.length) * 100),
            current: companiesProcessed.size,
            total: companies.length,
            recordsAdded: stats.recordsAdded,
            currentCompany: null
          });
        }
      });

      rl.on('close', () => {
        // Process remaining batch
        processBatch();

        stats.companiesUpdated = companiesProcessed.size;

        // Update freshness for processed companies
        for (const companyId of companiesProcessed) {
          this.detector.markCompanyUpdated(companyId);
        }

        resolve(stats);
      });

      rl.on('error', reject);
    });
  }

  /**
   * Parse submissions file to get metadata for specific ADSHs
   */
  async parseSubmissionsForAdshs(subFilePath, targetAdshs) {
    const submissionsMap = new Map();

    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(subFilePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let headers = null;

      rl.on('line', (line) => {
        if (!headers) {
          headers = line.split('\t').map(h => h.toLowerCase().trim());
          return;
        }

        const values = line.split('\t');
        const row = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });

        if (targetAdshs.has(row.adsh)) {
          // Convert filed date from YYYYMMDD to YYYY-MM-DD
          let filedDate = row.filed;
          if (filedDate && filedDate.length === 8) {
            filedDate = `${filedDate.slice(0, 4)}-${filedDate.slice(4, 6)}-${filedDate.slice(6, 8)}`;
          }

          submissionsMap.set(row.adsh, {
            cik: row.cik,
            name: row.name,
            form: row.form,
            filed: filedDate,
            period: row.period,
            fy: row.fy,
            fp: row.fp
          });
        }
      });

      rl.on('close', () => resolve(submissionsMap));
      rl.on('error', reject);
    });
  }

  /**
   * Import a full quarter using the unified importer (imports to financial_data)
   * Use this when you want to import ALL data from a quarter using the same
   * process as the bulk importer
   * @param {string} quarter - Quarter string (e.g., '2024q3')
   * @returns {Promise<Object>} Import result
   */
  async importQuarterUnified(quarter) {
    console.log(`   Using unified importer for ${quarter}...`);

    // Parse quarter string
    const match = quarter.match(/^(\d{4})q(\d)$/);
    if (!match) {
      throw new Error(`Invalid quarter format: ${quarter}. Expected format: 2024q3`);
    }

    const year = parseInt(match[1]);
    const q = parseInt(match[2]);

    // Use the existing unified importer
    const importer = new SECBulkImporterUnified();
    const result = await importer.importQuarter(year, q);

    return result;
  }

  /**
   * Recalculate metrics for updated companies
   */
  async recalculateMetricsForCompanies(companyIds) {
    if (companyIds.length === 0) return;

    console.log(`   Recalculating metrics for ${companyIds.length} companies...`);

    // Try to load metric calculator if available
    try {
      const MetricCalculator = require('./metricCalculator');
      const calculator = new MetricCalculator(this.db);

      for (const companyId of companyIds) {
        try {
          await calculator.calculateForCompany(companyId);
        } catch (error) {
          console.log(`   Warning: Could not calculate metrics for company ${companyId}: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`   Metric calculator not available, skipping metric recalculation`);
    }
  }

  /**
   * Get current quarter string
   * SEC bulk files are released ~6 weeks after quarter end
   */
  getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    // Q1 (Jan-Mar) bulk available ~mid May
    // Q2 (Apr-Jun) bulk available ~mid Aug
    // Q3 (Jul-Sep) bulk available ~mid Nov
    // Q4 (Oct-Dec) bulk available ~mid Feb (next year)

    if (month < 2) return `${year - 1}q4`;      // Jan-Feb: Q4 prev year
    if (month < 5) return `${year - 1}q4`;      // Mar-May: Q4 prev year (or Q1 current)
    if (month < 8) return `${year}q1`;           // Jun-Aug: Q1
    if (month < 11) return `${year}q2`;          // Sep-Nov: Q2
    return `${year}q3`;                           // Dec: Q3
  }

  /**
   * Get next expected quarter
   */
  getNextQuarter() {
    const current = this.getCurrentQuarter();
    const year = parseInt(current.slice(0, 4));
    const q = parseInt(current.slice(-1));

    if (q === 4) {
      return `${year + 1}q1`;
    }
    return `${year}q${q + 1}`;
  }

  /**
   * Complete update record
   */
  completeUpdateRecord(updateId, stats) {
    this.stmtCompleteUpdate.run(
      new Date().toISOString(),
      stats.companiesChecked,
      stats.companiesUpdated,
      stats.recordsAdded,
      stats.recordsUpdated,
      stats.recordsSkipped,
      JSON.stringify({ errors: stats.errors?.slice(0, 100) || [] }),
      updateId
    );
  }

  /**
   * Mark update as failed
   */
  failUpdateRecord(updateId, errorMessage) {
    this.stmtFailUpdate.run(
      new Date().toISOString(),
      errorMessage,
      updateId
    );
  }

  /**
   * Get status of current or last update
   */
  getUpdateStatus() {
    if (this.currentUpdate) {
      return {
        status: 'running',
        ...this.currentUpdate,
        progress: this.currentProgress
      };
    }

    const latest = this.stmtGetLatestUpdate.get();
    if (latest) {
      return {
        status: latest.status,
        ...latest,
        details: latest.details ? JSON.parse(latest.details) : null
      };
    }

    return { status: 'idle' };
  }

  /**
   * Get update history
   */
  getUpdateHistory(limit = 10) {
    return this.stmtGetUpdateHistory.all(limit).map(record => ({
      ...record,
      details: record.details ? JSON.parse(record.details) : null
    }));
  }

  /**
   * Get latest completed update
   */
  getLatestCompletedUpdate() {
    return this.db.prepare(`
      SELECT * FROM update_history
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `).get();
  }

  /**
   * Initialize freshness tracking (run after initial import)
   */
  async initializeFreshnessTracking(onProgress = () => {}) {
    return this.detector.initializeFreshnessTracking(onProgress);
  }
}

module.exports = QuarterlyUpdater;
