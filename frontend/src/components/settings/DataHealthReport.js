// frontend/src/components/settings/DataHealthReport.js
import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import './SettingsComponents.css';

function DataHealthReport() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchHealth = async () => {
    try {
      const response = await settingsAPI.getDataHealth();
      // API returns { success: true, data: { generatedAt, overall, metrics } }
      setHealth(response.data?.data || response.data);
      setError(null);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load health report';
      setError(errorMsg);
      console.error('Health report error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealth();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok':
      case 'healthy':
        return <CheckCircle className="health-icon healthy" size={20} />;
      case 'warning':
        return <AlertTriangle className="health-icon warning" size={20} />;
      case 'critical':
      case 'error':
        return <XCircle className="health-icon critical" size={20} />;
      default:
        return <AlertTriangle className="health-icon warning" size={20} />;
    }
  };

  const getOverallStatus = (overall) => {
    const statusMap = {
      healthy: { label: 'All Systems Healthy', class: 'healthy' },
      warning: { label: 'Some Issues Detected', class: 'warning' },
      critical: { label: 'Critical Issues', class: 'critical' }
    };
    return statusMap[overall] || statusMap.warning;
  };

  if (loading) return <div className="settings-loading">Loading health report...</div>;
  if (error) return <div className="settings-error">{error}</div>;

  const overallStatus = getOverallStatus(health?.overall);

  return (
    <div className="data-health-report">
      <div className="section-header">
        <h2>Data Health</h2>
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className={'health-banner ' + overallStatus.class}>
        {getStatusIcon(health?.overall)}
        <span>{overallStatus.label}</span>
        <span className="health-time">
          Last checked: {health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : 'Unknown'}
        </span>
      </div>

      <div className="health-metrics">
        {(health?.metrics || []).map((metric, index) => (
          <div key={index} className={'health-metric-card ' + metric.status}>
            <div className="metric-header">
              {getStatusIcon(metric.status)}
              <h4>{metric.name}</h4>
            </div>
            <div className="metric-value">{metric.value}</div>
            <p className="metric-message">{metric.message}</p>
            {metric.threshold && (
              <div className="metric-threshold">
                Threshold: {metric.threshold}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DataHealthReport;
