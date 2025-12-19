// src/services/alerts/index.js
// Main Alert Service - coordinates detection, processing, and storage

const ValuationDetector = require('./detectors/valuationDetector');
const FundamentalDetector = require('./detectors/fundamentalDetector');
const PriceDetector = require('./detectors/priceDetector');
const FilingDetector = require('./detectors/filingDetector');
const CompositeDetector = require('./detectors/compositeDetector');
const ClusterProcessor = require('./processors/clusterProcessor');
const { ALERT_DEFINITIONS, SIGNAL_CONFIG, ALERT_TYPE_CONFIG } = require('./alertDefinitions');

class AlertService {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      dedupeWindowHours: 24,
      maxAlertsPerCompany: 10,
      watchlistPriorityBoost: 1,
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
      let candidateAlerts = [];

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
   * Deduplicate alerts - don't create same alert twice in window
   */
  deduplicateAlerts(alerts) {
    const deduped = [];
    const windowMs = this.options.dedupeWindowHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs).toISOString();

    for (const alert of alerts) {
      // Check if same alert exists recently
      const existing = this.db.prepare(`
        SELECT id FROM alerts
        WHERE company_id = ?
          AND alert_code = ?
          AND triggered_at > ?
          AND is_dismissed = 0
        LIMIT 1
      `).get(alert.company_id, alert.alert_code, cutoff);

      if (!existing) {
        deduped.push(alert);
      }
    }

    return deduped;
  }

  /**
   * Save alert to database
   */
  saveAlert(alert) {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        company_id, alert_type, alert_code, signal_type, priority,
        title, description, data, cluster_id, is_cluster_primary,
        triggered_by, source_record_id, triggered_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      alert.company_id,
      alert.alert_type,
      alert.alert_code,
      alert.signal_type,
      alert.priority,
      alert.title,
      alert.description,
      JSON.stringify(alert.data || {}),
      alert.cluster_id || null,
      alert.is_cluster_primary || 0,
      alert.triggered_by,
      alert.source_record_id || null,
      alert.triggered_at || new Date().toISOString(),
      alert.expires_at || null
    );

    return result.lastInsertRowid;
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

    if (!includeRead) sql += ` AND a.is_read = 0`;
    if (!includeDismissed) sql += ` AND a.is_dismissed = 0`;

    sql += ` ORDER BY a.triggered_at DESC LIMIT ?`;

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
      sql += ` AND w.id IS NOT NULL`;
    }

    if (unreadOnly) {
      sql += ` AND a.is_read = 0`;
    }

    if (startDate) {
      sql += ` AND a.triggered_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND a.triggered_at <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY a.triggered_at DESC LIMIT ? OFFSET ?`;
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
    let sql = `UPDATE alerts SET is_read = 1, read_at = datetime('now') WHERE is_read = 0`;
    const params = [];

    if (filters.companyId) {
      sql += ` AND company_id = ?`;
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
