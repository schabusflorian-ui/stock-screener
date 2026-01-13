// src/api/routes/onboarding.js
const express = require('express');
const router = express.Router();
const db = require('../../database');

/**
 * Save user's onboarding preferences
 * POST /api/onboarding/preferences
 */
router.post('/preferences', async (req, res) => {
  try {
    const userId = req.user?.id; // Assuming auth middleware sets req.user

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const {
      interests,
      riskProfile,
      firstStocks,
      firstWatchlistName,
    } = req.body;

    // Validate data
    if (!Array.isArray(interests) || !riskProfile) {
      return res.status(400).json({
        success: false,
        error: 'Invalid onboarding data'
      });
    }

    // Check if user preferences already exist
    const existing = await db('user_preferences')
      .where({ user_id: userId })
      .first();

    const preferencesData = {
      user_id: userId,
      interests: JSON.stringify(interests),
      risk_profile: riskProfile,
      onboarding_completed_at: new Date(),
      updated_at: new Date(),
    };

    if (existing) {
      // Update existing preferences
      await db('user_preferences')
        .where({ user_id: userId })
        .update(preferencesData);
    } else {
      // Insert new preferences
      await db('user_preferences').insert({
        ...preferencesData,
        created_at: new Date(),
      });
    }

    // If user created a watchlist, save it using new user_watchlists table
    if (firstStocks && firstStocks.length > 0) {
      const database = db.getDatabase();

      const insertStmt = database.prepare(`
        INSERT OR IGNORE INTO user_watchlists (user_id, company_id, added_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);

      const transaction = database.transaction(() => {
        for (const stock of firstStocks) {
          // Find company by symbol
          const company = database.prepare('SELECT id FROM companies WHERE symbol = ?')
            .get(stock.symbol);

          if (company) {
            insertStmt.run(userId, company.id);
          }
        }
      });

      transaction();
    }

    res.json({
      success: true,
      message: 'Onboarding preferences saved'
    });

  } catch (error) {
    console.error('Error saving onboarding preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save preferences'
    });
  }
});

/**
 * Get user's onboarding preferences
 * GET /api/onboarding/preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const preferences = await db('user_preferences')
      .where({ user_id: userId })
      .first();

    if (!preferences) {
      return res.json({
        success: true,
        data: null,
        hasCompletedOnboarding: false
      });
    }

    res.json({
      success: true,
      data: {
        interests: JSON.parse(preferences.interests || '[]'),
        riskProfile: preferences.risk_profile,
        completedAt: preferences.onboarding_completed_at,
      },
      hasCompletedOnboarding: true
    });

  } catch (error) {
    console.error('Error fetching onboarding preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences'
    });
  }
});

/**
 * Get personalized stock recommendations based on preferences
 * GET /api/onboarding/recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const preferences = await db('user_preferences')
      .where({ user_id: userId })
      .first();

    if (!preferences) {
      // Return default recommendations
      return res.json({
        success: true,
        stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN'],
        reason: 'default'
      });
    }

    const interests = JSON.parse(preferences.interests || '[]');
    const stockRecommendations = [];

    // Map interests to stock recommendations
    const interestStockMap = {
      growth: ['NVDA', 'TSLA', 'META', 'AMZN', 'NFLX'],
      value: ['BRK.B', 'JPM', 'BAC', 'WFC', 'CVX'],
      dividend: ['JNJ', 'PG', 'KO', 'PEP', 'MCD'],
      tech: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMD'],
      etf: ['SPY', 'VOO', 'QQQ', 'VTI', 'IVV'],
      international: ['VXUS', 'EEM', 'VEA', 'IEMG'],
      smallcap: ['IWM', 'VB', 'SCHA', 'IJR'],
      quant: ['AAPL', 'MSFT', 'GOOGL', 'NVDA'],
    };

    interests.forEach(interest => {
      const stocks = interestStockMap[interest] || [];
      stockRecommendations.push(...stocks);
    });

    // Remove duplicates and limit to 6
    const uniqueStocks = [...new Set(stockRecommendations)].slice(0, 6);

    res.json({
      success: true,
      stocks: uniqueStocks,
      interests,
      riskProfile: preferences.risk_profile,
      reason: 'personalized'
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations'
    });
  }
});

module.exports = router;
