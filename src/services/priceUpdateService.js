/**
 * Price Update Service
 * Node.js integration for the Python price update system
 */

const { spawn } = require('child_process');
const path = require('path');
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

class PriceUpdateService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.pythonScript = path.join(__dirname, '../../python-services/price_updater.py');
    this.dbPath = path.join(__dirname, '../../data/stocks.db');
  }

  /**
   * Get update statistics from database
   */
  async getUpdateStats() {
    const database = await getDatabaseAsync();

    const overallResult = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_price_update >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
        SUM(CASE WHEN last_price_update >= date('now', '-3 days') THEN 1 ELSE 0 END) as fresh_3d,
        SUM(CASE WHEN last_price_update >= date('now', '-7 days') THEN 1 ELSE 0 END) as fresh_7d,
        SUM(CASE WHEN last_price_update IS NULL THEN 1 ELSE 0 END) as never_updated
      FROM companies
      WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
    `);
    const overall = overallResult.rows[0];

    // Use dialect-aware date functions
    const date1dAgo = isUsingPostgres()
      ? `CURRENT_DATE - INTERVAL '1 day'`
      : `date('now', '-1 day')`;
    const avgAgeDays = isUsingPostgres()
      ? `ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - last_price_update)) / 86400)::numeric, 1)`
      : `ROUND(AVG(julianday('now') - julianday(last_price_update)), 1)`;

    const byTierResult = await database.query(`
      SELECT
        update_tier,
        COUNT(*) as total,
        SUM(CASE WHEN last_price_update >= ${date1dAgo} THEN 1 ELSE 0 END) as fresh_1d,
        ${avgAgeDays} as avg_age_days
      FROM companies
      WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
      GROUP BY update_tier
      ORDER BY update_tier
    `);
    const byTier = byTierResult.rows;

    const recentRunsResult = await database.query(`
      SELECT * FROM price_update_log
      ORDER BY created_at DESC
      LIMIT 10
    `);
    const recentRuns = recentRunsResult.rows;

    const tierNames = {
      1: 'Core (Daily)',
      2: 'Active (2-day)',
      3: 'Tracked (3-day)',
      4: 'Archive (Weekly)'
    };

    return {
      overall,
      byTier: byTier.map(t => ({
        ...t,
        tier_name: tierNames[t.update_tier] || 'Unknown'
      })),
      recentRuns
    };
  }

  /**
   * Get companies scheduled for today
   */
  async getTodaysSchedule() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
    const dayOfMonth = today.getDate();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { scheduled: [], message: 'Weekend - no updates scheduled' };
    }

    // Convert to Mon=0 format
    const weekday = dayOfWeek - 1;

    const database = await getDatabaseAsync();

    const scheduledResult = await database.query(`
      SELECT
        update_tier,
        COUNT(*) as count
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol != ''
        AND symbol NOT LIKE 'CIK_%'
        AND (
          (update_tier = 1)
          OR (update_tier = 2 AND (id % 2) = ($1 % 2))
          OR (update_tier = 3 AND (id % 3) = ($2 % 3))
          OR (update_tier = 4 AND (id % 5) = $3)
        )
      GROUP BY update_tier
      ORDER BY update_tier
    `, [dayOfMonth, dayOfMonth, weekday]);
    const scheduled = scheduledResult.rows;

    const tierNames = {
      1: 'Core (Daily)',
      2: 'Active (2-day)',
      3: 'Tracked (3-day)',
      4: 'Archive (Weekly)'
    };

    const total = scheduled.reduce((sum, t) => sum + t.count, 0);

    return {
      date: today.toISOString().split('T')[0],
      total,
      scheduled: scheduled.map(t => ({
        tier: t.update_tier,
        name: tierNames[t.update_tier] || 'Unknown',
        count: t.count
      }))
    };
  }

  /**
   * Get stale companies that need backfill
   */
  async getStaleCompanies(limit = 100) {
    const database = await getDatabaseAsync();

    // Dialect-aware date functions
    const daysStale = isUsingPostgres()
      ? `EXTRACT(EPOCH FROM (NOW() - c.last_price_update)) / 86400`
      : `julianday('now') - julianday(c.last_price_update)`;
    const date2daysAgo = isUsingPostgres() ? `CURRENT_DATE - INTERVAL '2 days'` : `date('now', '-2 days')`;
    const date4daysAgo = isUsingPostgres() ? `CURRENT_DATE - INTERVAL '4 days'` : `date('now', '-4 days')`;
    const date5daysAgo = isUsingPostgres() ? `CURRENT_DATE - INTERVAL '5 days'` : `date('now', '-5 days')`;
    const date10daysAgo = isUsingPostgres() ? `CURRENT_DATE - INTERVAL '10 days'` : `date('now', '-10 days')`;

    const result = await database.query(`
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.update_tier,
        c.last_price_update,
        ${daysStale} as days_stale
      FROM companies c
      WHERE c.symbol IS NOT NULL
        AND c.symbol NOT LIKE 'CIK_%'
        AND (
          (c.update_tier = 1 AND (c.last_price_update < ${date2daysAgo} OR c.last_price_update IS NULL))
          OR (c.update_tier = 2 AND (c.last_price_update < ${date4daysAgo} OR c.last_price_update IS NULL))
          OR (c.update_tier = 3 AND (c.last_price_update < ${date5daysAgo} OR c.last_price_update IS NULL))
          OR (c.update_tier = 4 AND (c.last_price_update < ${date10daysAgo} OR c.last_price_update IS NULL))
        )
      ORDER BY c.update_tier ASC, days_stale DESC NULLS FIRST
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Run Python command (waits for completion)
   */
  _runPythonCommand(command) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        this.pythonScript,
        '--db', this.dbPath,
        command
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Run Python command in background (returns immediately)
   */
  _runPythonCommandBackground(command) {
    const pythonProcess = spawn('python3', [
      this.pythonScript,
      '--db', this.dbPath,
      command
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Log output but don't wait
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[PriceUpdate:${command}] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[PriceUpdate:${command}] ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[PriceUpdate:${command}] Process exited with code ${code}`);
    });

    // Unref so Node doesn't wait for child process
    pythonProcess.unref();

    return { pid: pythonProcess.pid, started: true };
  }

  /**
   * Trigger daily price update (waits for completion)
   */
  async runDailyUpdate() {
    return this._runPythonCommand('update');
  }

  /**
   * Trigger daily price update (runs in background, returns immediately)
   */
  runDailyUpdateBackground() {
    return this._runPythonCommandBackground('update');
  }

  /**
   * Run dry-run to see what would be updated
   */
  async runDryRun() {
    return this._runPythonCommand('dry-run');
  }

  /**
   * Run backfill for stale companies
   */
  async runBackfill() {
    return this._runPythonCommand('backfill');
  }

  /**
   * Recalculate tier assignments
   */
  async recalculateTiers() {
    return this._runPythonCommand('recalculate-tiers');
  }
}

module.exports = PriceUpdateService;
