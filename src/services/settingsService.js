// src/services/settingsService.js
// Settings & Support Hub service layer

const path = require('path');
const fs = require('fs');

class SettingsService {
  constructor(db) {
    this.db = db;
  }

  // =========================================================================
  // UPDATE SCHEDULES
  // =========================================================================

  getUpdateSchedules() {
    const stmt = this.db.prepare(`
      SELECT * FROM update_schedules ORDER BY display_name
    `);

    return stmt.all().map(row => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      isEnabled: row.is_enabled === 1,
      frequency: row.frequency,
      cronExpression: row.cron_expression,
      status: row.status,
      lastRunAt: row.last_run_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      nextRunAt: row.next_run_at,
      itemsProcessed: row.items_processed,
      itemsUpdated: row.items_updated,
      itemsFailed: row.items_failed,
      averageDurationSeconds: row.average_duration_seconds,
    }));
  }

  toggleUpdateSchedule(name, enabled) {
    const stmt = this.db.prepare(`
      UPDATE update_schedules
      SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `);
    const result = stmt.run(enabled ? 1 : 0, name);

    // Log the change
    this.log('info', 'update', `Update schedule "${name}" ${enabled ? 'enabled' : 'disabled'}`);

    return result.changes > 0;
  }

  getUpdateHistory(scheduleName = null, limit = 50) {
    let query = `
      SELECT * FROM settings_update_history
      ${scheduleName ? 'WHERE schedule_name = ?' : ''}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    const params = scheduleName ? [scheduleName, limit] : [limit];

    return stmt.all(...params).map(row => ({
      id: row.id,
      scheduleId: row.schedule_id,
      scheduleName: row.schedule_name,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      itemsProcessed: row.items_processed,
      itemsUpdated: row.items_updated,
      itemsFailed: row.items_failed,
      durationSeconds: row.duration_seconds,
      errorSummary: row.error_summary,
      errorDetails: row.error_details ? JSON.parse(row.error_details) : null,
      createdAt: row.created_at,
    }));
  }

  recordUpdateStart(name) {
    // Get schedule ID
    const schedule = this.db.prepare('SELECT id FROM update_schedules WHERE name = ?').get(name);
    if (!schedule) return null;

    // Update schedule status
    this.db.prepare(`
      UPDATE update_schedules
      SET status = 'running', last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `).run(name);

    // Create history entry
    const result = this.db.prepare(`
      INSERT INTO settings_update_history (schedule_id, schedule_name, started_at, status)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'running')
    `).run(schedule.id, name);

    return result.lastInsertRowid;
  }

  recordUpdateComplete(name, stats = {}) {
    const { itemsProcessed = 0, itemsUpdated = 0, itemsFailed = 0, historyId } = stats;

    // Update schedule
    this.db.prepare(`
      UPDATE update_schedules
      SET
        status = 'idle',
        last_success_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        items_processed = ?,
        items_updated = ?,
        items_failed = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `).run(itemsProcessed, itemsUpdated, itemsFailed, name);

    // Update history if ID provided
    if (historyId) {
      this.db.prepare(`
        UPDATE settings_update_history
        SET
          completed_at = CURRENT_TIMESTAMP,
          status = 'success',
          items_processed = ?,
          items_updated = ?,
          items_failed = ?,
          duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER)
        WHERE id = ?
      `).run(itemsProcessed, itemsUpdated, itemsFailed, historyId);
    }

    this.log('info', 'update', `Update "${name}" completed: ${itemsUpdated}/${itemsProcessed} updated`);
  }

  recordUpdateFailure(name, error, historyId = null) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update schedule
    this.db.prepare(`
      UPDATE update_schedules
      SET
        status = 'failed',
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `).run(errorMessage, name);

    // Update history if ID provided
    if (historyId) {
      this.db.prepare(`
        UPDATE settings_update_history
        SET
          completed_at = CURRENT_TIMESTAMP,
          status = 'failed',
          error_summary = ?,
          duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER)
        WHERE id = ?
      `).run(errorMessage, historyId);
    }

    this.log('error', 'update', `Update "${name}" failed: ${errorMessage}`);
  }

  // =========================================================================
  // API INTEGRATIONS
  // =========================================================================

  getApiIntegrations() {
    const stmt = this.db.prepare('SELECT * FROM api_integrations ORDER BY display_name');

    return stmt.all().map(row => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      isEnabled: row.is_enabled === 1,
      hasApiKey: !!row.api_key,
      baseUrl: row.base_url,
      callsToday: row.calls_today,
      callsThisMonth: row.calls_this_month,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      lastCallAt: row.last_call_at,
      status: row.status,
      lastError: row.last_error,
      lastHealthCheck: row.last_health_check,
    }));
  }

  updateApiKey(name, apiKey) {
    const stmt = this.db.prepare(`
      UPDATE api_integrations
      SET api_key = ?, is_enabled = 1, updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `);
    const result = stmt.run(apiKey, name);

    this.log('info', 'api', `API key updated for "${name}"`);
    return result.changes > 0;
  }

  getApiKey(name) {
    const stmt = this.db.prepare('SELECT api_key FROM api_integrations WHERE name = ?');
    const row = stmt.get(name);
    return row ? row.api_key : null;
  }

  async testApiConnection(name) {
    const stmt = this.db.prepare('SELECT * FROM api_integrations WHERE name = ?');
    const integration = stmt.get(name);

    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    if (!integration.api_key) {
      return { success: false, message: 'No API key configured' };
    }

    try {
      let testResult = false;
      let message = '';

      switch (name) {
        case 'alpha_vantage':
          testResult = await this.testAlphaVantage(integration.api_key);
          message = testResult ? 'Connection successful' : 'Invalid API key or rate limited';
          break;
        case 'fmp':
          testResult = await this.testFMP(integration.api_key);
          message = testResult ? 'Connection successful' : 'Invalid API key';
          break;
        case 'polygon':
          testResult = await this.testPolygon(integration.api_key);
          message = testResult ? 'Connection successful' : 'Invalid API key';
          break;
        default:
          testResult = true;
          message = 'Connection assumed OK (no test available)';
      }

      // Update status
      this.db.prepare(`
        UPDATE api_integrations
        SET status = ?, last_health_check = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `).run(testResult ? 'connected' : 'error', name);

      return { success: testResult, message };

    } catch (error) {
      const errorMessage = error.message || 'Connection test failed';

      this.db.prepare(`
        UPDATE api_integrations
        SET status = 'error', last_error = ?, last_health_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `).run(errorMessage, name);

      return { success: false, message: errorMessage };
    }
  }

  async testAlphaVantage(apiKey) {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey=${apiKey}`
    );
    const data = await response.json();
    return !data['Error Message'] && !data['Note'];
  }

  async testFMP(apiKey) {
    const response = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${apiKey}`
    );
    return response.ok;
  }

  async testPolygon(apiKey) {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${apiKey}`
    );
    return response.ok;
  }

  recordApiCall(name) {
    this.db.prepare(`
      UPDATE api_integrations
      SET
        calls_today = calls_today + 1,
        calls_this_month = calls_this_month + 1,
        last_call_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `).run(name);
  }

  resetDailyUsage() {
    this.db.prepare(`
      UPDATE api_integrations
      SET calls_today = 0, last_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).run();

    this.log('info', 'api', 'Daily API usage counters reset');
  }

  resetMonthlyUsage() {
    this.db.prepare(`
      UPDATE api_integrations
      SET calls_this_month = 0, updated_at = CURRENT_TIMESTAMP
    `).run();

    this.log('info', 'api', 'Monthly API usage counters reset');
  }

  // =========================================================================
  // DATA HEALTH
  // =========================================================================

  generateDataHealthReport() {
    const metrics = [];

    // 1. Stale stock prices (>3 trading days old)
    const staleStocksResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM companies c
      WHERE c.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM daily_prices dp
        WHERE dp.company_id = c.id
        AND dp.date >= date('now', '-5 days')
      )
    `).get();
    const staleStockCount = staleStocksResult?.count || 0;

    metrics.push({
      name: 'Stale Stock Prices',
      status: staleStockCount === 0 ? 'ok' : staleStockCount < 50 ? 'warning' : 'critical',
      value: staleStockCount,
      threshold: 50,
      message: staleStockCount === 0
        ? 'All stock prices are up to date'
        : `${staleStockCount} stocks haven't updated in 5+ days`,
    });

    // 2. Missing fundamentals
    const missingFundResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM companies c
      WHERE c.is_active = 1
      AND NOT EXISTS (
        SELECT 1 FROM calculated_metrics cm WHERE cm.company_id = c.id
      )
    `).get();
    const missingFundCount = missingFundResult?.count || 0;

    metrics.push({
      name: 'Missing Metrics',
      status: missingFundCount === 0 ? 'ok' : missingFundCount < 100 ? 'warning' : 'critical',
      value: missingFundCount,
      threshold: 100,
      message: missingFundCount === 0
        ? 'All stocks have calculated metrics'
        : `${missingFundCount} stocks missing calculated metrics`,
    });

    // 3. Failed updates in last 24h
    const failedUpdatesResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM settings_update_history
      WHERE status = 'failed' AND created_at > datetime('now', '-24 hours')
    `).get();
    const failedCount = failedUpdatesResult?.count || 0;

    metrics.push({
      name: 'Failed Updates (24h)',
      status: failedCount === 0 ? 'ok' : failedCount < 3 ? 'warning' : 'critical',
      value: failedCount,
      threshold: 3,
      message: failedCount === 0
        ? 'No failed updates in the last 24 hours'
        : `${failedCount} update jobs failed in the last 24 hours`,
    });

    // 4. API rate limit status
    const rateLimitedResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM api_integrations
      WHERE status = 'rate_limited'
    `).get();
    const rateLimitedCount = rateLimitedResult?.count || 0;

    metrics.push({
      name: 'Rate Limited APIs',
      status: rateLimitedCount === 0 ? 'ok' : 'warning',
      value: rateLimitedCount,
      threshold: 1,
      message: rateLimitedCount === 0
        ? 'No APIs are rate limited'
        : `${rateLimitedCount} API(s) are currently rate limited`,
    });

    // 5. Stale sentiment data
    const staleSentimentResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM combined_sentiment
      WHERE calculated_at < datetime('now', '-2 days')
    `).get();
    const staleSentimentCount = staleSentimentResult?.count || 0;

    metrics.push({
      name: 'Stale Sentiment',
      status: staleSentimentCount === 0 ? 'ok' : staleSentimentCount < 100 ? 'warning' : 'critical',
      value: staleSentimentCount,
      threshold: 100,
      message: staleSentimentCount === 0
        ? 'All sentiment data is fresh'
        : `${staleSentimentCount} stocks with stale sentiment data`,
    });

    // 6. Database size check
    const dbPath = path.join(__dirname, '../../data/stocks.db');
    let dbSizeMB = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSizeMB = Math.round(stats.size / (1024 * 1024));
    } catch (e) {
      // File not accessible
    }

    metrics.push({
      name: 'Database Size',
      status: dbSizeMB < 1000 ? 'ok' : dbSizeMB < 5000 ? 'warning' : 'critical',
      value: dbSizeMB,
      threshold: 5000,
      message: `Database is ${dbSizeMB} MB`,
    });

    // Determine overall status
    const hasWarning = metrics.some(m => m.status === 'warning');
    const hasCritical = metrics.some(m => m.status === 'critical');

    return {
      generatedAt: new Date().toISOString(),
      overall: hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy',
      metrics,
    };
  }

  runHealthCheck() {
    const checks = [];

    // 1. Database connection
    try {
      this.db.prepare('SELECT 1').get();
      checks.push({ name: 'Database', status: 'pass', message: 'Connected' });
    } catch (e) {
      checks.push({ name: 'Database', status: 'fail', message: 'Connection failed' });
    }

    // 2. Check for stuck updates (running > 2 hours)
    const stuckUpdatesResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM update_schedules
      WHERE status = 'running' AND last_run_at < datetime('now', '-2 hours')
    `).get();

    if ((stuckUpdatesResult?.count || 0) > 0) {
      checks.push({ name: 'Update Jobs', status: 'fail', message: 'Stuck update detected' });
    } else {
      checks.push({ name: 'Update Jobs', status: 'pass', message: 'All jobs running normally' });
    }

    // 3. Check data directory exists and is writable
    const dataDir = path.join(__dirname, '../../data');
    try {
      fs.accessSync(dataDir, fs.constants.W_OK);
      checks.push({ name: 'Storage', status: 'pass', message: 'Data directory writable' });
    } catch (e) {
      checks.push({ name: 'Storage', status: 'fail', message: 'Data directory not writable' });
    }

    const failCount = checks.filter(c => c.status === 'fail').length;

    return {
      overall: failCount === 0 ? 'healthy' : failCount === 1 ? 'degraded' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // USER PREFERENCES
  // =========================================================================

  getUserPreferences(userId = 'default') {
    let row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);

    if (!row) {
      // Create default preferences
      this.db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
      row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    }

    return {
      theme: row.theme,
      currency: row.currency,
      locale: row.locale,
      dateFormat: row.date_format,
      numberFormat: row.number_format,
      defaultBenchmark: row.default_benchmark,
      defaultTimeHorizon: row.default_time_horizon,
      defaultSimulationRuns: row.default_simulation_runs,
      emailAlerts: row.email_alerts === 1,
      alertOnUpdateFailure: row.alert_on_update_failure === 1,
      alertOnStaleData: row.alert_on_stale_data === 1,
      // New preference fields
      showPercentages: row.show_percentages === 1,
      compactNumbers: row.compact_numbers === 1,
      autoRefreshInterval: row.auto_refresh_interval || 0,
      notificationsEnabled: row.notifications_enabled === 1,
    };
  }

  updateUserPreferences(userId = 'default', prefs) {
    const fieldMap = {
      theme: 'theme',
      currency: 'currency',
      locale: 'locale',
      dateFormat: 'date_format',
      numberFormat: 'number_format',
      defaultBenchmark: 'default_benchmark',
      defaultTimeHorizon: 'default_time_horizon',
      defaultSimulationRuns: 'default_simulation_runs',
      emailAlerts: 'email_alerts',
      alertOnUpdateFailure: 'alert_on_update_failure',
      alertOnStaleData: 'alert_on_stale_data',
      // New preference fields
      showPercentages: 'show_percentages',
      compactNumbers: 'compact_numbers',
      autoRefreshInterval: 'auto_refresh_interval',
      notificationsEnabled: 'notifications_enabled',
    };

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(prefs)) {
      if (fieldMap[key] && value !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        // Convert booleans to integers for SQLite
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (updates.length === 0) return false;

    values.push(userId);
    const stmt = this.db.prepare(`
      UPDATE user_preferences
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  // =========================================================================
  // DATABASE & STORAGE
  // =========================================================================

  getDatabaseStats() {
    // Get table stats
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

    const tableStats = tables.map(t => {
      const countResult = this.db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
      return {
        name: t.name,
        rows: countResult.count,
      };
    }).sort((a, b) => b.rows - a.rows);

    // Get database file size
    const dbPath = path.join(__dirname, '../../data/stocks.db');
    let totalSize = '0 MB';
    try {
      const stats = fs.statSync(dbPath);
      const sizeMB = stats.size / (1024 * 1024);
      totalSize = sizeMB >= 1000
        ? `${(sizeMB / 1024).toFixed(2)} GB`
        : `${sizeMB.toFixed(2)} MB`;
    } catch (e) {
      // File not accessible
    }

    return {
      totalSize,
      tables: tableStats,
    };
  }

  // =========================================================================
  // DIAGNOSTICS
  // =========================================================================

  getSystemDiagnostics() {
    const dbStats = this.getDatabaseStats();

    // Get recent errors
    const recentErrors = this.db.prepare(`
      SELECT level, category, message, created_at
      FROM diagnostic_logs
      WHERE level IN ('error', 'warn')
      ORDER BY created_at DESC
      LIMIT 20
    `).all().map(r => ({
      level: r.level,
      category: r.category,
      message: r.message,
      timestamp: r.created_at,
    }));

    return {
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      database: {
        connected: true,
        size: dbStats.totalSize,
        tableCount: dbStats.tables.length,
      },
      recentErrors,
    };
  }

  // =========================================================================
  // LOGGING
  // =========================================================================

  log(level, category, message, details = null) {
    this.db.prepare(`
      INSERT INTO diagnostic_logs (level, category, message, details)
      VALUES (?, ?, ?, ?)
    `).run(level, category, message, details ? JSON.stringify(details) : null);
  }

  getLogs(options = {}) {
    const { level, category, limit = 100 } = options;

    let query = 'SELECT * FROM diagnostic_logs WHERE 1=1';
    const params = [];

    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params).map(r => ({
      id: r.id,
      level: r.level,
      category: r.category,
      message: r.message,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.created_at,
    }));
  }

  cleanupOldLogs(daysToKeep = 30) {
    const result = this.db.prepare(`
      DELETE FROM diagnostic_logs WHERE created_at < datetime('now', '-' || ? || ' days')
    `).run(daysToKeep);

    if (result.changes > 0) {
      this.log('info', 'maintenance', `Cleaned up ${result.changes} old log entries`);
    }

    return result.changes;
  }

  // =========================================================================
  // SYSTEM SETTINGS (Key-Value)
  // =========================================================================

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setSetting(key, value, description = null) {
    const jsonValue = JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO system_settings (key, value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = COALESCE(excluded.description, description),
        updated_at = CURRENT_TIMESTAMP
    `).run(key, jsonValue, description);
  }

  getAllSettings() {
    return this.db.prepare('SELECT * FROM system_settings ORDER BY key').all().map(r => ({
      key: r.key,
      value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(),
      description: r.description,
      updatedAt: r.updated_at,
    }));
  }
}

// Factory function to create service instance
function createSettingsService(db) {
  return new SettingsService(db);
}

module.exports = { SettingsService, createSettingsService };
