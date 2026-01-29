// frontend/src/components/settings/ModelDriftPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Bell,
  BellOff,
  TrendingDown,
  Target,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  PlayCircle
} from '../icons';
import { driftAPI } from '../../services/api';
import './ModelDriftPanel.css';

/**
 * Status badge component for model health status
 */
const StatusBadge = ({ status }) => {
  const config = {
    ok: { icon: CheckCircle, className: 'drift-status--ok', label: 'Healthy' },
    warning: { icon: AlertTriangle, className: 'drift-status--warning', label: 'Warning' },
    critical: { icon: XCircle, className: 'drift-status--critical', label: 'Critical' },
    no_data: { icon: Clock, className: 'drift-status--nodata', label: 'No Data' },
    insufficient_data: { icon: Clock, className: 'drift-status--nodata', label: 'Insufficient Data' }
  };

  const { icon: Icon, className, label } = config[status] || config.no_data;

  return (
    <span className={`drift-status-badge ${className}`}>
      <Icon size={14} />
      {label}
    </span>
  );
};

/**
 * Alert severity badge
 */
const SeverityBadge = ({ severity }) => {
  const config = {
    critical: { className: 'drift-severity--critical', label: 'CRITICAL' },
    warning: { className: 'drift-severity--warning', label: 'WARNING' },
    info: { className: 'drift-severity--info', label: 'INFO' }
  };

  const { className, label } = config[severity] || config.warning;

  return (
    <span className={`drift-severity-badge ${className}`}>
      {label}
    </span>
  );
};

/**
 * Model health card component
 */
