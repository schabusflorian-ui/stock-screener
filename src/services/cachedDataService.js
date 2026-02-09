// src/services/cachedDataService.js
// Caching layer for frequently accessed data

const { cache, TTL } = require('../lib/cache');
const { RequestCoalescer } = require('../lib/requestCoalescer');
const { getDatabaseAsync } = require('../lib/db');

/**
 * Cached Data Service
 * Provides caching for database queries and API calls
 */
class CachedDataService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()

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
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT * FROM companies WHERE LOWER(symbol) = LOWER($1)
      `, [symbol]);
      return result.rows[0];
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
    const database = await getDatabaseAsync();
    const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
    const result = await database.query(`
      SELECT * FROM companies
      WHERE UPPER(symbol) IN (${placeholders})
    `, symbols.map(s => s.toUpperCase()));

    const rows = result.rows;

    // Index by symbol
    const resultMap = {};
    for (const row of rows) {
      resultMap[row.symbol] = row;
      // Also cache individually
      cache.set(`company:${row.symbol}`, row, TTL.COMPANY_PROFILE);
    }
    return resultMap;
  }

  /**
   * Get all active companies (cached)
   */
  async getAllCompanies() {
    return cache.getOrFetch('companies:all', async () => {
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT id, symbol, name, sector, industry, exchange, country, market_cap
        FROM companies
        WHERE is_active = 1
        ORDER BY symbol
      `);
      return result.rows;
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
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC
        LIMIT 1
      `, [companyId]);
      return result.rows[0];
    }, TTL.METRICS);
  }

  /**
   * Get metrics history for a company
   */
  async getMetricsHistory(companyId, limit = 5) {
    const cacheKey = `metrics:history:${companyId}:${limit}`;

    return cache.getOrFetch(cacheKey, async () => {
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC
        LIMIT $2
      `, [companyId, limit]);
      return result.rows;
    }, TTL.METRICS);
  }

  /**
   * Batch fetch metrics
   */
  async _fetchMetrics(companyIds) {
    if (companyIds.length === 0) return {};

    const database = await getDatabaseAsync();
    const placeholders = companyIds.map((_, i) => `$${i + 1}`).join(',');

    // Get latest metric for each company
    const result = await database.query(`
      SELECT cm.* FROM calculated_metrics cm
      INNER JOIN (
        SELECT company_id, MAX(fiscal_period) as max_period
        FROM calculated_metrics
        WHERE company_id IN (${placeholders})
        GROUP BY company_id
      ) latest ON cm.company_id = latest.company_id AND cm.fiscal_period = latest.max_period
    `, companyIds);

    const rows = result.rows;

    const resultMap = {};
    for (const row of rows) {
      resultMap[row.company_id] = row;
      cache.set(`metrics:latest:${row.company_id}`, row, TTL.METRICS);
    }
    return resultMap;
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
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT * FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [companyId]);
      return result.rows[0];
    }, TTL.QUOTE);
  }

  /**
   * Get price history for a company
   */
  async getPriceHistory(companyId, days = 365) {
    const cacheKey = `price:history:${companyId}:${days}`;

    return cache.getOrFetch(cacheKey, async () => {
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT date, open, high, low, close, adjusted_close, volume
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT $2
      `, [companyId, days]);
      return result.rows;
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
      const database = await getDatabaseAsync();

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
      let paramCounter = 1;

      // Apply filters
      if (filters.sector) {
        query += ` AND c.sector = $${paramCounter}`;
        params.push(filters.sector);
        paramCounter++;
      }
      if (filters.country) {
        query += ` AND c.country = $${paramCounter}`;
        params.push(filters.country);
        paramCounter++;
      }
      if (filters.minMarketCap) {
        query += ` AND c.market_cap >= $${paramCounter}`;
        params.push(filters.minMarketCap);
        paramCounter++;
      }
      if (filters.maxMarketCap) {
        query += ` AND c.market_cap <= $${paramCounter}`;
        params.push(filters.maxMarketCap);
        paramCounter++;
      }

      query += ' ORDER BY c.market_cap DESC LIMIT 500';

      const result = await database.query(query, params);
      return result.rows;
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
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT sector, COUNT(*) as count
        FROM companies
        WHERE is_active = 1 AND sector IS NOT NULL
        GROUP BY sector
        ORDER BY count DESC
      `);
      return result.rows;
    }, TTL.INDEX);
  }

  /**
   * Get industry list for a sector
   */
  async getIndustries(sector) {
    const cacheKey = `industries:${sector}`;

    return cache.getOrFetch(cacheKey, async () => {
      const database = await getDatabaseAsync();
      const result = await database.query(`
        SELECT industry, COUNT(*) as count
        FROM companies
        WHERE is_active = 1 AND sector = $1 AND industry IS NOT NULL
        GROUP BY industry
        ORDER BY count DESC
      `, [sector]);
      return result.rows;
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

function getCachedDataService() {
  if (!instance) {
    instance = new CachedDataService();
  }
  return instance;
}

module.exports = {
  CachedDataService,
  getCachedDataService,
};
