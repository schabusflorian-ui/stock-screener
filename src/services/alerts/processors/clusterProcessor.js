// src/services/alerts/processors/clusterProcessor.js
// Smart clustering to reduce noise while preserving important signals

const { getDatabaseAsync } = require('../../../database');

class ClusterProcessor {
  constructor(options = {}) {
    this.options = {
      // Cluster low-priority (P1-P3) alerts more aggressively
      lowPriorityClusterThreshold: 2,
      // Standard clustering threshold
      standardClusterThreshold: 3,
      // High-priority alerts (P4+) should stand alone unless many
      highPriorityClusterThreshold: 4,
      // Daily digest threshold - group if too many alerts for one company
      dailyDigestThreshold: 5,
      ...options
    };
  }

  async process(alerts) {
    const clusters = [];
    const processedAlerts = [...alerts];

    // Group by company
    const byCompany = this.groupBy(alerts, 'company_id');

    for (const [companyId, companyAlerts] of Object.entries(byCompany)) {
      // Smart clustering based on alert priorities
      const cluster = await this.createSmartCluster(parseInt(companyId), companyAlerts);
      if (cluster) {
        clusters.push(cluster);

        // Mark clustered alerts
        const clusteredAlerts = cluster._clusteredAlerts || companyAlerts;
        clusteredAlerts.forEach((alert, idx) => {
          alert._clusterId = cluster._tempId;
          alert.is_cluster_primary = idx === 0 ? true : false;
        });
      }
    }

    // Group screener alerts
    const screenerAlerts = alerts.filter(a => a.alert_code === 'entered_screener');
    if (screenerAlerts.length > 0) {
      const byScreener = this.groupBy(screenerAlerts, a => a.data?.screenerName);

      for (const [screenerName, screenAlerts] of Object.entries(byScreener)) {
        if (screenAlerts.length >= 3 && screenerName) {
          const cluster = await this.createScreenerCluster(screenerName, screenAlerts);
          if (cluster) {
            clusters.push(cluster);
            screenAlerts.forEach((alert, idx) => {
              alert._clusterId = cluster._tempId;
              alert.is_cluster_primary = idx === 0 ? true : false;
            });
          }
        }
      }
    }

    return { alerts: processedAlerts, clusters };
  }

