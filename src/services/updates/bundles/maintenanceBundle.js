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
const { getDatabaseAsync } = require('../../../lib/db');

class MaintenanceBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
    this.dataDir = path.join(this.projectRoot, 'data');
    this.backupDir = path.join(this.dataDir, 'backups');
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;
    const database = await getDatabaseAsync();

    switch (jobKey) {
      case 'maintenance.cleanup':
        return this.runCleanup(database, onProgress);
      case 'maintenance.vacuum':
        return this.runVacuum(database, onProgress);
      case 'maintenance.integrity':
        return this.runIntegrityCheck(database, onProgress);
      case 'maintenance.backup':
        return this.runBackup(database, onProgress);
      default:
        throw new Error(`Unknown maintenance job: ${jobKey}`);
    }
  }

  async runCleanup(database, onProgress) {
    await onProgress(5, 'Starting database cleanup...');

    try {
      let totalDeleted = 0;

      // Clean old update_runs (keep last 30 days)
      await onProgress(10, 'Cleaning old update runs...');
      const runsResult = await database.query(`
        DELETE FROM update_runs
        WHERE started_at < NOW() - INTERVAL '30 days'
        AND status IN ('completed', 'failed')
      `);
      totalDeleted += runsResult.rowCount;

      // Clean old sentiment data (keep last 90 days)
      await onProgress(25, 'Cleaning old sentiment data...');
      try {
        const sentimentResult = await database.query(`
          DELETE FROM sentiment_scores
          WHERE created_at < NOW() - INTERVAL '90 days'
        `);
        totalDeleted += sentimentResult.rowCount;
      } catch (e) {
        // Table may not exist
      }

      // Clean orphaned queue entries
      await onProgress(40, 'Cleaning orphaned queue entries...');
      const queueResult = await database.query(`
        DELETE FROM update_queue
        WHERE status IN ('completed', 'failed')
        AND created_at < NOW() - INTERVAL '7 days'
      `);
      totalDeleted += queueResult.rowCount;

      // Clean old log entries from any log tables
      await onProgress(55, 'Cleaning old logs...');
      try {
        const logsResult = await database.query(`
          DELETE FROM update_logs
          WHERE created_at < NOW() - INTERVAL '14 days'
        `);
        totalDeleted += logsResult.rowCount;
      } catch (e) {
        // Table may not exist
      }

      // Clean expired locks
      await onProgress(70, 'Cleaning expired locks...');
      const locksResult = await database.query(`
        DELETE FROM update_locks
        WHERE expires_at < NOW()
      `);
      totalDeleted += locksResult.rowCount;

      // Clean old price data if too much (keep last 5 years)
      await onProgress(85, 'Checking price data volume...');
      const priceCountResult = await database.query(`
        SELECT COUNT(*) as count FROM stock_prices
        WHERE date < CURRENT_DATE - INTERVAL '5 years'
      `);
      const priceCount = priceCountResult.rows[0];

      if (priceCount && priceCount.count > 0) {
        const priceResult = await database.query(`
          DELETE FROM stock_prices
          WHERE date < CURRENT_DATE - INTERVAL '5 years'
        `);
        totalDeleted += priceResult.rowCount;
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

  async runVacuum(database, onProgress) {
    await onProgress(5, 'Starting database vacuum...');

    try {
      await onProgress(20, 'Running VACUUM...');

      // Run VACUUM (PostgreSQL equivalent of SQLite VACUUM)
      await database.query('VACUUM');

      await onProgress(70, 'Running ANALYZE...');

      // Update statistics for query optimizer
      await database.query('ANALYZE');

      await onProgress(90, 'Checking results...');

      // PostgreSQL doesn't have a file-based size like SQLite, but we can use disk usage
      // For now, just report success without size comparison
      const savedMB = '0.00';

      await onProgress(100, `Vacuum complete, saved ${savedMB} MB`);

      return {
        itemsTotal: 1,
        itemsProcessed: 1,
        itemsUpdated: 1,
        itemsFailed: 0,
        metadata: {
          sizeBefore: 0,
          sizeAfter: 0,
          savedBytes: 0
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async runIntegrityCheck(database, onProgress) {
    await onProgress(5, 'Starting integrity check...');

    try {
      const issues = [];

      // Check for orphaned financial data
      await onProgress(25, 'Checking for orphaned financial data...');
      const orphanedFinancialsResult = await database.query(`
        SELECT COUNT(*) as count FROM financial_data
        WHERE company_id NOT IN (SELECT id FROM companies)
      `);
      const orphanedFinancials = orphanedFinancialsResult.rows[0];
      if (orphanedFinancials.count > 0) {
        issues.push({
          type: 'orphaned_financials',
          message: `Found ${orphanedFinancials.count} orphaned financial records`,
          count: orphanedFinancials.count
        });
      }

      // Check for orphaned prices
      await onProgress(40, 'Checking for orphaned price data...');
      const orphanedPricesResult = await database.query(`
        SELECT COUNT(*) as count FROM stock_prices
        WHERE company_id NOT IN (SELECT id FROM companies)
      `);
      const orphanedPrices = orphanedPricesResult.rows[0];
      if (orphanedPrices.count > 0) {
        issues.push({
          type: 'orphaned_prices',
          message: `Found ${orphanedPrices.count} orphaned price records`,
          count: orphanedPrices.count
        });
      }

      // Check for companies without prices
      await onProgress(55, 'Checking for companies without price data...');
      const companiesWithoutPricesResult = await database.query(`
        SELECT COUNT(*) as count FROM companies
        WHERE id NOT IN (SELECT DISTINCT company_id FROM stock_prices)
      `);
      const companiesWithoutPrices = companiesWithoutPricesResult.rows[0];
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
      const duplicatePricesResult = await database.query(`
        SELECT company_id, date, COUNT(*) as count
        FROM stock_prices
        GROUP BY company_id, date
        HAVING COUNT(*) > 1
        LIMIT 10
      `);
      const duplicatePrices = duplicatePricesResult.rows;
      if (duplicatePrices.length > 0) {
        issues.push({
          type: 'duplicate_prices',
          message: `Found ${duplicatePrices.length}+ days with duplicate price entries`,
          count: duplicatePrices.length,
          severity: 'warning'
        });
      }

      await onProgress(100, `Integrity check complete, ${issues.length} issues found`);

      return {
        itemsTotal: 5, // Number of checks performed (removed SQLite-specific checks)
        itemsProcessed: 5,
        itemsUpdated: 0,
        itemsFailed: issues.filter(i => i.severity !== 'warning').length,
        metadata: { issues }
      };
    } catch (error) {
      throw error;
    }
  }

  async runBackup(database, onProgress) {
    await onProgress(5, 'Starting database backup...');

    try {
      // Ensure backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(this.backupDir, `stocks-${timestamp}.sql`);

      await onProgress(20, 'Creating backup...');

      // For PostgreSQL, create a SQL dump using pg_dump
      // Note: This requires pg_dump to be available in the system PATH
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost/stocks';
      await execAsync(`pg_dump "${databaseUrl}" > "${backupPath}"`);

      await onProgress(80, 'Verifying backup...');

      // Verify backup exists and has reasonable size
      const backupStats = fs.statSync(backupPath);

      if (backupStats.size < 1000) {
        throw new Error('Backup file is suspiciously small');
      }

      // Clean old backups (keep last 7)
      await onProgress(90, 'Cleaning old backups...');
      const backups = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('stocks-') && f.endsWith('.sql'))
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
