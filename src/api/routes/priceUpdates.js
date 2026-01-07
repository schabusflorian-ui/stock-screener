/**
 * Price Updates API Routes
 * Endpoints for managing stock price update system
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const PriceUpdateService = require('../../services/priceUpdateService');

// Initialize service
let updateService;
try {
  updateService = new PriceUpdateService(db.getDatabase());
} catch (error) {
  console.error('Failed to initialize PriceUpdateService:', error.message);
}

/**
 * GET /api/price-updates/stats
 * Get update freshness statistics
 */
router.get('/stats', (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }
    const stats = updateService.getUpdateStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/price-updates/schedule
 * Get today's update schedule
 */
router.get('/schedule', (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }
    const schedule = updateService.getTodaysSchedule();
    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error getting schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/price-updates/stale
 * Get companies that are overdue for updates
 */
router.get('/stale', (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }
    const limit = parseInt(req.query.limit) || 100;
    const stale = updateService.getStaleCompanies(limit);
    res.json({ success: true, data: stale });
  } catch (error) {
    console.error('Error getting stale companies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/price-updates/run
 * Trigger daily update (runs in background)
 */
router.post('/run', (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }

    // Start update in background - returns immediately
    const result = updateService.runDailyUpdateBackground();

    res.json({
      success: true,
      message: 'Price update started in background',
      pid: result.pid,
      checkStatus: '/api/price-updates/stats'
    });
  } catch (error) {
    console.error('Error starting update:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/price-updates/dry-run
 * See what would be updated without making changes
 */
router.post('/dry-run', async (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }

    const result = await updateService.runDryRun();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error running dry-run:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/price-updates/backfill
 * Run backfill for stale companies
 */
router.post('/backfill', async (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }

    // Start backfill in background
    updateService.runBackfill()
      .then(result => console.log('Backfill completed:', result))
      .catch(err => console.error('Backfill failed:', err));

    res.json({
      success: true,
      message: 'Backfill started in background'
    });
  } catch (error) {
    console.error('Error starting backfill:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/price-updates/recalculate-tiers
 * Recalculate company tier assignments
 */
router.post('/recalculate-tiers', async (req, res) => {
  try {
    if (!updateService) {
      return res.status(500).json({ success: false, error: 'Service not initialized' });
    }

    const result = await updateService.recalculateTiers();
    res.json({ success: true, message: 'Tiers recalculated', data: result });
  } catch (error) {
    console.error('Error recalculating tiers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
