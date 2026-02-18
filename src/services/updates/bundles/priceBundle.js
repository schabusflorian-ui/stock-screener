// src/services/updates/bundles/priceBundle.js
/**
 * Price Update Bundle
 *
 * Handles all price-related update jobs:
 * - prices.daily - End-of-day price updates
 * - prices.backfill - Fill in missing historical prices
 * - prices.intraday - Real-time price updates (manual)
 * - prices.index - Major index price updates
 *
 * Uses Node.js-native yahoo-finance2 for PostgreSQL compatibility
 */

const { getPriceService } = require('../../priceService');

class PriceBundle {
  constructor() {
    this.priceService = getPriceService();
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

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
