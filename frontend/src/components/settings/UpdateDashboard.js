// frontend/src/components/settings/UpdateDashboard.js
import { useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../../services/api';
import { Play, Pause, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import './SettingsComponents.css';

function UpdateDashboard() {
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [schedulesRes, historyRes] = await Promise.all([
        settingsAPI.getUpdateSchedules(),
        settingsAPI.getUpdateHistory(null, 20)
      ]);
      setSchedules(schedulesRes.data.schedules || []);
      setHistory(historyRes.data.history || []);
      setError(null);
    } catch (err) {
      setError('Failed to load update schedules');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggle = async (name, currentEnabled) => {
    try {
      await settingsAPI.toggleSchedule(name, !currentEnabled);
      fetchData();
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'idle': return <CheckCircle className="status-icon success" size={16} />;
      case 'running': return <Clock className="status-icon running" size={16} />;
      case 'failed': return <XCircle className="status-icon error" size={16} />;
      default: return <AlertCircle className="status-icon warning" size={16} />;
    }
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    if (diffHours < 24) return diffHours + 'h ago';
    return diffDays + 'd ago';
  };

  if (loading) return <div className="settings-loading">Loading update schedules...</div>;
  if (error) return <div className="settings-error">{error}</div>;

  return (
    <div className="update-dashboard">
      <div className="section-header">
        <h2>Update Schedules</h2>
        <p>Manage automated data updates</p>
      </div>

      <div className="schedules-grid">
        {schedules.map(schedule => (
          <div key={schedule.name} className={'schedule-card ' + schedule.status}>
            <div className="schedule-header">
              <div className="schedule-name">
                {getStatusIcon(schedule.status)}
                <span>{schedule.displayName}</span>
              </div>
              <button
                className={'toggle-btn ' + (schedule.isEnabled ? 'enabled' : 'disabled')}
                onClick={() => handleToggle(schedule.name, schedule.isEnabled)}
                title={schedule.isEnabled ? 'Disable' : 'Enable'}
              >
                {schedule.isEnabled ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
            <p className="schedule-description">{schedule.description}</p>
            <div className="schedule-meta">
              <span className="schedule-frequency">{schedule.frequency}</span>
              <span className="schedule-last-run">
                Last: {formatTimeAgo(schedule.lastRunAt)}
              </span>
            </div>
            {schedule.lastError && (
              <div className="schedule-error">{schedule.lastError}</div>
            )}
            <div className="schedule-stats">
              <span>Processed: {(schedule.itemsProcessed || 0).toLocaleString()}</span>
              <span>Updated: {(schedule.itemsUpdated || 0).toLocaleString()}</span>
              <span>Failed: {schedule.itemsFailed || 0}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-header mt-lg">
        <h3>Recent Update History</h3>
      </div>

      <div className="history-table">
        <table>
          <thead>
            <tr>
              <th>Schedule</th>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 10).map(entry => (
              <tr key={entry.id}>
                <td>{entry.scheduleName}</td>
                <td>{formatTimeAgo(entry.startedAt)}</td>
                <td>
                  <span className={'status-badge ' + entry.status}>
                    {entry.status}
                  </span>
                </td>
                <td>{entry.durationSeconds ? entry.durationSeconds + 's' : '-'}</td>
                <td>{entry.itemsUpdated}/{entry.itemsProcessed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UpdateDashboard;
