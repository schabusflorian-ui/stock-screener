// src/api/routes/sectors.js
const express = require('express');
const router = express.Router();
const SectorAnalysisService = require('../../services/sectorAnalysisService');

const sectorService = new SectorAnalysisService();

/**
 * GET /api/sectors
 * Get all sectors with aggregate metrics
 */
router.get('/', (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const sectors = sectorService.getSectorOverview(periodType);

    res.json({
      sectors,
      count: sectors.length,
      periodType
    });
  } catch (error) {
    console.error('Error getting sector overview:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/rankings
 * Get sector rankings by various metrics
 */
router.get('/rankings', (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const rankings = sectorService.getSectorRankings(periodType);

    res.json({
      rankings,
      periodType
    });
  } catch (error) {
    console.error('Error getting sector rankings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/rotation
 * Get sector rotation data with historical trends
 */
router.get('/rotation', (req, res) => {
  try {
    const { periods = 4, periodType = 'annual' } = req.query;
    const rotation = sectorService.getSectorRotation(parseInt(periods), periodType);

    res.json({
      rotation,
      periodCount: parseInt(periods),
      periodType
    });
  } catch (error) {
    console.error('Error getting sector rotation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/top-performers
 * Get top performing companies by sector
 */
router.get('/top-performers', (req, res) => {
  try {
    const { metric = 'roic', limit = 5, periodType = 'annual' } = req.query;
    const topPerformers = sectorService.getTopPerformersBySector(metric, parseInt(limit), periodType);

    res.json({
      topPerformers,
      metric,
      limit: parseInt(limit),
      periodType
    });
  } catch (error) {
    console.error('Error getting top performers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/margins
 * Get industry margin comparisons
 */
router.get('/margins', (req, res) => {
  try {
    const { periodType = 'annual' } = req.query;
    const margins = sectorService.getIndustryMarginComparison(periodType);

    res.json({
      margins,
      count: margins.length,
      periodType
    });
  } catch (error) {
    console.error('Error getting margin comparison:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/:sector
 * Get detailed sector data with all companies
 */
router.get('/:sector', (req, res) => {
  try {
    const { sector } = req.params;
    const { periodType = 'annual' } = req.query;
    const detail = sectorService.getSectorDetail(decodeURIComponent(sector), periodType);

    if (!detail.companies.length) {
      return res.status(404).json({ error: 'Sector not found or no data available' });
    }

    res.json(detail);
  } catch (error) {
    console.error('Error getting sector detail:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/:sector/industries
 * Get industries within a sector
 */
router.get('/:sector/industries', (req, res) => {
  try {
    const { sector } = req.params;
    const { periodType = 'annual' } = req.query;
    const industries = sectorService.getIndustriesBySector(decodeURIComponent(sector), periodType);

    res.json({
      sector: decodeURIComponent(sector),
      industries,
      count: industries.length,
      periodType
    });
  } catch (error) {
    console.error('Error getting industries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sectors/industry/:industry
 * Get detailed industry data with all companies
 */
router.get('/industry/:industry', (req, res) => {
  try {
    const { industry } = req.params;
    const { periodType = 'annual' } = req.query;
    const detail = sectorService.getIndustryDetail(decodeURIComponent(industry), periodType);

    if (!detail.companies.length) {
      return res.status(404).json({ error: 'Industry not found or no data available' });
    }

    res.json(detail);
  } catch (error) {
    console.error('Error getting industry detail:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
