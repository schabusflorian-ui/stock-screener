// frontend/src/pages/agents/CreateAgentPage.js
// Enhanced Agent Creation Wizard with Unified Strategy System
// Now supports all 15 signals, universe configuration, regime switching, and backtest preview

import React, { useState, useEffect, useCallback } from 'react';
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
  AlertTriangle,
  Globe,
  Activity,
  BarChart3,
  Layers
} from '../../components/icons';
import { agentsAPI, unifiedStrategyAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import UnifiedSignalWeightsStep from './components/UnifiedSignalWeightsStep';
import UniverseConfigStep from './components/UniverseConfigStep';
import RegimeConfigStep from './components/RegimeConfigStep';
import BacktestPreviewStep from './components/BacktestPreviewStep';
import './CreateAgentPage.css';
import './components/UnifiedSteps.css';
import { FeatureGate } from '../../components/subscription';

// Enhanced 9-step wizard
const STEPS = [
  { id: 'basics', label: 'Basic Info', icon: Bot },
  { id: 'mode', label: 'Strategy Mode', icon: Layers },
  { id: 'weights', label: 'Signal Weights', icon: Sliders },
  { id: 'universe', label: 'Universe', icon: Globe },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'regime', label: 'Regime', icon: Activity },
  { id: 'backtest', label: 'Preview', icon: BarChart3 },
  { id: 'execution', label: 'Execution', icon: Zap },
  { id: 'review', label: 'Review', icon: Check }
];

const STRATEGY_MODE_OPTIONS = [
  {
    id: 'single',
    name: 'Single Strategy',
    description: 'One unified strategy with configurable signal weights',
    icon: Sliders,
    color: '#2563EB'
  },
  {
    id: 'multi',
    name: 'Multi-Strategy',
    description: 'Combine multiple strategies with regime-based switching',
    icon: Layers,
    color: '#7C3AED',
    comingSoon: false  // Now enabled!
  }
];

// Default signal weights for all 15 signals
const DEFAULT_SIGNAL_WEIGHTS = {
  technical: 0.10,
  fundamental: 0.10,
  sentiment: 0.08,
  insider: 0.10,
  congressional: 0.05,
  valuation: 0.10,
  thirteenF: 0.08,
  earningsMomentum: 0.06,
  valueQuality: 0.08,
  momentum: 0.08,
  analyst: 0.06,
  alternative: 0.04,
  contrarian: 0.02,
  magicFormula: 0.03,
  factorScores: 0.02
};

// Default universe configuration
const DEFAULT_UNIVERSE_CONFIG = {
  minMarketCap: 1000000000, // $1B
  maxMarketCap: null,
  sectors: [], // All sectors
  excludedSectors: [],
  minAvgVolume: 500000,
  minPrice: 5,
  excludePennyStocks: true,
  excludeADRs: true,
  customSymbols: []
};

// Default regime exposures
const DEFAULT_REGIME_EXPOSURES = {
  CRISIS: 0.25,
  HIGH_VOL: 0.5,
  NORMAL: 0.75,
  LOW_VOL: 1.0
};

function CreateAgentPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state with all unified strategy fields
  const [formData, setFormData] = useState({
    // Basics
    name: '',
    description: '',
    strategy_mode: 'single',

    // Signal Weights (all 15)
    signal_weights: { ...DEFAULT_SIGNAL_WEIGHTS },

    // Universe Config
    universe_config: { ...DEFAULT_UNIVERSE_CONFIG },

    // Risk Parameters
    min_confidence: 0.6,
    min_signal_score: 0.3,
    max_position_size: 0.10,
    max_sector_exposure: 0.30,
    min_cash_reserve: 0.05,
    max_drawdown: 0.20,
    max_correlation: 0.70,
    max_positions: 20,
    min_positions: 5,

    // Regime Configuration
    regime_scaling_enabled: true,
    use_hmm_regime: true,
    regime_exposures: { ...DEFAULT_REGIME_EXPOSURES },
    pause_in_crisis: true,
    tighten_stops_in_crisis: true,
    prefer_defensive_in_crisis: true,
    vix_crisis_threshold: 35,
    vix_high_threshold: 25,
    vix_low_threshold: 15,

    // Feature Flags
    use_optimized_weights: true,
    use_factor_exposure: true,
    use_probabilistic_dcf: true,
    use_signal_decorrelation: true,

    // Execution
    auto_execute: false,
    execution_threshold: 0.8,
    require_confirmation: true,
    allowed_actions: ['buy', 'sell'],

    // Earnings
    apply_earnings_filter: true,
    earnings_blackout_days: 7,

    // Portfolio
    create_portfolio: false,
    portfolio_name: '',
    portfolio_mode: 'paper',
    initial_capital: 100000
  });

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Updated to receive full weights object from UnifiedSignalWeightsStep
  const updateSignalWeights = useCallback((newWeights) => {
    setFormData(prev => ({
      ...prev,
      signal_weights: newWeights
    }));
  }, []);

  // Updated to receive full config object from UniverseConfigStep
  const updateUniverseConfig = useCallback((newConfig) => {
    setFormData(prev => ({
      ...prev,
      universe_config: newConfig
    }));
  }, []);

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

      // First create the unified strategy
      const strategyConfig = {
        name: formData.name,
        description: formData.description,
        strategy_type: formData.strategy_mode,
        signal_weights: formData.signal_weights,
        risk_params: {
          minConfidence: formData.min_confidence,
          minSignalScore: formData.min_signal_score,
          maxPositionSize: formData.max_position_size,
          maxSectorConcentration: formData.max_sector_exposure,
          minCashReserve: formData.min_cash_reserve,
          maxDrawdown: formData.max_drawdown,
          maxCorrelation: formData.max_correlation,
          maxPositions: formData.max_positions,
          minPositions: formData.min_positions
        },
        universe_config: formData.universe_config,
        regime_config: {
          enabled: formData.regime_scaling_enabled,
          useHMM: formData.use_hmm_regime,
          exposures: formData.regime_exposures,
          pauseInCrisis: formData.pause_in_crisis,
          tightenStopsInCrisis: formData.tighten_stops_in_crisis,
          preferDefensiveInCrisis: formData.prefer_defensive_in_crisis,
          vixCrisisThreshold: formData.vix_crisis_threshold,
          vixHighThreshold: formData.vix_high_threshold,
          vixLowThreshold: formData.vix_low_threshold
        },
        feature_flags: {
          useOptimizedWeights: formData.use_optimized_weights,
          useFactorExposure: formData.use_factor_exposure,
          useProbabilisticDCF: formData.use_probabilistic_dcf,
          useSignalDecorrelation: formData.use_signal_decorrelation
        },
        min_confidence: formData.min_confidence,
        min_signal_score: formData.min_signal_score
      };

      // Create unified strategy
      let strategyId = null;
      try {
        const strategyResponse = await unifiedStrategyAPI.create(strategyConfig);
        strategyId = strategyResponse.data?.strategy?.id;
      } catch (strategyErr) {
        console.warn('Could not create unified strategy, continuing with legacy mode:', strategyErr);
      }

      // Prepare agent config
      const agentConfig = {
        name: formData.name,
        description: formData.description,
        strategy_type: formData.strategy_mode,

        // Map signal weights to legacy format for backward compatibility
        technical_weight: formData.signal_weights.technical,
        sentiment_weight: formData.signal_weights.sentiment,
        insider_weight: formData.signal_weights.insider,
        fundamental_weight: formData.signal_weights.fundamental,
        alternative_weight: formData.signal_weights.alternative,
        valuation_weight: formData.signal_weights.valuation,
        thirteenf_weight: formData.signal_weights.thirteenF,
        earnings_weight: formData.signal_weights.earningsMomentum,
        value_quality_weight: formData.signal_weights.valueQuality,

        // Risk params
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
        vix_scaling_enabled: formData.regime_scaling_enabled ? 1 : 0,
        vix_threshold: formData.vix_high_threshold,
        pause_in_crisis: formData.pause_in_crisis ? 1 : 0,

        // Feature flags
        use_optimized_weights: formData.use_optimized_weights ? 1 : 0,
        use_hmm_regime: formData.use_hmm_regime ? 1 : 0,
        use_factor_exposure: formData.use_factor_exposure ? 1 : 0,
        use_probabilistic_dcf: formData.use_probabilistic_dcf ? 1 : 0,
        apply_earnings_filter: formData.apply_earnings_filter ? 1 : 0,
        earnings_blackout_days: formData.earnings_blackout_days,

        // Link to unified strategy if created
        unified_strategy_id: strategyId
      };

      // Create the agent
      const response = await agentsAPI.create(agentConfig);
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

  // Run backtest callback
  const handleRunBacktest = async (config) => {
    // This would call the unified strategy API for backtest preview
    // For now, return mock results (handled in component)
    return null;
  };

  const isStepValid = () => {
    switch (STEPS[currentStep].id) {
      case 'basics':
        return formData.name.trim().length >= 2;
      case 'mode':
        return formData.strategy_mode === 'single' || formData.strategy_mode === 'multi';
      case 'weights':
        const totalWeight = Object.values(formData.signal_weights).reduce((sum, w) => sum + w, 0);
        return Math.abs(totalWeight - 1) < 0.05;
      case 'universe':
        return true; // Universe config is always valid (has defaults)
      case 'risk':
        return formData.min_confidence >= 0 && formData.max_position_size > 0;
      case 'regime':
        return true; // Regime config is always valid
      case 'backtest':
        return true; // Backtest is optional
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
              Give your agent a name and description.
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
          </div>
        );

      case 'mode':
        return (
          <div className="create-agent__step-content">
            <h2>Strategy Mode</h2>
            <p className="create-agent__step-description">
              Choose between a single unified strategy or a multi-strategy with regime switching.
            </p>

            <div className="create-agent__mode-grid">
              {STRATEGY_MODE_OPTIONS.map(mode => {
                const ModeIcon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`create-agent__mode-card ${formData.strategy_mode === mode.id ? 'selected' : ''} ${mode.comingSoon ? 'coming-soon' : ''}`}
                    onClick={() => !mode.comingSoon && updateField('strategy_mode', mode.id)}
                    disabled={mode.comingSoon}
                    style={{ '--mode-color': mode.color }}
                  >
                    <ModeIcon size={28} />
                    <span className="mode-name">{mode.name}</span>
                    <span className="mode-desc">{mode.description}</span>
                    {mode.comingSoon && <span className="coming-soon-badge">Coming Soon</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'weights':
        return (
          <UnifiedSignalWeightsStep
            weights={formData.signal_weights}
            onWeightChange={updateSignalWeights}
            onPresetApply={updateSignalWeights}
          />
        );

      case 'universe':
        return (
          <UniverseConfigStep
            config={formData.universe_config}
            onConfigChange={updateUniverseConfig}
          />
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

              <div className="create-agent__form-group">
                <label>Max Positions</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={formData.max_positions}
                    onChange={(e) => updateField('max_positions', parseInt(e.target.value))}
                  />
                  <span>{formData.max_positions}</span>
                </div>
                <span className="create-agent__form-hint">
                  Maximum number of positions in portfolio
                </span>
              </div>

              <div className="create-agent__form-group">
                <label>Min Positions</label>
                <div className="create-agent__slider-group">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={formData.min_positions}
                    onChange={(e) => updateField('min_positions', parseInt(e.target.value))}
                  />
                  <span>{formData.min_positions}</span>
                </div>
                <span className="create-agent__form-hint">
                  Minimum diversification target
                </span>
              </div>
            </div>
          </div>
        );

      case 'regime':
        return (
          <RegimeConfigStep
            formData={formData}
            updateField={updateField}
          />
        );

      case 'backtest':
        return (
          <BacktestPreviewStep
            formData={formData}
            updateField={updateField}
            onRunBacktest={handleRunBacktest}
          />
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
        const topSignals = Object.entries(formData.signal_weights)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4);

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
                  <dt>Mode</dt>
                  <dd>{formData.strategy_mode === 'single' ? 'Single Strategy' : 'Multi-Strategy'}</dd>
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
                  {topSignals.map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{key.charAt(0).toUpperCase() + key.slice(1)}</dt>
                      <dd>{(value * 100).toFixed(0)}%</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>

              <div className="create-agent__review-section">
                <h4>
                  <Globe size={16} />
                  Universe
                </h4>
                <dl>
                  <dt>Min Market Cap</dt>
                  <dd>${(formData.universe_config.minMarketCap / 1e9).toFixed(1)}B</dd>
                  <dt>Min Volume</dt>
                  <dd>{(formData.universe_config.minAvgVolume / 1000).toFixed(0)}K</dd>
                  <dt>Min Price</dt>
                  <dd>${formData.universe_config.minPrice}</dd>
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
                  <Activity size={16} />
                  Regime
                </h4>
                <dl>
                  <dt>Detection</dt>
                  <dd>{formData.regime_scaling_enabled ? (formData.use_hmm_regime ? 'HMM Model' : 'VIX-Based') : 'Disabled'}</dd>
                  {formData.regime_scaling_enabled && (
                    <>
                      <dt>Crisis Exposure</dt>
                      <dd>{(formData.regime_exposures.CRISIS * 100).toFixed(0)}%</dd>
                      <dt>Pause in Crisis</dt>
                      <dd>{formData.pause_in_crisis ? 'Yes' : 'No'}</dd>
                    </>
                  )}
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
    <FeatureGate
      feature="paper_trading_bots"
      showPreview={true}
      previewHeight="500px"
      title="Create AI Trading Agent"
      description="Build and configure autonomous trading agents with advanced strategies"
    >
    <div className="create-agent">
      {/* Header */}
      <header className="create-agent__header">
        <Link to="/agents" className="create-agent__back">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1>Create Trading Agent</h1>
          <p>Configure an autonomous AI trading agent with unified strategy</p>
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
              onClick={() => isCompleted && setCurrentStep(index)}
              style={{ cursor: isCompleted ? 'pointer' : 'default' }}
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
    </FeatureGate>
  );
}

export default CreateAgentPage;
