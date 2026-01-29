// src/providers/base/DataProvider.js

/**
 * Abstract Base Class for Data Providers
 *
 * All data providers (Alpha Vantage, SEC EDGAR, Yahoo Finance, etc.)
 * must implement this interface.
 *
 * This ensures consistency and makes providers interchangeable.
 */
class DataProvider {
  constructor(config = {}) {
    if (new.target === DataProvider) {
      throw new TypeError('Cannot construct DataProvider instances directly');
    }

    this.config = config;
    this.name = config.name || 'UnknownProvider';
    this.priority = config.priority || 50; // Lower = higher priority
    this.enabled = config.enabled !== false;

    console.log(`✓ ${this.name} provider initialized (priority: ${this.priority})`);
  }

  /**
   * Check if provider can handle a specific request
   * @param {string} dataType - Type of data (e.g., 'overview', 'financials', 'prices')
   * @param {string} symbol - Stock symbol
   * @returns {boolean}
   */
  canProvide(dataType, symbol) {
    throw new Error('canProvide() must be implemented by provider');
  }

  /**
   * Get company overview/profile
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async getCompanyOverview(symbol) {
    throw new Error('getCompanyOverview() must be implemented by provider');
  }

  /**
   * Get balance sheet statements
   * @param {string} symbol
   * @returns {Promise<Object>} { annual: [], quarterly: [] }
   */
  async getBalanceSheet(symbol) {
    throw new Error('getBalanceSheet() must be implemented by provider');
  }

  /**
   * Get income statements
   * @param {string} symbol
   * @returns {Promise<Object>} { annual: [], quarterly: [] }
   */
  async getIncomeStatement(symbol) {
    throw new Error('getIncomeStatement() must be implemented by provider');
  }

  /**
   * Get cash flow statements
   * @param {string} symbol
   * @returns {Promise<Object>} { annual: [], quarterly: [] }
   */
  async getCashFlow(symbol) {
    throw new Error('getCashFlow() must be implemented by provider');
  }

  /**
   * Get current price quote
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async getQuote(symbol) {
    throw new Error('getQuote() must be implemented by provider');
  }

  /**
   * Get historical prices
   * @param {string} symbol
   * @param {string} interval - 'daily', 'weekly', 'monthly'
   * @returns {Promise<Array>}
   */
  async getHistoricalPrices(symbol, interval = 'daily') {
    throw new Error('getHistoricalPrices() must be implemented by provider');
  }

  /**
   * Health check - is the provider working?
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    return true; // Override if needed
  }

  /**
   * Get provider statistics
   * @returns {Object}
   */
  getStats() {
    return {
      name: this.name,
      priority: this.priority,
      enabled: this.enabled
    };
  }

  /**
   * Normalize data to common format
   * Each provider returns data differently - this normalizes it
   */
  normalizeData(rawData, dataType) {
    // Override in specific providers
    return rawData;
  }
}

module.exports = DataProvider;
