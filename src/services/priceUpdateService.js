/**
 * Price Update Service
 * Node.js integration for the Python price update system
 */

const { spawn } = require('child_process');
const path = require('path');

class PriceUpdateService {
  constructor(db) {
    this.db = db;
    this.pythonScript = path.join(__dirname, '../../python-services/price_updater.py');
    this.dbPath = path.join(__dirname, '../../data/stocks.db');
  }

  /**
   * Get update statistics from database
   */
  getUpdateStats() {
    const overall = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_price_update >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
        SUM(CASE WHEN last_price_update >= date('now', '-3 days') THEN 1 ELSE 0 END) as fresh_3d,
        SUM(CASE WHEN last_price_update >= date('now', '-7 days') THEN 1 ELSE 0 END) as fresh_7d,
        SUM(CASE WHEN last_price_update IS NULL THEN 1 ELSE 0 END) as never_updated
      FROM companies
      WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
    `).get();

    const byTier = this.db.prepare(`
      SELECT
        update_tier,
        COUNT(*) as total,
        SUM(CASE WHEN last_price_update >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
        ROUND(AVG(julianday('now') - julianday(last_price_update)), 1) as avg_age_days
      FROM companies
      WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
      GROUP BY update_tier
      ORDER BY update_tier
    `).all();

    const recentRuns = this.db.prepare(`
      SELECT * FROM price_update_log
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

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
  getTodaysSchedule() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
    const dayOfMonth = today.getDate();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { scheduled: [], message: 'Weekend - no updates scheduled' };
    }

    // Convert to Mon=0 format
    const weekday = dayOfWeek - 1;

    const scheduled = this.db.prepare(`
      SELECT
        update_tier,
        COUNT(*) as count
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol != ''
        AND symbol NOT LIKE 'CIK_%'
        AND (
          (update_tier = 1)
          OR (update_tier = 2 AND (id % 2) = (? % 2))
          OR (update_tier = 3 AND (id % 3) = (? % 3))
          OR (update_tier = 4 AND (id % 5) = ?)
        )
      GROUP BY update_tier
      ORDER BY update_tier
    `).all(dayOfMonth, dayOfMonth, weekday);

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
  getStaleCompanies(limit = 100) {
    return this.db.prepare(`
      SELECT
        c.id,
        c.symbol,
        c.name,
        c.update_tier,
        c.last_price_update,
        julianday('now') - julianday(c.last_price_update) as days_stale
      FROM companies c
      WHERE c.symbol IS NOT NULL
        AND c.symbol NOT LIKE 'CIK_%'
        AND (
          (c.update_tier = 1 AND (c.last_price_update < date('now', '-2 days') OR c.last_price_update IS NULL))
          OR (c.update_tier = 2 AND (c.last_price_update < date('now', '-4 days') OR c.last_price_update IS NULL))
          OR (c.update_tier = 3 AND (c.last_price_update < date('now', '-5 days') OR c.last_price_update IS NULL))
          OR (c.update_tier = 4 AND (c.last_price_update < date('now', '-10 days') OR c.last_price_update IS NULL))
        )
      ORDER BY c.update_tier ASC, days_stale DESC NULLS FIRST
      LIMIT ?
    `).all(limit);
  }

  /**
   * Run Python command
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
   * Trigger daily price update (runs in background)
   */
  async runDailyUpdate() {
    return this._runPythonCommand('update');
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
