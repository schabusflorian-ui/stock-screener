// src/services/xbrl/xbrlBulkImporter.js

/**
 * XBRL Bulk Importer
 *
 * Orchestrates bulk import of EU/UK XBRL filings from filings.xbrl.org.
 * Handles country-by-country import with progress tracking, resume capability,
 * and automatic linking to the companies table.
 *
 * Coverage: All EU + UK listed companies since 2021 (ESEF mandate)
 */

const { XBRLFilingsClient } = require('./xbrlFilingsClient');
const { XBRLParser } = require('./xbrlParser');
const { FundamentalStore } = require('./fundamentalStore');

// Target countries in priority order
const EU_UK_COUNTRIES = [
  { code: 'GB', name: 'United Kingdom', priority: 1 },
  { code: 'DE', name: 'Germany', priority: 2 },
  { code: 'FR', name: 'France', priority: 3 },
  { code: 'NL', name: 'Netherlands', priority: 4 },
  { code: 'SE', name: 'Sweden', priority: 5 },
  { code: 'CH', name: 'Switzerland', priority: 6 },
  { code: 'ES', name: 'Spain', priority: 7 },
  { code: 'IT', name: 'Italy', priority: 8 },
  { code: 'BE', name: 'Belgium', priority: 9 },
  { code: 'DK', name: 'Denmark', priority: 10 },
  { code: 'NO', name: 'Norway', priority: 11 },
  { code: 'FI', name: 'Finland', priority: 12 },
  { code: 'AT', name: 'Austria', priority: 13 },
  { code: 'IE', name: 'Ireland', priority: 14 },
  { code: 'PT', name: 'Portugal', priority: 15 },
  { code: 'PL', name: 'Poland', priority: 16 },
  { code: 'GR', name: 'Greece', priority: 17 },
  { code: 'CZ', name: 'Czech Republic', priority: 18 },
  { code: 'HU', name: 'Hungary', priority: 19 },
  { code: 'LU', name: 'Luxembourg', priority: 20 },
];

class XBRLBulkImporter {
  /**
   * Create a new XBRLBulkImporter
   * @param {Object} db - better-sqlite3 database instance
   * @param {Object} config - Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.client = new XBRLFilingsClient(config.clientConfig);
    this.parser = new XBRLParser(config.parserConfig);
    this.store = new FundamentalStore(db);

    // Symbol resolver from Agent 11 (optional)
    this.symbolResolver = config.symbolResolver || null;

    // Import settings
    this.startYear = config.startYear || 2021;
    this.batchSize = config.batchSize || 100;
    this.maxErrorsPerCountry = config.maxErrorsPerCountry || 50;

    // State tracking
    this.isRunning = false;
    this.isPaused = false;
    this.currentJobId = null;

    this._ensureResumeColumns();

    console.log('✅ XBRLBulkImporter initialized');
  }

  /**
   * Ensure sync_log table has resume capability columns
   * @private
   */
  _ensureResumeColumns() {
    try {
      this.db.exec(`ALTER TABLE xbrl_sync_log ADD COLUMN last_filing_hash TEXT`);
    } catch (e) {
      // Column may already exist
    }
    try {
      this.db.exec(`ALTER TABLE xbrl_sync_log ADD COLUMN current_page INTEGER DEFAULT 1`);
    } catch (e) {
      // Column may already exist
    }
    try {
      this.db.exec(`ALTER TABLE xbrl_sync_log ADD COLUMN target_country TEXT`);
    } catch (e) {
      // Column may already exist
    }
  }

