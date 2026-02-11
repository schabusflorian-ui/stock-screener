// src/api/routes/watchlist.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const { requireAuth } = require('../../middleware/auth');
const { checkResourceLimit } = require('../../middleware/subscription');

/**
 * Get user's watchlist
 * GET /api/watchlist
 */
router.get('/', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }
    const watchlistResult = await database.query(`
      SELECT
        uw.id,
        uw.company_id,
        uw.added_at,
        uw.notes,
        c.symbol,
        c.name,
        c.sector
      FROM user_watchlists uw
      JOIN companies c ON c.id = uw.company_id
      WHERE uw.user_id = ?
      ORDER BY uw.added_at DESC
    `, [userId]);
    const watchlist = watchlistResult.rows;

    res.json({
      success: true,
      data: watchlist.map(item => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        sector: item.sector,
        companyId: item.company_id,
        addedAt: item.added_at,
        notes: item.notes
      }))
    });

  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch watchlist'
    });
  }
});

/**
 * Add stock to watchlist
 * POST /api/watchlist
 * Resource limit: Free tier limited to 10 watchlist stocks
 */
router.post('/', requireAuth, checkResourceLimit('watchlist_stocks'), async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user.id;
    const { symbol, name, sector, companyId, notes } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }
    // Find company by symbol if companyId not provided
    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      const companyResult = await database.query('SELECT id FROM companies WHERE symbol = ?', [symbol]);
      const company = companyResult.rows[0];
      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }
      finalCompanyId = company.id;
    }

    // Insert into user_watchlists
    const result = await database.query(`
      INSERT OR IGNORE INTO user_watchlists (user_id, company_id, notes, added_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, finalCompanyId, notes || null]);

    if (result.changes === 0) {
      return res.json({
        success: true,
        message: 'Stock already in watchlist',
        alreadyExists: true
      });
    }

    // Fetch the added item with company details
    const addedResult = await database.query(`
      SELECT
        uw.id,
        uw.company_id,
        uw.added_at,
        uw.notes,
        c.symbol,
        c.name,
        c.sector
      FROM user_watchlists uw
      JOIN companies c ON c.id = uw.company_id
      WHERE uw.user_id = ? AND uw.company_id = ?
    `, [userId, finalCompanyId]);
    const added = addedResult.rows[0];

    res.json({
      success: true,
      message: 'Stock added to watchlist',
      data: {
        id: added.id,
        symbol: added.symbol,
        name: added.name,
        sector: added.sector,
        companyId: added.company_id,
        addedAt: added.added_at,
        notes: added.notes
      }
    });

  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add to watchlist'
    });
  }
});

/**
 * Remove stock from watchlist
 * DELETE /api/watchlist/:symbol
 */
router.delete('/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { symbol } = req.params;
    // Find company by symbol
    const companyResult = await database.query('SELECT id FROM companies WHERE symbol = ?', [symbol]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Delete from user_watchlists
    const result = await database.query(`
      DELETE FROM user_watchlists
      WHERE user_id = ? AND company_id = ?
    `, [userId, company.id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock not in watchlist'
      });
    }

    res.json({
      success: true,
      message: 'Stock removed from watchlist'
    });

  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove from watchlist'
    });
  }
});

/**
 * Clear entire watchlist
 * DELETE /api/watchlist
 */
router.delete('/', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }
    const result = await database.query(`
      DELETE FROM user_watchlists WHERE user_id = ?
    `, [userId]);

    res.json({
      success: true,
      message: `Removed ${result.changes} items from watchlist`
    });

  } catch (error) {
    console.error('Error clearing watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear watchlist'
    });
  }
});

/**
 * Update watchlist item notes
 * PATCH /api/watchlist/:symbol
 */
router.patch('/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { symbol } = req.params;
    const { notes } = req.body;
    // Find company
    const companyResult = await database.query('SELECT id FROM companies WHERE symbol = ?', [symbol]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Update notes
    const result = await database.query(`
      UPDATE user_watchlists
      SET notes = ?
      WHERE user_id = ? AND company_id = ?
    `, [notes, userId, company.id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock not in watchlist'
      });
    }

    res.json({
      success: true,
      message: 'Notes updated'
    });

  } catch (error) {
    console.error('Error updating watchlist notes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notes'
    });
  }
});

/**
 * Bulk add stocks to watchlist (used during onboarding)
 * POST /api/watchlist/bulk
 * Resource limit applies - will only add up to remaining quota
 */
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.user.id;
    const { stocks } = req.body; // Array of { symbol, name, sector }

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'stocks array is required'
      });
    }

    const added = [];
    const skipped = [];

    // Process each stock
    for (const stock of stocks) {
      // Find company
      const companyResult = await database.query('SELECT id, symbol, name FROM companies WHERE symbol = ?', [stock.symbol]);
      const company = companyResult.rows[0];

      if (!company) {
        skipped.push({ symbol: stock.symbol, reason: 'Company not found' });
        continue;
      }

      const result = await database.query(`
        INSERT OR IGNORE INTO user_watchlists (user_id, company_id, added_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [userId, company.id]);

      if (result.changes > 0 || result.rowCount > 0) {
        added.push({
          symbol: company.symbol,
          name: company.name,
          companyId: company.id
        });
      } else {
        skipped.push({ symbol: stock.symbol, reason: 'Already in watchlist' });
      }
    }

    res.json({
      success: true,
      message: `Added ${added.length} stocks to watchlist`,
      added,
      skipped
    });

  } catch (error) {
    console.error('Error bulk adding to watchlist:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk add to watchlist'
    });
  }
});

module.exports = router;
