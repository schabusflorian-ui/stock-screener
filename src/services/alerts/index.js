// src/services/alerts/index.js
// Main Alert Service - coordinates detection, processing, and storage

const { getDatabaseAsync } = require('../../lib/db');
const ValuationDetector = require('./detectors/valuationDetector');
const FundamentalDetector = require('./detectors/fundamentalDetector');
const PriceDetector = require('./detectors/priceDetector');
const FilingDetector = require('./detectors/filingDetector');
const CompositeDetector = require('./detectors/compositeDetector');
const ClusterProcessor = require('./processors/clusterProcessor');
const {
  ALERT_DEFINITIONS,
  SIGNAL_CONFIG,
  ALERT_TYPE_CONFIG,
  getCooldownHours,
  getExpiryHours,
  getActionabilityBase,
  MAX_ALERTS_PER_SYMBOL_PER_WEEK
} = require('./alertDefinitions');

class AlertService {
  constructor(options = {}) {
    this.options = {
      // Legacy fallback - now uses per-alert-code cooldowns
      dedupeWindowHours: 24,
      maxAlertsPerCompany: 10,
      // Weekly cap per symbol to prevent alert flooding
      maxAlertsPerSymbolPerWeek: MAX_ALERTS_PER_SYMBOL_PER_WEEK,
      // Priority boosts
      watchlistPriorityBoost: 1,
      // Enable smart features
      enableSmartCooldowns: true,
      enableWeeklyCap: true,
      enableActionabilityScoring: true,
      ...options
    };

    // Initialize detectors - will be set up in async init if needed
    this.detectors = {
      valuation: new ValuationDetector(),
      fundamental: new FundamentalDetector(),
      price: new PriceDetector(),
      filing: new FilingDetector(),
      composite: new CompositeDetector()
    };

    this.clusterProcessor = new ClusterProcessor();
  }

  /**
   * Main entry point - run detection for specified companies
   */
  async runDetection(trigger, companyIds = null) {
    const database = await getDatabaseAsync();
    const startTime = Date.now();
    const results = {
      trigger,
      companiesEvaluated: 0,
      alertsGenerated: 0,
      alertsClustered: 0,
      errors: []
    };

    try {
      // Get companies to evaluate
      const companies = companyIds
        ? await this.getCompaniesById(database, companyIds)
        : await this.getCompaniesForTrigger(database, trigger);

      results.companiesEvaluated = companies.length;

      // Get watchlist for priority boosting
      const watchlistIds = new Set(await this.getWatchlistCompanyIds(database));

      // Run appropriate detectors
      const candidateAlerts = [];

      for (const company of companies) {
        try {
          const companyAlerts = await this.detectForCompany(database, company, trigger);

          // Boost priority for watchlist companies
          if (watchlistIds.has(company.id)) {
            companyAlerts.forEach(alert => {
              alert.priority = Math.min(5, alert.priority + this.options.watchlistPriorityBoost);
              alert.data = { ...alert.data, isWatchlist: true };
            });
          }

          candidateAlerts.push(...companyAlerts);
        } catch (err) {
          results.errors.push({ companyId: company.id, symbol: company.symbol, error: err.message });
        }
      }

      // Deduplicate
      const dedupedAlerts = await this.deduplicateAlerts(database, candidateAlerts);

      // Cluster related alerts
      const { alerts: finalAlerts, clusters } = this.clusterProcessor.process(dedupedAlerts);

      // Save clusters first to get IDs
      const clusterIdMap = {};
      for (const cluster of clusters) {
        const clusterId = await this.saveCluster(database, cluster);
        clusterIdMap[cluster._tempId] = clusterId;
      }

      // Save all alerts with cluster IDs
      for (const alert of finalAlerts) {
        if (alert._clusterId && clusterIdMap[alert._clusterId]) {
          alert.cluster_id = clusterIdMap[alert._clusterId];
        }
        await this.saveAlert(database, alert);
      }

      // Update alert states
      await this.updateAlertStates(database, companies);

      results.alertsGenerated = finalAlerts.length;
      results.alertsClustered = clusters.length;
      results.durationMs = Date.now() - startTime;

    } catch (err) {
      results.errors.push({ general: err.message });
    }

    return results;
  }

