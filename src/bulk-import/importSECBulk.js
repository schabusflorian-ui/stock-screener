// src/bulk-import/importSECBulk.js
const path = require('path');
const fs = require('fs');
const db = require('../database');
const SECFileParser = require('./parseSECFiles');
const {
  getCanonicalTag,
  getStatementType,
  getTagPriority,
  shouldImportTag,
  insertTagMappings
} = require('./tagMappings');

/**
 * SEC Bulk Import Orchestrator
 *
 * Imports historical financial data from SEC bulk downloads
 * Handles millions of records efficiently with batching and transactions
 */

class SECBulkImporter {
  constructor(dbPath = null) {
    this.database = dbPath ? require('better-sqlite3')(dbPath) : db.getDatabase();
    this.companyCache = new Map(); // CIK -> company_id
    this.submissionCache = new Map(); // ADSH -> submission info
    this.stats = {
      companiesCreated: 0,
      companiesUpdated: 0,
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
      errors: 0
    };
  }

  /**
   * Initialize tag mappings in database (async)
   */
  async initializeTagMappings() {
    const { getDatabaseAsync } = require('../lib/db');
    const database = await getDatabaseAsync();
    return insertTagMappings(database);
  }

  /**
   * Find or create company by CIK
   */
  findOrCreateCompany(cik, name, sicCode = null) {
    // Check cache first
    if (this.companyCache.has(cik)) {
      return this.companyCache.get(cik);
    }

    // Pad CIK to 10 digits
    const paddedCik = cik.padStart(10, '0');

    // Try to find existing company by CIK
    const existing = this.database.prepare(`
      SELECT id FROM companies WHERE cik = ?
    `).get(paddedCik);

    if (existing) {
      this.companyCache.set(cik, existing.id);
      return existing.id;
    }

    // Try to find by name (fuzzy match)
    const nameMatch = this.database.prepare(`
      SELECT id FROM companies WHERE name LIKE ? LIMIT 1
    `).get(`%${name}%`);

    if (nameMatch) {
      // Update with CIK
      this.database.prepare(`
        UPDATE companies SET cik = ?, sic_code = ? WHERE id = ?
      `).run(paddedCik, sicCode, nameMatch.id);

      this.companyCache.set(cik, nameMatch.id);
      this.stats.companiesUpdated++;
      return nameMatch.id;
    }

    // Create new company
    const result = this.database.prepare(`
      INSERT INTO companies (name, cik, sic_code, is_active)
      VALUES (?, ?, ?, 1)
    `).run(name, paddedCik, sicCode);

    this.companyCache.set(cik, result.lastInsertRowid);
    this.stats.companiesCreated++;
    return result.lastInsertRowid;
  }

  /**
   * Determine fiscal period from qtrs field
   */
  determineFiscalPeriod(qtrs) {
    if (qtrs === null || qtrs === undefined) return 'FY';

    const q = parseInt(qtrs);
    switch (q) {
      case 0: return 'INSTANT'; // Point-in-time (balance sheet)
      case 1: return 'Q1';
      case 2: return 'Q2';
      case 3: return 'Q3';
      case 4: return 'FY';
      default: return 'FY';
    }
  }

  /**
   * Insert or update financial line item
   */
  insertLineItem(lineItem) {
    const stmt = this.database.prepare(`
      INSERT INTO financial_line_items (
        company_id,
        concept,
        original_concept,
        fiscal_date_ending,
        fiscal_period,
        fiscal_year,
        value,
        unit,
        statement_type,
        adsh,
        qtrs,
        filed_date,
        form_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, concept, fiscal_date_ending, fiscal_period)
      DO UPDATE SET
        value = excluded.value,
        unit = excluded.unit,
        filed_date = excluded.filed_date
      WHERE excluded.filed_date >= financial_line_items.filed_date
    `);

    stmt.run(
      lineItem.company_id,
      lineItem.concept,
      lineItem.original_concept,
      lineItem.fiscal_date_ending,
      lineItem.fiscal_period,
      lineItem.fiscal_year,
      lineItem.value,
      lineItem.unit,
      lineItem.statement_type,
      lineItem.adsh,
      lineItem.qtrs,
      lineItem.filed_date,
      lineItem.form_type
    );
  }

