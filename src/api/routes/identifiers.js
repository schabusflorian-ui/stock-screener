// src/api/routes/identifiers.js
/**
 * Identifier Resolution API Routes
 *
 * Provides REST API endpoints for the identifier resolution services (Agent 11).
 * Maps LEI, ISIN, and tickers to tradeable Yahoo Finance symbols.
 *
 * Endpoints:
 * - GET /api/identifiers/resolve/lei/:lei - Resolve LEI to symbols
 * - GET /api/identifiers/resolve/isin/:isin - Resolve ISIN to symbols
 * - GET /api/identifiers/resolve/ticker/:ticker - Resolve ticker to FIGI
 * - GET /api/identifiers/resolve/yahoo/:symbol - Parse Yahoo symbol
 * - POST /api/identifiers/resolve/batch - Batch resolve identifiers
 * - GET /api/identifiers/link/:lei - Link company to companies table
 * - GET /api/identifiers/lookup - Lookup identifier records
 * - GET /api/identifiers/unlinked - Get unlinked identifiers
 * - GET /api/identifiers/stats - Get linking statistics
 * - GET /api/identifiers/exchanges - Get supported exchanges
 * - GET /api/identifiers/exchanges/:country - Get exchanges by country
 */

const express = require('express');
const router = express.Router();
const { db } = require('../../database');
const identifiers = require('../../services/identifiers');

// Initialize services
let services = null;

function getServices() {
  if (!services) {
    services = identifiers.createServices(db, {
      openFigiKey: process.env.OPENFIGI_API_KEY,
      cacheTtlDays: 7,
    });
  }
  return services;
}

// ============================================
// Resolution Endpoints
// ============================================

/**
 * GET /api/identifiers/resolve/lei/:lei
 * Resolve LEI to company info and tradeable symbols
 */
