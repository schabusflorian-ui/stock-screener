// src/services/updates/bundles/priceBundle.js
/**
 * Price Update Bundle
 *
 * Handles all price-related update jobs:
 * - prices.daily - End-of-day price updates
 * - prices.backfill - Fill in missing historical prices
 * - prices.intraday - Real-time price updates (manual)
 * - prices.index - Major index price updates
 * - prices.historical - Full historical import from 2009 (for specific symbols)
 *
 * Uses Node.js-native yahoo-finance2 for PostgreSQL compatibility
 */

const { getPriceService } = require('../../priceService');

// Symbols that need full historical data import
const HISTORICAL_IMPORT_SYMBOLS = [
  // Core US stocks - these should have full historical data
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B',
  'JPM', 'V', 'UNH', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX', 'KO',
  // Major ETFs/Indices
  'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'BND', 'GLD', 'TLT'
];

class PriceBundle {
  constructor() {
    this.priceService = getPriceService();
  }

  async execute(jobKey, db, context) {
    const { onProgress, params } = context;

    switch (jobKey) {
      case 'prices.daily':
        return this.priceService.runDailyUpdate(onProgress);
      case 'prices.backfill':
        return this.priceService.runBackfill(onProgress);
      case 'prices.intraday':
        return this.priceService.runIntradayUpdate(onProgress);
      case 'prices.index':
        return this.priceService.runIndexUpdate(onProgress);
      case 'prices.alpha':
        return this.priceService.runAlphaUpdate(onProgress);
      case 'prices.historical':
        // Import full historical data from 2009 for specified symbols
        const symbols = params?.symbols || HISTORICAL_IMPORT_SYMBOLS;
        const startDate = params?.startDate || '2009-01-01';
        return this.priceService.runHistoricalImport(symbols, onProgress, { startDate });
      default:
        throw new Error(`Unknown price job: ${jobKey}`);
    }
  }
}

// Export execute function for orchestrator
const priceBundle = new PriceBundle();

module.exports = {
  execute: (jobKey, db, context) => priceBundle.execute(jobKey, db, context)
};
