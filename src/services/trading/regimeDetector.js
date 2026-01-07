/**
 * Market Regime Detector
 *
 * Classifies current market conditions to help adjust trading aggressiveness.
 * Provides regime classification for Agent 2 (Trading Logic) to consume.
 *
 * Regimes:
 * - BULL: Trending up, low volatility
 * - BEAR: Trending down, high volatility
 * - SIDEWAYS: Range-bound
 * - HIGH_VOL: VIX > 25, elevated uncertainty
 * - CRISIS: VIX > 30, extreme conditions
 */

const REGIMES = {
  BULL: 'BULL',
  BEAR: 'BEAR',
  SIDEWAYS: 'SIDEWAYS',
  HIGH_VOL: 'HIGH_VOL',
  CRISIS: 'CRISIS',
};

// Regime descriptions for UI
const REGIME_DESCRIPTIONS = {
  BULL: 'Bullish trend with broad participation - favorable for long positions',
  BEAR: 'Bearish trend with weak breadth - defensive posture recommended',
  SIDEWAYS: 'Range-bound market - focus on mean reversion strategies',
  HIGH_VOL: 'Elevated volatility - reduce position sizes',
  CRISIS: 'Extreme volatility - defensive posture, minimal new positions',
};

class RegimeDetector {
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;

    // Cache settings
    this.cache = new Map();
    this.cacheTTL = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Detect current market regime
   * @param {number} lookbackDays - Days of history to analyze
   * @returns {MarketRegime}
   */
  async detectRegime(lookbackDays = 60) {
    // Check cache first
    const cached = this.getCached('current_regime');
    if (cached) {
      return cached;
    }

    // Get SPY data for market-wide analysis
    const spyPrices = await this.getPrices('SPY', lookbackDays);

    if (!spyPrices || spyPrices.length < 50) {
      return this.createDefaultRegime('Insufficient SPY price data');
    }

    // Get market indicators (with fallbacks for missing data)
    const vix = await this.getVIX();
    const breadth = await this.getMarketBreadth();
    const putCallRatio = await this.getPutCallRatio();
    const creditSpread = await this.getCreditSpread();

    // Calculate indicators from price data
    const closes = spyPrices.map(p => p.close);
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = closes.length >= 200 ? this.calculateSMA(closes, 200) : null;
    const volatility = this.calculateVolatility(spyPrices, 20);

    const currentPrice = closes[closes.length - 1];

    // Classify with all available indicators
    const regime = this.classify({
      currentPrice,
      sma20,
      sma50,
      sma200,
      volatility,
      breadth,
      vix,
      putCallRatio,
      creditSpread,
    });

    // Add SPY context
    regime.spy = {
      price: currentPrice,
      sma20,
      sma50,
      sma200,
    };

    // Store for history
    await this.storeRegime(regime);

    // Cache the result
    this.setCache('current_regime', regime);

    return regime;
  }

