// frontend/src/components/settings/TaxSettings.js
import { useState, useEffect } from 'react';
import { settingsAPI } from '../../services/api';
import { Save, RotateCcw, Info, AlertTriangle, CheckCircle } from '../icons';
import './SettingsComponents.css';

// Country options with tax regimes
const COUNTRY_OPTIONS = [
  { code: 'AT', name: 'Austria', flag: '🇦🇹', currency: 'EUR' },
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', currency: 'EUR' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', currency: 'CHF' },
  { code: 'NONE', name: 'Tax-Free Account', flag: '🏦', currency: null }
];

// Tax regime summaries
const TAX_SUMMARIES = {
  AT: {
    rate: '27.5%',
    name: 'KESt (Kapitalertragsteuer)',
    features: [
      'Flat 27.5% on all capital gains',
      'No short/long-term distinction',
      'Losses offset gains in same year',
      'No wash sale rule',
      'Austrian brokers withhold automatically'
    ],
    lotMethod: 'FIFO',
    reportingForm: 'E1kv'
  },
  US: {
    rate: '0-37%',
    name: 'Federal Capital Gains Tax',
    features: [
      'Short-term: Ordinary income rates (up to 37%)',
      'Long-term (>1 year): 0%, 15%, or 20%',
      '$3,000 loss deduction per year',
      '30-day wash sale rule applies',
      'Unlimited loss carryforward'
    ],
    lotMethod: 'FIFO (default)',
    reportingForm: 'Schedule D, Form 8949'
  },
  DE: {
    rate: '26.375%',
    name: 'Abgeltungsteuer',
    features: [
      'Flat 25% + 5.5% solidarity surcharge',
      '€1,000 annual exemption (Sparerpauschbetrag)',
      'Stock losses only offset stock gains',
      'German brokers withhold automatically',
      'Unlimited loss carryforward'
    ],
    lotMethod: 'FIFO',
    reportingForm: 'Anlage KAP'
  },
  UK: {
    rate: '10-20%',
    name: 'Capital Gains Tax',
    features: [
      'Basic rate: 10%, Higher rate: 20%',
      '£3,000 annual exemption',
      '30-day bed & breakfast rule',
      'Losses can be carried forward',
      'Share pooling rules apply'
    ],
    lotMethod: 'FIFO + Pooling',
    reportingForm: 'Self Assessment'
  },
  CH: {
    rate: '0%',
    name: 'Private Investor Exemption',
    features: [
      'Capital gains tax-free for private investors',
      'Professional traders taxed as income',
      'Wealth tax may apply',
      '35% dividend withholding (reclaimable)',
      'No loss offsetting needed'
    ],
    lotMethod: 'FIFO',
    reportingForm: 'Steuererklärung'
  },
  NONE: {
    rate: '0%',
    name: 'Tax-Advantaged Account',
    features: [
      'No tax on capital gains',
      'No tax on dividends',
      'No tax benefit from losses',
      'Examples: ISA, Roth IRA, Pension',
      'Contribution limits may apply'
    ],
    lotMethod: 'FIFO',
    reportingForm: 'None required'
  }
};

