// src/services/updates/bundles/portfolioBundle.js
/**
 * Portfolio Update Bundle
 *
 * Handles portfolio-related update jobs:
 * - portfolio.liquidity - Calculate liquidity metrics for all companies
 * - portfolio.snapshots - Create daily portfolio snapshots
 */

const { getDatabaseAsync, isUsingPostgres } = require('../../../lib/db');

class PortfolioBundle {
  constructor() {
    this.liquidityRefresh = null;
    this.snapshotCreator = null;
  }

  getLiquidityRefresh() {
    if (!this.liquidityRefresh) {
      const { LiquidityRefresh } = require('../../../jobs/liquidityRefresh');
      this.liquidityRefresh = new LiquidityRefresh();
    }
    return this.liquidityRefresh;
  }

  getSnapshotCreator() {
    if (!this.snapshotCreator) {
      const { snapshotCreator } = require('../../../jobs/snapshotCreator');
      this.snapshotCreator = snapshotCreator;
    }
    return this.snapshotCreator;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'portfolio.liquidity':
        return this.runLiquidityUpdate(db, onProgress);
      case 'portfolio.snapshots':
        return this.runSnapshotCreation(db, onProgress);
      default:
        throw new Error(`Unknown portfolio job: ${jobKey}`);
    }
  }

  async runLiquidityUpdate(db, onProgress) {
    await onProgress(5, 'Starting liquidity metrics calculation...');

    try {
      const refresher = this.getLiquidityRefresh();

      // Check if already running
      if (refresher.isRunning) {
        await onProgress(100, 'Liquidity refresh already in progress');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: 'Already running' }
        };
      }

      await onProgress(10, 'Fetching companies with price data...');

      // Run the refresh with progress updates
      const database = await getDatabaseAsync();
      const dateFilter = isUsingPostgres()
        ? `dp.date >= CURRENT_DATE - INTERVAL '60 days'`
        : `dp.date >= date('now', '-60 days')`;

      const companiesResult = await database.query(`
        SELECT c.id, c.symbol, c.market_cap
        FROM companies c
        JOIN daily_prices dp ON c.id = dp.company_id
        WHERE ${dateFilter}
        GROUP BY c.id, c.symbol, c.market_cap
        HAVING COUNT(*) >= 30
      `);
      const companies = companiesResult.rows;

      await onProgress(15, `Calculating liquidity for ${companies.length} companies...`);

      // Execute the refresh
      const result = await refresher.refreshAll();

      if (result.success) {
        await onProgress(100, `Liquidity update complete: ${result.updated} updated`);
        return {
          itemsTotal: result.processed || companies.length,
          itemsProcessed: result.processed || 0,
          itemsUpdated: result.updated || 0,
          itemsFailed: result.errors || 0,
          metadata: { executionTimeMs: result.executionTimeMs }
        };
      } else {
        throw new Error(result.error || 'Liquidity refresh failed');
      }
    } catch (error) {
      throw error;
    }
  }

  async runSnapshotCreation(db, onProgress) {
    await onProgress(5, 'Starting portfolio snapshot creation...');

    try {
      const creator = this.getSnapshotCreator();

      // Check if already running
      if (creator.isRunning) {
        await onProgress(100, 'Snapshot creation already in progress');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: 'Already running' }
        };
      }

      await onProgress(10, 'Creating daily snapshots...');

      // Execute snapshot creation for today
      const result = await creator.createSnapshots();

      if (result.success !== false) {
        await onProgress(100, `Snapshots complete: ${result.successful || 0}/${result.processed || 0} successful`);
        return {
          itemsTotal: result.processed || 0,
          itemsProcessed: result.processed || 0,
          itemsUpdated: result.successful || 0,
          itemsFailed: result.failed || 0,
          metadata: { executionTimeMs: result.executionTimeMs }
        };
      } else {
        throw new Error(result.error || 'Snapshot creation failed');
      }
    } catch (error) {
      // If metricsEngine isn't available, return gracefully
      if (error.message.includes('Cannot find module') || error.message.includes('metricsEngine')) {
        await onProgress(100, 'Skipped: Portfolio metrics engine not available');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: 'Portfolio metrics engine not available' }
        };
      }
      throw error;
    }
  }
}

const portfolioBundle = new PortfolioBundle();

module.exports = {
  execute: (jobKey, db, context) => portfolioBundle.execute(jobKey, db, context)
};
