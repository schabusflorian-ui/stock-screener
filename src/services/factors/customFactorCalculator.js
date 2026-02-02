// src/services/factors/customFactorCalculator.js
// Calculate user-defined custom factors across the stock universe

const { createParser, validateFormula } = require('./factorFormulaParser');

// Quality filter defaults for factor universe
// These filters exclude garbage stocks (penny stocks, micro-caps, illiquid stocks)
const DEFAULT_QUALITY_FILTERS = {
  minMarketCap: 300_000_000,      // $300M (small-cap+)
  minAvgVolume: 50_000,           // 50K shares/day minimum
  minPrice: 5.0,                  // No penny stocks (< $5)
  maxDebtToEquity: 5.0,           // Exclude extremely leveraged (> 5x)
  minDataQualityScore: 0.4        // At least 40% data completeness
};

/**
 * CustomFactorCalculator
 *
 * Calculates user-defined factors from raw metrics.
 * Supports:
 * - Formula parsing and evaluation
 * - Z-score normalization
 * - Winsorization
 * - Sector neutralization
 * - Historical calculation for backtesting
 */
class CustomFactorCalculator {
  constructor(db) {
    this.db = db;
    this.availableMetrics = null;
  }

  /**
   * Get list of available metrics for factor construction
   */
  getAvailableMetrics() {
    if (this.availableMetrics) {
      return this.availableMetrics;
    }

    const metrics = this.db.prepare(`
      SELECT metric_code, metric_name, category, description, higher_is_better
      FROM available_metrics
      WHERE is_active = 1
      ORDER BY category, metric_name
    `).all();

    this.availableMetrics = metrics;
    return metrics;
  }

  /**
   * Get available metric codes
   */
  getMetricCodes() {
    return this.getAvailableMetrics().map(m => m.metric_code);
  }

  /**
   * Validate a factor formula
   */
  validateFormula(formula) {
    const availableCodes = this.getMetricCodes();
    return validateFormula(formula, availableCodes);
  }

  /**
   * Calculate factor values for all stocks at a given date
   */
  calculateFactorValues(factorId, formula, options = {}) {
    const {
      asOfDate = new Date().toISOString().split('T')[0],
      transformations = {},
      universe = 'ALL',
      minMarketCap = null,
      storeResults = false
    } = options;

    // Parse the formula
    const parser = createParser(formula);
    if (parser.error) {
      throw new Error(`Formula parse error: ${parser.error}`);
    }

    // Get required metrics
    const requiredMetrics = parser.getRequiredMetrics();

    // Build query to get all stocks with required metrics
    const stocks = this._getStocksWithMetrics(requiredMetrics, asOfDate, {
      universe,
      minMarketCap
    });

    if (stocks.length === 0) {
      return { values: [], stats: null };
    }

    // Calculate raw factor values
    const rawValues = stocks.map(stock => {
      const metricValues = {};
      for (const metric of requiredMetrics) {
        metricValues[metric] = stock[metric];
      }

      return {
        symbol: stock.symbol,
        company_id: stock.company_id,
        sector: stock.sector,
        market_cap: stock.market_cap,
        rawValue: parser.calculate(metricValues),
        componentValues: metricValues
      };
    }).filter(v => v.rawValue !== null && !isNaN(v.rawValue));

    if (rawValues.length === 0) {
      return { values: [], stats: null };
    }

    // Calculate statistics
    const values = rawValues.map(v => v.rawValue);
    const stats = this._calculateStats(values);

    // Apply transformations
    const transformedValues = this._applyTransformations(rawValues, stats, transformations);

    // Store results if requested
    if (storeResults && factorId) {
      this._storeFactorValues(factorId, asOfDate, transformedValues);
    }

    return {
      values: transformedValues,
      stats: {
        count: rawValues.length,
        mean: stats.mean,
        std: stats.std,
        min: stats.min,
        max: stats.max,
        median: stats.median
      },
      date: asOfDate,
      requiredMetrics
    };
  }

