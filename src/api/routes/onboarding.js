// src/api/routes/onboarding.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isPostgres } = require('../../database');

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

    const database = await getDatabaseAsync();

    // Check if user preferences already exist
    const existingResult = await database.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const existing = existingResult.rows[0];

    const now = new Date().toISOString();
    const interestsJson = JSON.stringify(interests);

    if (existing) {
      // Update existing preferences
      await database.query(
        `UPDATE user_preferences
         SET interests = ?, risk_profile = ?, onboarding_completed_at = ?, updated_at = ?
         WHERE user_id = ?`,
        [interestsJson, riskProfile, now, now, userId]
      );
    } else {
      // Insert new preferences
      await database.query(
        `INSERT INTO user_preferences (user_id, interests, risk_profile, onboarding_completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, interestsJson, riskProfile, now, now, now]
      );
    }

    // If user created a watchlist, save it using new user_watchlists table
    if (firstStocks && firstStocks.length > 0) {
      for (const stock of firstStocks) {
        try {
          // Find company by symbol (case-insensitive)
          const companyResult = await database.query(
            isPostgres()
              ? 'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)'
              : 'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
            [stock.symbol]
          );

          if (companyResult.rows.length > 0) {
            const companyId = companyResult.rows[0].id;

            // Insert into watchlist, ignore if already exists
            if (isPostgres()) {
              await database.query(
                `INSERT INTO user_watchlists (user_id, company_id, added_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (user_id, company_id) DO NOTHING`,
                [userId, companyId]
              );
            } else {
              await database.query(
                `INSERT OR IGNORE INTO user_watchlists (user_id, company_id, added_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [userId, companyId]
              );
            }
          }
        } catch (error) {
          console.error(`Error adding stock ${stock.symbol} to watchlist:`, error);
          // Continue with other stocks even if one fails
        }
      }
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

    const database = await getDatabaseAsync();
    const result = await database.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const preferences = result.rows[0];

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

    const database = await getDatabaseAsync();
    const result = await database.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const preferences = result.rows[0];

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
