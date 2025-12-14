// src/api/routes/ipo.js
// API endpoints for IPO tracking

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { IPOTracker, IPO_STAGES, IPO_FORM_TYPES } = require('../../services/ipoTracker');

// Initialize IPO tracker
const database = db.getDatabase();
const ipoTracker = new IPOTracker(database, 'Stock Analyzer contact@example.com');

// ============================================
// PIPELINE ENDPOINTS
// ============================================

/**
 * GET /api/ipo/pipeline
 * Get all active IPOs in the pipeline
 * Query params: status, sector, sortBy, sortOrder, limit
 */
router.get('/pipeline', (req, res) => {
  try {
    const { status, sector, sortBy, sortOrder, limit } = req.query;

    const pipeline = ipoTracker.getPipeline({
      status,
      sector,
      sortBy: sortBy || 'initial_s1_date',
      sortOrder: sortOrder || 'DESC',
      limit: limit ? parseInt(limit) : null
    });

    res.json({
      count: pipeline.length,
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
 */
router.get('/by-stage', (req, res) => {
  try {
    const byStage = ipoTracker.getByStage();

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
router.get('/upcoming', (req, res) => {
  try {
    const upcoming = ipoTracker.getExpectedSoon();
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
router.get('/recent', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const recent = ipoTracker.getRecentlyCompleted(parseInt(limit));

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
 */
router.get('/statistics', (req, res) => {
  try {
    const stats = ipoTracker.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ipo/sectors
 * Get sector breakdown
 */
router.get('/sectors', (req, res) => {
  try {
    const sectors = ipoTracker.getSectorBreakdown();
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
router.get('/stages', (req, res) => {
  res.json(IPO_STAGES);
});

/**
 * GET /api/ipo/form-types
 * Get IPO-related form types
 */
router.get('/form-types', (req, res) => {
  res.json(IPO_FORM_TYPES);
});

// ============================================
// SEARCH ENDPOINT
// ============================================

/**
 * GET /api/ipo/search
 * Search IPOs by name, ticker, industry
 * Query params: q (required)
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const results = ipoTracker.searchIPOs(q);

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
router.get('/watchlist', (req, res) => {
  try {
    const watchlist = ipoTracker.getWatchlist();

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
router.post('/:id/watchlist', (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { notes } = req.body;

    // Verify IPO exists
    const ipo = ipoTracker.getIPO(ipoId);
    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found' });
    }

    ipoTracker.addToWatchlist(ipoId, notes);

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
router.put('/:id/watchlist', (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const { notes } = req.body;

    if (!ipoTracker.isInWatchlist(ipoId)) {
      return res.status(404).json({ error: 'IPO not in watchlist' });
    }

    ipoTracker.updateWatchlistNotes(ipoId, notes);

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
router.delete('/:id/watchlist', (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);

    ipoTracker.removeFromWatchlist(ipoId);

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
    const results = await ipoTracker.checkForNewFilings();

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
router.get('/check-history', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const history = ipoTracker.getCheckHistory(parseInt(limit));

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
router.get('/:id', (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const ipo = ipoTracker.getIPOWithFilings(ipoId);

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

    const ipo = await ipoTracker.markAsTrading(ipoId, tradingDate, ticker);

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

    const ipo = await ipoTracker.markAsWithdrawn(ipoId, withdrawnDate, reason);

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
router.put('/:id', (req, res) => {
  try {
    const ipoId = parseInt(req.params.id);
    const updates = req.body;

    // Verify IPO exists
    const existing = ipoTracker.getIPO(ipoId);
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

    ipoTracker.updateIPO(ipoId, filteredUpdates);

    res.json({
      success: true,
      message: 'IPO updated',
      data: ipoTracker.getIPO(ipoId)
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
router.post('/manual', (req, res) => {
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
    const existing = ipoTracker.getIPOByCIK(cik);
    if (existing) {
      return res.status(409).json({
        error: 'IPO with this CIK already exists',
        existing: existing
      });
    }

    const ipo = ipoTracker.createIPO({
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
router.get('/cik/:cik', (req, res) => {
  try {
    const { cik } = req.params;
    const ipo = ipoTracker.getIPOByCIK(cik);

    if (!ipo) {
      return res.status(404).json({ error: 'IPO not found for this CIK' });
    }

    // Get full details with filings
    const fullIPO = ipoTracker.getIPOWithFilings(ipo.id);
    fullIPO.stageInfo = IPO_STAGES[fullIPO.status];

    res.json(fullIPO);
  } catch (error) {
    console.error('Error fetching IPO by CIK:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
