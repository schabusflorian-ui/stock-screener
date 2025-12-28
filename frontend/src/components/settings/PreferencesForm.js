// frontend/src/components/settings/PreferencesForm.js
import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { Save, RotateCcw, RefreshCw } from 'lucide-react';
import { CURRENCIES, DATE_FORMATS, NUMBER_FORMATS, THEMES } from '../../context/PreferencesContext';
import './SettingsComponents.css';

function PreferencesForm() {
  const [preferences, setPreferences] = useState({
    theme: 'dark',
    currency: 'USD',
    dateFormat: 'MMM D, YYYY',
    numberFormat: 'en-US',
    showPercentages: true,
    compactNumbers: true,
    autoRefreshInterval: 0,
    notificationsEnabled: false,
    defaultBenchmark: 'SPY',
    defaultTimeHorizon: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [originalPrefs, setOriginalPrefs] = useState(null);
  const [exchangeRates, setExchangeRates] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [prefsResponse, ratesResponse] = await Promise.all([
          settingsAPI.getPreferences(),
          settingsAPI.getExchangeRates(),
        ]);
        const prefs = prefsResponse.data.data || prefsResponse.data.preferences || {};
        setPreferences(prev => ({ ...prev, ...prefs }));
        setOriginalPrefs({ ...preferences, ...prefs });
        if (ratesResponse.data.rates) {
          setExchangeRates(ratesResponse.data);
        }
        setError(null);
      } catch (err) {
        setError('Failed to load preferences');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await settingsAPI.updatePreferences(preferences);
      setOriginalPrefs({ ...preferences });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save preferences');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalPrefs) {
      setPreferences({ ...originalPrefs });
    }
  };

  const refreshRates = async () => {
    setRatesLoading(true);
    try {
      const response = await settingsAPI.getExchangeRates();
      if (response.data.rates) {
        setExchangeRates(response.data);
      }
    } catch (err) {
      console.error('Failed to refresh rates:', err);
    } finally {
      setRatesLoading(false);
    }
  };

  const hasChanges = JSON.stringify(preferences) !== JSON.stringify(originalPrefs);

  if (loading) return <div className="settings-loading">Loading preferences...</div>;

  // Get current exchange rate for selected currency
  const currentRate = exchangeRates?.rates?.[preferences.currency];
  const rateDisplay = currentRate && preferences.currency !== 'USD'
    ? `1 USD = ${currentRate.toFixed(4)} ${preferences.currency}`
    : null;

  return (
    <div className="preferences-form">
      <div className="section-header">
        <h2>User Preferences</h2>
        <p>Customize your experience</p>
      </div>

      {error && <div className="settings-error">{error}</div>}
      {success && <div className="settings-success">Preferences saved successfully!</div>}

      <div className="preferences-grid">
        {/* Display Settings */}
        <div className="preference-group">
          <h3>Display</h3>

          <div className="preference-item">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={preferences.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
            >
              {THEMES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="preference-item">
            <label htmlFor="dateFormat">Date Format</label>
            <select
              id="dateFormat"
              value={preferences.dateFormat}
              onChange={(e) => handleChange('dateFormat', e.target.value)}
            >
              {DATE_FORMATS.map(f => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.example})
                </option>
              ))}
            </select>
          </div>

          <div className="preference-item">
            <label htmlFor="numberFormat">Number Format</label>
            <select
              id="numberFormat"
              value={preferences.numberFormat}
              onChange={(e) => handleChange('numberFormat', e.target.value)}
            >
              {NUMBER_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={preferences.showPercentages}
                onChange={(e) => handleChange('showPercentages', e.target.checked)}
              />
              Show percentages by default
            </label>
          </div>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={preferences.compactNumbers}
                onChange={(e) => handleChange('compactNumbers', e.target.checked)}
              />
              Use compact numbers (1.2M instead of 1,200,000)
            </label>
          </div>
        </div>

        {/* Currency & Data */}
        <div className="preference-group">
          <h3>Currency & Data</h3>

          <div className="preference-item">
            <label htmlFor="currency">Display Currency</label>
            <select
              id="currency"
              value={preferences.currency}
              onChange={(e) => handleChange('currency', e.target.value)}
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) - {c.name}
                </option>
              ))}
            </select>
            {rateDisplay && (
              <div className="preference-hint">
                {rateDisplay}
                <button
                  className="icon-btn-inline"
                  onClick={refreshRates}
                  disabled={ratesLoading}
                  title="Refresh exchange rates"
                >
                  <RefreshCw size={12} className={ratesLoading ? 'spinning' : ''} />
                </button>
              </div>
            )}
          </div>

          <div className="preference-item">
            <label htmlFor="defaultBenchmark">Default Benchmark</label>
            <select
              id="defaultBenchmark"
              value={preferences.defaultBenchmark}
              onChange={(e) => handleChange('defaultBenchmark', e.target.value)}
            >
              <option value="SPY">S&P 500 (SPY)</option>
              <option value="QQQ">Nasdaq 100 (QQQ)</option>
              <option value="DIA">Dow Jones (DIA)</option>
              <option value="IWM">Russell 2000 (IWM)</option>
              <option value="VTI">Total Market (VTI)</option>
              <option value="EFA">Intl Developed (EFA)</option>
              <option value="EEM">Emerging Markets (EEM)</option>
            </select>
          </div>

          <div className="preference-item">
            <label htmlFor="defaultTimeHorizon">Default Time Horizon (years)</label>
            <select
              id="defaultTimeHorizon"
              value={preferences.defaultTimeHorizon}
              onChange={(e) => handleChange('defaultTimeHorizon', parseInt(e.target.value))}
            >
              <option value="3">3 years</option>
              <option value="5">5 years</option>
              <option value="7">7 years</option>
              <option value="10">10 years</option>
              <option value="15">15 years</option>
              <option value="20">20 years</option>
            </select>
          </div>

          <div className="preference-item">
            <label htmlFor="autoRefreshInterval">Auto-Refresh Interval</label>
            <select
              id="autoRefreshInterval"
              value={preferences.autoRefreshInterval}
              onChange={(e) => handleChange('autoRefreshInterval', parseInt(e.target.value))}
            >
              <option value="0">Disabled</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
              <option value="900">15 minutes</option>
            </select>
          </div>
        </div>

        {/* Notifications */}
        <div className="preference-group">
          <h3>Notifications</h3>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={preferences.notificationsEnabled}
                onChange={(e) => handleChange('notificationsEnabled', e.target.checked)}
              />
              Enable browser notifications
            </label>
          </div>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={preferences.alertOnUpdateFailure}
                onChange={(e) => handleChange('alertOnUpdateFailure', e.target.checked)}
              />
              Alert on data update failures
            </label>
          </div>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={preferences.alertOnStaleData}
                onChange={(e) => handleChange('alertOnStaleData', e.target.checked)}
              />
              Alert when data becomes stale
            </label>
          </div>
        </div>
      </div>

      <div className="preferences-actions">
        <button
          className="btn-secondary"
          onClick={handleReset}
          disabled={!hasChanges || saving}
        >
          <RotateCcw size={14} />
          Reset Changes
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

export default PreferencesForm;
