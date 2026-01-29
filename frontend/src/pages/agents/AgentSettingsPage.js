// frontend/src/pages/agents/AgentSettingsPage.js
// Comprehensive settings page for trading agents

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Settings,
  Shield,
  Zap,
  Target,
  Sliders,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Check,
  RefreshCw,
  RotateCcw,
  Save,
  Brain,
  Cpu,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Info
} from '../../components/icons';
import { agentsAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import './AgentSettingsPage.css';
import { FeatureGate } from '../../components/subscription';

// Helper to ensure allowed_actions is always an array
function parseAllowedActions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : ['buy', 'sell'];
    } catch {
      // Handle comma-separated string
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return ['buy', 'sell'];
}

// Default agent settings
const DEFAULT_SETTINGS = {
  // Strategy weights
  technical_weight: 0.15,
  sentiment_weight: 0.10,
  insider_weight: 0.10,
  fundamental_weight: 0.15,
  alternative_weight: 0.10,
  valuation_weight: 0.15,
  thirteenf_weight: 0.10,
  earnings_weight: 0.10,
  value_quality_weight: 0.05,

  // Signal thresholds
  min_confidence: 0.60,
  min_signal_score: 0.30,

  // Risk parameters
  max_position_size: 0.10,
  max_sector_exposure: 0.30,
  min_cash_reserve: 0.05,
  max_drawdown: 0.20,
  max_correlation: 0.70,

  // Regime behavior
  regime_scaling_enabled: true,
  vix_scaling_enabled: true,
  vix_threshold: 25,
  pause_in_crisis: true,

  // Execution
  auto_execute: false,
  execution_threshold: 0.80,
  require_confirmation: true,
  allowed_actions: ['buy', 'sell'],

  // Features
  use_optimized_weights: true,
  use_hmm_regime: true,
  use_ml_combiner: false,
  use_factor_exposure: true,
  use_probabilistic_dcf: true,

  // Universe
  universe_type: 'all',
  universe_filter: null,
};

// Strategy presets
const STRATEGY_PRESETS = {
  balanced: {
    name: 'Balanced',
    description: 'Equal-weighted across all signal types',
    weights: {
      technical_weight: 0.11,
      sentiment_weight: 0.11,
      insider_weight: 0.11,
      fundamental_weight: 0.11,
      alternative_weight: 0.11,
      valuation_weight: 0.11,
      thirteenf_weight: 0.11,
      earnings_weight: 0.11,
      value_quality_weight: 0.11,
    }
  },
  value: {
    name: 'Value Focus',
    description: 'Emphasizes fundamental and valuation signals',
    weights: {
      technical_weight: 0.05,
      sentiment_weight: 0.05,
      insider_weight: 0.15,
      fundamental_weight: 0.25,
      alternative_weight: 0.05,
      valuation_weight: 0.25,
      thirteenf_weight: 0.10,
      earnings_weight: 0.05,
      value_quality_weight: 0.05,
    }
  },
  momentum: {
    name: 'Momentum',
    description: 'Emphasizes technical and sentiment signals',
    weights: {
      technical_weight: 0.30,
      sentiment_weight: 0.25,
      insider_weight: 0.05,
      fundamental_weight: 0.05,
      alternative_weight: 0.15,
      valuation_weight: 0.05,
      thirteenf_weight: 0.05,
      earnings_weight: 0.05,
      value_quality_weight: 0.05,
    }
  },
  defensive: {
    name: 'Defensive',
    description: 'Lower risk, quality-focused approach',
    weights: {
      technical_weight: 0.05,
      sentiment_weight: 0.05,
      insider_weight: 0.10,
      fundamental_weight: 0.20,
      alternative_weight: 0.05,
      valuation_weight: 0.20,
      thirteenf_weight: 0.15,
      earnings_weight: 0.05,
      value_quality_weight: 0.15,
    }
  },
};

