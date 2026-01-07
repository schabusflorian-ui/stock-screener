/**
 * Valuation History & Percentile Service
 *
 * Tracks historical valuations and calculates percentiles to identify
 * when stocks are cheap or expensive relative to their own history.
 */

const db = require('../../database');

class ValuationService {
  constructor(dbInstance = null) {
    this.db = dbInstance || db.getDatabase();
  }

  /**
   * Store a valuation snapshot for a company
   */
  storeSnapshot(data) {
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

    const stmt = this.db.prepare(`
      INSERT INTO valuation_history (
        company_id, symbol, snapshot_date,
        price, market_cap, enterprise_value,
        pe_ratio, pe_forward, pb_ratio, ps_ratio,
        ev_ebitda, ev_sales, fcf_yield, earnings_yield, dividend_yield,
        peg_ratio, roic, roe, operating_margin, revenue_growth_yoy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    `);

    return stmt.run(
      companyId, symbol, snapshotDate,
      price, marketCap, enterpriseValue,
      peRatio, peForward, pbRatio, psRatio,
      evEbitda, evSales, fcfYield, earningsYield, dividendYield,
      pegRatio, roic, roe, operatingMargin, revenueGrowthYoy
    );
  }

  /**
   * Create valuation snapshot from current calculated_metrics
   */
  createSnapshotFromMetrics(symbol, snapshotDate = null) {
    const date = snapshotDate || new Date().toISOString().split('T')[0];

    // Get current metrics
    const metrics = this.db.prepare(`
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
      WHERE c.symbol = ?
    `).get(symbol);

    if (!metrics) {
      return null;
    }

    // Get current price
    const priceData = this.db.prepare(`
      SELECT close as price
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY price_date DESC
      LIMIT 1
    `).get(metrics.company_id);

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
  calculateRanges(companyId, symbol) {
    // Get historical data
    const history1y = this.getHistory(companyId, 365);
    const history3y = this.getHistory(companyId, 365 * 3);
    const history5y = this.getHistory(companyId, 365 * 5);

    // Calculate ranges
    const pe1y = this.calculateStats(history1y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));
    const pe3y = this.calculateStats(history3y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));
    const pe5y = this.calculateStats(history5y.map(h => h.pe_ratio).filter(v => v !== null && v > 0 && v < 200));

    const pb5y = this.calculateStats(history5y.map(h => h.pb_ratio).filter(v => v !== null && v > 0));
    const evEbitda5y = this.calculateStats(history5y.map(h => h.ev_ebitda).filter(v => v !== null && v > 0));
    const fcfYield5y = this.calculateStats(history5y.map(h => h.fcf_yield).filter(v => v !== null));

    // Get current values
    const current = this.db.prepare(`
      SELECT pe_ratio, pb_ratio, ev_to_ebitda, fcf_yield
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.symbol = ?
    `).get(symbol);

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
    const stmt = this.db.prepare(`
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    `);

    return stmt.run(
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
    );
  }

  /**
   * Get valuation history
   */
  getHistory(companyId, days = 365 * 5) {
    return this.db.prepare(`
      SELECT * FROM valuation_history
      WHERE company_id = ?
        AND snapshot_date >= date('now', '-' || ? || ' days')
      ORDER BY snapshot_date ASC
    `).all(companyId, days);
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
  getRanges(symbol) {
    return this.db.prepare(`
      SELECT vr.*, c.name, c.sector
      FROM valuation_ranges vr
      JOIN companies c ON vr.company_id = c.id
      WHERE vr.symbol = ?
    `).get(symbol);
  }

  /**
   * Find stocks trading at historical lows
   */
  findHistoricallyUndervalued(limit = 30) {
    return this.db.prepare(`
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
      LIMIT ?
    `).all(limit);
  }

  /**
   * Find quality stocks at fair prices (GARP)
   */
  findQualityAtReasonablePrice(limit = 30) {
    return this.db.prepare(`
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
      LIMIT ?
    `).all(limit);
  }

  /**
   * Find stocks trading at historical highs (potential sells)
   */
  findHistoricallyOvervalued(limit = 30) {
    return this.db.prepare(`
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
      LIMIT ?
    `).all(limit);
  }

  /**
   * Batch process: Create snapshots for all companies with metrics
   */
  createAllSnapshots(date = null) {
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    const companies = this.db.prepare(`
      SELECT c.symbol
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE cm.pe_ratio IS NOT NULL
    `).all();

    let created = 0;
    for (const company of companies) {
      try {
        this.createSnapshotFromMetrics(company.symbol, snapshotDate);
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
  calculateAllRanges() {
    const companies = this.db.prepare(`
      SELECT DISTINCT company_id, symbol
      FROM valuation_history
      GROUP BY company_id
      HAVING COUNT(*) >= 20
    `).all();

    let processed = 0;
    for (const company of companies) {
      try {
        this.calculateRanges(company.company_id, company.symbol);
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
  getValuationContext(symbol) {
    const ranges = this.getRanges(symbol);
    const history = this.getHistory(
      ranges?.company_id,
      365 * 5
    ).map(h => ({
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
