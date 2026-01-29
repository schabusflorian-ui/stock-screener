/**
 * GDPR Compliance API Routes
 * Handles data export, deletion, and privacy requests
 */

const express = require('express');
const router = express.Router();
const db = require('../../lib/db');

/**
 * Middleware to check if user is authenticated
 */
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.userId = req.session.userId;
  next();
};

/**
 * GET /api/gdpr/export
 * Export all user data in portable JSON format
 */
router.get('/export', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    console.log(`[GDPR] Data export requested by user ${userId}`);

    const userData = await collectUserData(userId);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="my-data-${Date.now()}.json"`);
    res.setHeader('Content-Description', 'User Data Export');

    res.json(userData);

    console.log(`[GDPR] Data export completed for user ${userId}`);
  } catch (error) {
    console.error('[GDPR] Data export failed:', error);
    res.status(500).json({
      error: 'Failed to export data',
      message: 'An error occurred while exporting your data. Please try again or contact support.'
    });
  }
});

/**
 * POST /api/gdpr/delete-account
 * Permanently delete user account and all associated data
 */
router.post('/delete-account', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { confirmation, reason } = req.body;

  // Require explicit confirmation
  if (confirmation !== 'DELETE MY ACCOUNT') {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Please type "DELETE MY ACCOUNT" to confirm deletion'
    });
  }

  try {
    console.log(`[GDPR] Account deletion requested by user ${userId}`, reason ? `Reason: ${reason}` : '');

    // Log the deletion request (for compliance)
    await db('data_deletion_log').insert({
      user_id: userId,
      requested_at: new Date(),
      reason: reason || null,
      ip_address: req.ip,
    });

    // Delete all user data
    await deleteAllUserData(userId);

    // Clear session
    req.session.destroy();

    console.log(`[GDPR] Account deletion completed for user ${userId}`);

    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.'
    });
  } catch (error) {
    console.error('[GDPR] Account deletion failed:', error);
    res.status(500).json({
      error: 'Failed to delete account',
      message: 'An error occurred while deleting your account. Please contact support.'
    });
  }
});

/**
 * GET /api/gdpr/data-summary
 * Get a summary of what data we have about the user
 */
router.get('/data-summary', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const summary = await getDataSummary(userId);
    res.json(summary);
  } catch (error) {
    console.error('[GDPR] Data summary failed:', error);
    res.status(500).json({ error: 'Failed to retrieve data summary' });
  }
});

/**
 * POST /api/gdpr/rectify
 * Request correction of inaccurate personal data
 */
router.post('/rectify', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { field, currentValue, correctedValue, explanation } = req.body;

  try {
    // Log rectification request
    await db('data_rectification_log').insert({
      user_id: userId,
      field,
      current_value: currentValue,
      corrected_value: correctedValue,
      explanation: explanation || null,
      requested_at: new Date(),
      status: 'pending'
    });

    res.json({
      success: true,
      message: 'Your rectification request has been submitted. We will review it within 30 days.'
    });
  } catch (error) {
    console.error('[GDPR] Rectification request failed:', error);
    res.status(500).json({ error: 'Failed to submit rectification request' });
  }
});

/**
 * Helper Functions
 */

/**
 * Collect all user data for export
 */
async function collectUserData(userId) {
  try {
    // Fetch user profile
    const user = await db('users')
      .where('id', userId)
      .first();

    // Remove sensitive fields
    if (user) {
      delete user.password_hash;
      delete user.session_token;
      delete user.reset_token;
    }

    // Fetch watchlists
    const watchlists = await db('watchlists')
      .where('user_id', userId)
      .select('*');

    // Fetch watchlist stocks
    const watchlistIds = watchlists.map(w => w.id);
    const watchlistStocks = watchlistIds.length > 0
      ? await db('watchlist_stocks')
          .whereIn('watchlist_id', watchlistIds)
          .select('*')
      : [];

    // Fetch portfolios
    const portfolios = await db('portfolios')
      .where('user_id', userId)
      .select('*');

    // Fetch portfolio holdings
    const portfolioIds = portfolios.map(p => p.id);
    const portfolioHoldings = portfolioIds.length > 0
      ? await db('portfolio_holdings')
          .whereIn('portfolio_id', portfolioIds)
          .select('*')
      : [];

    // Fetch alerts
    const alerts = await db('alerts')
      .where('user_id', userId)
      .select('*');

    // Fetch user preferences
    const preferences = await db('user_preferences')
      .where('user_id', userId)
      .first();

    // Fetch natural language query history (if stored)
    const queryHistory = await db('nl_query_history')
      .where('user_id', userId)
      .select('*')
      .catch(() => []); // Table might not exist

    // Fetch activity log
    const activityLog = await db('user_activity_log')
      .where('user_id', userId)
      .orderBy('timestamp', 'desc')
      .limit(1000) // Last 1000 activities
      .select('*')
      .catch(() => []); // Table might not exist

    return {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      dataSubject: {
        userId: user?.id,
        email: user?.email,
        name: user?.name,
        createdAt: user?.created_at,
      },
      personalData: {
        user,
        preferences,
      },
      investmentData: {
        watchlists,
        watchlistStocks,
        portfolios,
        portfolioHoldings,
        alerts,
      },
      usageData: {
        queryHistory,
        activityLog,
      },
      metadata: {
        totalWatchlists: watchlists.length,
        totalPortfolios: portfolios.length,
        totalAlerts: alerts.length,
        totalQueries: queryHistory.length,
      }
    };
  } catch (error) {
    console.error('Error collecting user data:', error);
    throw error;
  }
}

/**
 * Delete all user data
 */
async function deleteAllUserData(userId) {
  // Use a transaction to ensure all-or-nothing deletion
  await db.transaction(async (trx) => {
    try {
      // Get IDs for cascading deletes
      const watchlistIds = await trx('watchlists')
        .where('user_id', userId)
        .pluck('id');

      const portfolioIds = await trx('portfolios')
        .where('user_id', userId)
        .pluck('id');

      // Delete watchlist-related data
      if (watchlistIds.length > 0) {
        await trx('watchlist_stocks')
          .whereIn('watchlist_id', watchlistIds)
          .del();
        await trx('watchlists')
          .where('user_id', userId)
          .del();
      }

      // Delete portfolio-related data
      if (portfolioIds.length > 0) {
        await trx('portfolio_holdings')
          .whereIn('portfolio_id', portfolioIds)
          .del();
        await trx('portfolio_transactions')
          .whereIn('portfolio_id', portfolioIds)
          .del()
          .catch(() => {}); // Table might not exist
        await trx('portfolios')
          .where('user_id', userId)
          .del();
      }

      // Delete alerts
      await trx('alerts')
        .where('user_id', userId)
        .del();

      // Delete preferences
      await trx('user_preferences')
        .where('user_id', userId)
        .del();

      // Delete query history
      await trx('nl_query_history')
        .where('user_id', userId)
        .del()
        .catch(() => {}); // Table might not exist

      // Delete activity log
      await trx('user_activity_log')
        .where('user_id', userId)
        .del()
        .catch(() => {}); // Table might not exist

      // Delete any saved searches
      await trx('saved_searches')
        .where('user_id', userId)
        .del()
        .catch(() => {}); // Table might not exist

      // Finally, delete the user account
      await trx('users')
        .where('id', userId)
        .del();

      console.log(`[GDPR] All data deleted for user ${userId}`);
    } catch (error) {
      console.error('Error deleting user data:', error);
      throw error;
    }
  });
}

/**
 * Get summary of user data
 */
async function getDataSummary(userId) {
  const [
    watchlistCount,
    portfolioCount,
    alertCount,
    queryCount,
  ] = await Promise.all([
    db('watchlists').where('user_id', userId).count('* as count').first(),
    db('portfolios').where('user_id', userId).count('* as count').first(),
    db('alerts').where('user_id', userId).count('* as count').first(),
    db('nl_query_history').where('user_id', userId).count('* as count').first().catch(() => ({ count: 0 })),
  ]);

  const user = await db('users')
    .where('id', userId)
    .select('email', 'name', 'created_at')
    .first();

  return {
    personalInformation: {
      email: user?.email,
      name: user?.name,
      accountCreated: user?.created_at,
    },
    dataCategories: {
      watchlists: parseInt(watchlistCount?.count || 0),
      portfolios: parseInt(portfolioCount?.count || 0),
      alerts: parseInt(alertCount?.count || 0),
      queries: parseInt(queryCount?.count || 0),
    },
    dataRetention: {
      accountData: 'Retained while account is active',
      activityLogs: 'Retained for 90 days',
      deletionPolicy: 'Data deleted within 30 days of account deletion',
    },
    yourRights: [
      'Access your data (export)',
      'Rectify inaccurate data',
      'Delete your account and data',
      'Withdraw consent',
      'Object to processing',
      'Data portability',
    ],
  };
}

module.exports = router;
