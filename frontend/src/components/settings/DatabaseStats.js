// frontend/src/components/settings/DatabaseStats.js
import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { Database, RefreshCw, HardDrive, Table, FileText } from 'lucide-react';
import './SettingsComponents.css';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function DatabaseStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await settingsAPI.getDatabaseStats();
      setStats(response.data.data || response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load database statistics');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) return <div className="settings-loading">Loading database stats...</div>;
  if (error) return <div className="settings-error">{error}</div>;

  return (
    <div className="database-stats">
      <div className="section-header">
        <h2>Database Statistics</h2>
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-icon">
            <HardDrive size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.size || 'N/A'}</span>
            <span className="stat-label">Database Size</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Table size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.tableCount || 0}</span>
            <span className="stat-label">Tables</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <FileText size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{(stats?.totalRows || 0).toLocaleString()}</span>
            <span className="stat-label">Total Rows</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Database size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats?.indexCount || 0}</span>
            <span className="stat-label">Indexes</span>
          </div>
        </div>
      </div>

      <div className="tables-section">
        <h3>Table Details</h3>
        <div className="tables-list">
          <div className="table-header-row">
            <span className="table-name-col">Table Name</span>
            <span className="table-rows-col">Rows</span>
            <span className="table-size-col">Size</span>
          </div>
          {(stats?.tables || []).map((table, index) => (
            <div key={index} className="table-row">
              <span className="table-name-col">{table.name}</span>
              <span className="table-rows-col">{(table.rowCount || 0).toLocaleString()}</span>
              <span className="table-size-col">{table.size || 'N/A'}</span>
            </div>
          ))}
        </div>
      </div>

      {stats?.recentActivity && (
        <div className="activity-section">
          <h3>Recent Activity</h3>
          <div className="activity-list">
            {stats.recentActivity.map((activity, index) => (
              <div key={index} className="activity-item">
                <span className="activity-type">{activity.type}</span>
                <span className="activity-table">{activity.table}</span>
                <span className="activity-time">
                  {new Date(activity.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseStats;
