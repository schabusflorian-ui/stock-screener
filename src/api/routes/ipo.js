// src/api/routes/ipo.js
// API endpoints for IPO tracking

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const { IPOTracker, IPO_STAGES, IPO_FORM_TYPES, IPO_REGIONS } = require('../../services/ipoTracker');

// Lazy async initialization to avoid sync database access
let ipoTracker = null;
let ipoTrackerPromise = null;

async function getIPOTracker() {
  if (ipoTracker) return ipoTracker;
  if (ipoTrackerPromise) return ipoTrackerPromise;

  ipoTrackerPromise = (async () => {
    try {
      const database = await getDatabaseAsync();
      ipoTracker = new IPOTracker(database, 'Stock Analyzer contact@example.com');
      return ipoTracker;
    } catch (error) {
      console.error('Failed to initialize IPOTracker:', error.message);
      ipoTrackerPromise = null;
      throw error;
    }
  })();

  return ipoTrackerPromise;
}

// ============================================
// PIPELINE ENDPOINTS
// ============================================

/**
 * GET /api/ipo/pipeline
 * Get all active IPOs in the pipeline
 * Query params: region (US|EU|UK|all), status, sector, sortBy, sortOrder, limit
 */
router.get('/pipeline', async (req, res) => {
  try {
    const { region, status, sector, sortBy, sortOrder, limit } = req.query;

    const tracker = await getIPOTracker();
    const pipeline = await tracker.getPipeline({
      region: region || 'all',
      status,
      sector,
      sortBy: sortBy || 'initial_s1_date',
      sortOrder: sortOrder || 'DESC',
      limit: limit ? parseInt(limit) : null
    });

    res.json({
      count: pipeline.length,
      region: region || 'all',
      data: pipeline
    });
  } catch (error) {
    console.error('Error fetching pipeline:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/by-stage
 * Get IPOs grouped by lifecycle stage
 * Query params: region (US|EU|UK|all)
 */
router.get('/by-stage', async (req, res) => {
  try {
    const { region } = req.query;
    const tracker = await getIPOTracker();
    const byStage = await tracker.getByStage(region || 'all');

    // Add stage metadata
    const result = {};
    for (const [status, ipos] of Object.entries(byStage)) {
      result[status] = {
        stage: IPO_STAGES[status],
        count: ipos.length,
        ipos
      };
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching by stage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/upcoming
 * Get IPOs expected to trade soon (have price range, effective, or priced)
 */
router.get('/upcoming', async (req, res) => {
  try {
    const tracker = await getIPOTracker();
    const upcoming = await tracker.getExpectedSoon();
    res.json({
      count: upcoming.length,
      data: upcoming
    });
  } catch (error) {
    console.error('Error fetching upcoming:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/recent
 * Get recently completed IPOs
 * Query params: limit (default 20)
 */
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const tracker = await getIPOTracker();
    const recent = await tracker.getRecentlyCompleted(parseInt(limit));

    res.json({
      count: recent.length,
      data: recent
    });
  } catch (error) {
    console.error('Error fetching recent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/statistics
 * Get pipeline statistics
 * Query params: region (US|EU|UK|all)
 */
router.get('/statistics', async (req, res) => {
  try {
    const { region } = req.query;
    const tracker = await getIPOTracker();
    const stats = await tracker.getStatistics({ region: region || 'all' });
    res.json({
      region: region || 'all',
      ...stats
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/sectors
 * Get sector breakdown
 */
router.get('/sectors', async (req, res) => {
  try {
    const tracker = await getIPOTracker();
    const sectors = await tracker.getSectorBreakdown();
    res.json({
      count: sectors.length,
      data: sectors
    });
  } catch (error) {
    console.error('Error fetching sectors:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/stages
 * Get stage definitions
 */
router.get('/stages', async (req, res) => {
  res.json(IPO_STAGES);
});

/**
 * GET /api/ipo/form-types
 * Get IPO-related form types
 */
router.get('/form-types', async (req, res) => {
  res.json(IPO_FORM_TYPES);
});

/**
 * GET /api/ipo/regions
 * Get available regions for IPO tracking
 */
router.get('/regions', async (req, res) => {
  res.json(IPO_REGIONS);
});

// ============================================
// EU/UK IPO ENDPOINTS
// ============================================

/**
 * POST /api/ipo/check-eu
 * Trigger check for new EU/UK prospectus filings
 */
router.post('/check-eu', async (req, res) => {
  try {
    const { days = 30 } = req.body;

    console.log('API: Starting EU/UK IPO check...');
    const tracker = await getIPOTracker();
    const results = await tracker.checkForEUFilings({ days });

    res.json({
      success: true,
      region: 'EU/UK',
      newIPOs: results.newIPOs,
      fetched: results.updates,
      skipped: results.skipped,
      errors: results.errors,
      duration: results.duration,
      sources: results.sources,
    });
  } catch (error) {
    console.error('Error checking EU/UK filings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/check-esma
 * Trigger check for new ESMA (EU) prospectus filings only
 */
router.post('/check-esma', async (req, res) => {
  try {
    const { days = 30, country = null, ipoOnly = true } = req.body;

    console.log('API: Starting ESMA prospectus check...');
    const results = await getIPOTracker().checkForESMAFilings({ days, country, ipoOnly });

    res.json({
      success: true,
      source: 'ESMA',
      region: 'EU',
      fetched: results.fetched,
      created: results.created,
      skipped: results.skipped,
      error: results.error,
    });
  } catch (error) {
    console.error('Error checking ESMA filings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/check-fca
 * Trigger check for new FCA NSM (UK) prospectus filings only
 */
router.post('/check-fca', async (req, res) => {
  try {
    const { days = 30, ipoOnly = true } = req.body;

    console.log('API: Starting FCA NSM prospectus check...');
    const results = await getIPOTracker().checkForFCAFilings({ days, ipoOnly });

    res.json({
      success: true,
      source: 'FCA',
      region: 'UK',
      fetched: results.fetched,
      created: results.created,
      skipped: results.skipped,
      error: results.error,
    });
  } catch (error) {
    console.error('Error checking FCA filings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/lei/:lei
 * Get IPO by LEI (Legal Entity Identifier) - EU/UK companies
 */
router.get('/lei/:lei', async (req, res) => {
  try {
    const { lei } = req.params;

    // Validate LEI format (20 characters, alphanumeric)
    if (!lei || !/^[A-Z0-9]{20}$/.test(lei)) {
      return res.status(400).json({ error: 'Invalid LEI format. LEI must be 20 alphanumeric characters.' });
    }

    const ipo = getIPOTracker().getIPOByLEI(lei);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found for this LEI' });
    }

    // Get full details with filings
    const fullIPO = getIPOTracker().getIPOWithFilings(ipo.id);
    fullIPO.stageInfo = IPO_STAGES[fullIPO.status];

    res.json(fullIPO);
  } catch (error) {
    console.error('Error fetching IPO by LEI:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/isin/:isin
 * Get IPO by ISIN
 */
router.get('/isin/:isin', async (req, res) => {
  try {
    const { isin } = req.params;

    // Basic ISIN validation (12 characters)
    if (!isin || isin.length !== 12) {
      return res.status(400).json({ error: 'Invalid ISIN format. ISIN must be 12 characters.' });
    }

    const ipo = getIPOTracker().getIPOByISIN(isin);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found for this ISIN' });
    }

    // Get full details with filings
    const fullIPO = getIPOTracker().getIPOWithFilings(ipo.id);
    fullIPO.stageInfo = IPO_STAGES[fullIPO.status];

    res.json(fullIPO);
  } catch (error) {
    console.error('Error fetching IPO by ISIN:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/eu
 * Manually add an EU/UK IPO
 */
router.post('/eu', async (req, res) => {
  try {
    const {
      company_name, lei, isin, region = 'EU', regulator,
      prospectus_id, prospectus_url, home_member_state,
      approval_date, listing_venue, sector, industry, status = 'EFFECTIVE'
    } = req.body;

    if (!company_name) {
      return res.status(400).json({
        error: 'company_name is required'
      });
    }

    // Validate region
    if (!['EU', 'UK'].includes(region.toUpperCase())) {
      return res.status(400).json({
        error: 'region must be EU or UK'
      });
    }

    // Check if LEI already exists
    if (lei) {
      const existingByLEI = getIPOTracker().getIPOByLEI(lei);
      if (existingByLEI) {
        return res.status(409).json({
          error: 'IPO with this LEI already exists',
          existing: existingByLEI
        });
      }
    }

    const ipo = getIPOTracker().createEUIPO({
      company_name,
      lei,
      isin,
      region: region.toUpperCase(),
      regulator: regulator || (region.toUpperCase() === 'UK' ? 'FCA' : 'ESMA'),
      prospectus_id,
      prospectus_url,
      home_member_state,
      approval_date,
      listing_venue,
      sector,
      industry,
      status
    });

    res.status(201).json({
      success: true,
      message: 'EU/UK IPO created',
      data: ipo
    });
  } catch (error) {
    console.error('Error creating EU/UK IPO:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SEARCH ENDPOINT
// ============================================

/**
 * GET /api/ipo/search
 * Search IPOs by name, ticker, industry
 * Query params: q (required)
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const results = getIPOTracker().searchIPOs(q);

    res.json({
      query: q,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('Error searching IPOs:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WATCHLIST ENDPOINTS
// ============================================

/**
 * GET /api/ipo/watchlist
 * Get user's IPO watchlist
 */
router.get('/watchlist', async (req, res) => {
  try {
    const watchlist = getIPOTracker().getWatchlist();

    res.json({
      count: watchlist.length,
      data: watchlist
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/:id/watchlist
 * Add IPO to watchlist
 */
router.post('/:id/watchlist', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { notes } = req.body;

    // Verify IPO exists
    const ipo = getIPOTracker().getIPO(ipoId);
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }

    getIPOTracker().addToWatchlist(ipoId, notes);

    res.json({
      success: true,
      message: `${ipo.company_name} added to watchlist`
    });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ipo/:id/watchlist
 * Update watchlist notes
 */
router.put('/:id/watchlist', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { notes } = req.body;

    if (!getIPOTracker().isInWatchlist(ipoId)) {
      return res.status(404).json({ error: 'IPO not in watchlist' });
    }

    getIPOTracker().updateWatchlistNotes(ipoId, notes);

    res.json({
      success: true,
      message: 'Watchlist notes updated'
    });
  } catch (error) {
    console.error('Error updating watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/ipo/:id/watchlist
 * Remove IPO from watchlist
 */
router.delete('/:id/watchlist', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);

    getIPOTracker().removeFromWatchlist(ipoId);

    res.json({
      success: true,
      message: 'Removed from watchlist'
    });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHECK/SYNC ENDPOINTS
// ============================================

/**
 * POST /api/ipo/check
 * Trigger check for new SEC filings
 */
router.post('/check', async (req, res) => {
  try {
    console.log('API: Starting IPO check...');
    const results = await getIPOTracker().checkForNewFilings();

    res.json({
      success: true,
      newIPOs: results.newIPOs.length,
      updates: results.updates.length,
      errors: results.errors,
      data: {
        newIPOs: results.newIPOs,
        updates: results.updates
      }
    });
  } catch (error) {
    console.error('Error checking for filings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/check-history
 * Get history of filing checks
 */
router.get('/check-history', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const history = getIPOTracker().getCheckHistory(parseInt(limit));

    res.json({
      count: history.length,
      data: history
    });
  } catch (error) {
    console.error('Error fetching check history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SINGLE IPO ENDPOINTS
// ============================================

/**
 * GET /api/ipo/:id
 * Get single IPO with all filings
 */
router.get('/:id', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const ipo = getIPOTracker().getIPOWithFilings(ipoId);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }

    // Add stage info
    ipo.stageInfo = IPO_STAGES[ipo.status];

    res.json(ipo);
  } catch (error) {
    console.error('Error fetching IPO:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/:id/mark-trading
 * Mark IPO as trading (manual trigger)
 */
router.post('/:id/mark-trading', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { tradingDate, ticker } = req.body;

    if (!tradingDate) {
      return res.status(400).json({ error: 'tradingDate is required' });
    }

    const ipo = await getIPOTracker().markAsTrading(ipoId, tradingDate, ticker);

    res.json({
      success: true,
      message: `${ipo.company_name} marked as trading`,
      data: ipo
    });
  } catch (error) {
    console.error('Error marking as trading:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/:id/create-company
 * Create a company entry for a trading IPO
 */
router.post('/:id/create-company', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const ipo = getIPOTracker().getIPO(ipoId);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }

    if (ipo.status !== 'TRADING') {
      return res.status(400).json({ error: 'IPO is not in TRADING status' });
    }

    const ticker = ipo.ticker_final || ipo.ticker_proposed;
    if (!ticker) {
      return res.status(400).json({ error: 'IPO has no ticker symbol' });
    }

    // Check if company already exists
    const existingCompany = database.prepare(`
      SELECT id, symbol FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(ticker);

    if (existingCompany) {
      // Link IPO to existing company
      getIPOTracker().updateIPO(ipoId, { company_id: existingCompany.id });
      return res.json({
        success: true,
        message: `Linked to existing company ${ticker}`,
        company_id: existingCompany.id,
        created: false
      });
    }

    // Create new company
    const exchange = ipo.exchange_final || ipo.exchange_proposed || ipo.listing_venue;
    const country = ipo.headquarters_country || (ipo.region === 'US' ? 'US' : ipo.home_member_state) || 'US';

    const result = database.prepare(`
      INSERT INTO companies (
        symbol, name, sector, industry, exchange, country, is_active, cik
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      ticker,
      ipo.company_name,
      ipo.sector,
      ipo.industry,
      exchange,
      country,
      ipo.cik
    );

    const companyId = result.lastInsertRowid;
    getIPOTracker().updateIPO(ipoId, { company_id: companyId });

    res.json({
      success: true,
      message: `Created company ${ticker}`,
      company_id: companyId,
      created: true
    });
  } catch (error) {
    console.error('Error creating company from IPO:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/sync-trading-companies
 * Create company entries for all trading IPOs that don't have them
 * Handles both US (ticker-based) and EU/UK (ISIN-based) IPOs
 */
router.post('/sync-trading-companies', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Get all trading IPOs without company_id (include ISIN for EU/UK)
    const tradingIPOs = database.prepare(`
      SELECT * FROM ipo_tracker
      WHERE status = 'TRADING'
        AND (company_id IS NULL OR company_id = 0)
        AND (ticker_final IS NOT NULL OR ticker_proposed IS NOT NULL OR isin IS NOT NULL)
    `).all();

    const results = {
      processed: 0,
      created: 0,
      linked: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (const ipo of tradingIPOs) {
      results.processed++;

      // Determine ticker - try multiple approaches for EU/UK IPOs
      let ticker = ipo.ticker_final || ipo.ticker_proposed;

      if (!ticker && ipo.isin) {
        // Use ISIN prefix as temporary identifier
        ticker = ipo.isin.substring(0, 6);
      }

      if (!ticker && ipo.company_name) {
        // Generate ticker from company name
        ticker = ipo.company_name.replace(/[^A-Za-z]/g, '').substring(0, 5).toUpperCase();
      }

      if (!ticker) {
        results.skipped++;
        continue;
      }

      try {
    const database = await getDatabaseAsync();
        // Check if company already exists by ticker
        let existingCompany = database.prepare(`
          SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
        `).get(ticker);

        // Also check by ISIN for EU/UK IPOs
        if (!existingCompany && ipo.isin) {
          existingCompany = database.prepare(`
            SELECT id FROM companies WHERE isin = ? 
          `).get(ipo.isin);
        }

        if (existingCompany) {
          // Link to existing
          getIPOTracker().updateIPO(ipo.id, { company_id: existingCompany.id });
          results.linked++;
        } else {
          // Create new company
          const exchange = ipo.exchange_final || ipo.exchange_proposed || ipo.listing_venue || 'UNKNOWN';
          const country = ipo.headquarters_country ||
            (ipo.region === 'US' ? 'US' : null) ||
            ipo.home_member_state ||
            (ipo.isin ? ipo.isin.substring(0, 2) : 'XX');

          const insertResult = database.prepare(`
            INSERT INTO companies (
              symbol, name, sector, industry, exchange, country, is_active, cik, isin
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).run(
            ticker,
            ipo.company_name,
            ipo.sector || null,
            ipo.industry || null,
            exchange,
            country,
            ipo.cik || null,
            ipo.isin || null
          );

          getIPOTracker().updateIPO(ipo.id, { company_id: insertResult.lastInsertRowid });
          results.created++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${ipo.company_name} (${ticker}): ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Synced ${results.processed} trading IPOs`,
      ...results
    });
  } catch (error) {
    console.error('Error syncing trading companies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ipo/:id/mark-withdrawn
 * Mark IPO as withdrawn
 */
router.post('/:id/mark-withdrawn', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { withdrawnDate, reason } = req.body;

    if (!withdrawnDate) {
      return res.status(400).json({ error: 'withdrawnDate is required' });
    }

    const ipo = await getIPOTracker().markAsWithdrawn(ipoId, withdrawnDate, reason);

    res.json({
      success: true,
      message: `${ipo.company_name} marked as withdrawn`,
      data: ipo
    });
  } catch (error) {
    console.error('Error marking as withdrawn:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/ipo/:id
 * Update IPO details (manual correction)
 */
router.put('/:id', async (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const updates = req.body;

    // Verify IPO exists
    const existing = getIPOTracker().getIPO(ipoId);
    if (!existing) {
      return res.status(404).json({ error: 'IPO not found' });
    }

    // Filter allowed fields
    const allowedFields = [
      'company_name', 'ticker_proposed', 'ticker_final',
      'exchange_proposed', 'exchange_final', 'industry', 'sector',
      'business_description', 'headquarters_state', 'headquarters_country',
      'price_range_low', 'price_range_high', 'final_price',
      'shares_offered', 'deal_size', 'lead_underwriters', 'all_underwriters',
      'revenue_latest', 'net_income_latest', 'total_assets',
      'employee_count', 'founded_year', 'website'
    ];

    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    filteredUpdates.updated_at = new Date().toISOString();

    getIPOTracker().updateIPO(ipoId, filteredUpdates);

    res.json({
      success: true,
      message: 'IPO updated',
      data: getIPOTracker().getIPO(ipoId)
    });
  } catch (error) {
    console.error('Error updating IPO:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK/ADMIN ENDPOINTS
// ============================================

/**
 * POST /api/ipo/manual
 * Manually add an IPO (for testing or backfill)
 */
router.post('/manual', async (req, res) => {
  try {
    const {
      cik, company_name, ticker_proposed, initial_s1_date,
      exchange_proposed, industry, sector, status = 'S1_FILED'
    } = req.body;

    if (!cik || !company_name || !initial_s1_date) {
      return res.status(400).json({
        error: 'cik, company_name, and initial_s1_date are required'
      });
    }

    // Check if CIK already exists
    const existing = getIPOTracker().getIPOByCIK(cik);
    if (existing) {
      return res.status(409).json({
        error: 'IPO with this CIK already exists',
        existing: existing
      });
    }

    const ipo = getIPOTracker().createIPO({
      cik,
      company_name,
      ticker_proposed,
      initial_s1_date,
      exchange_proposed,
      industry,
      sector,
      status
    });

    res.status(201).json({
      success: true,
      message: 'IPO created',
      data: ipo
    });
  } catch (error) {
    console.error('Error creating IPO:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/cik/:cik
 * Get IPO by CIK
 */
router.get('/cik/:cik', async (req, res) => {
  try {
    const { cik } = req.params;
    const ipo = getIPOTracker().getIPOByCIK(cik);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found for this CIK' });
    }

    // Get full details with filings
    const fullIPO = getIPOTracker().getIPOWithFilings(ipo.id);
    fullIPO.stageInfo = IPO_STAGES[fullIPO.status];

    res.json(fullIPO);
  } catch (error) {
    console.error('Error fetching IPO by CIK:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