  /**
   * Import all filings for a single country
   * @param {string} countryCode - ISO 2-letter country code
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   */
  async importCountry(countryCode, options = {}) {
    const {
      startYear = this.startYear,
      progressCallback = null,
      maxFilings = null,
      resumeFromPage = 1,
      resumeFromHash = null
    } = options;

    if (this.isRunning) {
      throw new Error('Import already in progress');
    }

    this.isRunning = true;
    this.isPaused = false;

    const logId = this.store.startSyncLog('country_backfill', countryCode);
    this.currentJobId = logId;

    // Update with target country
    this.db.prepare(`UPDATE xbrl_sync_log SET target_country = ? WHERE id = ?`)
      .run(countryCode, logId);

    const stats = {
      country: countryCode,
      processed: 0,
      added: 0,
      parsed: 0,
      errors: 0,
      skipped: 0,
      startedAt: new Date().toISOString(),
      errorDetails: []
    };

    console.log(`\n📥 Starting import for ${countryCode} (from year ${startYear})`);

    let page = resumeFromPage;
    let hasMore = true;
    let skipUntilHash = resumeFromHash;
    let filingCount = 0;

    try {
      while (hasMore && !this.isPaused) {
        // Fetch batch of filings
        const result = await this.client.getFilingsByCountry(countryCode, {
          page,
          pageSize: this.batchSize
        });

        if (!result.filings || result.filings.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`  Page ${page}: Processing ${result.filings.length} filings...`);

        for (const filing of result.filings) {
          if (this.isPaused) break;
          if (maxFilings && filingCount >= maxFilings) {
            hasMore = false;
            break;
          }

          // Skip until we reach the resume point
          if (skipUntilHash) {
            if (filing.hash === skipUntilHash) {
              skipUntilHash = null;
            }
            stats.skipped++;
            continue;
          }

          // Skip if filing is before start year
          if (filing.periodEnd) {
            const filingYear = new Date(filing.periodEnd).getFullYear();
            if (filingYear < startYear) {
              stats.skipped++;
              continue;
            }
          }

          // Skip if already imported
          const existing = this.store.getFilingByHash(filing.hash);
          if (existing) {
            stats.skipped++;
            continue;
          }

          try {
            // Store filing and identifier
            const storedFiling = this.store.storeFiling(filing);
            stats.added++;

            // Fetch and parse xBRL-JSON
            if (filing.jsonUrl) {
              try {
                const xbrlJson = await this.client.getXBRLJson(filing.jsonUrl);
                const parsed = this.parser.parseXBRLJson(xbrlJson);

                // Store all periods: annual, semi-annual, and quarterly
                for (const [periodKey, periodData] of Object.entries(parsed.periods)) {
                  if (periodData.periodType === 'annual' || periodData.periodType === 'semi-annual' || periodData.periodType === 'quarterly') {
                    const metrics = this.parser.toFlatRecord(parsed, periodKey);

                    if (metrics && storedFiling.identifierId) {
                      this.store.storeMetrics(metrics, storedFiling.identifierId, storedFiling.id);
                    }
                  }
                }

                this.store.markFilingParsed(storedFiling.id, true);
                stats.parsed++;
              } catch (parseError) {
                // Log parse error but don't fail the import
                this.store.markFilingParsed(storedFiling.id, false, parseError.message);
                console.warn(`    Parse error for ${filing.entityName}: ${parseError.message}`);
              }
            }
          } catch (error) {
            stats.errors++;
            stats.errorDetails.push({
              filing: filing.hash,
              entity: filing.entityName,
              error: error.message
            });

            // Stop if too many errors
            if (stats.errors >= this.maxErrorsPerCountry) {
              console.error(`  Too many errors (${stats.errors}), stopping import for ${countryCode}`);
              break;
            }
          }

          stats.processed++;
          filingCount++;

          // Update progress
          this._updateProgress(logId, page, filing.hash);

          // Call progress callback
          if (progressCallback) {
            progressCallback({
              stats: { ...stats },
              currentFiling: filing,
              page,
              total: result.meta.total
            });
          }
        }

        hasMore = result.meta.hasMore;
        page++;

        // Progress log every 5 pages
        if (page % 5 === 0) {
          console.log(`    Progress: ${stats.processed} processed, ${stats.parsed} parsed, ${stats.errors} errors`);
        }
      }

      // Complete the sync log
      this.store.completeSyncLog(logId, {
        processed: stats.processed,
        added: stats.added,
        updated: 0,
        errors: stats.errors,
        errorDetails: stats.errorDetails.length > 0 ? JSON.stringify(stats.errorDetails.slice(0, 20)) : null
      });

      stats.completedAt = new Date().toISOString();
      console.log(`\n✅ Import completed for ${countryCode}:`);
      console.log(`   Processed: ${stats.processed}, Parsed: ${stats.parsed}, Errors: ${stats.errors}, Skipped: ${stats.skipped}`);

    } finally {
      this.isRunning = false;
      this.currentJobId = null;
    }

    return stats;
  }

