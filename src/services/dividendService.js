/**
 * Dividend Service - Provides dividend data and analytics
 */

const { getDatabaseAsync } = require('../lib/db');

class DividendService {
  /**
   * Get dividend metrics for a company
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Dividend metrics
   */
  async getDividendMetrics(companyId) {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        dm.*,
        c.symbol,
        c.name,
        c.sector
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.company_id = $1
    `;

    const result = await database.query(sql, [companyId]);
    return result.rows[0];
  }

  /**
   * Get dividend metrics by symbol
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object>} Dividend metrics
   */
  async getDividendMetricsBySymbol(symbol) {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        dm.*,
        c.symbol,
        c.name,
        c.sector
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE c.symbol = $1
    `;

    const result = await database.query(sql, [symbol]);
    return result.rows[0];
  }

  /**
   * Get dividend history for a company
   * @param {number} companyId - Company ID
   * @param {number} limit - Max records to return
   * @returns {Promise<Array>} Dividend history
   */
  async getDividendHistory(companyId, limit = 40) {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        ex_date,
        payment_date,
        amount,
        frequency
      FROM dividend_history
      WHERE company_id = $1
      ORDER BY ex_date DESC
      LIMIT $2
    `;

    const result = await database.query(sql, [companyId, limit]);
    return result.rows;
  }

  /**
   * Get top dividend yielders
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Companies sorted by dividend yield
   */
  async getTopDividendYielders(options = {}) {
    const database = await getDatabaseAsync();
    const {
      minYield = 0,
      maxYield = 20,
      sector = null,
      minYearsGrowth = 0,
      limit = 50
    } = options;

    let sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        dm.dividend_yield,
        dm.current_annual_dividend,
        dm.payout_ratio,
        dm.years_of_growth,
        dm.dividend_growth_5y,
        dm.dividend_frequency,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king,
        dm.ex_dividend_date
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.dividend_yield >= $1
        AND dm.dividend_yield <= $2
        AND dm.years_of_growth >= $3
    `;

    const params = [minYield, maxYield, minYearsGrowth];
    let paramCounter = 4;

    if (sector) {
      sql += ` AND c.sector = $${paramCounter++}`;
      params.push(sector);
    }

    sql += ` ORDER BY dm.dividend_yield DESC LIMIT $${paramCounter++}`;
    params.push(limit);

    const result = await database.query(sql, params);
    return result.rows;
  }

  /**
   * Get dividend aristocrats (25+ years of consecutive dividend growth)
   * @returns {Promise<Array>} Dividend aristocrats
   */
  async getDividendAristocrats() {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        dm.dividend_yield,
        dm.years_of_growth,
        dm.dividend_growth_5y,
        dm.dividend_growth_10y,
        dm.current_annual_dividend,
        dm.payout_ratio
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.is_dividend_aristocrat = 1
      ORDER BY dm.years_of_growth DESC, dm.dividend_yield DESC
    `;

    const result = await database.query(sql);
    return result.rows;
  }

  /**
   * Get dividend kings (50+ years of consecutive dividend growth)
   * @returns {Promise<Array>} Dividend kings
   */
  async getDividendKings() {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        dm.dividend_yield,
        dm.years_of_growth,
        dm.dividend_growth_5y,
        dm.dividend_growth_10y,
        dm.current_annual_dividend,
        dm.payout_ratio
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.is_dividend_king = 1
      ORDER BY dm.years_of_growth DESC, dm.dividend_yield DESC
    `;

    const result = await database.query(sql);
    return result.rows;
  }

  /**
   * Get upcoming ex-dividend dates
   * @param {number} days - Days ahead to look
   * @returns {Promise<Array>} Companies with upcoming ex-dividend dates
   */
  async getUpcomingExDividends(days = 14) {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        dm.ex_dividend_date,
        dm.dividend_yield,
        dm.current_annual_dividend,
        ROUND(dm.current_annual_dividend / 4, 4) as est_quarterly_dividend
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.ex_dividend_date >= CURRENT_DATE
        AND dm.ex_dividend_date <= CURRENT_DATE + INTERVAL '$1 days'
      ORDER BY dm.ex_dividend_date ASC
    `;

    const result = await database.query(sql, [days]);
    return result.rows;
  }

  /**
   * Get dividend growth leaders
   * @param {string} period - Growth period ('1y', '3y', '5y', '10y')
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Companies with highest dividend growth
   */
  async getDividendGrowthLeaders(period = '5y', limit = 50) {
    const database = await getDatabaseAsync();
    const growthColumn = {
      '1y': 'dividend_growth_1y',
      '3y': 'dividend_growth_3y',
      '5y': 'dividend_growth_5y',
      '10y': 'dividend_growth_10y'
    }[period] || 'dividend_growth_5y';

    const sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        dm.dividend_yield,
        dm.${growthColumn} as growth_rate,
        dm.years_of_growth,
        dm.current_annual_dividend,
        dm.payout_ratio
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.${growthColumn} IS NOT NULL
        AND dm.${growthColumn} > 0
        AND dm.dividend_yield > 0
      ORDER BY dm.${growthColumn} DESC
      LIMIT $1
    `;

    const result = await database.query(sql, [limit]);
    return result.rows;
  }

