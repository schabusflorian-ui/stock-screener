// src/services/updates/bundles/euBundle.js
/**
 * EU/UK Update Bundle
 *
 * Handles European and UK data update jobs:
 * - eu.xbrl_import - Import XBRL filings from EU/UK countries
 * - eu.sync - Link XBRL companies and sync metrics to main tables
 * - eu.indices - Update European index prices
 * - eu.prices - Fetch prices for EU/UK companies
 */

const { getDatabaseAsync, isUsingPostgres } = require('../../../lib/db');
const { spawn } = require('child_process');
const path = require('path');

class EUBundle {
  constructor() {
    this.xbrlImporter = null;
    this.xbrlSyncService = null;
  }

  getXBRLImporter() {
    if (!this.xbrlImporter) {
      try {
        const { XBRLBulkImporter } = require('../../xbrl/xbrlBulkImporter');
        this.xbrlImporter = new XBRLBulkImporter({ startYear: 2021 });
      } catch (error) {
        console.warn('XBRLBulkImporter not available:', error.message);
        return null;
      }
    }
    return this.xbrlImporter;
  }

  getXBRLSyncService() {
    if (!this.xbrlSyncService) {
      try {
        const { XBRLSyncService } = require('../../xbrl/xbrlSyncService');
        this.xbrlSyncService = new XBRLSyncService();
      } catch (error) {
        console.warn('XBRLSyncService not available:', error.message);
        return null;
      }
    }
    return this.xbrlSyncService;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'eu.xbrl_import':
        return this.runXBRLImport(db, onProgress);
      case 'eu.sync':
        return this.runXBRLSync(db, onProgress);
      case 'eu.indices':
        return this.runIndicesUpdate(db, onProgress);
      case 'eu.prices':
        return this.runPricesUpdate(db, onProgress);
      default:
        throw new Error(`Unknown EU job: ${jobKey}`);
    }
  }

  async runXBRLImport(db, onProgress) {
    await onProgress(5, 'Starting XBRL import from EU/UK...');

    const importer = this.getXBRLImporter();
    if (!importer) {
      await onProgress(100, 'Skipped: XBRL importer not available');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'XBRL importer not available' }
      };
    }

    try {
      // Import from top priority countries (GB, DE, FR)
      const countries = ['GB', 'DE', 'FR'];
      let totalProcessed = 0;
      let totalAdded = 0;
      let totalErrors = 0;

      for (let i = 0; i < countries.length; i++) {
        const countryCode = countries[i];
        const baseProgress = 5 + (i / countries.length) * 85;
        await onProgress(baseProgress, `Importing ${countryCode} filings...`);

        try {
          const result = await importer.importCountry(countryCode, {
            maxFilings: 100, // Limit per run to avoid long-running jobs
            progressCallback: ({ stats }) => {
              totalProcessed = stats.processed;
              totalAdded = stats.added;
              totalErrors = stats.errors;
            }
          });

          totalProcessed += result.processed || 0;
          totalAdded += result.added || 0;
          totalErrors += result.errors || 0;
        } catch (error) {
          console.error(`Error importing ${countryCode}:`, error.message);
          totalErrors++;
        }
      }

      await onProgress(100, `XBRL import complete: ${totalAdded} filings added`);

      return {
        itemsTotal: totalProcessed,
        itemsProcessed: totalProcessed,
        itemsUpdated: totalAdded,
        itemsFailed: totalErrors,
        metadata: { countries }
      };
    } catch (error) {
      throw error;
    }
  }

  async runXBRLSync(db, onProgress) {
    await onProgress(5, 'Starting XBRL sync...');

    const syncService = this.getXBRLSyncService();
    if (!syncService) {
      await onProgress(100, 'Skipped: XBRL sync service not available');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        metadata: { skipped: true, reason: 'XBRL sync service not available' }
      };
    }

    try {
      // Step 1: Link unlinked XBRL companies to main companies table
      await onProgress(10, 'Linking XBRL companies...');
      const linkResult = await syncService.linkAllUnlinkedCompanies();

      await onProgress(40, `Linked ${linkResult.linked} companies, created ${linkResult.created} new`);

      // Step 2: Resolve tickers for pending companies
      await onProgress(50, 'Resolving tickers for EU/UK companies...');
      const tickerResult = await syncService.resolvePendingTickers(50, 300);

      await onProgress(70, `Resolved ${tickerResult.resolved} tickers`);

      // Step 3: Sync metrics from XBRL to calculated_metrics
      await onProgress(75, 'Syncing XBRL metrics...');
      const metricsResult = await syncService.syncMetrics();

      await onProgress(100, `XBRL sync complete: ${metricsResult.synced} metrics synced`);

      return {
        itemsTotal: linkResult.processed + tickerResult.processed + (metricsResult.synced || 0),
        itemsProcessed: linkResult.processed + tickerResult.processed + (metricsResult.synced || 0),
        itemsUpdated: linkResult.linked + tickerResult.resolved + (metricsResult.synced || 0),
        itemsFailed: linkResult.errors + tickerResult.failed + (metricsResult.errors || 0),
        metadata: {
          linking: linkResult,
          tickers: tickerResult,
          metrics: metricsResult
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async runIndicesUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting European indices update...');

    try {
      // Major European indices with Yahoo Finance symbols
      const europeanIndices = [
        { code: 'FTSE', yahoo: '^FTSE', name: 'FTSE 100', country: 'GB' },
        { code: 'DAX', yahoo: '^GDAXI', name: 'DAX 40', country: 'DE' },
        { code: 'CAC', yahoo: '^FCHI', name: 'CAC 40', country: 'FR' },
        { code: 'AEX', yahoo: '^AEX', name: 'AEX', country: 'NL' },
        { code: 'SMI', yahoo: '^SSMI', name: 'SMI', country: 'CH' },
        { code: 'IBEX', yahoo: '^IBEX', name: 'IBEX 35', country: 'ES' },
        { code: 'FTSEMIB', yahoo: 'FTSEMIB.MI', name: 'FTSE MIB', country: 'IT' },
        { code: 'SX5E', yahoo: '^STOXX50E', name: 'Euro Stoxx 50', country: 'EU' },
        { code: 'OMX30', yahoo: '^OMX', name: 'OMX Stockholm 30', country: 'SE' }
      ];

      await onProgress(10, `Fetching ${europeanIndices.length} European indices from Yahoo Finance...`);

      let updated = 0;
      let failed = 0;
      const errors = [];

      for (let i = 0; i < europeanIndices.length; i++) {
        const index = europeanIndices[i];
        const progress = 10 + Math.floor((i / europeanIndices.length) * 80);

        try {
          // Fetch from Yahoo Finance API
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.yahoo)}?interval=1d&range=5d`;
          const response = await fetch(yahooUrl);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const result = data.chart?.result?.[0];

          if (!result?.meta?.regularMarketPrice) {
            throw new Error('No price data in response');
          }

          const price = result.meta.regularMarketPrice;
          const previousClose = result.meta.previousClose || price;
          const change = price - previousClose;
          const changePercent = previousClose ? (change / previousClose) * 100 : 0;

          // Store in market_indices table (upsert) - using columns that exist
          // description stores JSON with price data: {"last_price": X, "change_pct": Y, "country": "XX"}
          const priceJson = JSON.stringify({
            last_price: price,
            change_pct: Math.round(changePercent * 100) / 100,
            country: index.country,
            updated_at: new Date().toISOString()
          });

          const upsertSql = isUsingPostgres()
            ? `INSERT INTO market_indices (symbol, name, short_name, index_type, description, is_active)
               VALUES ($1, $2, $3, 'european', $4, 1)
               ON CONFLICT (symbol) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 is_active = 1`
            : `INSERT INTO market_indices (symbol, name, short_name, index_type, description, is_active)
               VALUES ($1, $2, $3, 'european', $4, 1)
               ON CONFLICT (symbol) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 is_active = 1`;

          await database.query(upsertSql, [
            index.yahoo,
            index.name,
            index.code,
            priceJson
          ]);

          await onProgress(progress, `${index.code}: ${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
          updated++;
        } catch (error) {
          console.error(`Error fetching ${index.code}:`, error.message);
          errors.push(`${index.code}: ${error.message}`);
          failed++;
        }

        // Rate limiting delay
        if (i < europeanIndices.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      await onProgress(100, `European indices update complete: ${updated} updated, ${failed} failed`);

      return {
        itemsTotal: europeanIndices.length,
        itemsProcessed: europeanIndices.length,
        itemsUpdated: updated,
        itemsFailed: failed,
        metadata: { errors: errors.length > 0 ? errors : undefined }
      };
    } catch (error) {
      throw error;
    }
  }

  async runPricesUpdate(db, onProgress) {
    await onProgress(5, 'Starting EU/UK prices update via Python price_updater...');

    try {
      // EU countries to update (prioritized by market size)
      const euCountries = ['GB', 'DE', 'FR', 'NL', 'CH'];

      let totalUpdated = 0;
      let totalFailed = 0;
      let totalProcessed = 0;
      const countryResults = {};

      // Path to Python script
      const pythonScript = path.join(__dirname, '../../../../python-services/price_updater.py');
      const dbPath = path.join(__dirname, '../../../../data/stocks.db');

      for (let i = 0; i < euCountries.length; i++) {
        const country = euCountries[i];
        const baseProgress = 5 + (i / euCountries.length) * 85;
        await onProgress(baseProgress, `Updating ${country} prices...`);

        try {
          // Call Python price_updater with test-country command
          const result = await new Promise((resolve, reject) => {
            const child = spawn('python3', [
              pythonScript,
              '--db', dbPath,
              'test-country',
              '-c', country,
              '-l', '50'  // Limit per country per run to avoid long-running jobs
            ], {
              cwd: path.dirname(pythonScript)
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
              stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
              stderr += data.toString();
            });

            child.on('close', (code) => {
              if (code === 0) {
                // Parse output to extract stats
                const successMatch = stdout.match(/Successful:\s*(\d+)/);
                const failedMatch = stdout.match(/Failed:\s*(\d+)/);
                resolve({
                  success: true,
                  updated: successMatch ? parseInt(successMatch[1]) : 0,
                  failed: failedMatch ? parseInt(failedMatch[1]) : 0,
                  output: stdout
                });
              } else {
                resolve({
                  success: false,
                  updated: 0,
                  failed: 0,
                  error: stderr || `Exit code ${code}`
                });
              }
            });

            child.on('error', (err) => {
              resolve({
                success: false,
                updated: 0,
                failed: 0,
                error: err.message
              });
            });

            // Timeout after 5 minutes
            setTimeout(() => {
              child.kill();
              resolve({
                success: false,
                updated: 0,
                failed: 0,
                error: 'Timeout after 5 minutes'
              });
            }, 300000);
          });

          countryResults[country] = result;
          totalUpdated += result.updated;
          totalFailed += result.failed;
          totalProcessed += result.updated + result.failed;

          if (result.success) {
            await onProgress(baseProgress + 15, `${country}: ${result.updated} updated, ${result.failed} failed`);
          } else {
            console.error(`Error updating ${country} prices:`, result.error);
            await onProgress(baseProgress + 15, `${country}: Error - ${result.error}`);
          }
        } catch (error) {
          console.error(`Exception updating ${country} prices:`, error.message);
          countryResults[country] = { success: false, error: error.message };
        }

        // Delay between countries
        if (i < euCountries.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      await onProgress(100, `EU/UK prices update complete: ${totalUpdated} updated, ${totalFailed} failed`);

      return {
        itemsTotal: totalProcessed,
        itemsProcessed: totalProcessed,
        itemsUpdated: totalUpdated,
        itemsFailed: totalFailed,
        metadata: { countryResults }
      };
    } catch (error) {
      throw error;
    }
  }
}

const euBundle = new EUBundle();

module.exports = {
  execute: (jobKey, db, context) => euBundle.execute(jobKey, db, context)
};
