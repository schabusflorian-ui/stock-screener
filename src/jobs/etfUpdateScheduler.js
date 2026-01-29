// src/jobs/etfUpdateScheduler.js
// Scheduled updates for ETF data across tiers

const db = require('../database');
const { getYFinanceETFFetcher } = require('../services/yfinanceETFFetcher');
const { getETFResolver } = require('../services/etfResolver');

class ETFUpdateScheduler {
  constructor() {
    this.db = db.getDatabase();
    this.yfinance = getYFinanceETFFetcher();
    this.resolver = getETFResolver();

    console.log('ETFUpdateScheduler initialized');
  }

  /**
   * Log an update run to the database
   * @param {string} updateType
   * @returns {number} Log ID
   */
  startUpdateLog(updateType) {
    const result = this.db.prepare(`
      INSERT INTO etf_update_log (update_type, started_at, status)
      VALUES (?, CURRENT_TIMESTAMP, 'running')
    `).run(updateType);

    return result.lastInsertRowid;
  }

  /**
   * Complete an update log entry
   * @param {number} logId
   * @param {Object} stats
   */
  completeUpdateLog(logId, stats) {
    this.db.prepare(`
      UPDATE etf_update_log
      SET completed_at = CURRENT_TIMESTAMP,
          etfs_processed = ?,
          etfs_updated = ?,
          etfs_failed = ?,
          error_log = ?,
          status = ?
      WHERE id = ?
    `).run(
      stats.processed,
      stats.updated,
      stats.failed,
      stats.errors?.length > 0 ? JSON.stringify(stats.errors) : null,
      stats.failed > 0 ? 'completed_with_errors' : 'completed',
      logId
    );
  }