  /**
   * Calculate factor values for historical dates (for backtesting)
   */
  async calculateHistoricalFactorValues(factorId, formula, options = {}) {
    const {
      startDate = '2015-01-01',
      endDate = new Date().toISOString().split('T')[0],
      frequency = 'monthly', // 'monthly', 'quarterly', 'daily'
      transformations = {},
      universe = 'ALL',
      storeResults = false,
      verbose = false
    } = options;

    // Get dates to calculate
    const dates = this._getCalculationDates(startDate, endDate, frequency);

    if (verbose) {
      console.log(`📊 Calculating factor for ${dates.length} dates...`);
    }

    const results = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];

      const result = this.calculateFactorValues(factorId, formula, {
        asOfDate: date,
        transformations,
        universe,
        storeResults
      });

      results.push({
        date,
        count: result.values.length,
        stats: result.stats
      });

      if (verbose && i % 12 === 0) {
        console.log(`  Processed ${i + 1}/${dates.length} (${date})`);
      }
    }

    return {
      dates: results,
      totalCalculations: results.reduce((sum, r) => sum + r.count, 0)
    };
  }

  /**
   * Get factor values for specific stocks
   */
  getFactorValuesForStocks(formula, symbols, asOfDate = null) {
    const parser = createParser(formula);
    if (parser.error) {
      throw new Error(`Formula parse error: ${parser.error}`);
    }

    const requiredMetrics = parser.getRequiredMetrics();
    const date = asOfDate || new Date().toISOString().split('T')[0];

    const results = [];

    for (const symbol of symbols) {
      const stock = this._getStockMetrics(symbol, requiredMetrics, date);
      if (!stock) continue;

      const metricValues = {};
      for (const metric of requiredMetrics) {
        metricValues[metric] = stock[metric];
      }

      const value = parser.calculate(metricValues);

      results.push({
        symbol,
        value,
        componentValues: metricValues,
        sector: stock.sector,
        marketCap: stock.market_cap
      });
    }

    return results;
  }

  /**
   * Preview factor values (limited sample)
   */
  previewFactorValues(formula, options = {}) {
    const { sampleSize = 20, asOfDate } = options;

    const calcOptions = { storeResults: false };
    if (asOfDate) {
      calcOptions.asOfDate = asOfDate;
    }

    const result = this.calculateFactorValues(null, formula, calcOptions);

    // Sort by value and take top and bottom samples
    const sorted = result.values.sort((a, b) => b.zscoreValue - a.zscoreValue);
    const topStocks = sorted.slice(0, Math.floor(sampleSize / 2));
    const bottomStocks = sorted.slice(-Math.floor(sampleSize / 2));

    return {
      stats: result.stats,
      topStocks,
      bottomStocks,
      requiredMetrics: result.requiredMetrics,
      universeSize: result.values.length
    };
  }

  /**
   * Get stocks with required metrics at a date
   */
  _getStocksWithMetrics(requiredMetrics, asOfDate, options = {}) {
    const { universe = 'ALL', minMarketCap = null } = options;

    // Build the SELECT clause dynamically
    const metricSelects = requiredMetrics.map(m => {
      // Map metric names to actual columns/tables
      return this._getMetricColumn(m);
    }).filter(Boolean);

    if (metricSelects.length !== requiredMetrics.length) {
      throw new Error('Some required metrics are not available in the database');
    }

    // Use subqueries to avoid Cartesian products with multiple rows per company
    // Prefer quarterly/annual data over TTM records (TTM often has NULL values)
    // fiscal_period formats: "TTM-YYYY-MM-DD" or "YYYY-MM-DD"
    let query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.sector,
        c.industry,
        c.market_cap,
        ${metricSelects.join(',\n        ')}
      FROM companies c
      LEFT JOIN (
        SELECT cm1.*
        FROM calculated_metrics cm1
        INNER JOIN (
          SELECT company_id, MAX(fiscal_period) as latest_period
          FROM calculated_metrics
          WHERE fiscal_period NOT LIKE 'TTM%'
            AND fiscal_period <= ?
          GROUP BY company_id
        ) latest ON cm1.company_id = latest.company_id AND cm1.fiscal_period = latest.latest_period
      ) cm ON c.id = cm.company_id
      LEFT JOIN (
        SELECT sfs1.*
        FROM stock_factor_scores sfs1
        INNER JOIN (
          SELECT company_id, MAX(score_date) as latest_score
          FROM stock_factor_scores
          WHERE score_date <= ?
          GROUP BY company_id
        ) latest ON sfs1.company_id = latest.company_id AND sfs1.score_date = latest.latest_score
      ) sfs ON c.id = sfs.company_id
      WHERE c.is_active = 1
    `;

    const params = [asOfDate, asOfDate];

    if (minMarketCap) {
      query += ' AND c.market_cap >= ?';
      params.push(minMarketCap);
    }

    if (universe === 'SP500') {
      query += ` AND c.symbol IN (SELECT symbol FROM index_constituents WHERE index_name = 'S&P 500')`;
    } else if (universe === 'RUSSELL1000') {
      query += ` AND c.market_cap >= 10000000000`; // ~$10B proxy for Russell 1000
    }

    // Add a reasonable limit to prevent memory issues
    query += ' LIMIT 10000';

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get metric column mapping
   */
  _getMetricColumn(metricCode) {
    const mappings = {
      // Valuation (from companies/calculated_metrics)
      pe_ratio: 'cm.pe_ratio as pe_ratio',
      pb_ratio: 'cm.pb_ratio as pb_ratio',
      ps_ratio: 'cm.ps_ratio as ps_ratio',
      ev_ebitda: 'cm.ev_ebitda as ev_ebitda',
      earnings_yield: 'cm.earnings_yield as earnings_yield',
      fcf_yield: 'cm.fcf_yield as fcf_yield',
      dividend_yield: 'cm.dividend_yield as dividend_yield',
      enterprise_value: 'c.enterprise_value as enterprise_value',
      market_cap: 'c.market_cap as market_cap',

      // Profitability
      roe: 'cm.roe as roe',
      roic: 'cm.roic as roic',
      roa: 'cm.roa as roa',
      gross_margin: 'cm.gross_margin as gross_margin',
      operating_margin: 'cm.operating_margin as operating_margin',
      net_margin: 'cm.net_margin as net_margin',
      asset_turnover: 'cm.asset_turnover as asset_turnover',

      // Growth
      revenue_growth_yoy: 'cm.revenue_growth_yoy as revenue_growth_yoy',
      earnings_growth_yoy: 'cm.earnings_growth_yoy as earnings_growth_yoy',
      fcf_growth_yoy: 'cm.fcf_growth_yoy as fcf_growth_yoy',

      // Quality
      debt_to_equity: 'cm.debt_to_equity as debt_to_equity',
      current_ratio: 'cm.current_ratio as current_ratio',
      quick_ratio: 'cm.quick_ratio as quick_ratio',
      interest_coverage: 'cm.interest_coverage as interest_coverage',
      piotroski_f: 'cm.piotroski_f as piotroski_f',

      // Technical (from stock_factor_scores)
      momentum_1m: 'sfs.momentum_score * 0.3 as momentum_1m', // Approximation
      momentum_3m: 'sfs.momentum_score * 0.5 as momentum_3m',
      momentum_6m: 'sfs.momentum_score * 0.8 as momentum_6m',
      momentum_12m: 'sfs.momentum_score as momentum_12m',
      volatility: 'sfs.volatility_score as volatility',
      beta: 'sfs.beta as beta',

      // Factor scores (from stock_factor_scores)
      value_score: 'sfs.value_score as value_score',
      quality_score: 'sfs.quality_score as quality_score',
      momentum_score: 'sfs.momentum_score as momentum_score',
      growth_score: 'sfs.growth_score as growth_score',
      size_score: 'sfs.size_score as size_score',
      volatility_score: 'sfs.volatility_score as volatility_score'
    };

    return mappings[metricCode] || null;
  }

  /**
   * Get metrics for a single stock
   */
  _getStockMetrics(symbol, requiredMetrics, asOfDate) {
    const metricSelects = requiredMetrics.map(m => this._getMetricColumn(m)).filter(Boolean);

    const query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.sector,
        c.market_cap,
        ${metricSelects.join(',\n        ')}
      FROM companies c
      LEFT JOIN calculated_metrics cm ON c.id = cm.company_id
      LEFT JOIN stock_factor_scores sfs ON c.id = sfs.company_id
      WHERE c.symbol = ?
        AND (cm.fiscal_period IS NULL OR cm.fiscal_period <= ?)
        AND (sfs.score_date IS NULL OR sfs.score_date <= ?)
      ORDER BY cm.fiscal_period DESC, sfs.score_date DESC
      LIMIT 1
    `;

    return this.db.prepare(query).get(symbol, asOfDate, asOfDate);
  }

  /**
   * Calculate statistics for an array of values
   */
  _calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const std = Math.sqrt(variance);

    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    return {
      mean,
      std,
      min: sorted[0],
      max: sorted[n - 1],
      median,
      q1: sorted[Math.floor(n * 0.25)],
      q3: sorted[Math.floor(n * 0.75)]
    };
  }

  /**
   * Apply transformations to factor values
   */
  _applyTransformations(rawValues, stats, transformations) {
    const {
      zscore = true,
      winsorize = null, // { lower: 0.01, upper: 0.99 }
      sectorNeutral = false
    } = transformations;

    let values = [...rawValues];

    // Apply winsorization first
    if (winsorize) {
      const lower = stats.q1 - 1.5 * (stats.q3 - stats.q1);
      const upper = stats.q3 + 1.5 * (stats.q3 - stats.q1);

      values = values.map(v => ({
        ...v,
        rawValue: Math.max(lower, Math.min(upper, v.rawValue))
      }));
    }

    // Apply z-score normalization
    if (zscore) {
      const mean = values.reduce((sum, v) => sum + v.rawValue, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v.rawValue - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);

      values = values.map(v => ({
        ...v,
        zscoreValue: std === 0 ? 0 : (v.rawValue - mean) / std
      }));
    } else {
      values = values.map(v => ({
        ...v,
        zscoreValue: v.rawValue
      }));
    }

    // Apply sector neutralization
    if (sectorNeutral) {
      // Group by sector
      const sectors = {};
      for (const v of values) {
        const sector = v.sector || 'Unknown';
        if (!sectors[sector]) sectors[sector] = [];
        sectors[sector].push(v);
      }

      // Subtract sector mean from each stock
      for (const [sector, sectorStocks] of Object.entries(sectors)) {
        const sectorMean = sectorStocks.reduce((sum, v) => sum + v.zscoreValue, 0) / sectorStocks.length;
        for (const v of sectorStocks) {
          v.zscoreValue -= sectorMean;
        }
      }
    }

    // Calculate percentile ranks
    const sorted = [...values].sort((a, b) => a.zscoreValue - b.zscoreValue);
    sorted.forEach((v, i) => {
      v.percentileValue = (i / (sorted.length - 1)) * 100;
    });

    return values;
  }

  /**
   * Store factor values in cache table
   */
  _storeFactorValues(factorId, date, values) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO factor_values_cache
      (factor_id, symbol, date, raw_value, zscore_value, percentile_value, component_values, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const transaction = this.db.transaction(() => {
      for (const v of values) {
        stmt.run(
          factorId,
          v.symbol,
          date,
          v.rawValue,
          v.zscoreValue,
          v.percentileValue,
          JSON.stringify(v.componentValues)
        );
      }
    });

    transaction();
  }

  /**
   * Get calculation dates for historical analysis
   */
  _getCalculationDates(startDate, endDate, frequency) {
    let interval;
    switch (frequency) {
      case 'daily':
        interval = '1 day';
        break;
      case 'weekly':
        interval = '7 days';
        break;
      case 'monthly':
        interval = '1 month';
        break;
      case 'quarterly':
        interval = '3 months';
        break;
      default:
        interval = '1 month';
    }

    // Get distinct dates from factor scores table (which has data)
    const dates = this.db.prepare(`
      SELECT DISTINCT score_date
      FROM stock_factor_scores
      WHERE score_date >= ? AND score_date <= ?
      ORDER BY score_date
    `).all(startDate, endDate).map(d => d.score_date);

    // Filter based on frequency
    if (frequency === 'monthly') {
      const seen = new Set();
      return dates.filter(d => {
        const month = d.substring(0, 7);
        if (seen.has(month)) return false;
        seen.add(month);
        return true;
      });
    } else if (frequency === 'quarterly') {
      const seen = new Set();
      return dates.filter(d => {
        const quarter = d.substring(0, 4) + '-Q' + Math.ceil(parseInt(d.substring(5, 7)) / 3);
        if (seen.has(quarter)) return false;
        seen.add(quarter);
        return true;
      });
    }

    return dates;
  }
}

module.exports = CustomFactorCalculator;