  /**
   * Detect alerts for a single company
   */
  async detectForCompany(database, company, trigger) {
    const alerts = [];
    const previousState = await this.getAlertState(database, company.id);

    // Run detectors based on trigger type
    const detectorsToRun = this.getDetectorsForTrigger(trigger);

    for (const detectorName of detectorsToRun) {
      const detector = this.detectors[detectorName];
      if (detector) {
        try {
          const detectorAlerts = await detector.detect(database, company, previousState);
          alerts.push(...detectorAlerts.filter(Boolean));
        } catch (err) {
          console.error(`Error in ${detectorName} detector for ${company.symbol}:`, err.message);
        }
      }
    }

    // Always run composite detector last (needs results from others)
    if (detectorsToRun.length > 0 && !detectorsToRun.includes('composite')) {
      try {
        const compositeAlerts = await this.detectors.composite.detect(database, company, previousState, alerts);
        alerts.push(...compositeAlerts.filter(Boolean));
      } catch (err) {
        console.error(`Error in composite detector for ${company.symbol}:`, err.message);
      }
    }

    return alerts;
  }

  /**
   * Get detectors to run based on trigger type
   */
  getDetectorsForTrigger(trigger) {
    const mapping = {
      'price_update': ['price', 'valuation'],
      'fundamental_import': ['fundamental', 'valuation', 'composite'],
      'dcf_calculated': ['valuation', 'composite'],
      'filing_detected': ['filing'],
      'insider_update': ['filing'],
      'screener_run': ['valuation'],
      'daily_scan': ['price', 'valuation', 'fundamental', 'filing', 'composite'],
      'manual': ['price', 'valuation', 'fundamental', 'filing', 'composite']
    };

    return mapping[trigger] || ['price', 'valuation', 'fundamental', 'filing', 'composite'];
  }

  /**
   * Check if an alert is on cooldown
   * Uses per-alert-code cooldown settings from alertDefinitions
   */
  async isOnCooldown(database, companyId, alertCode) {
    if (!this.options.enableSmartCooldowns) {
      // Fall back to legacy 24-hour window
      const cutoff = new Date(Date.now() - this.options.dedupeWindowHours * 60 * 60 * 1000).toISOString();
      const result = await database.query(`
        SELECT id FROM alerts
        WHERE company_id = $1 AND alert_code = $2 AND triggered_at > $3 AND is_dismissed = false
        LIMIT 1
      `, [companyId, alertCode, cutoff]);
      return result.rows.length > 0;
    }

    // Get alert-specific cooldown
    const cooldownHours = getCooldownHours(alertCode);
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

    const result = await database.query(`
      SELECT id FROM alerts
      WHERE company_id = $1
        AND alert_code = $2
        AND triggered_at > $3
        AND is_dismissed = false
      LIMIT 1
    `, [companyId, alertCode, cutoff]);

    return result.rows.length > 0;
  }

  /**
   * Check if symbol has hit weekly alert cap
   */
  async isAtWeeklyCap(database, companyId) {
    if (!this.options.enableWeeklyCap) return false;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await database.query(`
      SELECT COUNT(*) as count FROM alerts
      WHERE company_id = $1
        AND triggered_at > $2
        AND is_dismissed = false
    `, [companyId, weekAgo]);

    return parseInt(result.rows[0].count, 10) >= this.options.maxAlertsPerSymbolPerWeek;
  }

