// src/services/updates/bundles/maintenanceBundle.js
/**
 * Maintenance Update Bundle
 *
 * Handles all database maintenance jobs:
 * - maintenance.cleanup - Clean old data
 * - maintenance.vacuum - Database optimization
 * - maintenance.integrity - Data integrity checks
 * - maintenance.backup - Database backup
 */

const path = require('path');
const fs = require('fs');

class MaintenanceBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
    this.dataDir = path.join(this.projectRoot, 'data');
    this.backupDir = path.join(this.dataDir, 'backups');
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'maintenance.cleanup':
        return this.runCleanup(db, onProgress);
      case 'maintenance.vacuum':
        return this.runVacuum(db, onProgress);
      case 'maintenance.integrity':
        return this.runIntegrityCheck(db, onProgress);
      case 'maintenance.backup':
        return this.runBackup(db, onProgress);
      default:
        throw new Error(`Unknown maintenance job: ${jobKey}`);
    }
  }

  async runCleanup(db, onProgress) {
    await onProgress(5, 'Starting database cleanup...');

    try {
      let totalDeleted = 0;

      // Clean old update_runs (keep last 30 days)
      await onProgress(10, 'Cleaning old update runs...');
      const runsResult = db.prepare(`
        DELETE FROM update_runs
        WHERE started_at < datetime('now', '-30 days')
        AND status IN ('completed', 'failed')
      `).run();
      totalDeleted += runsResult.changes;

      // Clean old sentiment data (keep last 90 days)
      await onProgress(25, 'Cleaning old sentiment data...');
      try {
        const sentimentResult = db.prepare(`
          DELETE FROM sentiment_scores
          WHERE created_at < datetime('now', '-90 days')
        `).run();
        totalDeleted += sentimentResult.changes;
      } catch (e) {
        // Table may not exist
      }

      // Clean orphaned queue entries
      await onProgress(40, 'Cleaning orphaned queue entries...');
      const queueResult = db.prepare(`
        DELETE FROM update_queue
        WHERE status IN ('completed', 'failed')
        AND created_at < datetime('now', '-7 days')
      `).run();
      totalDeleted += queueResult.changes;

      // Clean old log entries from any log tables
      await onProgress(55, 'Cleaning old logs...');
      try {
        const logsResult = db.prepare(`
          DELETE FROM update_logs
          WHERE created_at < datetime('now', '-14 days')
        `).run();
        totalDeleted += logsResult.changes;
      } catch (e) {
        // Table may not exist
      }

      // Clean expired locks
      await onProgress(70, 'Cleaning expired locks...');
      const locksResult = db.prepare(`
        DELETE FROM update_locks
        WHERE expires_at < datetime('now')
      `).run();
      totalDeleted += locksResult.changes;

      // Clean old price data if too much (keep last 5 years)
      await onProgress(85, 'Checking price data volume...');
      const priceCount = db.prepare(`
        SELECT COUNT(*) as count FROM stock_prices
        WHERE date < date('now', '-5 years')
      `).get();

      if (priceCount && priceCount.count > 0) {
        const priceResult = db.prepare(`
          DELETE FROM stock_prices
          WHERE date < date('now', '-5 years')
        `).run();
        totalDeleted += priceResult.changes;
      }

      await onProgress(100, 'Cleanup complete');

      return {
        itemsTotal: totalDeleted,
        itemsProcessed: totalDeleted,
        itemsUpdated: totalDeleted,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  async runVacuum(db, onProgress) {
    await onProgress(5, 'Starting database vacuum...');

    try {
      // Get database size before
      const dbPath = path.join(this.dataDir, 'stocks.db');
      let sizeBefore = 0;
      try {
        const stats = fs.statSync(dbPath);
        sizeBefore = stats.size;
      } catch (e) {
        // Ignore
      }

      await onProgress(20, 'Running VACUUM...');

      // Run vacuum (this can take a while for large databases)
      db.exec('VACUUM');

      await onProgress(70, 'Running ANALYZE...');

      // Update statistics for query optimizer
      db.exec('ANALYZE');

      await onProgress(90, 'Checking results...');

      // Get database size after
      let sizeAfter = 0;
      try {
        const stats = fs.statSync(dbPath);
        sizeAfter = stats.size;
      } catch (e) {
        // Ignore
      }

      const savedBytes = sizeBefore - sizeAfter;
      const savedMB = (savedBytes / (1024 * 1024)).toFixed(2);

      await onProgress(100, `Vacuum complete, saved ${savedMB} MB`);

      return {
        itemsTotal: 1,
        itemsProcessed: 1,
        itemsUpdated: 1,
        itemsFailed: 0,
        metadata: {
          sizeBefore,
          sizeAfter,
          savedBytes
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async runIntegrityCheck(db, onProgress) {
    await onProgress(5, 'Starting integrity check...');

    try {
      const issues = [];

      // Check SQLite integrity
      await onProgress(10, 'Checking SQLite integrity...');
      const integrityResult = db.prepare('PRAGMA integrity_check').all();
      if (integrityResult[0]?.integrity_check !== 'ok') {
        issues.push({
          type: 'sqlite_integrity',
          message: 'SQLite integrity check failed',
          details: integrityResult
        });
      }

      // Check for orphaned financial data
      await onProgress(25, 'Checking for orphaned financial data...');
      const orphanedFinancials = db.prepare(`
        SELECT COUNT(*) as count FROM financial_data
        WHERE company_id NOT IN (SELECT id FROM companies)
      `).get();
      if (orphanedFinancials.count > 0) {
        issues.push({
          type: 'orphaned_financials',
          message: `Found ${orphanedFinancials.count} orphaned financial records`,
          count: orphanedFinancials.count
        });
      }

      // Check for orphaned prices
      await onProgress(40, 'Checking for orphaned price data...');
      const orphanedPrices = db.prepare(`
        SELECT COUNT(*) as count FROM stock_prices
        WHERE company_id NOT IN (SELECT id FROM companies)
      `).get();
      if (orphanedPrices.count > 0) {
        issues.push({
          type: 'orphaned_prices',
          message: `Found ${orphanedPrices.count} orphaned price records`,
          count: orphanedPrices.count
        });
      }

      // Check for companies without prices
      await onProgress(55, 'Checking for companies without price data...');
      const companiesWithoutPrices = db.prepare(`
        SELECT COUNT(*) as count FROM companies
        WHERE id NOT IN (SELECT DISTINCT company_id FROM stock_prices)
      `).get();
      if (companiesWithoutPrices.count > 0) {
        issues.push({
          type: 'missing_prices',
          message: `Found ${companiesWithoutPrices.count} companies without price data`,
          count: companiesWithoutPrices.count,
          severity: 'warning'
        });
      }

      // Check for duplicate entries
      await onProgress(70, 'Checking for duplicate prices...');
      const duplicatePrices = db.prepare(`
        SELECT company_id, date, COUNT(*) as count
        FROM stock_prices
        GROUP BY company_id, date
        HAVING COUNT(*) > 1
        LIMIT 10
      `).all();
      if (duplicatePrices.length > 0) {
        issues.push({
          type: 'duplicate_prices',
          message: `Found ${duplicatePrices.length}+ days with duplicate price entries`,
          count: duplicatePrices.length,
          severity: 'warning'
        });
      }

      // Check foreign key constraints
      await onProgress(85, 'Checking foreign key constraints...');
      const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
      if (fkViolations.length > 0) {
        issues.push({
          type: 'fk_violations',
          message: `Found ${fkViolations.length} foreign key violations`,
          count: fkViolations.length
        });
      }

      await onProgress(100, `Integrity check complete, ${issues.length} issues found`);

      return {
        itemsTotal: 6, // Number of checks performed
        itemsProcessed: 6,
        itemsUpdated: 0,
        itemsFailed: issues.filter(i => i.severity !== 'warning').length,
        metadata: { issues }
      };
    } catch (error) {
      throw error;
    }
  }

  async runBackup(db, onProgress) {
    await onProgress(5, 'Starting database backup...');

    try {
      // Ensure backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const dbPath = path.join(this.dataDir, 'stocks.db');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(this.backupDir, `stocks-${timestamp}.db`);

      await onProgress(20, 'Creating backup...');

      // Use SQLite backup API via better-sqlite3
      db.backup(backupPath);

      await onProgress(80, 'Verifying backup...');

      // Verify backup exists and has reasonable size
      const backupStats = fs.statSync(backupPath);
      const originalStats = fs.statSync(dbPath);

      if (backupStats.size < originalStats.size * 0.9) {
        throw new Error('Backup file is suspiciously small');
      }

      // Clean old backups (keep last 7)
      await onProgress(90, 'Cleaning old backups...');
      const backups = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('stocks-') && f.endsWith('.db'))
        .sort()
        .reverse();

      for (let i = 7; i < backups.length; i++) {
        fs.unlinkSync(path.join(this.backupDir, backups[i]));
      }

      const sizeMB = (backupStats.size / (1024 * 1024)).toFixed(2);
      await onProgress(100, `Backup complete: ${sizeMB} MB`);

      return {
        itemsTotal: 1,
        itemsProcessed: 1,
        itemsUpdated: 1,
        itemsFailed: 0,
        metadata: {
          backupPath,
          size: backupStats.size,
          timestamp
        }
      };
    } catch (error) {
      throw error;
    }
  }
}

const maintenanceBundle = new MaintenanceBundle();

module.exports = {
  execute: (jobKey, db, context) => maintenanceBundle.execute(jobKey, db, context)
};
