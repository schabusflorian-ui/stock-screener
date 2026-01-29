// src/services/alerts/index.js
// Main Alert Service - coordinates detection, processing, and storage

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
  constructor(db, options = {}) {
    this.db = db;
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

    // Initialize detectors
    this.detectors = {
      valuation: new ValuationDetector(db),
      fundamental: new FundamentalDetector(db),
      price: new PriceDetector(db),
      filing: new FilingDetector(db),
      composite: new CompositeDetector(db)
    };

    this.clusterProcessor = new ClusterProcessor(db);
  }

  /**
   * Main entry point - run detection for specified companies
   */
  async runDetection(trigger, companyIds = null) {
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
        ? this.getCompaniesById(companyIds)
        : this.getCompaniesForTrigger(trigger);

      results.companiesEvaluated = companies.length;

      // Get watchlist for priority boosting
      const watchlistIds = new Set(this.getWatchlistCompanyIds());

      // Run appropriate detectors
      const candidateAlerts = [];

      for (const company of companies) {
        try {
          const companyAlerts = await this.detectForCompany(company, trigger);

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
      const dedupedAlerts = this.deduplicateAlerts(candidateAlerts);

      // Cluster related alerts
      const { alerts: finalAlerts, clusters } = this.clusterProcessor.process(dedupedAlerts);

      // Save clusters first to get IDs
      const clusterIdMap = {};
      for (const cluster of clusters) {
        const clusterId = this.saveCluster(cluster);
        clusterIdMap[cluster._tempId] = clusterId;
      }

      // Save all alerts with cluster IDs
      for (const alert of finalAlerts) {
        if (alert._clusterId && clusterIdMap[alert._clusterId]) {
          alert.cluster_id = clusterIdMap[alert._clusterId];
        }
        this.saveAlert(alert);
      }

      // Update alert states
      this.updateAlertStates(companies);

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
  async detectForCompany(company, trigger) {
    const alerts = [];
    const previousState = this.getAlertState(company.id);

    // Run detectors based on trigger type
    const detectorsToRun = this.getDetectorsForTrigger(trigger);

    for (const detectorName of detectorsToRun) {
      const detector = this.detectors[detectorName];
      if (detector) {
        try {
          const detectorAlerts = await detector.detect(company, previousState);
          alerts.push(...detectorAlerts.filter(Boolean));
        } catch (err) {
          console.error(`Error in ${detectorName} detector for ${company.symbol}:`, err.message);
        }
      }
    }

    // Always run composite detector last (needs results from others)
    if (detectorsToRun.length > 0 && !detectorsToRun.includes('composite')) {
      try {
        const compositeAlerts = await this.detectors.composite.detect(company, previousState, alerts);
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
  isOnCooldown(companyId, alertCode) {
    if (!this.options.enableSmartCooldowns) {
      // Fall back to legacy 24-hour window
      const cutoff = new Date(Date.now() - this.options.dedupeWindowHours * 60 * 60 * 1000).toISOString();
      const existing = this.db.prepare(`
        SELECT id FROM alerts
        WHERE company_id = ? AND alert_code = ? AND triggered_at > ? AND is_dismissed = 0
        LIMIT 1
      `).get(companyId, alertCode, cutoff);
      return !!existing;
    }

    // Get alert-specific cooldown
    const cooldownHours = getCooldownHours(alertCode);
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

    const existing = this.db.prepare(`
      SELECT id FROM alerts
      WHERE company_id = ?
        AND alert_code = ?
        AND triggered_at > ?
        AND is_dismissed = 0
      LIMIT 1
    `).get(companyId, alertCode, cutoff);

    return !!existing;
  }

  /**
   * Check if symbol has hit weekly alert cap
   */
  isAtWeeklyCap(companyId) {
    if (!this.options.enableWeeklyCap) return false;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const count = this.db.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE company_id = ?
        AND triggered_at > ?
        AND is_dismissed = 0
    `).get(companyId, weekAgo);

    return count.count >= this.options.maxAlertsPerSymbolPerWeek;
  }

  /**
   * Get weekly alert count for a company
   */
  getWeeklyAlertCount(companyId) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE company_id = ? AND triggered_at > ?
    `).get(companyId, weekAgo);
    return result.count;
  }

  /**
   * Deduplicate alerts - use per-alert-code cooldowns and weekly caps
   */
  deduplicateAlerts(alerts) {
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
      if (this.isOnCooldown(alert.company_id, alert.alert_code)) {
        skipped.cooldown++;
        continue;
      }

      // Check weekly cap (but allow P5 critical alerts through)
      if (alert.priority < 5 && this.isAtWeeklyCap(alert.company_id)) {
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
  saveAlert(alert) {
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

    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        company_id, alert_type, alert_code, signal_type, priority,
        title, description, data, cluster_id, is_cluster_primary,
        triggered_by, source_record_id, triggered_at, expires_at,
        actionability_score, action_suggestions, adjusted_priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      alert.company_id,
      alert.alert_type,
      alert.alert_code,
      alert.signal_type,
      alert.priority,
      alert.title,
      alert.description,
      JSON.stringify(alertData),
      alert.cluster_id || null,
      alert.is_cluster_primary || 0,
      alert.triggered_by,
      alert.source_record_id || null,
      alert.triggered_at || new Date().toISOString(),
      expiresAt,
      actionabilityScore,
      actionSuggestions.length > 0 ? JSON.stringify(actionSuggestions) : null,
      alert.adjusted_priority || alert.priority
    );

    // Update cooldown tracking
    this.updateCooldownTracking(alert.company_id, alert.alert_code);

    return result.lastInsertRowid;
  }

  /**
   * Update cooldown tracking after saving an alert
   */
  updateCooldownTracking(companyId, alertCode) {
    try {
      // Check if alert_cooldowns table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='alert_cooldowns'
      `).get();

      if (tableExists) {
        this.db.prepare(`
          INSERT INTO alert_cooldowns (company_id, alert_code, last_triggered_at, trigger_count_7d)
          VALUES (?, ?, datetime('now'), 1)
          ON CONFLICT(company_id, alert_code) DO UPDATE SET
            last_triggered_at = datetime('now'),
            trigger_count_7d = trigger_count_7d + 1
        `).run(companyId, alertCode);
      }

      // Also update alert_state
      this.db.prepare(`
        UPDATE alert_state
        SET last_alert_at = datetime('now'),
            alert_count_7d = COALESCE(alert_count_7d, 0) + 1
        WHERE company_id = ?
      `).run(companyId);
    } catch (err) {
      // Ignore errors - cooldown tracking is optional enhancement
      console.warn('[AlertService] Could not update cooldown tracking:', err.message);
    }
  }

  /**
   * Save cluster to database
   */
  saveCluster(cluster) {
    const stmt = this.db.prepare(`
      INSERT INTO alert_clusters (
        company_id, cluster_type, title, description,
        alert_count, signal_type, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      cluster.company_id,
      cluster.cluster_type,
      cluster.title,
      cluster.description,
      cluster.alert_count,
      cluster.signal_type,
      cluster.priority
    );

    return result.lastInsertRowid;
  }

  /**
   * Get alert state for a company
   */
  getAlertState(companyId) {
    return this.db.prepare(`
      SELECT * FROM alert_state WHERE company_id = ?
    `).get(companyId);
  }

  /**
   * Update alert state after detection
   */
  updateAlertStates(companies) {
    const upsertStmt = this.db.prepare(`
      INSERT INTO alert_state (company_id, last_evaluated_at)
      VALUES (?, datetime('now'))
      ON CONFLICT(company_id) DO UPDATE SET
        last_evaluated_at = datetime('now')
    `);

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
          const setClause = columns.map(c => `${c} = ?`).join(', ');
          const values = columns.map(c => state[c]);

          this.db.prepare(`
            INSERT INTO alert_state (company_id, ${columns.join(', ')}, last_evaluated_at)
            VALUES (?, ${columns.map(() => '?').join(', ')}, datetime('now'))
            ON CONFLICT(company_id) DO UPDATE SET
              ${setClause},
              last_evaluated_at = datetime('now')
          `).run(company.id, ...values, ...values);
        } else {
          upsertStmt.run(company.id);
        }
      } catch (err) {
        // Continue with other companies
      }
    }
  }

  /**
   * Get companies by ID
   */
  getCompaniesById(companyIds) {
    if (!companyIds || companyIds.length === 0) return [];

    const placeholders = companyIds.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT id, symbol, name FROM companies
      WHERE id IN (${placeholders})
        AND symbol IS NOT NULL
        AND symbol NOT LIKE 'CIK_%'
    `).all(...companyIds);
  }

  /**
   * Get companies for a trigger type
   */
  getCompaniesForTrigger(trigger) {
    // For daily scan, get all companies with price metrics
    if (trigger === 'daily_scan' || trigger === 'manual') {
      return this.db.prepare(`
        SELECT c.id, c.symbol, c.name
        FROM companies c
        JOIN price_metrics pm ON c.id = pm.company_id
        WHERE c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND pm.last_price IS NOT NULL
        LIMIT 1000
      `).all();
    }

    // For price updates, get recently updated companies
    if (trigger === 'price_update') {
      return this.db.prepare(`
        SELECT c.id, c.symbol, c.name
        FROM companies c
        JOIN price_metrics pm ON c.id = pm.company_id
        WHERE c.symbol IS NOT NULL
          AND pm.updated_at >= datetime('now', '-1 hour')
        LIMIT 500
      `).all();
    }

    return [];
  }

  /**
   * Get watchlist company IDs
   */
  getWatchlistCompanyIds() {
    const rows = this.db.prepare(`
      SELECT company_id FROM watchlist
    `).all();
    return rows.map(r => r.company_id);
  }

  // ==========================================
  // QUERY METHODS (for API endpoints)
  // ==========================================

  /**
   * Get alerts for dashboard (top priority, unread)
   */
  getDashboardAlerts(limit = 10) {
    return this.db.prepare(`
      SELECT
        a.*,
        c.symbol,
        c.name as company_name,
        CASE WHEN w.id IS NOT NULL THEN 1 ELSE 0 END as is_watchlist
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      LEFT JOIN watchlist w ON c.id = w.company_id
      WHERE a.is_dismissed = 0
        AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
      ORDER BY
        a.is_read ASC,
        a.priority DESC,
        a.triggered_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get alerts for a specific company
   */
  getCompanyAlerts(companyId, options = {}) {
    const { limit = 20, includeRead = true, includeDismissed = false } = options;

    let sql = `
      SELECT a.*
      FROM alerts a
      WHERE a.company_id = ?
    `;

    if (!includeRead) sql += ' AND a.is_read = 0';
    if (!includeDismissed) sql += ' AND a.is_dismissed = 0';

    sql += ' ORDER BY a.triggered_at DESC LIMIT ?';

    return this.db.prepare(sql).all(companyId, limit);
  }

  /**
   * Get all alerts with filters
   */
  getAlerts(filters = {}) {
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
        CASE WHEN w.id IS NOT NULL THEN 1 ELSE 0 END as is_watchlist
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      LEFT JOIN watchlist w ON c.id = w.company_id
      WHERE a.is_dismissed = 0
        AND a.priority >= ?
    `;

    const params = [minPriority];

    if (alertTypes && alertTypes.length > 0) {
      sql += ` AND a.alert_type IN (${alertTypes.map(() => '?').join(',')})`;
      params.push(...alertTypes);
    }

    if (signalTypes && signalTypes.length > 0) {
      sql += ` AND a.signal_type IN (${signalTypes.map(() => '?').join(',')})`;
      params.push(...signalTypes);
    }

    if (companyIds && companyIds.length > 0) {
      sql += ` AND a.company_id IN (${companyIds.map(() => '?').join(',')})`;
      params.push(...companyIds);
    }

    if (watchlistOnly) {
      sql += ' AND w.id IS NOT NULL';
    }

    if (unreadOnly) {
      sql += ' AND a.is_read = 0';
    }

    if (startDate) {
      sql += ' AND a.triggered_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND a.triggered_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY a.triggered_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get alert summary counts
   */
  getAlertSummary() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN signal_type = 'strong_buy' AND is_read = 0 THEN 1 ELSE 0 END) as strong_buy_unread,
        SUM(CASE WHEN signal_type = 'buy' AND is_read = 0 THEN 1 ELSE 0 END) as buy_unread,
        SUM(CASE WHEN signal_type = 'warning' AND is_read = 0 THEN 1 ELSE 0 END) as warning_unread,
        SUM(CASE WHEN signal_type IN ('strong_buy', 'buy') THEN 1 ELSE 0 END) as total_buy_signals
      FROM alerts
      WHERE is_dismissed = 0
        AND triggered_at > datetime('now', '-7 days')
    `).get();
  }

  /**
   * Mark alert as read
   */
  markAsRead(alertId) {
    return this.db.prepare(`
      UPDATE alerts
      SET is_read = 1, read_at = datetime('now')
      WHERE id = ?
    `).run(alertId);
  }

  /**
   * Mark all alerts as read
   */
  markAllAsRead(filters = {}) {
    let sql = 'UPDATE alerts SET is_read = 1, read_at = datetime(\'now\') WHERE is_read = 0';
    const params = [];

    if (filters.companyId) {
      sql += ' AND company_id = ?';
      params.push(filters.companyId);
    }

    return this.db.prepare(sql).run(...params);
  }

  /**
   * Dismiss alert
   */
  dismissAlert(alertId) {
    return this.db.prepare(`
      UPDATE alerts
      SET is_dismissed = 1, dismissed_at = datetime('now')
      WHERE id = ?
    `).run(alertId);
  }

  /**
   * Get clusters
   */
  getClusters(limit = 20) {
    return this.db.prepare(`
      SELECT
        ac.*,
        c.symbol,
        c.name as company_name
      FROM alert_clusters ac
      LEFT JOIN companies c ON ac.company_id = c.id
      WHERE ac.is_dismissed = 0
      ORDER BY ac.created_at DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = AlertService;
