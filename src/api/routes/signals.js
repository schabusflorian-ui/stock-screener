// src/api/routes/signals.js
// API routes for enhanced signals (13F, earnings momentum, open market buys)

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');

let signalEnhancements = null;

async function getSignalEnhancements() {
  if (!signalEnhancements) {
    const { SignalEnhancements } = require('../../services/signalEnhancements');
    signalEnhancements = new SignalEnhancements();
  }
  return signalEnhancements;
}

// ============================================
// 13F ACTIVITY ENDPOINTS
// ============================================

/**
 * GET /api/signals/13f/:symbol
 * Get 13F activity and signal for a specific symbol
 */
router.get('/13f/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const database = await getDatabaseAsync();
    const se = await getSignalEnhancements();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const signal = await se.get13FSignal(company.id);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      signal
    });
  } catch (error) {
    console.error('Error getting 13F signal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/13f/top/new-positions
 * Get top new positions from super-investors
 */
router.get('/13f/top/new-positions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const se = await getSignalEnhancements();
    const all = await se.getTop13FOpportunities(limit);

    res.json({
      success: true,
      count: all.newPositions.length,
      opportunities: all.newPositions
    });
  } catch (error) {
    console.error('Error getting 13F new positions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/13f/top/increases
 * Get top position increases from super-investors
 */
router.get('/13f/top/increases', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const se = await getSignalEnhancements();
    const all = await se.getTop13FOpportunities(limit);

    res.json({
      success: true,
      count: all.significantIncreases.length,
      opportunities: all.significantIncreases
    });
  } catch (error) {
    console.error('Error getting 13F increases:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/13f/top/exits
 * Get top position exits from super-investors
 */
router.get('/13f/top/exits', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const se = await getSignalEnhancements();
    const all = await se.getTop13FOpportunities(limit);

    res.json({
      success: true,
      count: all.exits.length,
      opportunities: all.exits
    });
  } catch (error) {
    console.error('Error getting 13F exits:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INSIDER OPEN MARKET BUYS ENDPOINTS
// ============================================

/**
 * GET /api/signals/insiders/:symbol
 * Get classified insider transactions for a symbol
 */
router.get('/insiders/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const database = await getDatabaseAsync();
    const se = await getSignalEnhancements();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const signal = await se.getInsiderSignal(company.id);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      signal
    });
  } catch (error) {
    console.error('Error getting insider signal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/insiders/top/open-market-buys
 * Get top open market buys (most bullish insider signal)
 */
router.get('/insiders/top/open-market-buys', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const se = await getSignalEnhancements();
    const opportunities = await se.getTopOpenMarketBuys(limit);

    res.json({
      success: true,
      count: opportunities.length,
      opportunities
    });
  } catch (error) {
    console.error('Error getting open market buys:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EARNINGS MOMENTUM ENDPOINTS
// ============================================

/**
 * GET /api/signals/earnings/:symbol
 * Get earnings momentum signal for a symbol
 */
router.get('/earnings/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const database = await getDatabaseAsync();
    const se = await getSignalEnhancements();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const signal = await se.getEarningsMomentumSignal(company.id);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      signal
    });
  } catch (error) {
    console.error('Error getting earnings momentum signal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/earnings/top/momentum
 * Get companies with strong earnings momentum
 */
router.get('/earnings/top/momentum', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const minBeats = parseInt(req.query.minBeats) || 2;
    const se = await getSignalEnhancements();
    const opportunities = await se.getEarningsMomentumOpportunities(minBeats, limit);

    res.json({
      success: true,
      count: opportunities.length,
      minConsecutiveBeats: minBeats,
      opportunities
    });
  } catch (error) {
    console.error('Error getting earnings momentum:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMBINED SIGNALS ENDPOINT
// ============================================

/**
 * GET /api/signals/combined/:symbol
 * Get all enhanced signals for a symbol
 */
router.get('/combined/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const database = await getDatabaseAsync();
    const se = await getSignalEnhancements();

    const companyResult = await database.query(
      'SELECT id, name, sector, industry FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const thirteenF = await se.get13FSignal(company.id);
    const insider = await se.getInsiderSignal(company.id);
    const earnings = await se.getEarningsMomentumSignal(company.id);

    // Calculate combined score
    let combinedScore = 0;
    let totalWeight = 0;

    if (thirteenF.confidence > 0) {
      combinedScore += thirteenF.score * thirteenF.confidence * 0.35;
      totalWeight += thirteenF.confidence * 0.35;
    }
    if (insider.confidence > 0) {
      combinedScore += insider.score * insider.confidence * 0.35;
      totalWeight += insider.confidence * 0.35;
    }
    if (earnings.confidence > 0) {
      combinedScore += earnings.score * earnings.confidence * 0.30;
      totalWeight += earnings.confidence * 0.30;
    }

    const normalizedScore = totalWeight > 0 ? combinedScore / totalWeight : 0;

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      company: {
        name: company.name,
        sector: company.sector,
        industry: company.industry
      },
      signals: {
        thirteenF,
        insider,
        earnings
      },
      combined: {
        score: normalizedScore,
        confidence: totalWeight,
        interpretation: getScoreInterpretation(normalizedScore)
      }
    });
  } catch (error) {
    console.error('Error getting combined signals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/signals/summary
 * Get summary statistics for all enhanced signals
 */
router.get('/summary', async (req, res) => {
  try {
    const se = await getSignalEnhancements();
    const database = await getDatabaseAsync();

    const defaultNum = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : 0);

    // Count recent 13F activity (Postgres: CURRENT_DATE - INTERVAL)
    let thirteenFStats = { companies_with_activity: 0, new_positions: 0, increases: 0, exits: 0 };
    try {
      const r = await database.query(`
        SELECT
          COUNT(DISTINCT ih.company_id)::int as companies_with_activity,
          SUM(CASE WHEN ih.change_type = 'new' THEN 1 ELSE 0 END)::int as new_positions,
          SUM(CASE WHEN ih.change_type = 'increased' THEN 1 ELSE 0 END)::int as increases,
          SUM(CASE WHEN ih.change_type = 'sold' THEN 1 ELSE 0 END)::int as exits
        FROM investor_holdings ih
        WHERE ih.filing_date >= CURRENT_DATE - INTERVAL '90 days'
      `);
      if (r.rows[0]) thirteenFStats = r.rows[0];
    } catch (e) {
      console.warn('Signals summary 13F:', e?.message);
    }

    // Count open market buys
    let insiderStats = { companies_with_buys: 0, total_buys: 0, total_value: 0 };
    try {
      const r = await database.query(`
        SELECT
          COUNT(DISTINCT it.company_id)::int as companies_with_buys,
          COUNT(*)::int as total_buys,
          COALESCE(SUM(it.total_value), 0)::float as total_value
        FROM insider_transactions it
        WHERE it.transaction_code = 'P'
          AND it.acquisition_disposition = 'A'
          AND it.transaction_date >= CURRENT_DATE - INTERVAL '60 days'
          AND it.total_value >= 10000
      `);
      if (r.rows[0]) insiderStats = r.rows[0];
    } catch (e) {
      console.warn('Signals summary insiders:', e?.message);
    }

    // Count earnings momentum (table may not exist)
    let earningsStats = { companies_with_momentum: 0, avg_consecutive_beats: 0, avg_surprise_pct: 0 };
    try {
      const r = await database.query(`
        SELECT
          COUNT(*)::int as companies_with_momentum,
          AVG(consecutive_beats)::float as avg_consecutive_beats,
          AVG(avg_surprise)::float as avg_surprise_pct
        FROM earnings_calendar
        WHERE consecutive_beats >= 2
      `);
      if (r.rows[0]) earningsStats = r.rows[0];
    } catch (e) {
      console.warn('Signals summary earnings:', e?.message);
    }

    res.json({
      success: true,
      summary: {
        thirteenF: {
          companiesWithActivity: defaultNum(thirteenFStats.companies_with_activity),
          newPositions: defaultNum(thirteenFStats.new_positions),
          increases: defaultNum(thirteenFStats.increases),
          exits: defaultNum(thirteenFStats.exits),
          lookbackDays: 90
        },
        insiderOpenMarketBuys: {
          companiesWithBuys: defaultNum(insiderStats.companies_with_buys),
          totalBuys: defaultNum(insiderStats.total_buys),
          totalValue: defaultNum(insiderStats.total_value),
          lookbackDays: 60
        },
        earningsMomentum: {
          companiesWithMomentum: defaultNum(earningsStats.companies_with_momentum),
          avgConsecutiveBeats: defaultNum(earningsStats.avg_consecutive_beats),
          avgSurprisePct: defaultNum(earningsStats.avg_surprise_pct)
        }
      }
    });
  } catch (error) {
    console.error('Error getting signals summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function getScoreInterpretation(score) {
  if (score >= 0.6) return 'Strong Bullish';
  if (score >= 0.3) return 'Bullish';
  if (score >= 0.1) return 'Slightly Bullish';
  if (score >= -0.1) return 'Neutral';
  if (score >= -0.3) return 'Slightly Bearish';
  if (score >= -0.6) return 'Bearish';
  return 'Strong Bearish';
}

module.exports = router;
