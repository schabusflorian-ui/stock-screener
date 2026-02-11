// src/jobs/etfUpdateScheduler.js
// Scheduled updates for ETF data across tiers

const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');
const { getYFinanceETFFetcher } = require('../services/yfinanceETFFetcher');
const { getETFResolver } = require('../services/etfResolver');

class ETFUpdateScheduler {
  constructor() {
    this.dbPromise = null;
    this.yfinance = getYFinanceETFFetcher();
    this.resolver = getETFResolver();

    console.log('ETFUpdateScheduler initialized');
  }

  async getDatabase() {
    if (!this.dbPromise) {
      this.dbPromise = getDatabaseAsync();
    }
    return this.dbPromise;
  }

  /**
   * Log an update run to the database
   * @param {string} updateType
   * @returns {number} Log ID
   */
  async startUpdateLog(updateType) {
    const db = await this.getDatabase();
    if (isUsingPostgres()) {
      const result = await db.query(
        `INSERT INTO etf_update_log (update_type, started_at, status)
         VALUES ($1, CURRENT_TIMESTAMP, 'running')
         RETURNING id`,
        [updateType]
      );
      return result.rows?.[0]?.id;
    }

    const result = await db.query(
      `INSERT INTO etf_update_log (update_type, started_at, status)
       VALUES ($1, CURRENT_TIMESTAMP, 'running')`,
      [updateType]
    );
    return result.lastInsertRowid;
  }

  /**
   * Complete an update log entry
   * @param {number} logId
   * @param {Object} stats
   */
  async completeUpdateLog(logId, stats) {
    const db = await this.getDatabase();
    await db.query(
      `UPDATE etf_update_log
       SET completed_at = CURRENT_TIMESTAMP,
           etfs_processed = $1,
           etfs_updated = $2,
           etfs_failed = $3,
           error_log = $4,
           status = $5
       WHERE id = $6`,
      [
        stats.processed,
        stats.updated,
        stats.failed,
        stats.errors?.length > 0 ? JSON.stringify(stats.errors) : null,
        stats.failed > 0 ? 'completed_with_errors' : 'completed',
        logId
      ]
    );
  }

