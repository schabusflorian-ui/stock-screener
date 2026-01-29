// src/services/features/featureMonitor.js
// Feature Drift Monitoring - Detect distribution shifts and data quality issues

const { db } = require('../../database');
const { getRegistry, FEATURE_TYPES } = require('./featureRegistry');
const { getStore } = require('./featureStore');

/**
 * Feature Monitor
 *
 * Monitors feature health and detects:
 * - Distribution drift (covariate shift)
 * - Missing data patterns
 * - Outliers and anomalies
 * - Data freshness issues
 *
 * Critical for production ML systems to detect when
 * models may need retraining due to data changes.
 */
class FeatureMonitor {
  constructor(options = {}) {
    this.registry = getRegistry();
    this.store = getStore();

    // Thresholds
    this.driftThreshold = options.driftThreshold || 0.1;  // PSI threshold
    this.outlierStdThreshold = options.outlierStdThreshold || 4;
    this.missingRateThreshold = options.missingRateThreshold || 0.2;
    this.stalenessThresholdDays = options.stalenessThresholdDays || 7;

    // Store baseline statistics
    this.baselineStats = new Map();

    this._ensureTablesExist();
  }

  /**
   * Create monitoring tables
   */
  _ensureTablesExist() {
    db.exec(`
      -- Feature baseline statistics
      CREATE TABLE IF NOT EXISTS feature_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_name TEXT NOT NULL,
        baseline_date TEXT NOT NULL,
        sample_size INTEGER,
        mean REAL,
        std REAL,
        min_val REAL,
        max_val REAL,
        p5 REAL,
        p25 REAL,
        p50 REAL,
        p75 REAL,
        p95 REAL,
        missing_rate REAL,
        histogram TEXT,  -- JSON array of bin counts
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(feature_name, baseline_date)
      );

      CREATE INDEX IF NOT EXISTS idx_baseline_feature ON feature_baselines(feature_name);

      -- Drift alerts
      CREATE TABLE IF NOT EXISTS feature_drift_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_name TEXT NOT NULL,
        alert_date TEXT NOT NULL,
        alert_type TEXT NOT NULL,  -- 'drift', 'missing', 'outlier', 'stale'
        severity TEXT NOT NULL,    -- 'low', 'medium', 'high', 'critical'
        metric_value REAL,
        threshold REAL,
        details TEXT,
        acknowledged BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_drift_alert_date ON feature_drift_alerts(alert_date);
      CREATE INDEX IF NOT EXISTS idx_drift_alert_feature ON feature_drift_alerts(feature_name);

      -- Feature health summary
      CREATE TABLE IF NOT EXISTS feature_health_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        feature_name TEXT NOT NULL,
        health_score REAL,  -- 0-100
        drift_score REAL,
        completeness_score REAL,
        freshness_score REAL,
        stability_score REAL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(snapshot_date, feature_name)
      );

      CREATE INDEX IF NOT EXISTS idx_health_date ON feature_health_snapshots(snapshot_date);
    `);
  }

