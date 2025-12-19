/**
 * Yahoo Finance Data Fetcher
 *
 * Fetches financial metrics from Yahoo Finance for validation.
 * Includes rate limiting and error handling.
 */

class YahooFetcher {
  constructor(options = {}) {
    this.delay = options.delay || 500; // ms between requests
    this.maxRetries = options.maxRetries || 3;
    this.lastRequest = 0;
    this.yahooFinance = null;
    this.initialized = false;
  }

  /**
   * Initialize Yahoo Finance library (lazy loading for ESM)
   */
  async init() {
    if (!this.initialized) {
      // yahoo-finance2 v3.x is an ESM module requiring instantiation
      const yf = await import('yahoo-finance2');
      // v3.x requires creating an instance
      const YahooFinance = yf.default;
      this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
      this.initialized = true;
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
   * Fetch metrics for a single company
   * @param {string} symbol - Stock symbol
   * @returns {Object} Metrics data or error
   */
  async fetchMetrics(symbol) {
    await this.init();
    await this.rateLimit();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.yahooFinance.quoteSummary(symbol, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail']
        });

        const fd = result.financialData || {};
        const ks = result.defaultKeyStatistics || {};
        const sd = result.summaryDetail || {};

        // Transform Yahoo values to match our format (percentages as whole numbers)
        return {
          symbol,
          success: true,
          timestamp: new Date().toISOString(),
          data: {
            // Profitability metrics (Yahoo returns as decimals, we store as percentages)
            roe: this.toPercent(fd.returnOnEquity),
            roa: this.toPercent(fd.returnOnAssets),
            gross_margin: this.toPercent(fd.grossMargins),
            operating_margin: this.toPercent(fd.operatingMargins),
            net_margin: this.toPercent(fd.profitMargins),

            // Liquidity ratios (already as ratios)
            current_ratio: this.toNumber(fd.currentRatio),
            quick_ratio: this.toNumber(fd.quickRatio),

            // Leverage (Yahoo returns as percentage, we store as ratio)
            debt_to_equity: fd.debtToEquity != null ? fd.debtToEquity / 100 : null,

            // Valuation metrics
            pe_ratio: this.toNumber(ks.trailingPE) || this.toNumber(sd.trailingPE),
            forward_pe: this.toNumber(ks.forwardPE) || this.toNumber(sd.forwardPE),
            pb_ratio: this.toNumber(ks.priceToBook),
            ps_ratio: this.toNumber(ks.priceToSalesTrailing12Months),
            peg_ratio: this.toNumber(ks.pegRatio),

            // Growth metrics
            earnings_growth: this.toPercent(fd.earningsGrowth),
            revenue_growth: this.toPercent(fd.revenueGrowth),

            // Dividend info
            dividend_yield: this.toPercent(sd.dividendYield),

            // Additional data points for reference
            beta: this.toNumber(ks.beta),
            market_cap: this.toNumber(sd.marketCap),
            enterprise_value: this.toNumber(ks.enterpriseValue),
          },
          raw: {
            financialData: fd,
            keyStatistics: ks,
            summaryDetail: sd,
          }
        };

      } catch (error) {
        if (attempt === this.maxRetries) {
          return {
            symbol,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }

        // Wait before retry with exponential backoff
        await new Promise(r => setTimeout(r, this.delay * attempt));
      }
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
      });
    }

    return results;
  }

  /**
   * Get estimated time for fetching N symbols
   */
  estimateTime(count) {
    const msPerSymbol = this.delay + 200; // delay + average fetch time
    const totalMs = count * msPerSymbol;
    return {
      seconds: Math.ceil(totalMs / 1000),
      minutes: (totalMs / 60000).toFixed(1),
    };
  }
}

module.exports = YahooFetcher;
