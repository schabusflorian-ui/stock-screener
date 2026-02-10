/**
 * FRED (Federal Reserve Economic Data) Service
 *
 * Fetches macroeconomic data from the St. Louis Fed's FRED API.
 * FREE API with 120 requests/minute limit.
 *
 * Key series tracked:
 * - Interest rates (Fed Funds, Treasury yields)
 * - Inflation (CPI, PCE)
 * - Employment (Unemployment, Payrolls, Claims)
 * - Growth (GDP, Industrial Production)
 * - Credit (Spreads, Financial Conditions)
 * - Housing (Starts, Prices)
 * - Consumer (Sentiment, Savings)
 */

const axios = require('axios');
const { unifiedCache } = require('../../lib/redisCache');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';
const FRED_CACHE_PREFIX = 'fred:';
const FRED_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Priority series to fetch (ordered by importance)
const PRIORITY_SERIES = {
  // Daily - fetch every day
  daily: [
    'DFF',      // Fed Funds
    'DGS2', 'DGS10', 'DGS30',  // Key Treasury yields
    'T10Y2Y', 'T10Y3M',         // Yield spreads
    'BAMLH0A0HYM2',             // High Yield spread
    'VIXCLS',                    // VIX
    'DCOILWTICO',               // Oil
  ],

  // Weekly - fetch once per week
  weekly: [
    'ICSA', 'CCSA',             // Jobless claims
    'NFCI',                      // Financial conditions
    'MORTGAGE30US',             // Mortgage rate
    'WALCL',                    // Fed balance sheet
  ],

  // Monthly - fetch once per month
  monthly: [
    'CPIAUCSL', 'CPILFESL',     // CPI
    'PCEPI', 'PCEPILFE',        // PCE
    'UNRATE',                    // Unemployment
    'PAYEMS',                    // Payrolls
    'INDPRO',                    // Industrial Production
    'RSAFS',                     // Retail Sales
    'HOUST',                     // Housing Starts
    'UMCSENT',                   // Consumer Sentiment
    'M2SL',                      // Money Supply
  ],

  // Quarterly
  quarterly: [
    'GDP', 'GDPC1',              // GDP
    'A191RL1Q225SBEA',           // Real GDP Growth
    'NCBCEPNW',                  // Nonfinancial Corporate Business: Corporate Equities as % of Net Worth (MSI)
  ],

  // Historical only - discontinued series that still have historical data
  historical: [
    'WILL5000IND',  // Wilshire 5000 Total Market Index - discontinued June 3, 2024
                    // Historical data from 1971-2024 still available for Buffett Indicator
  ],
};

class FREDService {
  constructor(db, apiKey = process.env.FRED_API_KEY) {
    // Don't store db instance - use getDatabaseAsync() in methods
    this.apiKey = apiKey;
    this.baseUrl = FRED_BASE_URL;

    // Rate limiting (120 req/min = 2 req/sec)
    this.requestDelay = 500; // 500ms between requests
    this.lastRequestTime = 0;

    // Uses UnifiedCache (Redis-backed when available, memory fallback)
    console.log('[FREDService] Initialized with UnifiedCache');
  }

