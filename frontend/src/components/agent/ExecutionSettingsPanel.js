// frontend/src/components/agent/ExecutionSettingsPanel.js
// Configure per-portfolio auto-execution settings

import { useState, useEffect } from 'react';
import {
  Settings,
  Zap,
  Shield,
  AlertCircle,
  RefreshCw,
  Check,
  Info,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { executionAPI } from '../../services/api';
import './ExecutionSettingsPanel.css';

function ExecutionSettingsPanel({ portfolioId }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [portfolioId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await executionAPI.getSettings(portfolioId);
      if (res.data?.success) {
        setSettings(res.data.settings);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (field) => {
    setSettings(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
    setHasChanges(true);
    setSuccess(null);
  };

  const handleSliderChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: parseFloat(value)
    }));
    setHasChanges(true);
    setSuccess(null);
  };

  const handleActionToggle = (action) => {
    setSettings(prev => {
      const currentActions = prev.autoExecuteActions || ['buy', 'sell'];
      const newActions = currentActions.includes(action)
        ? currentActions.filter(a => a !== action)
        : [...currentActions, action];
      return {
        ...prev,
        autoExecuteActions: newActions
      };
    });
    setHasChanges(true);
    setSuccess(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await executionAPI.updateSettings(portfolioId, {
        autoExecute: settings.autoExecute,
        executionThreshold: settings.executionThreshold,
        maxAutoPositionPct: settings.maxAutoPositionPct,
        requireConfirmation: settings.requireConfirmation,
        autoExecuteActions: settings.autoExecuteActions
      });

      setSuccess('Settings saved successfully');
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="execution-settings loading">
        <RefreshCw size={24} className="spinning" />
        <span>Loading settings...</span>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="execution-settings error">
        <AlertCircle size={24} />
        <p>Error: {error}</p>
        <button className="btn btn-secondary" onClick={loadSettings}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="execution-settings">
      <div className="settings-header">
        <div className="settings-title">
          <Zap size={20} />
          <h3>Auto-Execution Settings</h3>
        </div>
        <div className="settings-status">
          {settings?.autoExecute ? (
            <span className="status-badge enabled">
              <Check size={14} /> Enabled
            </span>
          ) : (
            <span className="status-badge disabled">
              Disabled
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="settings-alert error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="settings-alert success">
          <Check size={16} />
          {success}
        </div>
      )}

      <div className="settings-content">
        {/* Main Toggle */}
        <div className="setting-group main-toggle">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Auto-Execute Recommendations</span>
              <span className="setting-description">
                When enabled, high-confidence recommendations will be queued for execution
              </span>
            </div>
            <button
              className={`toggle-btn ${settings?.autoExecute ? 'on' : 'off'}`}
              onClick={() => handleToggle('autoExecute')}
            >
              {settings?.autoExecute ? (
                <ToggleRight size={32} />
              ) : (
                <ToggleLeft size={32} />
              )}
            </button>
          </div>
        </div>

        {/* Threshold Settings */}
        <div className={`setting-group ${!settings?.autoExecute ? 'disabled' : ''}`}>
          <h4>
            <Shield size={16} />
            Execution Thresholds
          </h4>

          {/* Signal Score Threshold */}
          <div className="setting-row slider-row">
            <div className="setting-info">
              <span className="setting-label">Minimum Signal Score</span>
              <span className="setting-description">
                Only execute when AI signal score exceeds this threshold
              </span>
            </div>
            <div className="slider-control">
              <input
                type="range"
                min="0.1"
                max="0.6"
                step="0.05"
                value={settings?.executionThreshold || 0.3}
                onChange={(e) => handleSliderChange('executionThreshold', e.target.value)}
                disabled={!settings?.autoExecute}
              />
              <span className="slider-value">
                {((settings?.executionThreshold || 0.3) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Max Position Size */}
          <div className="setting-row slider-row">
            <div className="setting-info">
              <span className="setting-label">Max Position Size</span>
              <span className="setting-description">
                Maximum portfolio percentage for any auto-executed trade
              </span>
            </div>
            <div className="slider-control">
              <input
                type="range"
                min="0.01"
                max="0.15"
                step="0.01"
                value={settings?.maxAutoPositionPct || 0.05}
                onChange={(e) => handleSliderChange('maxAutoPositionPct', e.target.value)}
                disabled={!settings?.autoExecute}
              />
              <span className="slider-value">
                {((settings?.maxAutoPositionPct || 0.05) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Confirmation Settings */}
        <div className={`setting-group ${!settings?.autoExecute ? 'disabled' : ''}`}>
          <h4>
            <Settings size={16} />
            Confirmation & Actions
          </h4>

          {/* Require Confirmation */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Require Confirmation</span>
              <span className="setting-description">
                Queue trades for manual approval instead of executing immediately
              </span>
            </div>
            <button
              className={`toggle-btn ${settings?.requireConfirmation ? 'on' : 'off'}`}
              onClick={() => handleToggle('requireConfirmation')}
              disabled={!settings?.autoExecute}
            >
              {settings?.requireConfirmation ? (
                <ToggleRight size={32} />
              ) : (
                <ToggleLeft size={32} />
              )}
            </button>
          </div>

          {/* Allowed Actions */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-label">Allowed Actions</span>
              <span className="setting-description">
                Which trade types can be auto-executed
              </span>
            </div>
            <div className="action-toggles">
              <button
                className={`action-btn ${settings?.autoExecuteActions?.includes('buy') ? 'active' : ''}`}
                onClick={() => handleActionToggle('buy')}
                disabled={!settings?.autoExecute}
              >
                Buy
              </button>
              <button
                className={`action-btn ${settings?.autoExecuteActions?.includes('sell') ? 'active' : ''}`}
                onClick={() => handleActionToggle('sell')}
                disabled={!settings?.autoExecute}
              >
                Sell
              </button>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="info-box">
          <Info size={16} />
          <div>
            <strong>How Auto-Execution Works</strong>
            <p>
              When the AI trading system generates a recommendation that meets your thresholds,
              it will be queued for execution. If "Require Confirmation" is enabled, you'll need
              to approve each trade in the Pending Trades tab before it executes.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="settings-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="spinning" />
                Saving...
              </>
            ) : (
              <>
                <Check size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExecutionSettingsPanel;
