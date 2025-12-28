// frontend/src/components/settings/SupportPanel.js
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { settingsAPI } from '../../services/api';

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '< 1m';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

function SupportPanel() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [diagResponse, healthResponse] = await Promise.all([
        settingsAPI.getDiagnostics(),
        settingsAPI.getHealth()
      ]);
      setDiagnostics(diagResponse.data.data);
      setHealth(healthResponse.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to load diagnostics');
      console.error('Error fetching diagnostics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportDiagnostics = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      diagnostics,
      health
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCheckIcon = (status) => {
    switch (status) {
      case 'pass':
        return <CheckCircle size={16} color="var(--green)" />;
      case 'fail':
        return <XCircle size={16} color="var(--red)" />;
      default:
        return <AlertTriangle size={16} color="var(--yellow)" />;
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading diagnostics...</div>;
  }

  if (error) {
    return (
      <div className="settings-card">
        <p style={{ color: 'var(--red)' }}>{error}</p>
        <button className="settings-btn" onClick={fetchData}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* System Status */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">System Status</h2>
            <p className="settings-card-description">
              Quick health check of all system components
            </p>
          </div>
          <button className="settings-btn small" onClick={fetchData}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div>
          {health.checks.map((check, index) => (
            <div key={index} className="settings-item">
              <div className="settings-item-info">
                {getCheckIcon(check.status)}
                <div className="settings-item-content">
                  <div className="settings-item-title">{check.name}</div>
                  <div className="settings-item-description">{check.message}</div>
                </div>
              </div>
              <span className={`status-badge ${check.status === 'pass' ? 'ok' : 'error'}`}>
                {check.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System Information */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-card-title">System Information</h2>
        </div>

        <div className="diagnostics-section">
          <div className="diagnostics-grid">
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Version</div>
              <div className="diagnostics-item-value">{diagnostics.version}</div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Environment</div>
              <div className="diagnostics-item-value">{diagnostics.environment}</div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Node.js</div>
              <div className="diagnostics-item-value">{diagnostics.nodeVersion}</div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Uptime</div>
              <div className="diagnostics-item-value">{formatUptime(diagnostics.uptime)}</div>
            </div>
          </div>
        </div>

        <div className="diagnostics-section">
          <h4>Memory Usage</h4>
          <div className="diagnostics-grid">
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Heap Used</div>
              <div className="diagnostics-item-value">
                {formatBytes(diagnostics.memoryUsage?.heapUsed || 0)}
              </div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Heap Total</div>
              <div className="diagnostics-item-value">
                {formatBytes(diagnostics.memoryUsage?.heapTotal || 0)}
              </div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">RSS</div>
              <div className="diagnostics-item-value">
                {formatBytes(diagnostics.memoryUsage?.rss || 0)}
              </div>
            </div>
          </div>
        </div>

        <div className="diagnostics-section">
          <h4>Database</h4>
          <div className="diagnostics-grid">
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Status</div>
              <div className="diagnostics-item-value">
                {diagnostics.database.connected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Size</div>
              <div className="diagnostics-item-value">{diagnostics.database.size}</div>
            </div>
            <div className="diagnostics-item">
              <div className="diagnostics-item-label">Tables</div>
              <div className="diagnostics-item-value">{diagnostics.database.tableCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Errors */}
      {diagnostics.recentErrors && diagnostics.recentErrors.length > 0 && (
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Recent Errors</h2>
          </div>

          <div className="logs-list">
            {diagnostics.recentErrors.map((error, index) => (
              <div key={index} className="log-entry">
                <span className={`log-level ${error.level}`}>{error.level}</span>
                <span className="log-message">{error.message}</span>
                <span className="log-time">{formatTimeAgo(error.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">Export Diagnostics</h2>
            <p className="settings-card-description">
              Download system diagnostics for troubleshooting
            </p>
          </div>
        </div>

        <button className="settings-btn" onClick={handleExportDiagnostics}>
          <Download size={14} /> Export as JSON
        </button>
      </div>
    </div>
  );
}

export default SupportPanel;