  /**
   * Process a batch of numbers
   */
  processBatch(numbers, submissionsMap) {
    const insertBatch = this.database.transaction((batch) => {
      for (const num of batch) {
        try {
          // Get submission info
          const submission = submissionsMap.get(num.adsh);
          if (!submission) continue;

          // Parse numeric value
          const value = parseFloat(num.value);
          if (isNaN(value)) continue;

          // Map tag
          const canonicalTag = getCanonicalTag(num.tag);
          const statementType = getStatementType(canonicalTag);

          if (statementType === 'unknown') continue;

          // Determine fiscal period
          const fiscalPeriod = this.determineFiscalPeriod(num.qtrs);
          const fiscalYear = parseInt(submission.fy);

          // Create line item
          const lineItem = {
            company_id: submission.company_id,
            concept: canonicalTag,
            original_concept: num.tag,
            fiscal_date_ending: num.ddate,
            fiscal_period: fiscalPeriod,
            fiscal_year: fiscalYear,
            value: value,
            unit: num.uom,
            statement_type: statementType,
            adsh: num.adsh,
            qtrs: parseInt(num.qtrs) || 0,
            filed_date: submission.filed,
            form_type: submission.form
          };

          this.insertLineItem(lineItem);
          this.stats.recordsInserted++;

        } catch (error) {
          this.stats.errors++;
          if (this.stats.errors < 10) {
            console.error('      ⚠️  Error processing record:', error.message);
          }
        }
      }
    });

    insertBatch(numbers);
  }

  /**
   * Import a single quarter
   */
  async importQuarter(year, quarter, options = {}) {
    const { batchSize = 10000, limit = null } = options;

    const quarterKey = `${year}q${quarter}`;
    const quarterDir = path.join('data/sec-bulk', quarterKey);

    console.log(`\n📊 Importing ${quarterKey}...`);
    console.log('-'.repeat(60));

    // Check if directory exists
    if (!fs.existsSync(quarterDir)) {
      console.error(`❌ Directory not found: ${quarterDir}`);
      return { success: false, error: 'Directory not found' };
    }

    const subFile = path.join(quarterDir, 'sub.txt');
    const numFile = path.join(quarterDir, 'num.txt');

    const startTime = Date.now();

    try {
      // ========================================
      // Step 1: Parse submissions (10-K, 10-Q only)
      // ========================================
      console.log('   1️⃣  Parsing submissions...');

      const submissions = await SECFileParser.parseSubmissions(subFile, {
        filter: (sub) => sub.form === '10-K' || sub.form === '10-Q'
      });

      console.log(`      ✓ Found ${submissions.length} filings (10-K/10-Q)`);

      // ========================================
      // Step 2: Create/update companies
      // ========================================
      console.log('   2️⃣  Processing companies...');

      const submissionsMap = new Map();

      for (const sub of submissions) {
        const companyId = this.findOrCreateCompany(sub.cik, sub.name, sub.sic);
        submissionsMap.set(sub.adsh, {
          company_id: companyId,
          form: sub.form,
          filed: sub.filed,
          period: sub.period,
          fy: sub.fy,
          fp: sub.fp
        });
      }

      console.log(`      ✓ Companies created: ${this.stats.companiesCreated}`);
      console.log(`      ✓ Companies updated: ${this.stats.companiesUpdated}`);

      // ========================================
      // Step 3: Stream and process numbers
      // ========================================
      console.log('   3️⃣  Processing financial data...');

      let lastProgress = 0;
      const progressInterval = 100000;

      await SECFileParser.streamNumbers(numFile, (batch, totalProcessed) => {
        // Filter to USD only and submissions we care about
        const filtered = batch.filter(num =>
          num.uom === 'USD' &&
          submissionsMap.has(num.adsh)
        );

        if (filtered.length > 0) {
          this.processBatch(filtered, submissionsMap);
        }

        this.stats.recordsProcessed = totalProcessed;

        // Progress logging
        if (totalProcessed - lastProgress >= progressInterval) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (totalProcessed / elapsed).toFixed(0);
          console.log(`      📈 Processed ${totalProcessed.toLocaleString()} records (${rate}/sec)`);
          lastProgress = totalProcessed;
        }

        // Apply limit if specified
        if (limit && totalProcessed >= limit) {
          return false; // Stop streaming
        }
      }, { batchSize });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`      ✓ Total processed: ${this.stats.recordsProcessed.toLocaleString()}`);
      console.log(`      ✓ Records inserted: ${this.stats.recordsInserted.toLocaleString()}`);
      console.log(`      ⏱️  Time: ${elapsed}s`);

