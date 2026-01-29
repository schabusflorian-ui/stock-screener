// src/services/mlops/modelMonitor.js
/**
 * Model Drift & Degradation Monitor
 *
 * Real-time monitoring for production ML models:
 * - Prediction distribution shift (KL divergence)
 * - Feature distribution shift (PSI)
 * - Rolling IC degradation
 * - Calibration drift
 * - Direction accuracy decay
 * - Regime mismatch detection
 * - Stale prediction alerts
 *
 * Alert Thresholds:
 * - KL divergence > 0.1 nats
 * - PSI > 0.25 per feature
 * - Rolling IC < 50% of training IC
 * - Calibration drift > 20%
 * - Direction accuracy < 48%
 */

class ModelMonitor {
  constructor(db, options = {}) {
    this.db = db?.getDatabase ? db.getDatabase() : db;
    this._ensureTables();

    // Alert thresholds
    this.thresholds = {
      klDivergence: options.klDivergence || 0.1,
      psi: options.psi || 0.25,
      icDegradation: options.icDegradation || 0.5, // 50% of training IC
      calibrationDrift: options.calibrationDrift || 0.20,
      directionAccuracyMin: options.directionAccuracyMin || 0.48,
      stalePredictionHours: options.stalePredictionHours || 24
    };

    // Monitoring state (in-memory cache)
    this.predictionHistory = new Map(); // modelName -> predictions[]
    this.featureHistory = new Map();    // featureName -> values[]
    this.alerts = [];

    // Reference distributions (from training)
    this.referenceDistributions = new Map();

    // Configuration
    this.historyWindowSize = options.historyWindowSize || 1000;
    this.rollingWindowDays = options.rollingWindowDays || 21;

    // Load reference distributions from DB
    this._loadReferenceDistributions();
  }