const SIGNAL_LABELS = {
  technical_weight: { name: 'Technical', description: 'Price patterns, RSI, moving averages' },
  sentiment_weight: { name: 'Sentiment', description: 'News sentiment, social media' },
  insider_weight: { name: 'Insider', description: 'Insider buying/selling patterns' },
  fundamental_weight: { name: 'Fundamental', description: 'Revenue, earnings, growth' },
  alternative_weight: { name: 'Alternative', description: 'Congress trades, short interest' },
  valuation_weight: { name: 'Valuation', description: 'P/E, P/B, DCF analysis' },
  thirteenf_weight: { name: '13F Holdings', description: 'Institutional investor changes' },
  earnings_weight: { name: 'Earnings', description: 'Earnings momentum, surprises' },
  value_quality_weight: { name: 'Value Quality', description: 'Piotroski, Altman Z-Score' },
};

function WeightSlider({ signalKey, value, onChange, disabled }) {
  const info = SIGNAL_LABELS[signalKey] || { name: signalKey, description: '' };
  return (
    <div className="weight-slider">
      <div className="weight-slider__header">
        <span className="weight-slider__name">{info.name}</span>
        <span className="weight-slider__value">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="0.50"
        step="0.01"
        value={value}
        onChange={(e) => onChange(signalKey, parseFloat(e.target.value))}
        disabled={disabled}
        className="weight-slider__input"
      />
      <span className="weight-slider__description">{info.description}</span>
    </div>
  );
}