      return {
        success: true,
        quarter: quarterKey,
        stats: { ...this.stats },
        elapsed: parseFloat(elapsed)
      };

    } catch (error) {
      console.error(`❌ Failed to import ${quarterKey}:`, error.message);
      return { success: false, quarter: quarterKey, error: error.message };
    }
  }

  /**
   * Import all quarters in range
   */
  async importAll(startYear, endYear, options = {}) {
    console.log('\n📦 SEC BULK IMPORT\n');
    console.log('='.repeat(60));
    console.log(`📅 Importing: Q1 ${startYear} - Q4 ${endYear}\n`);

    // Initialize tag mappings
    console.log('🏷️  Initializing tag mappings...');
    const tagCount = await this.initializeTagMappings();
    console.log(`✅ Loaded ${tagCount} tag mappings\n`);

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      quarters: [],
      totalStats: {
        companiesCreated: 0,
        companiesUpdated: 0,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: 0
      }
    };

    const globalStart = Date.now();

    for (let year = startYear; year <= endYear; year++) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        // Reset stats for this quarter
        this.stats = {
          companiesCreated: 0,
          companiesUpdated: 0,
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsSkipped: 0,
          errors: 0
        };

        results.total++;

        const result = await this.importQuarter(year, quarter, options);
        results.quarters.push(result);

        if (result.success) {
          results.success++;
          // Accumulate stats
          Object.keys(results.totalStats).forEach(key => {
            results.totalStats[key] += this.stats[key] || 0;
          });
        } else {
          results.failed++;
        }
      }
    }

    const totalElapsed = ((Date.now() - globalStart) / 1000 / 60).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Quarters imported: ${results.success}/${results.total}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('\n📈 Total Statistics:');
    console.log(`   • Companies created: ${results.totalStats.companiesCreated.toLocaleString()}`);
    console.log(`   • Companies updated: ${results.totalStats.companiesUpdated.toLocaleString()}`);
    console.log(`   • Records processed: ${results.totalStats.recordsProcessed.toLocaleString()}`);
    console.log(`   • Records inserted: ${results.totalStats.recordsInserted.toLocaleString()}`);
    console.log(`   • Errors: ${results.totalStats.errors.toLocaleString()}`);
    console.log(`\n⏱️  Total time: ${totalElapsed} minutes\n`);

    return results;
  }

  /**
   * Get import statistics
   */
  getStats() {
    const companyCount = this.database.prepare('SELECT COUNT(*) as count FROM companies WHERE cik IS NOT NULL').get();
    const lineItemCount = this.database.prepare('SELECT COUNT(*) as count FROM financial_line_items').get();

    const conceptCounts = this.database.prepare(`
      SELECT concept, COUNT(*) as count
      FROM financial_line_items
      GROUP BY concept
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return {
      companies: companyCount.count,
      lineItems: lineItemCount.count,
      topConcepts: conceptCounts
    };
  }
}

module.exports = SECBulkImporter;