  /**
   * Compute and store baseline statistics for a feature
   *
   * @param {string} featureName - Feature to baseline
   * @param {string[]} symbols - Symbols to include
   * @param {string} startDate - Start date for baseline period
   * @param {string} endDate - End date for baseline period
   */
  async computeBaseline(featureName, symbols, startDate, endDate) {
    const feature = this.registry.get(featureName);
    if (!feature) {
      throw new Error(`Feature ${featureName} not found`);
    }

    // Collect feature values
    const values = [];
    let missingCount = 0;
    let totalCount = 0;

    // Get all trading dates
    const dates = db.prepare(`
      SELECT DISTINCT date FROM daily_prices
      WHERE date >= ? AND date <= ?
      ORDER BY date
    `).all(startDate, endDate).map(r => r.date);

    for (const symbol of symbols) {
      for (const date of dates) {
        totalCount++;
        const value = this.store.getFeature(symbol, featureName, date);
        if (value !== null && value !== undefined && !isNaN(value)) {
          values.push(value);
        } else {
          missingCount++;
        }
      }
    }

    if (values.length === 0) {
      console.warn(`No valid values for ${featureName}`);
      return null;
    }

    // Compute statistics
    values.sort((a, b) => a - b);
    const stats = {
      featureName,
      baselineDate: endDate,
      sampleSize: values.length,
      mean: this._mean(values),
      std: this._std(values),
      min: values[0],
      max: values[values.length - 1],
      p5: this._percentile(values, 5),
      p25: this._percentile(values, 25),
      p50: this._percentile(values, 50),
      p75: this._percentile(values, 75),
      p95: this._percentile(values, 95),
      missingRate: missingCount / totalCount,
      histogram: this._computeHistogram(values, 10)
    };

    // Store in database
    db.prepare(`
      INSERT INTO feature_baselines (
        feature_name, baseline_date, sample_size,
        mean, std, min_val, max_val,
        p5, p25, p50, p75, p95,
        missing_rate, histogram
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(feature_name, baseline_date) DO UPDATE SET
        sample_size = excluded.sample_size,
        mean = excluded.mean,
        std = excluded.std,
        min_val = excluded.min_val,
        max_val = excluded.max_val,
        p5 = excluded.p5,
        p25 = excluded.p25,
        p50 = excluded.p50,
        p75 = excluded.p75,
        p95 = excluded.p95,
        missing_rate = excluded.missing_rate,
        histogram = excluded.histogram,
        created_at = datetime('now')
    `).run(
      featureName, endDate, stats.sampleSize,
      stats.mean, stats.std, stats.min, stats.max,
      stats.p5, stats.p25, stats.p50, stats.p75, stats.p95,
      stats.missingRate, JSON.stringify(stats.histogram)
    );

    // Cache in memory
    this.baselineStats.set(featureName, stats);

    return stats;
  }

