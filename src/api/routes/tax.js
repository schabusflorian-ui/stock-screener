// src/api/routes/tax.js
/**
 * Tax API Routes
 *
 * Endpoints for tax settings, tracking, and reporting:
 * - GET/PUT /api/tax/settings - User tax settings
 * - GET /api/tax/regimes - Available tax regimes
 * - GET /api/portfolios/:id/tax/summary - Portfolio tax summary
 * - GET /api/portfolios/:id/tax/harvesting - Tax loss harvesting opportunities
 * - POST /api/portfolios/:id/tax/impact - Calculate trade tax impact
 */

const express = require('express');
const router = express.Router();
const { PortfolioTaxService } = require('../../services/portfolio/portfolioTaxService');
const {
  getTaxRegime,
  getCountryOptions,
  getTaxRegimeSummary,
  TAX_REGIMES
} = require('../../services/costs/taxRegimes');

let taxService = null;

function getTaxService(req) {
  if (!taxService) {
    taxService = new PortfolioTaxService(req.db);
  }
  return taxService;
}

// ============================================
// Global Tax Settings (User Level)
// ============================================

/**
 * GET /api/tax/settings
 * Get user's global tax settings
 */
router.get('/settings', (req, res) => {
  try {
    // For now, store in a simple settings table
    // In production, this would be user-specific
    const db = req.db.getDatabase ? req.db.getDatabase() : req.db;

    // Ensure table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_tax_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        tax_country TEXT DEFAULT 'AT',
        tax_year INTEGER DEFAULT 2024,
        lot_method TEXT DEFAULT 'fifo',
        broker_type TEXT DEFAULT 'foreign',
        track_tax_lots INTEGER DEFAULT 1,
        enable_tax_loss_harvesting INTEGER DEFAULT 1,
        tax_loss_threshold REAL DEFAULT 500,
        show_tax_impact INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    let settings = db.prepare('SELECT * FROM user_tax_settings WHERE id = 1').get();

    if (!settings) {
      // Insert defaults
      db.prepare(`
        INSERT INTO user_tax_settings (id, tax_country, tax_year)
        VALUES (1, 'AT', ?)
      `).run(new Date().getFullYear());

      settings = db.prepare('SELECT * FROM user_tax_settings WHERE id = 1').get();
    }

    // Get regime summary for the selected country
    const regimeSummary = getTaxRegimeSummary(settings.tax_country);

    res.json({
      success: true,
      data: {
        ...settings,
        trackTaxLots: !!settings.track_tax_lots,
        enableTaxLossHarvesting: !!settings.enable_tax_loss_harvesting,
        showTaxImpact: !!settings.show_tax_impact,
        taxLossHarvestingThreshold: settings.tax_loss_threshold
      },
      regime: regimeSummary
    });
  } catch (error) {
    console.error('Error getting tax settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/tax/settings
 * Update user's global tax settings
 */
router.put('/settings', (req, res) => {
  try {
    const {
      taxCountry,
      taxYear,
      lotMethod,
      brokerType,
      trackTaxLots,
      enableTaxLossHarvesting,
      taxLossHarvestingThreshold,
      showTaxImpact
    } = req.body;

    const db = req.db.getDatabase ? req.db.getDatabase() : req.db;

    db.prepare(`
      UPDATE user_tax_settings SET
        tax_country = COALESCE(?, tax_country),
        tax_year = COALESCE(?, tax_year),
        lot_method = COALESCE(?, lot_method),
        broker_type = COALESCE(?, broker_type),
        track_tax_lots = COALESCE(?, track_tax_lots),
        enable_tax_loss_harvesting = COALESCE(?, enable_tax_loss_harvesting),
        tax_loss_threshold = COALESCE(?, tax_loss_threshold),
        show_tax_impact = COALESCE(?, show_tax_impact),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      taxCountry,
      taxYear,
      lotMethod,
      brokerType,
      trackTaxLots !== undefined ? (trackTaxLots ? 1 : 0) : null,
      enableTaxLossHarvesting !== undefined ? (enableTaxLossHarvesting ? 1 : 0) : null,
      taxLossHarvestingThreshold,
      showTaxImpact !== undefined ? (showTaxImpact ? 1 : 0) : null
    );

    res.json({ success: true, message: 'Tax settings updated' });
  } catch (error) {
    console.error('Error updating tax settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tax/regimes
 * Get all available tax regimes
 */
router.get('/regimes', (req, res) => {
  try {
    const countries = getCountryOptions();
    const regimes = countries.map(c => ({
      ...c,
      summary: getTaxRegimeSummary(c.code)
    }));

    res.json({
      success: true,
      data: regimes
    });
  } catch (error) {
    console.error('Error getting tax regimes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/tax/regimes/:code
 * Get specific tax regime details
 */
router.get('/regimes/:code', (req, res) => {
  try {
    const { code } = req.params;
    const regime = getTaxRegime(code);
    const summary = getTaxRegimeSummary(code);

    res.json({
      success: true,
      data: {
        ...summary,
        details: regime
      }
    });
  } catch (error) {
    console.error('Error getting tax regime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Portfolio-Specific Tax Endpoints
// ============================================

/**
 * GET /api/portfolios/:portfolioId/tax/settings
 * Get tax settings for a specific portfolio
 */
router.get('/portfolios/:portfolioId/settings', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const service = getTaxService(req);
    const settings = service.getTaxSettings(parseInt(portfolioId));

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting portfolio tax settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/portfolios/:portfolioId/tax/settings
 * Update tax settings for a specific portfolio
 */
router.put('/portfolios/:portfolioId/settings', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const service = getTaxService(req);
    const settings = service.updateTaxSettings(parseInt(portfolioId), req.body);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error updating portfolio tax settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/portfolios/:portfolioId/tax/summary
 * Get year-end tax summary for portfolio
 */
router.get('/portfolios/:portfolioId/summary', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { year } = req.query;
    const service = getTaxService(req);

    const summary = service.getYearEndSummary(
      parseInt(portfolioId),
      year ? parseInt(year) : new Date().getFullYear()
    );

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting tax summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/portfolios/:portfolioId/tax/harvesting
 * Get tax loss harvesting opportunities
 */
router.get('/portfolios/:portfolioId/harvesting', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const service = getTaxService(req);

    const opportunities = service.getTaxLossHarvestingOpportunities(parseInt(portfolioId));

    res.json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    console.error('Error getting harvesting opportunities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/portfolios/:portfolioId/tax/impact
 * Calculate tax impact for a potential trade
 */
router.post('/portfolios/:portfolioId/impact', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { symbol, shares, price, side } = req.body;

    if (!symbol || !shares || !price || !side) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, shares, price, side'
      });
    }

    const service = getTaxService(req);
    const impact = service.calculateTradeImpact(
      parseInt(portfolioId),
      symbol,
      parseFloat(shares),
      parseFloat(price),
      side.toLowerCase()
    );

    res.json({
      success: true,
      data: impact
    });
  } catch (error) {
    console.error('Error calculating tax impact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