  /**
   * Classify market regime based on indicators
   * Enhanced with additional indicators when available
   */
  classify({ currentPrice, sma20, sma50, sma200, volatility, breadth, vix, putCallRatio, creditSpread }) {
    const trendStrength = sma50 > 0 ? (sma20 - sma50) / sma50 : 0;

    // Track which indicators are available for confidence adjustment
    const indicatorsAvailable = {
      vix: vix !== null && vix !== undefined,
      breadth: breadth !== null && breadth !== undefined,
      putCall: putCallRatio !== null && putCallRatio !== undefined,
      credit: creditSpread !== null && creditSpread !== undefined,
    };
    const indicatorCount = Object.values(indicatorsAvailable).filter(Boolean).length;

    // High volatility overrides (VIX-based)
    if (vix > 30) {
      return {
        regime: REGIMES.CRISIS,
        confidence: Math.min(0.7 + (indicatorCount * 0.05), 0.95),
        vix,
        breadth,
        putCallRatio,
        creditSpread,
        trendStrength,
        volatility,
        indicatorsUsed: indicatorsAvailable,
        description: REGIME_DESCRIPTIONS.CRISIS,
        timestamp: new Date().toISOString(),
      };
    }

    // Credit spread stress check (if available)
    if (creditSpread && creditSpread > 5.0) {
      return {
        regime: REGIMES.CRISIS,
        confidence: 0.85,
        vix,
        breadth,
        putCallRatio,
        creditSpread,
        trendStrength,
        volatility,
        indicatorsUsed: indicatorsAvailable,
        description: 'Credit stress detected - high yield spreads elevated',
        timestamp: new Date().toISOString(),
      };
    }

    if (vix > 25) {
      return {
        regime: REGIMES.HIGH_VOL,
        confidence: Math.min(0.6 + (indicatorCount * 0.05), 0.9),
        vix,
        breadth,
        putCallRatio,
        creditSpread,
        trendStrength,
        volatility,
        indicatorsUsed: indicatorsAvailable,
        description: REGIME_DESCRIPTIONS.HIGH_VOL,
        timestamp: new Date().toISOString(),
      };
    }

    // Put/Call ratio extreme check (if available)
    // High put/call (>1.2) = bearish sentiment, Low (<0.7) = bullish
    let sentimentAdjustment = 0;
    if (putCallRatio) {
      if (putCallRatio > 1.2) sentimentAdjustment = -0.02; // More bearish
      if (putCallRatio < 0.7) sentimentAdjustment = 0.02;  // More bullish
    }

    // Trend-based classification with enhanced signals
    const adjustedTrend = trendStrength + sentimentAdjustment;

    if (adjustedTrend > 0.03 && breadth > 55) {
      return {
        regime: REGIMES.BULL,
        confidence: Math.min(0.4 + adjustedTrend * 5 + (indicatorCount * 0.05), 0.95),
        vix,
        breadth,
        putCallRatio,
        creditSpread,
        trendStrength,
        volatility,
        indicatorsUsed: indicatorsAvailable,
        description: REGIME_DESCRIPTIONS.BULL,
        timestamp: new Date().toISOString(),
      };
    }

    if (adjustedTrend < -0.03 && breadth < 45) {
      return {
        regime: REGIMES.BEAR,
        confidence: Math.min(0.4 + Math.abs(adjustedTrend) * 5 + (indicatorCount * 0.05), 0.95),
        vix,
        breadth,
        putCallRatio,
        creditSpread,
        trendStrength,
        volatility,
        indicatorsUsed: indicatorsAvailable,
        description: REGIME_DESCRIPTIONS.BEAR,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      regime: REGIMES.SIDEWAYS,
      confidence: Math.min(0.5 + (indicatorCount * 0.05), 0.75),
      vix,
      breadth,
      putCallRatio,
      creditSpread,
      trendStrength,
      volatility,
      indicatorsUsed: indicatorsAvailable,
      description: REGIME_DESCRIPTIONS.SIDEWAYS,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get price data for a symbol
   */
  async getPrices(symbol, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    try {
      const company = this.db.prepare(`
        SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
      `).get(symbol);

      if (!company) {
        console.log(`RegimeDetector: Company ${symbol} not found`);
        return null;
      }

      const prices = this.db.prepare(`
        SELECT date, open, high, low, close, volume
        FROM daily_prices
        WHERE company_id = ?
          AND date >= ?
        ORDER BY date ASC
      `).all(company.id, cutoffStr);

      return prices;
    } catch (error) {
      console.error(`Error fetching prices for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get VIX value
   * First checks market_sentiment table, then falls back to a default
   */
  async getVIX() {
    // Check cache
    const cached = this.getCached('vix');
    if (cached !== null) {
      return cached;
    }

    try {
      // Try to get from market_sentiment table
      const result = this.db.prepare(`
        SELECT indicator_value
        FROM market_sentiment
        WHERE indicator_type = 'vix'
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get();

      if (result && result.indicator_value) {
        const vix = result.indicator_value;
        this.setCache('vix', vix);
        return vix;
      }

      // Try fear/greed as proxy (0-100 scale, invert for VIX-like behavior)
      const fearGreed = this.db.prepare(`
        SELECT indicator_value
        FROM market_sentiment
        WHERE indicator_type = 'cnn_fear_greed'
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get();

      if (fearGreed && fearGreed.indicator_value !== null) {
        // Convert fear/greed (0=extreme fear, 100=extreme greed) to VIX-like (higher = more fear)
        // Fear = 0-25 -> VIX ~25-35
        // Neutral = 45-55 -> VIX ~15-20
        // Greed = 75-100 -> VIX ~10-15
        const fg = fearGreed.indicator_value;
        const estimatedVix = 30 - (fg * 0.2); // Rough approximation
        this.setCache('vix', estimatedVix);
        return estimatedVix;
      }

      // Default to normal volatility
      this.setCache('vix', 18);
      return 18;
    } catch (error) {
      console.error('Error fetching VIX:', error.message);
      return 18; // Default to normal volatility
    }
  }

  /**
   * Get Put/Call ratio from market_sentiment table
   * Returns null if not available (graceful degradation)
   */
  async getPutCallRatio() {
    try {
      const result = this.db.prepare(`
        SELECT indicator_value
        FROM market_sentiment
        WHERE indicator_type = 'put_call_ratio'
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get();

      return result?.indicator_value || null;
    } catch (error) {
      // Graceful degradation - indicator not critical
      return null;
    }
  }

  /**
   * Get High Yield credit spread from market_sentiment table
   * Returns null if not available (graceful degradation)
   */
  async getCreditSpread() {
    try {
      const result = this.db.prepare(`
        SELECT indicator_value
        FROM market_sentiment
        WHERE indicator_type = 'high_yield_spread'
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get();

      return result?.indicator_value || null;
    } catch (error) {
      // Graceful degradation - indicator not critical
      return null;
    }
  }

  /**
   * Calculate market breadth - percentage of stocks above their 50-day MA
   */
  async getMarketBreadth() {
    // Check cache
    const cached = this.getCached('breadth');
    if (cached !== null) {
      return cached;
    }

    try {
      // Calculate from actual price data
      const result = this.db.prepare(`
        WITH stock_smas AS (
          SELECT
            dp.company_id,
            dp.close as current_close,
            (
              SELECT AVG(dp2.close)
              FROM daily_prices dp2
              WHERE dp2.company_id = dp.company_id
                AND dp2.date <= dp.date
              ORDER BY dp2.date DESC
              LIMIT 50
            ) as sma_50
          FROM daily_prices dp
          INNER JOIN (
            SELECT company_id, MAX(date) as max_date
            FROM daily_prices
            GROUP BY company_id
          ) latest ON dp.company_id = latest.company_id AND dp.date = latest.max_date
        )
        SELECT
          COUNT(CASE WHEN current_close > sma_50 THEN 1 END) * 100.0 / COUNT(*) as breadth
        FROM stock_smas
        WHERE sma_50 IS NOT NULL
      `).get();

      const breadth = result?.breadth || 50;
      this.setCache('breadth', breadth);
      return breadth;
    } catch (error) {
      console.error('Error calculating market breadth:', error.message);
      return 50; // Default to neutral
    }
  }

  /**
   * Calculate Simple Moving Average
   */
  calculateSMA(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Calculate annualized volatility
   */
  calculateVolatility(prices, period) {
    if (prices.length < period + 1) return null;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const ret = (prices[i].close - prices[i - 1].close) / prices[i - 1].close;
      returns.push(ret);
    }

    const recentReturns = returns.slice(-period);
    const mean = recentReturns.reduce((a, b) => a + b, 0) / period;
    const variance = recentReturns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / period;

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  /**
   * Store regime in database
   */
  async storeRegime(regime) {
    const today = new Date().toISOString().split('T')[0];

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO market_regimes (
          date, regime, confidence, vix, breadth_pct, sma_spread,
          volatility_20d, spy_price, spy_sma20, spy_sma50, spy_sma200,
          trend_strength, description, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        today,
        regime.regime,
        regime.confidence,
        regime.vix,
        regime.breadth,
        regime.trendStrength,
        regime.volatility,
        regime.spy?.price || null,
        regime.spy?.sma20 || null,
        regime.spy?.sma50 || null,
        regime.spy?.sma200 || null,
        regime.trendStrength,
        regime.description
      );
    } catch (error) {
      console.error('Error storing regime:', error.message);
    }
  }

  /**
   * Get regime history
   */
  async getRegimeHistory(days = 30) {
    try {
      return this.db.prepare(`
        SELECT * FROM market_regimes
        WHERE date >= date('now', '-' || ? || ' days')
        ORDER BY date DESC
      `).all(days);
    } catch (error) {
      console.error('Error fetching regime history:', error.message);
      return [];
    }
  }

  /**
   * Get the most recent stored regime (for fast lookups)
   */
  getStoredRegime() {
    try {
      return this.db.prepare(`
        SELECT * FROM market_regimes
        ORDER BY date DESC
        LIMIT 1
      `).get();
    } catch (error) {
      console.error('Error fetching stored regime:', error.message);
      return null;
    }
  }

  /**
   * Create a default regime when data is insufficient
   */
  createDefaultRegime(reason) {
    return {
      regime: REGIMES.SIDEWAYS,
      confidence: 0.3,
      vix: 18,
      breadth: 50,
      trendStrength: 0,
      volatility: 0.15,
      description: `${REGIME_DESCRIPTIONS.SIDEWAYS} (${reason})`,
      timestamp: new Date().toISOString(),
      isDefault: true,
    };
  }

  // Cache helpers
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = { RegimeDetector, REGIMES, REGIME_DESCRIPTIONS };
