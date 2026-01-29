// frontend/src/components/settings/NotificationPreferences.js
import { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  Mail,
  Smartphone,
  Monitor,
  Building2,
  Briefcase,
  Star,
  TrendingUp,
  Sparkles,
  Settings,
  Link,
  AlertTriangle,
  AlertCircle,
  Info,
  Save,
  RefreshCw,
  Clock,
  Volume2,
  VolumeX
} from '../icons';
import { notificationsAPI } from '../../services/api';
import './NotificationPreferences.css';

// Category configuration
const CATEGORIES = [
  { id: 'company', label: 'Company Alerts', icon: Building2, description: 'Valuation signals, price alerts, and fundamental changes', color: '#10B981' },
  { id: 'portfolio', label: 'Portfolio Alerts', icon: Briefcase, description: 'Drawdowns, concentration warnings, and performance updates', color: '#6366F1' },
  { id: 'watchlist', label: 'Watchlist Alerts', icon: Star, description: 'Price target triggers and watched stock updates', color: '#8B5CF6' },
  { id: 'sentiment', label: 'Sentiment Alerts', icon: TrendingUp, description: 'Market sentiment divergences and social signals', color: '#EC4899' },
  { id: 'ai', label: 'AI Insights', icon: Sparkles, description: 'AI-generated patterns and recommendations', color: '#14B8A6' },
  { id: 'correlation', label: 'Correlation Alerts', icon: Link, description: 'Cross-feature correlations and compound signals', color: '#F97316' },
  { id: 'system', label: 'System Notifications', icon: Settings, description: 'Maintenance, updates, and account notices', color: '#6B7280' }
];

// Severity levels
const SEVERITIES = [
  { id: 'critical', label: 'Critical', icon: AlertTriangle, color: '#DC2626', description: 'Urgent alerts requiring immediate attention' },
  { id: 'warning', label: 'Warning', icon: AlertCircle, color: '#F59E0B', description: 'Important alerts that may need action' },
  { id: 'info', label: 'Info', icon: Info, color: '#3B82F6', description: 'Informational updates and minor alerts' }
];

// Delivery channels
const CHANNELS = [
  { id: 'in_app', label: 'In-App', icon: Monitor, description: 'Show in notification center' },
  { id: 'email', label: 'Email', icon: Mail, description: 'Send email notifications' },
  { id: 'push', label: 'Push', icon: Smartphone, description: 'Browser push notifications' }
];

// Digest frequency options
const DIGEST_OPTIONS = [
  { value: 'realtime', label: 'Real-time', description: 'Send immediately as they happen' },
  { value: 'hourly', label: 'Hourly Digest', description: 'Batch and send every hour' },
  { value: 'daily', label: 'Daily Digest', description: 'Send once per day (9 AM)' },
  { value: 'weekly', label: 'Weekly Summary', description: 'Send weekly summary (Monday)' },
  { value: 'off', label: 'Off', description: 'Disable all emails' }
];

// Quiet hours presets
const QUIET_HOURS_PRESETS = [
  { value: 'none', label: 'None', start: null, end: null },
  { value: 'night', label: 'Night (10PM - 8AM)', start: '22:00', end: '08:00' },
  { value: 'business', label: 'Outside Business Hours', start: '18:00', end: '09:00' },
  { value: 'weekend', label: 'Weekends Only', start: null, end: null, weekendOnly: true },
  { value: 'custom', label: 'Custom', start: null, end: null }
];

function NotificationPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load preferences
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await notificationsAPI.getPreferences();
      if (response.data?.success) {
        setPreferences(response.data.data || getDefaultPreferences());
      } else {
        setPreferences(getDefaultPreferences());
      }
    } catch (err) {
      console.error('Error loading notification preferences:', err);
      setPreferences(getDefaultPreferences());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPreferences = () => ({
    global: {
      enabled: true,
      emailDigest: 'daily',
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      sound: true,
      minPriority: 2
    },
    categories: CATEGORIES.reduce((acc, cat) => {
      acc[cat.id] = {
        enabled: true,
        channels: ['in_app', 'email'],
        minPriority: 2
      };
      return acc;
    }, {}),
    severities: SEVERITIES.reduce((acc, sev) => {
      acc[sev.id] = {
        enabled: true,
        channels: sev.id === 'critical' ? ['in_app', 'email', 'push'] :
                  sev.id === 'warning' ? ['in_app', 'email'] : ['in_app']
      };
      return acc;
    }, {})
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await notificationsAPI.updatePreferences(preferences);
      setHasChanges(false);
    } catch (err) {
      setError('Failed to save preferences. Please try again.');
      console.error('Error saving preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (path, value) => {
    setPreferences(prev => {
      const updated = { ...prev };
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return updated;
    });
    setHasChanges(true);
  };

  const toggleChannel = (path, channel) => {
    const currentChannels = path.split('.').reduce((obj, key) => obj?.[key], preferences)?.channels || [];
    const newChannels = currentChannels.includes(channel)
      ? currentChannels.filter(c => c !== channel)
      : [...currentChannels, channel];
    updatePreference(`${path}.channels`, newChannels);
  };

  if (loading) {
    return (
      <div className="notification-preferences loading">
        <RefreshCw className="spinning" size={24} />
        <p>Loading notification preferences...</p>
      </div>
    );
  }

  return (
    <div className="notification-preferences">
      {/* Header */}
      <div className="prefs-header">
        <div className="prefs-title">
          <Bell size={24} />
          <div>
            <h2>Notification Preferences</h2>
            <p>Configure how and when you receive alerts</p>
          </div>
        </div>
        <div className="prefs-actions">
          {hasChanges && (
            <span className="unsaved-indicator">Unsaved changes</span>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <><RefreshCw size={16} className="spinning" /> Saving...</>
            ) : (
              <><Save size={16} /> Save Changes</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="prefs-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Global Settings */}
      <section className="prefs-section">
        <h3>
          <Settings size={18} />
          Global Settings
        </h3>

        <div className="pref-row">
          <div className="pref-info">
            <span className="pref-label">Enable Notifications</span>
            <span className="pref-description">Master toggle for all notifications</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences?.global?.enabled ?? true}
              onChange={(e) => updatePreference('global.enabled', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="pref-row">
          <div className="pref-info">
            <span className="pref-label">
              <Volume2 size={16} />
              Notification Sounds
            </span>
            <span className="pref-description">Play sound for new notifications</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences?.global?.sound ?? true}
              onChange={(e) => updatePreference('global.sound', e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="pref-row">
          <div className="pref-info">
            <span className="pref-label">Email Digest Frequency</span>
            <span className="pref-description">How often to receive email notifications</span>
          </div>
          <select
            value={preferences?.global?.emailDigest || 'daily'}
            onChange={(e) => updatePreference('global.emailDigest', e.target.value)}
            className="pref-select"
          >
            {DIGEST_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="pref-row">
          <div className="pref-info">
            <span className="pref-label">Minimum Priority</span>
            <span className="pref-description">Only show notifications at or above this priority</span>
          </div>
          <select
            value={preferences?.global?.minPriority || 2}
            onChange={(e) => updatePreference('global.minPriority', parseInt(e.target.value))}
            className="pref-select"
          >
            <option value={1}>All (Priority 1+)</option>
            <option value={2}>Low and above (Priority 2+)</option>
            <option value={3}>Medium and above (Priority 3+)</option>
            <option value={4}>High and above (Priority 4+)</option>
            <option value={5}>Critical only (Priority 5)</option>
          </select>
        </div>

        {/* Quiet Hours */}
        <div className="pref-subsection">
          <div className="pref-row">
            <div className="pref-info">
              <span className="pref-label">
                <Clock size={16} />
                Quiet Hours
              </span>
              <span className="pref-description">Pause notifications during specific times</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={preferences?.global?.quietHours?.enabled ?? false}
                onChange={(e) => updatePreference('global.quietHours.enabled', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {preferences?.global?.quietHours?.enabled && (
            <div className="quiet-hours-config">
              <div className="time-inputs">
                <div className="time-input">
                  <label>Start</label>
                  <input
                    type="time"
                    value={preferences?.global?.quietHours?.start || '22:00'}
                    onChange={(e) => updatePreference('global.quietHours.start', e.target.value)}
                  />
                </div>
                <span className="time-separator">to</span>
                <div className="time-input">
                  <label>End</label>
                  <input
                    type="time"
                    value={preferences?.global?.quietHours?.end || '08:00'}
                    onChange={(e) => updatePreference('global.quietHours.end', e.target.value)}
                  />
                </div>
              </div>
              <p className="quiet-hours-note">Critical alerts will still be delivered during quiet hours</p>
            </div>
          )}
        </div>
      </section>

      {/* Category Preferences */}
      <section className="prefs-section">
        <h3>
          <Bell size={18} />
          Alert Categories
        </h3>
        <p className="section-description">Configure notifications by category</p>

        <div className="category-grid">
          {CATEGORIES.map(category => {
            const Icon = category.icon;
            const catPrefs = preferences?.categories?.[category.id] || {};
            const isEnabled = catPrefs.enabled ?? true;

            return (
              <div key={category.id} className={`category-card ${isEnabled ? '' : 'disabled'}`}>
                <div className="category-header">
                  <div className="category-info">
                    <div className="category-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4>{category.label}</h4>
                      <p>{category.description}</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => updatePreference(`categories.${category.id}.enabled`, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {isEnabled && (
                  <div className="category-channels">
                    <span className="channels-label">Delivery channels:</span>
                    <div className="channel-toggles">
                      {CHANNELS.map(channel => {
                        const ChannelIcon = channel.icon;
                        const isActive = catPrefs.channels?.includes(channel.id);
                        return (
                          <button
                            key={channel.id}
                            className={`channel-btn ${isActive ? 'active' : ''}`}
                            onClick={() => toggleChannel(`categories.${category.id}`, channel.id)}
                            title={channel.description}
                          >
                            <ChannelIcon size={14} />
                            {channel.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Severity Preferences */}
      <section className="prefs-section">
        <h3>
          <AlertTriangle size={18} />
          Severity Levels
        </h3>
        <p className="section-description">Configure notification delivery by severity</p>

        <div className="severity-grid">
          {SEVERITIES.map(severity => {
            const Icon = severity.icon;
            const sevPrefs = preferences?.severities?.[severity.id] || {};
            const isEnabled = sevPrefs.enabled ?? true;

            return (
              <div key={severity.id} className={`severity-card ${severity.id} ${isEnabled ? '' : 'disabled'}`}>
                <div className="severity-header">
                  <div className="severity-info">
                    <div className="severity-icon" style={{ backgroundColor: `${severity.color}20`, color: severity.color }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4>{severity.label}</h4>
                      <p>{severity.description}</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => updatePreference(`severities.${severity.id}.enabled`, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {isEnabled && (
                  <div className="severity-channels">
                    <span className="channels-label">Delivery channels:</span>
                    <div className="channel-toggles">
                      {CHANNELS.map(channel => {
                        const ChannelIcon = channel.icon;
                        const isActive = sevPrefs.channels?.includes(channel.id);
                        return (
                          <button
                            key={channel.id}
                            className={`channel-btn ${isActive ? 'active' : ''}`}
                            onClick={() => toggleChannel(`severities.${severity.id}`, channel.id)}
                            title={channel.description}
                          >
                            <ChannelIcon size={14} />
                            {channel.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Muted Items */}
      <section className="prefs-section">
        <h3>
          <BellOff size={18} />
          Muted & Snoozed
        </h3>
        <p className="section-description">Manage temporarily silenced notifications</p>

        <div className="muted-list">
          <div className="empty-muted">
            <BellOff size={32} />
            <p>No muted items</p>
            <span>Snooze notifications from the alert center to add them here</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default NotificationPreferences;
