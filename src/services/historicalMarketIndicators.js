/**
 * Historical Market Indicators Service
 *
 * Generates quarterly historical time series for market valuation indicators:
 * - Buffett Indicator (Market Cap / GDP)
 * - Tobin's Q (Market Value / Book Value)
 * - Median P/E Ratio
 * - Median EV/Book (MSI - Misean Stationarity Index)
 * - % Undervalued Stocks
 *
 * Methodology:
 * - Uses robust statistical aggregation with outlier removal
 * - Applies Winsorization at configurable percentiles
 * - Requires minimum sample sizes for statistical validity
 * - Market-cap weighted where appropriate
 * - Quarterly aggregation aligned to calendar quarters
 */

const db = require('../database');

// Statistical configuration
const CONFIG = {
  // Minimum sample sizes for statistical validity
  MIN_SAMPLE_SIZE: 50,           // Minimum stocks for valid aggregate
  MIN_SAMPLE_FOR_MEDIAN: 30,     // Minimum for median calculations

  // Winsorization percentiles (trim extreme values)
  WINSORIZE_LOW: 2.5,            // 2.5th percentile
  WINSORIZE_HIGH: 97.5,          // 97.5th percentile

  // Valid ranges for each metric (values outside are excluded)
  VALID_RANGES: {
    pe_ratio: { min: 0, max: 500 },
    pb_ratio: { min: 0, max: 100 },
    tobins_q: { min: 0, max: 100 },
    msi: { min: 0, max: 100 },
    fcf_yield: { min: -2, max: 2 },
    ev_ebitda: { min: 0, max: 200 },
  },

  // IQR multiplier for outlier detection
  IQR_MULTIPLIER: 1.5,
};

class HistoricalMarketIndicatorsService {
  constructor() {
    this.db = db.getDatabase();
  }

  /**
   * Calculate percentile value from sorted array
   */
  percentile(sortedArr, p) {
    if (sortedArr.length === 0) return null;
    const index = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedArr[lower];
    return sortedArr[lower] + (index - lower) * (sortedArr[upper] - sortedArr[lower]);
  }

