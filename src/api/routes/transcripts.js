/**
 * Earnings Transcripts & Valuation API Routes
 *
 * Provides endpoints for transcript analysis, management credibility,
 * and historical valuation percentiles.
 */

const express = require('express');
const router = express.Router();
const { TranscriptService, ValuationService } = require('../../services/transcripts');
const { getDatabaseAsync } = require('../../lib/db');

let transcriptService = null;
let valuationService = null;
let cachedDb = null;

async function getTranscriptService() {
  if (!transcriptService) {
    cachedDb = cachedDb || await getDatabaseAsync();
    transcriptService = new TranscriptService(cachedDb);
  }
  return transcriptService;
}

async function getValuationService() {
  if (!valuationService) {
    cachedDb = cachedDb || await getDatabaseAsync();
    valuationService = new ValuationService(cachedDb);
  }
  return valuationService;
}

// ========================================
// Transcript Endpoints
// ========================================

/**
 * GET /api/transcripts/:symbol
 * Get transcript history for a symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 8;

    const service = await getTranscriptService();
    const transcripts = await service.getTranscriptHistory(symbol.toUpperCase(), limit);

    res.json({
      symbol: symbol.toUpperCase(),
      count: transcripts.length,
      transcripts
    });
  } catch (error) {
    console.error('Transcript history error:', error);
    res.status(500).json({ error: 'Failed to get transcript history', message: error.message });
  }
});

/**
 * GET /api/transcripts/:symbol/latest
 * Get latest transcript for a symbol
 */
router.get('/:symbol/latest', async (req, res) => {
  try {
    const { symbol } = req.params;
    const service = await getTranscriptService();
    const transcript = await service.getLatestTranscript(symbol.toUpperCase());

    if (!transcript) {
      return res.status(404).json({ error: 'No transcript found for symbol' });
    }

    res.json(transcript);
  } catch (error) {
    console.error('Latest transcript error:', error);
    res.status(500).json({ error: 'Failed to get latest transcript', message: error.message });
  }
});

/**
 * GET /api/transcripts/:symbol/sentiment-trend
 * Get sentiment trend over recent quarters
 */
router.get('/:symbol/sentiment-trend', async (req, res) => {
  try {
    const { symbol } = req.params;
    const quarters = parseInt(req.query.quarters) || 8;

    const service = await getTranscriptService();
    const trend = await service.getSentimentTrend(symbol.toUpperCase(), quarters);

    res.json({
      symbol: symbol.toUpperCase(),
      ...trend
    });
  } catch (error) {
    console.error('Sentiment trend error:', error);
    res.status(500).json({ error: 'Failed to get sentiment trend', message: error.message });
  }
});

/**
 * GET /api/transcripts/signals/improving
 * Find companies with improving sentiment
 */
router.get('/signals/improving', async (req, res) => {
  try {
    const service = await getTranscriptService();
    const companies = await service.findImprovingSentiment();

    res.json({
      signal: 'improving_sentiment',
      count: companies.length,
      companies
    });
  } catch (error) {
    console.error('Improving sentiment error:', error);
    res.status(500).json({ error: 'Failed to find improving sentiment', message: error.message });
  }
});

/**
 * GET /api/transcripts/signals/deteriorating
 * Find companies with deteriorating sentiment
 */
router.get('/signals/deteriorating', async (req, res) => {
  try {
    const service = await getTranscriptService();
    const companies = await service.findDeterioratingSentiment();

    res.json({
      signal: 'deteriorating_sentiment',
      count: companies.length,
      companies
    });
  } catch (error) {
    console.error('Deteriorating sentiment error:', error);
    res.status(500).json({ error: 'Failed to find deteriorating sentiment', message: error.message });
  }
});

/**
 * POST /api/transcripts/:symbol/analyze
 * Analyze transcript text (for manual input)
 */
router.post('/:symbol/analyze', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { text, fiscalYear, fiscalQuarter, callDate } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Transcript text is required' });
    }

    const service = await getTranscriptService();
    const analysis = service.analyzeTranscript(text);

    const db = await getDatabaseAsync();
    const companyRes = await db.query('SELECT id FROM companies WHERE symbol = $1', [symbol.toUpperCase()]);
    const company = companyRes.rows[0];

    if (company && fiscalYear && fiscalQuarter && callDate) {
      await service.storeTranscript({
        companyId: company.id,
        symbol: symbol.toUpperCase(),
        fiscalYear,
        fiscalQuarter,
        callDate,
        fullTranscript: text,
        source: 'manual'
      });
    }

    res.json({
      symbol: symbol.toUpperCase(),
      analysis
    });
  } catch (error) {
    console.error('Analyze transcript error:', error);
    res.status(500).json({ error: 'Failed to analyze transcript', message: error.message });
  }
});

