// frontend/src/components/settings/IntegrationsPanel.js
import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { CheckCircle, XCircle, AlertTriangle, Eye, EyeOff, Zap } from '../icons';
import './SettingsComponents.css';

function IntegrationsPanel() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [showKey, setShowKey] = useState({});
  const [testing, setTesting] = useState({});

  const fetchIntegrations = async () => {
    try {
      const response = await settingsAPI.getIntegrations();
      // API returns { success: true, data: [...] }
      const data = response.data?.data || response.data?.integrations || response.data || [];
      setIntegrations(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to load integrations';
      setError(errorMsg);
      console.error('Integrations error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleSaveKey = async (name) => {
    try {
      await settingsAPI.updateApiKey(name, newKey);
      setEditingKey(null);
      setNewKey('');
      fetchIntegrations();
    } catch (err) {
      console.error('Failed to save API key:', err);
    }
  };

  const handleTest = async (name) => {
    setTesting(prev => ({ ...prev, [name]: true }));
    try {
      await settingsAPI.testConnection(name);
      fetchIntegrations();
    } catch (err) {
      console.error('Connection test failed:', err);
    } finally {
      setTesting(prev => ({ ...prev, [name]: false }));
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircle className="status-icon success" size={16} />;
      case 'error': return <XCircle className="status-icon error" size={16} />;
      case 'rate_limited': return <AlertTriangle className="status-icon warning" size={16} />;
      default: return <AlertTriangle className="status-icon muted" size={16} />;
    }
  };

  const formatUsage = (calls, limit) => {
    if (!limit) return calls?.toLocaleString() || '0';
    const pct = (calls / limit * 100).toFixed(0);
    return calls?.toLocaleString() + ' / ' + limit.toLocaleString() + ' (' + pct + '%)';
  };

  if (loading) return <div className="settings-loading">Loading integrations...</div>;
  if (error) return <div className="settings-error">{error}</div>;

  return (
    <div className="integrations-panel">
      <div className="section-header">
        <h2>API Integrations</h2>
        <p>Manage external API connections and usage</p>
      </div>

      <div className="integrations-list">
        {integrations.map(integration => (
          <div key={integration.name} className="integration-card">
            <div className="integration-header">
              <div className="integration-name">
                {getStatusIcon(integration.status)}
                <h4>{integration.displayName}</h4>
              </div>
              <span className={'status-badge ' + integration.status}>
                {integration.status}
              </span>
            </div>

            <div className="integration-api-key">
              {editingKey === integration.name ? (
                <div className="key-edit-form">
                  <input
                    type={showKey[integration.name] ? 'text' : 'password'}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Enter API key"
                  />
                  <button
                    className="icon-btn"
                    onClick={() => setShowKey(prev => ({ ...prev, [integration.name]: !prev[integration.name] }))}
                  >
                    {showKey[integration.name] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button className="btn-primary btn-sm" onClick={() => handleSaveKey(integration.name)}>
                    Save
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => { setEditingKey(null); setNewKey(''); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="key-display">
                  <span className="key-value">
                    {integration.hasApiKey ? '••••••••' : 'Not configured'}
                  </span>
                  <button className="btn-secondary btn-sm" onClick={() => setEditingKey(integration.name)}>
                    {integration.hasApiKey ? 'Update' : 'Add Key'}
                  </button>
                  {integration.hasApiKey && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleTest(integration.name)}
                      disabled={testing[integration.name]}
                    >
                      <Zap size={12} />
                      {testing[integration.name] ? 'Testing...' : 'Test'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="integration-usage">
              <div className="usage-stat">
                <span className="usage-label">Today</span>
                <span className="usage-value">{formatUsage(integration.callsToday, integration.dailyLimit)}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-label">This Month</span>
                <span className="usage-value">{formatUsage(integration.callsThisMonth, integration.monthlyLimit)}</span>
              </div>
            </div>

            {integration.lastError && (
              <div className="integration-error">{integration.lastError}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default IntegrationsPanel;
