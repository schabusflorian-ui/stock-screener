// src/api/routes/aiRatings.js
// API routes for AI rating history and screening suggestions

const express = require('express');
const router = express.Router();
const db = require('../../database');
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
    const { symbol } = req.params;
    const { score, label, summary, strengths, risks, analystId, contextData } = req.body;

    if (!score || !label) {
      return res.status(400).json({
        success: false,
        error: 'score and label are required'
      });
    }

    // Get company_id
    const company = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM companies WHERE symbol = ?',
        [symbol.toUpperCase()],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Insert rating
    const result = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO ai_rating_history
         (company_id, symbol, score, label, summary, strengths, risks, analyst_id, context_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          company.id,
          symbol.toUpperCase(),
          score,
          label,
          summary || null,
          strengths ? JSON.stringify(strengths) : null,
          risks ? JSON.stringify(risks) : null,
          analystId || 'value',
          contextData ? JSON.stringify(contextData) : null
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    res.json({
      success: true,
      ratingId: result.id
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
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    const ratings = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, score, label, summary, strengths, risks, analyst_id, created_at
         FROM ai_rating_history
         WHERE symbol = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [symbol.toUpperCase(), parseInt(limit)],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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
    const { symbol } = req.params;

    const rating = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, score, label, summary, strengths, risks, analyst_id, created_at
         FROM ai_rating_history
         WHERE symbol = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [symbol.toUpperCase()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

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
    const { symbol } = req.params;
    const { days = 90 } = req.query;

    const ratings = await new Promise((resolve, reject) => {
      db.all(
        `SELECT score, label, created_at
         FROM ai_rating_history
         WHERE symbol = ?
           AND created_at >= datetime('now', '-' || ? || ' days')
         ORDER BY created_at ASC`,
        [symbol.toUpperCase(), parseInt(days)],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

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
    const { goal, presets } = req.body;

    if (!goal || goal.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a more detailed investment goal'
      });
    }

    // Create hash for caching
    const goalHash = crypto.createHash('md5').update(goal.toLowerCase().trim()).digest('hex');

    // Check cache first
    const cached = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM ai_screening_suggestions
         WHERE goal_hash = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        [goalHash],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

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
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO ai_screening_suggestions
         (user_goal, goal_hash, suggested_filters, explanation, suggested_presets, expires_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))`,
        [
          goal,
          goalHash,
          JSON.stringify(suggestion.filters || {}),
          suggestion.explanation || '',
          JSON.stringify(suggestion.suggestedPresets || [])
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

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
