// src/api/routes/xbrl.js
const express = require('express');
const router = express.Router();
const db = require('../../database');
const {
  XBRLFilingsClient,
  CompaniesHouseClient,
  XBRLParser,
  FundamentalStore,
  DataSyncService
} = require('../../services/xbrl');
const { XBRLBulkImporter, EU_UK_COUNTRIES } = require('../../services/xbrl/xbrlBulkImporter');

const database = db.getDatabase();

// Initialize services
let store;
let syncService;
let filingsClient;
let companiesHouseClient;
let parser;

try {
  store = new FundamentalStore(database);
  filingsClient = new XBRLFilingsClient();
  parser = new XBRLParser();
  syncService = new DataSyncService(database);
  console.log('✅ XBRL routes initialized');
} catch (error) {
  console.error('❌ Failed to initialize XBRL services:', error.message);
}

// ========================================
// Company Identifiers
// ========================================

/**
 * GET /api/xbrl/identifiers
 * Search company identifiers
 */
router.get('/identifiers', (req, res) => {
  try {
    const { query, country, limit = 20 } = req.query;

    let results;
    if (query) {
      results = store.searchIdentifiers(query, parseInt(limit, 10));
    } else if (country) {
      results = store.getIdentifiersByCountry(country, parseInt(limit, 10));
    } else {
      results = database.prepare(`
        SELECT * FROM company_identifiers ORDER BY company_name LIMIT ?
      `).all(parseInt(limit, 10));
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/identifiers/:lei
 * Get identifier by LEI
 */
router.get('/identifiers/:lei', (req, res) => {
  try {
    const { lei } = req.params;
    const identifier = store.getIdentifierByLEI(lei);

    if (!identifier) {
      return res.status(404).json({ success: false, error: 'Identifier not found' });
    }

    res.json({ success: true, data: identifier });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/identifiers
 * Create or update company identifier
 */
router.post('/identifiers', (req, res) => {
  try {
    const identifier = store.upsertIdentifier(req.body);
    res.json({ success: true, data: identifier });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/identifiers/:id/link
 * Link identifier to existing company
 */
router.post('/identifiers/:id/link', (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'companyId is required' });
    }

    store.linkToCompany(parseInt(id, 10), parseInt(companyId, 10));
    res.json({ success: true, message: 'Identifier linked to company' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Filings
// ========================================

/**
 * GET /api/xbrl/filings
 * Search filings from database or API
 */
router.get('/filings', async (req, res) => {
  try {
    const { lei, country, source = 'db', limit = 50 } = req.query;

    if (source === 'api') {
      // Fetch from filings.xbrl.org API
      const filters = {};
      if (lei) filters.lei = lei;
      if (country) filters.country = country;
      filters.pageSize = parseInt(limit, 10);

      const result = await filingsClient.searchFilings(filters);
      return res.json({ success: true, data: result.filings, meta: result.meta });
    }

    // Fetch from local database
    let query = 'SELECT * FROM xbrl_filings';
    const params = [];
    const conditions = [];

    if (lei) {
      conditions.push('lei = ?');
      params.push(lei);
    }
    if (country) {
      conditions.push('country = ?');
      params.push(country.toUpperCase());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY period_end DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const filings = database.prepare(query).all(...params);
    res.json({ success: true, data: filings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/filings/:hash
 * Get filing by hash
 */
router.get('/filings/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const { includeJson = false } = req.query;

    // Check local database first
    let filing = store.getFilingByHash(hash);

    if (!filing) {
      // Fetch from API
      try {
        const apiData = await filingsClient.getFilingMetadata(hash);
        filing = apiData;
      } catch (error) {
        return res.status(404).json({ success: false, error: 'Filing not found' });
      }
    }

    // Optionally fetch xBRL-JSON
    if (includeJson === 'true') {
      try {
        filing.xbrlJson = await filingsClient.getXBRLJson(hash);
      } catch (error) {
        filing.xbrlJsonError = error.message;
      }
    }

    res.json({ success: true, data: filing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/filings/:hash/parse
 * Parse a specific filing
 */
router.post('/filings/:hash/parse', async (req, res) => {
  try {
    const { hash } = req.params;

    // Fetch xBRL-JSON
    const xbrlJson = await filingsClient.getXBRLJson(hash);

    // Parse
    const parsed = parser.parseXBRLJson(xbrlJson);
    const flatRecord = parser.toFlatRecord(parsed);

    res.json({
      success: true,
      data: {
        entity: parsed.entity,
        periods: Object.keys(parsed.periods),
        latestMetrics: flatRecord,
        parseStats: parsed.parseStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Fundamental Metrics
// ========================================

/**
 * GET /api/xbrl/metrics/:lei
 * Get metrics for a company by LEI
 */
router.get('/metrics/:lei', (req, res) => {
  try {
    const { lei } = req.params;
    const { periods = 5 } = req.query;

    const identifier = store.getIdentifierByLEI(lei);
    if (!identifier) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const metrics = store.getMetricsByIdentifier(identifier.id)
      .slice(0, parseInt(periods, 10));

    res.json({
      success: true,
      data: {
        company: {
          lei: identifier.lei,
          name: identifier.company_name,
          country: identifier.country
        },
        metrics
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/metrics/company/:companyId
 * Get XBRL metrics linked to existing company
 */
router.get('/metrics/company/:companyId', (req, res) => {
  try {
    const { companyId } = req.params;

    const metrics = store.getMetricsByCompanyId(parseInt(companyId, 10));

    if (metrics.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No XBRL metrics found for this company'
      });
    }

    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/metrics/:lei/latest
 * Get latest metrics for a company
 */
router.get('/metrics/:lei/latest', (req, res) => {
  try {
    const { lei } = req.params;

    const identifier = store.getIdentifierByLEI(lei);
    if (!identifier) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const metrics = store.getLatestMetrics(identifier.id);

    if (!metrics) {
      return res.status(404).json({ success: false, error: 'No metrics found' });
    }

    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Sync Operations
// ========================================

/**
 * GET /api/xbrl/sync/status
 * Get current sync status and statistics
 */
router.get('/sync/status', (req, res) => {
  try {
    const status = syncService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/sync/country/:countryCode
 * Sync filings for a specific country
 */
router.post('/sync/country/:countryCode', async (req, res) => {
  try {
    const { countryCode } = req.params;

    // Run sync async and return immediately
    syncService.syncCountry(countryCode.toUpperCase())
      .then(result => console.log(`Sync completed for ${countryCode}:`, result))
      .catch(error => console.error(`Sync failed for ${countryCode}:`, error.message));

    res.json({
      success: true,
      message: `Sync started for ${countryCode}`,
      checkStatus: '/api/xbrl/sync/status'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/sync/lei/:lei
 * Sync filings for a specific company
 */
router.post('/sync/lei/:lei', async (req, res) => {
  try {
    const { lei } = req.params;
    const result = await syncService.syncByLEI(lei);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/sync/full
 * Run full sync for all countries
 */
router.post('/sync/full', async (req, res) => {
  try {
    // Run async
    syncService.runFullSync()
      .then(result => console.log('Full sync completed:', result.totals))
      .catch(error => console.error('Full sync failed:', error.message));

    res.json({
      success: true,
      message: 'Full sync started',
      checkStatus: '/api/xbrl/sync/status'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/sync/abort
 * Abort current sync
 */
router.post('/sync/abort', (req, res) => {
  try {
    syncService.abort();
    res.json({ success: true, message: 'Abort signal sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/sync/unparsed
 * Process unparsed filings
 */
router.post('/sync/unparsed', async (req, res) => {
  try {
    const { limit = 100 } = req.body;
    const result = await syncService.processUnparsedFilings(parseInt(limit, 10));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/sync/logs
 * Get recent sync logs
 */
router.get('/sync/logs', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const logs = store.getSyncLogs(parseInt(limit, 10));
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Bulk Import / Backfill
// ========================================

// Track running backfill instance
let runningImporter = null;

/**
 * GET /api/xbrl/backfill/status
 * Get current backfill status
 */
router.get('/backfill/status', (req, res) => {
  try {
    let importerStatus = null;
    if (runningImporter) {
      importerStatus = runningImporter.getStatus();
    }

    // Get recent sync logs for backfill type
    const recentLogs = database.prepare(`
      SELECT * FROM xbrl_sync_log
      WHERE sync_type = 'country_backfill'
      ORDER BY started_at DESC
      LIMIT 10
    `).all();

    // Get overall stats
    const stats = store.getStats();

    res.json({
      success: true,
      data: {
        importer: importerStatus,
        recentLogs,
        stats,
        targetCountries: EU_UK_COUNTRIES
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/start
 * Start bulk import for specified countries
 */
router.post('/backfill/start', async (req, res) => {
  try {
    const {
      countries = ['GB', 'DE', 'FR', 'NL', 'SE'],
      startYear = 2021,
      maxFilingsPerCountry = null
    } = req.body;

    // Check if already running
    if (runningImporter && runningImporter.getStatus().isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Backfill already in progress',
        status: runningImporter.getStatus()
      });
    }

    // Create new importer
    runningImporter = new XBRLBulkImporter(database, {
      startYear,
      batchSize: 100
    });

    // Start import in background
    const importPromise = runningImporter.importAllEuropeUK({
      countries,
      startYear,
      progressCallback: (progress) => {
        // Log significant progress
        if (progress.stats.processed % 100 === 0) {
          console.log(`[Backfill] ${progress.currentCountry}: ${progress.stats.processed} processed, ${progress.stats.parsed} parsed`);
        }
      }
    });

    // Don't await - return immediately
    importPromise
      .then(result => {
        console.log('[Backfill] Complete:', result.totals);
      })
      .catch(error => {
        console.error('[Backfill] Error:', error.message);
      });

    res.json({
      success: true,
      message: 'Backfill started',
      countries,
      startYear,
      checkStatus: '/api/xbrl/backfill/status'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/country/:countryCode
 * Start bulk import for a single country
 */
router.post('/backfill/country/:countryCode', async (req, res) => {
  try {
    const { countryCode } = req.params;
    const { startYear = 2021, maxFilings = null } = req.body;

    // Check if already running
    if (runningImporter && runningImporter.getStatus().isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Backfill already in progress',
        status: runningImporter.getStatus()
      });
    }

    // Create new importer
    runningImporter = new XBRLBulkImporter(database, { startYear });

    // Start import in background
    const importPromise = runningImporter.importCountry(countryCode.toUpperCase(), {
      startYear,
      maxFilings,
      progressCallback: (progress) => {
        if (progress.stats.processed % 50 === 0) {
          console.log(`[Backfill ${countryCode}] ${progress.stats.processed} processed, ${progress.stats.parsed} parsed`);
        }
      }
    });

    importPromise
      .then(result => {
        console.log(`[Backfill ${countryCode}] Complete:`, result);
      })
      .catch(error => {
        console.error(`[Backfill ${countryCode}] Error:`, error.message);
      });

    res.json({
      success: true,
      message: `Backfill started for ${countryCode}`,
      countryCode: countryCode.toUpperCase(),
      startYear,
      checkStatus: '/api/xbrl/backfill/status'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/pause
 * Pause current backfill
 */
router.post('/backfill/pause', (req, res) => {
  try {
    if (!runningImporter || !runningImporter.getStatus().isRunning) {
      return res.status(400).json({
        success: false,
        error: 'No backfill currently running'
      });
    }

    runningImporter.pause();
    res.json({
      success: true,
      message: 'Pause signal sent - backfill will stop after current batch'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/resume/:syncLogId
 * Resume an interrupted backfill
 */
router.post('/backfill/resume/:syncLogId', async (req, res) => {
  try {
    const { syncLogId } = req.params;

    // Check if already running
    if (runningImporter && runningImporter.getStatus().isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Backfill already in progress'
      });
    }

    // Create new importer
    runningImporter = new XBRLBulkImporter(database);

    // Start resume in background
    const resumePromise = runningImporter.resumeImport(parseInt(syncLogId, 10));

    resumePromise
      .then(result => {
        console.log('[Backfill Resume] Complete:', result);
      })
      .catch(error => {
        console.error('[Backfill Resume] Error:', error.message);
      });

    res.json({
      success: true,
      message: `Resuming backfill from sync log ${syncLogId}`,
      checkStatus: '/api/xbrl/backfill/status'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/link-identifiers
 * Link imported identifiers to companies table
 */
router.post('/backfill/link-identifiers', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    // Check if we have a symbol resolver
    const identifiers = require('../../services/identifiers');
    const services = identifiers.createServices(database);

    // Create importer with symbol resolver
    const importer = new XBRLBulkImporter(database, {
      symbolResolver: services.linker
    });

    const result = await importer.linkAllIdentifiers({ limit });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/xbrl/backfill/resolve-tickers
 * Batch resolve LEI identifiers to trading tickers via OpenFIGI
 * Runs in background for large batches
 */
let tickerResolutionRunning = false;
let tickerResolutionProgress = { processed: 0, resolved: 0, failed: 0, total: 0 };

router.post('/backfill/resolve-tickers', async (req, res) => {
  try {
    const { limit = 100, dryRun = false } = req.body;

    if (tickerResolutionRunning) {
      return res.status(409).json({
        success: false,
        error: 'Ticker resolution already running',
        progress: tickerResolutionProgress
      });
    }

    // Get identifiers needing resolution
    const pending = database.prepare(`
      SELECT COUNT(*) as count FROM company_identifiers
      WHERE ticker IS NULL OR yahoo_symbol IS NULL
    `).get();

    const toProcess = Math.min(pending.count, limit);

    if (toProcess === 0) {
      return res.json({
        success: true,
        message: 'All identifiers already have tickers resolved',
        stats: { total: 0, resolved: 0 }
      });
    }

    // Initialize services
    const identifiers = require('../../services/identifiers');
    const services = identifiers.createServices(database, {
      openFigiKey: process.env.OPENFIGI_API_KEY,
      cacheTtlDays: 30
    });

    // Start resolution in background
    tickerResolutionRunning = true;
    tickerResolutionProgress = { processed: 0, resolved: 0, failed: 0, total: toProcess };

    // Don't await - let it run in background
    (async () => {
      const pendingIdentifiers = database.prepare(`
        SELECT id, lei, legal_name, country, company_id
        FROM company_identifiers
        WHERE ticker IS NULL OR yahoo_symbol IS NULL
        ORDER BY id
        LIMIT ?
      `).all(toProcess);

      for (const identifier of pendingIdentifiers) {
        try {
          const resolution = await services.resolver.resolveFromLEI(identifier.lei);
          tickerResolutionProgress.processed++;

          if (resolution?.primaryListing?.ticker) {
            const listing = resolution.primaryListing;
            tickerResolutionProgress.resolved++;

            if (!dryRun) {
              database.prepare(`
                UPDATE company_identifiers
                SET ticker = ?, yahoo_symbol = ?, exchange = ?,
                    figi = ?, composite_figi = ?,
                    link_status = 'linked', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(
                listing.ticker, listing.yahooSymbol, listing.exchange,
                listing.figi || null, listing.compositeFigi || null,
                identifier.id
              );

              // Update companies table if using LEI as symbol
              if (identifier.company_id) {
                const company = database.prepare('SELECT symbol FROM companies WHERE id = ?').get(identifier.company_id);
                if (company?.symbol === identifier.lei) {
                  database.prepare('UPDATE companies SET symbol = ? WHERE id = ?').run(listing.ticker, identifier.company_id);
                }
              }
            }
          } else {
            if (!dryRun) {
              database.prepare(`
                UPDATE company_identifiers SET link_status = 'no_symbol', updated_at = CURRENT_TIMESTAMP WHERE id = ?
              `).run(identifier.id);
            }
          }

          // Rate limiting - 13s for anonymous, 500ms with API key
          const waitMs = process.env.OPENFIGI_API_KEY ? 500 : 13000;
          await new Promise(resolve => setTimeout(resolve, waitMs));

        } catch (error) {
          tickerResolutionProgress.failed++;
          console.error(`Ticker resolution error for ${identifier.lei}:`, error.message);
        }
      }

      tickerResolutionRunning = false;
      console.log('✅ Ticker resolution complete:', tickerResolutionProgress);
    })();

    res.json({
      success: true,
      message: `Started ticker resolution for ${toProcess} identifiers`,
      dryRun,
      estimatedTime: process.env.OPENFIGI_API_KEY
        ? `~${Math.ceil(toProcess * 0.5 / 60)} minutes`
        : `~${Math.ceil(toProcess * 13 / 60)} minutes`,
      checkProgress: '/api/xbrl/backfill/resolve-tickers/status'
    });
  } catch (error) {
    tickerResolutionRunning = false;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/backfill/resolve-tickers/status
 * Get ticker resolution progress
 */
router.get('/backfill/resolve-tickers/status', (req, res) => {
  const pending = database.prepare(`
    SELECT COUNT(*) as count FROM company_identifiers WHERE ticker IS NULL
  `).get();

  const resolved = database.prepare(`
    SELECT COUNT(*) as count FROM company_identifiers WHERE ticker IS NOT NULL
  `).get();

  res.json({
    success: true,
    running: tickerResolutionRunning,
    progress: tickerResolutionProgress,
    stats: {
      pendingResolution: pending.count,
      resolved: resolved.count
    }
  });
});

/**
 * GET /api/xbrl/backfill/countries
 * Get list of target countries for backfill
 */
router.get('/backfill/countries', (req, res) => {
  try {
    // Get current coverage stats per country
    const coverage = database.prepare(`
      SELECT country, COUNT(*) as filings, SUM(CASE WHEN parsed = 1 THEN 1 ELSE 0 END) as parsed
      FROM xbrl_filings
      GROUP BY country
      ORDER BY filings DESC
    `).all();

    const coverageMap = {};
    for (const row of coverage) {
      coverageMap[row.country] = { filings: row.filings, parsed: row.parsed };
    }

    const countriesWithStats = EU_UK_COUNTRIES.map(c => ({
      ...c,
      currentFilings: coverageMap[c.code]?.filings || 0,
      currentParsed: coverageMap[c.code]?.parsed || 0
    }));

    res.json({
      success: true,
      data: countriesWithStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Companies House (UK)
// ========================================

/**
 * GET /api/xbrl/uk/company/:companyNumber
 * Get UK company from Companies House
 */
router.get('/uk/company/:companyNumber', async (req, res) => {
  try {
    if (!companiesHouseClient) {
      companiesHouseClient = new CompaniesHouseClient();
    }

    const { companyNumber } = req.params;
    const company = await companiesHouseClient.getCompany(companyNumber);
    res.json({ success: true, data: company });
  } catch (error) {
    if (error.message.includes('API key')) {
      return res.status(503).json({
        success: false,
        error: 'Companies House API key not configured',
        setup: 'Get free key at: https://developer.company-information.service.gov.uk/'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/uk/search
 * Search UK companies
 */
router.get('/uk/search', async (req, res) => {
  try {
    if (!companiesHouseClient) {
      companiesHouseClient = new CompaniesHouseClient();
    }

    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
    }

    const result = await companiesHouseClient.searchCompanies(q, {
      itemsPerPage: parseInt(limit, 10)
    });

    res.json({ success: true, data: result.companies, meta: result.meta });
  } catch (error) {
    if (error.message.includes('API key')) {
      return res.status(503).json({
        success: false,
        error: 'Companies House API key not configured',
        setup: 'Get free key at: https://developer.company-information.service.gov.uk/'
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/uk/company/:companyNumber/filings
 * Get UK company filing history
 */
router.get('/uk/company/:companyNumber/filings', async (req, res) => {
  try {
    if (!companiesHouseClient) {
      companiesHouseClient = new CompaniesHouseClient();
    }

    const { companyNumber } = req.params;
    const { category, limit = 25 } = req.query;

    const result = await companiesHouseClient.getFilingHistory(companyNumber, {
      category,
      itemsPerPage: parseInt(limit, 10)
    });

    res.json({ success: true, data: result.filings, meta: result.meta });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/uk/company/:companyNumber/officers
 * Get UK company officers
 */
router.get('/uk/company/:companyNumber/officers', async (req, res) => {
  try {
    if (!companiesHouseClient) {
      companiesHouseClient = new CompaniesHouseClient();
    }

    const { companyNumber } = req.params;
    const result = await companiesHouseClient.getOfficers(companyNumber);

    res.json({ success: true, data: result.officers, meta: result.meta });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// Statistics & Info
// ========================================

/**
 * GET /api/xbrl/stats
 * Get XBRL data statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = store.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/xbrl/mappings
 * Get IFRS concept mappings
 */
router.get('/mappings', (req, res) => {
  try {
    const mappings = database.prepare(`
      SELECT * FROM ifrs_concept_mappings ORDER BY category, standard_field
    `).all();

    res.json({ success: true, data: mappings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
