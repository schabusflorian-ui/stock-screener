// src/api/routes/investors.js
// API routes for famous investors and 13F holdings

const express = require('express');
const router = express.Router();
const investorService = require('../../services/portfolio/investorService');
const { responseCacheMiddleware } = require('../../middleware/apiOptimization');

// Cache configurations (Tier 3 optimization)
const CACHE_LONG = { ttl: 300000 };   // 5 minutes for leaderboard/aggregates

// ============================================
// Investor List and Details
// ============================================

/**
 * GET /api/investors/search-cik
 * Search for CIK numbers by investor/fund name using live SEC data
 */
router.get('/search-cik', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 3 characters'
      });
    }

    const https = require('https');

    // First, try the SEC's CIK lookup JSON endpoint
    // This uses their bulk data which is more reliable
    const cikLookupUrl = 'https://www.sec.gov/files/company_tickers.json';

    const options = {
      headers: {
        'User-Agent': 'Investment Analysis Platform admin@investmentplatform.com',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    };

    // Fetch the company tickers JSON
    const companyData = await new Promise((resolve, reject) => {
      const request = https.get(cikLookupUrl, options, (response) => {
        let data = '';

        // Handle gzip/deflate compression
        const encoding = response.headers['content-encoding'];
        let stream = response;

        if (encoding === 'gzip') {
          const zlib = require('zlib');
          stream = response.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          const zlib = require('zlib');
          stream = response.pipe(zlib.createInflate());
        }

        stream.on('data', chunk => data += chunk);
        stream.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            console.error('Failed to parse SEC JSON:', e.message);
            resolve({});
          }
        });
        stream.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });

    // Search through the companies
    const queryLower = query.toLowerCase();
    const results = [];

    for (const key in companyData) {
      const company = companyData[key];
      if (company && company.title) {
        const titleLower = company.title.toLowerCase();

        // Check if query matches the company title
        if (titleLower.includes(queryLower)) {
          const cik = String(company.cik_str).padStart(10, '0');
          const name = company.title;

          // Try to identify if this is a fund/investment company
          const is13FFiler = titleLower.includes('capital') ||
                            titleLower.includes('partners') ||
                            titleLower.includes('management') ||
                            titleLower.includes('fund') ||
                            titleLower.includes('investment') ||
                            titleLower.includes('advisors') ||
                            titleLower.includes('advisor') ||
                            titleLower.includes('asset') ||
                            titleLower.includes('holdings') ||
                            titleLower.includes('trust') ||
                            titleLower.includes('llc') ||
                            titleLower.includes('lp') ||
                            titleLower.includes('l.p.') ||
                            titleLower.includes('l.l.c.');

          results.push({
            cik,
            name,
            ticker: company.ticker || null,
            is13FFiler,
            confidence: is13FFiler ? 'high' : 'medium'
          });
        }
      }
    }

    // Sort by confidence (13F filers first), then by name
    results.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.confidence] - order[b.confidence];
      }
      return a.name.localeCompare(b.name);
    });

    // Limit to top 20 results
    const limitedResults = results.slice(0, 20);

    res.json({
      success: true,
      query,
      count: limitedResults.length,
      results: limitedResults,
      message: limitedResults.length === 0
        ? 'No matches found in SEC database. Try a different search term or enter CIK manually.'
        : `Found ${limitedResults.length} match${limitedResults.length !== 1 ? 'es' : ''} in SEC database. Click to select.`
    });
  } catch (error) {
    console.error('Error searching CIK:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search SEC database. Please try again or enter CIK manually.',
      details: error.message
    });
  }
});

// Cache for investor status
let investorStatusCache = { data: null, lastUpdated: null };
const INVESTOR_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/investors/status
 * Quick status for 13F holdings - used by Updates Dashboard
 */
