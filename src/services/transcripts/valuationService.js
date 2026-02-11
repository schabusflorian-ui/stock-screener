/**
 * Valuation History & Percentile Service
 *
 * Tracks historical valuations and calculates percentiles to identify
 * when stocks are cheap or expensive relative to their own history.
 */

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class ValuationService {
  constructor(dbInstance = null) {
    this.db = dbInstance;
    this.dbPromise = null;
    this.normalizedDb = null;
    if (this.db) {
      this.normalizedDb = this._normalizeDb(this.db);
    }
  }

  async _getDatabase() {
    if (this.normalizedDb) return this.normalizedDb;
    if (this.db) {
      this.normalizedDb = this._normalizeDb(this.db);
      return this.normalizedDb;
    }
    if (!this.dbPromise) {
      this.dbPromise = getDatabaseAsync();
    }
    return this.dbPromise;
  }

  _normalizeDb(database) {
    if (database?.query) return database;
    if (!database?.prepare) {
      throw new Error('Unsupported database instance for ValuationService');
    }

    return {
      query: async (sql, params = []) => {
        const normalizedSql = sql.replace(/\$\d+/g, '?');
        const normalizedParams = params.map((param) => {
          if (typeof param === 'boolean') return param ? 1 : 0;
          return param;
        });
        const stmt = database.prepare(normalizedSql);
        if (/^\s*select\b/i.test(normalizedSql)) {
          return { rows: stmt.all(normalizedParams) };
        }
        const info = stmt.run(normalizedParams);
        return { rows: [], lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      },
    };
  }

  /**
   * Store a valuation snapshot for a company
   */
  async storeSnapshot(data) {
    const {
      companyId,
      symbol,
      snapshotDate,
      price,
      marketCap,
      enterpriseValue,
      peRatio,
      peForward,
      pbRatio,
      psRatio,
      evEbitda,
      evSales,
      fcfYield,
      earningsYield,
      dividendYield,
      pegRatio,
      roic,
      roe,
      operatingMargin,
      revenueGrowthYoy
    } = data;

    const params = [
      companyId, symbol, snapshotDate,
      price, marketCap, enterpriseValue,
      peRatio, peForward, pbRatio, psRatio,
      evEbitda, evSales, fcfYield, earningsYield, dividendYield,
      pegRatio, roic, roe, operatingMargin, revenueGrowthYoy
    ];

    const database = await this._getDatabase();
    return database.query(`
      INSERT INTO valuation_history (
        company_id, symbol, snapshot_date,
        price, market_cap, enterprise_value,
        pe_ratio, pe_forward, pb_ratio, ps_ratio,
        ev_ebitda, ev_sales, fcf_yield, earnings_yield, dividend_yield,
        peg_ratio, roic, roe, operating_margin, revenue_growth_yoy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT(company_id, snapshot_date) DO UPDATE SET
        price = excluded.price,
        market_cap = excluded.market_cap,
        enterprise_value = excluded.enterprise_value,
        pe_ratio = excluded.pe_ratio,
        pe_forward = excluded.pe_forward,
        pb_ratio = excluded.pb_ratio,
        ps_ratio = excluded.ps_ratio,
        ev_ebitda = excluded.ev_ebitda,
        ev_sales = excluded.ev_sales,
        fcf_yield = excluded.fcf_yield,
        earnings_yield = excluded.earnings_yield,
        dividend_yield = excluded.dividend_yield,
        peg_ratio = excluded.peg_ratio,
        roic = excluded.roic,
        roe = excluded.roe,
        operating_margin = excluded.operating_margin,
        revenue_growth_yoy = excluded.revenue_growth_yoy
    `, params);
  }

  /**
   * Create valuation snapshot from current calculated_metrics
   */
  async createSnapshotFromMetrics(symbol, snapshotDate = null) {
    const date = snapshotDate || new Date().toISOString().split('T')[0];

    const database = await this._getDatabase();
    const metricsRes = await database.query(`
      SELECT
        c.id as company_id, c.symbol,
        cm.pe_ratio, cm.forward_pe as pe_forward, cm.pb_ratio, cm.ps_ratio,
        cm.ev_to_ebitda as ev_ebitda, cm.ev_to_revenue as ev_sales,
        cm.fcf_yield, cm.earnings_yield, cm.dividend_yield,
        cm.peg_ratio, cm.roic, cm.roe,
        cm.operating_margin, cm.revenue_growth_yoy,
        cm.market_cap, cm.enterprise_value
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE c.symbol = $1
    `, [symbol]);
    const metrics = metricsRes.rows[0];

    if (!metrics) {
      return null;
    }

    const priceRes = await database.query(`
      SELECT close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY price_date DESC
      LIMIT 1
    `, [metrics.company_id]);
    const priceData = priceRes.rows[0];

    return this.storeSnapshot({
      companyId: metrics.company_id,
      symbol: metrics.symbol,
      snapshotDate: date,
      price: priceData?.price,
      marketCap: metrics.market_cap,
      enterpriseValue: metrics.enterprise_value,
      peRatio: metrics.pe_ratio,
      peForward: metrics.pe_forward,
      pbRatio: metrics.pb_ratio,
      psRatio: metrics.ps_ratio,
      evEbitda: metrics.ev_ebitda,
      evSales: metrics.ev_sales,
      fcfYield: metrics.fcf_yield,
      earningsYield: metrics.earnings_yield,
      dividendYield: metrics.dividend_yield,
      pegRatio: metrics.peg_ratio,
      roic: metrics.roic,
      roe: metrics.roe,
      operatingMargin: metrics.operating_margin,
      revenueGrowthYoy: metrics.revenue_growth_yoy
    });
  }

  /**
   * Calculate valuation ranges and percentiles for a company
   */
  async calculateRanges(companyId, symbol) {
    const history1y = await this.getHistory(companyId, 365);
    const history3y = await this.getHistory(companyId, 365 * 3);
    const history5y = await this.getHistory(companyId, 365 * 5);

    // Calculate ranges
    const pe1y = this.calculateStats(history1y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));
    const pe3y = this.calculateStats(history3y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));
    const pe5y = this.calculateStats(history5y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));

    const pb5y = this.calculateStats(history5y.map(h => h.pb_ratio).filter(v => v !== null && v > 0));
    const evEbitda5y = this.calculateStats(history5y.map(h => h.ev_ebitda).filter(v => v !== null && v > 0));
    const fcfYield5y = this.calculateStats(history5y.map(h => h.fcf_yield).filter(v => v !== null));

    // Get current values
    const database = await this._getDatabase();
    const currentRes = await database.query(`
      SELECT pe_ratio, pb_ratio, ev_to_ebitda, fcf_yield
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.symbol = $1
    `, [symbol]);
    const current = currentRes.rows[0];

    // Calculate current percentiles
    const currentPePercentile = current?.pe_ratio
      ? this.calculatePercentile(pe5y.values, current.pe_ratio)
      : null;
    const currentPbPercentile = current?.pb_ratio
      ? this.calculatePercentile(pb5y.values, current.pb_ratio)
      : null;
    const currentFcfYieldPercentile = current?.fcf_yield
      ? this.calculatePercentile(fcfYield5y.values, current.fcf_yield)
      : null;

    // Determine valuation signal
    let signal = 'fair';
    let confidence = 0;

    if (currentPePercentile !== null && currentFcfYieldPercentile !== null) {
      // Lower PE percentile = cheaper, Higher FCF yield percentile = cheaper
      const valuationScore = (100 - currentPePercentile + currentFcfYieldPercentile) / 2;

      if (valuationScore > 80) { signal = 'very_cheap'; confidence = 0.9; }
      else if (valuationScore > 65) { signal = 'cheap'; confidence = 0.7; }
      else if (valuationScore > 35) { signal = 'fair'; confidence = 0.5; }
      else if (valuationScore > 20) { signal = 'expensive'; confidence = 0.7; }
      else { signal = 'very_expensive'; confidence = 0.9; }
    }

    // Store the ranges
    return database.query(`
      INSERT INTO valuation_ranges (
        company_id, symbol,
        pe_min_1y, pe_max_1y, pe_avg_1y, pe_median_1y,
        pe_min_3y, pe_max_3y, pe_avg_3y, pe_median_3y,
        pe_min_5y, pe_max_5y, pe_avg_5y, pe_median_5y,
        pb_min_5y, pb_max_5y, pb_avg_5y, pb_median_5y,
        ev_ebitda_min_5y, ev_ebitda_max_5y, ev_ebitda_avg_5y,
        fcf_yield_min_5y, fcf_yield_max_5y, fcf_yield_avg_5y,
        current_pe, current_pe_percentile,
        current_pb, current_pb_percentile,
        current_fcf_yield, current_fcf_yield_percentile,
        valuation_signal, signal_confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
      ON CONFLICT(company_id) DO UPDATE SET
        pe_min_1y = excluded.pe_min_1y, pe_max_1y = excluded.pe_max_1y,
        pe_avg_1y = excluded.pe_avg_1y, pe_median_1y = excluded.pe_median_1y,
        pe_min_3y = excluded.pe_min_3y, pe_max_3y = excluded.pe_max_3y,
        pe_avg_3y = excluded.pe_avg_3y, pe_median_3y = excluded.pe_median_3y,
        pe_min_5y = excluded.pe_min_5y, pe_max_5y = excluded.pe_max_5y,
        pe_avg_5y = excluded.pe_avg_5y, pe_median_5y = excluded.pe_median_5y,
        pb_min_5y = excluded.pb_min_5y, pb_max_5y = excluded.pb_max_5y,
        pb_avg_5y = excluded.pb_avg_5y, pb_median_5y = excluded.pb_median_5y,
        ev_ebitda_min_5y = excluded.ev_ebitda_min_5y, ev_ebitda_max_5y = excluded.ev_ebitda_max_5y,
        ev_ebitda_avg_5y = excluded.ev_ebitda_avg_5y,
        fcf_yield_min_5y = excluded.fcf_yield_min_5y, fcf_yield_max_5y = excluded.fcf_yield_max_5y,
        fcf_yield_avg_5y = excluded.fcf_yield_avg_5y,
        current_pe = excluded.current_pe, current_pe_percentile = excluded.current_pe_percentile,
        current_pb = excluded.current_pb, current_pb_percentile = excluded.current_pb_percentile,
        current_fcf_yield = excluded.current_fcf_yield, current_fcf_yield_percentile = excluded.current_fcf_yield_percentile,
        valuation_signal = excluded.valuation_signal, signal_confidence = excluded.signal_confidence,
        calculated_at = CURRENT_TIMESTAMP
    `, [
      companyId, symbol,
      pe1y.min, pe1y.max, pe1y.avg, pe1y.median,
      pe3y.min, pe3y.max, pe3y.avg, pe3y.median,
      pe5y.min, pe5y.max, pe5y.avg, pe5y.median,
      pb5y.min, pb5y.max, pb5y.avg, pb5y.median,
      evEbitda5y.min, evEbitda5y.max, evEbitda5y.avg,
      fcfYield5y.min, fcfYield5y.max, fcfYield5y.avg,
      current?.pe_ratio, currentPePercentile,
      current?.pb_ratio, currentPbPercentile,
      current?.fcf_yield, currentFcfYieldPercentile,
      signal, confidence
    ]);
  }

  /**
   * Get valuation history
   */
  async getHistory(companyId, days = 365 * 5) {
    const database = await this._getDatabase();
    const dateFilter = isUsingPostgres()
      ? 'snapshot_date >= CURRENT_DATE - ($2 * INTERVAL \'1 day\')'
      : "snapshot_date >= date('now', '-' || $2 || ' days')";
    const result = await database.query(`
      SELECT * FROM valuation_history
      WHERE company_id = $1
        AND ${dateFilter}
      ORDER BY snapshot_date ASC
    `, [companyId, days]);
    return result.rows;
  }

  /**
   * Calculate statistics for a value array
   */
  calculateStats(values) {
    if (!values || values.length === 0) {
      return { min: null, max: null, avg: null, median: null, values: [] };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    return {
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      values: sorted
    };
  }

  /**
   * Calculate percentile of a value within a distribution
   */
  calculatePercentile(sortedValues, value) {
    if (!sortedValues || sortedValues.length === 0) return null;

    let count = 0;
    for (const v of sortedValues) {
      if (v <= value) count++;
    }

    return Math.round((count / sortedValues.length) * 100);
  }

  /**
   * Get valuation ranges for a symbol
   */
  async getRanges(symbol) {
    const database = await this._getDatabase();
    const res = await database.query(`
      SELECT vr.*, c.name, c.sector
      FROM valuation_ranges vr
      JOIN companies c ON vr.company_id = c.id
      WHERE vr.symbol = $1
    `, [symbol]);
    return res.rows[0];
  }

  /**
   * Find stocks trading at historical lows
   */
  async findHistoricallyUndervalued(limit = 30) {
    const database = await this._getDatabase();
    const res = await database.query(`
      SELECT
        vr.symbol, c.name, c.sector,
        vr.current_pe, vr.pe_avg_5y, vr.current_pe_percentile,
        vr.current_pb, vr.pb_avg_5y, vr.current_pb_percentile,
        vr.current_fcf_yield, vr.fcf_yield_avg_5y, vr.current_fcf_yield_percentile,
        vr.valuation_signal, vr.signal_confidence,
        cm.roic, cm.roe
      FROM valuation_ranges vr
      JOIN companies c ON vr.company_id = c.id
      LEFT JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE vr.valuation_signal IN ('cheap', 'very_cheap')
        AND vr.current_pe_percentile < 30
        AND cm.roic > 0.10
      ORDER BY vr.current_pe_percentile ASC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  /**
   * Find quality stocks at fair prices (GARP)
   */
  async findQualityAtReasonablePrice(limit = 30) {
    const database = await this._getDatabase();
    const res = await database.query(`
      SELECT
        vr.symbol, c.name, c.sector,
        vr.current_pe, vr.pe_median_5y, vr.current_pe_percentile,
        vr.valuation_signal,
        cm.roic, cm.roe, cm.revenue_growth_yoy
      FROM valuation_ranges vr
      JOIN companies c ON vr.company_id = c.id
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE vr.current_pe_percentile BETWEEN 20 AND 60
        AND cm.roic > 0.15
        AND cm.revenue_growth_yoy > 0.05
      ORDER BY cm.roic DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  /**
   * Find stocks trading at historical highs (potential sells)
   */
  async findHistoricallyOvervalued(limit = 30) {
    const database = await this._getDatabase();
    const res = await database.query(`
      SELECT
        vr.symbol, c.name, c.sector,
        vr.current_pe, vr.pe_avg_5y, vr.current_pe_percentile,
        vr.current_fcf_yield, vr.fcf_yield_avg_5y,
        vr.valuation_signal, vr.signal_confidence
      FROM valuation_ranges vr
      JOIN companies c ON vr.company_id = c.id
      WHERE vr.valuation_signal IN ('expensive', 'very_expensive')
        AND vr.current_pe_percentile > 80
      ORDER BY vr.current_pe_percentile DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  /**
   * Batch process: Create snapshots for all companies with metrics
   */
  async createAllSnapshots(date = null) {
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    const database = await this._getDatabase();
    const companiesRes = await database.query(`
      SELECT c.symbol
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE cm.pe_ratio IS NOT NULL
    `);
    const companies = companiesRes.rows;

    let created = 0;
    for (const company of companies) {
      try {
        await this.createSnapshotFromMetrics(company.symbol, snapshotDate);
        created++;
      } catch (err) {
        console.error(`Failed to create snapshot for ${company.symbol}:`, err.message);
      }
    }

    return { created, total: companies.length };
  }

  /**
   * Batch process: Calculate ranges for all companies
   */
  async calculateAllRanges() {
    const database = await this._getDatabase();
    const companiesRes = await database.query(`
      SELECT DISTINCT company_id, symbol
      FROM valuation_history
      GROUP BY company_id
      HAVING COUNT(*) >= 20
    `);
    const companies = companiesRes.rows;

    let processed = 0;
    for (const company of companies) {
      try {
        await this.calculateRanges(company.company_id, company.symbol);
        processed++;
      } catch (err) {
        console.error(`Failed to calculate ranges for ${company.symbol}:`, err.message);
      }
    }

    return { processed, total: companies.length };
  }

  /**
   * Get valuation context for a symbol
   */
  async getValuationContext(symbol) {
    const ranges = await this.getRanges(symbol);
    const historyRows = ranges
      ? await this.getHistory(ranges.company_id, 365 * 5)
      : [];
    const history = historyRows.map(h => ({
      date: h.snapshot_date,
      pe: h.pe_ratio,
      pb: h.pb_ratio,
      fcfYield: h.fcf_yield
    }));

    return {
      symbol,
      ranges,
      history,
      assessment: this.generateAssessment(ranges)
    };
  }

  /**
   * Generate human-readable valuation assessment
   */
  generateAssessment(ranges) {
    if (!ranges) {
      return { text: 'Insufficient valuation history', signal: 'unknown' };
    }

    const { current_pe_percentile, pe_avg_5y, current_pe, valuation_signal } = ranges;

    let text = '';

    if (valuation_signal === 'very_cheap') {
      text = `Trading at historical lows. Current P/E of ${current_pe?.toFixed(1)} is at the ${current_pe_percentile}th percentile of its 5-year range (avg: ${pe_avg_5y?.toFixed(1)}). This represents a potential deep value opportunity if fundamentals remain sound.`;
    } else if (valuation_signal === 'cheap') {
      text = `Below average valuation. Current P/E of ${current_pe?.toFixed(1)} is at the ${current_pe_percentile}th percentile vs 5-year average of ${pe_avg_5y?.toFixed(1)}. Worth investigating for value investors.`;
    } else if (valuation_signal === 'fair') {
      text = `Fair value relative to history. Current P/E of ${current_pe?.toFixed(1)} is near the ${current_pe_percentile}th percentile, close to 5-year average of ${pe_avg_5y?.toFixed(1)}.`;
    } else if (valuation_signal === 'expensive') {
      text = `Above average valuation. Current P/E of ${current_pe?.toFixed(1)} is at the ${current_pe_percentile}th percentile, above 5-year average of ${pe_avg_5y?.toFixed(1)}. Consider whether growth justifies premium.`;
    } else if (valuation_signal === 'very_expensive') {
      text = `Trading at historical highs. Current P/E of ${current_pe?.toFixed(1)} is at the ${current_pe_percentile}th percentile vs 5-year average of ${pe_avg_5y?.toFixed(1)}. High expectations priced in.`;
    }

    return { text, signal: valuation_signal };
  }
}

module.exports = ValuationService;
