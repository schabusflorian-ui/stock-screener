// src/services/backtesting/historicalDataProvider.js
// Provides point-in-time data access for historical backtesting
// Ensures no lookahead bias by filtering all queries to simulationDate

const { getDatabaseAsync } = require('../../lib/db');

/**
 * HistoricalDataProvider - Time-travel layer for backtesting
 *
 * Wraps all database queries with date filtering to ensure
 * the TradingAgent only sees data available at the simulation date.
 */
class HistoricalDataProvider {
  /**
   * Creates a HistoricalDataProvider instance
   */
  constructor() {
    this.simulationDate = null;
    console.log('HistoricalDataProvider initialized');
  }

  /**
   * Set the current simulation date
   * All subsequent queries will return data as-of this date
   * @param {string} date - ISO date string (YYYY-MM-DD)
   */
  setSimulationDate(date) {
    this.simulationDate = date;
  }

  /**
   * Get current simulation date
   * @returns {string|null}
   */
  getSimulationDate() {
    return this.simulationDate;
  }


  // ========== Public API Methods ==========

  /**
   * Get latest price as of simulation date
   */
  async getLatestPrice(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT close as price, date, high, low, volume
       FROM daily_prices
       WHERE company_id = $1 AND date <= $2
       ORDER BY date DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get price history for technical analysis
   */
  async getPriceHistory(companyId, days = 200) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT date, open, high, low, close, adjusted_close, volume
       FROM daily_prices
       WHERE company_id = $1 AND date <= $2
       ORDER BY date DESC
       LIMIT $3`,
      [companyId, this.simulationDate, days]
    );
    return result.rows;
  }

  /**
   * Get calculated metrics (fundamentals)
   */
  async getCalculatedMetrics(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT *
       FROM calculated_metrics
       WHERE company_id = $1
         AND fiscal_period <= $2
       ORDER BY fiscal_period DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get sentiment data
   */
  async getSentiment(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT *
       FROM combined_sentiment
       WHERE company_id = $1
         AND calculated_at <= $2
       ORDER BY calculated_at DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get insider activity summary
   */
  async getInsiderActivity(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT
         SUM(CASE WHEN transaction_code IN ('P', 'A') THEN shares_transacted ELSE 0 END) as buy_shares,
         SUM(CASE WHEN transaction_code = 'S' THEN shares_transacted ELSE 0 END) as sell_shares,
         SUM(CASE WHEN transaction_code IN ('P', 'A') THEN total_value ELSE 0 END) as buy_value,
         SUM(CASE WHEN transaction_code = 'S' THEN total_value ELSE 0 END) as sell_value,
         COUNT(CASE WHEN transaction_code IN ('P', 'A') THEN 1 END) as buy_count,
         COUNT(CASE WHEN transaction_code = 'S' THEN 1 END) as sell_count
       FROM insider_transactions
       WHERE company_id = $1
         AND transaction_date BETWEEN ($2::date - INTERVAL '90 days') AND $2`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get 13F holdings
   */
  async get13FHoldings(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT
         ih.*,
         fi.name as investor_name
       FROM investor_holdings ih
       JOIN famous_investors fi ON fi.id = ih.investor_id
       WHERE ih.company_id = $1
         AND ih.filing_date <= $2
       ORDER BY ih.filing_date DESC`,
      [companyId, this.simulationDate]
    );
    return result.rows;
  }

  /**
   * Get congressional trades
   */
  async getCongressTrades(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT
         COUNT(CASE WHEN transaction_type = 'purchase' THEN 1 END) as buy_count,
         COUNT(CASE WHEN transaction_type = 'sale' THEN 1 END) as sell_count,
         SUM(CASE WHEN transaction_type = 'purchase' THEN (amount_min + COALESCE(amount_max, amount_min)) / 2 ELSE 0 END) as buy_amount,
         SUM(CASE WHEN transaction_type = 'sale' THEN (amount_min + COALESCE(amount_max, amount_min)) / 2 ELSE 0 END) as sell_amount
       FROM congressional_trades
       WHERE company_id = $1
         AND transaction_date BETWEEN ($2::date - INTERVAL '90 days') AND $2`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get short interest
   */
  async getShortInterest(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT *
       FROM short_interest
       WHERE company_id = $1
         AND settlement_date <= $2
       ORDER BY settlement_date DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get intrinsic value estimate
   */
  async getIntrinsicValue(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT
         weighted_intrinsic_value as intrinsic_value_per_share,
         margin_of_safety,
         valuation_signal,
         confidence_level as confidence_score
       FROM intrinsic_value_estimates
       WHERE company_id = $1
         AND estimate_date <= $2
       ORDER BY estimate_date DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get upcoming earnings (for blackout checking)
   */
  async getUpcomingEarnings(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT next_earnings_date as report_date
       FROM earnings_calendar
       WHERE company_id = $1
         AND next_earnings_date > $2
         AND next_earnings_date <= ($2::date + INTERVAL '30 days')
       ORDER BY next_earnings_date ASC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get factor scores
   */
  async getFactorScores(companyId) {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT *
       FROM stock_factor_scores
       WHERE company_id = $1
         AND score_date <= $2
       ORDER BY score_date DESC
       LIMIT 1`,
      [companyId, this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get VIX level for regime detection
   */
  async getVIXLevel() {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT close as vix_level, date
       FROM daily_prices p
       JOIN companies c ON c.id = p.company_id
       WHERE c.symbol = '^VIX'
         AND p.date <= $1
       ORDER BY p.date DESC
       LIMIT 1`,
      [this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Get all trading days in a date range
   */
  async getTradingDays(startDate, endDate) {
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT DISTINCT date
       FROM daily_prices
       WHERE date BETWEEN $1 AND $2
       ORDER BY date ASC`,
      [startDate, endDate]
    );
    return result.rows.map(r => r.date);
  }

  /**
   * Get companies that were trading on the simulation date
   */
  async getActiveCompanies() {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT DISTINCT c.id, c.symbol, c.name, c.sector, c.market_cap
       FROM companies c
       JOIN daily_prices dp ON dp.company_id = c.id
       WHERE dp.date = $1
         AND c.symbol NOT LIKE '^%'
         AND c.symbol NOT LIKE '%.%'
       ORDER BY c.market_cap DESC`,
      [this.simulationDate]
    );
    return result.rows;
  }

  /**
   * Get benchmark price (SPY)
   */
  async getBenchmarkPrice() {
    this._ensureSimulationDate();
    const database = getDatabaseAsync();
    const result = await database.query(
      `SELECT close as price, date
       FROM daily_prices p
       JOIN companies c ON c.id = p.company_id
       WHERE c.symbol = 'SPY'
         AND p.date <= $1
       ORDER BY p.date DESC
       LIMIT 1`,
      [this.simulationDate]
    );
    return result.rows[0];
  }

  /**
   * Calculate technical indicators from historical prices
   * @param {number} companyId
   * @returns {object} Technical metrics
   */
  async calculateTechnicalMetrics(companyId) {
    const prices = await this.getPriceHistory(companyId, 200);
    if (!prices || prices.length < 20) return null;

    // Prices are in descending order, reverse for calculations
    const closes = prices.map(p => p.close).reverse();
    const volumes = prices.map(p => p.volume).reverse();

    // Calculate moving averages
    const sma20 = this._sma(closes, 20);
    const sma50 = this._sma(closes, 50);
    const sma200 = closes.length >= 200 ? this._sma(closes, 200) : null;

    // Calculate RSI
    const rsi = this._rsi(closes, 14);

    // Calculate MACD
    const ema12 = this._ema(closes, 12);
    const ema26 = this._ema(closes, 26);
    const macd = ema12 - ema26;

    // Volume ratio
    const avgVolume20 = this._sma(volumes, 20);
    const volumeRatio = volumes[volumes.length - 1] / avgVolume20;

    // Price relative to moving averages
    const currentPrice = closes[closes.length - 1];

    // Calculate 12-1 momentum (SKIP most recent month per academic research)
    // This is the correct momentum factor implementation
    let momentum12_1 = null;
    if (closes.length >= 252) {
      const price1MonthAgo = closes[closes.length - 21]; // ~1 month ago
      const price12MonthsAgo = closes[closes.length - 252]; // ~12 months ago
      momentum12_1 = (price1MonthAgo - price12MonthsAgo) / price12MonthsAgo;
    } else if (closes.length >= 63) {
      // Fallback to shorter period if insufficient data
      const price1MonthAgo = closes[closes.length - 21];
      const price3MonthsAgo = closes[closes.length - 63];
      momentum12_1 = (price1MonthAgo - price3MonthsAgo) / price3MonthsAgo;
    }

    // Also calculate recent momentum for comparison (last month, for reversal)
    let momentum1M = null;
    if (closes.length >= 21) {
      const price1MonthAgo = closes[closes.length - 21];
      momentum1M = (currentPrice - price1MonthAgo) / price1MonthAgo;
    }

    return {
      price: currentPrice,
      sma20,
      sma50,
      sma200,
      rsi,
      macd,
      volumeRatio,
      priceVsSma20: (currentPrice - sma20) / sma20,
      priceVsSma50: sma50 ? (currentPrice - sma50) / sma50 : null,
      priceVsSma200: sma200 ? (currentPrice - sma200) / sma200 : null,
      trend: sma20 > sma50 ? 'bullish' : 'bearish',
      // Proper momentum metrics
      momentum12_1, // Academic momentum (skip recent month)
      momentum1M,   // Recent momentum (for reversal signals)
      momentumDivergence: momentum12_1 && momentum1M ? momentum12_1 - momentum1M : null
    };
  }

  /**
   * Get market regime based on VIX level
   */
  async getMarketRegime() {
    const vixData = await this.getVIXLevel();
    if (!vixData) return { regime: 'UNKNOWN', confidence: 0.5 };

    const vix = vixData.vix_level;

    if (vix > 35) return { regime: 'CRISIS', confidence: 0.9, vix };
    if (vix > 25) return { regime: 'HIGH_VOL', confidence: 0.8, vix };
    if (vix > 18) return { regime: 'NORMAL', confidence: 0.7, vix };
    return { regime: 'LOW_VOL', confidence: 0.75, vix };
  }

  // ========== Helper Methods ==========

  _ensureSimulationDate() {
    if (!this.simulationDate) {
      throw new Error('Simulation date not set. Call setSimulationDate() first.');
    }
  }

  _sma(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _ema(values, period) {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _rsi(values, period = 14) {
    if (values.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = values.length - period; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

module.exports = { HistoricalDataProvider };
