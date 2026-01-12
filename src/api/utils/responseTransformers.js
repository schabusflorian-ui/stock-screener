/**
 * Response Transformers
 *
 * Utilities for creating lean API responses by stripping unnecessary fields
 * for list views while preserving full data for detail views.
 *
 * Usage:
 *   const { transforms, applyTransform } = require('./responseTransformers');
 *
 *   // In route handler:
 *   const { fields = 'minimal' } = req.query;
 *   const data = await getCompanies();
 *   res.json(applyTransform(data, fields === 'full' ? null : 'companyListItem'));
 */

const transforms = {
  // Minimal fields for company list views
  companyListItem: (c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    sector: c.sector,
    industry: c.industry,
    market_cap: c.market_cap,
    // Price data
    price: c.price || c.last_price,
    change: c.change,
    changePercent: c.changePercent || c.change_percent,
  }),

  // Screening result with key metrics
  screeningResult: (c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    sector: c.sector,
    industry: c.industry,
    // Price
    last_price: c.last_price,
    market_cap: c.market_cap,
    // Key metrics for screening
    roic: c.roic,
    roe: c.roe,
    net_margin: c.net_margin,
    fcf_yield: c.fcf_yield,
    pe_ratio: c.pe_ratio,
    pb_ratio: c.pb_ratio,
    debt_to_equity: c.debt_to_equity,
    revenue_growth_yoy: c.revenue_growth_yoy,
    fiscal_period: c.fiscal_period,
  }),

  // Watchlist item with price updates
  watchlistItem: (c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    sector: c.sector,
    price: c.price || c.last_price,
    change: c.change,
    changePercent: c.changePercent || c.change_percent,
    addedAt: c.addedAt || c.added_at,
  }),

  // Quote data (minimal for price updates)
  quote: (q) => ({
    symbol: q.symbol,
    price: q.price || q.last_price,
    change: q.change,
    changePercent: q.changePercent || q.change_percent,
    volume: q.volume,
    timestamp: q.timestamp || q.updated_at,
  }),

  // Holdings summary (for portfolio list)
  holdingSummary: (h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name || h.company_name,
    shares: h.shares,
    currentPrice: h.current_price,
    totalValue: h.total_value,
    gain: h.gain,
    gainPercent: h.gain_percent,
  }),

  // Investor list item
  investorListItem: (i) => ({
    id: i.id,
    name: i.name,
    style: i.style,
    aum: i.aum,
    holdingsCount: i.holdings_count,
    topHoldings: i.top_holdings?.slice(0, 5),
  }),
};

/**
 * Apply a transform to data
 * @param {Object|Array} data - Data to transform
 * @param {string|null} transformName - Name of transform to apply, or null for no transform
 * @returns {Object|Array} Transformed data
 */
function applyTransform(data, transformName) {
  if (!transformName || !transforms[transformName]) {
    return data;
  }

  const transform = transforms[transformName];

  if (Array.isArray(data)) {
    return data.map(transform);
  }

  return transform(data);
}

/**
 * Create middleware that applies transforms based on 'fields' query param
 * @param {string} transformName - Transform to apply when fields !== 'full'
 * @returns {Function} Express middleware
 */
function createTransformMiddleware(transformName) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      const { fields } = req.query;

      // Apply transform if not requesting full data
      if (fields !== 'full' && transforms[transformName]) {
        if (data && typeof data === 'object') {
          // Handle common response shapes
          if (data.data) {
            data.data = applyTransform(data.data, transformName);
          } else if (data.companies) {
            data.companies = applyTransform(data.companies, transformName);
          } else if (data.results) {
            data.results = applyTransform(data.results, transformName);
          } else if (Array.isArray(data)) {
            data = applyTransform(data, transformName);
          }
        }
      }

      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  transforms,
  applyTransform,
  createTransformMiddleware,
};
