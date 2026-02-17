// src/api/routes/data.js

/**
 * Unified Data API Routes
 *
 * Provides a single API interface for accessing company data regardless of source.
 * Routes requests through the DataRouter which handles country-based routing.
 *
 * Endpoints:
 * - GET /api/data/fundamentals/:symbol - Get company fundamentals
 * - GET /api/data/quote/:symbol - Get current quote
 * - GET /api/data/prices/:symbol - Get historical prices
 * - GET /api/data/overview/:symbol - Get company overview
 * - GET /api/data/income/:symbol - Get income statement
 * - GET /api/data/balance/:symbol - Get balance sheet
 * - GET /api/data/cashflow/:symbol - Get cash flow
 * - GET /api/data/ratios/:symbol - Get financial ratios
 * - GET /api/data/search - Search companies
 * - GET /api/data/availability/:symbol - Get data availability
 * - GET /api/data/countries/:code - Get companies by country
 * - GET /api/data/stats - Get data coverage statistics
 * - POST /api/data/batch/fundamentals - Batch get fundamentals
 */

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const { DataRouter } = require('../../services/dataRouter');

// Initialize DataRouter with database
let dataRouter = null;

function getDataRouter() {
  if (!dataRouter) {
    dataRouter = new DataRouter(null, {
      alphaVantageKey: process.env.ALPHA_VANTAGE_KEY,
    });
  }
  return dataRouter;
}

/**
 * GET /api/data/fundamentals/:symbol
 * Get company fundamentals (income, balance, cash flow)
 */