  /**
   * Check for drift against baseline
   *
   * @param {string} featureName - Feature to check
   * @param {string[]} symbols - Symbols to include
   * @param {string} checkDate - Date to check
   * @returns {object} Drift analysis results
   */
  async checkDrift(featureName, symbols, checkDate) {
    // Get baseline
    let baseline = this.baselineStats.get(featureName);
    if (!baseline) {
      const row = db.prepare(`
        SELECT * FROM feature_baselines
        WHERE feature_name = ?
        ORDER BY baseline_date DESC
        LIMIT 1
      `).get(featureName);

      if (!row) {
        return { error: 'No baseline found', featureName };
      }

      baseline = {
        mean: row.mean,
        std: row.std,
        histogram: JSON.parse(row.histogram),
        min: row.min_val,
        max: row.max_val,
        missingRate: row.missing_rate
      };
      this.baselineStats.set(featureName, baseline);
    }

    // Collect current values
    const currentValues = [];
    let missingCount = 0;

    for (const symbol of symbols) {
      const value = this.store.getFeature(symbol, featureName, checkDate);
      if (value !== null && value !== undefined && !isNaN(value)) {
        currentValues.push(value);
      } else {
        missingCount++;
      }
    }

    if (currentValues.length === 0) {
      return {
        featureName,
        checkDate,
        error: 'No valid values for current period',
        alerts: [{
          type: 'missing',
          severity: 'critical',
          message: 'All values missing for feature'
        }]
      };
    }

    // Compute current statistics
    currentValues.sort((a, b) => a - b);
    const currentStats = {
      mean: this._mean(currentValues),
      std: this._std(currentValues),
      histogram: this._computeHistogram(currentValues, 10, baseline.min, baseline.max),
      missingRate: missingCount / (currentValues.length + missingCount)
    };

    // Calculate PSI (Population Stability Index)
    const psi = this._calculatePSI(baseline.histogram, currentStats.histogram);

    // Calculate KS statistic
    const ks = this._calculateKS(baseline, currentStats);

    // Calculate Z-score of mean shift
    const meanShiftZ = baseline.std > 0
      ? Math.abs(currentStats.mean - baseline.mean) / baseline.std
      : 0;

    // Generate alerts
    const alerts = [];

    // Drift alert
    if (psi > this.driftThreshold) {
      const severity = psi > 0.25 ? 'critical' : psi > 0.15 ? 'high' : 'medium';
      alerts.push({
        type: 'drift',
        severity,
        metric: 'psi',
        value: psi,
        threshold: this.driftThreshold,
        message: `Feature drift detected (PSI=${psi.toFixed(4)})`
      });
    }

    // Mean shift alert
    if (meanShiftZ > 2) {
      const severity = meanShiftZ > 4 ? 'high' : 'medium';
      alerts.push({
        type: 'drift',
        severity,
        metric: 'mean_shift',
        value: meanShiftZ,
        threshold: 2,
        message: `Mean shift detected (${meanShiftZ.toFixed(2)} std from baseline)`
      });
    }

    // Missing rate alert
    if (currentStats.missingRate > this.missingRateThreshold) {
      const severity = currentStats.missingRate > 0.5 ? 'critical' : 'high';
      alerts.push({
        type: 'missing',
        severity,
        metric: 'missing_rate',
        value: currentStats.missingRate,
        threshold: this.missingRateThreshold,
        message: `High missing rate (${(currentStats.missingRate * 100).toFixed(1)}%)`
      });
    }

    // Store alerts
    for (const alert of alerts) {
      db.prepare(`
        INSERT INTO feature_drift_alerts (
          feature_name, alert_date, alert_type, severity,
          metric_value, threshold, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        featureName, checkDate, alert.type, alert.severity,
        alert.value, alert.threshold, alert.message
      );
    }

    return {
      featureName,
      checkDate,
      baseline: {
        mean: baseline.mean,
        std: baseline.std,
        missingRate: baseline.missingRate
      },
      current: currentStats,
      metrics: {
        psi,
        ks,
        meanShiftZ
      },
      alerts,
      drifted: psi > this.driftThreshold
    };
  }

  /**
   * Check outliers in current data
   *
   * @param {string} featureName - Feature to check
   * @param {string[]} symbols - Symbols to check
   * @param {string} date - Date to check
   * @returns {object} Outlier analysis
   */
  checkOutliers(featureName, symbols, date) {
    const baseline = this.baselineStats.get(featureName);
    if (!baseline) {
      return { error: 'No baseline found' };
    }

    const outliers = [];
    const lowerBound = baseline.mean - this.outlierStdThreshold * baseline.std;
    const upperBound = baseline.mean + this.outlierStdThreshold * baseline.std;

    for (const symbol of symbols) {
      const value = this.store.getFeature(symbol, featureName, date);
      if (value !== null && (value < lowerBound || value > upperBound)) {
        const zScore = (value - baseline.mean) / baseline.std;
        outliers.push({
          symbol,
          value,
          zScore,
          direction: value < lowerBound ? 'low' : 'high'
        });
      }
    }

    // Alert if too many outliers
    const outlierRate = outliers.length / symbols.length;
    if (outlierRate > 0.05) { // More than 5% outliers
      db.prepare(`
        INSERT INTO feature_drift_alerts (
          feature_name, alert_date, alert_type, severity,
          metric_value, threshold, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        featureName, date, 'outlier', outlierRate > 0.1 ? 'high' : 'medium',
        outlierRate, 0.05,
        `${outliers.length} outliers detected (${(outlierRate * 100).toFixed(1)}%)`
      );
    }

    return {
      featureName,
      date,
      bounds: { lower: lowerBound, upper: upperBound },
      outlierCount: outliers.length,
      outlierRate,
      outliers: outliers.slice(0, 10) // Top 10 outliers
    };
  }

  /**
   * Check data freshness
   *
   * @param {string} featureName - Feature to check
   * @returns {object} Freshness analysis
   */
  checkFreshness(featureName) {
    const feature = this.registry.get(featureName);
    if (!feature) {
      return { error: 'Feature not found' };
    }

    // Find most recent data
    let latestDate = null;

    if (feature.sourceTable) {
      const dateColumn = feature.sourceTable === 'daily_prices' ? 'date' :
        feature.sourceTable === 'calculated_metrics' ? 'calculation_date' : 'date';

      try {
        const result = db.prepare(`
          SELECT MAX(${dateColumn}) as latest_date
          FROM ${feature.sourceTable}
        `).get();
        latestDate = result?.latest_date;
      } catch (e) {
        // Table might not exist
      }
    }

    if (!latestDate) {
      return {
        featureName,
        stale: true,
        error: 'No data found'
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const latestDateObj = new Date(latestDate);
    const todayObj = new Date(today);
    const daysSinceUpdate = Math.floor((todayObj - latestDateObj) / (1000 * 60 * 60 * 24));

    const stale = daysSinceUpdate > this.stalenessThresholdDays;

    if (stale) {
      db.prepare(`
        INSERT INTO feature_drift_alerts (
          feature_name, alert_date, alert_type, severity,
          metric_value, threshold, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        featureName, today, 'stale',
        daysSinceUpdate > 30 ? 'critical' : daysSinceUpdate > 14 ? 'high' : 'medium',
        daysSinceUpdate, this.stalenessThresholdDays,
        `Data is ${daysSinceUpdate} days old`
      );
    }

    return {
      featureName,
      latestDate,
      daysSinceUpdate,
      stale,
      threshold: this.stalenessThresholdDays
    };
  }

  /**
   * Compute overall health score for a feature
   *
   * @param {string} featureName - Feature to score
   * @param {string[]} symbols - Symbols to include
   * @param {string} date - Date to check
   * @returns {object} Health scores
   */
  async computeHealthScore(featureName, symbols, date) {
    const driftResult = await this.checkDrift(featureName, symbols, date);
    const outlierResult = this.checkOutliers(featureName, symbols, date);
    const freshnessResult = this.checkFreshness(featureName);

    // Calculate component scores (0-100)
    let driftScore = 100;
    if (!driftResult.error) {
      const psi = driftResult.metrics?.psi || 0;
      driftScore = Math.max(0, 100 - (psi * 500)); // PSI of 0.2 = 0 score
    }

    let completenessScore = 100;
    if (!driftResult.error) {
      const missingRate = driftResult.current?.missingRate || 0;
      completenessScore = (1 - missingRate) * 100;
    }

    let freshnessScore = 100;
    if (!freshnessResult.error) {
      const days = freshnessResult.daysSinceUpdate || 0;
      freshnessScore = Math.max(0, 100 - (days * 5)); // 20 days = 0
    }

    let stabilityScore = 100;
    if (!outlierResult.error) {
      const outlierRate = outlierResult.outlierRate || 0;
      stabilityScore = Math.max(0, 100 - (outlierRate * 1000)); // 10% outliers = 0
    }

    // Overall health (weighted average)
    const healthScore = (
      driftScore * 0.35 +
      completenessScore * 0.30 +
      freshnessScore * 0.20 +
      stabilityScore * 0.15
    );

    // Store snapshot
    db.prepare(`
      INSERT INTO feature_health_snapshots (
        snapshot_date, feature_name, health_score,
        drift_score, completeness_score, freshness_score, stability_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, feature_name) DO UPDATE SET
        health_score = excluded.health_score,
        drift_score = excluded.drift_score,
        completeness_score = excluded.completeness_score,
        freshness_score = excluded.freshness_score,
        stability_score = excluded.stability_score,
        created_at = datetime('now')
    `).run(
      date, featureName, healthScore,
      driftScore, completenessScore, freshnessScore, stabilityScore
    );

    return {
      featureName,
      date,
      healthScore,
      components: {
        drift: driftScore,
        completeness: completenessScore,
        freshness: freshnessScore,
        stability: stabilityScore
      },
      status: healthScore >= 80 ? 'healthy' :
        healthScore >= 60 ? 'warning' :
          healthScore >= 40 ? 'degraded' : 'critical'
    };
  }

  /**
   * Run full health check on all ML features
   *
   * @param {string[]} symbols - Symbols to check
   * @param {string} date - Date to check
   * @returns {object} Full health report
   */
  async runFullHealthCheck(symbols, date) {
    const mlFeatures = this.registry.getMLFeatures();
    const results = [];
    const alerts = [];

    for (const feature of mlFeatures) {
      try {
        const health = await this.computeHealthScore(feature.name, symbols, date);
        results.push(health);

        if (health.status !== 'healthy') {
          alerts.push({
            feature: feature.name,
            status: health.status,
            score: health.healthScore
          });
        }
      } catch (err) {
        results.push({
          featureName: feature.name,
          error: err.message,
          status: 'unknown'
        });
      }
    }

    // Calculate overall system health
    const validResults = results.filter(r => r.healthScore !== undefined);
    const avgHealth = validResults.length > 0
      ? validResults.reduce((sum, r) => sum + r.healthScore, 0) / validResults.length
      : 0;

    return {
      date,
      overallHealth: avgHealth,
      overallStatus: avgHealth >= 80 ? 'healthy' :
        avgHealth >= 60 ? 'warning' :
          avgHealth >= 40 ? 'degraded' : 'critical',
      featuresChecked: results.length,
      healthyFeatures: results.filter(r => r.status === 'healthy').length,
      alerts,
      details: results
    };
  }

  /**
   * Get recent alerts
   *
   * @param {object} options - Filter options
   * @returns {Array} Recent alerts
   */
  getRecentAlerts(options = {}) {
    const {
      days = 7,
      severity = null,
      acknowledged = false,
      limit = 100
    } = options;

    let sql = `
      SELECT * FROM feature_drift_alerts
      WHERE created_at >= datetime('now', '-${days} days')
    `;

    if (!acknowledged) {
      sql += ' AND acknowledged = 0';
    }

    if (severity) {
      sql += ` AND severity = '${severity}'`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    return db.prepare(sql).all();
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId) {
    db.prepare(`
      UPDATE feature_drift_alerts SET acknowledged = 1 WHERE id = ?
    `).run(alertId);
  }

  /**
   * Get feature health history
   */
  getHealthHistory(featureName, days = 30) {
    return db.prepare(`
      SELECT * FROM feature_health_snapshots
      WHERE feature_name = ?
        AND snapshot_date >= date('now', '-${days} days')
      ORDER BY snapshot_date
    `).all(featureName);
  }

  // Utility functions

  _mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _std(arr) {
    const mean = this._mean(arr);
    const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  _percentile(sortedArr, p) {
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, idx)];
  }

  _computeHistogram(values, numBins, minVal = null, maxVal = null) {
    if (values.length === 0) return new Array(numBins).fill(0);

    const min = minVal ?? Math.min(...values);
    const max = maxVal ?? Math.max(...values);
    const binWidth = (max - min) / numBins || 1;

    const counts = new Array(numBins).fill(0);
    for (const v of values) {
      let bin = Math.floor((v - min) / binWidth);
      bin = Math.min(bin, numBins - 1);
      bin = Math.max(bin, 0);
      counts[bin]++;
    }

    // Normalize to proportions
    const total = values.length;
    return counts.map(c => c / total);
  }

  _calculatePSI(baseline, current) {
    // Population Stability Index
    if (!baseline || !current || baseline.length !== current.length) {
      return 0;
    }

    let psi = 0;
    for (let i = 0; i < baseline.length; i++) {
      const expected = Math.max(baseline[i], 0.0001);
      const actual = Math.max(current[i], 0.0001);
      psi += (actual - expected) * Math.log(actual / expected);
    }

    return psi;
  }

  _calculateKS(baseline, current) {
    // Simplified KS statistic using summary stats
    // Full KS would need empirical CDFs
    const meanDiff = Math.abs(current.mean - baseline.mean);
    const pooledStd = Math.sqrt((baseline.std ** 2 + current.std ** 2) / 2);
    return pooledStd > 0 ? meanDiff / pooledStd : 0;
  }
}

// Singleton instance
let monitorInstance = null;

function getMonitor(options) {
  if (!monitorInstance) {
    monitorInstance = new FeatureMonitor(options);
  }
  return monitorInstance;
}

module.exports = {
  FeatureMonitor,
  getMonitor
};