// ========================================
// Management Guidance Endpoints
// ========================================

/**
 * GET /api/transcripts/:symbol/guidance
 * Get guidance history for a symbol
 */
router.get('/:symbol/guidance', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 8;

    const service = await getTranscriptService();
    const guidance = await service.getGuidanceHistory(symbol.toUpperCase(), limit);

    res.json({
      symbol: symbol.toUpperCase(),
      count: guidance.length,
      guidance
    });
  } catch (error) {
    console.error('Guidance history error:', error);
    res.status(500).json({ error: 'Failed to get guidance history', message: error.message });
  }
});

// ========================================
// Management Credibility Endpoints
// ========================================

/**
 * GET /api/transcripts/credibility/top
 * Get most credible management teams
 */
router.get('/credibility/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const service = await getTranscriptService();
    const teams = await service.getTopCredibleManagement(limit);

    res.json({
      count: teams.length,
      teams
    });
  } catch (error) {
    console.error('Top credibility error:', error);
    res.status(500).json({ error: 'Failed to get top credible management', message: error.message });
  }
});

// ========================================
// Valuation Endpoints
// ========================================

/**
 * GET /api/transcripts/valuation/:symbol
 * Get valuation context for a symbol
 */
router.get('/valuation/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const service = await getValuationService();
    const context = await service.getValuationContext(symbol.toUpperCase());

    if (!context.ranges) {
      return res.status(404).json({
        error: 'No valuation data found',
        message: 'Historical valuation data not available for this symbol'
      });
    }

    res.json(context);
  } catch (error) {
    console.error('Valuation context error:', error);
    res.status(500).json({ error: 'Failed to get valuation context', message: error.message });
  }
});

/**
 * GET /api/transcripts/valuation/:symbol/ranges
 * Get valuation ranges for a symbol
 */
router.get('/valuation/:symbol/ranges', async (req, res) => {
  try {
    const { symbol } = req.params;
    const service = await getValuationService();
    const ranges = await service.getRanges(symbol.toUpperCase());

    if (!ranges) {
      return res.status(404).json({ error: 'No valuation ranges found for symbol' });
    }

    res.json(ranges);
  } catch (error) {
    console.error('Valuation ranges error:', error);
    res.status(500).json({ error: 'Failed to get valuation ranges', message: error.message });
  }
});

/**
 * GET /api/transcripts/screens/undervalued
 * Find historically undervalued stocks
 */
router.get('/screens/undervalued', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const service = await getValuationService();
    const stocks = await service.findHistoricallyUndervalued(limit);

    res.json({
      screen: 'historically_undervalued',
      count: stocks.length,
      stocks
    });
  } catch (error) {
    console.error('Undervalued screen error:', error);
    res.status(500).json({ error: 'Failed to get undervalued stocks', message: error.message });
  }
});

/**
 * GET /api/transcripts/screens/garp
 * Find quality at reasonable price stocks
 */
router.get('/screens/garp', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const service = await getValuationService();
    const stocks = await service.findQualityAtReasonablePrice(limit);

    res.json({
      screen: 'quality_at_reasonable_price',
      count: stocks.length,
      stocks
    });
  } catch (error) {
    console.error('GARP screen error:', error);
    res.status(500).json({ error: 'Failed to get GARP stocks', message: error.message });
  }
});

/**
 * GET /api/transcripts/screens/overvalued
 * Find historically overvalued stocks
 */
router.get('/screens/overvalued', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const service = await getValuationService();
    const stocks = await service.findHistoricallyOvervalued(limit);

    res.json({
      screen: 'historically_overvalued',
      count: stocks.length,
      stocks
    });
  } catch (error) {
    console.error('Overvalued screen error:', error);
    res.status(500).json({ error: 'Failed to get overvalued stocks', message: error.message });
  }
});

/**
 * POST /api/transcripts/valuation/snapshot
 * Create valuation snapshots for all companies
 */
router.post('/valuation/snapshot', async (req, res) => {
  try {
    const { date } = req.body;
    const service = await getValuationService();
    const result = await service.createAllSnapshots(date);

    res.json({
      message: 'Valuation snapshots created',
      ...result
    });
  } catch (error) {
    console.error('Snapshot creation error:', error);
    res.status(500).json({ error: 'Failed to create snapshots', message: error.message });
  }
});

/**
 * POST /api/transcripts/valuation/calculate-ranges
 * Calculate valuation ranges for all companies
 */
router.post('/valuation/calculate-ranges', async (req, res) => {
  try {
    const service = await getValuationService();
    const result = await service.calculateAllRanges();

    res.json({
      message: 'Valuation ranges calculated',
      ...result
    });
  } catch (error) {
    console.error('Range calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate ranges', message: error.message });
  }
});

module.exports = router;
