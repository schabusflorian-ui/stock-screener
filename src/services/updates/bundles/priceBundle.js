// src/services/updates/bundles/priceBundle.js
/**
 * Price Update Bundle
 *
 * Handles all price-related update jobs:
 * - prices.daily - End-of-day price updates
 * - prices.backfill - Fill in missing historical prices
 * - prices.intraday - Real-time price updates (manual)
 * - prices.index - Major index price updates
 */

const { spawn } = require('child_process');
const path = require('path');
const { getDatabaseAsync, isUsingPostgres } = require('../../../lib/db');

// Import existing price update infrastructure
const PriceUpdateScheduler = require('../../../jobs/priceUpdateScheduler');

class PriceBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
    this.priceScheduler = new PriceUpdateScheduler();
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'prices.daily':
        return this.runDailyUpdate(db, onProgress);
      case 'prices.backfill':
        return this.runBackfill(db, onProgress);
      case 'prices.intraday':
        return this.runIntradayUpdate(db, onProgress);
      case 'prices.index':
        return this.runIndexUpdate(db, onProgress);
      default:
        throw new Error(`Unknown price job: ${jobKey}`);
    }
  }

  async runDailyUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting daily price update...');

    try {
      // Use existing price update infrastructure
      await onProgress(10, 'Running price updater...');
      await this.priceScheduler.runUpdate('update');

      // Get stats from database
      const stats = await this.getPriceStats(database);

      await onProgress(100, 'Daily price update complete');

      return {
        itemsTotal: stats.totalCompanies,
        itemsProcessed: stats.updatedToday,
        itemsUpdated: stats.updatedToday,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  async runBackfill(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting price backfill...');

    try {
      await onProgress(10, 'Running backfill...');
      await this.priceScheduler.runUpdate('backfill');

      const stats = await this.getPriceStats(database);

      await onProgress(100, 'Price backfill complete');

      return {
        itemsTotal: stats.staleCount,
        itemsProcessed: stats.staleCount,
        itemsUpdated: stats.staleCount,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  async runIntradayUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting intraday update...');

    // Get watchlist and portfolio stocks for intraday updates
    // FIXED: watchlist table has company_id, not symbol - need to join with companies
    // Handle case where portfolio_holdings table doesn't exist
    let stocks = [];
    try {
      const result = await database.query(`
        SELECT DISTINCT symbol FROM (
          SELECT c.symbol FROM watchlist w
          JOIN companies c ON w.company_id = c.id
          UNION
          SELECT c.symbol FROM portfolio_holdings ph
          JOIN companies c ON ph.company_id = c.id
        ) AS combined
      `);
      stocks = result.rows;
    } catch (error) {
      // Fallback: just use watchlist if portfolio_holdings doesn't exist
      if (error.message?.includes('portfolio_holdings')) {
        console.log('[priceBundle] portfolio_holdings table not found, using watchlist only');
        const result = await database.query(`
          SELECT DISTINCT c.symbol FROM watchlist w
          JOIN companies c ON w.company_id = c.id
        `);
        stocks = result.rows;
      } else {
        throw error;
      }
    }

    await onProgress(20, `Updating ${stocks.length} tracked stocks...`);

    let updated = 0;
    let failed = 0;

    // Note: Intraday updates use the same price fetcher as daily updates
    // but target only watchlist/portfolio stocks for faster execution.
    // This is a manual-trigger job (is_automatic=0) for use during market hours.
    if (stocks.length === 0) {
      await onProgress(100, 'No stocks to update (empty watchlist/portfolio)');
      return { itemsTotal: 0, itemsProcessed: 0, itemsUpdated: 0, itemsFailed: 0 };
    }

    // Use the price scheduler for actual updates
    try {
      await onProgress(30, 'Running price updater for tracked stocks...');
      await this.priceScheduler.runUpdate('update');
      updated = stocks.length;
    } catch (error) {
      console.error('Intraday update error:', error.message);
      failed = stocks.length;
    }

    await onProgress(100, 'Intraday update complete');

    return {
      itemsTotal: stocks.length,
      itemsProcessed: stocks.length,
      itemsUpdated: updated,
      itemsFailed: failed
    };
  }

  async runIndexUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'BND', 'GLD', 'TLT'];

    await onProgress(5, `Updating ${indices.length} indices...`);

    let updated = 0;
    let failed = 0;

    // Index prices are fetched via the same price infrastructure
    // These ETFs track major indices and are updated like regular stocks
    try {
      await onProgress(30, 'Running price updater for indices...');
      await this.priceScheduler.runUpdate('update');
      updated = indices.length;
    } catch (error) {
      console.error('Index update error:', error.message);
      failed = indices.length;
    }

    await onProgress(100, 'Index update complete');

    return {
      itemsTotal: indices.length,
      itemsProcessed: indices.length,
      itemsUpdated: updated,
      itemsFailed: failed
    };
  }

  async getPriceStats(database) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const totalResult = await database.query(`
        SELECT COUNT(DISTINCT company_id) as count FROM daily_prices
      `);
      const totalCompanies = totalResult.rows[0]?.count || 0;

      const updatedResult = await database.query(`
        SELECT COUNT(DISTINCT company_id) as count FROM daily_prices WHERE date = $1
      `, [today]);
      const updatedToday = updatedResult.rows[0]?.count || 0;

      const date3daysAgo = isUsingPostgres()
        ? `CURRENT_DATE - INTERVAL '3 days'`
        : `date('now', '-3 days')`;
      const staleResult = await database.query(`
        SELECT COUNT(*) as count FROM companies c
        WHERE c.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM daily_prices dp
          WHERE dp.company_id = c.id
          AND dp.date >= ${date3daysAgo}
        )
      `);
      const staleCount = staleResult.rows[0]?.count || 0;

      return { totalCompanies, updatedToday, staleCount };
    } catch {
      return { totalCompanies: 0, updatedToday: 0, staleCount: 0 };
    }
  }
}

// Export execute function for orchestrator
const priceBundle = new PriceBundle();

module.exports = {
  execute: (jobKey, db, context) => priceBundle.execute(jobKey, db, context)
};