const ModelHealthCard = ({ modelName, status, onRunCheck }) => {
  const [expanded, setExpanded] = useState(false);

  if (!status) {
    return (
      <div className="drift-model-card drift-model-card--empty">
        <div className="drift-model-card__header">
          <span className="drift-model-card__name">{modelName}</span>
          <StatusBadge status="no_data" />
        </div>
        <p className="drift-model-card__empty-text">No health data available</p>
      </div>
    );
  }

  return (
    <div className={`drift-model-card drift-model-card--${status.status}`}>
      <div className="drift-model-card__header">
        <span className="drift-model-card__name">{modelName}</span>
        <StatusBadge status={status.status} />
      </div>

      <div className="drift-model-card__metrics">
        <div className="drift-metric">
          <span className="drift-metric__label">IC</span>
          <span className="drift-metric__value">
            {status.ic !== null ? status.ic.toFixed(4) : 'N/A'}
          </span>
        </div>
        <div className="drift-metric">
          <span className="drift-metric__label">Direction</span>
          <span className="drift-metric__value">
            {status.directionAccuracy !== null
              ? `${(status.directionAccuracy * 100).toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
        <div className="drift-metric">
          <span className="drift-metric__label">Calibration</span>
          <span className="drift-metric__value">
            {status.calibration !== null
              ? `${(status.calibration * 100).toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
      </div>

      <div className="drift-model-card__footer">
        <span className="drift-model-card__last-check">
          <Clock size={12} />
          {status.lastCheck
            ? new Date(status.lastCheck).toLocaleString()
            : 'Never checked'}
        </span>
        {status.alertsCount > 0 && (
          <span className="drift-model-card__alerts-count">
            <Bell size={12} />
            {status.alertsCount} alert{status.alertsCount !== 1 ? 's' : ''}
          </span>
        )}
        <button
          className="drift-model-card__expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="drift-model-card__details">
          <button
            className="drift-run-check-btn"
            onClick={() => onRunCheck(modelName)}
          >
            <PlayCircle size={14} />
            Run Health Check
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Alert item component
 */
const AlertItem = ({ alert, onAcknowledge }) => {
  return (
    <div className={`drift-alert-item drift-alert-item--${alert.severity}`}>
      <div className="drift-alert-item__header">
        <SeverityBadge severity={alert.severity} />
        <span className="drift-alert-item__type">
          {alert.alert_type.replace(/_/g, ' ')}
        </span>
        <span className="drift-alert-item__model">{alert.model_name}</span>
      </div>
      <p className="drift-alert-item__message">{alert.message}</p>
      <div className="drift-alert-item__footer">
        <span className="drift-alert-item__time">
          {new Date(alert.created_at).toLocaleString()}
        </span>
        <span className="drift-alert-item__action">Action: {alert.action}</span>
        {!alert.acknowledged && (
          <button
            className="drift-alert-item__ack-btn"
            onClick={() => onAcknowledge(alert.id)}
          >
            <BellOff size={12} />
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Threshold display component
 */
const ThresholdCard = ({ thresholds }) => {
  if (!thresholds) return null;

  const items = [
    { key: 'icDegradation', label: 'IC Degradation', format: v => `< ${(v * 100).toFixed(0)}% of training` },
    { key: 'directionAccuracyMin', label: 'Direction Accuracy', format: v => `> ${(v * 100).toFixed(0)}%` },
    { key: 'calibrationDrift', label: 'Calibration Drift', format: v => `< ${(v * 100).toFixed(0)}%` },
    { key: 'psi', label: 'PSI (Feature Drift)', format: v => `< ${v.toFixed(2)}` },
    { key: 'klDivergence', label: 'KL Divergence', format: v => `< ${v.toFixed(2)} nats` },
    { key: 'stalePredictionHours', label: 'Stale Predictions', format: v => `< ${v}h` }
  ];

  return (
    <div className="drift-thresholds-card">
      <h4>
        <Target size={16} />
        Alert Thresholds
      </h4>
      <div className="drift-thresholds-grid">
        {items.map(({ key, label, format }) => (
          <div key={key} className="drift-threshold-item">
            <span className="drift-threshold-label">{label}</span>
            <span className="drift-threshold-value">{format(thresholds[key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Model Drift Panel - Main component for drift monitoring
 */
function ModelDriftPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [dashRes, alertsRes] = await Promise.all([
        driftAPI.getDashboard(),
        driftAPI.getActiveAlerts()
      ]);

      if (dashRes.data?.success) {
        setDashboard(dashRes.data.data);
      }

      if (alertsRes.data?.success) {
        setAlerts(alertsRes.data.data || []);
      }
    } catch (err) {
      console.error('Drift dashboard error:', err);
      setError(err.message || 'Failed to load drift monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Run health check for a model
  const runHealthCheck = async (modelName) => {
    try {
      await driftAPI.runHealthCheck(modelName);
      fetchDashboard(); // Refresh after check
    } catch (err) {
      console.error('Health check error:', err);
    }
  };

  // Run all health checks
  const runAllHealthChecks = async () => {
    setLoading(true);
    try {
      await driftAPI.runAllHealthChecks();
      await fetchDashboard();
    } catch (err) {
      console.error('Run all health checks error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Acknowledge an alert
  const acknowledgeAlert = async (alertId) => {
    try {
      await driftAPI.acknowledgeAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  // Load on mount
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Render loading state
  if (loading && !dashboard) {
    return (
      <div className="drift-panel">
        <div className="drift-loading">
          <RefreshCw className="drift-loading__spinner" size={24} />
          <span>Loading drift monitoring data...</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !dashboard) {
    return (
      <div className="drift-panel">
        <div className="drift-error">
          <AlertTriangle size={24} />
          <span>{error}</span>
          <button onClick={fetchDashboard} className="drift-retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const modelStatuses = dashboard?.modelStatuses || {};
  const modelNames = Object.keys(modelStatuses);
  const hasModels = modelNames.length > 0;

  return (
    <div className="drift-panel">
      {/* Header */}
      <div className="drift-panel__header">
        <div className="drift-panel__title">
          <Activity size={24} />
          <h2>Model Drift Monitoring</h2>
        </div>
        <div className="drift-panel__actions">
          <button
            onClick={runAllHealthChecks}
            disabled={loading}
            className="drift-run-btn"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? 'Running...' : 'Run All Checks'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="drift-summary-row">
        <div className="drift-summary-card">
          <div className="drift-summary-card__icon">
            <Activity size={20} />
          </div>
          <div className="drift-summary-card__content">
            <span className="drift-summary-card__value">
              {dashboard?.totalModelsMonitored || 0}
            </span>
            <span className="drift-summary-card__label">Models Monitored</span>
          </div>
        </div>

        <div className={`drift-summary-card ${dashboard?.criticalAlerts > 0 ? 'drift-summary-card--critical' : ''}`}>
          <div className="drift-summary-card__icon">
            <XCircle size={20} />
          </div>
          <div className="drift-summary-card__content">
            <span className="drift-summary-card__value">
              {dashboard?.criticalAlerts || 0}
            </span>
            <span className="drift-summary-card__label">Critical Alerts</span>
          </div>
        </div>

        <div className={`drift-summary-card ${dashboard?.warningAlerts > 0 ? 'drift-summary-card--warning' : ''}`}>
          <div className="drift-summary-card__icon">
            <AlertTriangle size={20} />
          </div>
          <div className="drift-summary-card__content">
            <span className="drift-summary-card__value">
              {dashboard?.warningAlerts || 0}
            </span>
            <span className="drift-summary-card__label">Warnings</span>
          </div>
        </div>

        <div className="drift-summary-card">
          <div className="drift-summary-card__icon">
            <TrendingDown size={20} />
          </div>
          <div className="drift-summary-card__content">
            <span className="drift-summary-card__value">
              {dashboard?.modelsInMemory || 0}
            </span>
            <span className="drift-summary-card__label">Active Tracking</span>
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="drift-alerts-section">
          <h3 className="drift-section-title">
            <Bell size={18} />
            Active Alerts ({alerts.length})
          </h3>
          <div className="drift-alerts-list">
            {(showAllAlerts ? alerts : alerts.slice(0, 5)).map(alert => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onAcknowledge={acknowledgeAlert}
              />
            ))}
          </div>
          {alerts.length > 5 && (
            <button
              className="drift-show-more-btn"
              onClick={() => setShowAllAlerts(!showAllAlerts)}
            >
              {showAllAlerts ? 'Show Less' : `Show All (${alerts.length})`}
            </button>
          )}
        </div>
      )}

      {/* Model Health Grid */}
      {hasModels ? (
        <div className="drift-models-section">
          <h3 className="drift-section-title">
            <CheckCircle size={18} />
            Model Health Status
          </h3>
          <div className="drift-models-grid">
            {modelNames.map(name => (
              <ModelHealthCard
                key={name}
                modelName={name}
                status={modelStatuses[name]}
                onRunCheck={runHealthCheck}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="drift-empty-state">
          <Info size={32} />
          <h3>No Models Being Monitored</h3>
          <p>
            Initialize reference distributions for your models to start monitoring for drift.
            Use the API or train new models to set up baselines.
          </p>
        </div>
      )}

      {/* Thresholds Reference */}
      <ThresholdCard thresholds={dashboard?.thresholds} />

      {/* Info Footer */}
      <div className="drift-info-footer">
        <Info size={14} />
        <span>
          Model drift monitoring detects when ML model performance degrades.
          Critical alerts indicate models may need retraining.
        </span>
      </div>
    </div>
  );
}

export default ModelDriftPanel;
