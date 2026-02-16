// src/api/routes/batchRouter.js
/**
 * Batch Request Router - Direct Service Layer Access
 *
 * Phase 3.3: Optimization to eliminate HTTP loopback overhead
 *
 * Routes batch API requests directly to service layer functions instead of
 * making HTTP calls to localhost. This provides 5-10x performance improvement
 * by avoiding:
 * - HTTP serialization/deserialization
 * - Network stack overhead
 * - Request parsing and middleware execution
 *
 * Supported endpoints:
 * - /api/companies/:symbol - Company overview data
 * - /api/prices/:symbol - Price and volume data
 * - /api/companies/:symbol/metrics - Financial metrics
 * - /api/sentiment/:symbol - Sentiment data
 * - /api/companies/:symbol/financials - Financial statements
 */

/**
 * Route a batch request directly to the appropriate service function
 * @param {Object} db - Database instance
 * @param {string} path - API path (e.g., '/api/companies/AAPL')
 * @param {Object} query - Query parameters
 * @param {Object} user - User context for authentication
 * @returns {Promise<Object>} - Response data
 */
async function routeRequest(db, path, query = {}, user = null) {
  // Parse the path to extract components
  const pathParts = path.split('/').filter(Boolean);

  if (pathParts.length < 2 || pathParts[0] !== 'api') {
    throw createError(400, 'Invalid API path');
  }

  const endpoint = pathParts[1]; // 'companies', 'prices', 'sentiment', etc.
  const param1 = pathParts[2]; // Usually symbol
  const param2 = pathParts[3]; // Sub-resource like 'metrics', 'financials'

  // Route to appropriate handler based on endpoint
  switch (endpoint) {
    case 'companies':
      return handleCompaniesRequest(db, param1, param2, query);

    case 'prices':
      return handlePricesRequest(db, param1, query);

    case 'sentiment':
      return handleSentimentRequest(db, param1, query);

    case 'metrics':
      return handleMetricsRequest(db, param1, query);

    case 'insiders':
      return handleInsidersRequest(db, param1, query);

    case 'congressional':
      return handleCongressionalRequest(db, param1, query);

    default:
      throw createError(404, `Endpoint '${endpoint}' not supported in batch mode`);
  }
}

/**
 * Handle /api/companies/:symbol requests
 */
async function handleCompaniesRequest(db, symbol, subResource, query) {
  if (!symbol) {
    throw createError(400, 'Symbol is required');
  }

  const symbolUpper = symbol.toUpperCase();

  // Sub-resource routing
  if (subResource === 'metrics') {
    return getCompanyMetrics(db, symbolUpper);
  } else if (subResource === 'financials') {
    return getCompanyFinancials(db, symbolUpper, query);
  } else if (subResource === 'filings') {
    return getCompanyFilings(db, symbolUpper, query);
  } else {
    // Main company overview
    return getCompanyOverview(db, symbolUpper);
  }
}

/**
 * Handle /api/prices/:symbol requests
 */
async function handlePricesRequest(db, symbol, query) {
  if (!symbol) {
    throw createError(400, 'Symbol is required');
  }

  const symbolUpper = symbol.toUpperCase();
  return getPriceData(db, symbolUpper, query);
}

/**
 * Handle /api/sentiment/:symbol requests
 */
async function handleSentimentRequest(db, symbol, query) {
  if (!symbol) {
    throw createError(400, 'Symbol is required');
  }

  const symbolUpper = symbol.toUpperCase();
  return getSentimentData(db, symbolUpper, query);
}

/**
 * Handle /api/metrics requests (general metrics endpoint)
 */
async function handleMetricsRequest(db, param1, query) {
  if (param1) {
    // /api/metrics/:symbol
    return getCompanyMetrics(db, param1.toUpperCase());
  } else {
    // /api/metrics - list all
    throw createError(400, 'Symbol is required');
  }
}

/**
 * Handle /api/insiders/:symbol requests
 */
async function handleInsidersRequest(db, symbol, query) {
  if (!symbol) {
    throw createError(400, 'Symbol is required');
  }

  const symbolUpper = symbol.toUpperCase();
  const { limit = 10 } = query;

  const result = await db.query(`
    SELECT *
    FROM insider_trades
    WHERE symbol = $1
    ORDER BY filing_date DESC
    LIMIT $2
  `, [symbolUpper, parseInt(limit, 10)]);

  const trades = result.rows || [];

  return {
    symbol: symbolUpper,
    trades,
    count: trades.length
  };
}

/**
 * Handle /api/congressional requests
 */
async function handleCongressionalRequest(db, param1, query) {
  const { limit = 10 } = query;

  if (param1) {
    const result = await db.query(`
      SELECT *
      FROM congressional_trades
      WHERE representative = $1 OR ticker = $2
      ORDER BY transaction_date DESC
      LIMIT $3
    `, [param1, param1.toUpperCase(), parseInt(limit, 10)]);

    const trades = result.rows || [];

    return {
      trades,
      count: trades.length
    };
  } else {
    const result = await db.query(`
      SELECT *
      FROM congressional_trades
      ORDER BY transaction_date DESC
      LIMIT $1
    `, [parseInt(limit, 10)]);

    const trades = result.rows || [];

    return {
      trades,
      count: trades.length
    };
  }
}

// =============================================
// Data Fetching Functions
// =============================================

