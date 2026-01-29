// frontend/src/components/alerts/DigestPreferences.jsx
// Component for configuring alert digest preferences

import { useState, useEffect, useCallback } from 'react';
import { Settings, Bell, Clock, Mail, Check, X } from '../icons';
import { alertsAPI } from '../../services/api';
import './DigestPreferences.css';

const DIGEST_MODE_OPTIONS = [
  {
    value: 'realtime_critical',
    name: 'Critical Only',
    description: 'Only critical alerts (P5) in real-time, others in daily digest',
    realtime: 'Critical only',
    batched: 'Daily digest'
  },
  {
    value: 'realtime_important',
    name: 'Important Alerts',
    description: 'Important alerts (P4+) in real-time, low priority in daily digest',
    realtime: 'P4+ alerts',
    batched: 'Daily digest'
  },
  {
    value: 'daily_digest',
    name: 'Daily Digest Only',
    description: 'All alerts bundled into a daily summary',
    realtime: 'None',
    batched: 'All alerts'
  },
  {
    value: 'weekly_digest',
    name: 'Weekly Summary',
    description: 'Only critical alerts real-time, weekly summary for the rest',
    realtime: 'Critical only',
    batched: 'Weekly summary'
  }
];

export default function DigestPreferences({ userId = 'default', onClose, inline = false }) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await alertsAPI.getDigestPreferences(userId);
      if (response.data?.success) {
        setPreferences(response.data.data.preferences);
      }
    } catch (err) {
      setError(err.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleChange = (field, value) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await alertsAPI.updateDigestPreferences({
        userId,
        ...preferences
      });

      setHasChanges(false);
    } catch (err) {
      setError(err.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`digest-preferences ${inline ? 'inline' : 'modal'}`}>
        <div className="loading-state">
          <Clock className="spinning" size={20} />
          <span>Loading preferences...</span>
        </div>
      </div>
    );
  }

  if (error && !preferences) {
    return (
      <div className={`digest-preferences ${inline ? 'inline' : 'modal'} error`}>
        <p>Failed to load preferences: {error}</p>
        <button onClick={loadPreferences}>Retry</button>
      </div>
    );
  }

  const content = (
    <>
      <div className="preferences-header">
        <div className="header-title">
          <Settings size={20} />
          <h3>Alert Delivery Preferences</h3>
        </div>
        {!inline && onClose && (
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <div className="preferences-content">
        {/* Digest Mode Selection */}
        <div className="preference-section">
          <h4>
            <Bell size={16} />
            Delivery Mode
          </h4>
          <p className="section-description">
            Choose how you want to receive alerts
          </p>

          <div className="mode-options">
            {DIGEST_MODE_OPTIONS.map((mode) => (
              <label
                key={mode.value}
                className={`mode-option ${preferences?.digestMode === mode.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="digestMode"
                  value={mode.value}
                  checked={preferences?.digestMode === mode.value}
                  onChange={(e) => handleChange('digestMode', e.target.value)}
                />
                <div className="mode-content">
                  <span className="mode-name">{mode.name}</span>
                  <span className="mode-description">{mode.description}</span>
                  <div className="mode-breakdown">
                    <span className="realtime">Real-time: {mode.realtime}</span>
                    <span className="batched">Batched: {mode.batched}</span>
                  </div>
                </div>
                {preferences?.digestMode === mode.value && (
                  <Check size={16} className="check-icon" />
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Timing Preferences */}
        <div className="preference-section">
          <h4>
            <Clock size={16} />
            Digest Timing
          </h4>

          <div className="timing-options">
            <div className="timing-field">
              <label>Daily Digest Time</label>
              <input
                type="time"
                value={preferences?.dailyDigestTime || '07:00'}
                onChange={(e) => handleChange('dailyDigestTime', e.target.value)}
              />
            </div>

            {preferences?.digestMode === 'weekly_digest' && (
              <>
                <div className="timing-field">
                  <label>Weekly Digest Day</label>
                  <select
                    value={preferences?.weeklyDigestDay || 'monday'}
                    onChange={(e) => handleChange('weeklyDigestDay', e.target.value)}
                  >
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </div>

                <div className="timing-field">
                  <label>Weekly Digest Time</label>
                  <input
                    type="time"
                    value={preferences?.weeklyDigestTime || '09:00'}
                    onChange={(e) => handleChange('weeklyDigestTime', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filtering Options */}
        <div className="preference-section">
          <h4>
            <Mail size={16} />
            Alert Filtering
          </h4>

          <div className="filter-options">
            <label className="toggle-option">
              <input
                type="checkbox"
                checked={preferences?.watchlistOnly || false}
                onChange={(e) => handleChange('watchlistOnly', e.target.checked)}
              />
              <span className="toggle-label">
                <strong>Watchlist Only</strong>
                <span>Only receive alerts for stocks on your watchlist</span>
              </span>
            </label>

            <label className="toggle-option">
              <input
                type="checkbox"
                checked={preferences?.portfolioOnly || false}
                onChange={(e) => handleChange('portfolioOnly', e.target.checked)}
              />
              <span className="toggle-label">
                <strong>Portfolio Only</strong>
                <span>Only receive alerts for stocks in your portfolio</span>
              </span>
            </label>

            <label className="toggle-option">
              <input
                type="checkbox"
                checked={preferences?.includeAISummary !== false}
                onChange={(e) => handleChange('includeAISummary', e.target.checked)}
              />
              <span className="toggle-label">
                <strong>Include AI Summary</strong>
                <span>Add AI-generated summary to digests</span>
              </span>
            </label>
          </div>

          <div className="priority-threshold">
            <label>Minimum Priority for Real-time</label>
            <select
              value={preferences?.minPriorityRealtime || 4}
              onChange={(e) => handleChange('minPriorityRealtime', parseInt(e.target.value))}
            >
              <option value={5}>Critical only (P5)</option>
              <option value={4}>Important+ (P4-P5)</option>
              <option value={3}>Moderate+ (P3-P5)</option>
              <option value={2}>Low+ (P2-P5)</option>
              <option value={1}>All (P1-P5)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="preferences-footer">
        {hasChanges && (
          <span className="unsaved-indicator">Unsaved changes</span>
        )}
        <button
          className="save-btn"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </>
  );

  if (inline) {
    return <div className="digest-preferences inline">{content}</div>;
  }

  return (
    <div className="digest-preferences-overlay">
      <div className="digest-preferences modal">{content}</div>
    </div>
  );
}