  /**
   * Update Tier 1 ETFs - Full fundamentals update
   * Should run daily on weekdays
   */
  async updateTier1() {
    console.log('[ETF Update] Starting Tier 1 update...');
    const logId = this.startUpdateLog('tier1_daily');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      const etfs = this.db.prepare(`
        SELECT symbol FROM etf_definitions
        WHERE tier = 1 AND is_active = 1
        ORDER BY symbol
      `).all();

      console.log(`[ETF Update] Found ${etfs.length} Tier 1 ETFs to update`);

      for (const { symbol } of etfs) {
        stats.processed++;

        try {
          const data = await this.yfinance.fetchETF(symbol);

          if (data) {
            this.db.prepare(`
              UPDATE etf_definitions SET
                expense_ratio = COALESCE(?, expense_ratio),
                aum = COALESCE(?, aum),
                avg_volume = COALESCE(?, avg_volume),
                dividend_yield = COALESCE(?, dividend_yield),
                ytd_return = COALESCE(?, ytd_return),
                beta = COALESCE(?, beta),
                last_fundamentals_update = CURRENT_TIMESTAMP,
                last_updated = CURRENT_TIMESTAMP
              WHERE symbol = ?
            `).run(
              data.expenseRatio,
              data.aum,
              data.avgVolume,
              data.dividendYield,
              data.ytdReturn,
              data.beta,
              symbol
            );

            stats.updated++;
            console.log(`[ETF Update] Updated ${symbol}`);
          }
        } catch (error) {
          stats.failed++;
          stats.errors.push({ symbol, error: error.message });
          console.error(`[ETF Update] Failed to update ${symbol}:`, error.message);
        }

        // Progress log every 10 ETFs
        if (stats.processed % 10 === 0) {
          console.log(`[ETF Update] Progress: ${stats.processed}/${etfs.length}`);
        }
      }

      console.log(`[ETF Update] Tier 1 complete: ${stats.updated}/${stats.processed} updated, ${stats.failed} failed`);
    } finally {
      this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Update Tier 2 ETFs - Basic update
   * Should run weekly on weekends
   */
  async updateTier2() {
    console.log('[ETF Update] Starting Tier 2 update...');
    const logId = this.startUpdateLog('tier2_weekly');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      const etfs = this.db.prepare(`
        SELECT symbol FROM etf_definitions
        WHERE tier = 2 AND is_active = 1
        ORDER BY aum DESC NULLS LAST
      `).all();

      console.log(`[ETF Update] Found ${etfs.length} Tier 2 ETFs to update`);

      for (const { symbol } of etfs) {
        stats.processed++;

        try {
          const data = await this.yfinance.fetchETF(symbol);

          if (data) {
            this.db.prepare(`
              UPDATE etf_definitions SET
                expense_ratio = COALESCE(?, expense_ratio),
                aum = COALESCE(?, aum),
                last_fundamentals_update = CURRENT_TIMESTAMP,
                last_updated = CURRENT_TIMESTAMP
              WHERE symbol = ?
            `).run(
              data.expenseRatio,
              data.aum,
              symbol
            );

            stats.updated++;
          }
        } catch (error) {
          stats.failed++;
          stats.errors.push({ symbol, error: error.message });
          console.error(`[ETF Update] Failed to update ${symbol}:`, error.message);
        }

        // Progress log every 50 ETFs
        if (stats.processed % 50 === 0) {
          console.log(`[ETF Update] Progress: ${stats.processed}/${etfs.length}`);
        }
      }

      console.log(`[ETF Update] Tier 2 complete: ${stats.updated}/${stats.processed} updated, ${stats.failed} failed`);
    } finally {
      this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Promote popular Tier 3 ETFs to Tier 2
   * Should run weekly
   */
  async promoteTier3() {
    console.log('[ETF Update] Starting Tier 3 promotion check...');
    const logId = this.startUpdateLog('tier3_promotion');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      // Find eligible ETFs
      const eligible = this.db.prepare(`
        SELECT symbol, access_count, last_accessed
        FROM etf_definitions
        WHERE tier = 3
          AND access_count >= 10
          AND last_accessed > datetime('now', '-30 days')
      `).all();

      stats.processed = eligible.length;

      if (eligible.length > 0) {
        const result = this.db.prepare(`
          UPDATE etf_definitions
          SET tier = 2, last_updated = CURRENT_TIMESTAMP
          WHERE tier = 3
            AND access_count >= 10
            AND last_accessed > datetime('now', '-30 days')
        `).run();

        stats.updated = result.changes;

        console.log(`[ETF Update] Promoted ${result.changes} ETFs from Tier 3 to Tier 2`);

        for (const etf of eligible) {
          console.log(`  - ${etf.symbol} (${etf.access_count} accesses)`);
        }
      } else {
        console.log('[ETF Update] No Tier 3 ETFs eligible for promotion');
      }
    } catch (error) {
      stats.failed = 1;
      stats.errors.push({ error: error.message });
      console.error('[ETF Update] Tier 3 promotion failed:', error.message);
    } finally {
      this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Update issuer statistics
   */
  async updateIssuerStats() {
    console.log('[ETF Update] Updating issuer statistics...');

    try {
      // Aggregate stats from etf_definitions
      const stats = this.db.prepare(`
        SELECT
          issuer,
          COUNT(*) as etf_count,
          SUM(aum) as total_aum
        FROM etf_definitions
        WHERE is_active = 1 AND issuer IS NOT NULL
        GROUP BY issuer
      `).all();

      // Update etf_issuers table
      const updateStmt = this.db.prepare(`
        UPDATE etf_issuers
        SET etf_count = ?, total_aum = ?, updated_at = CURRENT_TIMESTAMP
        WHERE slug = ?
      `);

      for (const stat of stats) {
        updateStmt.run(stat.etf_count, stat.total_aum, stat.issuer);
      }

      console.log(`[ETF Update] Updated stats for ${stats.length} issuers`);
    } catch (error) {
      console.error('[ETF Update] Failed to update issuer stats:', error.message);
    }
  }

  /**
   * Get update history
   * @param {number} limit
   * @returns {Object[]}
   */
  getUpdateHistory(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM etf_update_log
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get last successful update time for each type
   * @returns {Object}
   */
  getLastUpdateTimes() {
    const result = this.db.prepare(`
      SELECT update_type, MAX(completed_at) as last_update
      FROM etf_update_log
      WHERE status IN ('completed', 'completed_with_errors')
      GROUP BY update_type
    `).all();

    return Object.fromEntries(result.map(r => [r.update_type, r.last_update]));
  }

  /**
   * Clean up old update logs (keep last 30 days)
   */
  cleanupOldLogs() {
    const result = this.db.prepare(`
      DELETE FROM etf_update_log
      WHERE started_at < datetime('now', '-30 days')
    `).run();

    if (result.changes > 0) {
      console.log(`[ETF Update] Cleaned up ${result.changes} old log entries`);
    }
  }
}

// Singleton instance
let instance = null;

function getETFUpdateScheduler() {
  if (!instance) {
    instance = new ETFUpdateScheduler();
  }
  return instance;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const scheduler = getETFUpdateScheduler();

  if (args.includes('--tier1')) {
    scheduler.updateTier1().then(() => process.exit(0)).catch(e => {
      console.error(e);
      process.exit(1);
    });
  } else if (args.includes('--tier2')) {
    scheduler.updateTier2().then(() => process.exit(0)).catch(e => {
      console.error(e);
      process.exit(1);
    });
  } else if (args.includes('--promote')) {
    scheduler.promoteTier3().then(() => process.exit(0)).catch(e => {
      console.error(e);
      process.exit(1);
    });
  } else if (args.includes('--history')) {
    const history = scheduler.getUpdateHistory();
    console.log('\nETF Update History:');
    for (const entry of history) {
      const status = entry.status === 'completed' ? '✓' : entry.status === 'running' ? '⋯' : '!';
      console.log(`  ${status} ${entry.update_type} - ${entry.started_at} (${entry.etfs_updated}/${entry.etfs_processed} updated)`);
    }
    process.exit(0);
  } else {
    console.log(`
ETF Update Scheduler

Usage:
  node src/jobs/etfUpdateScheduler.js [options]

Options:
  --tier1     Run Tier 1 (curated) ETF update
  --tier2     Run Tier 2 (indexed) ETF update
  --promote   Check and promote eligible Tier 3 ETFs
  --history   Show update history
  --help      Show this help message
`);
    process.exit(0);
  }
}

module.exports = {
  ETFUpdateScheduler,
  getETFUpdateScheduler
};