function TaxSettings() {
  const [settings, setSettings] = useState({
    taxCountry: 'AT',
    taxYear: new Date().getFullYear(),
    trackTaxLots: true,
    lotMethod: 'fifo',
    enableTaxLossHarvesting: true,
    taxLossHarvestingThreshold: 500,
    showTaxImpact: true,
    brokerType: 'foreign' // 'domestic' or 'foreign'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [originalSettings, setOriginalSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await settingsAPI.getTaxSettings();
        const data = response.data.data || response.data.settings || {};
        setSettings(prev => ({ ...prev, ...data }));
        setOriginalSettings({ ...settings, ...data });
        setError(null);
      } catch (err) {
        // Use defaults if not configured yet
        setOriginalSettings({ ...settings });
        console.log('Using default tax settings');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await settingsAPI.updateTaxSettings(settings);
      setOriginalSettings({ ...settings });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save tax settings');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalSettings) {
      setSettings({ ...originalSettings });
    }
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);
  const selectedCountry = COUNTRY_OPTIONS.find(c => c.code === settings.taxCountry);
  const taxSummary = TAX_SUMMARIES[settings.taxCountry];

  if (loading) return <div className="settings-loading">Loading tax settings...</div>;

  return (
    <div className="tax-settings">
      <div className="section-header">
        <h2>Tax Settings</h2>
        <p>Configure tax tracking for your jurisdiction</p>
      </div>

      {error && <div className="settings-error">{error}</div>}
      {success && <div className="settings-success">Tax settings saved successfully!</div>}

      <div className="tax-settings-grid">
        {/* Country Selection */}
        <div className="tax-group">
          <h3>Tax Jurisdiction</h3>

          <div className="preference-item">
            <label htmlFor="taxCountry">Country / Account Type</label>
            <select
              id="taxCountry"
              value={settings.taxCountry}
              onChange={(e) => handleChange('taxCountry', e.target.value)}
            >
              {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} {c.currency ? `(${c.currency})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Tax Summary Card */}
          {taxSummary && (
            <div className="tax-summary-card">
              <div className="tax-summary-header">
                <span className="tax-flag">{selectedCountry?.flag}</span>
                <div>
                  <h4>{taxSummary.name}</h4>
                  <span className="tax-rate">Rate: {taxSummary.rate}</span>
                </div>
              </div>
              <ul className="tax-features">
                {taxSummary.features.map((feature, i) => (
                  <li key={i}>
                    <CheckCircle size={12} />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="tax-meta">
                <span>Lot Method: {taxSummary.lotMethod}</span>
                <span>Form: {taxSummary.reportingForm}</span>
              </div>
            </div>
          )}

          {settings.taxCountry !== 'NONE' && (
            <div className="preference-item">
              <label htmlFor="brokerType">Broker Type</label>
              <select
                id="brokerType"
                value={settings.brokerType}
                onChange={(e) => handleChange('brokerType', e.target.value)}
              >
                <option value="domestic">
                  Domestic Broker (auto-withholding)
                </option>
                <option value="foreign">
                  Foreign Broker (self-report required)
                </option>
              </select>
              <span className="preference-hint">
                {settings.brokerType === 'foreign'
                  ? 'You need to self-report gains on your tax return'
                  : 'Broker handles tax withholding automatically'}
              </span>
            </div>
          )}
        </div>

        {/* Tracking Options */}
        <div className="tax-group">
          <h3>Tax Tracking</h3>

          <div className="preference-item">
            <label htmlFor="taxYear">Tax Year</label>
            <select
              id="taxYear"
              value={settings.taxYear}
              onChange={(e) => handleChange('taxYear', parseInt(e.target.value))}
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.trackTaxLots}
                onChange={(e) => handleChange('trackTaxLots', e.target.checked)}
              />
              Track tax lots for each position
            </label>
            <span className="preference-hint">
              Required for accurate cost basis and gain/loss tracking
            </span>
          </div>

          {settings.trackTaxLots && settings.taxCountry === 'US' && (
            <div className="preference-item">
              <label htmlFor="lotMethod">Lot Selection Method</label>
              <select
                id="lotMethod"
                value={settings.lotMethod}
                onChange={(e) => handleChange('lotMethod', e.target.value)}
              >
                <option value="fifo">FIFO (First In, First Out)</option>
                <option value="lifo">LIFO (Last In, First Out)</option>
                <option value="hifo">HIFO (Highest Cost First)</option>
                <option value="lofo">LOFO (Lowest Cost First)</option>
                <option value="spec_id">Specific Identification</option>
              </select>
              <span className="preference-hint">
                HIFO minimizes taxes by selling highest-cost shares first
              </span>
            </div>
          )}

          <div className="preference-item checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.showTaxImpact}
                onChange={(e) => handleChange('showTaxImpact', e.target.checked)}
              />
              Show tax impact on trades
            </label>
            <span className="preference-hint">
              Display estimated tax before executing trades
            </span>
          </div>
        </div>

        {/* Tax Loss Harvesting */}
        <div className="tax-group">
          <h3>Tax Loss Harvesting</h3>

          {settings.taxCountry === 'CH' || settings.taxCountry === 'NONE' ? (
            <div className="tax-info-banner">
              <Info size={16} />
              <span>
                Tax loss harvesting not applicable - no capital gains tax
              </span>
            </div>
          ) : (
            <>
              <div className="preference-item checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.enableTaxLossHarvesting}
                    onChange={(e) => handleChange('enableTaxLossHarvesting', e.target.checked)}
                  />
                  Enable tax loss harvesting alerts
                </label>
                <span className="preference-hint">
                  Get notified when positions have harvestable losses
                </span>
              </div>

              {settings.enableTaxLossHarvesting && (
                <div className="preference-item">
                  <label htmlFor="taxLossHarvestingThreshold">
                    Minimum Loss to Alert ({selectedCountry?.currency || 'USD'})
                  </label>
                  <input
                    type="number"
                    id="taxLossHarvestingThreshold"
                    value={settings.taxLossHarvestingThreshold}
                    onChange={(e) => handleChange('taxLossHarvestingThreshold', parseInt(e.target.value))}
                    min="100"
                    step="100"
                  />
                  <span className="preference-hint">
                    Only show harvesting opportunities above this threshold
                  </span>
                </div>
              )}

              {settings.taxCountry === 'US' && (
                <div className="tax-warning-banner">
                  <AlertTriangle size={16} />
                  <span>
                    <strong>Wash Sale Rule:</strong> If you repurchase the same
                    security within 30 days, the loss will be disallowed.
                  </span>
                </div>
              )}

              {settings.taxCountry === 'AT' && (
                <div className="tax-info-banner">
                  <Info size={16} />
                  <span>
                    Austria has no wash sale rule - you can immediately repurchase
                    after harvesting losses.
                  </span>
                </div>
              )}
            </>
          )}
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
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default TaxSettings;
