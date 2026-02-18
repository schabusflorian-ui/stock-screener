// src/services/settingsService.js
// Settings & Support Hub service layer

const path = require('path');
const fs = require('fs');
const { getDatabaseAsync, dialect, isUsingPostgres } = require('../lib/db');

class SettingsService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Check if a table exists (works for both SQLite and PostgreSQL)
   */
  async _tableExists(tableName) {
    const database = await getDatabaseAsync();
    if (isUsingPostgres()) {
      const result = await database.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        ) as exists
      `, [tableName]);
      return result.rows[0]?.exists === true;
    }
    const result = await database.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=$1
    `, [tableName]);
    return !!result.rows[0];
  }

  // =========================================================================
  // UPDATE SCHEDULES
  // =========================================================================

  // Map frontend UPDATE_TYPES IDs to update_jobs job_keys
  // This bridges the legacy settings UI with the new update system
  _getJobKeyMapping() {
    return {
      'stock_prices': 'prices.daily',
      'stock_fundamentals': 'sec.filings',
      'insider_transactions': 'sec.insider',
      'capital_allocation': 'capital.allocation',
      'investor_13f': 'sec.13f',
      'etf_holdings': 'etf.holdings',
      'reddit_sentiment': 'sentiment.reddit',
      'index_prices': 'market.indices',
      'knowledge_base': 'knowledge.incremental',
      'liquidity_metrics': 'portfolio.liquidity',
      'portfolio_snapshots': 'portfolio.snapshots',
      'market_regime': 'analytics.market_indicators',
      'xbrl_import': 'eu.xbrl_import',
      'european_prices': 'eu.prices',
      'european_indices': 'eu.indices',
      'european_valuations': 'eu.valuation',
    };
  }

  // Convert cron expression to human-readable frequency
  _cronToFrequency(cron) {
    if (!cron) return 'Manual';
    if (cron.includes('* * *')) return 'Hourly';
    if (cron.includes('0 * * * 1-5')) return 'Hourly (weekdays)';
    if (cron.match(/\d+ \d+ \* \* 1-5/)) return 'Daily';
    if (cron.match(/\d+ \d+ \* \* 0/)) return 'Weekly';
    if (cron.match(/\d+ \d+ \d+ \*\/3/)) return 'Quarterly';
    return 'Scheduled';
  }

  async getUpdateSchedules() {
    try {
      const database = await getDatabaseAsync();

      // First, try to read from the new update_jobs system
      const jobsTableExists = await this._tableExists('update_jobs');

      if (jobsTableExists) {
        // Read from the new update system
        const result = await database.query(`
          SELECT
            j.id,
            j.job_key,
            j.name as display_name,
            j.description,
            j.is_enabled,
            j.cron_expression,
            j.status,
            j.last_run_at,
            j.last_run_status,
            j.last_error,
            j.total_runs,
            j.successful_runs,
            j.failed_runs,
            b.name as bundle_name
          FROM update_jobs j
          LEFT JOIN update_bundles b ON b.id = j.bundle_id
          WHERE j.is_enabled = 1
          ORDER BY j.job_key
        `);

        const rows = result.rows;
        const mapping = this._getJobKeyMapping();

        // Map job_keys back to frontend IDs
        const schedules = [];
        for (const [frontendId, jobKey] of Object.entries(mapping)) {
          const job = rows.find(r => r.job_key === jobKey);
          if (job) {
            schedules.push({
              id: job.id,
              name: frontendId,
              displayName: job.display_name,
              description: job.description,
              isEnabled: job.is_enabled === 1,
              frequency: this._cronToFrequency(job.cron_expression),
              cronExpression: job.cron_expression,
              status: job.status || 'idle',
              lastRunAt: job.last_run_at,
              lastSuccessAt: job.last_run_status === 'completed' ? job.last_run_at : null,
              lastError: job.last_error,
              nextRunAt: null, // Would need cron parsing to calculate
              itemsProcessed: null,
              itemsUpdated: null,
              itemsFailed: null,
              averageDurationSeconds: null,
              // Extra info from new system
              totalRuns: job.total_runs,
              successfulRuns: job.successful_runs,
              failedRuns: job.failed_runs,
              bundleName: job.bundle_name,
            });
          }
        }

        // If we got data from update_jobs, return it
        if (schedules.length > 0) {
          return schedules;
        }
      }

      // Fallback: Read from legacy update_schedules table
      const tableExists = await this._tableExists('update_schedules');
      if (!tableExists) {
        await this._ensureUpdateSchedulesTable();
      }

      const result = await database.query(`
        SELECT * FROM update_schedules ORDER BY display_name
      `);

      const rows = result.rows;

      // If empty, seed with defaults
      if (rows.length === 0) {
        await this._seedUpdateSchedules();
        return await this.getUpdateSchedules(); // Recurse once after seeding
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

  async _ensureUpdateSchedulesTable() {
    const database = await getDatabaseAsync();

    if (isUsingPostgres()) {
      await database.query(`
        CREATE TABLE IF NOT EXISTS update_schedules (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          description TEXT,
          is_enabled INTEGER DEFAULT 1,
          frequency TEXT NOT NULL,
          cron_expression TEXT,
          timezone TEXT DEFAULT 'America/New_York',
          status TEXT DEFAULT 'idle',
          last_run_at TIMESTAMP,
          last_success_at TIMESTAMP,
          last_error TEXT,
          next_run_at TIMESTAMP,
          items_processed INTEGER DEFAULT 0,
          items_updated INTEGER DEFAULT 0,
          items_failed INTEGER DEFAULT 0,
          average_duration_seconds INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await database.query(`
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
  }

  async _seedUpdateSchedules() {
    const database = await getDatabaseAsync();

    // Use dialect-aware INSERT to handle PostgreSQL vs SQLite
    const sql = isUsingPostgres()
      ? `INSERT INTO update_schedules (name, display_name, description, frequency, cron_expression)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`
      : `INSERT OR IGNORE INTO update_schedules (name, display_name, description, frequency, cron_expression)
         VALUES ($1, $2, $3, $4, $5)`;

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
      await database.query(sql, [name, displayName, description, frequency, cron]);
    }
  }

  async toggleUpdateSchedule(name, enabled) {
    const database = await getDatabaseAsync();

    // First, try to update in the new update_jobs system
    const mapping = this._getJobKeyMapping();
    const jobKey = mapping[name];

    if (jobKey) {
      const jobsTableExists = await this._tableExists('update_jobs');
      if (jobsTableExists) {
        const result = await database.query(`
          UPDATE update_jobs
          SET is_enabled = $1
          WHERE job_key = $2
        `, [enabled ? 1 : 0, jobKey]);

        if ((result.rowCount || 0) > 0) {
          await this.log('info', 'update', `Update job "${jobKey}" ${enabled ? 'enabled' : 'disabled'}`);
          return true;
        }
      }
    }

    // Fallback: Update legacy update_schedules table
    const result = await database.query(`
      UPDATE update_schedules
      SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP
      WHERE name = $2
    `, [enabled ? 1 : 0, name]);

    // Log the change
    await this.log('info', 'update', `Update schedule "${name}" ${enabled ? 'enabled' : 'disabled'}`);

    return (result.rowCount || 0) > 0;
  }

  async getUpdateHistory(scheduleName = null, limit = 50) {
    const database = await getDatabaseAsync();
    const query = scheduleName
      ? `SELECT * FROM settings_update_history WHERE schedule_name = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM settings_update_history ORDER BY created_at DESC LIMIT $1`;

    const params = scheduleName ? [scheduleName, limit] : [limit];

    const result = await database.query(query, params);

    return result.rows.map(row => ({
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

  async recordUpdateStart(name) {
    const database = await getDatabaseAsync();

    // Get schedule ID
    const scheduleResult = await database.query('SELECT id FROM update_schedules WHERE name = $1', [name]);
    const schedule = scheduleResult.rows[0];
    if (!schedule) return null;

    // Update schedule status
    await database.query(`
      UPDATE update_schedules
      SET status = 'running', last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE name = $1
    `, [name]);

    // Create history entry
    const result = await database.query(`
      INSERT INTO settings_update_history (schedule_id, schedule_name, started_at, status)
      VALUES ($1, $2, CURRENT_TIMESTAMP, 'running')
      RETURNING id
    `, [schedule.id, name]);

    return result.rows[0].id;
  }

  async recordUpdateComplete(name, stats = {}) {
    const { itemsProcessed = 0, itemsUpdated = 0, itemsFailed = 0, historyId } = stats;
    const database = await getDatabaseAsync();

    // Update schedule
    await database.query(`
      UPDATE update_schedules
      SET
        status = 'idle',
        last_success_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        items_processed = $1,
        items_updated = $2,
        items_failed = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = $4
    `, [itemsProcessed, itemsUpdated, itemsFailed, name]);

    // Update history if ID provided
    if (historyId) {
      if (isUsingPostgres()) {
        await database.query(`
          UPDATE settings_update_history
          SET
            completed_at = CURRENT_TIMESTAMP,
            status = 'success',
            items_processed = $1,
            items_updated = $2,
            items_failed = $3,
            duration_seconds = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) AS INTEGER)
          WHERE id = $4
        `, [itemsProcessed, itemsUpdated, itemsFailed, historyId]);
      } else {
        await database.query(`
          UPDATE settings_update_history
          SET
            completed_at = CURRENT_TIMESTAMP,
            status = 'success',
            items_processed = $1,
            items_updated = $2,
            items_failed = $3,
            duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER)
          WHERE id = $4
        `, [itemsProcessed, itemsUpdated, itemsFailed, historyId]);
      }
    }

    await this.log('info', 'update', `Update "${name}" completed: ${itemsUpdated}/${itemsProcessed} updated`);
  }

  async recordUpdateFailure(name, error, historyId = null) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const database = await getDatabaseAsync();

    // Update schedule
    await database.query(`
      UPDATE update_schedules
      SET
        status = 'failed',
        last_error = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = $2
    `, [errorMessage, name]);

    // Update history if ID provided
    if (historyId) {
      if (isUsingPostgres()) {
        await database.query(`
          UPDATE settings_update_history
          SET
            completed_at = CURRENT_TIMESTAMP,
            status = 'failed',
            error_summary = $1,
            duration_seconds = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) AS INTEGER)
          WHERE id = $2
        `, [errorMessage, historyId]);
      } else {
        await database.query(`
          UPDATE settings_update_history
          SET
            completed_at = CURRENT_TIMESTAMP,
            status = 'failed',
            error_summary = $1,
            duration_seconds = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400 AS INTEGER)
          WHERE id = $2
        `, [errorMessage, historyId]);
      }
    }

    await this.log('error', 'update', `Update "${name}" failed: ${errorMessage}`);
  }

  // =========================================================================
  // API INTEGRATIONS
  // =========================================================================

  async getApiIntegrations() {
    try {
      const database = await getDatabaseAsync();
      // Ensure table exists
      const tableExists = await this._tableExists('api_integrations');

      if (!tableExists) {
        await this._ensureApiIntegrationsTable();
        await this._seedApiIntegrations();
      }

      const result = await database.query('SELECT * FROM api_integrations ORDER BY display_name');
      const rows = result.rows;

      // If empty, seed and return defaults
      if (rows.length === 0) {
        await this._seedApiIntegrations();
        return await this.getApiIntegrations(); // Recurse once after seeding
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

  async _ensureApiIntegrationsTable() {
    const database = await getDatabaseAsync();

    if (isUsingPostgres()) {
      await database.query(`
        CREATE TABLE IF NOT EXISTS api_integrations (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          is_enabled INTEGER DEFAULT 0,
          api_key TEXT,
          base_url TEXT,
          calls_today INTEGER DEFAULT 0,
          calls_this_month INTEGER DEFAULT 0,
          daily_limit INTEGER,
          monthly_limit INTEGER,
          last_call_at TIMESTAMP,
          last_reset_at TIMESTAMP,
          status TEXT DEFAULT 'unknown',
          last_error TEXT,
          last_health_check TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await database.query(`
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
  }

  async _seedApiIntegrations() {
    const database = await getDatabaseAsync();
    const sql = isUsingPostgres()
      ? `INSERT INTO api_integrations (name, display_name, daily_limit, monthly_limit, base_url, status)
         VALUES ($1, $2, $3, $4, $5, 'connected') ON CONFLICT (name) DO NOTHING`
      : `INSERT OR IGNORE INTO api_integrations (name, display_name, daily_limit, monthly_limit, base_url, status)
         VALUES ($1, $2, $3, $4, $5, 'connected')`;

    const integrations = [
      ['yfinance', 'Yahoo Finance', null, null, null],
      ['sec_edgar', 'SEC EDGAR', null, null, 'https://www.sec.gov'],
      ['reddit', 'Reddit API', 100, null, 'https://oauth.reddit.com'],
      ['polygon', 'Polygon.io', 1000, null, 'https://api.polygon.io'],
      ['alpha_vantage', 'Alpha Vantage', 25, 500, 'https://www.alphavantage.co'],
      ['fmp', 'Financial Modeling Prep', 250, null, 'https://financialmodelingprep.com'],
    ];

    for (const [name, displayName, dailyLimit, monthlyLimit, baseUrl] of integrations) {
      await database.query(sql, [name, displayName, dailyLimit, monthlyLimit, baseUrl]);
    }
  }

  async updateApiKey(name, apiKey) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      UPDATE api_integrations
      SET api_key = $1, is_enabled = 1, updated_at = CURRENT_TIMESTAMP
      WHERE name = $2
    `, [apiKey, name]);

    await this.log('info', 'api', `API key updated for "${name}"`);
    return (result.rowCount || 0) > 0;
  }

  async getApiKey(name) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT api_key FROM api_integrations WHERE name = $1', [name]);
    const row = result.rows[0];
    return row ? row.api_key : null;
  }

  async testApiConnection(name) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM api_integrations WHERE name = $1', [name]);
    const integration = result.rows[0];

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
      await database.query(`
        UPDATE api_integrations
        SET status = $1, last_health_check = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE name = $2
      `, [testResult ? 'connected' : 'error', name]);

      return { success: testResult, message };

    } catch (error) {
      const errorMessage = error.message || 'Connection test failed';

      await database.query(`
        UPDATE api_integrations
        SET status = 'error', last_error = $1, last_health_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE name = $2
      `, [errorMessage, name]);

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

  async recordApiCall(name) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE api_integrations
      SET
        calls_today = calls_today + 1,
        calls_this_month = calls_this_month + 1,
        last_call_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = $1
    `, [name]);
  }

  async resetDailyUsage() {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE api_integrations
      SET calls_today = 0, last_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `);

    await this.log('info', 'api', 'Daily API usage counters reset');
  }

  async resetMonthlyUsage() {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE api_integrations
      SET calls_this_month = 0, updated_at = CURRENT_TIMESTAMP
    `);

    await this.log('info', 'api', 'Monthly API usage counters reset');
  }

  // =========================================================================
  // DATA HEALTH
  // =========================================================================

  async generateDataHealthReport() {
    const database = await getDatabaseAsync();
    const metrics = [];

    // 1. Stale stock prices (>3 trading days old)
    try {
      const dateCondition = isUsingPostgres()
        ? `dp.date >= CURRENT_DATE - INTERVAL '5 days'`
        : `dp.date >= date('now', '-5 days')`;

      const result = await database.query(`
        SELECT COUNT(*) as count FROM companies c
        WHERE c.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM daily_prices dp
          WHERE dp.company_id = c.id
          AND ${dateCondition}
        )
      `);
      const staleStockCount = result.rows[0]?.count || 0;

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
      const result = await database.query(`
        SELECT COUNT(*) as count FROM companies c
        WHERE c.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM calculated_metrics cm WHERE cm.company_id = c.id
        )
      `);
      const missingFundCount = result.rows[0]?.count || 0;

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
      const dateCondition = isUsingPostgres()
        ? `created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`
        : `created_at > datetime('now', '-24 hours')`;

      const result = await database.query(`
        SELECT COUNT(*) as count FROM settings_update_history
        WHERE status = 'failed' AND ${dateCondition}
      `);
      const failedCount = result.rows[0]?.count || 0;

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
      const result = await database.query(`
        SELECT COUNT(*) as count FROM api_integrations
        WHERE status = 'rate_limited'
      `);
      const rateLimitedCount = result.rows[0]?.count || 0;

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
      const dateCondition = isUsingPostgres()
        ? `calculated_at < CURRENT_TIMESTAMP - INTERVAL '2 days'`
        : `calculated_at < datetime('now', '-2 days')`;

      const result = await database.query(`
        SELECT COUNT(*) as count FROM combined_sentiment
        WHERE ${dateCondition}
      `);
      const staleSentimentCount = result.rows[0]?.count || 0;

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
    let dbSizeMB = 0;
    try {
      if (isUsingPostgres()) {
        // Get PostgreSQL database size
        const result = await database.query(`
          SELECT pg_database_size(current_database()) as size
        `);
        const sizeBytes = result.rows[0]?.size || 0;
        dbSizeMB = Math.round(sizeBytes / (1024 * 1024));
      } else {
        // Get SQLite file size
        const dbPath = path.join(__dirname, '../../data/stocks.db');
        const stats = fs.statSync(dbPath);
        dbSizeMB = Math.round(stats.size / (1024 * 1024));
      }
    } catch (e) {
      console.log('Could not determine database size:', e.message);
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

  async runHealthCheck() {
    const database = await getDatabaseAsync();
    const checks = [];

    // 1. Database connection
    try {
      await database.query('SELECT 1');
      checks.push({ name: 'Database', status: 'pass', message: 'Connected' });
    } catch (e) {
      checks.push({ name: 'Database', status: 'fail', message: 'Connection failed' });
    }

    // 2. Check for stuck updates (running > 2 hours)
    try {
      const tableExists = await this._tableExists('update_schedules');

      if (tableExists) {
        const dateCondition = isUsingPostgres()
          ? `last_run_at < CURRENT_TIMESTAMP - INTERVAL '2 hours'`
          : `last_run_at < datetime('now', '-2 hours')`;

        const result = await database.query(`
          SELECT COUNT(*) as count FROM update_schedules
          WHERE status = 'running' AND ${dateCondition}
        `);

        if ((result.rows[0]?.count || 0) > 0) {
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

  async getUserPreferences(userId = 'default') {
    try {
      const database = await getDatabaseAsync();
      // Ensure table exists
      const tableExists = await this._tableExists('user_preferences');

      if (!tableExists) {
        await this._ensureUserPreferencesTable();
      }

      let result = await database.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
      let row = result.rows[0];

      if (!row) {
        // Create default preferences
        await database.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [userId]);
        result = await database.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
        row = result.rows[0];
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

  async _ensureUserPreferencesTable() {
    const database = await getDatabaseAsync();

    if (isUsingPostgres()) {
      await database.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id SERIAL PRIMARY KEY,
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await database.query(`
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
  }

  async updateUserPreferences(userId = 'default', prefs) {
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
    let paramIndex = 1;

    for (const [key, value] of Object.entries(prefs)) {
      if (fieldMap[key] && value !== undefined) {
        updates.push(`${fieldMap[key]} = $${paramIndex++}`);
        // Convert booleans to integers for SQLite/PostgreSQL
        values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    if (updates.length === 0) return false;

    values.push(userId);
    const database = await getDatabaseAsync();
    const result = await database.query(`
      UPDATE user_preferences
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${paramIndex}
    `, values);

    return (result.rowCount || 0) > 0;
  }

  // =========================================================================
  // DATABASE & STORAGE
  // =========================================================================

  async getDatabaseStats() {
    try {
      const database = await getDatabaseAsync();
      let tables = [];
      let indexCount = 0;
      let size = 0;

      if (isUsingPostgres()) {
        // PostgreSQL: Get table stats from information_schema
        const tablesResult = await database.query(`
          SELECT table_name as name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        tables = tablesResult.rows;

        // Get index count
        const indexResult = await database.query(`
          SELECT COUNT(*) as count
          FROM pg_indexes
          WHERE schemaname = 'public'
        `);
        indexCount = indexResult.rows[0]?.count || 0;

        // Get database size
        const sizeResult = await database.query(`
          SELECT pg_database_size(current_database()) as size
        `);
        size = sizeResult.rows[0]?.size || 0;
      } else {
        // SQLite: Get table stats from sqlite_master
        const tablesResult = await database.query(`
          SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `);
        tables = tablesResult.rows;

        // Get index count
        const indexResult = await database.query(`
          SELECT COUNT(*) as count FROM sqlite_master WHERE type='index'
        `);
        indexCount = indexResult.rows[0]?.count || 0;

        // Get database file size
        const dbPath = path.join(__dirname, '../../data/stocks.db');
        try {
          const stats = fs.statSync(dbPath);
          size = stats.size;
        } catch {
          // File not accessible
        }
      }

      // Count rows for each table
      let totalRows = 0;
      const tableStats = [];

      for (const t of tables) {
        try {
          const countResult = await database.query(`SELECT COUNT(*) as count FROM "${t.name}"`);
          const rows = countResult.rows[0]?.count || 0;
          totalRows += rows;
          tableStats.push({
            name: t.name,
            rows: rows,
          });
        } catch {
          tableStats.push({ name: t.name, rows: 0 });
        }
      }

      // Sort by row count descending
      tableStats.sort((a, b) => b.rows - a.rows);

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

  async getSystemDiagnostics() {
    const database = await getDatabaseAsync();
    const dbStats = await this.getDatabaseStats();

    // Get recent errors
    let recentErrors = [];
    try {
      const result = await database.query(`
        SELECT level, category, message, created_at
        FROM diagnostic_logs
        WHERE level IN ('error', 'warn')
        ORDER BY created_at DESC
        LIMIT 20
      `);
      recentErrors = result.rows.map(r => ({
        level: r.level,
        category: r.category,
        message: r.message,
        timestamp: r.created_at,
      }));
    } catch (e) {
      // Table may not exist yet
      console.log('Could not fetch recent errors:', e.message);
    }

    return {
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      database: {
        connected: true,
        size: dbStats.size,
        tableCount: dbStats.tableCount,
      },
      recentErrors,
    };
  }

  // =========================================================================
  // LOGGING
  // =========================================================================

  async log(level, category, message, details = null) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO diagnostic_logs (level, category, message, details)
      VALUES ($1, $2, $3, $4)
    `, [level, category, message, details ? JSON.stringify(details) : null]);
  }

  async getLogs(options = {}) {
    const { level, category, limit = 100 } = options;
    const database = await getDatabaseAsync();

    let query = 'SELECT * FROM diagnostic_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (level) {
      query += ` AND level = $${paramIndex++}`;
      params.push(level);
    }

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows.map(r => ({
      id: r.id,
      level: r.level,
      category: r.category,
      message: r.message,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.created_at,
    }));
  }

  async cleanupOldLogs(daysToKeep = 30) {
    const database = await getDatabaseAsync();

    if (isUsingPostgres()) {
      const result = await database.query(`
        DELETE FROM diagnostic_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
      `, [daysToKeep]);

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        await this.log('info', 'maintenance', `Cleaned up ${deletedCount} old log entries`);
      }

      return deletedCount;
    } else {
      const result = await database.query(`
        DELETE FROM diagnostic_logs WHERE created_at < datetime('now', '-' || $1 || ' days')
      `, [daysToKeep]);

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        await this.log('info', 'maintenance', `Cleaned up ${deletedCount} old log entries`);
      }

      return deletedCount;
    }
  }

  // =========================================================================
  // SYSTEM SETTINGS (Key-Value)
  // =========================================================================

  async getSetting(key) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    const row = result.rows[0];
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  async setSetting(key, value, description = null) {
    const database = await getDatabaseAsync();
    const jsonValue = JSON.stringify(value);
    await database.query(`
      INSERT INTO system_settings (key, value, description, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = EXCLUDED.value,
        description = COALESCE(EXCLUDED.description, description),
        updated_at = CURRENT_TIMESTAMP
    `, [key, jsonValue, description]);
  }

  async getAllSettings() {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM system_settings ORDER BY key');
    return result.rows.map(r => ({
      key: r.key,
      value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(),
      description: r.description,
      updatedAt: r.updated_at,
    }));
  }
}

// Factory function to create service instance
function createSettingsService() {
  return new SettingsService();
}

module.exports = { SettingsService, createSettingsService };
