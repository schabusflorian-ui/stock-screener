// frontend/src/pages/agents/CreateAgentPage.js
// Agent Creation Wizard

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bot,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Sliders,
  Shield,
  Zap,
  Wallet,
  AlertTriangle
} from 'lucide-react';
import { agentsAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import './CreateAgentPage.css';

const STEPS = [
  { id: 'basics', label: 'Basic Info', icon: Bot },
  { id: 'weights', label: 'Signal Weights', icon: Sliders },
  { id: 'risk', label: 'Risk Parameters', icon: Shield },
  { id: 'execution', label: 'Execution', icon: Zap },
  { id: 'review', label: 'Review', icon: Check }
];

const STRATEGY_OPTIONS = [
  {
    id: 'technical',
    name: 'Technical',
    description: 'Focus on price patterns, momentum, and technical indicators',
    color: '#3b82f6'
  },
  {
    id: 'fundamental',
    name: 'Fundamental',
    description: 'Value-oriented analysis of financial statements and earnings',
    color: '#22c55e'
  },
  {
    id: 'sentiment',
    name: 'Sentiment',
    description: 'Track market sentiment, news, and social signals',
    color: '#f59e0b'
  },
  {
    id: 'hybrid',
    name: 'Hybrid',
    description: 'Balanced approach combining all signal types',
    color: '#8b5cf6'
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configure your own signal weights',
    color: '#64748b'
  }
];

const DEFAULT_WEIGHTS = {
  technical_weight: 0.15,
  sentiment_weight: 0.10,
  insider_weight: 0.12,
  fundamental_weight: 0.15,
  alternative_weight: 0.08,
  valuation_weight: 0.15,
  thirteenf_weight: 0.10,
  earnings_weight: 0.08,
  value_quality_weight: 0.07
};

const WEIGHT_LABELS = {
  technical_weight: { label: 'Technical', description: 'RSI, MACD, moving averages' },
  sentiment_weight: { label: 'Sentiment', description: 'News & social media sentiment' },
  insider_weight: { label: 'Insider', description: 'Insider buying/selling activity' },
  fundamental_weight: { label: 'Fundamental', description: 'Quality metrics & financial health' },
  alternative_weight: { label: 'Alternative', description: 'Congressional trades, short interest' },
  valuation_weight: { label: 'Valuation', description: 'DCF, multiples, fair value' },
  thirteenf_weight: { label: '13F Holdings', description: 'Famous investor activity' },
  earnings_weight: { label: 'Earnings', description: 'Earnings momentum & surprises' },
  value_quality_weight: { label: 'Value-Quality', description: 'Piotroski score, magic formula' }
};

const STRATEGY_PRESETS = {
  technical: {
    technical_weight: 0.35,
    sentiment_weight: 0.15,
    fundamental_weight: 0.10,
    valuation_weight: 0.10,
    insider_weight: 0.08,
    alternative_weight: 0.07,
    thirteenf_weight: 0.05,
    earnings_weight: 0.05,
    value_quality_weight: 0.05
  },
  fundamental: {
    fundamental_weight: 0.30,
    valuation_weight: 0.25,
    insider_weight: 0.15,
    earnings_weight: 0.15,
    value_quality_weight: 0.05,
    technical_weight: 0.05,
    sentiment_weight: 0.02,
    alternative_weight: 0.02,
    thirteenf_weight: 0.01
  },
  sentiment: {
    sentiment_weight: 0.35,
    alternative_weight: 0.25,
    technical_weight: 0.20,
    insider_weight: 0.10,
    fundamental_weight: 0.05,
    valuation_weight: 0.02,
    thirteenf_weight: 0.01,
    earnings_weight: 0.01,
    value_quality_weight: 0.01
  },
  hybrid: DEFAULT_WEIGHTS,
  custom: DEFAULT_WEIGHTS
};

function CreateAgentPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    // Basics
    name: '',
    description: '',
    strategy_type: 'hybrid',

    // Weights
    ...DEFAULT_WEIGHTS,

    // Risk
    min_confidence: 0.6,
    min_signal_score: 0.3,
    max_position_size: 0.10,
    max_sector_exposure: 0.30,
    min_cash_reserve: 0.05,
    max_drawdown: 0.20,
    max_correlation: 0.70,

    // Execution
    auto_execute: false,
    execution_threshold: 0.8,
    require_confirmation: true,
    allowed_actions: ['buy', 'sell'],

    // Regime
    regime_scaling_enabled: true,
    vix_scaling_enabled: true,
    vix_threshold: 25,
    pause_in_crisis: true,

    // Feature flags
    use_optimized_weights: true,
    use_hmm_regime: true,
    use_factor_exposure: true,
    use_probabilistic_dcf: true,
    apply_earnings_filter: true,
    earnings_blackout_days: 7,

    // Universe
    universe_type: 'all',
    universe_filter: null,

    // Portfolio
    create_portfolio: false,
    portfolio_name: '',
    portfolio_mode: 'paper',
    initial_capital: 100000
  });

  // Apply preset weights when strategy changes
  useEffect(() => {
    if (formData.strategy_type && STRATEGY_PRESETS[formData.strategy_type]) {
      setFormData(prev => ({
        ...prev,
        ...STRATEGY_PRESETS[formData.strategy_type]
      }));
    }
  }, [formData.strategy_type]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // Prepare the config
      const config = {
        name: formData.name,
        description: formData.description,
        strategy_type: formData.strategy_type,

        // Weights
        technical_weight: formData.technical_weight,
        sentiment_weight: formData.sentiment_weight,
        insider_weight: formData.insider_weight,
        fundamental_weight: formData.fundamental_weight,
        alternative_weight: formData.alternative_weight,
        valuation_weight: formData.valuation_weight,
        thirteenf_weight: formData.thirteenf_weight,
        earnings_weight: formData.earnings_weight,
        value_quality_weight: formData.value_quality_weight,

        // Risk
        min_confidence: formData.min_confidence,
        min_signal_score: formData.min_signal_score,
        max_position_size: formData.max_position_size,
        max_sector_exposure: formData.max_sector_exposure,
        min_cash_reserve: formData.min_cash_reserve,
        max_drawdown: formData.max_drawdown,
        max_correlation: formData.max_correlation,

        // Execution
        auto_execute: formData.auto_execute ? 1 : 0,
        execution_threshold: formData.execution_threshold,
        require_confirmation: formData.require_confirmation ? 1 : 0,
        allowed_actions: JSON.stringify(formData.allowed_actions),

        // Regime
        regime_scaling_enabled: formData.regime_scaling_enabled ? 1 : 0,
        vix_scaling_enabled: formData.vix_scaling_enabled ? 1 : 0,
        vix_threshold: formData.vix_threshold,
        pause_in_crisis: formData.pause_in_crisis ? 1 : 0,

        // Feature flags
        use_optimized_weights: formData.use_optimized_weights ? 1 : 0,
        use_hmm_regime: formData.use_hmm_regime ? 1 : 0,
        use_factor_exposure: formData.use_factor_exposure ? 1 : 0,
        use_probabilistic_dcf: formData.use_probabilistic_dcf ? 1 : 0,
        apply_earnings_filter: formData.apply_earnings_filter ? 1 : 0,
        earnings_blackout_days: formData.earnings_blackout_days,

        // Universe
        universe_type: formData.universe_type
      };

      // Create the agent
      const response = await agentsAPI.create(config);
      const agentId = response.data.data?.id || response.data.id;

      // Create portfolio if requested
      if (formData.create_portfolio) {
        await agentsAPI.createPortfolio(agentId, {
          name: formData.portfolio_name || `${formData.name} Portfolio`,
          mode: formData.portfolio_mode,
          initial_capital: formData.initial_capital
        });
      }

      navigate(`/agents/${agentId}`);
    } catch (err) {
      console.error('Failed to create agent:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (STEPS[currentStep].id) {
      case 'basics':
        return formData.name.trim().length >= 2;
      case 'weights':
        // Weights should sum to approximately 1
        const totalWeight = Object.keys(DEFAULT_WEIGHTS).reduce(
          (sum, key) => sum + (formData[key] || 0), 0
        );
        return Math.abs(totalWeight - 1) < 0.05;
      case 'risk':
        return formData.min_confidence >= 0 && formData.max_position_size > 0;
      case 'execution':
        return formData.allowed_actions.length > 0;
      case 'review':
        return true;
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (STEPS[currentStep].id) {
      case 'basics':
        return (
          <div className="create-agent__step-content">
            <h2>Create Your Trading Agent</h2>
            <p className="create-agent__step-description">
              Give your agent a name and choose its primary strategy focus.
            </p>

            <div className="create-agent__form-group">
              <label htmlFor="name">Agent Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Value Momentum Hybrid"
                maxLength={100}
              />
            </div>

            <div className="create-agent__form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe your agent's strategy and goals..."
                rows={3}
              />
            </div>

            <div className="create-agent__form-group">
              <label>Strategy Type *</label>
              <div className="create-agent__strategy-grid">
                {STRATEGY_OPTIONS.map(strategy => (
                  <button
                    key={strategy.id}
                    type="button"
                    className={`create-agent__strategy-option ${formData.strategy_type === strategy.id ? 'selected' : ''}`}
                    onClick={() => updateField('strategy_type', strategy.id)}
                    style={{ '--strategy-color': strategy.color }}
                  >
                    <span className="create-agent__strategy-name">{strategy.name}</span>
                    <span className="create-agent__strategy-desc">{strategy.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'weights':
        const totalWeight = Object.keys(DEFAULT_WEIGHTS).reduce(
          (sum, key) => sum + (formData[key] || 0), 0
        );
        return (
          <div className="create-agent__step-content">
            <h2>Signal Weights</h2>
            <p className="create-agent__step-description">
              Configure how much weight each signal type has in the final score.
              Weights should sum to 100%.
            </p>

            <div className="create-agent__weight-total">
              <span>Total Weight:</span>
              <span className={Math.abs(totalWeight - 1) < 0.05 ? 'valid' : 'invalid'}>
                {(totalWeight * 100).toFixed(0)}%
              </span>
            </div>

            <div className="create-agent__weights-grid">
              {Object.entries(WEIGHT_LABELS).map(([key, { label, description }]) => (
                <div key={key} className="create-agent__weight-item">
                  <div className="create-agent__weight-header">
                    <label htmlFor={key}>{label}</label>
                    <span className="create-agent__weight-value">
                      {((formData[key] || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    id={key}
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={formData[key] || 0}
                    onChange={(e) => updateField(key, parseFloat(e.target.value))}
                  />
                  <span className="create-agent__weight-desc">{description}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'risk':
        return (
          <div className="create-agent__step-content">
            <h2>Risk Parameters</h2>
            <p className="create-agent__step-description">
              Set limits to control risk exposure and position sizing.
            </p>

            <div className="create-agent__risk-grid">
              <div className="create-agent__form-group">
                <label>Minimum Confidence</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={formData.min_confidence}
                    onChange={(e) => updateField('min_confidence', parseFloat(e.target.value))}
                  />
                  <span>{(formData.min_confidence * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Only act on signals with confidence above this threshold
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Max Position Size</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0.01"
                    max="0.25"
                    step="0.01"
                    value={formData.max_position_size}
                    onChange={(e) => updateField('max_position_size', parseFloat(e.target.value))}
                  />
                  <span>{(formData.max_position_size * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Maximum allocation to any single position
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Max Sector Exposure</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0.15"
                    max="0.50"
                    step="0.05"
                    value={formData.max_sector_exposure}
                    onChange={(e) => updateField('max_sector_exposure', parseFloat(e.target.value))}
                  />
                  <span>{(formData.max_sector_exposure * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Maximum exposure to any single sector
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Min Cash Reserve</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0"
                    max="0.20"
                    step="0.01"
                    value={formData.min_cash_reserve}
                    onChange={(e) => updateField('min_cash_reserve', parseFloat(e.target.value))}
                  />
                  <span>{(formData.min_cash_reserve * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Minimum cash to keep available
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Max Drawdown Limit</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0.05"
                    max="0.50"
                    step="0.05"
                    value={formData.max_drawdown}
                    onChange={(e) => updateField('max_drawdown', parseFloat(e.target.value))}
                  />
                  <span>{(formData.max_drawdown * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Pause trading if drawdown exceeds this
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Max Correlation</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={formData.max_correlation}
                    onChange={(e) => updateField('max_correlation', parseFloat(e.target.value))}
                  />
                  <span>{(formData.max_correlation * 100).toFixed(0)}%</span>
                </div>
                <span className="create-agent__form-hint">
                  Avoid highly correlated positions
                </span>
              </div>
            </div>

            <div className="create-agent__checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.regime_scaling_enabled}
                  onChange={(e) => updateField('regime_scaling_enabled', e.target.checked)}
                />
                <span>Enable regime-based position scaling</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formData.vix_scaling_enabled}
                  onChange={(e) => updateField('vix_scaling_enabled', e.target.checked)}
                />
                <span>Scale positions based on VIX</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formData.pause_in_crisis}
                  onChange={(e) => updateField('pause_in_crisis', e.target.checked)}
                />
                <span>Pause new positions during crisis regime</span>
              </label>
            </div>
          </div>
        );

      case 'execution':
        return (
          <div className="create-agent__step-content">
            <h2>Execution Settings</h2>
            <p className="create-agent__step-description">
              Configure how signals are executed.
            </p>

            <div className="create-agent__execution-options">
              <div className="create-agent__execution-mode">
                <button
                  type="button"
                  className={`create-agent__mode-option ${!formData.auto_execute ? 'selected' : ''}`}
                  onClick={() => updateField('auto_execute', false)}
                >
                  <Shield size={24} />
                  <span className="create-agent__mode-name">Manual</span>
                  <span className="create-agent__mode-desc">
                    Review and approve each signal before execution
                  </span>
                </button>
                <button
                  type="button"
                  className={`create-agent__mode-option ${formData.auto_execute ? 'selected' : ''}`}
                  onClick={() => updateField('auto_execute', true)}
                >
                  <Zap size={24} />
                  <span className="create-agent__mode-name">Semi-Auto</span>
                  <span className="create-agent__mode-desc">
                    Auto-approve signals above confidence threshold
                  </span>
                </button>
              </div>

              {formData.auto_execute && (
                <div className="create-agent__form-group">
                  <label>Auto-Approve Threshold</label>
                  <div className="create-agent__slider-group">
                    <input
                      type="range"
                      min="0.6"
                      max="0.95"
                      step="0.05"
                      value={formData.execution_threshold}
                      onChange={(e) => updateField('execution_threshold', parseFloat(e.target.value))}
                    />
                    <span>{(formData.execution_threshold * 100).toFixed(0)}%</span>
                  </div>
                  <span className="create-agent__form-hint">
                    Auto-execute signals with confidence above this threshold
                  </span>
                </div>
              )}

              <div className="create-agent__form-group">
                <label>Allowed Actions</label>
                <div className="create-agent__checkbox-group horizontal">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.allowed_actions.includes('buy')}
                      onChange={(e) => {
                        const actions = e.target.checked
                          ? [...formData.allowed_actions, 'buy']
                          : formData.allowed_actions.filter(a => a !== 'buy');
                        updateField('allowed_actions', actions);
                      }}
                    />
                    <span>Buy</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.allowed_actions.includes('sell')}
                      onChange={(e) => {
                        const actions = e.target.checked
                          ? [...formData.allowed_actions, 'sell']
                          : formData.allowed_actions.filter(a => a !== 'sell');
                        updateField('allowed_actions', actions);
                      }}
                    />
                    <span>Sell</span>
                  </label>
                </div>
              </div>

              <div className="create-agent__checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.apply_earnings_filter}
                    onChange={(e) => updateField('apply_earnings_filter', e.target.checked)}
                  />
                  <span>Avoid trading during earnings blackout period</span>
                </label>
              </div>

              <h3>Create Initial Portfolio</h3>
              <div className="create-agent__checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.create_portfolio}
                    onChange={(e) => updateField('create_portfolio', e.target.checked)}
                  />
                  <span>Create a portfolio for this agent now</span>
                </label>
              </div>

              {formData.create_portfolio && (
                <div className="create-agent__portfolio-config">
                  <div className="create-agent__form-group">
                    <label>Portfolio Name</label>
                    <input
                      type="text"
                      value={formData.portfolio_name}
                      onChange={(e) => updateField('portfolio_name', e.target.value)}
                      placeholder={`${formData.name || 'Agent'} Portfolio`}
                    />
                  </div>

                  <div className="create-agent__form-group">
                    <label>Trading Mode</label>
                    <div className="create-agent__mode-toggle">
                      <button
                        type="button"
                        className={formData.portfolio_mode === 'paper' ? 'active' : ''}
                        onClick={() => updateField('portfolio_mode', 'paper')}
                      >
                        Paper Trading
                      </button>
                      <button
                        type="button"
                        className={formData.portfolio_mode === 'live' ? 'active' : ''}
                        onClick={() => updateField('portfolio_mode', 'live')}
                      >
                        Live Trading
                      </button>
                    </div>
                  </div>

                  <div className="create-agent__form-group">
                    <label>Initial Capital</label>
                    <div className="create-agent__input-group">
                      <span className="create-agent__input-prefix">$</span>
                      <input
                        type="number"
                        value={formData.initial_capital}
                        onChange={(e) => updateField('initial_capital', parseFloat(e.target.value) || 0)}
                        min="1000"
                        step="1000"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="create-agent__step-content">
            <h2>Review & Create</h2>
            <p className="create-agent__step-description">
              Review your agent configuration before creating.
            </p>

            {error && (
              <div className="create-agent__error">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="create-agent__review-sections">
              <div className="create-agent__review-section">
                <h4>
                  <Bot size={16} />
                  Basic Info
                </h4>
                <dl>
                  <dt>Name</dt>
                  <dd>{formData.name}</dd>
                  <dt>Strategy</dt>
                  <dd>{STRATEGY_OPTIONS.find(s => s.id === formData.strategy_type)?.name}</dd>
                  {formData.description && (
                    <>
                      <dt>Description</dt>
                      <dd>{formData.description}</dd>
                    </>
                  )}
                </dl>
              </div>

              <div className="create-agent__review-section">
                <h4>
                  <Sliders size={16} />
                  Top Signal Weights
                </h4>
                <dl>
                  {Object.entries(WEIGHT_LABELS)
                    .sort((a, b) => (formData[b[0]] || 0) - (formData[a[0]] || 0))
                    .slice(0, 4)
                    .map(([key, { label }]) => (
                      <React.Fragment key={key}>
                        <dt>{label}</dt>
                        <dd>{((formData[key] || 0) * 100).toFixed(0)}%</dd>
                      </React.Fragment>
                    ))}
                </dl>
              </div>

              <div className="create-agent__review-section">
                <h4>
                  <Shield size={16} />
                  Risk Settings
                </h4>
                <dl>
                  <dt>Min Confidence</dt>
                  <dd>{(formData.min_confidence * 100).toFixed(0)}%</dd>
                  <dt>Max Position</dt>
                  <dd>{(formData.max_position_size * 100).toFixed(0)}%</dd>
                  <dt>Max Sector</dt>
                  <dd>{(formData.max_sector_exposure * 100).toFixed(0)}%</dd>
                  <dt>Max Drawdown</dt>
                  <dd>{(formData.max_drawdown * 100).toFixed(0)}%</dd>
                </dl>
              </div>

              <div className="create-agent__review-section">
                <h4>
                  <Zap size={16} />
                  Execution
                </h4>
                <dl>
                  <dt>Mode</dt>
                  <dd>{formData.auto_execute ? 'Semi-Automatic' : 'Manual'}</dd>
                  {formData.auto_execute && (
                    <>
                      <dt>Auto-Approve Above</dt>
                      <dd>{(formData.execution_threshold * 100).toFixed(0)}%</dd>
                    </>
                  )}
                  <dt>Allowed Actions</dt>
                  <dd>{formData.allowed_actions.join(', ')}</dd>
                </dl>
              </div>

              {formData.create_portfolio && (
                <div className="create-agent__review-section">
                  <h4>
                    <Wallet size={16} />
                    Initial Portfolio
                  </h4>
                  <dl>
                    <dt>Name</dt>
                    <dd>{formData.portfolio_name || `${formData.name} Portfolio`}</dd>
                    <dt>Mode</dt>
                    <dd>{formData.portfolio_mode === 'paper' ? 'Paper Trading' : 'Live Trading'}</dd>
                    <dt>Capital</dt>
                    <dd>${formData.initial_capital.toLocaleString()}</dd>
                  </dl>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="create-agent">
      {/* Header */}
      <header className="create-agent__header">
        <Link to="/agents" className="create-agent__back">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1>Create Trading Agent</h1>
          <p>Configure an autonomous AI trading agent</p>
        </div>
      </header>

      {/* Progress */}
      <div className="create-agent__progress">
        {STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          return (
            <div
              key={step.id}
              className={`create-agent__progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <div className="create-agent__progress-icon">
                {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
              </div>
              <span className="create-agent__progress-label">{step.label}</span>
              {index < STEPS.length - 1 && <ChevronRight size={16} className="create-agent__progress-arrow" />}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <Card variant="glass" className="create-agent__content">
        {renderStepContent()}
      </Card>

      {/* Actions */}
      <div className="create-agent__actions">
        {currentStep > 0 && (
          <Button variant="secondary" onClick={handleBack}>
            <ArrowLeft size={16} />
            Back
          </Button>
        )}
        <div className="create-agent__actions-spacer" />
        {currentStep < STEPS.length - 1 ? (
          <Button variant="primary" onClick={handleNext} disabled={!isStepValid()}>
            Next
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !isStepValid()}
          >
            {submitting ? 'Creating...' : 'Create Agent'}
            <Check size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

export default CreateAgentPage;
