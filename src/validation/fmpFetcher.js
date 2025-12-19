/**
 * Financial Modeling Prep (FMP) Data Fetcher
 *
 * Fetches financial metrics from FMP API for validation and data enrichment.
 * Includes rate limiting and error handling.
 *
 * API Limit: 250 calls/day on free tier
 *
 * Key endpoints used:
 * - /ratios-ttm - TTM financial ratios
 * - /key-metrics-ttm - TTM key metrics
 * - /financial-scores - Altman Z-Score, Piotroski Score
 * - /quote - Current stock quote (price, market cap)
 */

const https = require('https');

class FMPFetcher {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.FMP_API_KEY;
    // Use stable API format (symbol as query param)
    // Note: v3 API was deprecated after August 31, 2025
    this.baseUrl = 'https://financialmodelingprep.com/stable';
    this.delay = options.delay || 1500; // ms between requests (1.5s to stay under ~40 req/min limit)
    this.maxRetries = options.maxRetries || 3;
    this.lastRequest = 0;
    this.callCount = 0;
    this.dailyLimit = 250;

    if (!this.apiKey) {
      console.warn('⚠️  FMP API key not set. Set FMP_API_KEY environment variable or pass apiKey option.');
    }
  }

  /**
   * Rate limiter - ensures we don't exceed API limits
   */
  async rateLimit() {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.delay) {
      await new Promise(r => setTimeout(r, this.delay - elapsed));
    }
    this.lastRequest = Date.now();
  }

  /**
   * Make HTTP request to FMP API
   * Stable API format: /endpoint?symbol=SYMBOL&apikey=KEY
   */
  async request(endpoint, symbol) {
    await this.rateLimit();

    // Stable format: symbol as query param
    const url = `${this.baseUrl}${endpoint}?symbol=${symbol}&apikey=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          this.callCount++;

          // Check HTTP status
          if (res.statusCode === 403) {
            reject(new Error('API access denied (403). Check if API key is valid and activated.'));
            return;
          }
          if (res.statusCode === 429) {
            reject(new Error('Rate limit exceeded (429). Try again later.'));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
            return;
          }

          try {
            const json = JSON.parse(data);

            // Check for API errors
            if (json['Error Message']) {
              reject(new Error(json['Error Message']));
              return;
            }

            resolve(json);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
          }
        });
      }).on('error', (e) => {
        reject(new Error(`Network error: ${e.message}`));
      });
    });
  }

  /**
   * Fetch all metrics for a single company
   * Uses 3-4 API calls per company:
   * - ratios-ttm (profitability, liquidity, leverage ratios)
   * - key-metrics-ttm (valuation metrics)
   * - financial-scores (Altman Z, Piotroski)
   * - quote (current price, market cap)
   *
   * @param {string} symbol - Stock symbol
   * @returns {Object} Metrics data or error
   */
  async fetchMetrics(symbol) {
    if (!this.apiKey) {
      return { symbol, success: false, error: 'API key not configured' };
    }

    const startCalls = this.callCount;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Fetch data sequentially to avoid rate limits
        // Stable API format: /endpoint?symbol=SYMBOL
        const ratios = await this.request('/ratios-ttm', symbol).catch((e) => { console.log(`  ratios-ttm error: ${e.message}`); return []; });
        const keyMetrics = await this.request('/key-metrics-ttm', symbol).catch((e) => { console.log(`  key-metrics-ttm error: ${e.message}`); return []; });
        const scores = await this.request('/score', symbol).catch((e) => { console.log(`  score error: ${e.message}`); return []; });
        const quote = await this.request('/quote', symbol).catch((e) => { console.log(`  quote error: ${e.message}`); return []; });

        const r = (Array.isArray(ratios) ? ratios[0] : ratios) || {};
        const k = (Array.isArray(keyMetrics) ? keyMetrics[0] : keyMetrics) || {};
        const s = (Array.isArray(scores) ? scores[0] : scores) || {};
        const q = (Array.isArray(quote) ? quote[0] : quote) || {};

        // Check if we got any meaningful data
        if (!r.returnOnEquityTTM && !k.peRatioTTM && !q.price) {
          return {
            symbol,
            success: false,
            error: 'No data available from FMP for this symbol',
            timestamp: new Date().toISOString(),
            apiCalls: this.callCount - startCalls,
          };
        }

        // Transform to match our format
        return {
          symbol,
          success: true,
          timestamp: new Date().toISOString(),
          apiCalls: this.callCount - startCalls,
          data: {
            // Profitability metrics (FMP returns as decimals, convert to percentages)
            roe: this.toPercent(r.returnOnEquityTTM),
            roa: this.toPercent(r.returnOnAssetsTTM),
            roic: this.toPercent(r.returnOnCapitalEmployedTTM), // ROCE, similar to ROIC
            gross_margin: this.toPercent(r.grossProfitMarginTTM),
            operating_margin: this.toPercent(r.operatingProfitMarginTTM),
            net_margin: this.toPercent(r.netProfitMarginTTM),

            // Liquidity ratios
            current_ratio: this.toNumber(r.currentRatioTTM),
            quick_ratio: this.toNumber(r.quickRatioTTM),
            cash_ratio: this.toNumber(r.cashRatioTTM),

            // Leverage ratios
            debt_to_equity: this.toNumber(r.debtEquityRatioTTM),
            debt_to_assets: this.toNumber(r.debtRatioTTM),
            interest_coverage: this.toNumber(r.interestCoverageTTM),

            // Efficiency ratios
            asset_turnover: this.toNumber(r.assetTurnoverTTM),
            inventory_turnover: this.toNumber(r.inventoryTurnoverTTM),
            receivables_turnover: this.toNumber(r.receivablesTurnoverTTM),

            // Valuation metrics
            pe_ratio: this.toNumber(r.priceEarningsRatioTTM) || this.toNumber(k.peRatioTTM),
            pb_ratio: this.toNumber(r.priceToBookRatioTTM) || this.toNumber(k.pbRatioTTM),
            ps_ratio: this.toNumber(r.priceToSalesRatioTTM) || this.toNumber(k.priceToSalesRatioTTM),
            peg_ratio: this.toNumber(r.priceEarningsToGrowthRatioTTM),
            ev_ebitda: this.toNumber(k.enterpriseValueOverEBITDATTM),
            price_to_fcf: this.toNumber(r.priceToFreeCashFlowsRatioTTM),

            // Cash flow metrics
            fcf_yield: this.toPercent(k.freeCashFlowYieldTTM),
            fcf_per_share: this.toNumber(k.freeCashFlowPerShareTTM),
            operating_cf_per_share: this.toNumber(k.operatingCashFlowPerShareTTM),

            // Per share metrics
            eps: this.toNumber(k.netIncomePerShareTTM),
            book_value_per_share: this.toNumber(k.bookValuePerShareTTM),
            revenue_per_share: this.toNumber(k.revenuePerShareTTM),

            // Financial scores
            altman_z_score: this.toNumber(s.altmanZScore),
            piotroski_score: this.toNumber(s.piotroskiScore),

            // Market data from quote
            price: this.toNumber(q.price),
            market_cap: this.toNumber(q.marketCap),
            beta: this.toNumber(q.beta) || this.toNumber(k.betaTTM),
            avg_volume: this.toNumber(q.avgVolume),

            // Growth metrics (if available)
            earnings_growth: this.toPercent(q.eps ? null : null), // Not directly available in TTM
            revenue_growth: null, // Need historical data for growth

            // Dividend metrics
            dividend_yield: this.toPercent(r.dividendYieldTTM) || this.toPercent(k.dividendYieldTTM),
            payout_ratio: this.toPercent(r.payoutRatioTTM),
          },
          raw: {
            ratios: r,
            keyMetrics: k,
            scores: s,
            quote: q,
          }
        };

      } catch (error) {
        if (attempt === this.maxRetries) {
          return {
            symbol,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            apiCalls: this.callCount - startCalls,
          };
        }

        // Wait before retry with exponential backoff
        await new Promise(r => setTimeout(r, this.delay * attempt * 2));
      }
    }
  }

  /**
   * Fetch financial scores only (Altman Z-Score, Piotroski Score)
   * Uses 1 API call
   */
  async fetchScores(symbol) {
    if (!this.apiKey) {
      return { symbol, success: false, error: 'API key not configured' };
    }

    try {
      const scores = await this.request('/score', symbol);
      const s = Array.isArray(scores) ? scores[0] : scores || {};

      return {
        symbol,
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          altman_z_score: this.toNumber(s.altmanZScore),
          piotroski_score: this.toNumber(s.piotroskiScore),
        },
        raw: s,
      };
    } catch (error) {
      return { symbol, success: false, error: error.message };
    }
  }

  /**
   * Fetch current quote (price, market cap)
   * Uses 1 API call
   */
  async fetchQuote(symbol) {
    if (!this.apiKey) {
      return { symbol, success: false, error: 'API key not configured' };
    }

    try {
      const quote = await this.request('/quote', symbol);
      const q = Array.isArray(quote) ? quote[0] : quote || {};

      return {
        symbol,
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          price: this.toNumber(q.price),
          market_cap: this.toNumber(q.marketCap),
          volume: this.toNumber(q.volume),
          avg_volume: this.toNumber(q.avgVolume),
          change: this.toNumber(q.change),
          change_percent: this.toNumber(q.changesPercentage),
          day_high: this.toNumber(q.dayHigh),
          day_low: this.toNumber(q.dayLow),
          year_high: this.toNumber(q.yearHigh),
          year_low: this.toNumber(q.yearLow),
          pe: this.toNumber(q.pe),
          eps: this.toNumber(q.eps),
        },
        raw: q,
      };
    } catch (error) {
      return { symbol, success: false, error: error.message };
    }
  }

  /**
   * Convert decimal to percentage (0.15 -> 15)
   */
  toPercent(value) {
    if (value == null || isNaN(value)) return null;
    return value * 100;
  }

  /**
   * Safely convert to number
   */
  toNumber(value) {
    if (value == null || isNaN(value)) return null;
    return Number(value);
  }

  /**
   * Fetch metrics for multiple companies with progress callback
   * @param {Array} symbols - Array of stock symbols
   * @param {Function} onProgress - Progress callback
   * @returns {Array} Array of results
   */
  async fetchMultiple(symbols, onProgress = () => {}) {
    const results = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const result = await this.fetchMetrics(symbol);
      results.push(result);

      onProgress({
        current: i + 1,
        total: symbols.length,
        symbol,
        success: result.success,
        apiCalls: this.callCount,
        remainingCalls: this.dailyLimit - this.callCount,
      });

      // Warn if approaching daily limit
      if (this.callCount >= this.dailyLimit - 10) {
        console.warn(`⚠️  Approaching daily API limit: ${this.callCount}/${this.dailyLimit}`);
      }
    }

    return results;
  }

  /**
   * Get estimated API calls for fetching N symbols
   */
  estimateCalls(count) {
    const callsPerSymbol = 4; // ratios, keyMetrics, scores, quote
    return {
      totalCalls: count * callsPerSymbol,
      remainingAfter: this.dailyLimit - this.callCount - (count * callsPerSymbol),
      canFetch: (count * callsPerSymbol) <= (this.dailyLimit - this.callCount),
    };
  }

  /**
   * Get current API usage stats
   */
  getUsageStats() {
    return {
      callsMade: this.callCount,
      dailyLimit: this.dailyLimit,
      remaining: this.dailyLimit - this.callCount,
      percentUsed: ((this.callCount / this.dailyLimit) * 100).toFixed(1),
    };
  }

  /**
   * Reset call counter (for testing or new day)
   */
  resetCallCounter() {
    this.callCount = 0;
  }
}

module.exports = FMPFetcher;
