// src/api/routes/sectors.js
const express = require('express');
const router = express.Router();
const SectorAnalysisService = require('../../services/sectorAnalysisService');

const sectorService = new SectorAnalysisService();

// Log full error for debugging (Railway logs, etc.)
function logSectorError(route, error) {
  console.error(`[sectors] ${route}:`, error.message);
  if (error.code) console.error('[sectors] pg code:', error.code);
  if (error.detail) console.error('[sectors] pg detail:', error.detail);
  if (error.where) console.error('[sectors] pg where:', error.where);
  console.error('[sectors] stack:', error.stack);
}

// Build 500 JSON so client/Network tab can see actual DB error (e.g. relation does not exist)
function sectorErrorPayload(error) {
  const payload = { error: error.message };
  if (error.code) payload.code = error.code;
  if (error.detail) payload.detail = error.detail;
  return payload;
}

/**
 * GET /api/sectors
 * Get all sectors with aggregate metrics
 */
router.get('/', async (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const sectors = await sectorService.getSectorOverview(periodType);

    res.json({
      sectors,
      count: sectors.length,
      periodType
    });
  } catch (error) {
    logSectorError('GET / (sector overview)', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/rankings
 * Get sector rankings by various metrics
 */
router.get('/rankings', async (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const rankings = await sectorService.getSectorRankings(periodType);

    res.json({
      rankings,
      periodType
    });
  } catch (error) {
    logSectorError('GET /rankings', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/rotation
 * Get sector rotation data with historical trends
 */
router.get('/rotation', async (req, res) => {
  try {
    const { periods = 4, periodType = 'annual' } = req.query;
    const rotation = await sectorService.getSectorRotation(parseInt(periods), periodType);

    res.json({
      rotation,
      periodCount: parseInt(periods),
      periodType
    });
  } catch (error) {
    logSectorError('GET /rotation', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/top-performers
 * Get top performing companies by sector
 */
router.get('/top-performers', async (req, res) => {
  try {
    const { metric = 'roic', limit = 5, periodType = 'annual' } = req.query;
    const topPerformers = await sectorService.getTopPerformersBySector(metric, parseInt(limit), periodType);

    res.json({
      topPerformers,
      metric,
      limit: parseInt(limit),
      periodType
    });
  } catch (error) {
    logSectorError('GET /top-performers', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/margins
 * Get industry margin comparisons
 */
router.get('/margins', async (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const margins = await sectorService.getIndustryMarginComparison(periodType);

    res.json({
      margins,
      count: margins.length,
      periodType
    });
  } catch (error) {
    logSectorError('GET /margins', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/:sector
 * Get detailed sector data with all companies
 */
router.get('/:sector', async (req, res) => {
  try {
    const { sector } = req.params;
    const { periodType = 'annual' } = req.query;
    const detail = await sectorService.getSectorDetail(decodeURIComponent(sector), periodType);

    if (!detail.companies.length) {
      return res.status(404).json({ error: 'Sector not found or no data available' });
    }

    res.json(detail);
  } catch (error) {
    logSectorError('GET /:sector (detail)', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/:sector/industries
 * Get industries within a sector
 */
router.get('/:sector/industries', async (req, res) => {
  try {
    const { sector } = req.params;
    const { periodType = 'annual' } = req.query;
    const industries = await sectorService.getIndustriesBySector(decodeURIComponent(sector), periodType);

    res.json({
      sector: decodeURIComponent(sector),
      industries,
      count: industries.length,
      periodType
    });
  } catch (error) {
    logSectorError('GET /:sector/industries', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

/**
 * GET /api/sectors/industry/:industry
 * Get detailed industry data with all companies
 */
router.get('/industry/:industry', async (req, res) => {
  try {
    const { industry } = req.params;
    const { periodType = 'annual' } = req.query;
    const detail = await sectorService.getIndustryDetail(decodeURIComponent(industry), periodType);

    if (!detail.companies.length) {
      return res.status(404).json({ error: 'Industry not found or no data available' });
    }

    res.json(detail);
  } catch (error) {
    logSectorError('GET /industry/:industry', error);
    res.status(500).json(sectorErrorPayload(error));
  }
});

module.exports = router;
