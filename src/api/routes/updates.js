/**
 * Updates API Routes
 *
 * Endpoints for triggering and monitoring quarterly SEC data updates.
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// Lazy load dependencies to avoid circular imports
let db = null;
let updater = null;
let updateInProgress = false;

/**
 * Initialize the updater with database connection
 */
function initializeUpdater() {
  if (!db) {
    const database = require('../../database');
    db = database.getDatabase();
  }

  if (!updater) {
    // Run migration if needed
    try {
      const { checkMigrationStatus, runMigration } = require('../../database-migrations/add-update-tracking');
      const dbPath = path.join(__dirname, '../../..', 'data', 'stocks.db');

      const status = checkMigrationStatus(dbPath);
      if (!status.migrated) {
        console.log('Running update tracking migration...');
        runMigration(dbPath);
      }
    } catch (error) {
      console.log('Migration check skipped:', error.message);
    }

    const QuarterlyUpdater = require('../../services/quarterlyUpdater');
    updater = new QuarterlyUpdater(db);
  }

  return updater;
}

/**
 * GET /api/updates/status
 * Get current update status and data freshness summary
 */
router.get('/status', async (req, res) => {
  try {
    const upd = initializeUpdater();

    const summary = await upd.detector.getUpdateSummary();
    const currentStatus = await upd.getUpdateStatus();
    const availableQuarter = upd.getCurrentQuarter();

    res.json({
      updateInProgress,
      currentStatus,
      dataFreshness: summary,
      availableQuarter,
      nextQuarter: upd.getNextQuarter()
    });
  } catch (error) {
    console.error('Error getting update status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/run
 * Trigger quarterly update (called from frontend button)
 */
router.post('/run', async (req, res) => {
  try {
    const upd = initializeUpdater();

    if (updateInProgress) {
      return res.status(409).json({
        error: 'Update already in progress',
        status: upd.getUpdateStatus()
      });
    }

    const { quarter, forceFullUpdate = false } = req.body;
    const targetQuarter = quarter || upd.getCurrentQuarter();

    updateInProgress = true;

    // Return immediately, update runs in background
    res.json({
      message: 'Update started',
      quarter: targetQuarter,
      status: 'running'
    });

    // Run update in background
    upd.runQuarterlyUpdate({
      quarter: targetQuarter,
      forceFullUpdate,
      onProgress: (progress) => {
        upd.currentProgress = progress;
      }
    })
      .then(report => {
        console.log('Update completed:', report.status);
        updateInProgress = false;
      })
      .catch(error => {
        console.error('Update failed:', error);
        updateInProgress = false;
      });

  } catch (error) {
    updateInProgress = false;
    console.error('Error starting update:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/progress
 * Get real-time progress of running update (for polling)
 */
router.get('/progress', async (req, res) => {
  try {
    const upd = initializeUpdater();

    if (!updateInProgress) {
      return res.json({
        status: 'idle',
        lastUpdate: await upd.getLatestCompletedUpdate()
      });
    }

    res.json({
      status: 'running',
      progress: upd.currentProgress || { stage: 'starting', percent: 0, message: 'Initializing...' }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/history
 * Get history of past updates
 */
router.get('/history', async (req, res) => {
  try {
    const upd = initializeUpdater();
    const { limit = 10 } = req.query;
    const history = await upd.getUpdateHistory(parseInt(limit));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/check-available
 * Check if new SEC bulk file is available for download
 */
router.post('/check-available', async (req, res) => {
  try {
    const upd = initializeUpdater();
    const { quarter } = req.body;
    const targetQuarter = quarter || upd.getCurrentQuarter();

    const isAvailable = await upd.checkBulkFileAvailable(targetQuarter);
    const lastUpdate = upd.getLatestCompletedUpdate();

    res.json({
      quarter: targetQuarter,
      isAvailable,
      alreadyImported: lastUpdate?.quarter === targetQuarter && lastUpdate?.status === 'completed',
      lastUpdateDate: lastUpdate?.completed_at,
      lastUpdateQuarter: lastUpdate?.quarter
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/initialize-freshness
 * Initialize freshness tracking after bulk import
 */
router.post('/initialize-freshness', async (req, res) => {
  try {
    const upd = initializeUpdater();

    if (updateInProgress) {
      return res.status(409).json({
        error: 'Update already in progress',
        status: upd.getUpdateStatus()
      });
    }

    updateInProgress = true;

    res.json({
      message: 'Freshness initialization started',
      status: 'running'
    });

    upd.initializeFreshnessTracking((progress) => {
      upd.currentProgress = progress;
    })
      .then(result => {
        console.log('Freshness initialization complete:', result);
        updateInProgress = false;
      })
      .catch(error => {
        console.error('Freshness initialization failed:', error);
        updateInProgress = false;
      });

  } catch (error) {
    updateInProgress = false;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/quarters
 * Get list of available quarters based on current date
 */
router.get('/quarters', async (req, res) => {
  try {
    const upd = initializeUpdater();
    const currentQuarter = upd.getCurrentQuarter();
    const nextQuarter = upd.getNextQuarter();

    // Generate list of recent quarters
    const quarters = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    // Go back 2 years
    for (let year = currentYear - 2; year <= currentYear; year++) {
      for (let q = 1; q <= 4; q++) {
        const quarter = `${year}q${q}`;
        quarters.push({
          quarter,
          isCurrent: quarter === currentQuarter,
          isNext: quarter === nextQuarter
        });
      }
    }

    res.json({
      quarters: quarters.reverse(), // Most recent first
      currentQuarter,
      nextQuarter
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/company/:symbol/freshness
 * Get freshness details for a specific company
 */
router.get('/company/:symbol/freshness', async (req, res) => {
  try {
    const upd = initializeUpdater();
    const { symbol } = req.params;

    // Get company by symbol
    const company = await db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const freshness = upd.detector.getCompanyFreshness(company.id);

    if (!freshness) {
      return res.json({
        symbol,
        freshnessTracked: false,
        message: 'Freshness not tracked. Run freshness initialization.'
      });
    }

    res.json({
      symbol,
      freshnessTracked: true,
      ...freshness
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/updates/company/:symbol/check
 * Check a specific company for updates via SEC API
 */
router.post('/company/:symbol/check', async (req, res) => {
  try {
    const upd = initializeUpdater();
    const { symbol } = req.params;

    // Get company by symbol
    const company = db.prepare(`
      SELECT id, cik FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!company.cik) {
      return res.status(400).json({ error: 'Company does not have a CIK number' });
    }

    const result = await upd.detector.checkCompanyForUpdates(company.cik);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/updates/companies-needing-update
 * Get list of companies that need updates
 */
router.get('/companies-needing-update', (req, res) => {
  try {
    const upd = initializeUpdater();
    const { limit = 50, offset = 0 } = req.query;

    // Query companies that need update from freshness table
    const companies = db.prepare(`
      SELECT
        cdf.company_id,
        cdf.cik,
        cdf.symbol,
        cdf.latest_filing_date,
        cdf.latest_10k_date,
        cdf.latest_10q_date,
        cdf.latest_10k_period,
        cdf.latest_10q_period,
        cdf.needs_update,
        cdf.pending_filings,
        cdf.last_checked_at,
        c.name as company_name
      FROM company_data_freshness cdf
      LEFT JOIN companies c ON c.id = cdf.company_id
      WHERE cdf.needs_update = 1
      ORDER BY cdf.last_checked_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset));

    // Get total count
    const totalResult = db.prepare(`
      SELECT COUNT(*) as count FROM company_data_freshness WHERE needs_update = 1
    `).get();

    // Parse pending filings JSON
    const companiesWithParsedFilings = companies.map(c => ({
      ...c,
      pendingFilings: c.pending_filings ? JSON.parse(c.pending_filings) : []
    }));

    res.json({
      companies: companiesWithParsedFilings,
      total: totalResult.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error getting companies needing update:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/updates/cancel
 * Cancel running update (not fully implemented - updates run to completion)
 */
router.delete('/cancel', (req, res) => {
  if (!updateInProgress) {
    return res.json({ message: 'No update in progress' });
  }

  // Note: Full cancellation would require more complex implementation
  // For now, just mark as not in progress (update will complete in background)
  res.json({
    message: 'Cancellation requested. Update will stop at next checkpoint.',
    note: 'Full cancellation not implemented - update may complete in background'
  });
});

module.exports = router;
