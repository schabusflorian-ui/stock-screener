// src/services/alerts/processors/clusterProcessor.js
// Bundles related alerts to reduce noise

class ClusterProcessor {
  constructor(db) {
    this.db = db;
  }

  process(alerts) {
    const clusters = [];
    const processedAlerts = [...alerts];

    // Group by company
    const byCompany = this.groupBy(alerts, 'company_id');

    for (const [companyId, companyAlerts] of Object.entries(byCompany)) {
      if (companyAlerts.length >= 3) {
        // Create cluster for this company
        const cluster = this.createCompanyCluster(parseInt(companyId), companyAlerts);
        if (cluster) {
          clusters.push(cluster);

          // Mark alerts as part of cluster (will be updated after cluster is saved)
          companyAlerts.forEach((alert, idx) => {
            alert._clusterId = cluster._tempId;
            alert.is_cluster_primary = idx === 0 ? 1 : 0;
          });
        }
      }
    }

    // Group screener alerts
    const screenerAlerts = alerts.filter(a => a.alert_code === 'entered_screener');
    if (screenerAlerts.length > 0) {
      const byScreener = this.groupBy(screenerAlerts, a => a.data?.screenerName);

      for (const [screenerName, screenAlerts] of Object.entries(byScreener)) {
        if (screenAlerts.length >= 3 && screenerName) {
          const cluster = this.createScreenerCluster(screenerName, screenAlerts);
          if (cluster) {
            clusters.push(cluster);
            screenAlerts.forEach((alert, idx) => {
              alert._clusterId = cluster._tempId;
              alert.is_cluster_primary = idx === 0 ? 1 : 0;
            });
          }
        }
      }
    }

    return { alerts: processedAlerts, clusters };
  }

  createCompanyCluster(companyId, alerts) {
    const buySignals = alerts.filter(a =>
      ['strong_buy', 'buy'].includes(a.signal_type)
    );
    const warnings = alerts.filter(a => a.signal_type === 'warning');

    const company = this.db.prepare(`
      SELECT symbol, name FROM companies WHERE id = ?
    `).get(companyId);

    if (!company) return null;

    if (buySignals.length >= 2) {
      return {
        _tempId: `company_buy_${companyId}_${Date.now()}`,
        company_id: companyId,
        cluster_type: 'multi_buy_signal',
        title: `${buySignals.length} buy signals for ${company.symbol}`,
        description: buySignals.map(a => a.alert_code).join(', '),
        alert_count: buySignals.length,
        signal_type: buySignals.some(a => a.signal_type === 'strong_buy') ? 'strong_buy' : 'buy',
        priority: 5
      };
    }

    if (warnings.length >= 3) {
      return {
        _tempId: `company_warning_${companyId}_${Date.now()}`,
        company_id: companyId,
        cluster_type: 'red_flag_cluster',
        title: `${warnings.length} warnings for ${company.symbol}`,
        description: warnings.map(a => a.alert_code).join(', '),
        alert_count: warnings.length,
        signal_type: 'warning',
        priority: 5
      };
    }

    // General cluster for multiple signals
    if (alerts.length >= 4) {
      return {
        _tempId: `company_multi_${companyId}_${Date.now()}`,
        company_id: companyId,
        cluster_type: 'multi_signal',
        title: `${alerts.length} signals for ${company.symbol}`,
        description: alerts.slice(0, 3).map(a => a.alert_code).join(', ') + (alerts.length > 3 ? '...' : ''),
        alert_count: alerts.length,
        signal_type: this.getDominantSignalType(alerts),
        priority: 4
      };
    }

    return null;
  }

  createScreenerCluster(screenerName, alerts) {
    const symbols = alerts.map(a => {
      const company = this.db.prepare('SELECT symbol FROM companies WHERE id = ?').get(a.company_id);
      return company?.symbol;
    }).filter(Boolean);

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
      counts[alert.signal_type] = (counts[alert.signal_type] || 0) + 1;
    }

    // Priority order
    const priority = ['strong_buy', 'buy', 'warning', 'watch', 'info'];
    for (const type of priority) {
      if (counts[type] >= 2) return type;
    }

    return 'watch';
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
