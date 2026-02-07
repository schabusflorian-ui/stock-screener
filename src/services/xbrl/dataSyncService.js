// src/services/xbrl/dataSyncService.js
const { getDatabaseAsync } = require('../../database');
const { XBRLFilingsClient } = require('./xbrlFilingsClient');
const { CompaniesHouseClient } = require('./companiesHouseClient');
const { XBRLParser } = require('./xbrlParser');
const { FundamentalStore } = require('./fundamentalStore');

/**
 * Data Sync Service
 *
 * Orchestrates syncing XBRL data from EU filings.xbrl.org and UK Companies House.
 * Handles:
 * - Fetching new filings by country
 * - Parsing xBRL-JSON into structured data
 * - Storing in database
 * - Tracking sync progress and errors
 */
class DataSyncService {
  constructor(config = {}) {
    this.database = null;
    this.config = {
      countries: config.countries || ['GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'SE', 'BE', 'AT', 'CH'],
      batchSize: config.batchSize || 50,
      maxErrorsPerSync: config.maxErrorsPerSync || 10,
      parseDelay: config.parseDelay || 500, // ms between parse operations
      ...config
    };

    // Initialize components (store is initialized after database is set)
    this.filingsClient = new XBRLFilingsClient(config.filingsClient);
    this.companiesHouseClient = new CompaniesHouseClient(config.companiesHouse);
    this.parser = new XBRLParser(config.parser);
    this.store = null;

    // Sync state
    this.isRunning = false;
    this.currentSync = null;
    this.abortController = null;
  }

  /**
   * Initialize async resources
   */
  async init() {
    this.database = await getDatabaseAsync();
    this.store = new FundamentalStore();
    console.log('✅ DataSyncService initialized');
  }

  /**
   * Run full sync for all configured countries
   * @returns {Object} - Sync results
   */
  async runFullSync() {
    if (this.isRunning) {
      throw new Error('Sync already in progress');
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const results = {
      countries: {},
      totals: { processed: 0, added: 0, updated: 0, errors: 0 },
      startedAt: new Date().toISOString(),
      completedAt: null
    };

    console.log(`\n📥 Starting full XBRL sync for ${this.config.countries.length} countries...\n`);

    try {
      for (const country of this.config.countries) {
        if (this.abortController.signal.aborted) {
          console.log('Sync aborted');
          break;
        }

        const countryResult = await this.syncCountry(country);
        results.countries[country] = countryResult;

        results.totals.processed += countryResult.processed;
        results.totals.added += countryResult.added;
        results.totals.updated += countryResult.updated;
        results.totals.errors += countryResult.errors;
      }
    } finally {
      this.isRunning = false;
      this.currentSync = null;
      results.completedAt = new Date().toISOString();
    }

    console.log('\n📊 Full sync completed:', results.totals);
    return results;
  }

  /**
   * Sync filings for a specific country
   * @param {string} countryCode - ISO 2-letter country code
   * @returns {Object} - Sync results for this country
   */
  async syncCountry(countryCode) {
    const logId = await this.store.startSyncLog('country', countryCode);
    this.currentSync = { country: countryCode, logId };

    const result = {
      country: countryCode,
      processed: 0,
      added: 0,
      updated: 0,
      errors: 0,
      errorDetails: []
    };

    console.log(`\n🌍 Syncing ${countryCode}...`);

    try {
      // Fetch filings from API
      const { filings } = await this.filingsClient.getFilingsByCountry(countryCode, {
        pageSize: this.config.batchSize
      });

      console.log(`   Found ${filings.length} filings for ${countryCode}`);

      for (const filing of filings) {
        if (this.abortController?.signal.aborted) break;

        try {
          const processResult = await this._processFiling(filing);
          result.processed++;

          if (processResult.isNew) {
            result.added++;
          } else if (processResult.updated) {
            result.updated++;
          }
        } catch (error) {
          result.errors++;
          result.errorDetails.push({
            filingHash: filing.hash,
            error: error.message
          });

          console.error(`   ❌ Error processing ${filing.hash}: ${error.message}`);

          if (result.errors >= this.config.maxErrorsPerSync) {
            console.warn(`   ⚠️ Max errors reached for ${countryCode}, moving to next country`);
            break;
          }
        }

        // Rate limit between parse operations
        await this._sleep(this.config.parseDelay);
      }

      console.log(`   ✅ ${countryCode}: ${result.added} added, ${result.updated} updated, ${result.errors} errors`);

    } catch (error) {
      result.errors++;
      result.errorDetails.push({
        phase: 'fetch',
        error: error.message
      });
      console.error(`   ❌ Failed to sync ${countryCode}: ${error.message}`);
    }

    // Update sync log
    await this.store.completeSyncLog(logId, {
      processed: result.processed,
      added: result.added,
      updated: result.updated,
      errors: result.errors,
      errorDetails: result.errorDetails.length > 0 ? JSON.stringify(result.errorDetails) : null
    });

    return result;
  }

  /**
   * Sync a single company by LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Object} - Sync result
   */
  async syncByLEI(lei) {
    console.log(`\n🔍 Syncing filings for LEI: ${lei}`);

    const filings = await this.filingsClient.getFilingsByLEI(lei);

    const result = {
      lei,
      filings: filings.length,
      processed: 0,
      errors: 0
    };

    for (const filing of filings) {
      try {
        await this._processFiling(filing);
        result.processed++;
      } catch (error) {
        result.errors++;
        console.error(`   ❌ Error processing ${filing.hash}: ${error.message}`);
      }
    }

    console.log(`   ✅ Processed ${result.processed}/${result.filings} filings for ${lei}`);
    return result;
  }

  /**
   * Process unparsed filings (retry previously failed)
   * @param {number} limit - Max filings to process
   * @returns {Object} - Processing results
   */
  async processUnparsedFilings(limit = 100) {
    const unparsed = await this.store.getUnparsedFilings(limit);
    console.log(`\n🔄 Processing ${unparsed.length} unparsed filings...`);

    const result = {
      total: unparsed.length,
      success: 0,
      failed: 0
    };

    for (const filing of unparsed) {
      try {
        // Use json_url if available, otherwise fall back to hash
        const fetchUrl = filing.json_url || filing.filing_hash;
        if (!fetchUrl) {
          throw new Error('No json_url or filing_hash available');
        }

        // Fetch xBRL-JSON
        const xbrlJson = await this.filingsClient.getXBRLJson(fetchUrl);

        // Parse
        const parsed = this.parser.parseXBRLJson(xbrlJson);
        const metrics = this.parser.toFlatRecord(parsed);

        if (metrics) {
          // Store metrics
          await this.store.storeMetrics(metrics, filing.identifier_id, filing.id);
        }

        // Mark as parsed
        await this.store.markFilingParsed(filing.id, true);
        result.success++;

      } catch (error) {
        await this.store.markFilingParsed(filing.id, false, error.message);
        result.failed++;
        console.error(`   ❌ Failed to parse ${filing.filing_hash}: ${error.message}`);
      }

      await this._sleep(this.config.parseDelay);
    }

    console.log(`   ✅ Parsed: ${result.success}, Failed: ${result.failed}`);
    return result;
  }

  /**
   * Process a single filing
   * @private
   */
  async _processFiling(filing) {
    // Check if already exists
    const existing = await this.store.getFilingByHash(filing.hash);
    if (existing && existing.parsed) {
      return { isNew: false, updated: false };
    }

    // Store filing metadata
    const storedFiling = await this.store.storeFiling(filing);
    const isNew = !existing;

    // Fetch xBRL-JSON
    let xbrlJson;
    try {
      xbrlJson = await this.filingsClient.getXBRLJson(filing.hash);
    } catch (error) {
      // xBRL-JSON not available for this filing
      await this.store.markFilingParsed(storedFiling.id, false, `xBRL-JSON not available: ${error.message}`);
      return { isNew, updated: false };
    }

    // Parse xBRL-JSON
    const parsed = this.parser.parseXBRLJson(xbrlJson);

    // Calculate data quality score
    const qualityScore = this._calculateDataQualityScore(parsed);

    // Store metrics for each period
    let metricsStored = 0;
    for (const [periodKey, periodData] of Object.entries(parsed.periods)) {
      if (periodData.periodType === 'annual' || periodData.periodType === 'semi-annual') {
        const metrics = this.parser.toFlatRecord(parsed, periodKey);
        if (metrics) {
          metrics.data_quality_score = qualityScore;
          await this.store.storeMetrics(metrics, storedFiling.identifierId, storedFiling.id);
          metricsStored++;
        }
      }
    }

    // Mark filing as parsed
    await this.store.markFilingParsed(storedFiling.id, true);

    console.log(`   📄 ${filing.entityName}: ${metricsStored} periods stored (quality: ${qualityScore.toFixed(0)}%)`);

    return { isNew, updated: true, periods: metricsStored };
  }

  /**
   * Calculate data quality score based on completeness
   * @private
   */
  _calculateDataQualityScore(parsed) {
    const keyFields = [
      'revenue', 'net_income', 'total_assets', 'total_equity',
      'operating_cash_flow', 'total_liabilities', 'gross_profit',
      'operating_income', 'cash_and_equivalents'
    ];

    const mostRecent = this.parser.getMostRecentAnnual(parsed);
    if (!mostRecent) return 0;

    const metrics = mostRecent.metrics || {};
    const present = keyFields.filter(f => metrics[f] !== undefined && metrics[f] !== null);

    return (present.length / keyFields.length) * 100;
  }

  /**
   * Abort current sync
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      console.log('Sync abort requested...');
    }
  }

  /**
   * Get sync status
   * @returns {Object} - Current status
   */
  async getStatus() {
    return {
      isRunning: this.isRunning,
      currentSync: this.currentSync,
      stats: await this.store.getStats(),
      recentLogs: await this.store.getSyncLogs(5)
    };
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Schedule automatic sync
 * @param {DataSyncService} syncService - Sync service instance
 * @param {string} schedule - Cron schedule (e.g., '0 2 * * *' for 2am daily)
 * @returns {Object} - Scheduler handle
 */
function scheduleSync(syncService, schedule = '0 2 * * *') {
  const nodeCron = require('node-cron');

  const task = nodeCron.schedule(schedule, async () => {
    console.log('\n🕐 Scheduled XBRL sync starting...');
    try {
      await syncService.runFullSync();
    } catch (error) {
      console.error('Scheduled sync failed:', error.message);
    }
  });

  console.log(`📅 XBRL sync scheduled: ${schedule}`);

  return {
    task,
    stop: () => task.stop(),
    start: () => task.start()
  };
}

module.exports = { DataSyncService, scheduleSync };