  /**
   * Wait for rate limit
   */
  async waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.requestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay - elapsed));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch a single series from FRED
   */
  async fetchSeries(seriesId, options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = 1000,
      sortOrder = 'desc',
    } = options;

    // Check distributed cache (Redis when available)
    const cacheKey = `${FRED_CACHE_PREFIX}${seriesId}:${startDate}:${endDate}`;
    const cached = await unifiedCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    await this.waitForRateLimit();

    const params = {
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: 'json',
      sort_order: sortOrder,
      limit,
    };

    if (startDate) params.observation_start = startDate;
    if (endDate) params.observation_end = endDate;

    try {
      const response = await axios.get(`${this.baseUrl}/series/observations`, { params });
      const data = response.data.observations || [];

      // Parse values
      const parsed = data.map(obs => ({
        date: obs.date,
        value: obs.value === '.' ? null : parseFloat(obs.value),
      })).filter(obs => obs.value !== null);

      // Cache the result in distributed cache
      await unifiedCache.set(cacheKey, parsed, FRED_CACHE_TTL);

      return parsed;
    } catch (error) {
      console.error(`Error fetching FRED series ${seriesId}:`, error.message);
      return [];
    }
  }

  /**
   * Get latest value for a series
   */
  async getLatestValue(seriesId) {
    const data = await this.fetchSeries(seriesId, { limit: 1 });
    return data.length > 0 ? data[0] : null;
  }

  /**
   * Fetch and store series data
   */
  async updateSeries(seriesId, lookbackDays = 365) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const startStr = startDate.toISOString().split('T')[0];

    const data = await this.fetchSeries(seriesId, {
      startDate: startStr,
      sortOrder: 'asc',
    });

    if (data.length === 0) {
      console.log(`  No data for ${seriesId}`);
      return 0;
    }

    const database = await getDatabaseAsync();

    // Get series metadata
    const seriesDefResult = await database.query(`
      SELECT * FROM economic_series_definitions WHERE series_id = $1
    `, [seriesId]);
    const seriesDef = seriesDefResult.rows[0];

    // Insert/update observations - PostgreSQL uses ON CONFLICT, SQLite uses INSERT OR REPLACE
    const upsertSql = isUsingPostgres()
      ? `INSERT INTO economic_indicators
         (series_id, series_name, category, observation_date, value, source, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'FRED', NOW())
         ON CONFLICT (series_id, observation_date)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
      : `INSERT OR REPLACE INTO economic_indicators
         (series_id, series_name, category, observation_date, value, source, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'FRED', datetime('now'))`;

    // Process in transaction-like manner (BEGIN/COMMIT for PostgreSQL)
    if (isUsingPostgres()) {
      await database.query('BEGIN');
    }

    try {
      for (const obs of data) {
        await database.query(upsertSql, [
          seriesId,
          seriesDef?.series_name || seriesId,
          seriesDef?.category || 'other',
          obs.date,
          obs.value
        ]);
      }

      if (isUsingPostgres()) {
        await database.query('COMMIT');
      }
    } catch (error) {
      if (isUsingPostgres()) {
        await database.query('ROLLBACK');
      }
      throw error;
    }

    console.log(`  ${seriesId}: ${data.length} observations`);
    return data.length;
  }

  /**
   * Update all priority series
   */
  async updateAllSeries() {
    console.log('\n📊 Updating FRED economic data...\n');

    if (!this.apiKey) {
      console.error('❌ FRED_API_KEY not set in environment');
      return { success: false, error: 'API key not configured' };
    }

    let totalUpdated = 0;
    const errors = [];

    // Daily series - fetch last 30 days
    console.log('📅 Daily series:');
    for (const seriesId of PRIORITY_SERIES.daily) {
      try {
        const count = await this.updateSeries(seriesId, 30);
        totalUpdated += count;
      } catch (error) {
        errors.push({ series: seriesId, error: error.message });
      }
    }

    // Weekly series - fetch last 90 days
    console.log('\n📅 Weekly series:');
    for (const seriesId of PRIORITY_SERIES.weekly) {
      try {
        const count = await this.updateSeries(seriesId, 90);
        totalUpdated += count;
      } catch (error) {
        errors.push({ series: seriesId, error: error.message });
      }
    }

    // Monthly series - fetch last 2 years
    console.log('\n📅 Monthly series:');
    for (const seriesId of PRIORITY_SERIES.monthly) {
      try {
        const count = await this.updateSeries(seriesId, 730);
        totalUpdated += count;
      } catch (error) {
        errors.push({ series: seriesId, error: error.message });
      }
    }

    // Quarterly series - fetch last 5 years
    console.log('\n📅 Quarterly series:');
    for (const seriesId of PRIORITY_SERIES.quarterly) {
      try {
        const count = await this.updateSeries(seriesId, 1825);
        totalUpdated += count;
      } catch (error) {
        errors.push({ series: seriesId, error: error.message });
      }
    }

    // Calculate derived metrics
    console.log('\n📊 Calculating derived metrics...');
    await this.calculateDerivedMetrics();

    // Update yield curve
    console.log('\n📈 Updating yield curve...');
    await this.updateYieldCurve();

    console.log(`\n✅ Updated ${totalUpdated} observations`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} errors occurred`);
    }

    return { success: true, totalUpdated, errors };
  }

  /**
   * Calculate derived metrics (changes, percentiles, z-scores)
   */
  async calculateDerivedMetrics() {
    const database = await getDatabaseAsync();

    // For each series, calculate changes vs prior periods
    const seriesIdsResult = await database.query(`
      SELECT DISTINCT series_id FROM economic_indicators
    `);
    const seriesIds = seriesIdsResult.rows;

    for (const { series_id } of seriesIds) {
      // PostgreSQL and SQLite have different date arithmetic
      const updateSql = isUsingPostgres()
        ? `UPDATE economic_indicators AS ei
           SET
             change_1m = (
               SELECT ei.value - prev.value
               FROM economic_indicators prev
               WHERE prev.series_id = ei.series_id
                 AND prev.observation_date < ei.observation_date
               ORDER BY prev.observation_date DESC
               LIMIT 1
             ),
             change_1y = (
               SELECT ei.value - prev.value
               FROM economic_indicators prev
               WHERE prev.series_id = ei.series_id
                 AND prev.observation_date <= ei.observation_date - INTERVAL '1 year'
               ORDER BY prev.observation_date DESC
               LIMIT 1
             )
           WHERE series_id = $1`
        : `UPDATE economic_indicators AS ei
           SET
             change_1m = (
               SELECT ei.value - prev.value
               FROM economic_indicators prev
               WHERE prev.series_id = ei.series_id
                 AND prev.observation_date < ei.observation_date
               ORDER BY prev.observation_date DESC
               LIMIT 1
             ),
             change_1y = (
               SELECT ei.value - prev.value
               FROM economic_indicators prev
               WHERE prev.series_id = ei.series_id
                 AND prev.observation_date <= date(ei.observation_date, '-1 year')
               ORDER BY prev.observation_date DESC
               LIMIT 1
             )
           WHERE series_id = $1`;

      await database.query(updateSql, [series_id]);
    }
  }

  /**
   * Update yield curve table
   */
  async updateYieldCurve() {
    const database = await getDatabaseAsync();

    // Get latest Treasury yields
    const yields = {};
    const yieldSeries = {
      y_1m: 'DGS1MO',
      y_3m: 'DGS3MO',
      y_6m: 'DGS6MO',
      y_1y: 'DGS1',
      y_2y: 'DGS2',
      y_3y: 'DGS3',
      y_5y: 'DGS5',
      y_7y: 'DGS7',
      y_10y: 'DGS10',
      y_20y: 'DGS20',
      y_30y: 'DGS30',
    };

    for (const [field, seriesId] of Object.entries(yieldSeries)) {
      const result = await database.query(`
        SELECT value FROM economic_indicators
        WHERE series_id = $1
        ORDER BY observation_date DESC
        LIMIT 1
      `, [seriesId]);

      yields[field] = result.rows[0]?.value || null;
    }

    // Only proceed if we have key yields
    if (!yields.y_2y || !yields.y_10y) {
      console.log('  Missing key yields, skipping yield curve update');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Calculate spreads
    const spread_2s10s = yields.y_10y - yields.y_2y;
    const spread_3m10y = yields.y_3m ? yields.y_10y - yields.y_3m : null;
    const spread_2s30s = yields.y_30y ? yields.y_30y - yields.y_2y : null;

    // Calculate curvature (butterfly)
    const curvature = yields.y_5y ? (2 * yields.y_5y - yields.y_2y - yields.y_10y) : null;

    // Average level
    const yieldValues = Object.values(yields).filter(v => v !== null);
    const level = yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length;

    // PostgreSQL uses ON CONFLICT, SQLite uses INSERT OR REPLACE
    const upsertSql = isUsingPostgres()
      ? `INSERT INTO yield_curve (
          curve_date,
          y_1m, y_3m, y_6m, y_1y, y_2y, y_3y, y_5y, y_7y, y_10y, y_20y, y_30y,
          spread_2s10s, spread_3m10y, spread_2s30s,
          curvature, level,
          is_inverted_2s10s, is_inverted_3m10y
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (curve_date)
        DO UPDATE SET
          y_1m = EXCLUDED.y_1m, y_3m = EXCLUDED.y_3m, y_6m = EXCLUDED.y_6m, y_1y = EXCLUDED.y_1y,
          y_2y = EXCLUDED.y_2y, y_3y = EXCLUDED.y_3y, y_5y = EXCLUDED.y_5y, y_7y = EXCLUDED.y_7y,
          y_10y = EXCLUDED.y_10y, y_20y = EXCLUDED.y_20y, y_30y = EXCLUDED.y_30y,
          spread_2s10s = EXCLUDED.spread_2s10s, spread_3m10y = EXCLUDED.spread_3m10y,
          spread_2s30s = EXCLUDED.spread_2s30s, curvature = EXCLUDED.curvature, level = EXCLUDED.level,
          is_inverted_2s10s = EXCLUDED.is_inverted_2s10s, is_inverted_3m10y = EXCLUDED.is_inverted_3m10y`
      : `INSERT OR REPLACE INTO yield_curve (
          curve_date,
          y_1m, y_3m, y_6m, y_1y, y_2y, y_3y, y_5y, y_7y, y_10y, y_20y, y_30y,
          spread_2s10s, spread_3m10y, spread_2s30s,
          curvature, level,
          is_inverted_2s10s, is_inverted_3m10y
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`;

    await database.query(upsertSql, [
      today,
      yields.y_1m, yields.y_3m, yields.y_6m, yields.y_1y,
      yields.y_2y, yields.y_3y, yields.y_5y, yields.y_7y,
      yields.y_10y, yields.y_20y, yields.y_30y,
      spread_2s10s, spread_3m10y, spread_2s30s,
      curvature, level,
      spread_2s10s < 0 ? 1 : 0,
      spread_3m10y && spread_3m10y < 0 ? 1 : 0
    ]);

    console.log(`  Yield curve: 2s10s=${spread_2s10s?.toFixed(2)}%, inverted=${spread_2s10s < 0}`);
  }

  /**
   * Get current macro snapshot
   */
  async getMacroSnapshot() {
    const database = await getDatabaseAsync();

    // Get latest economic indicators (replacing v_latest_economic_indicators view)
    const indicatorsResult = await database.query(`
      SELECT ei.*
      FROM economic_indicators ei
      INNER JOIN (
        SELECT series_id, MAX(observation_date) as max_date
        FROM economic_indicators
        GROUP BY series_id
      ) latest ON ei.series_id = latest.series_id AND ei.observation_date = latest.max_date
    `);
    const indicators = indicatorsResult.rows;

    // Get current yield curve (replacing v_current_yield_curve view)
    const yieldCurveResult = await database.query(`
      SELECT * FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `);
    const yieldCurve = yieldCurveResult.rows[0];

    // Organize by category
    const snapshot = {
      timestamp: new Date().toISOString(),
      rates: {},
      inflation: {},
      employment: {},
      growth: {},
      credit: {},
      housing: {},
      sentiment: {},
      yieldCurve: yieldCurve || null,
    };

    for (const ind of indicators) {
      if (snapshot[ind.category]) {
        snapshot[ind.category][ind.series_id] = {
          name: ind.series_name,
          value: ind.value,
          date: ind.observation_date,
          change_1m: ind.change_1m,
          change_1y: ind.change_1y,
        };
      }
    }

    return snapshot;
  }

  /**
   * Get key macro signals for trading
   */
  async getMacroSignals() {
    const database = await getDatabaseAsync();

    // Get current yield curve (replacing v_current_yield_curve view)
    const ycResult = await database.query(`
      SELECT * FROM yield_curve
      ORDER BY curve_date DESC
      LIMIT 1
    `);
    const yc = ycResult.rows[0];

    // Get latest VIX (replacing v_latest_economic_indicators view)
    const vixResult = await database.query(`
      SELECT value FROM economic_indicators
      WHERE series_id = $1
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['VIXCLS']);
    const vix = vixResult.rows[0];

    // Get latest HY spread (replacing v_latest_economic_indicators view)
    const hySpreadResult = await database.query(`
      SELECT value FROM economic_indicators
      WHERE series_id = $1
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['BAMLH0A0HYM2']);
    const hySpread = hySpreadResult.rows[0];

    const signals = [];

    // Yield curve inversion
    if (yc?.is_inverted_2s10s) {
      signals.push({
        type: 'yield_curve_inversion',
        severity: 'warning',
        message: `2s10s yield curve inverted: ${yc.spread_2s10s?.toFixed(2)}%`,
        implication: 'Historically precedes recession by 12-24 months',
      });
    }

    // VIX elevated
    if (vix?.value > 25) {
      signals.push({
        type: 'elevated_volatility',
        severity: vix.value > 30 ? 'alert' : 'warning',
        message: `VIX at ${vix.value?.toFixed(1)} - elevated volatility`,
        implication: 'Reduce position sizes, widen stops',
      });
    }

    // Credit spreads widening
    if (hySpread?.value > 5) {
      signals.push({
        type: 'credit_stress',
        severity: hySpread.value > 7 ? 'alert' : 'warning',
        message: `High yield spread at ${hySpread.value?.toFixed(2)}% - credit stress`,
        implication: 'Risk-off environment, favor quality',
      });
    }

    return {
      timestamp: new Date().toISOString(),
      signals,
      summary: {
        yieldCurveInverted: yc?.is_inverted_2s10s === 1,
        vix: vix?.value,
        hySpread: hySpread?.value,
        riskLevel: this.calculateRiskLevel(yc, vix, hySpread),
      },
    };
  }

  /**
   * Calculate overall macro risk level
   */
  calculateRiskLevel(yieldCurve, vix, hySpread) {
    let score = 0;

    // Yield curve
    if (yieldCurve?.is_inverted_2s10s) score += 2;
    else if (yieldCurve?.spread_2s10s < 0.5) score += 1;

    // VIX
    if (vix?.value > 30) score += 3;
    else if (vix?.value > 25) score += 2;
    else if (vix?.value > 20) score += 1;

    // Credit spreads
    if (hySpread?.value > 7) score += 3;
    else if (hySpread?.value > 5) score += 2;
    else if (hySpread?.value > 4) score += 1;

    if (score >= 6) return 'high';
    if (score >= 3) return 'elevated';
    return 'normal';
  }

  /**
   * Fetch historical Wilshire 5000 data from FRED
   * Note: FRED discontinued this series on June 3, 2024, but historical data is still available
   * This is used for accurate Buffett Indicator calculations for periods before June 2024
   *
   * @param {string} startDate - Start date in YYYY-MM-DD format (default: 2015-01-01)
   * @returns {Object} Result with count of observations stored
   */
  async fetchWilshire5000History(startDate = '2015-01-01') {
    console.log('\n📊 Fetching historical Wilshire 5000 data from FRED...');
    console.log(`   Start date: ${startDate}`);
    console.log('   Note: Series discontinued June 3, 2024 - fetching historical data only\n');

    if (!this.apiKey) {
      console.error('❌ FRED_API_KEY not set in environment');
      return { success: false, error: 'API key not configured' };
    }

    try {
      // Fetch all historical data from FRED
      // Use ascending order to get data from oldest to newest
      const data = await this.fetchSeries('WILL5000IND', {
        startDate,
        endDate: '2024-06-03', // Last data point before discontinuation
        sortOrder: 'asc',
        limit: 5000, // Enough for ~10 years of daily data
      });

      if (data.length === 0) {
        console.log('   ⚠️ No Wilshire 5000 data returned from FRED');
        return { success: false, error: 'No data available' };
      }

      console.log(`   Found ${data.length} observations`);

      const database = await getDatabaseAsync();

      // Store in economic_indicators table
      // PostgreSQL uses ON CONFLICT, SQLite uses INSERT OR REPLACE
      const upsertSql = isUsingPostgres()
        ? `INSERT INTO economic_indicators
           (series_id, series_name, category, observation_date, value, source, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'FRED', NOW())
           ON CONFLICT (series_id, observation_date)
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
        : `INSERT OR REPLACE INTO economic_indicators
           (series_id, series_name, category, observation_date, value, source, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'FRED', datetime('now'))`;

      // Process in transaction
      if (isUsingPostgres()) {
        await database.query('BEGIN');
      }

      try {
        for (const obs of data) {
          await database.query(upsertSql, [
            'WILL5000IND',
            'Wilshire 5000 Total Market Index',
            'market_valuation',
            obs.date,
            obs.value
          ]);
        }

        if (isUsingPostgres()) {
          await database.query('COMMIT');
        }
      } catch (error) {
        if (isUsingPostgres()) {
          await database.query('ROLLBACK');
        }
        throw error;
      }

      // Get date range stored
      const firstDate = data[0]?.date;
      const lastDate = data[data.length - 1]?.date;

      console.log(`   ✅ Stored ${data.length} Wilshire 5000 observations`);
      console.log(`   Date range: ${firstDate} to ${lastDate}`);

      return {
        success: true,
        count: data.length,
        firstDate,
        lastDate,
        note: 'Historical data only - series discontinued June 3, 2024',
      };
    } catch (error) {
      console.error(`   ❌ Error fetching Wilshire 5000: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Wilshire 5000 value for a specific date (or closest prior date)
   * Used for historical Buffett Indicator calculations
   *
   * @param {string} targetDate - Date in YYYY-MM-DD format
   * @returns {Object|null} { date, value } or null if not found
   */
  async getWilshire5000ForDate(targetDate) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT observation_date as date, value
      FROM economic_indicators
      WHERE series_id = $1
        AND observation_date <= $2
      ORDER BY observation_date DESC
      LIMIT 1
    `, ['WILL5000IND', targetDate]);

    return result.rows[0] || null;
  }

  /**
   * Check if we have Wilshire 5000 data for a date range
   * @returns {Object} Coverage statistics
   */
  async getWilshire5000Coverage() {
    const database = await getDatabaseAsync();

    const queryResult = await database.query(`
      SELECT
        MIN(observation_date) as first_date,
        MAX(observation_date) as last_date,
        COUNT(*) as observation_count
      FROM economic_indicators
      WHERE series_id = $1
    `, ['WILL5000IND']);

    const result = queryResult.rows[0];

    return {
      hasData: parseInt(result.observation_count) > 0,
      firstDate: result.first_date,
      lastDate: result.last_date,
      count: parseInt(result.observation_count),
    };
  }
}

module.exports = { FREDService, PRIORITY_SERIES };