  /**
   * Smart clustering that treats high-priority and low-priority alerts differently
   */
  async createSmartCluster(companyId, alerts) {
    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT symbol, name FROM companies WHERE id = $1`,
      [companyId]
    );

    const company = result.rows[0];
    if (!company) return null;

    // Separate alerts by priority
    const highPriority = alerts.filter(a => a.priority >= 4);
    const lowPriority = alerts.filter(a => a.priority < 4);

    // Signal type categorization
    const buySignals = alerts.filter(a =>
      ['strong_bullish', 'bullish', 'strong_buy', 'buy'].includes(a.signal_type)
    );
    const warnings = alerts.filter(a => a.signal_type === 'warning');

    // Strategy 1: If we have exactly 1 high-priority alert with few low-priority,
    // let the high-priority stand alone (don't cluster)
    if (highPriority.length === 1 && lowPriority.length < 3) {
      // Only cluster the low-priority alerts if there are 2+
      if (lowPriority.length >= this.options.lowPriorityClusterThreshold) {
        return this.createInfoCluster(companyId, company, lowPriority);
      }
      return null;
    }

    // Strategy 2: Multiple buy signals - create buy cluster
    if (buySignals.length >= 2) {
      return {
        _tempId: `company_buy_${companyId}_${Date.now()}`,
        _clusteredAlerts: buySignals,
        company_id: companyId,
        cluster_type: 'multi_buy_signal',
        title: `${buySignals.length} bullish signals for ${company.symbol}`,
        description: buySignals.map(a => a.alert_code).join(', '),
        alert_count: buySignals.length,
        signal_type: buySignals.some(a =>
          ['strong_bullish', 'strong_buy'].includes(a.signal_type)
        ) ? 'strong_bullish' : 'bullish',
        priority: 5
      };
    }

    // Strategy 3: Multiple warnings - create red flag cluster
    if (warnings.length >= 3) {
      return {
        _tempId: `company_warning_${companyId}_${Date.now()}`,
        _clusteredAlerts: warnings,
        company_id: companyId,
        cluster_type: 'red_flag_cluster',
        title: `${warnings.length} warnings for ${company.symbol}`,
        description: warnings.map(a => a.alert_code).join(', '),
        alert_count: warnings.length,
        signal_type: 'warning',
        priority: 5
      };
    }

    // Strategy 4: Too many alerts (5+) - create digest cluster
    if (alerts.length >= this.options.dailyDigestThreshold) {
      return this.createDigestCluster(companyId, company, alerts);
    }

    // Strategy 5: Cluster low-priority alerts aggressively (2+)
    if (lowPriority.length >= this.options.lowPriorityClusterThreshold && highPriority.length === 0) {
      return this.createInfoCluster(companyId, company, lowPriority);
    }

    // Strategy 6: Standard clustering for 4+ mixed alerts
    if (alerts.length >= this.options.highPriorityClusterThreshold) {
      return {
        _tempId: `company_multi_${companyId}_${Date.now()}`,
        _clusteredAlerts: alerts,
        company_id: companyId,
        cluster_type: 'multi_signal',
        title: `${alerts.length} signals for ${company.symbol}`,
        description: alerts.slice(0, 3).map(a => a.alert_code).join(', ') + (alerts.length > 3 ? '...' : ''),
        alert_count: alerts.length,
        signal_type: this.getDominantSignalType(alerts),
        priority: Math.max(...alerts.map(a => a.priority))
      };
    }

    return null;
  }

  /**
   * Create a cluster for low-priority informational alerts
   */
  createInfoCluster(companyId, company, alerts) {
    return {
      _tempId: `company_info_${companyId}_${Date.now()}`,
      _clusteredAlerts: alerts,
      company_id: companyId,
      cluster_type: 'info_bundle',
      title: `${alerts.length} updates for ${company.symbol}`,
      description: alerts.map(a => a.alert_code).join(', '),
      alert_count: alerts.length,
      signal_type: 'watch',
      priority: 2  // Low priority for info bundles
    };
  }

  /**
   * Create a digest cluster for too many alerts
   */
  createDigestCluster(companyId, company, alerts) {
    const highPriority = alerts.filter(a => a.priority >= 4);
    const highlight = highPriority.length > 0
      ? ` (${highPriority.length} important)`
      : '';

    return {
      _tempId: `company_digest_${companyId}_${Date.now()}`,
      _clusteredAlerts: alerts,
      company_id: companyId,
      cluster_type: 'daily_digest',
      title: `${alerts.length} signals for ${company.symbol}${highlight}`,
      description: `Digest: ${alerts.slice(0, 4).map(a => a.alert_code).join(', ')}${alerts.length > 4 ? '...' : ''}`,
      alert_count: alerts.length,
      signal_type: this.getDominantSignalType(alerts),
      priority: Math.max(...alerts.map(a => a.priority))
    };
  }

  /**
   * Legacy method - now delegates to createSmartCluster
   * Kept for backwards compatibility
   */
  async createCompanyCluster(companyId, alerts) {
    return await this.createSmartCluster(companyId, alerts);
  }

  async createScreenerCluster(screenerName, alerts) {
    const database = await getDatabaseAsync();
    const symbols = [];
    for (const a of alerts) {
      const result = await database.query('SELECT symbol FROM companies WHERE id = $1', [a.company_id]);
      const company = result.rows[0];
      if (company?.symbol) {
        symbols.push(company.symbol);
      }
    }

    return {
      _tempId: `screener_${screenerName}_${Date.now()}`,
      company_id: null,
      cluster_type: 'screener_batch',
      title: `${alerts.length} companies entered "${screenerName}"`,
      description: symbols.slice(0, 5).join(', ') + (symbols.length > 5 ? '...' : ''),
      alert_count: alerts.length,
      signal_type: 'buy',
      priority: 4
    };
  }

  getDominantSignalType(alerts) {
    const counts = {};
    for (const alert of alerts) {
      // Normalize signal types
      let signalType = alert.signal_type;
      // Map legacy types to new types
      if (signalType === 'strong_buy') signalType = 'strong_bullish';
      if (signalType === 'buy') signalType = 'bullish';

      counts[signalType] = (counts[signalType] || 0) + 1;
    }

    // Priority order (both old and new naming conventions)
    const priority = [
      'strong_bullish', 'strong_buy',
      'bullish', 'buy',
      'warning',
      'watch',
      'info'
    ];

    for (const type of priority) {
      if (counts[type] >= 2) return type;
    }

    // Return the most common signal type
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : 'watch';
  }

  groupBy(array, keyFn) {
    const key = typeof keyFn === 'string' ? (item) => item[keyFn] : keyFn;
    return array.reduce((groups, item) => {
      const k = key(item);
      if (k !== null && k !== undefined) {
        if (!groups[k]) groups[k] = [];
        groups[k].push(item);
      }
      return groups;
    }, {});
  }
}

module.exports = ClusterProcessor;
