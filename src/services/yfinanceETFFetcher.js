// src/services/yfinanceETFFetcher.js
// Fetches ETF data from Yahoo Finance using yahoo-finance2 package

const YahooFinanceClass = require('yahoo-finance2').default;
const { inferIssuerFromName } = require('../data/etf-issuers');

// Initialize Yahoo Finance instance (v3 API)
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

class YFinanceETFFetcher {
  constructor() {
    this.rateLimitMs = 500; // 500ms between requests
    this.lastRequestTime = 0;

    console.log('YFinanceETFFetcher initialized');
  }

  /**
   * Enforce rate limiting
   */
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitMs) {
      await new Promise(resolve =>
        setTimeout(resolve, this.rateLimitMs - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch ETF data by symbol
   * @param {string} symbol
   * @returns {Object|null} ETF data or null if not found/not an ETF
   */
  async fetchETF(symbol) {
    await this.throttle();

    try {
      const quote = await yahooFinance.quote(symbol.toUpperCase());

      if (!quote) {
        console.log(`YFinance: No data for ${symbol}`);
        return null;
      }

      // Verify it's an ETF
      if (quote.quoteType !== 'ETF') {
        console.log(`YFinance: ${symbol} is not an ETF (type: ${quote.quoteType})`);
        return null;
      }

      return {
        symbol: quote.symbol,
        name: quote.longName || quote.shortName || symbol,
        assetClass: this.inferAssetClass(quote.category),
        category: this.mapCategory(quote.category),
        expenseRatio: quote.annualReportExpenseRatio || null,
        aum: quote.totalAssets || null,
        avgVolume: quote.averageVolume || null,
        dividendYield: quote.yield || null,
        ytdReturn: quote.ytdReturn || null,
        beta: quote.beta || null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow || null,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || null,
        regularMarketPrice: quote.regularMarketPrice || null,
        regularMarketChange: quote.regularMarketChange || null,
        regularMarketChangePercent: quote.regularMarketChangePercent || null,
        issuer: inferIssuerFromName(quote.longName || quote.shortName || ''),
        quoteType: quote.quoteType
      };
    } catch (error) {
      if (error.message?.includes('Not Found') || error.message?.includes('404')) {
        console.log(`YFinance: Symbol ${symbol} not found`);
        return null;
      }

      console.error(`YFinance error for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch multiple ETFs with rate limiting
   * @param {string[]} symbols
   * @returns {Map<string, Object>} Map of symbol to ETF data
   */
  async fetchMultiple(symbols) {
    const results = new Map();

    for (const symbol of symbols) {
      try {
        const data = await this.fetchETF(symbol);
        if (data) {
          results.set(symbol.toUpperCase(), data);
        }
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Infer asset class from Yahoo Finance category
   * @param {string|null} category
   * @returns {string}
   */
  inferAssetClass(category) {
    if (!category) return 'Equity';

    const lc = category.toLowerCase();

    if (lc.includes('bond') || lc.includes('fixed') || lc.includes('treasury')) {
      return 'Fixed Income';
    }
    if (lc.includes('commodity') || lc.includes('gold') || lc.includes('silver') || lc.includes('metals')) {
      return 'Commodity';
    }
    if (lc.includes('real estate') || lc.includes('reit')) {
      return 'Real Estate';
    }
    if (lc.includes('alternative') || lc.includes('hedge') || lc.includes('managed futures')) {
      return 'Alternative';
    }
    if (lc.includes('allocation') || lc.includes('multi-asset') || lc.includes('balanced')) {
      return 'Multi-Asset';
    }

    return 'Equity';
  }

  /**
   * Map Yahoo Finance category to our category slugs
   * @param {string|null} category
   * @returns {string}
   */
  mapCategory(category) {
    if (!category) return 'us-equity';

    const lc = category.toLowerCase();

    // US Equity categories
    if (lc.includes('large blend') || lc.includes('large-cap blend')) {
      return 'us-large-cap-blend';
    }
    if (lc.includes('large growth') || lc.includes('large-cap growth')) {
      return 'us-large-cap-growth';
    }
    if (lc.includes('large value') || lc.includes('large-cap value')) {
      return 'us-large-cap-value';
    }
    if (lc.includes('mid-cap') || lc.includes('mid cap')) {
      return 'us-mid-cap';
    }
    if (lc.includes('small blend') || lc.includes('small-cap blend') || lc.includes('small cap')) {
      return 'us-small-cap';
    }

    // International
    if (lc.includes('foreign large') || lc.includes('international developed') || lc.includes('world stock')) {
      return 'intl-developed';
    }
    if (lc.includes('emerging') || lc.includes('diversified emerging')) {
      return 'emerging-markets';
    }

    // Fixed Income
    if (lc.includes('intermediate core bond') || lc.includes('aggregate bond')) {
      return 'us-aggregate';
    }
    if (lc.includes('long government') || lc.includes('long-term bond')) {
      return 'long-term-treasury';
    }
    if (lc.includes('intermediate government') || lc.includes('intermediate-term bond')) {
      return 'intermediate-treasury';
    }
    if (lc.includes('short government') || lc.includes('short-term bond')) {
      return 'short-term-treasury';
    }
    if (lc.includes('inflation-protected') || lc.includes('tips')) {
      return 'tips';
    }
    if (lc.includes('corporate bond') || lc.includes('high yield')) {
      return 'corporate-bonds';
    }

    // Real Estate
    if (lc.includes('real estate') || lc.includes('reit')) {
      return 'real-estate';
    }

    // Commodities
    if (lc.includes('precious metals') || lc.includes('gold')) {
      return 'gold';
    }
    if (lc.includes('commodities')) {
      return 'broad-commodities';
    }

    // Sectors
    if (lc.includes('technology')) return 'sector-technology';
    if (lc.includes('health')) return 'sector-healthcare';
    if (lc.includes('financial')) return 'sector-financials';
    if (lc.includes('energy')) return 'sector-energy';
    if (lc.includes('consumer discretionary')) return 'sector-consumer-disc';
    if (lc.includes('consumer staples')) return 'sector-consumer-staples';
    if (lc.includes('industrials')) return 'sector-industrials';
    if (lc.includes('utilities')) return 'sector-utilities';
    if (lc.includes('materials') || lc.includes('basic materials')) return 'sector-materials';
    if (lc.includes('communication')) return 'sector-communication';

    // Default
    return 'us-equity';
  }

  /**
   * Check if a symbol is a valid ETF
   * @param {string} symbol
   * @returns {boolean}
   */
  async isValidETF(symbol) {
    try {
      await this.throttle();
      const quote = await yahooFinance.quote(symbol.toUpperCase());
      return quote && quote.quoteType === 'ETF';
    } catch {
      return false;
    }
  }

  /**
   * Search for ETFs matching a query
   * @param {string} query
   * @param {number} limit
   * @returns {Object[]}
   */
  async search(query, limit = 10) {
    try {
      await this.throttle();
      const results = await yahooFinance.search(query);

      if (!results || !results.quotes) {
        return [];
      }

      // Filter to ETFs only
      const etfs = results.quotes
        .filter(q => q.quoteType === 'ETF')
        .slice(0, limit)
        .map(q => ({
          symbol: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          exchange: q.exchange,
          score: q.score
        }));

      return etfs;
    } catch (error) {
      console.error('YFinance search error:', error.message);
      return [];
    }
  }
}

// Singleton instance
let instance = null;

function getYFinanceETFFetcher() {
  if (!instance) {
    instance = new YFinanceETFFetcher();
  }
  return instance;
}

module.exports = {
  YFinanceETFFetcher,
  getYFinanceETFFetcher
};
