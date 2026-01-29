/**
 * Fear & Greed Index Fetcher
 *
 * Fetches market sentiment indicators:
 * - CNN Fear & Greed Index (scraping)
 * - Alternative.me Crypto Fear & Greed (free API)
 * - VIX-based market fear (Yahoo Finance)
 *
 * This provides macro-level market sentiment context.
 */

const cheerio = require('cheerio');

// Cache duration: 1 hour (these don't change frequently)
const CACHE_DURATION = 60 * 60 * 1000;

class FearGreedFetcher {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
    this.lastFetch = {};

    this.ensureTable();
  }

  /**
   * Get cached data or fetch fresh
   */
  async getCachedOrFetch(key, fetchFn) {
    const cached = this.cache.get(key);
    const lastFetchTime = this.lastFetch[key] || 0;

    if (cached && Date.now() - lastFetchTime < CACHE_DURATION) {
      return cached;
    }

    try {
      const data = await fetchFn();
      this.cache.set(key, data);
      this.lastFetch[key] = Date.now();
      return data;
    } catch (error) {
      console.error(`${key} fetch error:`, error.message);
      // Return cached data if available, otherwise return error state
      return cached || { value: null, label: 'unknown', error: error.message };
    }
  }

  /**
   * Fetch CNN Fear & Greed Index via scraping
   */
  async fetchCNNFearGreed() {
    return this.getCachedOrFetch('cnn_fear_greed', async () => {
      console.log('Fetching CNN Fear & Greed Index...');

      // CNN Fear & Greed API endpoint (unofficial)
      const apiUrl = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

      try {
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Referer': 'https://www.cnn.com/markets/fear-and-greed',
          },
          timeout: 15000,
        });

        if (!response.ok) {
          throw new Error(`CNN API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract current value
        const currentValue = data.fear_and_greed?.score;
        const previousClose = data.fear_and_greed?.previous_close;
        const timestamp = data.fear_and_greed?.timestamp;

        if (currentValue === undefined) {
          throw new Error('Unable to parse Fear & Greed value');
        }

        const label = this.getFearGreedLabel(currentValue);
        const change = previousClose ? currentValue - previousClose : null;

        return {
          source: 'cnn',
          value: Math.round(currentValue),
          label,
          previousValue: previousClose ? Math.round(previousClose) : null,
          change: change ? Math.round(change * 10) / 10 : null,
          timestamp: timestamp || new Date().toISOString(),
          components: this.extractComponents(data),
        };
      } catch (fetchError) {
        // Fallback: Try scraping the page directly
        console.log('Falling back to CNN page scraping...');
        return this.scrapeCNNPage();
      }
    });
  }

  /**
   * Scrape CNN Fear & Greed page as fallback
   */
  async scrapeCNNPage() {
    const pageUrl = 'https://www.cnn.com/markets/fear-and-greed';

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`CNN page error: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try to extract the value from various selectors
    let value = null;

    // Try data attribute
    const dataElement = $('[data-test-id="fear-greed-current-value"]');
    if (dataElement.length) {
      value = parseInt(dataElement.text().trim(), 10);
    }

    // Try class-based selector
    if (!value) {
      const scoreElement = $('.market-fng-gauge__dial-number-value');
      if (scoreElement.length) {
        value = parseInt(scoreElement.text().trim(), 10);
      }
    }

    // Try generic large number on page
    if (!value) {
      const numberMatch = html.match(/fear[^>]*>(\d{1,3})</i);
      if (numberMatch) {
        value = parseInt(numberMatch[1], 10);
      }
    }

    if (!value || isNaN(value)) {
      throw new Error('Unable to scrape Fear & Greed value');
    }

    return {
      source: 'cnn',
      value,
      label: this.getFearGreedLabel(value),
      previousValue: null,
      change: null,
      timestamp: new Date().toISOString(),
      components: null,
    };
  }

  /**
   * Extract Fear & Greed components
   */
  extractComponents(data) {
    if (!data.fear_and_greed_historical) return null;

    const components = {};

    // Map component names
    const componentMap = {
      market_momentum_sp500: 'Market Momentum',
      stock_price_strength: 'Stock Price Strength',
      stock_price_breadth: 'Stock Price Breadth',
      put_call_options: 'Put/Call Options',
      market_volatility_vix: 'Market Volatility (VIX)',
      safe_haven_demand: 'Safe Haven Demand',
      junk_bond_demand: 'Junk Bond Demand',
    };

    for (const [key, name] of Object.entries(componentMap)) {
      const componentData = data[key];
      if (componentData?.score !== undefined) {
        components[name] = {
          value: Math.round(componentData.score),
          label: this.getFearGreedLabel(componentData.score),
        };
      }
    }

    return Object.keys(components).length > 0 ? components : null;
  }

  /**
   * Fetch Alternative.me Crypto Fear & Greed (free API)
   */
  async fetchCryptoFearGreed() {
    return this.getCachedOrFetch('crypto_fear_greed', async () => {
      console.log('Fetching Crypto Fear & Greed Index...');

      const apiUrl = 'https://api.alternative.me/fng/?limit=1';

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'StockAnalyzer/1.0',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`Alternative.me API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.data || data.data.length === 0) {
        throw new Error('No crypto fear & greed data');
      }

      const latest = data.data[0];

      return {
        source: 'alternative.me',
        value: parseInt(latest.value, 10),
        label: latest.value_classification.toLowerCase(),
        timestamp: new Date(parseInt(latest.timestamp, 10) * 1000).toISOString(),
        nextUpdate: latest.time_until_update,
      };
    });
  }

  /**
   * Fetch VIX (Volatility Index) from Yahoo Finance
   */
  async fetchVIX() {
    return this.getCachedOrFetch('vix', async () => {
      console.log('Fetching VIX...');

      // Yahoo Finance quote endpoint
      const apiUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance error: ${response.status}`);
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        throw new Error('No VIX data');
      }

      const meta = result.meta;
      const quotes = result.indicators?.quote?.[0];

      const currentPrice = meta.regularMarketPrice;
      const previousClose = meta.previousClose;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;

      // VIX interpretation
      let fearLevel;
      if (currentPrice >= 30) fearLevel = 'extreme_fear';
      else if (currentPrice >= 25) fearLevel = 'fear';
      else if (currentPrice >= 20) fearLevel = 'caution';
      else if (currentPrice >= 15) fearLevel = 'neutral';
      else fearLevel = 'complacency';

      return {
        source: 'yahoo_finance',
        symbol: '^VIX',
        value: Math.round(currentPrice * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        fearLevel,
        timestamp: new Date().toISOString(),
        high5d: quotes?.high ? Math.max(...quotes.high.filter((v) => v != null)) : null,
        low5d: quotes?.low ? Math.min(...quotes.low.filter((v) => v != null)) : null,
      };
    });
  }

  /**
   * Fetch Put/Call Ratio from CBOE via Yahoo Finance
   * High P/C (>1.0) = bearish, Low P/C (<0.7) = bullish
   */
  async fetchPutCallRatio() {
    return this.getCachedOrFetch('put_call_ratio', async () => {
      console.log('Fetching Put/Call Ratio...');

      // Try to get equity put/call from market data
      // Using a proxy approach - estimate from VIX options or index data
      const apiUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';

      try {
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          timeout: 10000,
        });

        if (!response.ok) {
          throw new Error(`Yahoo Finance error: ${response.status}`);
        }

        const data = await response.json();
        const result = data.chart?.result?.[0];

        if (!result) {
          throw new Error('No data');
        }

        // Estimate put/call from VIX level (correlation-based approximation)
        // VIX 15 -> P/C ~0.7, VIX 25 -> P/C ~1.0, VIX 35 -> P/C ~1.3
        const vixValue = result.meta?.regularMarketPrice || 18;
        const estimatedPutCall = 0.4 + (vixValue / 50);

        return {
          source: 'estimated',
          value: Math.round(estimatedPutCall * 100) / 100,
          label: estimatedPutCall > 1.0 ? 'bearish' : estimatedPutCall < 0.7 ? 'bullish' : 'neutral',
          timestamp: new Date().toISOString(),
          note: 'Estimated from VIX correlation',
        };
      } catch (error) {
        // Default neutral value
        return {
          source: 'default',
          value: 0.85,
          label: 'neutral',
          timestamp: new Date().toISOString(),
          error: error.message,
        };
      }
    });
  }

  /**
   * Fetch High Yield Credit Spread (HY OAS)
   * Spread > 5% = stress, < 3% = complacency
   */
  async fetchHighYieldSpread() {
    return this.getCachedOrFetch('high_yield_spread', async () => {
      console.log('Fetching High Yield Spread...');

      // Try HYG (high yield ETF) vs LQD (investment grade) as proxy
      try {
        const [hygResponse, lqdResponse] = await Promise.all([
          fetch('https://query1.finance.yahoo.com/v8/finance/chart/HYG?interval=1d&range=5d', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            timeout: 10000,
          }),
          fetch('https://query1.finance.yahoo.com/v8/finance/chart/LQD?interval=1d&range=5d', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
            timeout: 10000,
          }),
        ]);

        if (!hygResponse.ok || !lqdResponse.ok) {
          throw new Error('Failed to fetch bond ETFs');
        }

        const hygData = await hygResponse.json();
        const lqdData = await lqdResponse.json();

        const hygPrice = hygData.chart?.result?.[0]?.meta?.regularMarketPrice;
        const lqdPrice = lqdData.chart?.result?.[0]?.meta?.regularMarketPrice;

        if (!hygPrice || !lqdPrice) {
          throw new Error('No bond ETF data');
        }

        // Approximate spread from price ratio changes
        // This is a rough proxy - actual OAS would require FRED data
        // HYG/LQD ratio declining = spreads widening
        const ratio = hygPrice / lqdPrice;
        // Typical ratio is ~0.65-0.75, lower = wider spreads
        // Convert to approximate OAS spread (3-7% typical range)
        const estimatedSpread = 8.0 - (ratio * 6.0);

        let label;
        if (estimatedSpread > 5.0) label = 'stress';
        else if (estimatedSpread > 4.0) label = 'elevated';
        else if (estimatedSpread > 3.0) label = 'normal';
        else label = 'tight';

        return {
          source: 'etf_proxy',
          value: Math.round(estimatedSpread * 100) / 100,
          label,
          hygPrice: Math.round(hygPrice * 100) / 100,
          lqdPrice: Math.round(lqdPrice * 100) / 100,
          timestamp: new Date().toISOString(),
          note: 'Estimated from HYG/LQD ratio',
        };
      } catch (error) {
        // Default normal spread
        return {
          source: 'default',
          value: 3.5,
          label: 'normal',
          timestamp: new Date().toISOString(),
          error: error.message,
        };
      }
    });
  }

  /**
   * Calculate advance/decline ratio from market data
   */
  async fetchAdvanceDecline() {
    return this.getCachedOrFetch('advance_decline', async () => {
      console.log('Calculating Advance/Decline from database...');

      try {
        // Calculate from our price data - stocks up vs down today
        const result = this.db.prepare(`
          WITH latest_prices AS (
            SELECT
              dp.company_id,
              dp.close as current_close,
              LAG(dp.close) OVER (PARTITION BY dp.company_id ORDER BY dp.date) as prev_close
            FROM daily_prices dp
            WHERE dp.date >= date('now', '-5 days')
          )
          SELECT
            SUM(CASE WHEN current_close > prev_close THEN 1 ELSE 0 END) as advances,
            SUM(CASE WHEN current_close < prev_close THEN 1 ELSE 0 END) as declines,
            SUM(CASE WHEN current_close = prev_close THEN 1 ELSE 0 END) as unchanged
          FROM latest_prices
          WHERE prev_close IS NOT NULL
        `).get();

        if (!result || !result.advances) {
          throw new Error('No price data for A/D calculation');
        }

        const ratio = result.declines > 0 ? result.advances / result.declines : result.advances;
        const netAdvances = result.advances - result.declines;

        let label;
        if (ratio > 2.0) label = 'very_bullish';
        else if (ratio > 1.5) label = 'bullish';
        else if (ratio > 1.0) label = 'slightly_bullish';
        else if (ratio > 0.67) label = 'slightly_bearish';
        else if (ratio > 0.5) label = 'bearish';
        else label = 'very_bearish';

        return {
          source: 'database',
          value: Math.round(ratio * 100) / 100,
          advances: result.advances,
          declines: result.declines,
          unchanged: result.unchanged,
          netAdvances,
          label,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          source: 'default',
          value: 1.0,
          label: 'neutral',
          timestamp: new Date().toISOString(),
          error: error.message,
        };
      }
    });
  }

  /**
   * Get all market sentiment indicators
   */
  async fetchAllIndicators() {
    console.log('Fetching all market sentiment indicators...');

    const [cnnFearGreed, cryptoFearGreed, vix, putCallRatio, highYieldSpread, advanceDecline] = await Promise.all([
      this.fetchCNNFearGreed().catch((e) => ({ source: 'cnn', error: e.message })),
      this.fetchCryptoFearGreed().catch((e) => ({ source: 'crypto', error: e.message })),
      this.fetchVIX().catch((e) => ({ source: 'vix', error: e.message })),
      this.fetchPutCallRatio().catch((e) => ({ source: 'put_call', error: e.message })),
      this.fetchHighYieldSpread().catch((e) => ({ source: 'hy_spread', error: e.message })),
      this.fetchAdvanceDecline().catch((e) => ({ source: 'ad_ratio', error: e.message })),
    ]);

    const result = {
      cnn: cnnFearGreed,
      crypto: cryptoFearGreed,
      vix,
      putCallRatio,
      highYieldSpread,
      advanceDecline,
      overall: this.calculateOverallSentiment(cnnFearGreed, vix),
      timestamp: new Date().toISOString(),
    };

    // Store in database
    await this.storeMarketSentiment(result);

    return result;
  }

  /**
   * Calculate overall market sentiment from indicators
   */
  calculateOverallSentiment(cnn, vix) {
    const scores = [];
    const weights = [];

    // CNN Fear & Greed (0-100, higher = greed)
    if (cnn?.value !== undefined && !cnn.error) {
      // Normalize to -1 to 1 scale
      scores.push((cnn.value - 50) / 50);
      weights.push(0.6); // Primary weight
    }

    // VIX (inverse - high VIX = fear)
    if (vix?.value !== undefined && !vix.error) {
      // VIX typically ranges 10-40, normalize inverse
      const normalizedVix = Math.max(0, Math.min(1, (30 - vix.value) / 20));
      scores.push(normalizedVix * 2 - 1); // Convert to -1 to 1
      weights.push(0.4);
    }

    if (scores.length === 0) {
      return { sentiment: 0, label: 'unknown', confidence: 0 };
    }

    // Weighted average
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);
    const sentiment = weightedSum / totalWeight;

    // Determine label
    let label;
    if (sentiment >= 0.5) label = 'extreme_greed';
    else if (sentiment >= 0.25) label = 'greed';
    else if (sentiment >= 0.05) label = 'slight_greed';
    else if (sentiment <= -0.5) label = 'extreme_fear';
    else if (sentiment <= -0.25) label = 'fear';
    else if (sentiment <= -0.05) label = 'slight_fear';
    else label = 'neutral';

    return {
      sentiment: Math.round(sentiment * 1000) / 1000,
      label,
      confidence: Math.min(scores.length / 2, 1),
      sourcesUsed: scores.length,
    };
  }

  /**
   * Get Fear & Greed label from value (0-100)
   */
  getFearGreedLabel(value) {
    if (value >= 75) return 'extreme_greed';
    if (value >= 55) return 'greed';
    if (value >= 45) return 'neutral';
    if (value >= 25) return 'fear';
    return 'extreme_fear';
  }

  /**
   * Store market sentiment in database
   */
  async storeMarketSentiment(data) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO market_sentiment (
          indicator_type, indicator_value, indicator_label, components,
          previous_value, change_value, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      // Store CNN Fear & Greed
      if (data.cnn && !data.cnn.error) {
        stmt.run(
          'cnn_fear_greed',
          data.cnn.value,
          data.cnn.label,
          data.cnn.components ? JSON.stringify(data.cnn.components) : null,
          data.cnn.previousValue,
          data.cnn.change
        );
      }

      // Store VIX
      if (data.vix && !data.vix.error) {
        stmt.run(
          'vix',
          data.vix.value,
          data.vix.fearLevel,
          null,
          data.vix.previousClose,
          data.vix.change
        );
      }

      // Store Put/Call Ratio
      if (data.putCallRatio && !data.putCallRatio.error) {
        stmt.run(
          'put_call_ratio',
          data.putCallRatio.value,
          data.putCallRatio.label,
          JSON.stringify({ source: data.putCallRatio.source, note: data.putCallRatio.note }),
          null,
          null
        );
      }

      // Store High Yield Spread
      if (data.highYieldSpread && !data.highYieldSpread.error) {
        stmt.run(
          'high_yield_spread',
          data.highYieldSpread.value,
          data.highYieldSpread.label,
          JSON.stringify({ hygPrice: data.highYieldSpread.hygPrice, lqdPrice: data.highYieldSpread.lqdPrice }),
          null,
          null
        );
      }

      // Store Advance/Decline
      if (data.advanceDecline && !data.advanceDecline.error) {
        stmt.run(
          'advance_decline',
          data.advanceDecline.value,
          data.advanceDecline.label,
          JSON.stringify({ advances: data.advanceDecline.advances, declines: data.advanceDecline.declines }),
          null,
          data.advanceDecline.netAdvances
        );
      }

      // Store overall
      if (data.overall) {
        stmt.run(
          'overall_market',
          data.overall.sentiment,
          data.overall.label,
          JSON.stringify({ sourcesUsed: data.overall.sourcesUsed }),
          null,
          null
        );
      }
    } catch (error) {
      console.error('Error storing market sentiment:', error.message);
    }
  }

  /**
   * Get latest market sentiment from database
   */
  getLatestSentiment() {
    const results = {};

    const types = ['cnn_fear_greed', 'vix', 'overall_market'];
    for (const type of types) {
      const row = this.db
        .prepare(
          `
        SELECT * FROM market_sentiment
        WHERE indicator_type = ?
        ORDER BY fetched_at DESC
        LIMIT 1
      `
        )
        .get(type);

      if (row) {
        results[type] = {
          value: row.indicator_value,
          label: row.indicator_label,
          previousValue: row.previous_value,
          change: row.change_value,
          components: row.components ? JSON.parse(row.components) : null,
          fetchedAt: row.fetched_at,
        };
      }
    }

    return results;
  }

  /**
   * Get sentiment history
   */
  getSentimentHistory(indicatorType, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db
      .prepare(
        `
      SELECT
        DATE(fetched_at) as date,
        AVG(indicator_value) as avg_value,
        MIN(indicator_value) as min_value,
        MAX(indicator_value) as max_value
      FROM market_sentiment
      WHERE indicator_type = ?
        AND fetched_at >= ?
      GROUP BY DATE(fetched_at)
      ORDER BY date DESC
    `
      )
      .all(indicatorType, cutoff.toISOString());
  }

  /**
   * Ensure market sentiment table exists
   */
  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_sentiment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        indicator_type TEXT NOT NULL,
        indicator_value REAL,
        indicator_label TEXT,
        components TEXT,
        previous_value REAL,
        change_value REAL,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_market_sentiment_type ON market_sentiment(indicator_type);
      CREATE INDEX IF NOT EXISTS idx_market_sentiment_date ON market_sentiment(fetched_at DESC);
    `);
  }
}

module.exports = FearGreedFetcher;