router.get('/status', async (req, res) => {
  try {
    // Return cached if fresh
    if (investorStatusCache.data && investorStatusCache.lastUpdated &&
        (Date.now() - investorStatusCache.lastUpdated) < INVESTOR_STATUS_CACHE_TTL) {
      return res.json({ ...investorStatusCache.data, cached: true });
    }

    const db = req.app.get('db');
    // Simple fast query - just get counts and latest filing date
    const stats = await db.prepare(`
      SELECT
        COUNT(*) as investor_count,
        MAX(latest_filing_date) as latest_filing
      FROM famous_investors
      WHERE latest_filing_date IS NOT NULL
    `).get();

    const holdingsCount = await db.prepare(`
      SELECT COUNT(*) as count FROM investor_holdings
    `).get();

    const result = {
      success: true,
      investorCount: stats.investor_count,
      holdingsCount: holdingsCount.count,
      latestFiling: stats.latest_filing,
      lastUpdate: stats.latest_filing
    };

    // Cache it
    investorStatusCache = { data: result, lastUpdated: Date.now() };

    res.json(result);
  } catch (error) {
    console.error('Error fetching investor status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors
 * List all famous investors
 */
router.get('/', async (req, res) => {
  try {
    const investors = await investorService.getAllInvestors();
    res.json({
      success: true,
      count: investors.length,
      investors
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/most-owned
 * Get stocks most owned by famous investors
 */
router.get('/most-owned', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const stocks = investorService.getMostOwnedStocks(limit);
    res.json({
      success: true,
      count: stocks.length,
      stocks
    });
  } catch (error) {
    console.error('Error fetching most owned stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/returns/leaderboard
 * Get returns summary for all investors (leaderboard)
 * OPTIMIZED: Uses batch query instead of N+1 pattern (Tier 3 optimization)
 * CACHED: 5 minute TTL since data changes infrequently
 */
router.get('/returns/leaderboard', responseCacheMiddleware(CACHE_LONG), (req, res) => {
  try {
    // Use optimized batch function instead of N+1 loop
    const results = investorService.getAllInvestorReturnsSummary();

    res.json({
      success: true,
      count: results.length,
      investors: results
    });
  } catch (error) {
    console.error('Error fetching investor returns leaderboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/activity
 * Get recent investor activity (new buys, sells)
 */
router.get('/activity', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activity = investorService.getRecentActivity(limit);
    res.json({
      success: true,
      count: activity.length,
      activity
    });
  } catch (error) {
    console.error('Error fetching investor activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/by-stock/:symbol
 * Get investors who own a specific stock
 */
router.get('/by-stock/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const investors = investorService.getInvestorsBySymbol(symbol.toUpperCase());
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      count: investors.length,
      investors
    });
  } catch (error) {
    console.error('Error fetching investors by stock:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id
 * Get single investor with details
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const investor = investorService.getInvestor(id);

    if (!investor) {
      return res.status(404).json({ success: false, error: 'Investor not found' });
    }

    res.json({
      success: true,
      investor
    });
  } catch (error) {
    console.error('Error fetching investor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/holdings
 * Get latest holdings for an investor
 * Query params:
 *   - optionType: 'all' (default) | 'stock' | 'put' | 'call' | 'options'
 *   - limit: number (default 100)
 *   - sortBy: column name
 *   - sortOrder: 'ASC' | 'DESC'
 */
router.get('/:id/holdings', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'market_value';
    const sortOrder = req.query.sortOrder || 'DESC';
    const optionType = req.query.optionType || 'all';

    const data = investorService.getLatestHoldings(id, { limit, sortBy, sortOrder });

    // Filter by option type if specified (case-insensitive)
    let filteredHoldings = data.holdings;
    if (optionType === 'stock') {
      filteredHoldings = data.holdings.filter(h => !h.option_type);
    } else if (optionType === 'put') {
      filteredHoldings = data.holdings.filter(h => (h.option_type || '').toUpperCase() === 'PUT');
    } else if (optionType === 'call') {
      filteredHoldings = data.holdings.filter(h => (h.option_type || '').toUpperCase() === 'CALL');
    } else if (optionType === 'options') {
      filteredHoldings = data.holdings.filter(h => h.option_type);
    }

    // Calculate breakdown by type
    const breakdown = {
      stock: { count: 0, value: 0, weight: 0 },
      put: { count: 0, value: 0, weight: 0 },
      call: { count: 0, value: 0, weight: 0 }
    };

    for (const h of data.holdings) {
      const optType = (h.option_type || '').toUpperCase();
      if (optType === 'PUT') {
        breakdown.put.count++;
        breakdown.put.value += h.market_value || 0;
        breakdown.put.weight += h.portfolio_weight || 0;
      } else if (optType === 'CALL') {
        breakdown.call.count++;
        breakdown.call.value += h.market_value || 0;
        breakdown.call.weight += h.portfolio_weight || 0;
      } else {
        breakdown.stock.count++;
        breakdown.stock.value += h.market_value || 0;
        breakdown.stock.weight += h.portfolio_weight || 0;
      }
    }

    res.json({
      success: true,
      holdings: filteredHoldings,
      filingDate: data.filingDate,
      totalValue: data.totalValue,
      totalPositions: data.holdings.length,
      filteredPositions: filteredHoldings.length,
      breakdown // NEW: Stock vs Options breakdown
    });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/changes
 * Get holding changes from latest filing
 */
router.get('/:id/changes', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const changes = investorService.getHoldingChanges(id);
    res.json({
      success: true,
      changes
    });
  } catch (error) {
    console.error('Error fetching holding changes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/history
 * Get holdings history over time
 */
router.get('/:id/history', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const periods = parseInt(req.query.periods) || 4;
    const history = investorService.getHoldingsHistory(id, { periods });
    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error fetching holdings history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/performance
 * Get portfolio value history for performance charts
 * Returns quarterly values and returns over time
 * OPTIMIZED: Added response cache for repeated requests
 */
router.get('/:id/performance', responseCacheMiddleware(CACHE_LONG), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 40;
    const data = investorService.getPortfolioValueHistory(id, { limit });
    res.json({
      success: true,
      investorId: id,
      ...data
    });
  } catch (error) {
    console.error('Error fetching portfolio performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/returns
 * Get actual portfolio returns based on stock price changes
 * Includes S&P 500 benchmark comparison and alpha calculation
 * OPTIMIZED: Uses pre-calculated cache to avoid expensive recalculation
 */
router.get('/:id/returns', responseCacheMiddleware(CACHE_LONG), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Use cached performance data (calculates on first request, serves from cache after)
    const data = investorService.getCachedPerformance(id);

    if (!data.summary) {
      return res.status(404).json({
        success: false,
        error: 'Not enough data to calculate returns'
      });
    }

    res.json({
      success: true,
      investorId: id,
      cached: data.cached || false,
      ...data
    });
  } catch (error) {
    console.error('Error fetching portfolio returns:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/cache/status
 * Get performance cache status for all investors
 */
router.get('/cache/status', (req, res) => {
  try {
    const status = investorService.getPerformanceCacheStatus();
    res.json({
      success: true,
      investors: status,
      cachedCount: status.filter(s => s.cached_quarters > 0).length,
      totalCount: status.length
    });
  } catch (error) {
    console.error('Error fetching cache status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/investors/cache/recalculate
 * Recalculate performance cache for all investors
 */
router.post('/cache/recalculate', (req, res) => {
  try {
    const results = investorService.recalculateAllPerformance();
    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    console.error('Error recalculating performance cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/investors/:id/cache/invalidate
 * Invalidate performance cache for a specific investor
 */
router.post('/:id/cache/invalidate', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    investorService.invalidatePerformanceCache(id);
    res.json({
      success: true,
      message: `Performance cache invalidated for investor ${id}`
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/stats
 * Get investor statistics and analytics
 */
router.get('/:id/stats', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const stats = investorService.getInvestorStats(id);

    if (!stats) {
      return res.status(404).json({ success: false, error: 'Investor not found' });
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching investor stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 13F Fetching
// ============================================

/**
 * POST /api/investors/:id/fetch-13f
 * Fetch latest 13F filing for an investor
 */
router.post('/:id/fetch-13f', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await investorService.fetch13F(id);
    res.json(result);
  } catch (error) {
    console.error('Error fetching 13F:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/investors/fetch-all-13f
 * Fetch 13F filings for all active investors (background task)
 */
router.post('/fetch-all-13f', async (req, res) => {
  try {
    // Start in background
    res.json({
      success: true,
      message: 'Started fetching 13F filings for all investors'
    });

    // Run in background
    setImmediate(async () => {
      try {
        const results = await investorService.fetchAll13Fs();
        console.log('13F fetch complete:', results);
      } catch (error) {
        console.error('Error in background 13F fetch:', error);
      }
    });
  } catch (error) {
    console.error('Error starting 13F fetch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Portfolio Cloning
// ============================================

/**
 * POST /api/investors/:id/clone
 * Prepare clone data for creating a portfolio
 * Note: Actual portfolio creation is handled by Agent 1's portfolio routes
 */
router.post('/:id/clone', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      amount = 10000,
      minWeight = 0,
      maxPositions = null,
      excludeSymbols = []
    } = req.body;

    const cloneData = investorService.prepareClone(id, {
      amount,
      minWeight,
      maxPositions,
      excludeSymbols
    });

    res.json({
      success: true,
      ...cloneData
    });
  } catch (error) {
    console.error('Error preparing clone:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/investors/:id/clone-preview
 * Preview what a clone would look like without creating it
 * Returns trades array with shares, currentPrice for executing purchases
 */
router.get('/:id/clone-preview', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const amount = parseFloat(req.query.amount) || 10000;
    const minWeight = parseFloat(req.query.minWeight) || 0;
    const maxPositions = req.query.maxPositions ? parseInt(req.query.maxPositions) : null;

    // Don't actually increment follower count for preview
    const { holdings, filingDate } = investorService.getLatestHoldings(id, { limit: 1000 });

    if (!holdings.length) {
      return res.status(400).json({ success: false, error: 'No holdings found' });
    }

    // Filter to holdings that have symbols and meet weight threshold
    // Also filter out holdings without current price (can't calculate shares)
    let filteredHoldings = holdings
      .filter(h => h.symbol && h.portfolio_weight >= minWeight && h.current_price > 0)
      .sort((a, b) => b.portfolio_weight - a.portfolio_weight);

    if (maxPositions) {
      filteredHoldings = filteredHoldings.slice(0, maxPositions);
    }

    const totalWeight = filteredHoldings.reduce((sum, h) => sum + h.portfolio_weight, 0);

    // Build trades array with shares and prices for executing purchases
    const trades = filteredHoldings.map(h => {
      const normalizedWeight = h.portfolio_weight / totalWeight;
      const targetValue = amount * normalizedWeight;
      const currentPrice = h.current_price;
      // Calculate whole shares (most brokers don't support fractional shares)
      const shares = Math.floor(targetValue / currentPrice);
      const estimatedCost = shares * currentPrice;

      return {
        symbol: h.symbol,
        companyId: h.company_id,
        companyName: h.company_name,
        sector: h.sector,
        weight: normalizedWeight * 100,
        targetValue,
        currentPrice,
        shares,
        estimatedCost,
        originalWeight: h.portfolio_weight
      };
    });

    // Filter out trades where we can't afford even 1 share
    const viableTrades = trades.filter(t => t.shares > 0);

    // Calculate summary stats
    const totalEstimatedCost = viableTrades.reduce((sum, t) => sum + t.estimatedCost, 0);
    const remainingCash = amount - totalEstimatedCost;

    res.json({
      success: true,
      filingDate,
      amount,
      positionsCount: viableTrades.length,
      excludedCount: holdings.length - filteredHoldings.length,
      skippedCount: trades.length - viableTrades.length, // Trades we couldn't afford
      totalEstimatedCost,
      remainingCash,
      trades: viableTrades
    });
  } catch (error) {
    console.error('Error generating clone preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