function SettingsSection({ title, icon: Icon, children, description }) {
  return (
    <div className="settings-section">
      <div className="settings-section__header">
        {Icon && <Icon size={18} />}
        <h3>{title}</h3>
      </div>
      {description && (
        <p className="settings-section__description">{description}</p>
      )}
      <div className="settings-section__content">
        {children}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      className={`toggle-control ${checked ? 'on' : 'off'}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      type="button"
    >
      {checked ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
    </button>
  );
}

function AgentSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [agent, setAgent] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('strategy');

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const loadAgent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await agentsAPI.get(id);
      const agentData = response.data.data || response.data.agent;

      if (!agentData) {
        throw new Error('Agent not found');
      }

      setAgent(agentData);

      // Helper to convert SQLite integers (0/1) to booleans
      const toBool = (value, defaultValue) => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return Boolean(value);
        return defaultValue;
      };

      // Merge agent settings with defaults
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        // Signal weights
        technical_weight: agentData.technical_weight ?? DEFAULT_SETTINGS.technical_weight,
        sentiment_weight: agentData.sentiment_weight ?? DEFAULT_SETTINGS.sentiment_weight,
        insider_weight: agentData.insider_weight ?? DEFAULT_SETTINGS.insider_weight,
        fundamental_weight: agentData.fundamental_weight ?? DEFAULT_SETTINGS.fundamental_weight,
        alternative_weight: agentData.alternative_weight ?? DEFAULT_SETTINGS.alternative_weight,
        valuation_weight: agentData.valuation_weight ?? DEFAULT_SETTINGS.valuation_weight,
        thirteenf_weight: agentData.thirteenf_weight ?? DEFAULT_SETTINGS.thirteenf_weight,
        earnings_weight: agentData.earnings_weight ?? DEFAULT_SETTINGS.earnings_weight,
        value_quality_weight: agentData.value_quality_weight ?? DEFAULT_SETTINGS.value_quality_weight,
        // Thresholds
        min_confidence: agentData.min_confidence ?? DEFAULT_SETTINGS.min_confidence,
        min_signal_score: agentData.min_signal_score ?? DEFAULT_SETTINGS.min_signal_score,
        // Risk
        max_position_size: agentData.max_position_size ?? DEFAULT_SETTINGS.max_position_size,
        max_sector_exposure: agentData.max_sector_exposure ?? DEFAULT_SETTINGS.max_sector_exposure,
        min_cash_reserve: agentData.min_cash_reserve ?? DEFAULT_SETTINGS.min_cash_reserve,
        max_drawdown: agentData.max_drawdown ?? DEFAULT_SETTINGS.max_drawdown,
        max_correlation: agentData.max_correlation ?? DEFAULT_SETTINGS.max_correlation,
        // Regime (convert integers to booleans)
        regime_scaling_enabled: toBool(agentData.regime_scaling_enabled, DEFAULT_SETTINGS.regime_scaling_enabled),
        vix_scaling_enabled: toBool(agentData.vix_scaling_enabled, DEFAULT_SETTINGS.vix_scaling_enabled),
        vix_threshold: agentData.vix_threshold ?? DEFAULT_SETTINGS.vix_threshold,
        pause_in_crisis: toBool(agentData.pause_in_crisis, DEFAULT_SETTINGS.pause_in_crisis),
        // Execution (convert integers to booleans)
        auto_execute: toBool(agentData.auto_execute, DEFAULT_SETTINGS.auto_execute),
        execution_threshold: agentData.execution_threshold ?? DEFAULT_SETTINGS.execution_threshold,
        require_confirmation: toBool(agentData.require_confirmation, DEFAULT_SETTINGS.require_confirmation),
        allowed_actions: parseAllowedActions(agentData.allowed_actions ?? DEFAULT_SETTINGS.allowed_actions),
        // Features (convert integers to booleans)
        use_optimized_weights: toBool(agentData.use_optimized_weights, DEFAULT_SETTINGS.use_optimized_weights),
        use_hmm_regime: toBool(agentData.use_hmm_regime, DEFAULT_SETTINGS.use_hmm_regime),
        use_ml_combiner: toBool(agentData.use_ml_combiner, DEFAULT_SETTINGS.use_ml_combiner),
        use_factor_exposure: toBool(agentData.use_factor_exposure, DEFAULT_SETTINGS.use_factor_exposure),
        use_probabilistic_dcf: toBool(agentData.use_probabilistic_dcf, DEFAULT_SETTINGS.use_probabilistic_dcf),
        // Universe
        universe_type: agentData.universe_type ?? DEFAULT_SETTINGS.universe_type,
        universe_filter: agentData.universe_filter ?? DEFAULT_SETTINGS.universe_filter,
      };

      setSettings(mergedSettings);
      setOriginalSettings(mergedSettings);
    } catch (err) {
      console.error('Error loading agent:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAgent();
  }, [loadAgent]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const handleWeightChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const handleApplyPreset = (presetKey) => {
    const preset = STRATEGY_PRESETS[presetKey];
    if (preset) {
      setSettings(prev => ({
        ...prev,
        ...preset.weights,
      }));
      setSuccess(null);
    }
  };

  const handleActionToggle = (action) => {
    setSettings(prev => {
      const currentActions = parseAllowedActions(prev.allowed_actions);
      const newActions = currentActions.includes(action)
        ? currentActions.filter(a => a !== action)
        : [...currentActions, action];
      return { ...prev, allowed_actions: newActions };
    });
    setSuccess(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Log what we're sending for debugging
      console.log('Saving settings:', settings);

      await agentsAPI.update(id, settings);

      setOriginalSettings(settings);
      setSuccess('Settings saved successfully');
    } catch (err) {
      console.error('Error saving settings:', err);
      console.error('Error response:', err.response?.data);
      // Show more detailed error message including validation details
      const errorMessage = err.response?.data?.details
        ? `Validation failed: ${err.response.data.details.map(d => `${d.field}: ${d.message}`).join(', ')}`
        : err.response?.data?.error || err.message;
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setSuccess(null);
  };

  const handleRevert = () => {
    setSettings(originalSettings);
    setSuccess(null);
  };

  // Calculate total weights
  const totalWeight = Object.keys(SIGNAL_LABELS).reduce(
    (sum, key) => sum + (settings[key] || 0),
    0
  );

  if (loading) {
    return (
      <div className="agent-settings">
        <div className="agent-settings__header">
          <Skeleton style={{ width: 200, height: 32 }} />
        </div>
        <div className="agent-settings__content">
          <Skeleton style={{ height: 600 }} />
        </div>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="agent-settings">
        <Card variant="glass" className="agent-settings__error">
          <AlertCircle size={32} />
          <h3>Error Loading Agent</h3>
          <p>{error}</p>
          <div className="agent-settings__error-actions">
            <Button variant="secondary" onClick={() => navigate('/agents')}>
              <ArrowLeft size={16} />
              Back to Agents
            </Button>
            <Button variant="primary" onClick={loadAgent}>
              <RefreshCw size={16} />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <FeatureGate
      feature="paper_trading_bots"
      showPreview={true}
      previewHeight="500px"
      title="Agent Settings"
      description="Configure and fine-tune your AI trading agent's behavior"
    >
    <div className="agent-settings">
      {/* Header */}
      <header className="agent-settings__header">
        <div className="agent-settings__title-section">
          <Link to={`/agents/${id}`} className="agent-settings__back">
            <ArrowLeft size={20} />
          </Link>
          <div className="agent-settings__avatar">
            <Settings size={24} />
          </div>
          <div>
            <h1>{agent?.name || 'Agent'} Settings</h1>
            <p className="agent-settings__subtitle">
              Configure strategy, risk parameters, and execution behavior
            </p>
          </div>
        </div>
        <div className="agent-settings__actions">
          {hasChanges && (
            <Button variant="ghost" onClick={handleRevert}>
              Revert Changes
            </Button>
          )}
          <Button
            variant="primary"
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
                <Save size={16} />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <div className="agent-settings__alert error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="agent-settings__alert success">
          <Check size={16} />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="agent-settings__tabs">
        <button
          className={`agent-settings__tab ${activeTab === 'strategy' ? 'active' : ''}`}
          onClick={() => setActiveTab('strategy')}
        >
          <Sliders size={16} />
          Strategy
        </button>
        <button
          className={`agent-settings__tab ${activeTab === 'risk' ? 'active' : ''}`}
          onClick={() => setActiveTab('risk')}
        >
          <Shield size={16} />
          Risk
        </button>
        <button
          className={`agent-settings__tab ${activeTab === 'execution' ? 'active' : ''}`}
          onClick={() => setActiveTab('execution')}
        >
          <Zap size={16} />
          Execution
        </button>
        <button
          className={`agent-settings__tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
        >
          <Cpu size={16} />
          Features
        </button>
      </div>

      {/* Tab Content */}
      <div className="agent-settings__content">
        {/* Strategy Tab */}
        {activeTab === 'strategy' && (
          <div className="agent-settings__tab-content">
            <Card variant="glass">
              <SettingsSection
                title="Strategy Presets"
                icon={Target}
                description="Quick-apply a predefined signal weight configuration"
              >
                <div className="preset-buttons">
                  {Object.entries(STRATEGY_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      className="preset-button"
                      onClick={() => handleApplyPreset(key)}
                    >
                      <span className="preset-button__name">{preset.name}</span>
                      <span className="preset-button__description">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection
                title="Signal Weights"
                icon={Sliders}
                description="Adjust the importance of each signal type in the overall score"
              >
                <div className="weight-total">
                  <span>Total Weight:</span>
                  <span className={totalWeight > 1.05 || totalWeight < 0.95 ? 'warning' : ''}>
                    {(totalWeight * 100).toFixed(0)}%
                  </span>
                  {(totalWeight > 1.05 || totalWeight < 0.95) && (
                    <span className="weight-warning">
                      <AlertTriangle size={14} />
                      Weights should sum to ~100%
                    </span>
                  )}
                </div>
                <div className="weight-sliders">
                  {Object.keys(SIGNAL_LABELS).map(key => (
                    <WeightSlider
                      key={key}
                      signalKey={key}
                      value={settings[key] || 0}
                      onChange={handleWeightChange}
                    />
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection
                title="Signal Thresholds"
                icon={Target}
                description="Minimum scores required to generate trading signals"
              >
                <div className="threshold-fields">
                  <div className="threshold-field">
                    <div className="threshold-field__header">
                      <span className="threshold-field__label">Minimum Confidence</span>
                      <span className="threshold-field__value">
                        {(settings.min_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.40"
                      max="0.90"
                      step="0.05"
                      value={settings.min_confidence}
                      onChange={(e) => handleChange('min_confidence', parseFloat(e.target.value))}
                    />
                    <span className="threshold-field__hint">
                      Only generate signals with confidence above this level
                    </span>
                  </div>
                  <div className="threshold-field">
                    <div className="threshold-field__header">
                      <span className="threshold-field__label">Minimum Signal Score</span>
                      <span className="threshold-field__value">
                        {(settings.min_signal_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.60"
                      step="0.05"
                      value={settings.min_signal_score}
                      onChange={(e) => handleChange('min_signal_score', parseFloat(e.target.value))}
                    />
                    <span className="threshold-field__hint">
                      Minimum overall score to create a trading signal
                    </span>
                  </div>
                </div>
              </SettingsSection>
            </Card>
          </div>
        )}

        {/* Risk Tab */}
        {activeTab === 'risk' && (
          <div className="agent-settings__tab-content">
            <Card variant="glass">
              <SettingsSection
                title="Position Limits"
                icon={DollarSign}
                description="Control maximum position sizes and exposure"
              >
                <div className="risk-fields">
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Max Position Size</span>
                      <span className="risk-field__value">
                        {(settings.max_position_size * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.25"
                      step="0.01"
                      value={settings.max_position_size}
                      onChange={(e) => handleChange('max_position_size', parseFloat(e.target.value))}
                    />
                    <span className="risk-field__hint">
                      Maximum percentage of portfolio for any single position
                    </span>
                  </div>
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Max Sector Exposure</span>
                      <span className="risk-field__value">
                        {(settings.max_sector_exposure * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.10"
                      max="0.50"
                      step="0.05"
                      value={settings.max_sector_exposure}
                      onChange={(e) => handleChange('max_sector_exposure', parseFloat(e.target.value))}
                    />
                    <span className="risk-field__hint">
                      Maximum exposure to any single sector
                    </span>
                  </div>
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Min Cash Reserve</span>
                      <span className="risk-field__value">
                        {(settings.min_cash_reserve * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.20"
                      step="0.01"
                      value={settings.min_cash_reserve}
                      onChange={(e) => handleChange('min_cash_reserve', parseFloat(e.target.value))}
                    />
                    <span className="risk-field__hint">
                      Always keep this percentage in cash
                    </span>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Risk Controls"
                icon={TrendingDown}
                description="Drawdown and correlation limits"
              >
                <div className="risk-fields">
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Max Drawdown</span>
                      <span className="risk-field__value">
                        {(settings.max_drawdown * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.30"
                      step="0.01"
                      value={settings.max_drawdown}
                      onChange={(e) => handleChange('max_drawdown', parseFloat(e.target.value))}
                    />
                    <span className="risk-field__hint">
                      Pause new positions when drawdown exceeds this
                    </span>
                  </div>
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Max Correlation</span>
                      <span className="risk-field__value">
                        {(settings.max_correlation * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.40"
                      max="0.90"
                      step="0.05"
                      value={settings.max_correlation}
                      onChange={(e) => handleChange('max_correlation', parseFloat(e.target.value))}
                    />
                    <span className="risk-field__hint">
                      Avoid adding positions highly correlated with existing holdings
                    </span>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Volatility Adjustments"
                icon={AlertTriangle}
                description="Automatic position sizing based on market conditions"
              >
                <div className="toggle-fields">
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">VIX-Based Scaling</span>
                      <span className="toggle-field__description">
                        Reduce position sizes when VIX is elevated
                      </span>
                    </div>
                    <Toggle
                      checked={settings.vix_scaling_enabled}
                      onChange={(v) => handleChange('vix_scaling_enabled', v)}
                    />
                  </div>
                  {settings.vix_scaling_enabled && (
                    <div className="risk-field nested">
                      <div className="risk-field__header">
                        <span className="risk-field__label">VIX Threshold</span>
                        <span className="risk-field__value">{settings.vix_threshold}</span>
                      </div>
                      <input
                        type="range"
                        min="15"
                        max="35"
                        step="1"
                        value={settings.vix_threshold}
                        onChange={(e) => handleChange('vix_threshold', parseInt(e.target.value))}
                      />
                      <span className="risk-field__hint">
                        Start reducing positions above this VIX level
                      </span>
                    </div>
                  )}
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Regime-Based Scaling</span>
                      <span className="toggle-field__description">
                        Adjust position sizes based on market regime
                      </span>
                    </div>
                    <Toggle
                      checked={settings.regime_scaling_enabled}
                      onChange={(v) => handleChange('regime_scaling_enabled', v)}
                    />
                  </div>
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Pause in Crisis</span>
                      <span className="toggle-field__description">
                        Stop generating new buy signals during market crises
                      </span>
                    </div>
                    <Toggle
                      checked={settings.pause_in_crisis}
                      onChange={(v) => handleChange('pause_in_crisis', v)}
                    />
                  </div>
                </div>
              </SettingsSection>
            </Card>
          </div>
        )}

        {/* Execution Tab */}
        {activeTab === 'execution' && (
          <div className="agent-settings__tab-content">
            <Card variant="glass">
              <SettingsSection
                title="Auto-Execution"
                icon={Zap}
                description="Configure automatic trade execution behavior"
              >
                <div className="toggle-fields">
                  <div className="toggle-field main-toggle">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Enable Auto-Execution</span>
                      <span className="toggle-field__description">
                        Automatically execute high-confidence signals
                      </span>
                    </div>
                    <Toggle
                      checked={settings.auto_execute}
                      onChange={(v) => handleChange('auto_execute', v)}
                    />
                  </div>
                </div>

                <div className={`execution-settings ${!settings.auto_execute ? 'disabled' : ''}`}>
                  <div className="risk-field">
                    <div className="risk-field__header">
                      <span className="risk-field__label">Execution Threshold</span>
                      <span className="risk-field__value">
                        {(settings.execution_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.60"
                      max="0.95"
                      step="0.05"
                      value={settings.execution_threshold}
                      onChange={(e) => handleChange('execution_threshold', parseFloat(e.target.value))}
                      disabled={!settings.auto_execute}
                    />
                    <span className="risk-field__hint">
                      Auto-execute signals with confidence above this level
                    </span>
                  </div>

                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Require Confirmation</span>
                      <span className="toggle-field__description">
                        Queue trades for manual approval before execution
                      </span>
                    </div>
                    <Toggle
                      checked={settings.require_confirmation}
                      onChange={(v) => handleChange('require_confirmation', v)}
                      disabled={!settings.auto_execute}
                    />
                  </div>

                  <div className="action-toggles">
                    <span className="action-toggles__label">Allowed Actions</span>
                    <div className="action-toggles__buttons">
                      <button
                        className={`action-toggle ${parseAllowedActions(settings.allowed_actions).includes('buy') ? 'active' : ''}`}
                        onClick={() => handleActionToggle('buy')}
                        disabled={!settings.auto_execute}
                        type="button"
                      >
                        Buy
                      </button>
                      <button
                        className={`action-toggle ${parseAllowedActions(settings.allowed_actions).includes('sell') ? 'active' : ''}`}
                        onClick={() => handleActionToggle('sell')}
                        disabled={!settings.auto_execute}
                        type="button"
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                </div>

                <div className="info-box">
                  <Info size={16} />
                  <div>
                    <strong>How Auto-Execution Works</strong>
                    <p>
                      When enabled, signals meeting your thresholds will be automatically queued.
                      If "Require Confirmation" is enabled, you'll approve each trade before execution.
                      Otherwise, trades execute immediately on supported portfolios.
                    </p>
                  </div>
                </div>
              </SettingsSection>
            </Card>
          </div>
        )}

        {/* Features Tab */}
        {activeTab === 'features' && (
          <div className="agent-settings__tab-content">
            <Card variant="glass">
              <SettingsSection
                title="ML Features"
                icon={Brain}
                description="Advanced machine learning and optimization features"
              >
                <div className="toggle-fields">
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Optimized Signal Weights</span>
                      <span className="toggle-field__description">
                        Use walk-forward optimized weights instead of manual settings
                      </span>
                    </div>
                    <Toggle
                      checked={settings.use_optimized_weights}
                      onChange={(v) => handleChange('use_optimized_weights', v)}
                    />
                  </div>
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">HMM Regime Detection</span>
                      <span className="toggle-field__description">
                        Use Hidden Markov Model for market regime classification
                      </span>
                    </div>
                    <Toggle
                      checked={settings.use_hmm_regime}
                      onChange={(v) => handleChange('use_hmm_regime', v)}
                    />
                  </div>
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">ML Signal Combiner</span>
                      <span className="toggle-field__description">
                        Use gradient boosting to combine signals (requires training)
                      </span>
                    </div>
                    <Toggle
                      checked={settings.use_ml_combiner}
                      onChange={(v) => handleChange('use_ml_combiner', v)}
                    />
                  </div>
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Factor Exposure Analysis</span>
                      <span className="toggle-field__description">
                        Include factor loading analysis in signal generation
                      </span>
                    </div>
                    <Toggle
                      checked={settings.use_factor_exposure}
                      onChange={(v) => handleChange('use_factor_exposure', v)}
                    />
                  </div>
                  <div className="toggle-field">
                    <div className="toggle-field__info">
                      <span className="toggle-field__label">Probabilistic DCF</span>
                      <span className="toggle-field__description">
                        Use Monte Carlo DCF valuations for valuation signals
                      </span>
                    </div>
                    <Toggle
                      checked={settings.use_probabilistic_dcf}
                      onChange={(v) => handleChange('use_probabilistic_dcf', v)}
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Universe Selection"
                icon={Target}
                description="Define which stocks the agent can analyze"
              >
                <div className="universe-selector">
                  <div className="universe-options">
                    <label className={`universe-option ${settings.universe_type === 'all' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="universe"
                        value="all"
                        checked={settings.universe_type === 'all'}
                        onChange={() => handleChange('universe_type', 'all')}
                      />
                      <span className="universe-option__content">
                        <strong>All Stocks</strong>
                        <span>Scan entire database</span>
                      </span>
                    </label>
                    <label className={`universe-option ${settings.universe_type === 'watchlist' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="universe"
                        value="watchlist"
                        checked={settings.universe_type === 'watchlist'}
                        onChange={() => handleChange('universe_type', 'watchlist')}
                      />
                      <span className="universe-option__content">
                        <strong>Watchlist Only</strong>
                        <span>Only scan stocks in watchlist</span>
                      </span>
                    </label>
                    <label className={`universe-option ${settings.universe_type === 'sp500' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="universe"
                        value="sp500"
                        checked={settings.universe_type === 'sp500'}
                        onChange={() => handleChange('universe_type', 'sp500')}
                      />
                      <span className="universe-option__content">
                        <strong>S&P 500</strong>
                        <span>Large-cap stocks only</span>
                      </span>
                    </label>
                  </div>
                </div>
              </SettingsSection>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="agent-settings__bottom-actions">
        <Button variant="ghost" onClick={handleReset}>
          <RotateCcw size={16} />
          Reset to Defaults
        </Button>
        <div className="agent-settings__bottom-right">
          {hasChanges && (
            <span className="unsaved-indicator">
              <AlertCircle size={14} />
              Unsaved changes
            </span>
          )}
          <Button
            variant="primary"
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
                <Save size={16} />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}

export default AgentSettingsPage;
