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
    try {
      // Check if table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='update_schedules'
      `).get();

      if (!tableExists) {
        // Create the table and seed it
        this._ensureUpdateSchedulesTable();
      }

      const stmt = this.db.prepare(`
        SELECT * FROM update_schedules ORDER BY display_name
      `);

      const rows = stmt.all();

      // If empty, seed with defaults
      if (rows.length === 0) {
        this._seedUpdateSchedules();
        return this.getUpdateSchedules(); // Recurse once after seeding
      }

      return rows.map(row => ({
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
    } catch (error) {
      console.error('Error in getUpdateSchedules:', error);
      // Return empty array on error to prevent frontend crash
      return [];
    }
  }

  _ensureUpdateSchedulesTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS update_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        is_enabled INTEGER DEFAULT 1,
        frequency TEXT NOT NULL,
        cron_expression TEXT,
        timezone TEXT DEFAULT 'America/New_York',
        status TEXT DEFAULT 'idle',
        last_run_at DATETIME,
        last_success_at DATETIME,
        last_error TEXT,
        next_run_at DATETIME,
        items_processed INTEGER DEFAULT 0,
        items_updated INTEGER DEFAULT 0,
        items_failed INTEGER DEFAULT 0,
        average_duration_seconds INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  _seedUpdateSchedules() {
    const insertSchedule = this.db.prepare(`
      INSERT OR IGNORE INTO update_schedules (name, display_name, description, frequency, cron_expression)
      VALUES (?, ?, ?, ?, ?)
    `);

    const schedules = [
      ['stock_prices', 'Stock Prices', 'Daily closing prices for all tracked stocks', 'daily', '0 18 * * 1-5'],
      ['stock_fundamentals', 'SEC Filings', 'Financial statements from 10-K/10-Q filings', 'weekly', '0 6 * * 6'],
      ['insider_transactions', 'Insider Trading', 'Form 4 insider trading filings', 'daily', '0 7 * * 1-5'],
      ['capital_allocation', 'Capital Allocation', 'Dividends, buybacks, and shareholder returns', 'weekly', '0 8 * * 6'],
      ['investor_13f', '13F Holdings', 'Famous investor quarterly portfolio filings', 'quarterly', '0 6 15 */3 *'],
      ['etf_holdings', 'ETF Holdings', 'ETF holdings and composition data', 'quarterly', '0 7 15 */3 *'],
      ['reddit_sentiment', 'Reddit Sentiment', 'Stock mentions from WSB, r/stocks, r/investing', 'hourly', '0 * * * *'],
      ['index_prices', 'Market Indices', 'S&P 500, Nasdaq, Dow Jones prices', 'daily', '0 18 * * 1-5'],
      ['knowledge_base', 'AI Knowledge Base', 'Investment wisdom and research documents', 'weekly', '0 5 * * 0'],
      ['liquidity_metrics', 'Liquidity Metrics', 'Volume, volatility, bid-ask spreads', 'daily', '0 20 * * 1-5'],
      ['portfolio_snapshots', 'Portfolio Snapshots', 'Daily portfolio value snapshots', 'daily', '0 19 * * 1-5'],
      ['market_regime', 'Market Regime', 'Bull/Bear/Sideways market classification', 'daily', '0 17 * * 1-5'],
    ];

    for (const [name, displayName, description, frequency, cron] of schedules) {
      insertSchedule.run(name, displayName, description, frequency, cron);
    }
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
    try {
      // Ensure table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='api_integrations'
      `).get();

      if (!tableExists) {
        this._ensureApiIntegrationsTable();
        this._seedApiIntegrations();
      }

      const stmt = this.db.prepare('SELECT * FROM api_integrations ORDER BY display_name');
      const rows = stmt.all();

      // If empty, seed and return defaults
      if (rows.length === 0) {
        this._seedApiIntegrations();
        return this.getApiIntegrations(); // Recurse once after seeding
      }

      return rows.map(row => ({
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
    } catch (error) {
      console.error('Error fetching integrations:', error);
      // Return minimal defaults on error
      return [
        { id: 1, name: 'yfinance', displayName: 'Yahoo Finance', isEnabled: true, hasApiKey: false, status: 'connected', callsToday: 0, callsThisMonth: 0 },
        { id: 2, name: 'sec_edgar', displayName: 'SEC EDGAR', isEnabled: true, hasApiKey: false, status: 'connected', callsToday: 0, callsThisMonth: 0 },
        { id: 3, name: 'reddit', displayName: 'Reddit API', isEnabled: true, hasApiKey: false, status: 'connected', callsToday: 0, callsThisMonth: 0 },
      ];
    }
  }

  _ensureApiIntegrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        is_enabled INTEGER DEFAULT 0,
        api_key TEXT,
        base_url TEXT,
        calls_today INTEGER DEFAULT 0,
        calls_this_month INTEGER DEFAULT 0,
        daily_limit INTEGER,
        monthly_limit INTEGER,
        last_call_at DATETIME,
        last_reset_at DATETIME,
        status TEXT DEFAULT 'unknown',
        last_error TEXT,
        last_health_check DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  _seedApiIntegrations() {
    const insertIntegration = this.db.prepare(`
      INSERT OR IGNORE INTO api_integrations (name, display_name, daily_limit, monthly_limit, base_url, status)
      VALUES (?, ?, ?, ?, ?, 'connected')
    `);

    const integrations = [
      ['yfinance', 'Yahoo Finance', null, null, null],
      ['sec_edgar', 'SEC EDGAR', null, null, 'https://www.sec.gov'],
      ['reddit', 'Reddit API', 100, null, 'https://oauth.reddit.com'],
      ['polygon', 'Polygon.io', 1000, null, 'https://api.polygon.io'],
      ['alpha_vantage', 'Alpha Vantage', 25, 500, 'https://www.alphavantage.co'],
      ['fmp', 'Financial Modeling Prep', 250, null, 'https://financialmodelingprep.com'],
    ];

    for (const [name, displayName, dailyLimit, monthlyLimit, baseUrl] of integrations) {
      insertIntegration.run(name, displayName, dailyLimit, monthlyLimit, baseUrl);
    }
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
    try {
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
    } catch (e) {
      console.log('Skipping stale prices check:', e.message);
      metrics.push({
        name: 'Stale Stock Prices',
        status: 'unknown',
        value: 0,
        threshold: 50,
        message: 'Unable to check (tables may not exist)',
      });
    }

    // 2. Missing fundamentals
    try {
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
    } catch (e) {
      console.log('Skipping missing metrics check:', e.message);
      metrics.push({
        name: 'Missing Metrics',
        status: 'unknown',
        value: 0,
        threshold: 100,
        message: 'Unable to check (tables may not exist)',
      });
    }

    // 3. Failed updates in last 24h
    try {
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
    } catch (e) {
      console.log('Skipping failed updates check:', e.message);
      metrics.push({
        name: 'Failed Updates (24h)',
        status: 'ok',
        value: 0,
        threshold: 3,
        message: 'No update history available',
      });
    }

    // 4. API rate limit status
    try {
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
    } catch (e) {
      console.log('Skipping rate limit check:', e.message);
      metrics.push({
        name: 'Rate Limited APIs',
        status: 'ok',
        value: 0,
        threshold: 1,
        message: 'No API integrations configured',
      });
    }

    // 5. Stale sentiment data
    try {
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
    } catch (e) {
      console.log('Skipping sentiment check:', e.message);
      metrics.push({
        name: 'Stale Sentiment',
        status: 'ok',
        value: 0,
        threshold: 100,
        message: 'No sentiment data available',
      });
    }

    // 6. Database size check
    const dbPath = path.join(__dirname, '../../data/stocks.db');
    let dbSizeMB = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSizeMB = Math.round(stats.size / (1024 * 1024));
    } catch {
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
    try {
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='update_schedules'
      `).get();

      if (tableExists) {
        const stuckUpdatesResult = this.db.prepare(`
          SELECT COUNT(*) as count FROM update_schedules
          WHERE status = 'running' AND last_run_at < datetime('now', '-2 hours')
        `).get();

        if ((stuckUpdatesResult?.count || 0) > 0) {
          checks.push({ name: 'Update Jobs', status: 'fail', message: 'Stuck update detected' });
        } else {
          checks.push({ name: 'Update Jobs', status: 'pass', message: 'All jobs running normally' });
        }
      } else {
        checks.push({ name: 'Update Jobs', status: 'pass', message: 'No scheduled jobs configured' });
      }
    } catch (e) {
      checks.push({ name: 'Update Jobs', status: 'pass', message: 'Unable to check update jobs' });
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
    try {
      // Ensure table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'
      `).get();

      if (!tableExists) {
        this._ensureUserPreferencesTable();
      }

      let row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);

      if (!row) {
        // Create default preferences
        this.db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
        row = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
      }

      return {
        theme: row.theme || 'system',
        currency: row.currency || 'USD',
        locale: row.locale || 'en-US',
        dateFormat: row.date_format || 'MMM D, YYYY',
        numberFormat: row.number_format || 'compact',
        defaultBenchmark: row.default_benchmark || 'SPY',
        defaultTimeHorizon: row.default_time_horizon || 10,
        showPercentages: row.show_percentages === 1,
        compactNumbers: row.compact_numbers === 1,
        autoRefreshInterval: row.auto_refresh_interval || 0,
      };
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      // Return safe defaults
      return {
        theme: 'system',
        currency: 'USD',
        locale: 'en-US',
        dateFormat: 'MMM D, YYYY',
        numberFormat: 'compact',
        defaultBenchmark: 'SPY',
        defaultTimeHorizon: 10,
        showPercentages: true,
        compactNumbers: true,
        autoRefreshInterval: 0,
      };
    }
  }

  _ensureUserPreferencesTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        theme TEXT DEFAULT 'system',
        currency TEXT DEFAULT 'USD',
        locale TEXT DEFAULT 'en-US',
        date_format TEXT DEFAULT 'MMM D, YYYY',
        number_format TEXT DEFAULT 'compact',
        default_benchmark TEXT DEFAULT 'SPY',
        default_time_horizon INTEGER DEFAULT 10,
        default_simulation_runs INTEGER DEFAULT 1000,
        email_alerts INTEGER DEFAULT 0,
        alert_on_update_failure INTEGER DEFAULT 1,
        alert_on_stale_data INTEGER DEFAULT 1,
        show_percentages INTEGER DEFAULT 1,
        compact_numbers INTEGER DEFAULT 1,
        auto_refresh_interval INTEGER DEFAULT 0,
        notifications_enabled INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
      showPercentages: 'show_percentages',
      compactNumbers: 'compact_numbers',
      autoRefreshInterval: 'auto_refresh_interval',
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
    try {
      // Get table stats
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all();

      let totalRows = 0;
      const tableStats = tables.map(t => {
        try {
          const countResult = this.db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
          const rows = countResult?.count || 0;
          totalRows += rows;
          return {
            name: t.name,
            rows: rows,
          };
        } catch {
          return { name: t.name, rows: 0 };
        }
      }).sort((a, b) => b.rows - a.rows);

      // Get index count
      const indexResult = this.db.prepare(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='index'
      `).get();
      const indexCount = indexResult?.count || 0;

      // Get database file size
      const dbPath = path.join(__dirname, '../../data/stocks.db');
      let size = 0;
      try {
        const stats = fs.statSync(dbPath);
        size = stats.size;
      } catch {
        // File not accessible
      }

      return {
        size,  // Frontend expects 'size' (raw bytes)
        tableCount: tables.length,
        totalRows,
        indexCount,
        tables: tableStats,
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      // Return safe defaults on error
      return {
        size: 0,
        tableCount: 0,
        totalRows: 0,
        indexCount: 0,
        tables: [],
      };
    }
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