  /**
   * Import all EU/UK countries
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Aggregated statistics
   */
  async importAllEuropeUK(options = {}) {
    const {
      countries = EU_UK_COUNTRIES.map(c => c.code),
      startYear = this.startYear,
      progressCallback = null,
      skipCountries = []
    } = options;

    const results = {
      startedAt: new Date().toISOString(),
      countries: {},
      totals: { processed: 0, added: 0, parsed: 0, errors: 0, skipped: 0 }
    };

    console.log(`\n🌍 Starting EU/UK bulk import (${countries.length} countries)`);

    for (const countryCode of countries) {
      if (skipCountries.includes(countryCode)) {
        console.log(`  Skipping ${countryCode}`);
        continue;
      }

      if (this.isPaused) {
        console.log(`  Import paused at ${countryCode}`);
        break;
      }

      try {
        const stats = await this.importCountry(countryCode, {
          startYear,
          progressCallback: (progress) => {
            if (progressCallback) {
              progressCallback({
                ...progress,
                currentCountry: countryCode
              });
            }
          }
        });

        results.countries[countryCode] = stats;
        results.totals.processed += stats.processed;
        results.totals.added += stats.added;
        results.totals.parsed += stats.parsed;
        results.totals.errors += stats.errors;
        results.totals.skipped += stats.skipped;

      } catch (error) {
        console.error(`  Error importing ${countryCode}: ${error.message}`);
        results.countries[countryCode] = { error: error.message };
      }
    }

    results.completedAt = new Date().toISOString();

    console.log(`\n🎉 EU/UK bulk import complete!`);
    console.log(`   Total processed: ${results.totals.processed}`);
    console.log(`   Total parsed: ${results.totals.parsed}`);
    console.log(`   Total errors: ${results.totals.errors}`);

    return results;
  }

  /**
   * Resume an interrupted import
   * @param {number} syncLogId - Sync log ID to resume
   * @returns {Promise<Object>} - Import statistics
   */
  async resumeImport(syncLogId) {
    const log = this.db.prepare(`SELECT * FROM xbrl_sync_log WHERE id = ?`).get(syncLogId);

    if (!log) {
      throw new Error(`Sync log ${syncLogId} not found`);
    }

    if (log.status === 'completed') {
      throw new Error('Import already completed');
    }

    const country = log.target_country || log.country;
    if (!country) {
      throw new Error('Cannot determine country to resume');
    }

    console.log(`\n🔄 Resuming import for ${country} from page ${log.current_page || 1}`);

    return this.importCountry(country, {
      resumeFromPage: log.current_page || 1,
      resumeFromHash: log.last_filing_hash
    });
  }

  /**
   * Link all unlinked identifiers to companies table
   * Uses Agent 11's SymbolResolver if available
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Linking statistics
   */
  async linkAllIdentifiers(options = {}) {
    const { progressCallback = null, limit = null } = options;

    if (!this.symbolResolver) {
      console.warn('SymbolResolver not configured, skipping auto-link');
      return { linked: 0, failed: 0, skipped: 0 };
    }

    let query = `
      SELECT * FROM company_identifiers
      WHERE company_id IS NULL AND lei IS NOT NULL
    `;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const unlinked = this.db.prepare(query).all();
    console.log(`\n🔗 Linking ${unlinked.length} unlinked identifiers...`);

    const stats = { linked: 0, failed: 0, skipped: 0 };

    for (const identifier of unlinked) {
      try {
        const result = await this.symbolResolver.linkCompany(identifier.lei, {
          companyName: identifier.legal_name,
          country: identifier.country,
          createIfMissing: true
        });

        if (result.linked) {
          stats.linked++;

          if (progressCallback) {
            progressCallback({
              identifier,
              result,
              stats: { ...stats }
            });
          }
        } else {
          stats.failed++;
        }
      } catch (error) {
        stats.failed++;
        console.warn(`  Failed to link ${identifier.legal_name}: ${error.message}`);
      }
    }

    console.log(`\n✅ Linking complete: ${stats.linked} linked, ${stats.failed} failed`);
    return stats;
  }

  /**
   * Pause the current import
   */
  pause() {
    if (this.isRunning) {
      console.log('⏸️  Pausing import...');
      this.isPaused = true;
    }
  }

  /**
   * Get current import status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentJobId: this.currentJobId
    };
  }

  /**
   * Get import statistics
   * @returns {Object} - Statistics from store
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * Get recent sync logs
   * @param {number} limit - Max logs to return
   * @returns {Array} - Sync logs
   */
  getSyncLogs(limit = 20) {
    return this.store.getSyncLogs(limit);
  }

  /**
   * Get list of target countries
   * @returns {Array} - Country list with metadata
   */
  getTargetCountries() {
    return EU_UK_COUNTRIES;
  }

  /**
   * Update progress in sync log
   * @private
   */
  _updateProgress(logId, page, filingHash) {
    this.db.prepare(`
      UPDATE xbrl_sync_log
      SET current_page = ?, last_filing_hash = ?
      WHERE id = ?
    `).run(page, filingHash, logId);
  }
}

module.exports = { XBRLBulkImporter, EU_UK_COUNTRIES };
