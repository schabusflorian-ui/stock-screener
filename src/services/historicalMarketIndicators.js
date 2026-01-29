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
   * Calculate historical total market cap for a given date
   * Uses adjusted_close (split-adjusted) prices × current shares for accurate historical market cap
   * Includes sanity filters to exclude obviously bad data
   */
  getHistoricalMarketCap(targetDate) {
    // First, find the closest trading day on or before the target date
    // (Quarter-end dates often fall on weekends when markets are closed)
    const closestDate = this.db.prepare(`
      SELECT MAX(date) as closest_date
      FROM daily_prices
      WHERE date <= ?
    `).get(targetDate);

    const actualDate = closestDate?.closest_date || targetDate;

    // Use adjusted_close (split-adjusted) × current shares = historical market cap
    // This works because adjusted prices account for splits, matching current share counts
    // Filter criteria:
    // - Exclude non-US stocks (suffixes indicate foreign exchanges)
    // - Exclude ETFs (can cause double-counting)
    // - Filter out garbage data (impossible prices, shares outstanding, or market caps)
    const result = this.db.prepare(`
      SELECT
        SUM(dp.adjusted_close * pm.shares_outstanding) as total_market_cap,
        COUNT(DISTINCT dp.company_id) as company_count
      FROM daily_prices dp
      JOIN price_metrics pm ON dp.company_id = pm.company_id
      JOIN companies c ON dp.company_id = c.id
      WHERE dp.date = ?
        AND pm.shares_outstanding > 0
        AND pm.shares_outstanding < 50e9  -- No company has 50B+ shares
        AND c.is_active = 1
        AND dp.adjusted_close IS NOT NULL
        AND dp.adjusted_close > 0
        AND dp.adjusted_close < 10000  -- Sanity filter: max $10K per share
        AND (dp.adjusted_close * pm.shares_outstanding) < 4e12  -- Max market cap $4T per company
        -- Exclude stocks where calculated market cap is unreasonably high compared to current
        -- This catches garbage data where historical prices are corrupted
        AND (c.market_cap > 1e9 OR (dp.adjusted_close * pm.shares_outstanding) < 100e9)
        AND c.sector != 'ETF'  -- Exclude ETFs (cause double-counting)
        AND c.symbol NOT LIKE '%.L'   -- Exclude London Stock Exchange
        AND c.symbol NOT LIKE '%.DE'  -- Exclude Germany (Frankfurt)
        AND c.symbol NOT LIKE '%.PA'  -- Exclude Paris (Euronext)
        AND c.symbol NOT LIKE '%.TO'  -- Exclude Toronto
        AND c.symbol NOT LIKE '%.AX'  -- Exclude Australia
        AND c.symbol NOT LIKE '%.JO'  -- Exclude Johannesburg
        AND c.symbol NOT LIKE '%.HK'  -- Exclude Hong Kong
        AND c.symbol NOT LIKE '%.SS'  -- Exclude Shanghai
        AND c.symbol NOT LIKE '%.SZ'  -- Exclude Shenzhen
        AND c.symbol NOT LIKE '%.T'   -- Exclude Tokyo
        AND c.symbol NOT LIKE '%-%'   -- Exclude preferred shares and warrants
    `).get(actualDate);

    if (!result || !result.total_market_cap) {
      return null;
    }

    return {
      totalMarketCap: result.total_market_cap,
      totalMarketCapBillions: result.total_market_cap / 1e9,
      companyCount: result.company_count,
      date: actualDate,
      requestedDate: targetDate
    };
  }

  /**
   * Calculate S&P 500 total market cap for a specific date
   * Similar to getHistoricalMarketCap but filtered to only S&P 500 constituents
   * Used for S&P 500 / GDP ratio comparison with Buffett Indicator
   */
  getSP500HistoricalMarketCap(targetDate) {
    // First, find the closest trading day on or before the target date
    const closestDate = this.db.prepare(`
      SELECT MAX(date) as closest_date
      FROM daily_prices
      WHERE date <= ?
    `).get(targetDate);

    const actualDate = closestDate?.closest_date || targetDate;

    const result = this.db.prepare(`
      SELECT
        SUM(dp.adjusted_close * pm.shares_outstanding) as total_market_cap,
        COUNT(DISTINCT dp.company_id) as company_count
      FROM daily_prices dp
      JOIN price_metrics pm ON dp.company_id = pm.company_id
      JOIN companies c ON dp.company_id = c.id
      WHERE dp.date = ?
        AND c.is_sp500 = 1  -- Only S&P 500 companies
        AND pm.shares_outstanding > 0
        AND pm.shares_outstanding < 50e9  -- Sanity check: no 50B+ shares
        AND c.is_active = 1
        AND dp.adjusted_close IS NOT NULL
        AND dp.adjusted_close > 0
        AND dp.adjusted_close < 10000  -- Sanity filter: max $10K per share
        AND (dp.adjusted_close * pm.shares_outstanding) < 4e12  -- Max $4T per company
        -- Exclude garbage data: small companies with huge calculated market cap
        AND (c.market_cap > 1e9 OR (dp.adjusted_close * pm.shares_outstanding) < 100e9)
    `).get(actualDate);

    if (!result || !result.total_market_cap) {
      return null;
    }

    return {
      totalMarketCap: result.total_market_cap,
      totalMarketCapBillions: result.total_market_cap / 1e9,
      companyCount: result.company_count,
      date: actualDate,
      requestedDate: targetDate
    };
  }

  /**
   * Calculate S&P 500 / GDP ratio for a specific quarter
   */
  calculateSP500ToGDP(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);
    const gdp = this.getGDPForQuarter(quarter);

    if (!gdp) {
      return { value: null, reason: 'No GDP data available' };
    }

    const sp500MarketCap = this.getSP500HistoricalMarketCap(quarterEndDate);

    if (sp500MarketCap?.totalMarketCapBillions) {
      const ratio = (sp500MarketCap.totalMarketCapBillions / gdp) * 100;
      return {
        value: ratio,
        source: 'historical_sp500_market_cap',
        rawMarketCap: sp500MarketCap.totalMarketCapBillions,
        gdp: gdp,
        companyCount: sp500MarketCap.companyCount,
      };
    }

    return { value: null, reason: 'No S&P 500 market cap data available' };
  }

  /**
   * Get comparison data for Buffett Indicator vs S&P 500 / GDP
   * Returns historical time series for both metrics
   */
  getBuffettComparison(options = {}) {
    const {
      startQuarter = '2015-Q1',
      endQuarter = null,
    } = options;

    const allQuarters = this.getAvailableQuarters();
    const currentQuarter = this.getCurrentQuarter();
    const quarters = allQuarters.filter(q => {
      if (q < startQuarter) return false;
      if (endQuarter && q > endQuarter) return false;
      if (q > currentQuarter) return false;
      return true;
    });

    const totalMarketGDP = [];
    const sp500GDP = [];

    for (const quarter of quarters) {
      // Get Buffett Indicator (total market / GDP)
      const buffett = this.calculateBuffettIndicator(quarter);
      if (buffett?.value) {
        totalMarketGDP.push({
          quarter,
          value: buffett.value,
          companyCount: buffett.companyCount,
        });
      }

      // Get S&P 500 / GDP
      const sp500 = this.calculateSP500ToGDP(quarter);
      if (sp500?.value) {
        sp500GDP.push({
          quarter,
          value: sp500.value,
          companyCount: sp500.companyCount,
        });
      }
    }

    // Get current values
    const currentBuffett = this.getCurrentBuffettIndicator();
    const currentSP500 = this.getCurrentSP500ToGDP();

    return {
      generated: new Date().toISOString(),
      totalMarketGDP,
      sp500GDP,
      currentValues: {
        buffett: currentBuffett?.value || null,
        sp500: currentSP500?.value || null,
        largecapShare: currentBuffett?.value && currentSP500?.value
          ? (currentSP500.value / currentBuffett.value * 100).toFixed(1)
          : null,
      },
      metadata: {
        startQuarter,
        endQuarter: quarters[quarters.length - 1],
        quartersCount: quarters.length,
      },
    };
  }

  /**
   * Calculate current real-time S&P 500 / GDP ratio
   */
  getCurrentSP500ToGDP() {
    // Get S&P 500 market cap from companies table (live data)
    const marketCapResult = this.db.prepare(`
      SELECT
        SUM(market_cap) / 1e9 as total_market_cap_billions,
        COUNT(*) as stock_count
      FROM companies
      WHERE market_cap > 0
        AND is_active = 1
        AND is_sp500 = 1
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
      return { value: null, reason: 'Missing S&P 500 market cap or GDP data' };
    }

    const ratio = (marketCapResult.total_market_cap_billions / gdpResult.value) * 100;

    return {
      value: ratio,
      source: 'current_sp500_market_caps',
      rawMarketCap: marketCapResult.total_market_cap_billions,
      gdp: gdpResult.value,
      gdpDate: gdpResult.observation_date,
      stockCount: marketCapResult.stock_count,
      quarter: this.getCurrentQuarter(),
      date: new Date().toISOString().split('T')[0],
    };
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
   * Get metrics using most recent quarterly data available as of quarter end
   * Using quarterly data provides:
   * - More consistent sample sizes across periods
   * - Reduced seasonal bias from fiscal year-end differences
   * - More frequent and recent data for each company
   */
  getQuarterMetricsAsOf(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // Get most recent ANNUAL metrics for each company as of quarter end
    // Using annual data (instead of quarterly) provides:
    // - More stable valuations (avoids quarterly reporting lag issues)
    // - Consistent sample sizes across all quarters
    // - Eliminates Q1 spike caused by stale Q3 data (6-month lag)
    // Note: We use current market_cap for weighting; historical market cap is
    // calculated separately in getHistoricalMarketCap() for Buffett Indicator
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
   * Get FRED Wilshire 5000 value for a quarter end date
   * The Wilshire 5000 represents total US market capitalization (in billions)
   * Note: Series discontinued June 3, 2024 - only available for historical dates
   */
  getWilshire5000ForQuarter(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // FRED discontinued Wilshire 5000 on June 3, 2024
    // Only use for dates before this cutoff
    if (quarterEndDate > '2024-06-03') {
      return null;
    }

    const result = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'WILL5000IND'
        AND observation_date <= ?
      ORDER BY observation_date DESC
      LIMIT 1
    `).get(quarterEndDate);

    if (!result) {
      return null;
    }

    // Wilshire 5000 index value needs to be converted to market cap in billions
    // The index is designed so that each point = $1 billion in market cap
    // (e.g., index of 45000 = $45 trillion market cap)
    return {
      value: result.value, // Already in billions
      date: result.observation_date,
    };
  }

  /**
   * Get MSI (Misean Stationarity Index) from FRED
   * Series: NCBCEPNW - Nonfinancial Corporate Business: Corporate Equities as % of Net Worth
   *
   * This is the official Fed calculation of MSI:
   * - MSI = Corporate Equities / Net Worth
   * - Equilibrium value is 100% (ratio = 1.0)
   * - Typical range: 50-250% (ratio 0.5-2.5)
   *
   * FRED stores as percentage, we convert to ratio for consistency
   */
  getMSIFromFRED(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // NCBCEPNW is quarterly, find the closest value on or before quarter end
    const result = this.db.prepare(`
      SELECT value, observation_date
      FROM economic_indicators
      WHERE series_id = 'NCBCEPNW'
        AND observation_date <= ?
      ORDER BY observation_date DESC
      LIMIT 1
    `).get(quarterEndDate);

    if (!result || result.value === null) {
      return null;
    }

    // Convert from percentage to ratio (e.g., 215.6% -> 2.156)
    return {
      value: result.value / 100,
      percentage: result.value,
      date: result.observation_date,
      source: 'fred_ncbcepnw',
    };
  }

  /**
   * Calculate Buffett Indicator for a quarter
   *
   * Data source priority:
   * 1. World Bank data (DDDM01USA156NWDB) - official Market Cap / GDP ratio (up to 2020)
   * 2. Historical market cap from daily_prices (if coverage sufficient)
   * 3. Current market cap fallback (for recent quarters only)
   */
  calculateBuffettIndicator(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);
    const scalingFactor = 1.029; // Calibration factor to align calculated market cap with benchmarks

    // Get GDP for the quarter
    const gdp = this.getGDPForQuarter(quarter);
    if (!gdp) {
      return { value: null, reason: 'No GDP data available' };
    }

    // PRIORITY 1: Try World Bank Buffett Indicator (official data up to 2020)
    // Series: DDDM01USA156NWDB - Stock Market Capitalization to GDP for United States
    // Only use if data is from the same year as the quarter (annual data)
    const worldBank = this.getWorldBankBuffettForQuarter(quarter);
    if (worldBank?.value) {
      const quarterYear = parseInt(quarter.split('-Q')[0]);
      const dataYear = parseInt(worldBank.observation_date.substring(0, 4));
      // Only use World Bank data if it's from the same year (annual data points)
      if (dataYear === quarterYear) {
        return {
          value: worldBank.value,
          source: 'world_bank',
          gdp: gdp,
          worldBankDate: worldBank.observation_date,
          note: 'Using World Bank Stock Market Capitalization to GDP (DDDM01USA156NWDB)',
        };
      }
    }

    // PRIORITY 2: Try historical market cap from daily_prices
    const historicalMarketCap = this.getHistoricalMarketCap(quarterEndDate);

    // Lower threshold for historical data - we'll scale up based on coverage
    // This allows us to use historical data even with partial coverage
    const MIN_COMPANY_COUNT = 500; // Lowered from 4000 to accept sparser historical data

    if (historicalMarketCap?.totalMarketCapBillions &&
        historicalMarketCap.companyCount >= MIN_COMPANY_COUNT) {
      // Scale based on coverage: if we have 2000 companies and estimate 4200 total,
      // scale by 4200/2000 = 2.1x, then apply the standard calibration
      const ESTIMATED_TOTAL_COMPANIES = 4200;
      const coverageRatio = ESTIMATED_TOTAL_COMPANIES / historicalMarketCap.companyCount;
      // Cap scaling to prevent extreme extrapolation
      const cappedCoverageRatio = Math.min(coverageRatio, 3.0);
      const estimatedTotalMarket = historicalMarketCap.totalMarketCapBillions * cappedCoverageRatio * scalingFactor;
      const ratio = (estimatedTotalMarket / gdp) * 100;
      return {
        value: ratio,
        source: 'historical_market_cap_scaled',
        rawMarketCap: historicalMarketCap.totalMarketCapBillions,
        estimatedMarketCap: estimatedTotalMarket,
        gdp: gdp,
        scalingFactor: scalingFactor,
        coverageRatio: cappedCoverageRatio,
        companyCount: historicalMarketCap.companyCount,
        note: `Scaled from ${historicalMarketCap.companyCount} companies (coverage ratio: ${cappedCoverageRatio.toFixed(2)}x)`,
      };
    }

    // PRIORITY 3: Fallback to current market cap
    // IMPORTANT: Only use this for very recent quarters (post June 2024) where we don't have
    // FRED data and historical price data is still being populated
    const currentResult = this.getCurrentBuffettIndicator();
    if (currentResult?.value) {
      // For quarters after June 2024 (when FRED data ended), use current as primary source
      const isPostFREDDiscontinuation = quarterEndDate > '2024-06-03';
      if (isPostFREDDiscontinuation) {
        return {
          value: currentResult.value,
          source: 'calculated_current',
          rawMarketCap: currentResult.rawMarketCap,
          estimatedMarketCap: currentResult.estimatedMarketCap,
          gdp: gdp,
          scalingFactor: scalingFactor,
          companyCount: currentResult.stockCount,
          note: 'Post-FRED discontinuation: using calculated market cap with calibration',
        };
      }

      // For historical quarters, using current data is problematic but may be necessary
      console.warn(`[Buffett ${quarter}] WARNING: Using current market cap for historical quarter - data quality poor`);
      return {
        value: currentResult.value,
        source: 'current_market_cap_fallback',
        rawMarketCap: currentResult.rawMarketCap,
        estimatedMarketCap: currentResult.estimatedMarketCap,
        gdp: gdp,
        scalingFactor: scalingFactor,
        companyCount: currentResult.stockCount,
        dataQuality: 'poor',
        note: `WARNING: Used current market cap for historical quarter ${quarter} - consider fetching FRED data`,
      };
    }

    return { value: null, reason: 'No market cap data available' };
  }

  /**
   * Calculate aggregate MSI (EV/Book) for a quarter using all stocks
   * Formula: (Total Market Cap + Total Debt - Total Cash) / Total Book Value
   * This is similar to FRED's MSI which uses aggregate totals instead of median
   */
  calculateAggregateMSI(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);
    const [year, q] = quarter.split('-Q');
    const quarterNum = parseInt(q);
    const fiscalPeriod = `Q${quarterNum}`;

    // Get historical market cap (already filters to US stocks)
    const marketCapData = this.getHistoricalMarketCap(quarterEndDate);
    if (!marketCapData?.totalMarketCap) {
      return { value: null, reason: 'No market cap data available' };
    }

    // Get aggregate balance sheet data from financial_data
    // Use the most recent quarterly filing for each company as of quarter end
    // FILTERS: US stocks only, $500M+ market cap, positive book value
    const balanceSheetData = this.db.prepare(`
      WITH latest_filings AS (
        SELECT
          fd.company_id,
          fd.shareholder_equity,
          fd.total_assets,
          fd.total_liabilities,
          COALESCE(fd.long_term_debt, 0) as long_term_debt,
          COALESCE(fd.short_term_debt, 0) as short_term_debt,
          COALESCE(fd.cash_and_equivalents, 0) as cash,
          fd.fiscal_year,
          fd.fiscal_period,
          ROW_NUMBER() OVER (
            PARTITION BY fd.company_id
            ORDER BY fd.fiscal_year DESC,
              CASE fd.fiscal_period
                WHEN 'Q4' THEN 4 WHEN 'Q3' THEN 3
                WHEN 'Q2' THEN 2 WHEN 'Q1' THEN 1 ELSE 0
              END DESC
          ) as rn
        FROM financial_data fd
        JOIN companies c ON fd.company_id = c.id
        WHERE fd.period_type = 'quarterly'
          AND c.is_active = 1
          AND fd.shareholder_equity > 0
          AND c.market_cap >= 500e6           -- $500M minimum market cap
          AND c.sector != 'ETF'               -- Exclude ETFs
          -- Exclude non-US stocks (foreign exchange suffixes)
          AND c.symbol NOT LIKE '%.L'         -- London
          AND c.symbol NOT LIKE '%.DE'        -- Germany
          AND c.symbol NOT LIKE '%.PA'        -- Paris
          AND c.symbol NOT LIKE '%.TO'        -- Toronto
          AND c.symbol NOT LIKE '%.AX'        -- Australia
          AND c.symbol NOT LIKE '%.HK'        -- Hong Kong
          AND c.symbol NOT LIKE '%.SS'        -- Shanghai
          AND c.symbol NOT LIKE '%.SZ'        -- Shenzhen
          AND c.symbol NOT LIKE '%.T'         -- Tokyo
          AND c.symbol NOT LIKE '%-%'         -- Preferred shares/warrants
          AND (fd.fiscal_year < ? OR (fd.fiscal_year = ? AND fd.fiscal_period <= ?))
      )
      SELECT
        SUM(shareholder_equity) as total_book_value,
        SUM(long_term_debt + short_term_debt) as total_debt,
        SUM(cash) as total_cash,
        COUNT(*) as company_count
      FROM latest_filings
      WHERE rn = 1
    `).get(parseInt(year), parseInt(year), fiscalPeriod);

    if (!balanceSheetData?.total_book_value || balanceSheetData.total_book_value <= 0) {
      return { value: null, reason: 'No balance sheet data available' };
    }

    // Calculate aggregate EV and MSI
    const totalMarketCap = marketCapData.totalMarketCap;
    const totalDebt = balanceSheetData.total_debt || 0;
    const totalCash = balanceSheetData.total_cash || 0;
    const totalBookValue = balanceSheetData.total_book_value;

    const enterpriseValue = totalMarketCap + totalDebt - totalCash;
    const msi = enterpriseValue / totalBookValue;

    return {
      value: msi,
      source: 'aggregate',
      totalMarketCap: totalMarketCap / 1e12, // in trillions
      totalDebt: totalDebt / 1e12,
      totalCash: totalCash / 1e12,
      totalBookValue: totalBookValue / 1e12,
      enterpriseValue: enterpriseValue / 1e12,
      companyCount: balanceSheetData.company_count,
      marketCapCompanyCount: marketCapData.companyCount,
      date: quarterEndDate,
    };
  }

  /**
   * Calculate current real-time aggregate MSI using latest data
   * FILTERS: US stocks only, $500M+ market cap
   */
  getCurrentAggregateMSI() {
    // Get total market cap from companies table (live data)
    // Filter to US stocks with $500M+ market cap
    const marketCapResult = this.db.prepare(`
      SELECT
        SUM(market_cap) as total_market_cap,
        COUNT(*) as stock_count
      FROM companies
      WHERE market_cap >= 500e6       -- $500M minimum
        AND is_active = 1
        AND sector != 'ETF'
        AND symbol NOT LIKE '%.L'
        AND symbol NOT LIKE '%.DE'
        AND symbol NOT LIKE '%.PA'
        AND symbol NOT LIKE '%.TO'
        AND symbol NOT LIKE '%.AX'
        AND symbol NOT LIKE '%.HK'
        AND symbol NOT LIKE '%.SS'
        AND symbol NOT LIKE '%.SZ'
        AND symbol NOT LIKE '%.T'
        AND symbol NOT LIKE '%-%'
    `).get();

    if (!marketCapResult?.total_market_cap) {
      return { value: null, reason: 'No market cap data' };
    }

    // Get aggregate balance sheet data from most recent filings
    // Same filters: US stocks only, $500M+ market cap
    const balanceSheetData = this.db.prepare(`
      WITH latest_filings AS (
        SELECT
          fd.company_id,
          fd.shareholder_equity,
          COALESCE(fd.long_term_debt, 0) as long_term_debt,
          COALESCE(fd.short_term_debt, 0) as short_term_debt,
          COALESCE(fd.cash_and_equivalents, 0) as cash,
          ROW_NUMBER() OVER (
            PARTITION BY fd.company_id
            ORDER BY fd.fiscal_year DESC,
              CASE fd.fiscal_period
                WHEN 'Q4' THEN 4 WHEN 'Q3' THEN 3
                WHEN 'Q2' THEN 2 WHEN 'Q1' THEN 1 ELSE 0
              END DESC
          ) as rn
        FROM financial_data fd
        JOIN companies c ON fd.company_id = c.id
        WHERE fd.period_type = 'quarterly'
          AND c.is_active = 1
          AND fd.shareholder_equity > 0
          AND c.market_cap >= 500e6       -- $500M minimum
          AND c.sector != 'ETF'
          AND c.symbol NOT LIKE '%.L'
          AND c.symbol NOT LIKE '%.DE'
          AND c.symbol NOT LIKE '%.PA'
          AND c.symbol NOT LIKE '%.TO'
          AND c.symbol NOT LIKE '%.AX'
          AND c.symbol NOT LIKE '%.HK'
          AND c.symbol NOT LIKE '%.SS'
          AND c.symbol NOT LIKE '%.SZ'
          AND c.symbol NOT LIKE '%.T'
          AND c.symbol NOT LIKE '%-%'
      )
      SELECT
        SUM(shareholder_equity) as total_book_value,
        SUM(long_term_debt + short_term_debt) as total_debt,
        SUM(cash) as total_cash,
        COUNT(*) as company_count
      FROM latest_filings
      WHERE rn = 1
    `).get();

    if (!balanceSheetData?.total_book_value || balanceSheetData.total_book_value <= 0) {
      return { value: null, reason: 'No balance sheet data' };
    }

    const totalMarketCap = marketCapResult.total_market_cap;
    const totalDebt = balanceSheetData.total_debt || 0;
    const totalCash = balanceSheetData.total_cash || 0;
    const totalBookValue = balanceSheetData.total_book_value;

    const enterpriseValue = totalMarketCap + totalDebt - totalCash;
    const msi = enterpriseValue / totalBookValue;

    return {
      value: msi,
      source: 'current',
      totalMarketCap: totalMarketCap / 1e12,
      totalDebt: totalDebt / 1e12,
      totalCash: totalCash / 1e12,
      totalBookValue: totalBookValue / 1e12,
      enterpriseValue: enterpriseValue / 1e12,
      companyCount: balanceSheetData.company_count,
      marketCapCompanyCount: marketCapResult.stock_count,
    };
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

    // Calibration factor 1.029 aligns our data with external benchmarks
    // (Wilshire 5000/GDP from longtermtrends.com, CurrentMarketValuation.com)
    const scalingFactor = 1.029;
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
    const currentQuarter = this.getCurrentQuarter();
    const quarters = allQuarters.filter(q => {
      if (q < startQuarter) return false;
      if (endQuarter && q > endQuarter) return false;
      // Filter out future quarters
      if (q > currentQuarter) return false;
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
        aggregateMSI: [],  // New: aggregate EV/Book (like FRED MSI methodology)
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

      const buffett = this.calculateBuffettIndicator(quarter);
      const aggregateMSI = this.calculateAggregateMSI(quarter);

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

      // Aggregate MSI (Total EV / Total Book Value) - like FRED methodology
      if (aggregateMSI.value !== null) {
        timeSeries.series.aggregateMSI.push({
          quarter,
          date,
          value: Math.round(aggregateMSI.value * 1000) / 1000,
          companyCount: aggregateMSI.companyCount,
          totalBookValue: aggregateMSI.totalBookValue,  // in trillions
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
    const aggregateMSI = this.getCurrentAggregateMSI();
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
      aggregateMSI: aggregateMSI.value
        ? Math.round(aggregateMSI.value * 1000) / 1000
        : null,
      pctUndervalued: latestMetrics.metrics?.pct_undervalued
        ? Math.round(latestMetrics.metrics.pct_undervalued * 100) / 100
        : null,
      sampleSize: latestMetrics.sampleSize,
      sp500Count: sp500PE?.companyCount || null,
      buffettDetails: buffett,
      aggregateMSIDetails: aggregateMSI,
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
      aggregated AS (
        SELECT
          SUM(market_cap) as total_market_cap,
          SUM(market_cap / pe_ratio) as total_earnings_proxy,
          AVG(pe_ratio) as simple_avg_pe,
          COUNT(*) as company_count
        FROM sp500_data
      )
      SELECT
        -- Harmonic weighted mean: Total Market Cap / Total Earnings
        -- This is the correct formula for aggregate index P/E
        total_market_cap / NULLIF(total_earnings_proxy, 0) as weighted_pe,
        simple_avg_pe,
        company_count,
        total_market_cap
      FROM aggregated
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
      aggregated AS (
        SELECT
          SUM(market_cap) as total_market_cap,
          SUM(market_cap / pe_ratio) as total_earnings_proxy,
          COUNT(*) as company_count
        FROM filtered
      )
      SELECT
        -- Harmonic weighted mean: Total Market Cap / Total Earnings
        total_market_cap / NULLIF(total_earnings_proxy, 0) as weighted_pe,
        company_count,
        total_market_cap
      FROM aggregated
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
   * Calculate S&P 500 P/E for a specific quarter using market-cap weighted methodology
   *
   * FORMULA: Total Market Cap / Total Implied Earnings
   * Where: Total Implied Earnings = SUM(market_cap / pe_ratio) for each company
   *
   * This matches the methodology used by the live S&P 500 P/E calculation in
   * marketIndicatorsService.js:566-614, ensuring consistency between historical
   * and current values.
   *
   * Uses ANNUAL P/E ratios for better data quality - quarterly P/E calculations
   * often have issues with non-annualized earnings figures.
   *
   * Benefits:
   * - Market-cap weighted: mega-caps (AAPL, MSFT, NVDA) properly influence the index P/E
   * - Harmonic mean: mathematically correct for ratios
   * - Annual data: more reliable than quarterly annualized estimates
   * - Consistent with S&P's official methodology
   */
  getSP500PEForQuarterTTM(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // First find the closest trading day for historical market cap calculation
    const closestDate = this.db.prepare(`
      SELECT MAX(date) as closest_date FROM daily_prices WHERE date <= ?
    `).get(quarterEndDate);
    const priceDate = closestDate?.closest_date || quarterEndDate;

    // Use annual P/E data with HISTORICAL market caps from daily_prices
    // This ensures quarterly P/E variation reflects actual price changes
    const result = this.db.prepare(`
      WITH sp500_annual_pe AS (
        SELECT
          cm.company_id,
          cm.pe_ratio,
          cm.fiscal_period,
          ROW_NUMBER() OVER (
            PARTITION BY cm.company_id
            ORDER BY cm.fiscal_period DESC
          ) as rn
        FROM index_constituents ic
        JOIN calculated_metrics cm ON ic.company_id = cm.company_id
        JOIN companies c ON cm.company_id = c.id
        WHERE ic.index_id = 1
          AND cm.period_type = 'annual'
          AND cm.pe_ratio > 0         -- Must have positive P/E
          AND cm.pe_ratio < 500       -- Max P/E to include high-growth stocks
          AND cm.fiscal_period <= ?   -- Only filings available by quarter end
      ),
      latest_pe AS (
        SELECT company_id, pe_ratio
        FROM sp500_annual_pe
        WHERE rn = 1
      ),
      -- Get HISTORICAL market caps from daily_prices for proper quarterly variation
      historical_mktcap AS (
        SELECT
          lp.company_id,
          lp.pe_ratio,
          dp.adjusted_close * pm.shares_outstanding as market_cap
        FROM latest_pe lp
        JOIN daily_prices dp ON lp.company_id = dp.company_id
        JOIN price_metrics pm ON lp.company_id = pm.company_id
        WHERE dp.date = ?
          AND dp.adjusted_close > 0
          AND pm.shares_outstanding > 0
          AND dp.adjusted_close * pm.shares_outstanding > 1e9  -- Min $1B market cap
      )
      SELECT
        COUNT(*) as company_count,
        SUM(market_cap) as total_market_cap,
        SUM(market_cap / pe_ratio) as total_implied_earnings,
        AVG(pe_ratio) as avg_pe,
        -- Calculate median for comparison
        (
          SELECT pe_ratio FROM (
            SELECT pe_ratio, ROW_NUMBER() OVER (ORDER BY pe_ratio) as rn,
                   COUNT(*) OVER () as total
            FROM historical_mktcap
          ) WHERE rn = (total + 1) / 2
        ) as median_pe
      FROM historical_mktcap
    `).get(quarterEndDate, priceDate);

    if (!result || !result.total_implied_earnings || result.company_count < 100) {
      return null;
    }

    // Calculate market-cap weighted P/E (harmonic mean)
    // Formula: Total Market Cap / Total Implied Earnings
    const weightedPE = result.total_market_cap / result.total_implied_earnings;

    return {
      value: Math.round(weightedPE * 100) / 100,
      companyCount: result.company_count,
      totalMarketCap: result.total_market_cap,
      totalImpliedEarnings: result.total_implied_earnings,
      medianPE: result.median_pe ? Math.round(result.median_pe * 100) / 100 : null,
      avgPE: result.avg_pe ? Math.round(result.avg_pe * 100) / 100 : null,
      method: 'market_cap_weighted_annual',
    };
  }

  /**
   * Calculate S&P 500 P/E using proper TTM earnings
   *
   * FIX: Q4 Missing Data - ~77% of companies have Q4 stored as 'annual' not 'quarterly'
   * Solution: Infer Q4 = Annual - (Q1 + Q2 + Q3)
   *
   * Note: Uses price_metrics.shares_outstanding which may understate market cap by ~10-15%
   * for dual-class stocks (GOOGL, BRK). This is an acceptable trade-off for data coverage.
   *
   * Formula: P/E = Total Market Cap / Total TTM Earnings
   */
  getSP500PEForQuarterV2(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // Find closest trading day for price data
    const closestDate = this.db.prepare(`
      SELECT MAX(date) as closest_date FROM daily_prices WHERE date <= ?
    `).get(quarterEndDate);
    const priceDate = closestDate?.closest_date || quarterEndDate;

    const result = this.db.prepare(`
      WITH
      -- Step 1: Get all quarterly earnings (actual quarterly records)
      quarterly_earnings AS (
        SELECT
          fd.company_id,
          fd.fiscal_date_ending as qtr_date,
          fd.net_income
        FROM financial_data fd
        JOIN index_constituents ic ON fd.company_id = ic.company_id
        WHERE ic.index_id = 1
          AND fd.statement_type = 'income_statement'
          AND fd.period_type = 'quarterly'
          AND fd.fiscal_date_ending <= ?
          AND fd.fiscal_date_ending > date(?, '-18 months')
          AND fd.net_income IS NOT NULL
      ),

      -- Step 2: Infer Q4 from annual filings (Q4 = Annual - Q1 - Q2 - Q3)
      -- ~77% of companies store Q4 as 'annual' not 'quarterly'
      inferred_q4 AS (
        SELECT
          fd_a.company_id,
          fd_a.fiscal_date_ending as qtr_date,
          fd_a.net_income - COALESCE((
            SELECT SUM(fd_q.net_income)
            FROM financial_data fd_q
            WHERE fd_q.company_id = fd_a.company_id
              AND fd_q.statement_type = 'income_statement'
              AND fd_q.period_type = 'quarterly'
              AND fd_q.fiscal_date_ending < fd_a.fiscal_date_ending
              AND fd_q.fiscal_date_ending >= date(fd_a.fiscal_date_ending, '-9 months')
          ), 0) as net_income
        FROM financial_data fd_a
        JOIN index_constituents ic ON fd_a.company_id = ic.company_id
        WHERE ic.index_id = 1
          AND fd_a.statement_type = 'income_statement'
          AND fd_a.period_type = 'annual'
          AND fd_a.fiscal_date_ending <= ?
          AND fd_a.fiscal_date_ending > date(?, '-18 months')
          AND fd_a.net_income IS NOT NULL
      ),

      -- Step 3: Combine quarterly and inferred Q4, rank by recency
      -- Filter out obviously corrupt data (quarterly > $60B or < -$60B is suspicious)
      all_quarters AS (
        SELECT company_id, qtr_date, net_income FROM quarterly_earnings
        WHERE ABS(net_income) < 60e9  -- Max ~$60B per quarter (Apple max is ~$35B)
        UNION ALL
        SELECT company_id, qtr_date, net_income FROM inferred_q4
        WHERE ABS(net_income) < 60e9
      ),
      ranked AS (
        SELECT
          company_id,
          qtr_date,
          net_income,
          ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY qtr_date DESC) as rn
        FROM all_quarters
      ),

      -- Step 4: Calculate TTM earnings (sum of last 4 quarters)
      ttm_earnings AS (
        SELECT
          company_id,
          SUM(net_income) as ttm_net_income,
          MAX(qtr_date) as latest_qtr,
          COUNT(*) as qtr_count
        FROM ranked
        WHERE rn <= 4
        GROUP BY company_id
        HAVING COUNT(*) = 4
          AND MAX(qtr_date) >= date(?, '-15 months')  -- Data must be reasonably recent
      ),

      -- Step 5: Calculate historical market cap using price_metrics shares
      final_data AS (
        SELECT
          te.company_id,
          te.ttm_net_income,
          dp.adjusted_close * pm.shares_outstanding as market_cap
        FROM ttm_earnings te
        JOIN daily_prices dp ON te.company_id = dp.company_id
        JOIN price_metrics pm ON te.company_id = pm.company_id
        WHERE dp.date = ?
          AND dp.adjusted_close > 0
          AND pm.shares_outstanding > 0
          AND dp.adjusted_close * pm.shares_outstanding > 1e9  -- Min $1B market cap
      )

      -- Step 6: Aggregate to index level
      SELECT
        COUNT(*) as company_count,
        SUM(market_cap) as total_market_cap,
        SUM(ttm_net_income) as total_ttm_earnings,
        SUM(CASE WHEN ttm_net_income > 0 THEN market_cap ELSE 0 END) as profitable_market_cap,
        SUM(CASE WHEN ttm_net_income > 0 THEN ttm_net_income ELSE 0 END) as profitable_earnings,
        SUM(CASE WHEN ttm_net_income <= 0 THEN ttm_net_income ELSE 0 END) as total_losses
      FROM final_data
    `).get(
      quarterEndDate,    // quarterly_earnings filter
      quarterEndDate,    // quarterly_earnings lookback
      quarterEndDate,    // inferred_q4 filter
      quarterEndDate,    // inferred_q4 lookback
      quarterEndDate,    // ttm_earnings recency check
      priceDate          // final_data price date
    );

    if (!result || !result.total_ttm_earnings || result.company_count < 100) {
      return null;
    }

    // Calculate P/E = Total Market Cap / Total TTM Earnings
    const pe = result.total_market_cap / result.total_ttm_earnings;

    return {
      value: Math.round(pe * 100) / 100,
      companyCount: result.company_count,
      totalMarketCap: result.total_market_cap,
      totalTTMEarnings: result.total_ttm_earnings,
      profitableMarketCap: result.profitable_market_cap,
      profitableEarnings: result.profitable_earnings,
      totalLosses: result.total_losses,
      method: 'ttm_corrected_shares',
    };
  }

  /**
   * Generate S&P 500 P/E historical time series
   * Uses TTM earnings method for accurate historical patterns
   * IMPORTANT: Minimum reliable start is 2019-Q2 due to Q4-2017 TCJA one-time charges
   * that distort TTM earnings calculations before this date
   */
  getSP500PEHistory(options = {}) {
    const { startQuarter = '2019-Q2' } = options;

    // Ensure minimum reliable start quarter (TCJA impact distorts earlier data)
    const minReliableQuarter = '2019-Q2';
    const effectiveStart = startQuarter < minReliableQuarter ? minReliableQuarter : startQuarter;

    const allQuarters = this.getAvailableQuarters();
    const quarters = allQuarters.filter(q => q >= effectiveStart);

    const series = [];
    // Minimum company count for reliable data
    // S&P 500 should have ~500 companies, so require at least 300 for historical
    // and 400 for recent quarters where more data should be available
    const MIN_COMPANIES_HISTORICAL = 300;
    const MIN_COMPANIES_RECENT = 400;
    const strictCutoff = '2024-Q4';

    for (const quarter of quarters) {
      // Use market-cap weighted calculation for accurate historical patterns
      const peData = this.getSP500PEForQuarterTTM(quarter);

      if (peData && peData.value) {
        // Filter based on company count - require sufficient coverage
        const minCompanies = quarter <= strictCutoff ? MIN_COMPANIES_HISTORICAL : MIN_COMPANIES_RECENT;
        const hasReliableData = peData.companyCount >= minCompanies;

        if (hasReliableData) {
          series.push({
            quarter,
            date: this.getQuarterEndDate(quarter),
            value: peData.value,
            companyCount: peData.companyCount,
            method: peData.method,
          });
        }
      }
    }

    // For the most recent data point, use the last reliable TTM value
    // Don't add current annual-based P/E as it uses a different methodology
    // and causes jarring transitions in the chart

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

    // Helper: Calculate 4-quarter rolling average for smoother trends
    const calculateRollingAverage = (series, window = 4) => {
      return series.map((item, idx) => {
        if (idx < window - 1) {
          // Not enough data points yet, return raw value
          return { ...item };
        }
        // Calculate average of last 'window' values
        let sum = 0;
        for (let i = idx - window + 1; i <= idx; i++) {
          sum += series[i].value;
        }
        return {
          ...item,
          value: Math.round((sum / window) * 1000) / 1000, // Round to 3 decimals
        };
      });
    };

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
      // Apply 4-quarter rolling average to MSI for smoother display
      medianMSI: calculateRollingAverage(
        timeSeries.series.medianMSI.map(d => ({
          date: d.date,
          value: d.value,
        }))
      ),
      // Keep raw MSI available if needed
      medianMSIRaw: timeSeries.series.medianMSI.map(d => ({
        date: d.date,
        value: d.value,
      })),
      aggregateMSI: timeSeries.series.aggregateMSI.map(d => ({
        date: d.date,
        value: d.value,
      })),
      // Apply 4-quarter rolling average to pctUndervalued for smoother display
      // This reduces seasonal Q1 spikes from December fiscal year-end filings
      pctUndervalued: calculateRollingAverage(
        timeSeries.series.pctUndervalued.map(d => ({
          date: d.date,
          value: d.value,
        }))
      ),
      // Keep raw pctUndervalued available for detailed analysis
      pctUndervaluedRaw: timeSeries.series.pctUndervalued.map(d => ({
        date: d.date,
        value: d.value,
        undervaluedCount: d.undervaluedCount,
        totalCount: d.totalCount,
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
      // For MSI, calculate rolling average including current value
      if (current.medianMSI !== null && data.medianMSI.length >= 3) {
        const lastThree = data.medianMSI.slice(-3).map(d => d.value);
        const smoothedCurrent = (lastThree.reduce((a, b) => a + b, 0) + current.medianMSI) / 4;
        addCurrentPoint(data.medianMSI, Math.round(smoothedCurrent * 1000) / 1000);
      }
      addCurrentPoint(data.medianMSIRaw, current.medianMSI);
      addCurrentPoint(data.aggregateMSI, current.aggregateMSI);
      // For pctUndervalued, calculate rolling average including current value
      if (current.pctUndervalued !== null && data.pctUndervalued.length >= 3) {
        const lastThreePctUV = data.pctUndervalued.slice(-3).map(d => d.value);
        const smoothedPctUV = (lastThreePctUV.reduce((a, b) => a + b, 0) + current.pctUndervalued) / 4;
        addCurrentPoint(data.pctUndervalued, Math.round(smoothedPctUV * 100) / 100);
      }
      addCurrentPoint(data.pctUndervaluedRaw, current.pctUndervalued);

      // Calculate smoothed current MSI (4Q rolling average)
      if (current.medianMSI !== null && data.medianMSI.length >= 3) {
        const lastThreeValues = data.medianMSIRaw.slice(-3).map(d => d.value);
        current.medianMSISmoothed = Math.round(
          (lastThreeValues.reduce((a, b) => a + b, 0) + current.medianMSI) / 4 * 1000
        ) / 1000;
      }

      // Calculate smoothed current pctUndervalued (4Q rolling average)
      if (current.pctUndervalued !== null && data.pctUndervaluedRaw.length >= 3) {
        const lastThreePctUVValues = data.pctUndervaluedRaw.slice(-3).map(d => d.value);
        current.pctUndervaluedSmoothed = Math.round(
          (lastThreePctUVValues.reduce((a, b) => a + b, 0) + current.pctUndervalued) / 4 * 100
        ) / 100;
      }
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