  /**
   * Get dividend statistics by sector
   * @returns {Promise<Array>} Sector dividend statistics
   */
  async getDividendsBySector() {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        c.sector,
        COUNT(*) as company_count,
        ROUND(AVG(dm.dividend_yield), 2) as avg_yield,
        ROUND(AVG(dm.payout_ratio), 2) as avg_payout_ratio,
        ROUND(AVG(dm.years_of_growth), 1) as avg_years_growth,
        ROUND(AVG(dm.dividend_growth_5y), 2) as avg_5y_growth,
        SUM(CASE WHEN dm.is_dividend_aristocrat = 1 THEN 1 ELSE 0 END) as aristocrats,
        SUM(CASE WHEN dm.is_dividend_king = 1 THEN 1 ELSE 0 END) as kings
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE c.sector IS NOT NULL
        AND dm.dividend_yield > 0
      GROUP BY c.sector
      ORDER BY avg_yield DESC
    `;

    const result = await database.query(sql);
    return result.rows;
  }

  /**
   * Get dividend summary statistics
   * @returns {Promise<Object>} Overall dividend statistics
   */
  async getDividendSummary() {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        COUNT(*) as total_dividend_payers,
        SUM(CASE WHEN is_dividend_aristocrat = 1 THEN 1 ELSE 0 END) as aristocrats,
        SUM(CASE WHEN is_dividend_king = 1 THEN 1 ELSE 0 END) as kings,
        ROUND(AVG(dividend_yield), 2) as avg_yield,
        ROUND(AVG(CASE WHEN payout_ratio BETWEEN 0 AND 200 THEN payout_ratio END), 2) as avg_payout_ratio,
        ROUND(AVG(years_of_growth), 1) as avg_years_growth,
        MAX(years_of_growth) as max_years_growth,
        (SELECT COUNT(*) FROM dividend_history) as total_dividend_records
      FROM dividend_metrics
      WHERE dividend_yield > 0
    `;

    const result = await database.query(sql);
    return result.rows[0];
  }

  /**
   * Screen for dividend stocks based on criteria
   * @param {Object} criteria - Screening criteria
   * @returns {Promise<Array>} Matching stocks
   */
  async screenDividendStocks(criteria = {}) {
    const database = await getDatabaseAsync();
    const {
      minYield = null,
      maxYield = null,
      minPayoutRatio = null,
      maxPayoutRatio = null,
      minYearsGrowth = null,
      minGrowth5y = null,
      sector = null,
      sp500Only = false,
      aristocratsOnly = false,
      kingsOnly = false,
      sortBy = 'dividend_yield',
      sortOrder = 'DESC',
      limit = 100
    } = criteria;

    let sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        c.is_sp500,
        dm.dividend_yield,
        dm.current_annual_dividend,
        dm.payout_ratio,
        dm.years_of_growth,
        dm.dividend_growth_1y,
        dm.dividend_growth_5y,
        dm.dividend_frequency,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king,
        dm.ex_dividend_date
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.dividend_yield > 0
    `;

    const params = [];
    let paramCounter = 1;

    if (minYield !== null) {
      sql += ` AND dm.dividend_yield >= $${paramCounter++}`;
      params.push(minYield);
    }
    if (maxYield !== null) {
      sql += ` AND dm.dividend_yield <= $${paramCounter++}`;
      params.push(maxYield);
    }
    if (minPayoutRatio !== null) {
      sql += ` AND dm.payout_ratio >= $${paramCounter++}`;
      params.push(minPayoutRatio);
    }
    if (maxPayoutRatio !== null) {
      sql += ` AND dm.payout_ratio <= $${paramCounter++}`;
      params.push(maxPayoutRatio);
    }
    if (minYearsGrowth !== null) {
      sql += ` AND dm.years_of_growth >= $${paramCounter++}`;
      params.push(minYearsGrowth);
    }
    if (minGrowth5y !== null) {
      sql += ` AND dm.dividend_growth_5y >= $${paramCounter++}`;
      params.push(minGrowth5y);
    }
    if (sector) {
      sql += ` AND c.sector = $${paramCounter++}`;
      params.push(sector);
    }
    if (sp500Only) {
      sql += ' AND c.is_sp500 = 1';
    }
    if (aristocratsOnly) {
      sql += ' AND dm.is_dividend_aristocrat = 1';
    }
    if (kingsOnly) {
      sql += ' AND dm.is_dividend_king = 1';
    }

    // Validate sort column
    const validSortColumns = [
      'dividend_yield', 'payout_ratio', 'years_of_growth',
      'dividend_growth_5y', 'market_cap', 'current_annual_dividend'
    ];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'dividend_yield';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY dm.${sortColumn} ${order} NULLS LAST LIMIT $${paramCounter++}`;
    params.push(limit);

    const result = await database.query(sql, params);
    return result.rows;
  }
}

// Export singleton instance
module.exports = new DividendService();
