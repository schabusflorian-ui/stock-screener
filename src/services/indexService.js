/**
 * Index Service - Provides market index data
 * Supports S&P 500, Dow Jones, NASDAQ Composite, Russell 2000
 */

const { getDatabase } = require('../database');

class IndexService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Get all active indices with latest metrics
   * @returns {Array} Array of index objects
   */
  getAllIndices() {
    const sql = `
      SELECT
        mi.id,
        mi.symbol,
        mi.name,
        mi.short_name,
        mi.index_type,
        mi.market_cap_focus,
        mi.constituents_count,
        mi.display_order,
        mim.last_price,
        mim.last_price_date,
        mim.previous_close,
        mim.change_1d,
        mim.change_1d_pct,
        mim.change_1w,
        mim.change_1m,
        mim.change_3m,
        mim.change_6m,
        mim.change_ytd,
        mim.change_1y,
        mim.high_52w,
        mim.low_52w,
        mim.pct_from_52w_high,
        mim.pct_from_52w_low,
        mim.sma_50,
        mim.sma_200,
        mim.price_vs_sma_50,
        mim.price_vs_sma_200,
        mim.rsi_14,
        mim.volatility_20d,
        mim.calculated_at
      FROM market_indices mi
      LEFT JOIN market_index_metrics mim ON mi.id = mim.index_id
      WHERE mi.is_active = 1
      ORDER BY mi.display_order
    `;

    return this.db.prepare(sql).all();
  }

  /**
   * Get single index by symbol
   * @param {string} symbol - Index symbol (e.g., '^GSPC')
   * @returns {Object} Index object
   */
  getIndexBySymbol(symbol) {
    const sql = `
      SELECT
        mi.*,
        mim.last_price,
        mim.last_price_date,
        mim.previous_close,
        mim.change_1d,
        mim.change_1d_pct,
        mim.change_1w,
        mim.change_1m,
        mim.change_3m,
        mim.change_6m,
        mim.change_ytd,
        mim.change_1y,
        mim.high_52w,
        mim.low_52w,
        mim.pct_from_52w_high,
        mim.pct_from_52w_low,
        mim.sma_50,
        mim.sma_200,
        mim.price_vs_sma_50,
        mim.price_vs_sma_200,
        mim.rsi_14,
        mim.volatility_20d,
        mim.calculated_at
      FROM market_indices mi
      LEFT JOIN market_index_metrics mim ON mi.id = mim.index_id
      WHERE mi.symbol = ?
    `;

    return this.db.prepare(sql).get(symbol);
  }

  /**
   * Get historical prices for an index
   * @param {string} symbol - Index symbol
   * @param {Object} options - Query options
   * @param {string} options.startDate - Start date (YYYY-MM-DD)
   * @param {string} options.endDate - End date (YYYY-MM-DD)
   * @param {number} options.limit - Max records to return
   * @returns {Array} Array of price records
   */
  getHistoricalPrices(symbol, options = {}) {
    const { startDate, endDate, limit = 252 } = options;

    let sql = `
      SELECT
        mip.date,
        mip.open,
        mip.high,
        mip.low,
        mip.close,
        mip.volume
      FROM market_index_prices mip
      JOIN market_indices mi ON mip.index_id = mi.id
      WHERE mi.symbol = ?
    `;

    const params = [symbol];

    if (startDate) {
      sql += ' AND mip.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND mip.date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY mip.date DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get index returns for multiple periods
   * @param {string} symbol - Index symbol
   * @returns {Object} Returns by period
   */
  getIndexReturns(symbol) {
    const sql = `
      SELECT
        change_1d_pct as day_1,
        change_1w as week_1,
        change_1m as month_1,
        change_3m as month_3,
        change_6m as month_6,
        change_ytd as ytd,
        change_1y as year_1
      FROM market_index_metrics mim
      JOIN market_indices mi ON mim.index_id = mi.id
      WHERE mi.symbol = ?
    `;

    return this.db.prepare(sql).get(symbol);
  }

  /**
   * Get market summary with all indices
   * @returns {Object} Market summary
   */
  getMarketSummary() {
    const indices = this.getAllIndices();

    // Calculate market breadth
    const advancing = indices.filter(i => i.change_1d_pct > 0).length;
    const declining = indices.filter(i => i.change_1d_pct < 0).length;
    const unchanged = indices.filter(i => i.change_1d_pct === 0).length;

    // Average change
    const avgChange = indices.reduce((sum, i) => sum + (i.change_1d_pct || 0), 0) / indices.length;

    // Market sentiment based on S&P 500
    const sp500 = indices.find(i => i.symbol === '^GSPC');
    let sentiment = 'neutral';
    if (sp500) {
      if (sp500.change_1d_pct > 1) sentiment = 'bullish';
      else if (sp500.change_1d_pct > 0) sentiment = 'slightly_bullish';
      else if (sp500.change_1d_pct < -1) sentiment = 'bearish';
      else if (sp500.change_1d_pct < 0) sentiment = 'slightly_bearish';
    }

    return {
      indices,
      summary: {
        advancing,
        declining,
        unchanged,
        avgChange: Math.round(avgChange * 100) / 100,
        sentiment,
        lastUpdated: indices[0]?.calculated_at
      }
    };
  }

  /**
   * Compare stock performance against index
   * @param {number} companyId - Company ID
   * @param {string} indexSymbol - Index symbol to compare against
   * @param {string} period - Time period ('1m', '3m', '6m', '1y', 'ytd')
   * @returns {Object} Comparison data
   */
  compareToIndex(companyId, indexSymbol = '^GSPC', period = '1y') {
    // Get index data
    const indexData = this.getIndexBySymbol(indexSymbol);
    if (!indexData) {
      throw new Error(`Index ${indexSymbol} not found`);
    }

    // Get company price data from prices table
    const periodDays = {
      '1m': 21,
      '3m': 63,
      '6m': 126,
      '1y': 252,
      'ytd': null
    };

    let days = periodDays[period];
    let startCondition = '';

    if (period === 'ytd') {
      startCondition = `AND p.date >= date('now', 'start of year')`;
    } else {
      startCondition = `AND p.date >= date('now', '-${days} days')`;
    }

    // Get stock prices
    const stockSql = `
      SELECT date, close
      FROM prices
      WHERE company_id = ?
      ${startCondition}
      ORDER BY date ASC
    `;

    const stockPrices = this.db.prepare(stockSql).all(companyId);

    // Get index prices for same period
    const indexSql = `
      SELECT mip.date, mip.close
      FROM market_index_prices mip
      JOIN market_indices mi ON mip.index_id = mi.id
      WHERE mi.symbol = ?
      ${startCondition.replace('p.date', 'mip.date')}
      ORDER BY mip.date ASC
    `;

    const indexPrices = this.db.prepare(indexSql).all(indexSymbol);

    // Calculate returns
    const calcReturn = (prices) => {
      if (prices.length < 2) return null;
      const first = prices[0].close;
      const last = prices[prices.length - 1].close;
      return ((last - first) / first) * 100;
    };

    const stockReturn = calcReturn(stockPrices);
    const indexReturn = calcReturn(indexPrices);

    return {
      period,
      stock: {
        return: stockReturn ? Math.round(stockReturn * 100) / 100 : null,
        dataPoints: stockPrices.length
      },
      index: {
        symbol: indexSymbol,
        name: indexData.name,
        return: indexReturn ? Math.round(indexReturn * 100) / 100 : null,
        dataPoints: indexPrices.length
      },
      alpha: stockReturn && indexReturn
        ? Math.round((stockReturn - indexReturn) * 100) / 100
        : null,
      outperformed: stockReturn && indexReturn
        ? stockReturn > indexReturn
        : null
    };
  }

  /**
   * Get normalized price series for charting
   * @param {string} indexSymbol - Index symbol
   * @param {number} companyId - Company ID (optional)
   * @param {string} period - Time period
   * @returns {Object} Normalized price series (base 100)
   */
  getNormalizedPrices(indexSymbol, companyId = null, period = '1y') {
    const periodDays = {
      '1m': 21,
      '3m': 63,
      '6m': 126,
      '1y': 252,
      '2y': 504,
      '5y': 1260
    };

    const days = periodDays[period] || 252;

    // Get index prices
    const indexSql = `
      SELECT mip.date, mip.close
      FROM market_index_prices mip
      JOIN market_indices mi ON mip.index_id = mi.id
      WHERE mi.symbol = ?
      ORDER BY mip.date DESC
      LIMIT ?
    `;

    const indexPrices = this.db.prepare(indexSql).all(indexSymbol, days);

    // Reverse to ascending order
    indexPrices.reverse();

    // Normalize to base 100
    const normalizeToBase100 = (prices) => {
      if (prices.length === 0) return [];
      const basePrice = prices[0].close;
      return prices.map(p => ({
        date: p.date,
        value: (p.close / basePrice) * 100
      }));
    };

    const result = {
      index: {
        symbol: indexSymbol,
        prices: normalizeToBase100(indexPrices)
      }
    };

    // Get company prices if provided
    if (companyId) {
      const stockSql = `
        SELECT date, close
        FROM prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT ?
      `;

      const stockPrices = this.db.prepare(stockSql).all(companyId, days);
      stockPrices.reverse();
      result.stock = {
        companyId,
        prices: normalizeToBase100(stockPrices)
      };
    }

    return result;
  }

  /**
   * Get S&P 500 constituents
   * @returns {Array} Array of S&P 500 companies
   */
  getSP500Constituents() {
    const sql = `
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        c.market_cap,
        cm.pe_ratio
      FROM companies c
      LEFT JOIN (
        SELECT company_id, pe_ratio
        FROM calculated_metrics
        WHERE period_type = 'annual'
        GROUP BY company_id
        HAVING fiscal_period = MAX(fiscal_period)
      ) cm ON c.id = cm.company_id
      WHERE c.is_sp500 = 1
      ORDER BY c.market_cap DESC
    `;

    return this.db.prepare(sql).all();
  }

  /**
   * Get index price count for verification
   * @returns {Array} Count of prices per index
   */
  getPriceStats() {
    const sql = `
      SELECT
        mi.symbol,
        mi.name,
        COUNT(mip.id) as price_count,
        MIN(mip.date) as earliest_date,
        MAX(mip.date) as latest_date
      FROM market_indices mi
      LEFT JOIN market_index_prices mip ON mi.id = mip.index_id
      GROUP BY mi.id
      ORDER BY mi.display_order
    `;

    return this.db.prepare(sql).all();
  }
}

// Export singleton instance
module.exports = new IndexService();
