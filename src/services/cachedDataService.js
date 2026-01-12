// src/services/cachedDataService.js
// Caching layer for frequently accessed data

const { cache, TTL } = require('../lib/cache');
const { RequestCoalescer } = require('../lib/requestCoalescer');

/**
 * Cached Data Service
 * Provides caching for database queries and API calls
 */
class CachedDataService {
  constructor(db) {
    this.db = db;

    // Create coalescers for batch operations
    this.companyCoalescer = new RequestCoalescer(
      (symbols) => this._fetchCompanies(symbols),
      { delay: 10, maxBatchSize: 50 }
    );

    this.metricsCoalescer = new RequestCoalescer(
      (companyIds) => this._fetchMetrics(companyIds),
      { delay: 10, maxBatchSize: 50 }
    );
  }

  // ============================================
  // Company Data
  // ============================================

  /**
   * Get company by symbol with caching
   */
  async getCompany(symbol) {
    const cacheKey = `company:${symbol.toUpperCase()}`;

    return cache.getOrFetch(cacheKey, async () => {
      const company = this.db.prepare(`
        SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);
      return company;
    }, TTL.COMPANY_PROFILE);
  }

  /**
   * Get multiple companies (coalesced)
   */
  async getCompanies(symbols) {
    return this.companyCoalescer.getMany(symbols);
  }

  /**
   * Batch fetch companies from database
   */
  async _fetchCompanies(symbols) {
    const placeholders = symbols.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT * FROM companies
      WHERE UPPER(symbol) IN (${placeholders})
    `).all(symbols.map(s => s.toUpperCase()));

    // Index by symbol
    const result = {};
    for (const row of rows) {
      result[row.symbol] = row;
      // Also cache individually
      cache.set(`company:${row.symbol}`, row, TTL.COMPANY_PROFILE);
    }
    return result;
  }

  /**
   * Get all active companies (cached)
   */
  async getAllCompanies() {
    return cache.getOrFetch('companies:all', async () => {
      return this.db.prepare(`
        SELECT id, symbol, name, sector, industry, exchange, country, market_cap
        FROM companies
        WHERE is_active = 1
        ORDER BY symbol
      `).all();
    }, TTL.INDEX);
  }

  // ============================================
  // Metrics Data
  // ============================================

  /**
   * Get latest metrics for a company
   */
  async getLatestMetrics(companyId) {
    const cacheKey = `metrics:latest:${companyId}`;

    return cache.getOrFetch(cacheKey, async () => {
      return this.db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 1
      `).get(companyId);
    }, TTL.METRICS);
  }

  /**
   * Get metrics history for a company
   */
  async getMetricsHistory(companyId, limit = 5) {
    const cacheKey = `metrics:history:${companyId}:${limit}`;

    return cache.getOrFetch(cacheKey, async () => {
      return this.db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT ?
      `).all(companyId, limit);
    }, TTL.METRICS);
  }

  /**
   * Batch fetch metrics
   */
  async _fetchMetrics(companyIds) {
    if (companyIds.length === 0) return {};

    const placeholders = companyIds.map(() => '?').join(',');

    // Get latest metric for each company
    const rows = this.db.prepare(`
      SELECT cm.* FROM calculated_metrics cm
      INNER JOIN (
        SELECT company_id, MAX(fiscal_period) as max_period
        FROM calculated_metrics
        WHERE company_id IN (${placeholders})
        GROUP BY company_id
      ) latest ON cm.company_id = latest.company_id AND cm.fiscal_period = latest.max_period
    `).all(companyIds);

    const result = {};
    for (const row of rows) {
      result[row.company_id] = row;
      cache.set(`metrics:latest:${row.company_id}`, row, TTL.METRICS);
    }
    return result;
  }

  // ============================================
  // Price Data
  // ============================================

  /**
   * Get latest price for a company
   */
  async getLatestPrice(companyId) {
    const cacheKey = `price:latest:${companyId}`;

    return cache.getOrFetch(cacheKey, async () => {
      return this.db.prepare(`
        SELECT * FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `).get(companyId);
    }, TTL.QUOTE);
  }

  /**
   * Get price history for a company
   */
  async getPriceHistory(companyId, days = 365) {
    const cacheKey = `price:history:${companyId}:${days}`;

    return cache.getOrFetch(cacheKey, async () => {
      return this.db.prepare(`
        SELECT date, open, high, low, close, adjusted_close, volume
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT ?
      `).all(companyId, days);
    }, TTL.PRICE_HISTORY);
  }

  // ============================================
  // Screening Data
  // ============================================

  /**
   * Get screening data (companies with metrics)
   */
  async getScreeningData(filters = {}) {
    // Create cache key from filters
    const filterKey = JSON.stringify(filters);
    const cacheKey = `screening:${Buffer.from(filterKey).toString('base64').slice(0, 32)}`;

    return cache.getOrFetch(cacheKey, async () => {
      // Build query based on filters
      let query = `
        SELECT
          c.id, c.symbol, c.name, c.sector, c.industry, c.market_cap,
          cm.roic, cm.roe, cm.fcf_yield, cm.pe_ratio, cm.debt_to_equity,
          cm.revenue_growth_yoy, cm.earnings_growth_yoy,
          p.close as price, p.date as price_date
        FROM companies c
        LEFT JOIN (
          SELECT cm1.* FROM calculated_metrics cm1
          INNER JOIN (
            SELECT company_id, MAX(fiscal_period) as max_period
            FROM calculated_metrics
            GROUP BY company_id
          ) cm2 ON cm1.company_id = cm2.company_id AND cm1.fiscal_period = cm2.max_period
        ) cm ON c.id = cm.company_id
        LEFT JOIN (
          SELECT p1.* FROM daily_prices p1
          INNER JOIN (
            SELECT company_id, MAX(date) as max_date
            FROM daily_prices
            GROUP BY company_id
          ) p2 ON p1.company_id = p2.company_id AND p1.date = p2.max_date
        ) p ON c.id = p.company_id
        WHERE c.is_active = 1
      `;

      const params = [];

      // Apply filters
      if (filters.sector) {
        query += ` AND c.sector = ?`;
        params.push(filters.sector);
      }
      if (filters.country) {
        query += ` AND c.country = ?`;
        params.push(filters.country);
      }
      if (filters.minMarketCap) {
        query += ` AND c.market_cap >= ?`;
        params.push(filters.minMarketCap);
      }
      if (filters.maxMarketCap) {
        query += ` AND c.market_cap <= ?`;
        params.push(filters.maxMarketCap);
      }

      query += ` ORDER BY c.market_cap DESC LIMIT 500`;

      return this.db.prepare(query).all(...params);
    }, TTL.SCREENING);
  }

  // ============================================
  // Sector Data
  // ============================================

  /**
   * Get sector list with counts
   */
  async getSectors() {
    return cache.getOrFetch('sectors:list', async () => {
      return this.db.prepare(`
        SELECT sector, COUNT(*) as count
        FROM companies
        WHERE is_active = 1 AND sector IS NOT NULL
        GROUP BY sector
        ORDER BY count DESC
      `).all();
    }, TTL.INDEX);
  }

  /**
   * Get industry list for a sector
   */
  async getIndustries(sector) {
    const cacheKey = `industries:${sector}`;

    return cache.getOrFetch(cacheKey, async () => {
      return this.db.prepare(`
        SELECT industry, COUNT(*) as count
        FROM companies
        WHERE is_active = 1 AND sector = ? AND industry IS NOT NULL
        GROUP BY industry
        ORDER BY count DESC
      `).all(sector);
    }, TTL.INDEX);
  }

  // ============================================
  // Cache Invalidation
  // ============================================

  /**
   * Invalidate all caches for a company
   */
  invalidateCompany(symbol) {
    cache.deletePattern(`*:${symbol}*`);
    cache.delete(`company:${symbol}`);
  }

  /**
   * Invalidate metrics cache for a company
   */
  invalidateMetrics(companyId) {
    cache.deletePattern(`metrics:*:${companyId}*`);
  }

  /**
   * Invalidate screening caches
   */
  invalidateScreening() {
    cache.deletePattern('screening:*');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return cache.getStats();
  }
}

// Factory function to create service
let instance = null;

function getCachedDataService(db) {
  if (!instance && db) {
    instance = new CachedDataService(db);
  }
  return instance;
}

module.exports = {
  CachedDataService,
  getCachedDataService,
};