router.get('/fundamentals/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const data = await router.getFundamentals(symbol, country);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: `No fundamentals found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Fundamentals API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/quote/:symbol
 * Get current stock quote
 */
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const router = getDataRouter();
    const quote = await router.getQuote(symbol);

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: `No quote available for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error('Quote API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/prices/:symbol
 * Get historical price data
 */
router.get('/prices/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = 'daily', outputSize = 'compact' } = req.query;

    const router = getDataRouter();
    const prices = await router.getPrices(symbol, { interval, outputSize });

    res.json({
      success: true,
      data: prices,
      count: prices.length,
    });
  } catch (error) {
    console.error('Prices API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/overview/:symbol
 * Get company overview/profile
 */
router.get('/overview/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const overview = await router.getCompanyOverview(symbol, country);

    if (!overview) {
      return res.status(404).json({
        success: false,
        error: `No overview found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    console.error('Overview API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/income/:symbol
 * Get income statement
 */
router.get('/income/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const income = await router.getIncomeStatement(symbol, country);

    if (!income) {
      return res.status(404).json({
        success: false,
        error: `No income statement found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: income,
    });
  } catch (error) {
    console.error('Income statement API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/balance/:symbol
 * Get balance sheet
 */
router.get('/balance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const balance = await router.getBalanceSheet(symbol, country);

    if (!balance) {
      return res.status(404).json({
        success: false,
        error: `No balance sheet found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    console.error('Balance sheet API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/cashflow/:symbol
 * Get cash flow statement
 */
router.get('/cashflow/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const cashflow = await router.getCashFlow(symbol, country);

    if (!cashflow) {
      return res.status(404).json({
        success: false,
        error: `No cash flow statement found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: cashflow,
    });
  } catch (error) {
    console.error('Cash flow API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/ratios/:symbol
 * Get financial ratios (calculated from fundamentals + price)
 */
router.get('/ratios/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const ratios = await router.getFinancialRatios(symbol, country);

    if (!ratios) {
      return res.status(404).json({
        success: false,
        error: `Unable to calculate ratios for ${symbol}`,
      });
    }

    res.json({
      success: true,
      data: ratios,
    });
  } catch (error) {
    console.error('Ratios API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/search
 * Search companies across all markets
 */
router.get('/search', async (req, res) => {
  try {
    const { q, excludeXBRL, excludeAlphaVantage, limit } = req.query;

    if (!q || q.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
      });
    }

    const router = getDataRouter();
    const results = await router.searchCompanies(q, {
      excludeXBRL: excludeXBRL === 'true',
      excludeAlphaVantage: excludeAlphaVantage === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    });

    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/availability/:symbol
 * Get data availability for a symbol
 */
router.get('/availability/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { country } = req.query;

    const router = getDataRouter();
    const availability = await router.getDataAvailability(symbol, country);

    res.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Availability API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/countries/:code
 * Get companies by country
 */
router.get('/countries/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { limit } = req.query;

    const router = getDataRouter();
    const companies = await router.getCompaniesByCountry(code, {
      limit: limit ? parseInt(limit, 10) : 100,
    });

    res.json({
      success: true,
      data: companies,
      count: companies.length,
      country: code.toUpperCase(),
    });
  } catch (error) {
    console.error('Countries API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/stats
 * Get data coverage statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const router = getDataRouter();
    const stats = router.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/data/batch/fundamentals
 * Batch get fundamentals for multiple symbols
 * Body: { identifiers: [{ symbol, country }] }
 */
router.post('/batch/fundamentals', async (req, res) => {
  try {
    const { identifiers } = req.body;

    if (!identifiers || !Array.isArray(identifiers)) {
      return res.status(400).json({
        success: false,
        error: 'identifiers array is required in request body',
      });
    }

    if (identifiers.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 identifiers per batch request',
      });
    }

    const router = getDataRouter();
    const results = await router.batchGetFundamentals(identifiers);

    res.json({
      success: true,
      data: results,
      count: results.length,
      successCount: results.filter(r => r.data).length,
      errorCount: results.filter(r => r.error).length,
    });
  } catch (error) {
    console.error('Batch fundamentals API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/data/routing
 * Get routing configuration (for debugging)
 */
router.get('/routing', (req, res) => {
  const { FUNDAMENTALS_SOURCE, PRICE_SOURCE } = require('../../services/dataRouter');

  res.json({
    success: true,
    data: {
      fundamentalsSources: FUNDAMENTALS_SOURCE,
      priceSource: PRICE_SOURCE,
      explanation: {
        alphavantage: 'Uses Alpha Vantage API for US/CA stocks',
        xbrl: 'Uses XBRL filings from filings.xbrl.org for EU/UK stocks',
      },
    },
  });
});

// ============================================
// EUROPEAN DATA ENDPOINTS
// ============================================

/**
 * GET /api/data/european/status
 * Get status of EU/UK data coverage
 */
router.get('/european/status', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    // Get country breakdown
    const countryCountsResult = await database.query(`
      SELECT country, COUNT(*) as count
      FROM companies
      WHERE country NOT IN ('US', 'USA') AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
    `);
    const countryCounts = countryCountsResult.rows;

    // Get price coverage for EU/UK
    const priceCoverageResult = await database.query(`
      SELECT
        c.country,
        COUNT(DISTINCT c.id) as companies,
        COUNT(DISTINCT CASE WHEN pm.last_price IS NOT NULL THEN c.id END) as with_prices
      FROM companies c
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA') AND c.country IS NOT NULL
      GROUP BY c.country
    `);
    const priceCoverage = priceCoverageResult.rows;

    // Get valuation coverage
    const valuationCoverageResult = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_pe,
        SUM(CASE WHEN pb_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_pb
      FROM calculated_metrics cm
      JOIN companies c ON c.id = cm.company_id
      WHERE c.country NOT IN ('US', 'USA')
    `);
    const valuationCoverage = valuationCoverageResult.rows[0];

    res.json({
      success: true,
      data: {
        countries: countryCounts,
        priceCoverage,
        valuationCoverage,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('European status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/data/european/prices
 * Trigger price update for EU/UK companies
 */
router.post('/european/prices', async (req, res) => {
  try {
    const { country = 'GB' } = req.body;
    const { spawn } = require('child_process');
    const path = require('path');

    const projectRoot = path.join(__dirname, '../../..');
    const script = path.join(projectRoot, 'python-services', 'price_updater.py');

    const child = spawn('python3', [script, 'test-country', '-c', country, '-l', '500'], {
      cwd: projectRoot
    });

    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    child.on('close', (code) => {
      const successMatch = output.match(/Successful: (\d+)/);
      const failedMatch = output.match(/Failed: (\d+)/);

      res.json({
        success: code === 0,
        data: {
          country,
          successful: successMatch ? parseInt(successMatch[1]) : 0,
          failed: failedMatch ? parseInt(failedMatch[1]) : 0,
          exitCode: code
        }
      });
    });

    child.on('error', (err) => {
      res.status(500).json({ success: false, error: err.message });
    });

  } catch (error) {
    console.error('European prices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/data/european/indices
 * Update European index constituents (FTSE, DAX, CAC)
 */
router.post('/european/indices', async (req, res) => {
  try {
    const { spawn } = require('child_process');
    const path = require('path');

    const projectRoot = path.join(__dirname, '../../..');
    const script = path.join(projectRoot, 'python-services', 'european_index_fetcher.py');

    const child = spawn('python3', [script, 'all'], {
      cwd: projectRoot
    });

    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    child.on('close', (code) => {
      res.json({
        success: code === 0,
        data: { output, exitCode: code }
      });
    });

    child.on('error', (err) => {
      res.status(500).json({ success: false, error: err.message });
    });

  } catch (error) {
    console.error('European indices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/data/european/valuations
 * Calculate valuations for EU/UK companies
 */
router.post('/european/valuations', async (req, res) => {
  try {
    const { ValuationService } = require('../../services/xbrl');

    const valuationService = new ValuationService();
    const result = await valuationService.updateAllValuations();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('European valuations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/data/european/enrich
 * Enrich EU/UK companies with sector/industry data
 */
router.post('/european/enrich', async (req, res) => {
  try {
    const { EnrichmentService } = require('../../services/xbrl');

    const enrichmentService = new EnrichmentService();
    const result = await enrichmentService.enrichAllWithoutSector({ limit: 100 });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('European enrichment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/data/european/index-stats
 * Get European index membership statistics
 */
router.get('/european/index-stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const statsResult = await database.query(`
      SELECT
        SUM(is_ftse) as ftse_count,
        SUM(is_dax) as dax_count,
        SUM(is_cac) as cac_count,
        SUM(is_eurostoxx50) as eurostoxx_count
      FROM companies
    `);
    const stats = statsResult.rows[0];

    res.json({
      success: true,
      data: {
        ftse100: { expected: 100, actual: stats.ftse_count || 0 },
        dax40: { expected: 40, actual: stats.dax_count || 0 },
        cac40: { expected: 40, actual: stats.cac_count || 0 },
        eurostoxx50: { expected: 50, actual: stats.eurostoxx_count || 0 }
      }
    });
  } catch (error) {
    console.error('European index stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/data/european/companies
 * Get companies by country
 */
router.get('/european/companies', async (req, res) => {
  try {
    const { country, limit = 100 } = req.query;
    const database = await getDatabaseAsync();

    let query = `
      SELECT c.id, c.symbol, c.name, c.country, c.sector, c.industry,
             pm.latest_price, pm.market_cap,
             cm.pe_ratio, cm.pb_ratio, cm.roe
      FROM companies c
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      LEFT JOIN calculated_metrics cm ON cm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA')
    `;

    const params = [];
    if (country) {
      query += ' AND c.country = $1';
      params.push(country.toUpperCase());
    }

    const limitParam = params.length + 1;
    query += ` ORDER BY pm.market_cap DESC NULLS LAST LIMIT $${limitParam}`;
    params.push(parseInt(limit, 10));

    const companiesResult = await database.query(query, params);
    const companies = companiesResult.rows;

    res.json({
      success: true,
      data: companies,
      count: companies.length
    });
  } catch (error) {
    console.error('European companies error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
