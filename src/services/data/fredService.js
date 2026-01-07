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

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

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
    'A191RL1Q225SBEA',          // Real GDP Growth
  ],
};

class FREDService {
  constructor(db, apiKey = process.env.FRED_API_KEY) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.apiKey = apiKey;
    this.baseUrl = FRED_BASE_URL;

    // Rate limiting (120 req/min = 2 req/sec)
    this.requestDelay = 500; // 500ms between requests
    this.lastRequestTime = 0;

    // Cache
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour
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

    // Check cache
    const cacheKey = `${seriesId}:${startDate}:${endDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
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

      // Cache the result
      this.cache.set(cacheKey, { data: parsed, timestamp: Date.now() });

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

    // Get series metadata
    const seriesDef = this.db.prepare(`
      SELECT * FROM economic_series_definitions WHERE series_id = ?
    `).get(seriesId);

    // Insert/update observations
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO economic_indicators
      (series_id, series_name, category, observation_date, value, source, updated_at)
      VALUES (?, ?, ?, ?, ?, 'FRED', datetime('now'))
    `);

    const transaction = this.db.transaction(() => {
      for (const obs of data) {
        insert.run(
          seriesId,
          seriesDef?.series_name || seriesId,
          seriesDef?.category || 'other',
          obs.date,
          obs.value
        );
      }
    });

    transaction();

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
    // For each series, calculate changes vs prior periods
    const seriesIds = this.db.prepare(`
      SELECT DISTINCT series_id FROM economic_indicators
    `).all();

    for (const { series_id } of seriesIds) {
      this.db.prepare(`
        UPDATE economic_indicators AS ei
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
        WHERE series_id = ?
      `).run(series_id);
    }
  }

  /**
   * Update yield curve table
   */
  async updateYieldCurve() {
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
      const result = this.db.prepare(`
        SELECT value FROM economic_indicators
        WHERE series_id = ?
        ORDER BY observation_date DESC
        LIMIT 1
      `).get(seriesId);

      yields[field] = result?.value || null;
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

    this.db.prepare(`
      INSERT OR REPLACE INTO yield_curve (
        curve_date,
        y_1m, y_3m, y_6m, y_1y, y_2y, y_3y, y_5y, y_7y, y_10y, y_20y, y_30y,
        spread_2s10s, spread_3m10y, spread_2s30s,
        curvature, level,
        is_inverted_2s10s, is_inverted_3m10y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      today,
      yields.y_1m, yields.y_3m, yields.y_6m, yields.y_1y,
      yields.y_2y, yields.y_3y, yields.y_5y, yields.y_7y,
      yields.y_10y, yields.y_20y, yields.y_30y,
      spread_2s10s, spread_3m10y, spread_2s30s,
      curvature, level,
      spread_2s10s < 0 ? 1 : 0,
      spread_3m10y && spread_3m10y < 0 ? 1 : 0
    );

    console.log(`  Yield curve: 2s10s=${spread_2s10s?.toFixed(2)}%, inverted=${spread_2s10s < 0}`);
  }

  /**
   * Get current macro snapshot
   */
  getMacroSnapshot() {
    const indicators = this.db.prepare(`
      SELECT * FROM v_latest_economic_indicators
    `).all();

    const yieldCurve = this.db.prepare(`
      SELECT * FROM v_current_yield_curve
    `).get();

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
  getMacroSignals() {
    const yc = this.db.prepare(`SELECT * FROM v_current_yield_curve`).get();
    const vix = this.db.prepare(`
      SELECT value FROM v_latest_economic_indicators WHERE series_id = 'VIXCLS'
    `).get();
    const hySpread = this.db.prepare(`
      SELECT value FROM v_latest_economic_indicators WHERE series_id = 'BAMLH0A0HYM2'
    `).get();

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
}

module.exports = { FREDService, PRIORITY_SERIES };