router.get('/resolve/lei/:lei', async (req, res) => {
  try {
    const { lei } = req.params;

    // Validate LEI format
    if (!identifiers.GleifClient.validateLei(lei)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid LEI format - must be 20 alphanumeric characters with valid checksum',
      });
    }

    const svc = getServices();
    const result = await svc.resolver.resolveFromLEI(lei);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `LEI not found: ${lei}`,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('LEI resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/resolve/isin/:isin
 * Resolve ISIN to tradeable symbols
 */
router.get('/resolve/isin/:isin', async (req, res) => {
  try {
    const { isin } = req.params;

    if (!isin || isin.length !== 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ISIN format - must be 12 characters',
      });
    }

    const svc = getServices();
    const result = await svc.resolver.resolveFromISIN(isin);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('ISIN resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/resolve/ticker/:ticker
 * Resolve ticker + exchange to FIGI
 * Query params: exchange (required)
 */
router.get('/resolve/ticker/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { exchange } = req.query;

    if (!exchange) {
      return res.status(400).json({
        success: false,
        error: 'Exchange code (exchange query param) is required',
      });
    }

    const svc = getServices();
    const result = await svc.resolver.resolveFromTicker(ticker, exchange);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Ticker resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/resolve/yahoo/:symbol
 * Parse Yahoo Finance symbol to extract ticker, exchange, country
 */
router.get('/resolve/yahoo/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const svc = getServices();
    const parsed = svc.exchange.parseYahooSymbol(symbol);

    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: 'Could not parse Yahoo symbol',
      });
    }

    // Optionally resolve to FIGI
    const { resolve } = req.query;
    if (resolve === 'true') {
      const resolved = await svc.resolver.resolveFromTicker(
        parsed.ticker,
        parsed.exchangeCode
      );
      return res.json({
        success: true,
        data: { ...parsed, ...resolved },
      });
    }

    res.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error('Yahoo symbol parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/identifiers/resolve/batch
 * Batch resolve multiple identifiers
 * Body: { type: 'lei'|'isin', identifiers: string[] }
 */
router.post('/resolve/batch', async (req, res) => {
  try {
    const { type, identifiers: ids } = req.body;

    if (!type || !['lei', 'isin'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be "lei" or "isin"',
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'identifiers must be a non-empty array',
      });
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 identifiers per batch',
      });
    }

    const svc = getServices();
    let results;

    if (type === 'lei') {
      results = await svc.resolver.batchResolveFromLEI(ids);
    } else {
      results = await svc.resolver.batchResolveFromISIN(ids);
    }

    // Convert Map to object for JSON response
    const data = {};
    for (const [key, value] of results) {
      data[key] = value;
    }

    res.json({
      success: true,
      count: results.size,
      data,
    });
  } catch (error) {
    console.error('Batch resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Company Linking Endpoints
// ============================================

/**
 * POST /api/identifiers/link/:lei
 * Link a company by LEI to the companies table
 * Body: { companyName, country, isin, cik, createIfMissing }
 */
router.post('/link/:lei', async (req, res) => {
  try {
    const { lei } = req.params;
    const options = req.body || {};

    if (!identifiers.GleifClient.validateLei(lei)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid LEI format',
      });
    }

    const svc = getServices();
    const result = await svc.linker.linkCompany(lei, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Company link error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/identifiers/link-isin/:isin
 * Link a company by ISIN to the companies table
 */
router.post('/link-isin/:isin', async (req, res) => {
  try {
    const { isin } = req.params;
    const options = req.body || {};

    if (!isin || isin.length !== 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ISIN format - must be 12 characters',
      });
    }

    const svc = getServices();
    const result = await svc.linker.linkCompanyByISIN(isin, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('ISIN link error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/identifiers/manual-link
 * Manually link an LEI to an existing company
 * Body: { lei, companyId }
 */
router.post('/manual-link', async (req, res) => {
  try {
    const { lei, companyId } = req.body;

    if (!lei || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'Both lei and companyId are required',
      });
    }

    const svc = getServices();
    const success = await svc.linker.manualLink(lei, companyId);

    res.json({
      success,
      message: success ? 'Company linked successfully' : 'Link failed',
    });
  } catch (error) {
    console.error('Manual link error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Lookup Endpoints
// ============================================

/**
 * GET /api/identifiers/lookup
 * Lookup identifier records by various keys
 * Query params: lei, isin, yahooSymbol, companyId
 */
router.get('/lookup', async (req, res) => {
  try {
    const { lei, isin, yahooSymbol, companyId } = req.query;

    if (!lei && !isin && !yahooSymbol && !companyId) {
      return res.status(400).json({
        success: false,
        error: 'At least one query parameter required: lei, isin, yahooSymbol, or companyId',
      });
    }

    const svc = getServices();
    const record = await svc.linker.lookupIdentifiers({
      lei,
      isin,
      yahooSymbol,
      companyId: companyId ? parseInt(companyId) : undefined,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'No identifier record found',
      });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('Lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/company/:companyId
 * Get all identifiers for a specific company
 */
router.get('/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const svc = getServices();
    const records = await svc.linker.getCompanyIdentifiers(parseInt(companyId));

    res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error('Company identifiers error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/unlinked
 * Get unlinked identifiers for manual review
 * Query params: limit (default 100)
 */
router.get('/unlinked', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    const svc = getServices();
    const records = await svc.linker.getUnlinkedIdentifiers(limit);

    res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error('Unlinked fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/stats
 * Get linking statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const svc = getServices();
    const stats = await svc.linker.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Exchange Info Endpoints
// ============================================

/**
 * GET /api/identifiers/exchanges
 * Get all supported exchanges
 */
router.get('/exchanges', async (req, res) => {
  try {
    const svc = getServices();
    const exchanges = await svc.exchange.getAllExchanges();

    res.json({
      success: true,
      count: Object.keys(exchanges).length,
      data: exchanges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/exchanges/european
 * Get European exchanges only
 */
router.get('/exchanges/european', async (req, res) => {
  try {
    const svc = getServices();
    const exchanges = await svc.exchange.getEuropeanExchanges();

    res.json({
      success: true,
      count: exchanges.length,
      data: exchanges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/exchanges/country/:code
 * Get exchanges for a specific country
 */
router.get('/exchanges/country/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const svc = getServices();
    const exchanges = await svc.exchange.getExchangesForCountry(code);

    if (exchanges.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No exchanges found for country: ${code}`,
      });
    }

    res.json({
      success: true,
      country: code.toUpperCase(),
      count: exchanges.length,
      data: exchanges,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/identifiers/exchanges/:mic
 * Get info for a specific exchange by MIC code
 */
router.get('/exchanges/:mic', async (req, res) => {
  try {
    const { mic } = req.params;

    const svc = getServices();
    const info = await svc.exchange.getExchangeInfo(mic.toUpperCase());

    if (!info) {
      return res.status(404).json({
        success: false,
        error: `Unknown exchange: ${mic}`,
      });
    }

    res.json({
      success: true,
      data: info,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// Utility Endpoints
// ============================================

/**
 * GET /api/identifiers/validate/lei/:lei
 * Validate an LEI format and checksum
 */
router.get('/validate/lei/:lei', async (req, res) => {
  const { lei } = req.params;
  const isValid = await identifiers.GleifClient.validateLei(lei);

  res.json({
    success: true,
    lei,
    valid: isValid,
  });
});

/**
 * GET /api/identifiers/symbol/:ticker
 * Get Yahoo symbol for ticker + exchange
 * Query: exchange (required)
 */
router.get('/symbol/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { exchange } = req.query;

    if (!exchange) {
      return res.status(400).json({
        success: false,
        error: 'Exchange code (exchange query param) is required',
      });
    }

    const svc = getServices();
    const yahooSymbol = await svc.exchange.getYahooSymbol(ticker, exchange);
    const exchangeInfo = await svc.exchange.getExchangeInfo(exchange);

    res.json({
      success: true,
      data: {
        ticker,
        exchange,
        yahooSymbol,
        exchangeName: exchangeInfo?.name,
        currency: exchangeInfo?.currency,
        country: exchangeInfo?.country,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/identifiers/cache/clear
 * Clear expired cache entries
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const svc = getServices();
    const cleared = await svc.resolver.clearExpiredCache();

    res.json({
      success: true,
      cleared,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
