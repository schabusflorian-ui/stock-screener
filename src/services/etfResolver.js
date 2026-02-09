// src/services/etfResolver.js
// Main ETF resolution service with tiered architecture

const { getDatabaseAsync } = require('../lib/db');
const { getYFinanceETFFetcher } = require('./yfinanceETFFetcher');
const { buildCategoryTree, getCategoryDescendants, getCategoryBreadcrumb } = require('../data/etf-categories');
const { LAZY_PORTFOLIOS, getPortfolioBySlug, getFeaturedPortfolios } = require('../data/lazy-portfolios');
const { unifiedCache } = require('../lib/redisCache');

// Cache prefix for ETF data
const ETF_CACHE_PREFIX = 'etf:';
const ETF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class ETFResolver {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.yfinance = getYFinanceETFFetcher();

    // Use Redis-backed unified cache for distributed environments
    // Falls back to memory cache automatically when Redis unavailable
    console.log('ETFResolver initialized with UnifiedCache');
  }

  /**
   * Resolve an ETF symbol through the tier system:
   * 1. Check distributed cache (Redis when available)
   * 2. Check database (Tier 1 & 2)
   * 3. Fetch on-demand via yfinance (Tier 3)
   *
   * @param {string} symbol
   * @returns {Object|null}
   */
  async resolve(symbol) {
    const database = await getDatabaseAsync();
    const upperSymbol = symbol.toUpperCase().trim();
    const cacheKey = `${ETF_CACHE_PREFIX}${upperSymbol}`;

    // 1. Check distributed cache
    const cached = await unifiedCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Check database (case-insensitive query)
    const dbResultQuery = await database.query(
      `SELECT * FROM etf_definitions WHERE LOWER(symbol) = LOWER($1) AND is_active = 1`,
      [upperSymbol]
    );
    const dbResult = dbResultQuery.rows[0];

    if (dbResult) {
      const etf = this.mapRowToETF(dbResult);
      await this.trackAccess(upperSymbol);
      await unifiedCache.set(cacheKey, etf, ETF_CACHE_TTL);
      return etf;
    }

    // 3. Fetch on-demand (Tier 3)
    try {
      const fetched = await this.yfinance.fetchETF(upperSymbol);

      if (fetched) {
        await this.saveAsTier3(fetched);
        const etf = this.mapFetchedToETF(fetched);
        await unifiedCache.set(cacheKey, etf, ETF_CACHE_TTL);
        return etf;
      }
    } catch (error) {
      console.error(`Failed to fetch ETF ${upperSymbol}:`, error.message);
    }

    return null;
  }

  /**
   * Search ETFs by symbol or name
   * @param {string} query
   * @param {number} limit
   * @returns {Object[]}
   */
  async search(query, limit = 20) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM etf_definitions
      WHERE is_active = 1
        AND (symbol LIKE $1 OR name LIKE $2)
      ORDER BY
        CASE WHEN symbol LIKE $3 THEN 0 ELSE 1 END,
        tier ASC,
        aum DESC
      LIMIT $4
    `, [`%${query}%`, `%${query}%`, `${query}%`, limit]);

    return result.rows.map(row => this.mapRowToETF(row));
  }

  /**
   * List ETFs with filters and pagination
   * @param {Object} options
   * @returns {{etfs: Object[], total: number}}
   */
  async list(options = {}) {
    const database = await getDatabaseAsync();

    const {
      category,
      issuer,
      tier,
      essentialOnly = false,
      search,
      assetClass,
      sortBy = 'aum',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = options;

    let query = 'SELECT * FROM etf_definitions WHERE is_active = 1';
    let countQuery = 'SELECT COUNT(*) as count FROM etf_definitions WHERE is_active = 1';
    const params = [];
    let paramCounter = 1;

    // Build WHERE clauses
    if (category) {
      // Include descendants for hierarchical categories
      const descendants = getCategoryDescendants(category);
      const placeholders = descendants.map((_, idx) => `$${paramCounter + idx}`).join(',');
      paramCounter += descendants.length;
      query += ` AND category IN (${placeholders})`;
      countQuery += ` AND category IN (${placeholders})`;
      params.push(...descendants);
    }

    if (issuer) {
      query += ` AND issuer = $${paramCounter}`;
      countQuery += ` AND issuer = $${paramCounter}`;
      paramCounter++;
      params.push(issuer);
    }

    if (tier) {
      query += ` AND tier = $${paramCounter}`;
      countQuery += ` AND tier = $${paramCounter}`;
      paramCounter++;
      params.push(tier);
    }

    if (essentialOnly) {
      query += ' AND is_essential = 1';
      countQuery += ' AND is_essential = 1';
    }

    if (assetClass) {
      query += ` AND asset_class = $${paramCounter}`;
      countQuery += ` AND asset_class = $${paramCounter}`;
      paramCounter++;
      params.push(assetClass);
    }

    if (search) {
      query += ` AND (symbol LIKE $${paramCounter} OR name LIKE $${paramCounter + 1})`;
      countQuery += ` AND (symbol LIKE $${paramCounter} OR name LIKE $${paramCounter + 1})`;
      paramCounter += 2;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Sorting
    const validSortColumns = ['symbol', 'name', 'aum', 'expense_ratio', 'tier', 'dividend_yield', 'ytd_return'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'aum';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${order} NULLS LAST`;

    // Get total count (clone params before adding pagination)
    const countParams = [...params];
    const totalResult = await database.query(countQuery, countParams);
    const total = totalResult.rows[0]?.count || 0;

    // Add pagination
    query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    return {
      etfs: result.rows.map(row => this.mapRowToETF(row)),
      total,
      limit,
      offset
    };
  }

  /**
   * Get essential ETFs (Tier 1 with is_essential flag)
   * @returns {Object[]}
   */
  async getEssentials() {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM etf_definitions
      WHERE is_active = 1 AND is_essential = 1
      ORDER BY category, symbol
    `);

    return result.rows.map(row => this.mapRowToETF(row));
  }

  /**
   * Get hierarchical category tree
   * @returns {Object[]}
   */
  getCategories() {
    return buildCategoryTree();
  }

  /**
   * Get category with ETF counts
   * @returns {Object[]}
   */
  async getCategoriesWithCounts() {
    const database = await getDatabaseAsync();

    const countsResult = await database.query(`
      SELECT category, COUNT(*) as count
      FROM etf_definitions
      WHERE is_active = 1 AND category IS NOT NULL
      GROUP BY category
    `);
    const counts = countsResult.rows;

    const countMap = new Map(counts.map(c => [c.category, c.count]));

    const tree = buildCategoryTree();

    // Add counts to tree
    const addCounts = (node) => {
      node.etfCount = countMap.get(node.slug) || 0;
      // Add descendant counts
      let totalCount = node.etfCount;
      for (const child of node.children || []) {
        totalCount += addCounts(child);
      }
      node.totalCount = totalCount;
      return totalCount;
    };

    tree.forEach(addCounts);
    return tree;
  }

  /**
   * Get category breadcrumb path
   * @param {string} categorySlug
   * @returns {Object[]}
   */
  getCategoryPath(categorySlug) {
    return getCategoryBreadcrumb(categorySlug);
  }

  /**
   * Get all issuers with ETF counts
   * @returns {Object[]}
   */
  async getIssuers() {
    const database = await getDatabaseAsync();

    const issuersResult = await database.query(`
      SELECT * FROM etf_issuers ORDER BY etf_count DESC
    `);
    const issuers = issuersResult.rows;

    // If no issuers in table, aggregate from etf_definitions
    if (issuers.length === 0) {
      const aggregateResult = await database.query(`
        SELECT
          issuer as slug,
          issuer as name,
          COUNT(*) as etf_count,
          SUM(aum) as total_aum
        FROM etf_definitions
        WHERE is_active = 1 AND issuer IS NOT NULL
        GROUP BY issuer
        ORDER BY etf_count DESC
      `);
      return aggregateResult.rows;
    }

    return issuers;
  }

  /**
   * Get all lazy portfolios
   * @returns {Object[]}
   */
  async getLazyPortfolios() {
    const database = await getDatabaseAsync();

    // First try database
    const dbPortfoliosResult = await database.query(`
      SELECT * FROM lazy_portfolios ORDER BY is_featured DESC, name
    `);
    const dbPortfolios = dbPortfoliosResult.rows;

    if (dbPortfolios.length > 0) {
      return dbPortfolios.map(p => ({
        ...p,
        isFeatured: p.is_featured === 1
      }));
    }

    // Fall back to static data
    return LAZY_PORTFOLIOS.map(p => ({
      id: null,
      name: p.name,
      slug: p.slug,
      description: p.description,
      source: p.source,
      riskLevel: p.riskLevel,
      isFeatured: p.isFeatured
    }));
  }

  /**
   * Get lazy portfolio with allocations
   * @param {string} slug
   * @returns {Object|null}
   */
  async getLazyPortfolio(slug) {
    const database = await getDatabaseAsync();

    // Try database first
    const dbPortfolioResult = await database.query(`
      SELECT * FROM lazy_portfolios WHERE slug = $1
    `, [slug]);
    const dbPortfolio = dbPortfolioResult.rows[0];

    if (dbPortfolio) {
      const allocationsResult = await database.query(`
        SELECT
          lpa.*,
          ed.name as etf_name,
          ed.expense_ratio,
          ed.category
        FROM lazy_portfolio_allocations lpa
        LEFT JOIN etf_definitions ed ON ed.symbol = lpa.etf_symbol
        WHERE lpa.portfolio_id = $1
        ORDER BY lpa.weight DESC
      `, [dbPortfolio.id]);

      return {
        ...dbPortfolio,
        isFeatured: dbPortfolio.is_featured === 1,
        allocations: allocationsResult.rows
      };
    }

    // Fall back to static data
    const staticPortfolio = getPortfolioBySlug(slug);
    if (staticPortfolio) {
      // Enrich allocations with ETF data from database
      const enrichedAllocations = await Promise.all(
        staticPortfolio.allocations.map(async (alloc) => {
          const etfResult = await database.query(`
            SELECT name, expense_ratio, category FROM etf_definitions WHERE LOWER(symbol) = LOWER($1)
          `, [alloc.symbol]);
          const etf = etfResult.rows[0];

          return {
            ...alloc,
            etf_name: etf?.name || alloc.symbol,
            expense_ratio: etf?.expense_ratio || null,
            category: etf?.category || null
          };
        })
      );

      return {
        ...staticPortfolio,
        allocations: enrichedAllocations
      };
    }

    return null;
  }

  /**
   * Get featured lazy portfolios
   * @returns {Object[]}
   */
  async getFeaturedLazyPortfolios() {
    const database = await getDatabaseAsync();

    const dbFeaturedResult = await database.query(`
      SELECT * FROM lazy_portfolios WHERE is_featured = 1 ORDER BY name
    `);

    if (dbFeaturedResult.rows.length > 0) {
      return dbFeaturedResult.rows;
    }

    return getFeaturedPortfolios();
  }

  /**
   * Save fetched ETF as Tier 3
   * @param {Object} data
   */
  async saveAsTier3(data) {
    try {
      const database = await getDatabaseAsync();

      await database.query(`
        INSERT INTO etf_definitions (
          symbol, name, asset_class, category, issuer,
          expense_ratio, aum, avg_volume, dividend_yield, ytd_return, beta,
          tier, data_source, last_fundamentals_update
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 3, 'yfinance', CURRENT_TIMESTAMP)
        ON CONFLICT(symbol) DO UPDATE SET
          name = excluded.name,
          asset_class = excluded.asset_class,
          category = excluded.category,
          expense_ratio = COALESCE(excluded.expense_ratio, expense_ratio),
          aum = COALESCE(excluded.aum, aum),
          avg_volume = COALESCE(excluded.avg_volume, avg_volume),
          dividend_yield = COALESCE(excluded.dividend_yield, dividend_yield),
          ytd_return = COALESCE(excluded.ytd_return, ytd_return),
          beta = COALESCE(excluded.beta, beta),
          last_fundamentals_update = CURRENT_TIMESTAMP,
          last_updated = CURRENT_TIMESTAMP
      `, [
        data.symbol,
        data.name,
        data.assetClass,
        data.category,
        data.issuer,
        data.expenseRatio,
        data.aum,
        data.avgVolume,
        data.dividendYield,
        data.ytdReturn,
        data.beta
      ]);
    } catch (error) {
      console.error(`Failed to save Tier 3 ETF ${data.symbol}:`, error.message);
    }
  }

  /**
   * Track ETF access for promotion logic
   * @param {string} symbol
   */
  async trackAccess(symbol) {
    try {
      const database = await getDatabaseAsync();

      await database.query(`
        UPDATE etf_definitions
        SET access_count = COALESCE(access_count, 0) + 1, last_accessed = CURRENT_TIMESTAMP
        WHERE LOWER(symbol) = LOWER($1)
      `, [symbol]);
    } catch (error) {
      // Non-critical, log and continue
      console.error(`Failed to track access for ${symbol}:`, error.message);
    }
  }

  /**
   * Promote high-traffic Tier 3 ETFs to Tier 2
   * @param {number} accessThreshold - Minimum access count (default: 10)
   * @param {number} daysRecent - Days to consider for recency (default: 30)
   * @returns {number} Number of ETFs promoted
   */
  async promoteTier3() {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      UPDATE etf_definitions
      SET tier = 2, last_updated = CURRENT_TIMESTAMP
      WHERE tier = 3
        AND access_count >= 10
        AND last_accessed > datetime('now', '-30 days')
    `);

    const changes = result.rowCount || 0;

    if (changes > 0) {
      console.log(`Promoted ${changes} ETFs from Tier 3 to Tier 2`);
    }

    return changes;
  }

  /**
   * Map database row to ETF object
   * @param {Object} row
   * @returns {Object}
   */
  mapRowToETF(row) {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      assetClass: row.asset_class,
      category: row.category,
      subcategory: row.subcategory,
      issuer: row.issuer,
      expenseRatio: row.expense_ratio,
      aum: row.aum,
      avgVolume: row.avg_volume,
      dividendYield: row.dividend_yield,
      beta: row.beta,
      ytdReturn: row.ytd_return,
      oneYearReturn: row.one_year_return,
      threeYearReturn: row.three_year_return,
      fiveYearReturn: row.five_year_return,
      indexTracked: row.index_tracked,
      strategy: row.strategy,
      inceptionDate: row.inception_date,
      tier: row.tier,
      isEssential: row.is_essential === 1,
      isActive: row.is_active === 1,
      dataSource: row.data_source,
      accessCount: row.access_count,
      lastAccessed: row.last_accessed,
      lastUpdated: row.last_updated
    };
  }

  /**
   * Map fetched data to ETF object
   * @param {Object} data
   * @returns {Object}
   */
  mapFetchedToETF(data) {
    return {
      id: null,
      symbol: data.symbol,
      name: data.name,
      assetClass: data.assetClass,
      category: data.category,
      subcategory: null,
      issuer: data.issuer,
      expenseRatio: data.expenseRatio,
      aum: data.aum,
      avgVolume: data.avgVolume,
      dividendYield: data.dividendYield,
      beta: data.beta,
      ytdReturn: data.ytdReturn,
      oneYearReturn: null,
      threeYearReturn: null,
      fiveYearReturn: null,
      indexTracked: null,
      strategy: null,
      inceptionDate: null,
      tier: 3,
      isEssential: false,
      isActive: true,
      dataSource: 'yfinance',
      accessCount: 1,
      lastAccessed: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Clear the distributed cache (Redis pattern delete)
   */
  async clearCache() {
    await unifiedCache.deletePattern(`${ETF_CACHE_PREFIX}*`);
    console.log('ETF cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>}
   */
  async getCacheStats() {
    const stats = await unifiedCache.getStats();
    return {
      ...stats,
      prefix: ETF_CACHE_PREFIX,
      ttlMs: ETF_CACHE_TTL
    };
  }
}

// Singleton instance
let instance = null;

function getETFResolver() {
  if (!instance) {
    instance = new ETFResolver();
  }
  return instance;
}

module.exports = {
  ETFResolver,
  getETFResolver
};