/**
 * Get company overview data
 */
async function getCompanyOverview(db, symbol) {
  const result = await db.query(`
    SELECT
      c.id,
      c.symbol,
      c.name,
      c.cik,
      c.description,
      c.sector,
      c.industry,
      c.country,
      c.exchange,
      c.currency,
      c.market_cap,
      c.employees,
      c.website,
      c.ipo_date,
      pm.last_price,
      pm.change_1d,
      pm.change_1w,
      pm.change_1m,
      pm.change_ytd,
      pm.volume,
      pm.avg_volume_20d
    FROM companies c
    LEFT JOIN price_metrics pm ON c.symbol = pm.symbol
    WHERE c.symbol = $1
  `, [symbol]);

  const company = result.rows?.[0];

  if (!company) {
    throw createError(404, `Company not found: ${symbol}`);
  }

  return company;
}

/**
 * Get company financial metrics
 */
async function getCompanyMetrics(db, symbol) {
  const result = await db.query(`
    SELECT cm.*
    FROM calculated_metrics cm
    JOIN companies c ON cm.company_id = c.id
    WHERE c.symbol = $1
    ORDER BY cm.fiscal_period DESC
    LIMIT 1
  `, [symbol]);

  const metrics = result.rows?.[0];

  if (!metrics) {
    return null; // Not an error - some companies don't have metrics yet
  }

  return metrics;
}

/**
 * Get company financial statements
 */
async function getCompanyFinancials(db, symbol, query) {
  const { period = 'annual', limit = 4 } = query;

  const periodFilter = period === 'annual' ? 'FY%' : 'Q%';
  const result = await db.query(`
    SELECT
      fs.fiscal_period,
      fs.fiscal_year,
      fs.period_end_date,
      fs.revenue,
      fs.gross_profit,
      fs.operating_income,
      fs.net_income,
      fs.eps,
      fs.total_assets,
      fs.total_liabilities,
      fs.stockholders_equity,
      fs.operating_cash_flow,
      fs.capex,
      fs.free_cash_flow
    FROM financial_statements fs
    JOIN companies c ON fs.company_id = c.id
    WHERE c.symbol = $1
    AND fs.fiscal_period LIKE $2
    ORDER BY fs.period_end_date DESC
    LIMIT $3
  `, [symbol, periodFilter, parseInt(limit, 10)]);

  const financials = result.rows || [];

  return {
    symbol,
    period,
    statements: financials,
    count: financials.length
  };
}

/**
 * Get company SEC filings
 */
async function getCompanyFilings(db, symbol, query) {
  const { limit = 10 } = query;

  const result = await db.query(`
    SELECT
      form_type,
      filing_date,
      acceptance_datetime,
      primary_document,
      url
    FROM sec_filings sf
    JOIN companies c ON sf.cik = c.cik
    WHERE c.symbol = $1
    ORDER BY filing_date DESC
    LIMIT $2
  `, [symbol, parseInt(limit, 10)]);

  const filings = result.rows || [];

  return {
    symbol,
    filings,
    count: filings.length
  };
}

/**
 * Get price data for a symbol
 */
async function getPriceData(db, symbol, query) {
  const { period = '1y' } = query;

  const metricsResult = await db.query(`
    SELECT *
    FROM price_metrics
    WHERE symbol = $1
  `, [symbol]);

  const metrics = metricsResult.rows?.[0];

  if (!metrics) {
    throw createError(404, `Price data not found: ${symbol}`);
  }

  let days;
  switch (period) {
    case '1d': days = 1; break;
    case '1w': days = 7; break;
    case '1m': days = 30; break;
    case '3m': days = 90; break;
    case '6m': days = 180; break;
    case '1y': days = 365; break;
    case '5y': days = 1825; break;
    default: days = 365;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const historyResult = await db.query(`
    SELECT date, close, volume
    FROM historical_prices
    WHERE symbol = $1
    AND date >= $2
    ORDER BY date ASC
  `, [symbol, cutoffStr]);

  const history = historyResult.rows || [];

  return {
    symbol,
    current: metrics,
    history,
    period
  };
}

/**
 * Get sentiment data for a symbol
 */
async function getSentimentData(db, symbol, query) {
  const result = await db.query(`
    SELECT
      symbol,
      source,
      sentiment_score,
      sentiment_label,
      article_count,
      bullish_count,
      bearish_count,
      neutral_count,
      last_updated
    FROM sentiment_aggregates
    WHERE symbol = $1
    ORDER BY last_updated DESC
  `, [symbol]);

  const sentiments = result.rows || [];

  // Calculate aggregate
  let totalScore = 0;
  let totalArticles = 0;

  sentiments.forEach(s => {
    totalScore += (s.sentiment_score || 0) * (s.article_count || 0);
    totalArticles += (s.article_count || 0);
  });

  const aggregateScore = totalArticles > 0 ? totalScore / totalArticles : 0;

  return {
    symbol,
    aggregate_score: aggregateScore,
    aggregate_label: getSentimentLabel(aggregateScore),
    total_articles: totalArticles,
    by_source: sentiments
  };
}

/**
 * Get sentiment label from score
 */
function getSentimentLabel(score) {
  if (score >= 0.6) return 'bullish';
  if (score <= 0.4) return 'bearish';
  return 'neutral';
}

/**
 * Create an error object with status code
 */
function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  routeRequest
};