  /**
   * Calculate median from array
   */
  median(arr) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return this.percentile(sorted, 50);
  }

  /**
   * Calculate interquartile range
   */
  iqr(sortedArr) {
    const q1 = this.percentile(sortedArr, 25);
    const q3 = this.percentile(sortedArr, 75);
    return { q1, q3, iqr: q3 - q1 };
  }

  /**
   * Remove outliers using IQR method
   */
  removeOutliersIQR(arr, multiplier = CONFIG.IQR_MULTIPLIER) {
    if (arr.length < 4) return arr;
    const sorted = [...arr].sort((a, b) => a - b);
    const { q1, q3, iqr } = this.iqr(sorted);
    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;
    return arr.filter(v => v >= lowerBound && v <= upperBound);
  }

  /**
   * Winsorize array at given percentiles
   */
  winsorize(arr, lowPct = CONFIG.WINSORIZE_LOW, highPct = CONFIG.WINSORIZE_HIGH) {
    if (arr.length < 4) return arr;
    const sorted = [...arr].sort((a, b) => a - b);
    const lowVal = this.percentile(sorted, lowPct);
    const highVal = this.percentile(sorted, highPct);
    return arr.map(v => Math.max(lowVal, Math.min(highVal, v)));
  }

  /**
   * Get calendar quarter string from date
   */
  getQuarter(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  /**
   * Get quarter end date
   */
  getQuarterEndDate(quarterStr) {
    const [year, q] = quarterStr.split('-Q');
    const quarterNum = parseInt(q);
    const month = quarterNum * 3;
    const date = new Date(parseInt(year), month, 0); // Last day of quarter
    return date.toISOString().split('T')[0];
  }

  /**
   * Get all available quarters from data
   */
  getAvailableQuarters() {
    const result = this.db.prepare(`
      SELECT DISTINCT
        strftime('%Y', fiscal_period) || '-Q' || ((CAST(strftime('%m', fiscal_period) AS INTEGER) + 2) / 3) as quarter
      FROM calculated_metrics
      WHERE period_type = 'annual'
      ORDER BY quarter ASC
    `).all();

    return result.map(r => r.quarter);
  }

  /**
   * Get metrics for a specific quarter with robust aggregation
   * Uses data reported in that quarter (fiscal_period falls within quarter)
   */
  getQuarterMetrics(quarter) {
    const [year, q] = quarter.split('-Q');
    const quarterNum = parseInt(q);

    // Calculate quarter date range
    const startMonth = (quarterNum - 1) * 3 + 1;
    const endMonth = quarterNum * 3;
    const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-31`;

    // Get all metrics for companies with fiscal periods in this quarter
    const data = this.db.prepare(`
      SELECT
        cm.company_id,
        c.symbol,
        c.market_cap,
        c.sector,
        cm.pe_ratio,
        cm.pb_ratio,
        cm.tobins_q,
        cm.msi,
        cm.fcf_yield,
        cm.ev_ebitda,
        cm.fiscal_period
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE cm.period_type = 'annual'
        AND cm.fiscal_period >= ?
        AND cm.fiscal_period <= ?
        AND c.is_active = 1
        AND c.market_cap > 0
    `).all(startDate, endDate);

    return this.aggregateMetrics(data, quarter);
  }

  /**
   * Get metrics using most recent annual data available as of quarter end
   * This is more comprehensive as it includes all companies with any annual data
   */
  getQuarterMetricsAsOf(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // Get most recent annual metrics for each company as of quarter end
    const data = this.db.prepare(`
      WITH latest_metrics AS (
        SELECT
          cm.*,
          c.symbol,
          c.market_cap,
          c.sector,
          ROW_NUMBER() OVER (PARTITION BY cm.company_id ORDER BY cm.fiscal_period DESC) as rn
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        WHERE cm.period_type = 'annual'
          AND cm.fiscal_period <= ?
          AND c.is_active = 1
          AND c.market_cap > 0
      )
      SELECT
        company_id,
        symbol,
        market_cap,
        sector,
        pe_ratio,
        pb_ratio,
        tobins_q,
        msi,
        fcf_yield,
        ev_ebitda,
        fiscal_period
      FROM latest_metrics
      WHERE rn = 1
    `).all(quarterEndDate);

    return this.aggregateMetrics(data, quarter);
  }

  /**
   * Aggregate metrics with robust statistical methods
   */
  aggregateMetrics(data, quarter) {
    const result = {
      quarter,
      date: this.getQuarterEndDate(quarter),
      sampleSize: data.length,
      metrics: {},
      dataQuality: {},
    };

    if (data.length < CONFIG.MIN_SAMPLE_SIZE) {
      result.valid = false;
      result.reason = `Sample size ${data.length} below minimum ${CONFIG.MIN_SAMPLE_SIZE}`;
      return result;
    }

    // Extract and clean each metric
    const metrics = ['pe_ratio', 'pb_ratio', 'tobins_q', 'msi', 'fcf_yield', 'ev_ebitda'];

    for (const metric of metrics) {
      const range = CONFIG.VALID_RANGES[metric];

      // Extract valid values
      let values = data
        .map(d => d[metric])
        .filter(v => v !== null && !isNaN(v) && v >= range.min && v <= range.max);

      const originalCount = values.length;

      if (values.length < CONFIG.MIN_SAMPLE_FOR_MEDIAN) {
        result.metrics[metric] = null;
        result.dataQuality[metric] = {
          valid: false,
          count: originalCount,
          reason: `Insufficient data (${originalCount} < ${CONFIG.MIN_SAMPLE_FOR_MEDIAN})`,
        };
        continue;
      }

      // Remove outliers using IQR method
      values = this.removeOutliersIQR(values);
      const afterOutlierRemoval = values.length;

      // Winsorize remaining values
      values = this.winsorize(values);

      // Calculate statistics
      const sorted = [...values].sort((a, b) => a - b);
      const stats = {
        median: this.percentile(sorted, 50),
        p25: this.percentile(sorted, 25),
        p75: this.percentile(sorted, 75),
        p10: this.percentile(sorted, 10),
        p90: this.percentile(sorted, 90),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
      };

      result.metrics[metric] = stats.median;
      result.dataQuality[metric] = {
        valid: true,
        originalCount,
        afterOutlierRemoval,
        finalCount: values.length,
        outliersRemoved: originalCount - afterOutlierRemoval,
        p25: stats.p25,
        p75: stats.p75,
        mean: stats.mean,
      };
    }

    // Calculate market-cap weighted Tobin's Q
    const tobinData = data.filter(d =>
      d.tobins_q !== null &&
      d.tobins_q > CONFIG.VALID_RANGES.tobins_q.min &&
      d.tobins_q < CONFIG.VALID_RANGES.tobins_q.max &&
      d.market_cap > 0
    );

    if (tobinData.length >= CONFIG.MIN_SAMPLE_FOR_MEDIAN) {
      // Remove outliers from Tobin's Q values
      const tobinValues = tobinData.map(d => d.tobins_q);
      const cleanTobinValues = this.removeOutliersIQR(tobinValues);
      const tobinSet = new Set(cleanTobinValues);

      const cleanTobinData = tobinData.filter(d => tobinSet.has(d.tobins_q));
      const totalMarketCap = cleanTobinData.reduce((sum, d) => sum + d.market_cap, 0);
      const weightedTobinQ = cleanTobinData.reduce((sum, d) =>
        sum + (d.tobins_q * d.market_cap / totalMarketCap), 0
      );

      result.metrics.tobins_q_weighted = weightedTobinQ;
      result.dataQuality.tobins_q_weighted = {
        valid: true,
        count: cleanTobinData.length,
        totalMarketCap: totalMarketCap / 1e12, // In trillions
      };
    }

    // Calculate % undervalued (P/E < 16)
    const peData = data.filter(d =>
      d.pe_ratio !== null &&
      d.pe_ratio > 0 &&
      d.pe_ratio < CONFIG.VALID_RANGES.pe_ratio.max
    );

    if (peData.length >= CONFIG.MIN_SAMPLE_FOR_MEDIAN) {
      const undervalued = peData.filter(d => d.pe_ratio < 16).length;
      result.metrics.pct_undervalued = (undervalued / peData.length) * 100;
      result.dataQuality.pct_undervalued = {
        valid: true,
        undervaluedCount: undervalued,
        totalCount: peData.length,
      };
    }

    // Calculate total market cap (for Buffett Indicator)
    const totalMarketCap = data.reduce((sum, d) => sum + (d.market_cap || 0), 0);
    result.metrics.total_market_cap = totalMarketCap;
    result.metrics.total_market_cap_billions = totalMarketCap / 1e9;

    result.valid = true;
    return result;
  }

  /**
   * Get GDP for a quarter from FRED data
   */
  getGDPForQuarter(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // Get most recent GDP observation as of quarter end
    const gdp = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'GDP'
        AND observation_date <= ?
      ORDER BY observation_date DESC
      LIMIT 1
    `).get(quarterEndDate);

    return gdp?.value || null;
  }

  /**
   * Get World Bank Buffett Indicator for a quarter (if available)
   * Series: DDDM01USA156NWDB - Stock Market Capitalization to GDP for United States
   */
  getWorldBankBuffettForQuarter(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    const buffett = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'DDDM01USA156NWDB'
        AND observation_date <= ?
      ORDER BY observation_date DESC
      LIMIT 1
    `).get(quarterEndDate);

    return buffett;
  }

  /**
   * Calculate Buffett Indicator for a quarter
   * Uses World Bank data if available, otherwise calculates from tracked stocks
   */
  calculateBuffettIndicator(marketMetrics, quarter) {
    // Try World Bank data first (most accurate, but only through 2020)
    const worldBankData = this.getWorldBankBuffettForQuarter(quarter);

    // Use World Bank data if it's from within the same year as the quarter
    const quarterYear = parseInt(quarter.split('-Q')[0]);
    if (worldBankData) {
      const dataYear = parseInt(worldBankData.observation_date.split('-')[0]);
      // Only use if data is from same year or one year prior (annual data lag)
      if (dataYear >= quarterYear - 1 && dataYear <= quarterYear) {
        return {
          value: worldBankData.value,
          source: 'world_bank',
          dataDate: worldBankData.observation_date,
        };
      }
    }

    // Fall back to calculating from GDP and our tracked market cap
    const gdp = this.getGDPForQuarter(quarter);

    if (!gdp) {
      return { value: null, reason: 'No GDP data available' };
    }

    // Calculate from our tracked market cap
    if (marketMetrics?.metrics?.total_market_cap_billions) {
      // We track ~4000+ stocks which covers most of the US market
      // Total US market is ~$70T, our tracked set is ~$67T (95%+)
      // Use 1.05x multiplier to account for small/micro caps not tracked
      const scalingFactor = 1.05;
      const estimatedTotalMarket = marketMetrics.metrics.total_market_cap_billions * scalingFactor;
      const ratio = (estimatedTotalMarket / gdp) * 100;
      return {
        value: ratio,
        source: 'tracked_stocks',
        rawMarketCap: marketMetrics.metrics.total_market_cap_billions,
        estimatedMarketCap: estimatedTotalMarket,
        gdp: gdp,
        scalingFactor: scalingFactor,
      };
    }

    return { value: null, reason: 'No market cap data available' };
  }

  /**
   * Get current quarter string
   */
  getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  /**
   * Calculate current real-time Buffett Indicator using latest market caps
   * This is separate from historical since it uses live company data
   */
  getCurrentBuffettIndicator() {
    // Get total market cap from companies table (live data)
    const marketCapResult = this.db.prepare(`
      SELECT
        SUM(market_cap) / 1e9 as total_market_cap_billions,
        COUNT(*) as stock_count
      FROM companies
      WHERE market_cap > 0 AND is_active = 1
    `).get();

    // Get latest GDP
    const gdpResult = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'GDP'
      ORDER BY observation_date DESC
      LIMIT 1
    `).get();

    if (!marketCapResult?.total_market_cap_billions || !gdpResult?.value) {
      return { value: null, reason: 'Missing market cap or GDP data' };
    }

    // Apply small scaling factor for stocks not tracked
    const scalingFactor = 1.05;
    const estimatedMarketCap = marketCapResult.total_market_cap_billions * scalingFactor;
    const ratio = (estimatedMarketCap / gdpResult.value) * 100;

    return {
      value: ratio,
      source: 'current_market_caps',
      rawMarketCap: marketCapResult.total_market_cap_billions,
      estimatedMarketCap: estimatedMarketCap,
      gdp: gdpResult.value,
      gdpDate: gdpResult.observation_date,
      stockCount: marketCapResult.stock_count,
      scalingFactor: scalingFactor,
      quarter: this.getCurrentQuarter(),
      date: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Generate full historical time series for all indicators
   */
  generateHistoricalTimeSeries(options = {}) {
    const {
      startQuarter = '2010-Q1',
      endQuarter = null,
      useAsOfMethod = true, // Use "as of" method for more complete data
    } = options;

    const allQuarters = this.getAvailableQuarters();
    const quarters = allQuarters.filter(q => {
      if (q < startQuarter) return false;
      if (endQuarter && q > endQuarter) return false;
      return true;
    });

    console.log(`Generating historical data for ${quarters.length} quarters...`);

    const timeSeries = {
      generated: new Date().toISOString(),
      methodology: {
        outlierRemoval: 'IQR method with 1.5x multiplier',
        winsorization: `${CONFIG.WINSORIZE_LOW}th to ${CONFIG.WINSORIZE_HIGH}th percentile`,
        minimumSampleSize: CONFIG.MIN_SAMPLE_SIZE,
        minimumForMedian: CONFIG.MIN_SAMPLE_FOR_MEDIAN,
      },
      quarters: [],
      series: {
        buffettIndicator: [],
        tobinsQ: [],
        tobinsQWeighted: [],
        medianPE: [],
        medianPB: [],
        medianMSI: [],
        pctUndervalued: [],
        medianFCFYield: [],
      },
    };

    for (const quarter of quarters) {
      const metrics = useAsOfMethod
        ? this.getQuarterMetricsAsOf(quarter)
        : this.getQuarterMetrics(quarter);

      if (!metrics.valid) {
        console.log(`  ${quarter}: Invalid - ${metrics.reason}`);
        continue;
      }

      const buffett = this.calculateBuffettIndicator(metrics, quarter);

      // Add to time series
      const date = metrics.date;
      timeSeries.quarters.push(quarter);

      // Buffett Indicator
      if (buffett.value !== null) {
        timeSeries.series.buffettIndicator.push({
          quarter,
          date,
          value: Math.round(buffett.value * 100) / 100,
          source: buffett.source,
        });
      }

      // Tobin's Q (median)
      if (metrics.metrics.tobins_q !== null) {
        timeSeries.series.tobinsQ.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.tobins_q * 1000) / 1000,
          sampleSize: metrics.dataQuality.tobins_q?.finalCount,
        });
      }

      // Tobin's Q (market-cap weighted)
      if (metrics.metrics.tobins_q_weighted !== null) {
        timeSeries.series.tobinsQWeighted.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.tobins_q_weighted * 1000) / 1000,
          sampleSize: metrics.dataQuality.tobins_q_weighted?.count,
        });
      }

      // Median P/E
      if (metrics.metrics.pe_ratio !== null) {
        timeSeries.series.medianPE.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.pe_ratio * 100) / 100,
          sampleSize: metrics.dataQuality.pe_ratio?.finalCount,
        });
      }

      // Median P/B
      if (metrics.metrics.pb_ratio !== null) {
        timeSeries.series.medianPB.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.pb_ratio * 100) / 100,
          sampleSize: metrics.dataQuality.pb_ratio?.finalCount,
        });
      }

      // Median MSI (EV/Book)
      if (metrics.metrics.msi !== null) {
        timeSeries.series.medianMSI.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.msi * 1000) / 1000,
          sampleSize: metrics.dataQuality.msi?.finalCount,
        });
      }

      // % Undervalued
      if (metrics.metrics.pct_undervalued !== null) {
        timeSeries.series.pctUndervalued.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.pct_undervalued * 100) / 100,
          undervaluedCount: metrics.dataQuality.pct_undervalued?.undervaluedCount,
          totalCount: metrics.dataQuality.pct_undervalued?.totalCount,
        });
      }

      // Median FCF Yield
      if (metrics.metrics.fcf_yield !== null) {
        timeSeries.series.medianFCFYield.push({
          quarter,
          date,
          value: Math.round(metrics.metrics.fcf_yield * 10000) / 100, // Convert to percentage
          sampleSize: metrics.dataQuality.fcf_yield?.finalCount,
        });
      }

      console.log(`  ${quarter}: ${metrics.sampleSize} companies, PE=${metrics.metrics.pe_ratio?.toFixed(1)}, Tobin Q=${metrics.metrics.tobins_q?.toFixed(2)}`);
    }

    // Add summary statistics
    timeSeries.summary = this.calculateSummaryStats(timeSeries.series);

    return timeSeries;
  }

  /**
   * Calculate summary statistics for each series
   */
  calculateSummaryStats(series) {
    const summary = {};

    for (const [name, data] of Object.entries(series)) {
      if (data.length === 0) continue;

      const values = data.map(d => d.value).filter(v => v !== null);
      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);

      summary[name] = {
        count: values.length,
        latest: data[data.length - 1],
        earliest: data[0],
        min: Math.min(...values),
        max: Math.max(...values),
        median: this.percentile(sorted, 50),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p10: this.percentile(sorted, 10),
        p90: this.percentile(sorted, 90),
      };
    }

    return summary;
  }

  /**
   * Get historical data formatted for charts
   * Returns array of {date, value} for each indicator
   */
  getChartData(indicator, options = {}) {
    const { startDate, limit } = options;

    const timeSeries = this.generateHistoricalTimeSeries({
      startQuarter: startDate ? this.getQuarter(startDate) : '2010-Q1',
    });

    const seriesMap = {
      buffett: 'buffettIndicator',
      tobinQ: 'tobinsQWeighted', // Use weighted for display
      medianPE: 'medianPE',
      medianMSI: 'medianMSI',
      pctUndervalued: 'pctUndervalued',
      medianPB: 'medianPB',
      medianFCFYield: 'medianFCFYield',
    };

    const seriesName = seriesMap[indicator];
    if (!seriesName || !timeSeries.series[seriesName]) {
      return [];
    }

    let data = timeSeries.series[seriesName].map(d => ({
      date: d.date,
      value: d.value,
    }));

    if (limit) {
      data = data.slice(-limit);
    }

    return data;
  }

  /**
   * Get current real-time valuation metrics using latest company data
   */
  getCurrentMetrics() {
    const buffett = this.getCurrentBuffettIndicator();
    const sp500PE = this.getSP500PE();
    const today = new Date().toISOString().split('T')[0];
    const currentQuarter = this.getCurrentQuarter();

    // Get current aggregate metrics from latest annual filings
    const latestMetrics = this.getQuarterMetricsAsOf(currentQuarter);

    return {
      quarter: currentQuarter,
      date: today,
      buffett: buffett.value ? Math.round(buffett.value * 100) / 100 : null,
      tobinQ: latestMetrics.metrics?.tobins_q_weighted
        ? Math.round(latestMetrics.metrics.tobins_q_weighted * 1000) / 1000
        : null,
      medianPE: latestMetrics.metrics?.pe_ratio
        ? Math.round(latestMetrics.metrics.pe_ratio * 100) / 100
        : null,
      sp500PE: sp500PE?.weightedPE || null,
      medianMSI: latestMetrics.metrics?.msi
        ? Math.round(latestMetrics.metrics.msi * 1000) / 1000
        : null,
      pctUndervalued: latestMetrics.metrics?.pct_undervalued
        ? Math.round(latestMetrics.metrics.pct_undervalued * 100) / 100
        : null,
      sampleSize: latestMetrics.sampleSize,
      sp500Count: sp500PE?.companyCount || null,
      buffettDetails: buffett,
    };
  }

  /**
   * Calculate S&P 500 market-cap weighted P/E ratio
   * Uses index_constituents table to get only S&P 500 members
   */
  getSP500PE() {
    const result = this.db.prepare(`
      WITH sp500_data AS (
        SELECT
          c.id,
          c.symbol,
          c.market_cap,
          cm.pe_ratio,
          cm.fiscal_period
        FROM index_constituents ic
        JOIN companies c ON ic.company_id = c.id
        JOIN (
          SELECT company_id, pe_ratio, fiscal_period,
                 ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
          FROM calculated_metrics
          WHERE period_type = 'annual'
            AND pe_ratio IS NOT NULL
            AND pe_ratio > 0
            AND pe_ratio < 200
        ) cm ON c.id = cm.company_id AND cm.rn = 1
        WHERE ic.index_id = 1
          AND ic.removed_at IS NULL
          AND c.market_cap IS NOT NULL
          AND c.market_cap > 0
      ),
      weights AS (
        SELECT
          *,
          market_cap / (SELECT SUM(market_cap) FROM sp500_data) as weight
        FROM sp500_data
      )
      SELECT
        SUM(pe_ratio * weight) as weighted_pe,
        AVG(pe_ratio) as simple_avg_pe,
        COUNT(*) as company_count,
        SUM(market_cap) as total_market_cap
      FROM weights
    `).get();

    if (!result || !result.weighted_pe) {
      return null;
    }

    return {
      weightedPE: Math.round(result.weighted_pe * 100) / 100,
      simpleAvgPE: Math.round(result.simple_avg_pe * 100) / 100,
      companyCount: result.company_count,
      totalMarketCap: result.total_market_cap,
      date: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Calculate S&P 500 P/E for a specific quarter
   * Uses fiscal period data available as of quarter end
   */
  getSP500PEForQuarter(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    const result = this.db.prepare(`
      WITH sp500_companies AS (
        -- Get S&P 500 constituents (index_id = 1)
        SELECT DISTINCT ic.company_id
        FROM index_constituents ic
        WHERE ic.index_id = 1
      ),
      latest_metrics AS (
        SELECT
          c.id,
          c.symbol,
          c.market_cap,
          cm.pe_ratio,
          cm.fiscal_period,
          ROW_NUMBER() OVER (PARTITION BY cm.company_id ORDER BY cm.fiscal_period DESC) as rn
        FROM sp500_companies sp
        JOIN companies c ON sp.company_id = c.id
        JOIN calculated_metrics cm ON c.id = cm.company_id
        WHERE cm.period_type = 'annual'
          AND cm.fiscal_period <= ?
          AND cm.pe_ratio IS NOT NULL
          AND cm.pe_ratio > 0
          AND cm.pe_ratio < 200
          AND c.market_cap IS NOT NULL
          AND c.market_cap > 0
      ),
      filtered AS (
        SELECT * FROM latest_metrics WHERE rn = 1
      ),
      weights AS (
        SELECT
          *,
          market_cap / (SELECT SUM(market_cap) FROM filtered) as weight
        FROM filtered
      )
      SELECT
        SUM(pe_ratio * weight) as weighted_pe,
        COUNT(*) as company_count,
        SUM(market_cap) as total_market_cap
      FROM weights
    `).get(quarterEndDate);

    if (!result || !result.weighted_pe || result.company_count < 100) {
      return null;
    }

    return {
      value: Math.round(result.weighted_pe * 100) / 100,
      companyCount: result.company_count,
      totalMarketCap: result.total_market_cap,
    };
  }

  /**
   * Generate S&P 500 P/E historical time series
   */
  getSP500PEHistory(options = {}) {
    const { startQuarter = '2015-Q1' } = options;

    const allQuarters = this.getAvailableQuarters();
    const quarters = allQuarters.filter(q => q >= startQuarter);

    const series = [];
    for (const quarter of quarters) {
      const peData = this.getSP500PEForQuarter(quarter);
      if (peData && peData.value) {
        series.push({
          quarter,
          date: this.getQuarterEndDate(quarter),
          value: peData.value,
          companyCount: peData.companyCount,
        });
      }
    }

    // Add current quarter if different from last historical
    const currentPE = this.getSP500PE();
    if (currentPE && series.length > 0) {
      const lastDate = series[series.length - 1].date;
      if (lastDate !== currentPE.date) {
        series.push({
          quarter: this.getCurrentQuarter(),
          date: currentPE.date,
          value: currentPE.weightedPE,
          companyCount: currentPE.companyCount,
        });
      }
    }

    return series;
  }

  /**
   * Get all indicators' historical data in one call
   * Optimized for frontend consumption
   * Includes current real-time data point
   */
  getAllHistoricalData(options = {}) {
    const { startQuarter = '2015-Q1', includeCurrentQuarter = true } = options;

    const timeSeries = this.generateHistoricalTimeSeries({
      startQuarter,
    });

    // Get current real-time metrics to add as latest data point
    const current = includeCurrentQuarter ? this.getCurrentMetrics() : null;

    // Get S&P 500 P/E history
    const sp500PEHistory = this.getSP500PEHistory({ startQuarter });

    // Format for frontend
    const data = {
      buffett: timeSeries.series.buffettIndicator.map(d => ({
        date: d.date,
        value: d.value,
      })),
      tobinQ: timeSeries.series.tobinsQWeighted.map(d => ({
        date: d.date,
        value: d.value,
      })),
      medianPE: timeSeries.series.medianPE.map(d => ({
        date: d.date,
        value: d.value,
      })),
      sp500PE: sp500PEHistory.map(d => ({
        date: d.date,
        value: d.value,
      })),
      medianMSI: timeSeries.series.medianMSI.map(d => ({
        date: d.date,
        value: d.value,
      })),
      pctUndervalued: timeSeries.series.pctUndervalued.map(d => ({
        date: d.date,
        value: d.value,
      })),
    };

    // Add current data point if available and different from last historical point
    if (current) {
      const addCurrentPoint = (series, value) => {
        if (value !== null && series.length > 0) {
          const lastDate = series[series.length - 1].date;
          if (lastDate !== current.date) {
            series.push({ date: current.date, value });
          }
        }
      };

      addCurrentPoint(data.buffett, current.buffett);
      addCurrentPoint(data.tobinQ, current.tobinQ);
      addCurrentPoint(data.medianPE, current.medianPE);
      addCurrentPoint(data.medianMSI, current.medianMSI);
      addCurrentPoint(data.pctUndervalued, current.pctUndervalued);
    }

    return {
      generated: timeSeries.generated,
      methodology: timeSeries.methodology,
      data,
      summary: timeSeries.summary,
      current,
    };
  }
}

module.exports = { HistoricalMarketIndicatorsService, CONFIG };
