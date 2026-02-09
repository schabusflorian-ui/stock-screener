// src/api/routes/aiRatings.js
// API routes for AI rating history and screening suggestions

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const crypto = require('crypto');

// ============================================
// AI Rating History Endpoints
// ============================================

/**
 * POST /api/ai-ratings/:symbol
 * Store a new AI rating for a company
 */
router.post('/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { score, label, summary, strengths, risks, analystId, contextData } = req.body;

    if (!score || !label) {
      return res.status(400).json({
        success: false,
        error: 'score and label are required'
      });
    }

    // Get company_id
    const companyResult = await database.query(
      'SELECT id FROM companies WHERE symbol = $1',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Insert rating
    const result = await database.query(`
      INSERT INTO ai_rating_history
      (company_id, symbol, score, label, summary, strengths, risks, analyst_id, context_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      company.id,
      symbol.toUpperCase(),
      score,
      label,
      summary || null,
      strengths ? JSON.stringify(strengths) : null,
      risks ? JSON.stringify(risks) : null,
      analystId || 'value',
      contextData ? JSON.stringify(contextData) : null
    ]);

    res.json({
      success: true,
      ratingId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error storing AI rating:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-ratings/:symbol
 * Get AI rating history for a company
 */
router.get('/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    const result = await database.query(`
      SELECT id, score, label, summary, strengths, risks, analyst_id, created_at
      FROM ai_rating_history
      WHERE symbol = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [symbol.toUpperCase(), parseInt(limit)]);

    const ratings = result.rows;

    // Parse JSON fields
    const parsedRatings = ratings.map(r => ({
      ...r,
      strengths: r.strengths ? JSON.parse(r.strengths) : [],
      risks: r.risks ? JSON.parse(r.risks) : []
    }));

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ratings: parsedRatings,
      count: parsedRatings.length
    });
  } catch (error) {
    console.error('Error fetching AI rating history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-ratings/:symbol/latest
 * Get the latest AI rating for a company
 */
router.get('/:symbol/latest', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const result = await database.query(`
      SELECT id, score, label, summary, strengths, risks, analyst_id, created_at
      FROM ai_rating_history
      WHERE symbol = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [symbol.toUpperCase()]);

    const rating = result.rows[0];

    if (!rating) {
      return res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        rating: null
      });
    }

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      rating: {
        ...rating,
        strengths: rating.strengths ? JSON.parse(rating.strengths) : [],
        risks: rating.risks ? JSON.parse(rating.risks) : []
      }
    });
  } catch (error) {
    console.error('Error fetching latest AI rating:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-ratings/:symbol/trend
 * Get AI rating trend data for charting
 */
router.get('/:symbol/trend', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { days = 90 } = req.query;

    const result = await database.query(`
      SELECT score, label, created_at
      FROM ai_rating_history
      WHERE symbol = $1
        AND created_at >= NOW() - INTERVAL '1 day' * $2
      ORDER BY created_at ASC
    `, [symbol.toUpperCase(), parseInt(days)]);

    const ratings = result.rows;

    // Calculate trend
    let trend = 'stable';
    if (ratings.length >= 2) {
      const oldScore = ratings[0].score;
      const newScore = ratings[ratings.length - 1].score;
      if (newScore > oldScore + 1) trend = 'improving';
      else if (newScore < oldScore - 1) trend = 'declining';
    }

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      trend,
      dataPoints: ratings.map(r => ({
        date: r.created_at,
        score: r.score,
        label: r.label
      })),
      count: ratings.length
    });
  } catch (error) {
    console.error('Error fetching AI rating trend:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// AI Screening Suggestions Endpoints
// ============================================

/**
 * POST /api/ai-ratings/screening/suggest
 * Get AI-powered screening filter suggestions based on user goal
 */
router.post('/screening/suggest', async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal || goal.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a more detailed investment goal'
      });
    }

    // Create hash for caching
    const goalHash = crypto.createHash('md5').update(goal.toLowerCase().trim()).digest('hex');

    // Check cache first
    const database = await getDatabaseAsync();
    const cachedResult = await database.query(`
      SELECT * FROM ai_screening_suggestions
      WHERE goal_hash = $1
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [goalHash]);

    const cached = cachedResult.rows[0];

    if (cached) {
      return res.json({
        success: true,
        cached: true,
        suggestion: {
          goal: cached.user_goal,
          filters: JSON.parse(cached.suggested_filters),
          explanation: cached.explanation,
          suggestedPresets: cached.suggested_presets ? JSON.parse(cached.suggested_presets) : []
        }
      });
    }

    // Generate suggestion using AI analyst
    const analystService = require('../../services/analystBridge');

    // Create a temporary conversation for the suggestion
    const conversation = await analystService.createConversation({
      analystId: 'value'
    });

    const prompt = `Based on this investment goal: "${goal}"

Suggest specific stock screening criteria. Respond with ONLY a JSON object in this exact format:
{
  "filters": {
    "minROIC": 15,
    "minNetMargin": 10,
    "maxDebtToEquity": 0.5,
    "minFCFYield": 5,
    "maxPERatio": 25
  },
  "explanation": "Brief 2-3 sentence explanation of why these filters match the goal",
  "suggestedPresets": ["buffett", "quality"]
}

Available filter keys: minROIC, maxROIC, minROE, maxROE, minROA, maxROA, minGrossMargin, maxGrossMargin, minOperatingMargin, maxOperatingMargin, minNetMargin, maxNetMargin, minFCFYield, maxFCFYield, minFCFMargin, maxFCFMargin, minPERatio, maxPERatio, minPBRatio, maxPBRatio, minPSRatio, maxPSRatio, minEVEBITDA, maxEVEBITDA, minPEGRatio, maxPEGRatio, minDebtToEquity, maxDebtToEquity, minDebtToAssets, maxDebtToAssets, minCurrentRatio, maxCurrentRatio, minQuickRatio, maxQuickRatio, minInterestCoverage, maxInterestCoverage, minRevenueGrowth, maxRevenueGrowth, minEarningsGrowth, maxEarningsGrowth, minFCFGrowth, maxFCFGrowth

Available presets: buffett, value, magic, quality, growth, dividend, fortress, cigarbutts, compounders, flywheel, forensic, asymmetry, moats

Only include filters that are directly relevant to the goal. Use reasonable thresholds.`;

    const response = await analystService.chat(conversation.id, prompt);

    // Parse the response
    let suggestion;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestion = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      // Fallback to default suggestion
      suggestion = {
        filters: { minROIC: 10, minNetMargin: 5 },
        explanation: 'Default quality filters applied. Please try a more specific goal.',
        suggestedPresets: ['quality']
      };
    }

    // Cache the suggestion (expires in 7 days)
    await database.query(`
      INSERT INTO ai_screening_suggestions
      (user_goal, goal_hash, suggested_filters, explanation, suggested_presets, expires_at)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
      ON CONFLICT (goal_hash) DO UPDATE SET
        user_goal = EXCLUDED.user_goal,
        suggested_filters = EXCLUDED.suggested_filters,
        explanation = EXCLUDED.explanation,
        suggested_presets = EXCLUDED.suggested_presets,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `, [
      goal,
      goalHash,
      JSON.stringify(suggestion.filters || {}),
      suggestion.explanation || '',
      JSON.stringify(suggestion.suggestedPresets || [])
    ]);

    res.json({
      success: true,
      cached: false,
      suggestion: {
        goal,
        filters: suggestion.filters || {},
        explanation: suggestion.explanation || '',
        suggestedPresets: suggestion.suggestedPresets || []
      }
    });
  } catch (error) {
    console.error('Error generating screening suggestion:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
