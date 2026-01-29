// components/onboarding/WelcomeFlow.jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WELCOME_STEPS, INTEREST_OPTIONS, RISK_PROFILES, saveOnboardingData } from '../../lib/onboarding/welcomeFlow';
import { getStockSuggestionsFromInterests } from '../../lib/onboarding/sampleData';
import {
  TrendingUp, Crown, DollarSign, Monitor, BarChart2, Globe, Rocket, Calculator,
  Shield, Scale, Zap, Sparkles, CheckCircle
} from '../icons';
import './WelcomeFlow.css';

// Icon mapping for dynamic rendering
const ICON_MAP = {
  TrendingUp,
  Crown,
  DollarSign,
  Monitor,
  BarChart2,
  Globe,
  Rocket,
  Calculator,
  Shield,
  Scale,
  Zap,
};

// Helper to render icon from iconName
const renderIcon = (iconName, size = 24) => {
  const IconComponent = ICON_MAP[iconName];
  return IconComponent ? <IconComponent size={size} /> : null;
};

export const WelcomeFlow = ({ user, onComplete, onSkip }) => {
  const [step, setStep] = useState(WELCOME_STEPS.WELCOME);
  const [data, setData] = useState({
    displayName: user?.name || '',
    interests: [],
    riskProfile: null,
    firstWatchlistName: 'My Watchlist',
    firstStocks: [],
  });

  const updateData = (updates) => setData(prev => ({ ...prev, ...updates }));
  const nextStep = (nextStepName) => setStep(nextStepName);

  const handleComplete = async () => {
    saveOnboardingData(user?.id || 'anonymous', data);
    onComplete(data);
  };

  const getCurrentStepIndex = () => {
    return Object.values(WELCOME_STEPS).indexOf(step);
  };

  const totalSteps = Object.values(WELCOME_STEPS).length - 1; // Exclude COMPLETE

  return (
    <div className="welcome-flow-overlay">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="welcome-flow-card"
        >
          {step === WELCOME_STEPS.WELCOME && (
            <WelcomeStep user={user} onNext={() => nextStep(WELCOME_STEPS.INTERESTS)} />
          )}

          {step === WELCOME_STEPS.INTERESTS && (
            <InterestsStep
              selected={data.interests}
              onSelect={(interests) => updateData({ interests })}
              onNext={() => nextStep(WELCOME_STEPS.RISK_PROFILE)}
              onBack={() => nextStep(WELCOME_STEPS.WELCOME)}
            />
          )}

          {step === WELCOME_STEPS.RISK_PROFILE && (
            <RiskProfileStep
              selected={data.riskProfile}
              onSelect={(riskProfile) => updateData({ riskProfile })}
              onNext={() => nextStep(WELCOME_STEPS.FIRST_WATCHLIST)}
              onBack={() => nextStep(WELCOME_STEPS.INTERESTS)}
            />
          )}

          {step === WELCOME_STEPS.FIRST_WATCHLIST && (
            <FirstWatchlistStep
              data={data}
              onUpdate={updateData}
              onNext={() => nextStep(WELCOME_STEPS.TOUR_OFFER)}
              onBack={() => nextStep(WELCOME_STEPS.RISK_PROFILE)}
            />
          )}

          {step === WELCOME_STEPS.TOUR_OFFER && (
            <TourOfferStep
              onStartTour={() => {
                handleComplete();
              }}
              onSkip={onSkip ? () => {
                saveOnboardingData(user?.id || 'anonymous', { ...data, startTour: false });
                onSkip(data);
              } : handleComplete}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Progress indicator */}
      {step !== WELCOME_STEPS.COMPLETE && (
        <div className="welcome-flow-progress">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`progress-dot ${getCurrentStepIndex() >= i ? 'active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Individual step components
const WelcomeStep = ({ user, onNext }) => (
  <div className="welcome-step">
    <div className="welcome-icon">
      <Sparkles size={48} />
    </div>
    <h1 className="welcome-title">
      Welcome, {user?.name?.split(' ')[0] || 'Investor'}!
    </h1>
    <p className="welcome-description">
      Let's personalize your experience in just a few steps.
      This will help us show you the most relevant insights and features.
    </p>
    <button onClick={onNext} className="btn-primary btn-large">
      Get Started
    </button>
    <p className="welcome-time">Takes less than 2 minutes</p>
  </div>
);

const InterestsStep = ({ selected, onSelect, onNext, onBack }) => (
  <div className="interests-step">
    <h2 className="step-title">What interests you?</h2>
    <p className="step-description">
      Select all that apply. This helps us personalize your feed and recommendations.
    </p>

    <div className="interests-grid">
      {INTEREST_OPTIONS.map((option) => (
        <button
          key={option.id}
          onClick={() => {
            const newSelected = selected.includes(option.id)
              ? selected.filter(id => id !== option.id)
              : [...selected, option.id];
            onSelect(newSelected);
          }}
          className={`interest-card ${selected.includes(option.id) ? 'selected' : ''}`}
        >
          <span className="interest-icon">{renderIcon(option.iconName, 24)}</span>
          <div className="interest-label">{option.label}</div>
          <div className="interest-description">{option.description}</div>
        </button>
      ))}
    </div>

    <div className="step-actions">
      <button onClick={onBack} className="btn-secondary">
        Back
      </button>
      <button
        onClick={onNext}
        disabled={selected.length === 0}
        className="btn-primary"
      >
        Continue
      </button>
    </div>
  </div>
);

const RiskProfileStep = ({ selected, onSelect, onNext, onBack }) => (
  <div className="risk-profile-step">
    <h2 className="step-title">Your risk tolerance?</h2>
    <p className="step-description">
      This helps us tailor portfolio suggestions, alerts, and analysis to match your investment style.
    </p>

    <div className="risk-profiles">
      {RISK_PROFILES.map((profile) => (
        <button
          key={profile.id}
          onClick={() => onSelect(profile.id)}
          className={`risk-profile-card ${selected === profile.id ? 'selected' : ''}`}
        >
          <div className="risk-profile-header">
            <span className="risk-profile-icon">{renderIcon(profile.iconName, 24)}</span>
            <div>
              <div className="risk-profile-label">{profile.label}</div>
              <div className="risk-profile-description">{profile.description}</div>
            </div>
          </div>

          {selected === profile.id && (
            <div className="risk-profile-details">
              <div className="allocation-bar">
                <div
                  className="allocation-segment stocks"
                  style={{ width: `${profile.allocation.stocks}%` }}
                  title={`Stocks ${profile.allocation.stocks}%`}
                />
                <div
                  className="allocation-segment bonds"
                  style={{ width: `${profile.allocation.bonds}%` }}
                  title={`Bonds ${profile.allocation.bonds}%`}
                />
                <div
                  className="allocation-segment cash"
                  style={{ width: `${profile.allocation.cash}%` }}
                  title={`Cash ${profile.allocation.cash}%`}
                />
              </div>
              <div className="allocation-legend">
                <span>Stocks {profile.allocation.stocks}%</span>
                <span>Bonds {profile.allocation.bonds}%</span>
                <span>Cash {profile.allocation.cash}%</span>
              </div>
              <div className="risk-meta">
                <span>Volatility: {profile.volatilityTolerance}</span>
                <span>Time Horizon: {profile.timeHorizon}</span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>

    <div className="step-actions">
      <button onClick={onBack} className="btn-secondary">
        Back
      </button>
      <button
        onClick={onNext}
        disabled={!selected}
        className="btn-primary"
      >
        Continue
      </button>
    </div>
  </div>
);

const FirstWatchlistStep = ({ data, onUpdate, onNext, onBack }) => {
  const suggestedStocks = data.interests.length > 0
    ? getStockSuggestionsFromInterests(data.interests)
    : [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
      ];

  const addStock = (stock) => {
    if (!data.firstStocks.find(s => s.symbol === stock.symbol)) {
      onUpdate({ firstStocks: [...data.firstStocks, stock] });
    }
  };

  const removeStock = (symbol) => {
    onUpdate({ firstStocks: data.firstStocks.filter(s => s.symbol !== symbol) });
  };

  return (
    <div className="watchlist-step">
      <h2 className="step-title">Create your first watchlist</h2>
      <p className="step-description">
        Add a few stocks to get started. You can always add more later or skip for now.
      </p>

      <input
        type="text"
        value={data.firstWatchlistName}
        onChange={(e) => onUpdate({ firstWatchlistName: e.target.value })}
        placeholder="Watchlist name"
        className="watchlist-name-input"
      />

      {data.firstStocks.length > 0 && (
        <div className="selected-stocks">
          {data.firstStocks.map((stock) => (
            <span key={stock.symbol} className="selected-stock-chip">
              {stock.symbol}
              <button
                onClick={() => removeStock(stock.symbol)}
                className="remove-stock"
                aria-label="Remove stock"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="suggested-stocks-section">
        <p className="suggested-label">
          {data.interests.length > 0 ? 'Suggested based on your interests:' : 'Suggested stocks:'}
        </p>
        <div className="suggested-stocks">
          {suggestedStocks.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => addStock(stock)}
              disabled={data.firstStocks.find(s => s.symbol === stock.symbol)}
              className="suggested-stock-btn"
            >
              + {stock.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="step-actions">
        <button onClick={onBack} className="btn-secondary">
          Back
        </button>
        <button onClick={onNext} className="btn-primary">
          {data.firstStocks.length > 0 ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
};

const TourOfferStep = ({ onStartTour, onSkip: onSkipTour }) => (
  <div className="tour-offer-step">
    <div className="celebration-icon">
      <CheckCircle size={48} />
    </div>
    <h2 className="step-title">You're all set!</h2>
    <p className="step-description">
      Would you like a quick tour of the key features?
      It only takes 2 minutes and will help you get the most out of the platform.
    </p>

    <button onClick={onStartTour} className="btn-primary btn-large">
      Yes, show me around
    </button>
    <button onClick={onSkipTour} className="btn-text">
      Skip, I'll explore on my own
    </button>
  </div>
);