  /**
   * Ensure database tables exist for persistence
   */
  _ensureTables() {
    if (!this.db) return;

    try {
      // Model reference distributions table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_reference_distributions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL UNIQUE,
          ic REAL,
          direction_accuracy REAL,
          prediction_mean REAL DEFAULT 0,
          prediction_std REAL DEFAULT 0.02,
          calibration_68 REAL DEFAULT 0.68,
          feature_distributions TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Drift alerts history table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_drift_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT,
          metric_value REAL,
          threshold_value REAL,
          action TEXT,
          acknowledged INTEGER DEFAULT 0,
          acknowledged_at DATETIME,
          acknowledged_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Model health check history table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_health_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          overall_status TEXT NOT NULL,
          ic_value REAL,
          ic_status TEXT,
          direction_accuracy REAL,
          direction_status TEXT,
          calibration_coverage REAL,
          calibration_status TEXT,
          staleness_hours REAL,
          staleness_status TEXT,
          alerts_count INTEGER DEFAULT 0,
          check_data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indices for fast queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_drift_alerts_model ON model_drift_alerts(model_name);
        CREATE INDEX IF NOT EXISTS idx_drift_alerts_created ON model_drift_alerts(created_at);
        CREATE INDEX IF NOT EXISTS idx_drift_alerts_ack ON model_drift_alerts(acknowledged);
        CREATE INDEX IF NOT EXISTS idx_health_checks_model ON model_health_checks(model_name);
        CREATE INDEX IF NOT EXISTS idx_health_checks_created ON model_health_checks(created_at);
      `);
    } catch (e) {
      console.warn('ModelMonitor: Could not create tables:', e.message);
    }
  }

  /**
   * Load reference distributions from database
   */
  _loadReferenceDistributions() {
    if (!this.db) return;

    try {
      const refs = this.db.prepare(`
        SELECT * FROM model_reference_distributions
      `).all();

      for (const ref of refs) {
        this.referenceDistributions.set(ref.model_name, {
          ic: ref.ic,
          directionAccuracy: ref.direction_accuracy,
          predictionMean: ref.prediction_mean,
          predictionStd: ref.prediction_std,
          calibration68: ref.calibration_68,
          featureDistributions: ref.feature_distributions ? JSON.parse(ref.feature_distributions) : {},
          timestamp: new Date(ref.updated_at)
        });
      }

      if (refs.length > 0) {
        console.log(`[ModelMonitor] Loaded ${refs.length} reference distributions from DB`);
      }
    } catch (e) {
      // Table may not exist yet
    }
  }

  /**
   * Initialize reference distributions from training data
   * Persists to database for survival across restarts
   */
  async initializeReference(modelName, trainingMetrics) {
    const reference = {
      ic: trainingMetrics.ic,
      directionAccuracy: trainingMetrics.directionAccuracy,
      predictionMean: trainingMetrics.predictionMean || 0,
      predictionStd: trainingMetrics.predictionStd || 0.02,
      calibration68: trainingMetrics.calibration68 || 0.68,
      featureDistributions: trainingMetrics.featureDistributions || {},
      timestamp: new Date()
    };

    this.referenceDistributions.set(modelName, reference);

    // Persist to database
    if (this.db) {
      try {
        this.db.prepare(`
          INSERT INTO model_reference_distributions
          (model_name, ic, direction_accuracy, prediction_mean, prediction_std, calibration_68, feature_distributions)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(model_name) DO UPDATE SET
            ic = excluded.ic,
            direction_accuracy = excluded.direction_accuracy,
            prediction_mean = excluded.prediction_mean,
            prediction_std = excluded.prediction_std,
            calibration_68 = excluded.calibration_68,
            feature_distributions = excluded.feature_distributions,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          modelName,
          reference.ic,
          reference.directionAccuracy,
          reference.predictionMean,
          reference.predictionStd,
          reference.calibration68,
          JSON.stringify(reference.featureDistributions)
        );
      } catch (e) {
        console.error('ModelMonitor: Failed to persist reference:', e.message);
      }
    }

    console.log(`[ModelMonitor] Initialized reference for ${modelName}:`, {
      ic: trainingMetrics.ic,
      directionAccuracy: trainingMetrics.directionAccuracy
    });
  }

  /**
   * Record a new prediction for monitoring
   */
  recordPrediction(modelName, prediction, actual = null, uncertainty = null) {
    if (!this.predictionHistory.has(modelName)) {
      this.predictionHistory.set(modelName, []);
    }

    const history = this.predictionHistory.get(modelName);
    history.push({
      prediction,
      actual,
      uncertainty,
      timestamp: new Date()
    });

    // Trim to window size
    if (history.length > this.historyWindowSize) {
      history.shift();
    }
  }

  /**
   * Record feature values for drift detection
   */
  recordFeatures(featureValues) {
    for (const [featureName, value] of Object.entries(featureValues)) {
      if (!this.featureHistory.has(featureName)) {
        this.featureHistory.set(featureName, []);
      }

      const history = this.featureHistory.get(featureName);
      history.push({
        value,
        timestamp: new Date()
      });

      if (history.length > this.historyWindowSize) {
        history.shift();
      }
    }
  }

  /**
   * Calculate Population Stability Index (PSI)
   * Measures shift between expected and actual distributions
   */
  calculatePSI(expected, actual, bins = 10) {
    if (!expected || !actual || expected.length < bins || actual.length < bins) {
      return { psi: 0, status: 'insufficient_data' };
    }

    // Create bins from expected distribution
    const expSorted = [...expected].sort((a, b) => a - b);
    const binEdges = [];
    for (let i = 0; i <= bins; i++) {
      const idx = Math.floor((i / bins) * (expSorted.length - 1));
      binEdges.push(expSorted[idx]);
    }

    // Calculate bin proportions
    const getProportions = (values) => {
      const counts = new Array(bins).fill(0);
      for (const v of values) {
        for (let b = 0; b < bins; b++) {
          if (v >= binEdges[b] && (b === bins - 1 || v < binEdges[b + 1])) {
            counts[b]++;
            break;
          }
        }
      }
      return counts.map(c => Math.max(c / values.length, 0.0001)); // Avoid zero
    };

    const expProps = getProportions(expected);
    const actProps = getProportions(actual);

    // Calculate PSI
    let psi = 0;
    for (let i = 0; i < bins; i++) {
      psi += (actProps[i] - expProps[i]) * Math.log(actProps[i] / expProps[i]);
    }

    // Interpret PSI
    let interpretation;
    if (psi < 0.10) {
      interpretation = 'no_shift';
    } else if (psi < 0.25) {
      interpretation = 'minor_shift';
    } else {
      interpretation = 'significant_shift';
    }

    return {
      psi,
      interpretation,
      status: psi > this.thresholds.psi ? 'alert' : 'ok'
    };
  }

  /**
   * Calculate KL Divergence between distributions
   */
  calculateKLDivergence(p, q, bins = 20) {
    if (!p || !q || p.length < bins || q.length < bins) {
      return { kl: 0, status: 'insufficient_data' };
    }

    // Create histograms
    const allValues = [...p, ...q];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const binWidth = (max - min) / bins;

    const histogram = (values) => {
      const counts = new Array(bins).fill(0);
      for (const v of values) {
        const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
        counts[idx]++;
      }
      // Convert to probabilities with smoothing
      const total = values.length;
      return counts.map(c => (c + 0.5) / (total + bins * 0.5));
    };

    const pHist = histogram(p);
    const qHist = histogram(q);

    // Calculate KL(P || Q)
    let kl = 0;
    for (let i = 0; i < bins; i++) {
      if (pHist[i] > 0) {
        kl += pHist[i] * Math.log(pHist[i] / qHist[i]);
      }
    }

    return {
      kl,
      status: kl > this.thresholds.klDivergence ? 'alert' : 'ok'
    };
  }

  /**
   * Calculate rolling Information Coefficient
   */
  calculateRollingIC(modelName) {
    const history = this.predictionHistory.get(modelName);
    if (!history) {
      return { ic: null, status: 'no_data' };
    }

    // Filter to entries with actual values
    const withActuals = history.filter(h => h.actual !== null);

    if (withActuals.length < 30) {
      return { ic: null, status: 'insufficient_data' };
    }

    const predictions = withActuals.map(h => h.prediction);
    const actuals = withActuals.map(h => h.actual);

    // Calculate Pearson correlation
    const n = predictions.length;
    const meanP = predictions.reduce((a, b) => a + b, 0) / n;
    const meanA = actuals.reduce((a, b) => a + b, 0) / n;

    let sumPP = 0, sumAA = 0, sumPA = 0;
    for (let i = 0; i < n; i++) {
      const dp = predictions[i] - meanP;
      const da = actuals[i] - meanA;
      sumPP += dp * dp;
      sumAA += da * da;
      sumPA += dp * da;
    }

    const ic = sumPA / (Math.sqrt(sumPP) * Math.sqrt(sumAA));

    // Compare to reference
    const reference = this.referenceDistributions.get(modelName);
    let degradation = null;
    let status = 'ok';

    if (reference && reference.ic) {
      degradation = 1 - (ic / reference.ic);
      if (ic < reference.ic * this.thresholds.icDegradation) {
        status = 'alert';
      }
    }

    return {
      ic,
      referenceIC: reference?.ic || null,
      degradation,
      status
    };
  }

  /**
   * Calculate direction accuracy (% correct sign predictions)
   */
  calculateDirectionAccuracy(modelName) {
    const history = this.predictionHistory.get(modelName);
    if (!history) {
      return { accuracy: null, status: 'no_data' };
    }

    const withActuals = history.filter(h => h.actual !== null);

    if (withActuals.length < 30) {
      return { accuracy: null, status: 'insufficient_data' };
    }

    let correct = 0;
    for (const h of withActuals) {
      if ((h.prediction > 0 && h.actual > 0) || (h.prediction < 0 && h.actual < 0)) {
        correct++;
      }
    }

    const accuracy = correct / withActuals.length;

    return {
      accuracy,
      status: accuracy < this.thresholds.directionAccuracyMin ? 'alert' : 'ok'
    };
  }

  /**
   * Check uncertainty calibration
   * 68% of actuals should fall within 1σ of predictions
   */
  calculateCalibration(modelName) {
    const history = this.predictionHistory.get(modelName);
    if (!history) {
      return { coverage: null, status: 'no_data' };
    }

    const withUncertainty = history.filter(h => h.actual !== null && h.uncertainty !== null);

    if (withUncertainty.length < 50) {
      return { coverage: null, status: 'insufficient_data' };
    }

    let within1Sigma = 0;
    for (const h of withUncertainty) {
      const error = Math.abs(h.actual - h.prediction);
      if (error <= h.uncertainty) {
        within1Sigma++;
      }
    }

    const coverage = within1Sigma / withUncertainty.length;
    const expectedCoverage = 0.68;
    const drift = Math.abs(coverage - expectedCoverage);

    return {
      coverage,
      expectedCoverage,
      drift,
      status: drift > this.thresholds.calibrationDrift ? 'alert' : 'ok'
    };
  }

  /**
   * Check for stale predictions
   */
  checkStalePredictions(modelName) {
    const history = this.predictionHistory.get(modelName);
    if (!history || history.length === 0) {
      return { staleness: null, status: 'no_predictions' };
    }

    const lastPrediction = history[history.length - 1];
    const hoursSinceLastPrediction =
      (Date.now() - lastPrediction.timestamp.getTime()) / (1000 * 60 * 60);

    return {
      lastPredictionTime: lastPrediction.timestamp,
      hoursSinceLast: hoursSinceLastPrediction,
      status: hoursSinceLastPrediction > this.thresholds.stalePredictionHours ? 'alert' : 'ok'
    };
  }

  /**
   * Run comprehensive health check for a model
   * Persists results and alerts to database
   */
  async runHealthCheck(modelName, verbose = false) {
    if (verbose) {
      console.log(`\n[ModelMonitor] Running health check for: ${modelName}`);
    }

    const checks = {
      timestamp: new Date().toISOString(),
      modelName,
      checks: {},
      alerts: [],
      overallStatus: 'ok'
    };

    // IC Check
    const icResult = this.calculateRollingIC(modelName);
    checks.checks.informationCoefficient = icResult;
    if (icResult.status === 'alert') {
      checks.alerts.push({
        type: 'ic_degradation',
        severity: 'warning',
        message: `IC degraded: ${icResult.ic?.toFixed(4)} vs reference ${icResult.referenceIC?.toFixed(4)}`,
        metricValue: icResult.ic,
        thresholdValue: icResult.referenceIC * this.thresholds.icDegradation,
        action: 'notify_quant_team'
      });
    }

    // Direction Accuracy Check
    const dirResult = this.calculateDirectionAccuracy(modelName);
    checks.checks.directionAccuracy = dirResult;
    if (dirResult.status === 'alert') {
      checks.alerts.push({
        type: 'direction_accuracy_decay',
        severity: 'warning',
        message: `Direction accuracy below threshold: ${(dirResult.accuracy * 100).toFixed(1)}%`,
        metricValue: dirResult.accuracy,
        thresholdValue: this.thresholds.directionAccuracyMin,
        action: 'investigate'
      });
    }

    // Calibration Check
    const calResult = this.calculateCalibration(modelName);
    checks.checks.calibration = calResult;
    if (calResult.status === 'alert') {
      checks.alerts.push({
        type: 'calibration_drift',
        severity: 'warning',
        message: `Calibration drift: ${(calResult.coverage * 100).toFixed(1)}% vs expected 68%`,
        metricValue: calResult.coverage,
        thresholdValue: 0.68,
        action: 'log_and_monitor'
      });
    }

    // Staleness Check
    const staleResult = this.checkStalePredictions(modelName);
    checks.checks.staleness = staleResult;
    if (staleResult.status === 'alert') {
      checks.alerts.push({
        type: 'stale_predictions',
        severity: 'critical',
        message: `No predictions for ${staleResult.hoursSinceLast?.toFixed(1) || '?'} hours`,
        metricValue: staleResult.hoursSinceLast,
        thresholdValue: this.thresholds.stalePredictionHours,
        action: 'pause_trading'
      });
    }

    // Determine overall status
    if (checks.alerts.some(a => a.severity === 'critical')) {
      checks.overallStatus = 'critical';
    } else if (checks.alerts.length > 0) {
      checks.overallStatus = 'warning';
    }

    // Persist health check to database
    this._persistHealthCheck(modelName, checks, icResult, dirResult, calResult, staleResult);

    // Persist any new alerts
    for (const alert of checks.alerts) {
      this._persistAlert(modelName, alert);
    }

    if (verbose) {
      console.log(`  IC: ${icResult.ic?.toFixed(4) || 'N/A'} [${icResult.status}]`);
      console.log(`  Direction: ${dirResult.accuracy ? (dirResult.accuracy * 100).toFixed(1) + '%' : 'N/A'} [${dirResult.status}]`);
      console.log(`  Calibration: ${calResult.coverage ? (calResult.coverage * 100).toFixed(1) + '%' : 'N/A'} [${calResult.status}]`);
      console.log(`  Overall Status: ${checks.overallStatus.toUpperCase()}`);
    }

    return checks;
  }

  /**
   * Persist health check results to database
   */
  _persistHealthCheck(modelName, checks, icResult, dirResult, calResult, staleResult) {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO model_health_checks
        (model_name, overall_status, ic_value, ic_status, direction_accuracy, direction_status,
         calibration_coverage, calibration_status, staleness_hours, staleness_status, alerts_count, check_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        modelName,
        checks.overallStatus,
        icResult.ic,
        icResult.status,
        dirResult.accuracy,
        dirResult.status,
        calResult.coverage,
        calResult.status,
        staleResult.hoursSinceLast,
        staleResult.status,
        checks.alerts.length,
        JSON.stringify(checks)
      );
    } catch (e) {
      console.warn('ModelMonitor: Failed to persist health check:', e.message);
    }
  }

  /**
   * Persist alert to database
   */
  _persistAlert(modelName, alert) {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO model_drift_alerts
        (model_name, alert_type, severity, message, metric_value, threshold_value, action)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        modelName,
        alert.type,
        alert.severity,
        alert.message,
        alert.metricValue,
        alert.thresholdValue,
        alert.action
      );
    } catch (e) {
      console.warn('ModelMonitor: Failed to persist alert:', e.message);
    }
  }

  /**
   * Check feature drift for all tracked features
   */
  checkFeatureDrift(referenceFeatures) {
    const driftResults = {};

    for (const [featureName, currentHistory] of this.featureHistory) {
      const referenceValues = referenceFeatures[featureName];
      if (!referenceValues || currentHistory.length < 50) {
        driftResults[featureName] = { status: 'insufficient_data' };
        continue;
      }

      const currentValues = currentHistory.map(h => h.value);
      const psiResult = this.calculatePSI(referenceValues, currentValues);

      driftResults[featureName] = {
        psi: psiResult.psi,
        interpretation: psiResult.interpretation,
        status: psiResult.status
      };
    }

    return {
      features: driftResults,
      alertCount: Object.values(driftResults).filter(r => r.status === 'alert').length,
      overallStatus: Object.values(driftResults).some(r => r.status === 'alert') ? 'alert' : 'ok'
    };
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    const stats = {
      modelsTracked: this.predictionHistory.size,
      featuresTracked: this.featureHistory.size,
      referenceModels: this.referenceDistributions.size,
      alertsActive: this.alerts.length
    };

    for (const [modelName, history] of this.predictionHistory) {
      stats[`${modelName}_predictions`] = history.length;
    }

    return stats;
  }

  /**
   * Clear monitoring history (for testing)
   */
  reset() {
    this.predictionHistory.clear();
    this.featureHistory.clear();
    this.alerts = [];
  }

  // ============================================
  // Database Query Methods
  // ============================================

  /**
   * Get active (unacknowledged) alerts
   */
  getActiveAlerts(modelName = null, limit = 50) {
    if (!this.db) return [];

    try {
      let query = `
        SELECT * FROM model_drift_alerts
        WHERE acknowledged = 0
      `;
      const params = [];

      if (modelName) {
        query += ' AND model_name = ?';
        params.push(modelName);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      return this.db.prepare(query).all(...params);
    } catch (e) {
      console.warn('ModelMonitor: Failed to get active alerts:', e.message);
      return [];
    }
  }

  /**
   * Get all alerts (with optional filters)
   */
  getAlerts(options = {}) {
    if (!this.db) return [];

    const { modelName, severity, alertType, limit = 100, includeAcknowledged = true } = options;

    try {
      let query = 'SELECT * FROM model_drift_alerts WHERE 1=1';
      const params = [];

      if (modelName) {
        query += ' AND model_name = ?';
        params.push(modelName);
      }
      if (severity) {
        query += ' AND severity = ?';
        params.push(severity);
      }
      if (alertType) {
        query += ' AND alert_type = ?';
        params.push(alertType);
      }
      if (!includeAcknowledged) {
        query += ' AND acknowledged = 0';
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      return this.db.prepare(query).all(...params);
    } catch (e) {
      console.warn('ModelMonitor: Failed to get alerts:', e.message);
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId, acknowledgedBy = 'system') {
    if (!this.db) return false;

    try {
      this.db.prepare(`
        UPDATE model_drift_alerts
        SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = ?
        WHERE id = ?
      `).run(acknowledgedBy, alertId);
      return true;
    } catch (e) {
      console.warn('ModelMonitor: Failed to acknowledge alert:', e.message);
      return false;
    }
  }

  /**
   * Acknowledge all alerts for a model
   */
  acknowledgeAllAlerts(modelName, acknowledgedBy = 'system') {
    if (!this.db) return 0;

    try {
      const result = this.db.prepare(`
        UPDATE model_drift_alerts
        SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = ?
        WHERE model_name = ? AND acknowledged = 0
      `).run(acknowledgedBy, modelName);
      return result.changes;
    } catch (e) {
      console.warn('ModelMonitor: Failed to acknowledge alerts:', e.message);
      return 0;
    }
  }

  /**
   * Get health check history for a model
   */
  getHealthCheckHistory(modelName, limit = 30) {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT * FROM model_health_checks
        WHERE model_name = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(modelName, limit);
    } catch (e) {
      console.warn('ModelMonitor: Failed to get health history:', e.message);
      return [];
    }
  }

  /**
   * Get latest health check for each model
   */
  getLatestHealthChecks() {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT h1.*
        FROM model_health_checks h1
        INNER JOIN (
          SELECT model_name, MAX(created_at) as max_created
          FROM model_health_checks
          GROUP BY model_name
        ) h2 ON h1.model_name = h2.model_name AND h1.created_at = h2.max_created
        ORDER BY h1.model_name
      `).all();
    } catch (e) {
      console.warn('ModelMonitor: Failed to get latest health checks:', e.message);
      return [];
    }
  }

  /**
   * Get reference distributions for all models
   */
  getReferenceDistributions() {
    const result = {};
    for (const [name, ref] of this.referenceDistributions) {
      result[name] = ref;
    }
    return result;
  }

  /**
   * Get monitoring dashboard summary
   */
  getDashboardSummary() {
    const activeAlerts = this.getActiveAlerts();
    const latestChecks = this.getLatestHealthChecks();

    const summary = {
      totalModelsMonitored: this.referenceDistributions.size,
      modelsInMemory: this.predictionHistory.size,
      activeAlertsCount: activeAlerts.length,
      criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length,
      warningAlerts: activeAlerts.filter(a => a.severity === 'warning').length,
      modelStatuses: {},
      recentAlerts: activeAlerts.slice(0, 10),
      thresholds: this.thresholds
    };

    // Get status per model from latest checks
    for (const check of latestChecks) {
      summary.modelStatuses[check.model_name] = {
        status: check.overall_status,
        ic: check.ic_value,
        directionAccuracy: check.direction_accuracy,
        calibration: check.calibration_coverage,
        lastCheck: check.created_at,
        alertsCount: check.alerts_count
      };
    }

    return summary;
  }

  /**
   * Run health checks for all monitored models
   */
  async runAllHealthChecks(verbose = false) {
    const results = {};

    for (const modelName of this.referenceDistributions.keys()) {
      results[modelName] = await this.runHealthCheck(modelName, verbose);
    }

    return results;
  }

  /**
   * Simulate predictions for testing (useful when no real data)
   */
  simulatePredictions(modelName, count = 100, options = {}) {
    const { ic = 0.05, uncertainty = 0.02 } = options;

    for (let i = 0; i < count; i++) {
      // Generate correlated prediction and actual
      const actual = (Math.random() - 0.5) * 0.1; // Return in [-5%, 5%]
      const noise = (Math.random() - 0.5) * (1 - ic) * 0.2;
      const prediction = actual * ic + noise;

      this.recordPrediction(modelName, prediction, actual, uncertainty);
    }

    console.log(`[ModelMonitor] Simulated ${count} predictions for ${modelName}`);
  }

  // ============================================
  // Prediction Loading from Database
  // ============================================

  /**
   * Load predictions from model_predictions table
   * Syncs database predictions with in-memory history for drift detection
   * @param {string} modelName - Model name to load
   * @param {number} days - Days of history to load
   * @returns {number} Number of predictions loaded
   */
  loadPredictionsFromDB(modelName, days = 30) {
    if (!this.db) return 0;

    try {
      // Check if model_predictions table exists
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='model_predictions'
      `).get();

      if (!tableCheck) {
        console.warn('[ModelMonitor] model_predictions table not found');
        return 0;
      }

      const predictions = this.db.prepare(`
        SELECT predicted_return, actual_return, predicted_uncertainty, prediction_date
        FROM model_predictions
        WHERE model_name = ?
          AND prediction_date >= date('now', '-' || ? || ' days')
        ORDER BY prediction_date ASC
      `).all(modelName, days);

      // Clear existing history for this model
      this.predictionHistory.set(modelName, []);

      // Load predictions into memory
      for (const pred of predictions) {
        this.recordPrediction(
          modelName,
          pred.predicted_return,
          pred.actual_return,
          pred.predicted_uncertainty
        );
      }

      console.log(`[ModelMonitor] Loaded ${predictions.length} predictions for ${modelName} from DB`);
      return predictions.length;
    } catch (e) {
      console.warn('[ModelMonitor] Failed to load predictions from DB:', e.message);
      return 0;
    }
  }

  /**
   * Load all model predictions from database
   * @param {number} days - Days of history to load
   * @returns {Object} Counts per model
   */
  loadAllPredictionsFromDB(days = 30) {
    if (!this.db) return {};

    const counts = {};

    try {
      // Get all unique model names from predictions table
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='model_predictions'
      `).get();

      if (!tableCheck) {
        console.warn('[ModelMonitor] model_predictions table not found');
        return counts;
      }

      const models = this.db.prepare(`
        SELECT DISTINCT model_name FROM model_predictions
        WHERE prediction_date >= date('now', '-' || ? || ' days')
      `).all(days);

      for (const { model_name } of models) {
        counts[model_name] = this.loadPredictionsFromDB(model_name, days);
      }

      return counts;
    } catch (e) {
      console.warn('[ModelMonitor] Failed to load all predictions:', e.message);
      return counts;
    }
  }

  /**
   * Get prediction statistics from database
   * @param {string} modelName - Model name
   * @param {number} days - Days to look back
   * @returns {Object} Statistics including IC, direction accuracy
   */
  getDBPredictionStats(modelName, days = 30) {
    if (!this.db) {
      return { success: false, error: 'No database connection' };
    }

    try {
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='model_predictions'
      `).get();

      if (!tableCheck) {
        return { success: false, error: 'model_predictions table not found' };
      }

      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN actual_return IS NOT NULL THEN 1 ELSE 0 END) as with_actuals,
          AVG(predicted_return) as avg_prediction,
          AVG(actual_return) as avg_actual,
          MIN(prediction_date) as earliest,
          MAX(prediction_date) as latest
        FROM model_predictions
        WHERE model_name = ?
          AND prediction_date >= date('now', '-' || ? || ' days')
      `).get(modelName, days);

      // Calculate IC if we have enough data with actuals
      if (stats.with_actuals >= 30) {
        const predictions = this.db.prepare(`
          SELECT predicted_return, actual_return
          FROM model_predictions
          WHERE model_name = ?
            AND actual_return IS NOT NULL
            AND prediction_date >= date('now', '-' || ? || ' days')
        `).all(modelName, days);

        const preds = predictions.map(p => p.predicted_return);
        const acts = predictions.map(p => p.actual_return);
        const n = preds.length;

        const meanP = preds.reduce((a, b) => a + b, 0) / n;
        const meanA = acts.reduce((a, b) => a + b, 0) / n;

        let sumPP = 0, sumAA = 0, sumPA = 0;
        for (let i = 0; i < n; i++) {
          const dp = preds[i] - meanP;
          const da = acts[i] - meanA;
          sumPP += dp * dp;
          sumAA += da * da;
          sumPA += dp * da;
        }

        const ic = sumPP > 0 && sumAA > 0
          ? sumPA / (Math.sqrt(sumPP) * Math.sqrt(sumAA))
          : 0;

        // Direction accuracy
        let correct = 0;
        for (let i = 0; i < n; i++) {
          if ((preds[i] > 0 && acts[i] > 0) || (preds[i] < 0 && acts[i] < 0)) {
            correct++;
          }
        }

        stats.ic = ic;
        stats.directionAccuracy = correct / n;
        stats.sampleSize = n;
      }

      return { success: true, ...stats };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ============================================
  // Drift-Triggered Retraining
  // ============================================

  /**
   * Check if drift should trigger retraining
   * @param {string} modelName - Model to check
   * @returns {Object} Trigger decision and reason
   */
  shouldTriggerRetraining(modelName) {
    const result = {
      shouldTrigger: false,
      reason: null,
      severity: null,
      metrics: {}
    };

    // Load from DB if needed
    const history = this.predictionHistory.get(modelName);
    if (!history || history.length < 30) {
      this.loadPredictionsFromDB(modelName, 30);
    }

    // Check IC degradation
    const icResult = this.calculateRollingIC(modelName);
    result.metrics.ic = icResult;

    const reference = this.referenceDistributions.get(modelName);
    if (reference && icResult.ic !== null) {
      // Critical: IC < 40% of training (more severe than warning threshold of 50%)
      if (icResult.ic < reference.ic * 0.4) {
        result.shouldTrigger = true;
        result.reason = `IC severely degraded: ${icResult.ic?.toFixed(4)} vs training ${reference.ic?.toFixed(4)} (< 40% threshold)`;
        result.severity = 'critical';
      }
    }

    // Check direction accuracy
    const dirResult = this.calculateDirectionAccuracy(modelName);
    result.metrics.directionAccuracy = dirResult;

    if (dirResult.accuracy !== null && dirResult.accuracy < 0.45) {
      // Direction accuracy below 45% is worse than random (accounting for noise)
      if (!result.shouldTrigger) {
        result.shouldTrigger = true;
        result.reason = `Direction accuracy critically low: ${(dirResult.accuracy * 100).toFixed(1)}%`;
        result.severity = 'critical';
      }
    }

    // Check calibration (less severe)
    const calResult = this.calculateCalibration(modelName);
    result.metrics.calibration = calResult;

    return result;
  }

  /**
   * Trigger retraining via RetrainingScheduler if available
   * @param {string} modelName - Model to retrain
   * @param {string} reason - Reason for retraining
   * @returns {Object} Trigger result
   */
  async triggerRetraining(modelName, reason) {
    const result = {
      triggered: false,
      jobId: null,
      error: null
    };

    try {
      // Try to get RetrainingScheduler
      const { RetrainingScheduler } = require('./retrainingScheduler');

      // Create scheduler if we have db
      if (this.db) {
        const scheduler = new RetrainingScheduler(this.db);

        // Trigger manual job with drift reason
        const jobResult = await scheduler.triggerManual({
          type: 'drift_triggered',
          reason: reason,
          modelName: modelName
        });

        if (jobResult.success) {
          result.triggered = true;
          result.jobId = jobResult.jobId;

          // Log alert with retraining action
          this._persistAlert(modelName, {
            type: 'drift_retraining_triggered',
            severity: 'info',
            message: `Retraining triggered due to drift: ${reason}`,
            metricValue: null,
            thresholdValue: null,
            action: 'retrain_triggered'
          });
        } else {
          result.error = jobResult.error || 'Failed to trigger retraining';
        }
      }
    } catch (e) {
      result.error = `RetrainingScheduler not available: ${e.message}`;
      console.warn('[ModelMonitor] Could not trigger retraining:', e.message);
    }

    return result;
  }

  /**
   * Run health check with optional automatic retraining trigger
   * @param {string} modelName - Model to check
   * @param {Object} options - Options including autoRetrain flag
   * @returns {Object} Health check results with retraining status
   */
  async runHealthCheckWithRetraining(modelName, options = {}) {
    const { autoRetrain = false, verbose = false } = options;

    // First load predictions from database
    this.loadPredictionsFromDB(modelName, 30);

    // Run standard health check
    const healthCheck = await this.runHealthCheck(modelName, verbose);

    // Check if retraining should be triggered
    if (autoRetrain && healthCheck.overallStatus === 'critical') {
      const triggerDecision = this.shouldTriggerRetraining(modelName);

      if (triggerDecision.shouldTrigger) {
        const retrainResult = await this.triggerRetraining(modelName, triggerDecision.reason);
        healthCheck.retrainingTriggered = retrainResult.triggered;
        healthCheck.retrainingJobId = retrainResult.jobId;
        healthCheck.retrainingError = retrainResult.error;

        if (verbose) {
          console.log(`[ModelMonitor] Retraining ${retrainResult.triggered ? 'triggered' : 'failed'}: ${triggerDecision.reason}`);
        }
      }
    }

    return healthCheck;
  }
}

module.exports = { ModelMonitor };
