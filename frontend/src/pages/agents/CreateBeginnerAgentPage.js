// frontend/src/pages/agents/CreateBeginnerAgentPage.js
// Wizard for creating beginner strategy agents

import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Bot,
  Sliders,
  Wallet
} from '../../components/icons';
import { agentsAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import BeginnerStrategyTypeStep from './components/BeginnerStrategyTypeStep';
import DCAConfigStep from './components/DCAConfigStep';
import ValueAveragingConfigStep from './components/ValueAveragingConfigStep';
import DRIPConfigStep from './components/DRIPConfigStep';
import RebalanceConfigStep from './components/RebalanceConfigStep';
import LumpDCAConfigStep from './components/LumpDCAConfigStep';
import BeginnerReviewStep from './components/BeginnerReviewStep';
import './CreateAgentPage.css';
import './components/BeginnerWizard.css';
import { FeatureGate } from '../../components/subscription';

// Beginner wizard steps
const BEGINNER_STEPS = [
  { id: 'basics', label: 'Name', icon: Bot },
  { id: 'strategy', label: 'Strategy', icon: Sliders },
  { id: 'config', label: 'Configure', icon: Sliders },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'review', label: 'Review', icon: Check }
];

// Default configs by strategy type
const DEFAULT_CONFIGS = {
  dca: {
    amount: 500,
    frequency: 'monthly',
    frequency_day: 1,
    target_assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 1.0 }
    ],
    auto_reinvest_dividends: true
  },
  value_averaging: {
    target_portfolio_value: 50000,
    target_growth_rate: 0.10,
    review_frequency: 'monthly',
    min_contribution: 100,
    max_contribution: 2000,
    target_assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 1.0 }
    ]
  },
  drip: {
    reinvest_mode: 'same',
    min_dividend_to_reinvest: 10,
    tracked_holdings: []
  },
  rebalance: {
    target_allocation: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 0.60 },
      { symbol: 'BND', name: 'Vanguard Total Bond', allocation: 0.40 }
    ],
    rebalance_threshold: 0.05,
    rebalance_frequency: 'quarterly'
  },
  lump_dca: {
    total_amount: 50000,
    lump_sum_pct: 0.50,
    dca_frequency: 'monthly',
    dca_months: 6,
    target_assets: [
      { symbol: 'VTI', name: 'Vanguard Total Stock Market', allocation: 1.0 }
    ]
  }
};

function CreateBeginnerAgentPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    // Basics
    name: '',
    description: '',

    // Strategy
    strategy_type: 'dca',

    // Strategy-specific config
    strategy_config: { ...DEFAULT_CONFIGS.dca },

    // Portfolio
    create_portfolio: true,
    portfolio_name: '',
    initial_capital: 10000
  });

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateStrategyConfig = useCallback((newConfig) => {
    setFormData(prev => ({
      ...prev,
      strategy_config: newConfig
    }));
  }, []);

  // When strategy type changes, reset to default config
  const handleStrategyTypeChange = useCallback((strategyType) => {
    setFormData(prev => ({
      ...prev,
      strategy_type: strategyType,
      strategy_config: { ...DEFAULT_CONFIGS[strategyType] }
    }));
  }, []);

  const handleNext = () => {
    if (currentStep < BEGINNER_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const goToStep = (stepId) => {
    const stepIndex = BEGINNER_STEPS.findIndex(s => s.id === stepId);
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // Prepare beginner agent config
      const agentConfig = {
        name: formData.name,
        description: formData.description,
        strategyType: formData.strategy_type,
        config: formData.strategy_config
      };

      // Create the beginner agent
      const response = await agentsAPI.createBeginner(agentConfig);
      const agentId = response.data?.data?.id || response.data?.id;

      // Create portfolio if requested
      if (formData.create_portfolio && agentId) {
        await agentsAPI.createPortfolio(agentId, {
          name: formData.portfolio_name || `${formData.name} Portfolio`,
          mode: 'paper',
          initial_capital: formData.initial_capital
        });
      }

      navigate(`/agents/${agentId}`);
    } catch (err) {
      console.error('Failed to create beginner agent:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (BEGINNER_STEPS[currentStep].id) {
      case 'basics':
        return formData.name.trim().length >= 2;

      case 'strategy':
        return !!formData.strategy_type;

      case 'config':
        const config = formData.strategy_config;
        const strategyType = formData.strategy_type;

        // Validate based on strategy type
        if (strategyType === 'dca' || strategyType === 'value_averaging' || strategyType === 'lump_dca') {
          if (!config.target_assets || config.target_assets.length === 0) return false;
          const totalAlloc = config.target_assets.reduce((sum, a) => sum + (a.allocation || 0), 0);
          if (Math.abs(totalAlloc - 1) >= 0.01) return false;
        }
        if (strategyType === 'rebalance') {
          if (!config.target_allocation || config.target_allocation.length === 0) return false;
          const totalAlloc = config.target_allocation.reduce((sum, a) => sum + (a.allocation || 0), 0);
          if (Math.abs(totalAlloc - 1) >= 0.01) return false;
        }
        if (strategyType === 'drip') {
          if (!config.tracked_holdings || config.tracked_holdings.length === 0) return false;
        }
        return true;

      case 'portfolio':
        if (formData.create_portfolio) {
          return formData.initial_capital >= 100;
        }
        return true;

      case 'review':
        return true;

      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (BEGINNER_STEPS[currentStep].id) {
      case 'basics':
        return (
          <div className="beginner-step">
            <div className="beginner-step__header">
              <h2>Name Your Strategy</h2>
              <p className="beginner-step__subtitle">
                Give your investing strategy a name you'll remember.
              </p>
            </div>

            <div className="config-section">
              <div className="create-agent__form-group">
                <label htmlFor="name">Strategy Name *</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g., My Monthly DCA, Retirement Builder"
                  maxLength={100}
                  className="beginner-name-input"
                />
              </div>

              <div className="create-agent__form-group">
                <label htmlFor="description">Description (optional)</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="What are you saving for? What's your investment goal?"
                  rows={3}
                />
              </div>
            </div>
          </div>
        );

      case 'strategy':
        return (
          <BeginnerStrategyTypeStep
            selectedType={formData.strategy_type}
            onSelect={handleStrategyTypeChange}
          />
        );

      case 'config':
        const configProps = {
          config: formData.strategy_config,
          onConfigChange: updateStrategyConfig
        };

        switch (formData.strategy_type) {
          case 'dca':
            return <DCAConfigStep {...configProps} />;
          case 'value_averaging':
            return <ValueAveragingConfigStep {...configProps} />;
          case 'drip':
            return <DRIPConfigStep {...configProps} />;
          case 'rebalance':
            return <RebalanceConfigStep {...configProps} />;
          case 'lump_dca':
            return <LumpDCAConfigStep {...configProps} />;
          default:
            return <div>Unknown strategy type</div>;
        }

      case 'portfolio':
        return (
          <div className="beginner-step">
            <div className="beginner-step__header">
              <h2>Paper Trading Portfolio</h2>
              <p className="beginner-step__subtitle">
                Practice your strategy with virtual money before investing real funds.
              </p>
            </div>

            <div className="config-section">
              <div className="create-agent__checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.create_portfolio}
                    onChange={(e) => updateField('create_portfolio', e.target.checked)}
                  />
                  <span>Create a paper trading portfolio</span>
                </label>
              </div>

              {formData.create_portfolio && (
                <>
                  <div className="create-agent__form-group">
                    <label>Portfolio Name</label>
                    <input
                      type="text"
                      value={formData.portfolio_name}
                      onChange={(e) => updateField('portfolio_name', e.target.value)}
                      placeholder={`${formData.name || 'Strategy'} Portfolio`}
                    />
                  </div>

                  <div className="create-agent__form-group">
                    <label>Virtual Starting Capital</label>
                    <div className="config-amount-input">
                      <span className="config-amount-prefix">$</span>
                      <input
                        type="number"
                        value={formData.initial_capital}
                        onChange={(e) => updateField('initial_capital', parseFloat(e.target.value) || 0)}
                        min="100"
                        step="1000"
                      />
                    </div>
                    <p className="config-section__hint">
                      This is virtual money for testing your strategy.
                    </p>
                  </div>

                  <div className="config-amount-presets">
                    {[1000, 5000, 10000, 25000, 50000, 100000].map(amount => (
                      <button
                        key={amount}
                        type="button"
                        className={`preset-btn ${formData.initial_capital === amount ? 'active' : ''}`}
                        onClick={() => updateField('initial_capital', amount)}
                      >
                        ${amount >= 1000 ? `${amount / 1000}k` : amount}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="beginner-step__info-box">
              <Wallet size={18} />
              <div>
                <strong>Paper Trading is Safe</strong>
                <p>
                  Paper trading uses simulated money so you can test your strategy
                  without risking real funds. Once you're confident, you can switch
                  to live trading.
                </p>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <BeginnerReviewStep
            agentName={formData.name}
            agentDescription={formData.description}
            strategyType={formData.strategy_type}
            config={formData.strategy_config}
            onEdit={goToStep}
          />
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
      title="Create Simple Strategy"
      description="Set up beginner-friendly investment strategies like DCA and rebalancing"
    >
    <div className="create-agent">
      <div className="create-agent__header">
        <Link to="/agents" className="create-agent__back-link">
          <ArrowLeft size={18} />
          Back to Agents
        </Link>
        <h1>Create Simple Strategy</h1>
        <p className="create-agent__subtitle">
          Set up a beginner-friendly investment strategy in minutes.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="create-agent__progress">
        {BEGINNER_STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                className={`create-agent__progress-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                onClick={() => index < currentStep && setCurrentStep(index)}
                disabled={index > currentStep}
              >
                <div className="create-agent__progress-icon">
                  {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
                </div>
                <span className="create-agent__progress-label">{step.label}</span>
              </button>
              {index < BEGINNER_STEPS.length - 1 && (
                <div className={`create-agent__progress-line ${isCompleted ? 'completed' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <Card className="create-agent__content">
        {error && (
          <div className="create-agent__error">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {renderStepContent()}
      </Card>

      {/* Navigation */}
      <div className="create-agent__navigation">
        <Button
          variant="secondary"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ArrowLeft size={16} />
          Back
        </Button>

        <div className="create-agent__step-indicator">
          Step {currentStep + 1} of {BEGINNER_STEPS.length}
        </div>

        {currentStep < BEGINNER_STEPS.length - 1 ? (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!isStepValid()}
          >
            Next
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || !isStepValid()}
          >
            {submitting ? 'Creating...' : 'Create Strategy'}
            <Check size={16} />
          </Button>
        )}
      </div>
    </div>
    </FeatureGate>
  );
}

export default CreateBeginnerAgentPage;
