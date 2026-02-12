// src/api/routes/etfs.js
// API routes for ETF baskets and model portfolios

const express = require('express');
const router = express.Router();
const { getEtfService } = require('../../services/etfService');
const { getETFResolver } = require('../../services/etfResolver');
const { getDatabaseAsync } = require('../../lib/db');

// Initialize services
const etfService = getEtfService();
const etfResolver = getETFResolver();
// ============================================
// ETF Holdings Status (for Updates Dashboard)
// ============================================

/**
 * GET /api/etfs/holdings/status
 * Get ETF holdings status for the Updates Dashboard
 */
router.get('/holdings/status', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT etf_id) as etfs_with_holdings,
        COUNT(*) as total_holdings,
        MAX(as_of_date) as last_update
      FROM etf_holdings
    `);

    const totalEtfsResult = await database.query(
      'SELECT COUNT(*) as count FROM etf_definitions WHERE tier IN (1,2)'
    );
    const stats = statsResult.rows[0] || {};
    const totalEtfs = totalEtfsResult.rows[0] || {};

    res.json({
      success: true,
      etfsWithHoldings: stats.etfs_with_holdings || 0,
      totalEtfs: totalEtfs.count || 0,
      totalHoldings: stats.total_holdings || 0,
      lastUpdate: stats.last_update || null
    });
  } catch (error) {
    console.error('Error fetching ETF holdings status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/etfs/holdings/refresh
 * Trigger ETF holdings refresh (uses static data fallback)
 */
router.post('/holdings/refresh', async (req, res) => {
  try {
    const etfBundle = require('../../services/updates/bundles/etfBundle');
    const database = await getDatabaseAsync();

    const result = await etfBundle.execute('etf.holdings_static', database, {
      onProgress: (p, s) => console.log(`[ETF Holdings] [${p}%] ${s}`)
    });

    res.json({
      success: true,
      message: 'ETF holdings refreshed',
      ...result
    });
  } catch (error) {
    console.error('Error refreshing ETF holdings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ETF Definitions
// ============================================

/**
 * GET /api/etfs
 * List all ETFs with optional filters and pagination
 * Query params: category, issuer, tier, essential, assetClass, search, sortBy, sortOrder, limit, offset
 */
router.get('/', (req, res) => {
  try {
    const {
      category, issuer, tier, essential, assetClass,
      search, q, sortBy, sortOrder, limit, offset
    } = req.query;

    const result = etfResolver.list({
      category,
      issuer,
      tier: tier ? parseInt(tier) : undefined,
      essentialOnly: essential === 'true',
      assetClass,
      search: search || q,
      sortBy: sortBy || 'aum',
      sortOrder: sortOrder || 'desc',
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json({
      success: true,
      count: result.etfs.length,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      etfs: result.etfs
    });
  } catch (error) {
    console.error('Error fetching ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/search
 * Search ETFs by symbol or name
 */
router.get('/search', (req, res) => {
  try {
    const query = req.query.q || req.query.query;
    const limit = parseInt(req.query.limit) || 20;

    if (!query) {
      return res.json({ success: true, etfs: [] });
    }

    const etfs = etfResolver.search(query, limit);
    res.json({ success: true, count: etfs.length, etfs });
  } catch (error) {
    console.error('Error searching ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/essential
 * Get essential (must-have) ETFs
 */
router.get('/essential', (req, res) => {
  try {
    const etfs = etfResolver.getEssentials();
    res.json({ success: true, count: etfs.length, etfs });
  } catch (error) {
    console.error('Error fetching essential ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/categories
 * Get all ETF categories (hierarchical tree with counts)
 */
router.get('/categories', (req, res) => {
  try {
    const withCounts = req.query.counts === 'true';
    const categories = withCounts
      ? etfResolver.getCategoriesWithCounts()
      : etfResolver.getCategories();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/categories/:slug
 * Get category details with breadcrumb path
 */
router.get('/categories/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const breadcrumb = etfResolver.getCategoryPath(slug);

    if (breadcrumb.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const category = breadcrumb[breadcrumb.length - 1];
    res.json({ success: true, category, breadcrumb });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/issuers
 * Get all ETF issuers with counts
 */
router.get('/issuers', (req, res) => {
  try {
    const issuers = etfResolver.getIssuers();
    res.json({ success: true, count: issuers.length, issuers });
  } catch (error) {
    console.error('Error fetching issuers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/lazy-portfolios
 * Get all lazy (pre-defined) portfolios
 */
router.get('/lazy-portfolios', (req, res) => {
  try {
    const featured = req.query.featured === 'true';
    const portfolios = featured
      ? etfResolver.getFeaturedLazyPortfolios()
      : etfResolver.getLazyPortfolios();
    res.json({ success: true, count: portfolios.length, portfolios });
  } catch (error) {
    console.error('Error fetching lazy portfolios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/lazy-portfolios/:slug
 * Get lazy portfolio details with allocations
 */
router.get('/lazy-portfolios/:slug', (req, res) => {
  try {
    const portfolio = etfResolver.getLazyPortfolio(req.params.slug);

    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }

    res.json({ success: true, portfolio });
  } catch (error) {
    console.error('Error fetching lazy portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/compare
 * Compare multiple ETFs
 */
router.get('/compare', (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ success: false, error: 'symbols query parameter is required' });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const comparison = etfService.compareEtfs(symbolList);

    res.json({
      success: true,
      ...comparison
    });
  } catch (error) {
    console.error('Error comparing ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/:symbol
 * Get single ETF details (resolves through tier system, fetches on-demand if needed)
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Use resolver for tier-aware fetching
    const etf = await etfResolver.resolve(symbol);

    if (!etf) {
      return res.status(404).json({ success: false, error: 'ETF not found' });
    }

    res.json({ success: true, etf });
  } catch (error) {
    console.error('Error fetching ETF:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/:symbol/holdings
 * Get holdings for an ETF (fetches from Yahoo Finance if not cached)
 * Query params:
 *   - limit: max holdings to return (default 50)
 *   - refresh: set to 'true' to force refresh from Yahoo Finance
 */
router.get('/:symbol/holdings', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const forceRefresh = req.query.refresh === 'true';

    // Use the new method that fetches on demand
    const data = await etfService.getHoldingsWithFetch(symbol, { limit, forceRefresh });

    if (!data.etf) {
      return res.status(404).json({ success: false, error: 'ETF not found' });
    }

    const holdings = Array.isArray(data.holdings) ? data.holdings : [];
    res.json({
      success: true,
      ...data,
      holdings
    });
  } catch (error) {
    console.error('Error fetching ETF holdings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/etfs/:symbol/holdings/refresh
 * Force refresh holdings from Yahoo Finance
 */
router.post('/:symbol/holdings/refresh', async (req, res) => {
  try {
    const { symbol } = req.params;

    const result = await etfService.fetchAndStoreHoldings(symbol);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error refreshing ETF holdings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Model Portfolios
// ============================================

/**
 * GET /api/etfs/models
 * List all model portfolios
 */
router.get('/models/list', (req, res) => {
  try {
    const models = etfService.getAllModelPortfolios();
    res.json({
      success: true,
      count: models.length,
      models
    });
  } catch (error) {
    console.error('Error fetching model portfolios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/models/:idOrName
 * Get model portfolio details with allocations
 */
router.get('/models/:idOrName', (req, res) => {
  try {
    const { idOrName } = req.params;
    const model = etfService.getModelPortfolio(
      isNaN(idOrName) ? idOrName : parseInt(idOrName)
    );

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model portfolio not found' });
    }

    res.json({
      success: true,
      model
    });
  } catch (error) {
    console.error('Error fetching model portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/etfs/models/:idOrName/analysis
 * Analyze asset allocation of a model portfolio
 */
router.get('/models/:idOrName/analysis', (req, res) => {
  try {
    const { idOrName } = req.params;
    const analysis = etfService.analyzeModelAllocation(
      isNaN(idOrName) ? idOrName : parseInt(idOrName)
    );

    if (!analysis) {
      return res.status(404).json({ success: false, error: 'Model portfolio not found' });
    }

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing model portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/etfs/models
 * Create a custom model portfolio
 */
router.post('/models', (req, res) => {
  try {
    const { name, description, allocations, riskLevel, investmentStyle } = req.body;

    if (!name || !allocations || !Array.isArray(allocations)) {
      return res.status(400).json({
        success: false,
        error: 'name and allocations array are required'
      });
    }

    const model = etfService.createModelPortfolio(name, description, allocations, {
      riskLevel,
      investmentStyle
    });

    res.json({
      success: true,
      message: 'Model portfolio created',
      model
    });
  } catch (error) {
    console.error('Error creating model portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Portfolio Creation from Models
// ============================================

/**
 * POST /api/etfs/models/:idOrName/prepare
 * Prepare trades for creating a portfolio from a model
 */
router.post('/models/:idOrName/prepare', (req, res) => {
  try {
    const { idOrName } = req.params;
    const { amount, excludeEtfs = [], minAllocation = 0 } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount is required and must be positive'
      });
    }

    const preparation = etfService.preparePortfolioFromModel(
      isNaN(idOrName) ? idOrName : parseInt(idOrName),
      amount,
      { excludeEtfs, minAllocation }
    );

    res.json({
      success: true,
      ...preparation
    });
  } catch (error) {
    console.error('Error preparing portfolio from model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/etfs/prepare-custom
 * Prepare trades for creating a portfolio from custom ETF allocations
 */
router.post('/prepare-custom', (req, res) => {
  try {
    const { allocations, amount } = req.body;

    if (!allocations || !Array.isArray(allocations) || !amount) {
      return res.status(400).json({
        success: false,
        error: 'allocations array and amount are required'
      });
    }

    const preparation = etfService.preparePortfolioFromEtfs(allocations, amount);

    res.json({
      success: true,
      ...preparation
    });
  } catch (error) {
    console.error('Error preparing custom ETF portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Rebalancing
// ============================================

/**
 * POST /api/etfs/rebalance
 * Calculate rebalancing trades for an ETF portfolio
 */
router.post('/rebalance', (req, res) => {
  try {
    const { currentHoldings, targetModel, portfolioValue } = req.body;

    if (!currentHoldings || !targetModel || !portfolioValue) {
      return res.status(400).json({
        success: false,
        error: 'currentHoldings, targetModel, and portfolioValue are required'
      });
    }

    const trades = etfService.calculateRebalanceTrades(
      currentHoldings,
      targetModel,
      portfolioValue
    );

    res.json({
      success: true,
      ...trades
    });
  } catch (error) {
    console.error('Error calculating rebalance trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