  /**
   * Update Tier 1 ETFs - Full fundamentals update
   * Should run daily on weekdays
   */
  async updateTier1() {
    console.log('[ETF Update] Starting Tier 1 update...');
    const logId = await this.startUpdateLog('tier1_daily');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      const db = await this.getDatabase();
      const etfsResult = await db.query(`
        SELECT symbol FROM etf_definitions
        WHERE tier = 1 AND is_active = 1
        ORDER BY symbol
      `);
      const etfs = etfsResult.rows;

      console.log(`[ETF Update] Found ${etfs.length} Tier 1 ETFs to update`);

      for (const { symbol } of etfs) {
        stats.processed++;

        try {
          const data = await this.yfinance.fetchETF(symbol);

          if (data) {
            await db.query(`
              UPDATE etf_definitions SET
                expense_ratio = COALESCE($1, expense_ratio),
                aum = COALESCE($2, aum),
                avg_volume = COALESCE($3, avg_volume),
                dividend_yield = COALESCE($4, dividend_yield),
                ytd_return = COALESCE($5, ytd_return),
                beta = COALESCE($6, beta),
                last_fundamentals_update = CURRENT_TIMESTAMP,
                last_updated = CURRENT_TIMESTAMP
              WHERE symbol = $7
            `, [
              data.expenseRatio,
              data.aum,
              data.avgVolume,
              data.dividendYield,
              data.ytdReturn,
              data.beta,
              symbol
            ]);

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
      await this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Update Tier 2 ETFs - Basic update
   * Should run weekly on weekends
   */
  async updateTier2() {
    console.log('[ETF Update] Starting Tier 2 update...');
    const logId = await this.startUpdateLog('tier2_weekly');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      const db = await this.getDatabase();
      const etfsResult = await db.query(`
        SELECT symbol FROM etf_definitions
        WHERE tier = 2 AND is_active = 1
        ORDER BY aum DESC NULLS LAST
      `);
      const etfs = etfsResult.rows;

      console.log(`[ETF Update] Found ${etfs.length} Tier 2 ETFs to update`);

      for (const { symbol } of etfs) {
        stats.processed++;

        try {
          const data = await this.yfinance.fetchETF(symbol);

          if (data) {
            await db.query(`
              UPDATE etf_definitions SET
                expense_ratio = COALESCE($1, expense_ratio),
                aum = COALESCE($2, aum),
                last_fundamentals_update = CURRENT_TIMESTAMP,
                last_updated = CURRENT_TIMESTAMP
              WHERE symbol = $3
            `, [
              data.expenseRatio,
              data.aum,
              symbol
            ]);

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
      await this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Promote popular Tier 3 ETFs to Tier 2
   * Should run weekly
   */
  async promoteTier3() {
    console.log('[ETF Update] Starting Tier 3 promotion check...');
    const logId = await this.startUpdateLog('tier3_promotion');

    const stats = { processed: 0, updated: 0, failed: 0, errors: [] };

    try {
      const db = await this.getDatabase();
      const recentCutoff = isUsingPostgres()
        ? `CURRENT_TIMESTAMP - INTERVAL '30 days'`
        : `datetime('now', '-30 days')`;
      // Find eligible ETFs
      const eligibleResult = await db.query(`
        SELECT symbol, access_count, last_accessed
        FROM etf_definitions
        WHERE tier = 3
          AND access_count >= 10
          AND last_accessed > ${recentCutoff}
      `);
      const eligible = eligibleResult.rows;

      stats.processed = eligible.length;

      if (eligible.length > 0) {
        const result = await db.query(`
          UPDATE etf_definitions
          SET tier = 2, last_updated = CURRENT_TIMESTAMP
          WHERE tier = 3
            AND access_count >= 10
            AND last_accessed > ${recentCutoff}
        `);

        stats.updated = result.rowCount || result.changes || 0;

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
      await this.completeUpdateLog(logId, stats);
    }

    return stats;
  }

  /**
   * Update issuer statistics
   */
  async updateIssuerStats() {
    console.log('[ETF Update] Updating issuer statistics...');

    try {
      const db = await this.getDatabase();
      // Aggregate stats from etf_definitions
      const statsResult = await db.query(`
        SELECT
          issuer,
          COUNT(*) as etf_count,
          SUM(aum) as total_aum
        FROM etf_definitions
        WHERE is_active = 1 AND issuer IS NOT NULL
        GROUP BY issuer
      `);
      const stats = statsResult.rows;

      // Update etf_issuers table
      for (const stat of stats) {
        await db.query(
          `UPDATE etf_issuers
           SET etf_count = $1, total_aum = $2, updated_at = CURRENT_TIMESTAMP
           WHERE slug = $3`,
          [stat.etf_count, stat.total_aum, stat.issuer]
        );
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
  async getUpdateHistory(limit = 20) {
    const db = await this.getDatabase();
    const result = await db.query(
      `SELECT * FROM etf_update_log
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get last successful update time for each type
   * @returns {Object}
   */
  async getLastUpdateTimes() {
    const db = await this.getDatabase();
    const result = await db.query(`
      SELECT update_type, MAX(completed_at) as last_update
      FROM etf_update_log
      WHERE status IN ('completed', 'completed_with_errors')
      GROUP BY update_type
    `);

    return Object.fromEntries(result.rows.map(r => [r.update_type, r.last_update]));
  }

  /**
   * Clean up old update logs (keep last 30 days)
   */
  async cleanupOldLogs() {
    const db = await this.getDatabase();
    const cutoff = isUsingPostgres()
      ? `CURRENT_TIMESTAMP - INTERVAL '30 days'`
      : `datetime('now', '-30 days')`;
    const result = await db.query(`
      DELETE FROM etf_update_log
      WHERE started_at < ${cutoff}
    `);

    const changes = result.rowCount || result.changes || 0;
    if (changes > 0) {
      console.log(`[ETF Update] Cleaned up ${changes} old log entries`);
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