  /**
   * Get weekly alert count for a company
   */
  async getWeeklyAlertCount(database, companyId) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await database.query(`
      SELECT COUNT(*) as count FROM alerts
      WHERE company_id = $1 AND triggered_at > $2
    `, [companyId, weekAgo]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Deduplicate alerts - use per-alert-code cooldowns and weekly caps
   */
  async deduplicateAlerts(database, alerts) {
    const deduped = [];
    const skipped = { cooldown: 0, weeklyCap: 0, duplicate: 0 };

    // Track alerts being added in this batch to prevent duplicates within same run
    const seenInBatch = new Set();

    for (const alert of alerts) {
      const key = `${alert.company_id}:${alert.alert_code}`;

      // Skip if we've already queued this alert in current batch
      if (seenInBatch.has(key)) {
        skipped.duplicate++;
        continue;
      }

      // Check per-alert-code cooldown
      if (await this.isOnCooldown(database, alert.company_id, alert.alert_code)) {
        skipped.cooldown++;
        continue;
      }

      // Check weekly cap (but allow P5 critical alerts through)
      if (alert.priority < 5 && await this.isAtWeeklyCap(database, alert.company_id)) {
        skipped.weeklyCap++;
        continue;
      }

      seenInBatch.add(key);
      deduped.push(alert);
    }

    // Log deduplication stats if significant
    const totalSkipped = skipped.cooldown + skipped.weeklyCap + skipped.duplicate;
    if (totalSkipped > 0) {
      console.log(`[AlertService] Deduplication: ${alerts.length} candidates -> ${deduped.length} alerts (skipped: ${skipped.cooldown} cooldown, ${skipped.weeklyCap} weekly cap, ${skipped.duplicate} duplicate)`);
    }

    return deduped;
  }

  /**
   * Calculate actionability score for an alert
   */
  calculateActionabilityScore(alert) {
    if (!this.options.enableActionabilityScoring) return null;

    let score = getActionabilityBase(alert.alert_code);

    // Boost if in watchlist
    if (alert.data?.isWatchlist) {
      score += 0.1;
    }

    // Boost if in a cluster (multiple signals)
    if (alert.cluster_id) {
      score += 0.1;
    }

    // Reduce if not idiosyncratic (market-wide move)
    if (alert.data?.isIdiosyncratic === false) {
      score -= 0.2;
    }

    // Boost for portfolio positions (handled separately)
    if (alert.data?.portfolioRelevance > 1.0) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get action suggestions for an alert
   */
  getActionSuggestions(alertCode) {
    const suggestions = {
      'quality_value_convergence': ['Consider adding to position', 'Review recent financials for concerns'],
      'dcf_undervalued_50': ['Evaluate margin of safety', 'Review business fundamentals'],
      'dcf_undervalued_25': ['Consider starting a position', 'Review DCF assumptions'],
      'insider_buying_cluster': ['Review insider transaction history', 'Check for upcoming catalysts'],
      'insider_buying': ['Investigate insider rationale', 'Review company news'],
      'large_insider_buy': ['Significant signal - review company thoroughly', 'Check insider track record'],
      'rsi_oversold': ['Check if move is idiosyncratic or market-wide', 'Wait for reversal confirmation'],
      'rsi_deeply_oversold': ['Technical bounce likely', 'Review fundamental reasons for decline'],
      'red_flag_cluster': ['Review position sizing', 'Consider setting stop-loss'],
      'fallen_angel': ['Investigate cause of decline', 'Review fundamentals stability'],
      'accumulation_zone': ['Strong convergence signal', 'Consider staged entry'],
      'new_52w_low': ['Investigate reason for decline', 'Check if fundamentals justify price'],
      'fcf_turned_negative': ['Review cash position', 'Assess burn rate sustainability']
    };

    return suggestions[alertCode] || [];
  }

  /**
   * Save alert to database with smart features
   */
  async saveAlert(database, alert) {
    // Calculate expiry time based on alert definition
    const expiryHours = getExpiryHours(alert.alert_code);
    const expiresAt = alert.expires_at ||
      new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    // Calculate actionability score
    const actionabilityScore = this.calculateActionabilityScore(alert);

    // Get action suggestions
    const actionSuggestions = this.getActionSuggestions(alert.alert_code);

    // Prepare alert data with additional context
    const alertData = {
      ...alert.data,
      actionSuggestions: actionSuggestions.length > 0 ? actionSuggestions : undefined
    };

    const result = await database.query(`
      INSERT INTO alerts (
        company_id, alert_type, alert_code, signal_type, priority,
        title, description, data, cluster_id, is_cluster_primary,
        triggered_by, source_record_id, triggered_at, expires_at,
        actionability_score, action_suggestions, adjusted_priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      alert.company_id,
      alert.alert_type,
      alert.alert_code,
      alert.signal_type,
      alert.priority,
      alert.title,
      alert.description,
      JSON.stringify(alertData),
      alert.cluster_id || null,
      alert.is_cluster_primary || false,
      alert.triggered_by,
      alert.source_record_id || null,
      alert.triggered_at || new Date().toISOString(),
      expiresAt,
      actionabilityScore,
      actionSuggestions.length > 0 ? JSON.stringify(actionSuggestions) : null,
      alert.adjusted_priority || alert.priority
    ]);

    // Update cooldown tracking
    await this.updateCooldownTracking(database, alert.company_id, alert.alert_code);

    return result.rows[0].id;
  }

  /**
   * Update cooldown tracking after saving an alert
   */
  async updateCooldownTracking(database, companyId, alertCode) {
    try {
      // Check if alert_cooldowns table exists
      const tableCheck = await database.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'alert_cooldowns'
        ) as exists
      `);

      if (tableCheck.rows[0].exists) {
        await database.query(`
          INSERT INTO alert_cooldowns (company_id, alert_code, last_triggered_at, trigger_count_7d)
          VALUES ($1, $2, CURRENT_TIMESTAMP, 1)
          ON CONFLICT(company_id, alert_code) DO UPDATE SET
            last_triggered_at = CURRENT_TIMESTAMP,
            trigger_count_7d = trigger_count_7d + 1
        `, [companyId, alertCode]);
      }

      // Also update alert_state
      await database.query(`
        UPDATE alert_state
        SET last_alert_at = CURRENT_TIMESTAMP,
            alert_count_7d = COALESCE(alert_count_7d, 0) + 1
        WHERE company_id = $1
      `, [companyId]);
    } catch (err) {
      // Ignore errors - cooldown tracking is optional enhancement
      console.warn('[AlertService] Could not update cooldown tracking:', err.message);
    }
  }

  /**
   * Save cluster to database
   */
  async saveCluster(database, cluster) {
    const result = await database.query(`
      INSERT INTO alert_clusters (
        company_id, cluster_type, title, description,
        alert_count, signal_type, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      cluster.company_id,
      cluster.cluster_type,
      cluster.title,
      cluster.description,
      cluster.alert_count,
      cluster.signal_type,
      cluster.priority
    ]);

    return result.rows[0].id;
  }

  /**
   * Get alert state for a company
   */
  async getAlertState(database, companyId) {
    const result = await database.query(`
      SELECT * FROM alert_state WHERE company_id = $1
    `, [companyId]);
    return result.rows[0] || null;
  }

  /**
   * Update alert state after detection
   */
  async updateAlertStates(database, companies) {
    for (const company of companies) {
      try {
        // Get current states from all detectors
        const valuationState = this.detectors.valuation.getCurrentState?.(company.id) || {};
        const priceState = this.detectors.price.getCurrentState?.(company.id) || {};
        const fundamentalState = this.detectors.fundamental.getCurrentState?.(company.id) || {};
        const compositeState = this.detectors.composite.getCurrentState?.(company.id) || {};

        const state = { ...valuationState, ...priceState, ...fundamentalState, ...compositeState };

        // Update state
        const columns = Object.keys(state);
        if (columns.length > 0) {
          const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');
          const setClause = columns.map((c, i) => `${c} = $${i + 2 + columns.length}`).join(', ');
          const values = columns.map(c => state[c]);

          await database.query(`
            INSERT INTO alert_state (company_id, ${columns.join(', ')}, last_evaluated_at)
            VALUES ($1, ${placeholders}, CURRENT_TIMESTAMP)
            ON CONFLICT(company_id) DO UPDATE SET
              ${setClause},
              last_evaluated_at = CURRENT_TIMESTAMP
          `, [company.id, ...values, ...values]);
        } else {
          await database.query(`
            INSERT INTO alert_state (company_id, last_evaluated_at)
            VALUES ($1, CURRENT_TIMESTAMP)
            ON CONFLICT(company_id) DO UPDATE SET
              last_evaluated_at = CURRENT_TIMESTAMP
          `, [company.id]);
        }
      } catch (err) {
        // Continue with other companies
      }
    }
  }

  /**
   * Get companies by ID
   */
  async getCompaniesById(database, companyIds) {
    if (!companyIds || companyIds.length === 0) return [];

    const placeholders = companyIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await database.query(`
      SELECT id, symbol, name FROM companies
      WHERE id IN (${placeholders})
        AND symbol IS NOT NULL
        AND symbol NOT LIKE 'CIK_%'
    `, companyIds);
    return result.rows;
  }

  /**
   * Get companies for a trigger type
   */
  async getCompaniesForTrigger(database, trigger) {
    // For daily scan, get all companies with price metrics
    if (trigger === 'daily_scan' || trigger === 'manual') {
      const result = await database.query(`
        SELECT c.id, c.symbol, c.name
        FROM companies c
        JOIN price_metrics pm ON c.id = pm.company_id
        WHERE c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND pm.last_price IS NOT NULL
        LIMIT 1000
      `);
      return result.rows;
    }

    // For price updates, get recently updated companies
    if (trigger === 'price_update') {
      const result = await database.query(`
        SELECT c.id, c.symbol, c.name
        FROM companies c
        JOIN price_metrics pm ON c.id = pm.company_id
        WHERE c.symbol IS NOT NULL
          AND pm.updated_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
        LIMIT 500
      `);
      return result.rows;
    }

    return [];
  }

  /**
   * Get watchlist company IDs
   */
  async getWatchlistCompanyIds(database) {
    const result = await database.query(`
      SELECT company_id FROM watchlist
    `);
    return result.rows.map(r => r.company_id);
  }

  // ==========================================
  // QUERY METHODS (for API endpoints)
  // ==========================================

  /**
   * Get alerts for dashboard (top priority, unread)
   */
  async getDashboardAlerts(database, limit = 10) {
    const result = await database.query(`
      SELECT
        a.*,
        c.symbol,
        c.name as company_name,
        CASE WHEN w.id IS NOT NULL THEN true ELSE false END as is_watchlist
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      LEFT JOIN watchlist w ON c.id = w.company_id
      WHERE a.is_dismissed = false
        AND (a.expires_at IS NULL OR a.expires_at > CURRENT_TIMESTAMP)
      ORDER BY
        a.is_read ASC,
        a.priority DESC,
        a.triggered_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  /**
   * Get alerts for a specific company
   */
  async getCompanyAlerts(database, companyId, options = {}) {
    const { limit = 20, includeRead = true, includeDismissed = false } = options;

    let sql = `
      SELECT a.*
      FROM alerts a
      WHERE a.company_id = $1
    `;

    const params = [companyId];

    if (!includeRead) sql += ' AND a.is_read = false';
    if (!includeDismissed) sql += ' AND a.is_dismissed = false';

    sql += ' ORDER BY a.triggered_at DESC LIMIT $2';
    params.push(limit);

    const result = await database.query(sql, params);
    return result.rows;
  }

  /**
   * Get all alerts with filters
   */
  async getAlerts(database, filters = {}) {
    const {
      alertTypes = null,
      signalTypes = null,
      companyIds = null,
      watchlistOnly = false,
      unreadOnly = false,
      minPriority = 1,
      startDate = null,
      endDate = null,
      limit = 50,
      offset = 0
    } = filters;

    let sql = `
      SELECT
        a.*,
        c.symbol,
        c.name as company_name,
        CASE WHEN w.id IS NOT NULL THEN true ELSE false END as is_watchlist
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      LEFT JOIN watchlist w ON c.id = w.company_id
      WHERE a.is_dismissed = false
        AND a.priority >= $1
    `;

    const params = [minPriority];
    let paramIndex = 2;

    if (alertTypes && alertTypes.length > 0) {
      const placeholders = alertTypes.map((_, i) => `$${paramIndex + i}`).join(',');
      sql += ` AND a.alert_type IN (${placeholders})`;
      params.push(...alertTypes);
      paramIndex += alertTypes.length;
    }

    if (signalTypes && signalTypes.length > 0) {
      const placeholders = signalTypes.map((_, i) => `$${paramIndex + i}`).join(',');
      sql += ` AND a.signal_type IN (${placeholders})`;
      params.push(...signalTypes);
      paramIndex += signalTypes.length;
    }

    if (companyIds && companyIds.length > 0) {
      const placeholders = companyIds.map((_, i) => `$${paramIndex + i}`).join(',');
      sql += ` AND a.company_id IN (${placeholders})`;
      params.push(...companyIds);
      paramIndex += companyIds.length;
    }

    if (watchlistOnly) {
      sql += ' AND w.id IS NOT NULL';
    }

    if (unreadOnly) {
      sql += ' AND a.is_read = false';
    }

    if (startDate) {
      sql += ` AND a.triggered_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND a.triggered_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    sql += ` ORDER BY a.triggered_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await database.query(sql, params);
    return result.rows;
  }

  /**
   * Get alert summary counts
   */
  async getAlertSummary(database) {
    const result = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN signal_type = 'strong_buy' AND is_read = false THEN 1 ELSE 0 END) as strong_buy_unread,
        SUM(CASE WHEN signal_type = 'buy' AND is_read = false THEN 1 ELSE 0 END) as buy_unread,
        SUM(CASE WHEN signal_type = 'warning' AND is_read = false THEN 1 ELSE 0 END) as warning_unread,
        SUM(CASE WHEN signal_type IN ('strong_buy', 'buy') THEN 1 ELSE 0 END) as total_buy_signals
      FROM alerts
      WHERE is_dismissed = false
        AND triggered_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
    `);
    return result.rows[0] || null;
  }

  /**
   * Mark alert as read
   */
  async markAsRead(database, alertId) {
    return await database.query(`
      UPDATE alerts
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [alertId]);
  }

  /**
   * Mark all alerts as read
   */
  async markAllAsRead(database, filters = {}) {
    let sql = 'UPDATE alerts SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE is_read = false';
    const params = [];

    if (filters.companyId) {
      sql += ' AND company_id = $1';
      params.push(filters.companyId);
    }

    return await database.query(sql, params);
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(database, alertId) {
    return await database.query(`
      UPDATE alerts
      SET is_dismissed = true, dismissed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [alertId]);
  }

  /**
   * Get clusters
   */
  async getClusters(database, limit = 20) {
    const result = await database.query(`
      SELECT
        ac.*,
        c.symbol,
        c.name as company_name
      FROM alert_clusters ac
      LEFT JOIN companies c ON ac.company_id = c.id
      WHERE ac.is_dismissed = false
      ORDER BY ac.created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }
}

module.exports = AlertService;
