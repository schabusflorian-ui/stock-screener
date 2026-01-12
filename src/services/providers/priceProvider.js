// src/services/providers/priceProvider.js

/**
 * Price Provider
 *
 * Unified price data access that works globally via Alpha Vantage.
 * Wraps the existing AlphaVantageService for price-specific operations.
 *
 * Note: Alpha Vantage price data works for all markets (US, EU, UK)
 * when using the correct symbol format (e.g., VOW3.DEX for VW on XETRA).
 */

const AlphaVantageService = require('../alphaVantageService');

class PriceProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required for PriceProvider');
    }

    this.service = new AlphaVantageService(apiKey);
    console.log('   PriceProvider initialized');
  }

  /**
   * Get current quote for a symbol
   * @param {string} symbol - Stock symbol (use Yahoo format for international)
   * @returns {Object} - Current quote data
   */
  async getQuote(symbol) {
    try {
      const quote = await this.service.getGlobalQuote(symbol);

      if (!quote || !quote.price) {
        return null;
      }

      return {
        symbol: quote.symbol || symbol,
        price: quote.price,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: this._parseChangePercent(quote.changePercent),
        latestTradingDay: quote.latestTradingDay,
        source: 'alphavantage',
      };
    } catch (error) {
      console.error(`PriceProvider quote error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get historical price data
   * @param {string} symbol - Stock symbol
   * @param {Object} options - Options for history retrieval
   * @param {string} options.interval - 'daily', 'weekly', or 'monthly'
   * @param {string} options.outputSize - 'compact' (100 days) or 'full' (20+ years)
   * @returns {Array} - Historical price data sorted by date (newest first)
   */
  async getHistory(symbol, options = {}) {
    const { interval = 'daily', outputSize = 'compact' } = options;

    try {
      // Use the makeRequest method for flexibility with different endpoints
      let functionName;
      let timeSeriesKey;

      switch (interval) {
        case 'weekly':
          functionName = 'TIME_SERIES_WEEKLY_ADJUSTED';
          timeSeriesKey = 'Weekly Adjusted Time Series';
          break;
        case 'monthly':
          functionName = 'TIME_SERIES_MONTHLY_ADJUSTED';
          timeSeriesKey = 'Monthly Adjusted Time Series';
          break;
        case 'daily':
        default:
          functionName = 'TIME_SERIES_DAILY_ADJUSTED';
          timeSeriesKey = 'Time Series (Daily)';
          break;
      }

      const data = await this.service.makeRequest({
        function: functionName,
        symbol: symbol.toUpperCase(),
        outputsize: outputSize,
      });

      const timeSeries = data[timeSeriesKey];
      if (!timeSeries) {
        return [];
      }

      return Object.entries(timeSeries)
        .map(([date, values]) => ({
          date,
          open: parseFloat(values['1. open']) || null,
          high: parseFloat(values['2. high']) || null,
          low: parseFloat(values['3. low']) || null,
          close: parseFloat(values['4. close']) || null,
          adjustedClose: parseFloat(values['5. adjusted close']) || parseFloat(values['4. close']) || null,
          volume: parseInt(values['6. volume'] || values['5. volume'], 10) || null,
          dividendAmount: parseFloat(values['7. dividend amount']) || 0,
          splitCoefficient: parseFloat(values['8. split coefficient']) || 1,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error(`PriceProvider history error for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Get intraday price data
   * @param {string} symbol - Stock symbol
   * @param {Object} options - Options
   * @param {string} options.interval - '1min', '5min', '15min', '30min', '60min'
   * @param {string} options.outputSize - 'compact' or 'full'
   * @returns {Array} - Intraday price data
   */
  async getIntraday(symbol, options = {}) {
    const { interval = '5min', outputSize = 'compact' } = options;

    try {
      const data = await this.service.makeRequest({
        function: 'TIME_SERIES_INTRADAY',
        symbol: symbol.toUpperCase(),
        interval,
        outputsize: outputSize,
      });

      const timeSeriesKey = `Time Series (${interval})`;
      const timeSeries = data[timeSeriesKey];

      if (!timeSeries) {
        return [];
      }

      return Object.entries(timeSeries)
        .map(([datetime, values]) => ({
          datetime,
          open: parseFloat(values['1. open']) || null,
          high: parseFloat(values['2. high']) || null,
          low: parseFloat(values['3. low']) || null,
          close: parseFloat(values['4. close']) || null,
          volume: parseInt(values['5. volume'], 10) || null,
        }))
        .sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    } catch (error) {
      console.error(`PriceProvider intraday error for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Get latest N trading days of prices
   * @param {string} symbol - Stock symbol
   * @param {number} days - Number of days
   * @returns {Array} - Price data for specified days
   */
  async getRecentPrices(symbol, days = 30) {
    const history = await this.getHistory(symbol, { outputSize: 'compact' });
    return history.slice(0, days);
  }

  /**
   * Calculate returns for a symbol
   * @param {string} symbol - Stock symbol
   * @param {Object} options - Options
   * @returns {Object} - Return calculations
   */
  async getReturns(symbol, options = {}) {
    const history = await this.getHistory(symbol, { outputSize: 'full' });

    if (history.length < 2) {
      return null;
    }

    const latestPrice = history[0]?.adjustedClose || history[0]?.close;
    const calculations = {};

    // 1 day return
    if (history.length >= 2) {
      const prevPrice = history[1]?.adjustedClose || history[1]?.close;
      calculations.return1d = this._calculateReturn(latestPrice, prevPrice);
    }

    // 1 week return (~5 trading days)
    if (history.length >= 5) {
      const weekAgo = history[5]?.adjustedClose || history[5]?.close;
      calculations.return1w = this._calculateReturn(latestPrice, weekAgo);
    }

    // 1 month return (~21 trading days)
    if (history.length >= 21) {
      const monthAgo = history[21]?.adjustedClose || history[21]?.close;
      calculations.return1m = this._calculateReturn(latestPrice, monthAgo);
    }

    // 3 month return (~63 trading days)
    if (history.length >= 63) {
      const threeMonthsAgo = history[63]?.adjustedClose || history[63]?.close;
      calculations.return3m = this._calculateReturn(latestPrice, threeMonthsAgo);
    }

    // 6 month return (~126 trading days)
    if (history.length >= 126) {
      const sixMonthsAgo = history[126]?.adjustedClose || history[126]?.close;
      calculations.return6m = this._calculateReturn(latestPrice, sixMonthsAgo);
    }

    // 1 year return (~252 trading days)
    if (history.length >= 252) {
      const yearAgo = history[252]?.adjustedClose || history[252]?.close;
      calculations.return1y = this._calculateReturn(latestPrice, yearAgo);
    }

    // YTD return
    const currentYear = new Date().getFullYear();
    const ytdStartIndex = history.findIndex(
      p => new Date(p.date).getFullYear() < currentYear
    );
    if (ytdStartIndex > 0) {
      const ytdStart = history[ytdStartIndex]?.adjustedClose || history[ytdStartIndex]?.close;
      calculations.returnYtd = this._calculateReturn(latestPrice, ytdStart);
    }

    return {
      symbol,
      latestPrice,
      latestDate: history[0]?.date,
      ...calculations,
    };
  }

  /**
   * Get 52-week high/low
   * @param {string} symbol - Stock symbol
   * @returns {Object} - 52-week statistics
   */
  async get52WeekRange(symbol) {
    const history = await this.getHistory(symbol, { outputSize: 'full' });

    // Get approximately 1 year of data
    const yearData = history.slice(0, 252);

    if (yearData.length === 0) {
      return null;
    }

    const highs = yearData.map(p => p.high).filter(h => h !== null);
    const lows = yearData.map(p => p.low).filter(l => l !== null);
    const latestClose = yearData[0]?.close;

    const high52w = Math.max(...highs);
    const low52w = Math.min(...lows);

    return {
      symbol,
      high52Week: high52w,
      low52Week: low52w,
      latestClose,
      percentFromHigh: latestClose ? ((latestClose - high52w) / high52w) * 100 : null,
      percentFromLow: latestClose ? ((latestClose - low52w) / low52w) * 100 : null,
      range52WeekPosition: latestClose ? ((latestClose - low52w) / (high52w - low52w)) * 100 : null,
    };
  }

  // ========================================
  // Private helper methods
  // ========================================

  /**
   * Parse change percent string
   * @private
   */
  _parseChangePercent(changePercent) {
    if (typeof changePercent === 'number') {
      return changePercent;
    }
    if (typeof changePercent === 'string') {
      return parseFloat(changePercent.replace('%', '')) || null;
    }
    return null;
  }

  /**
   * Calculate percentage return
   * @private
   */
  _calculateReturn(currentPrice, previousPrice) {
    if (!currentPrice || !previousPrice || previousPrice === 0) {
      return null;
    }
    return ((currentPrice - previousPrice) / previousPrice) * 100;
  }
}

module.exports = { PriceProvider };
