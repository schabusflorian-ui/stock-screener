// src/api/routes/investors.js
// API routes for famous investors and 13F holdings

const express = require('express');
const router = express.Router();
const investorService = require('../../services/portfolio/investorService');

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

/**
 * GET /api/investors
 * List all famous investors
 */
router.get('/', (req, res) => {
  try {
    const investors = investorService.getAllInvestors();
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
 */
router.get('/returns/leaderboard', (req, res) => {
  try {
    const investors = investorService.getAllInvestors();
    const results = [];

    for (const inv of investors) {
      try {
        const data = investorService.getPortfolioReturns(inv.id, { limit: 50 });
        if (data.summary) {
          results.push({
            id: inv.id,
            name: inv.name,
            fundName: inv.fund_name,
            ...data.summary
          });
        }
      } catch (e) {
        // Skip investors with errors
      }
    }

    // Sort by annualized return
    results.sort((a, b) => (b.annualizedReturn || 0) - (a.annualizedReturn || 0));

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
 */
router.get('/:id/holdings', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 100;
    const sortBy = req.query.sortBy || 'market_value';
    const sortOrder = req.query.sortOrder || 'DESC';

    const data = investorService.getLatestHoldings(id, { limit, sortBy, sortOrder });
    res.json({
      success: true,
      ...data
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
 */
router.get('/:id/performance', (req, res) => {
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
 */
router.get('/:id/returns', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    const data = investorService.getPortfolioReturns(id, { limit });

    if (!data.summary) {
      return res.status(404).json({
        success: false,
        error: 'Not enough data to calculate returns'
      });
    }

    res.json({
      success: true,
      investorId: id,
      ...data
    });
  } catch (error) {
    console.error('Error fetching portfolio returns:', error);
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

    let filteredHoldings = holdings
      .filter(h => h.symbol && h.portfolio_weight >= minWeight)
      .sort((a, b) => b.portfolio_weight - a.portfolio_weight);

    if (maxPositions) {
      filteredHoldings = filteredHoldings.slice(0, maxPositions);
    }

    const totalWeight = filteredHoldings.reduce((sum, h) => sum + h.portfolio_weight, 0);

    const preview = filteredHoldings.map(h => {
      const normalizedWeight = h.portfolio_weight / totalWeight;
      return {
        symbol: h.symbol,
        companyName: h.company_name,
        sector: h.sector,
        weight: normalizedWeight * 100,
        targetValue: amount * normalizedWeight,
        originalWeight: h.portfolio_weight
      };
    });

    res.json({
      success: true,
      filingDate,
      amount,
      positionsCount: preview.length,
      excludedCount: holdings.length - filteredHoldings.length,
      preview
    });
  } catch (error) {
    console.error('Error generating clone preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
