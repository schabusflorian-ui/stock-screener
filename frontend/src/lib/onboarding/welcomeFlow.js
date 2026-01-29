// lib/onboarding/welcomeFlow.js

export const WELCOME_STEPS = {
  WELCOME: 'welcome',
  INTERESTS: 'interests',
  RISK_PROFILE: 'risk_profile',
  FIRST_WATCHLIST: 'first_watchlist',
  TOUR_OFFER: 'tour_offer',
  COMPLETE: 'complete',
};

// Icon names map to Prism icon components
export const INTEREST_OPTIONS = [
  {
    id: 'growth',
    label: 'Growth Stocks',
    iconName: 'TrendingUp',
    description: 'High-growth companies with strong revenue expansion'
  },
  {
    id: 'value',
    label: 'Value Investing',
    iconName: 'Crown',
    description: 'Undervalued opportunities trading below intrinsic value'
  },
  {
    id: 'dividend',
    label: 'Dividends',
    iconName: 'DollarSign',
    description: 'Income-generating stocks with consistent payouts'
  },
  {
    id: 'tech',
    label: 'Technology',
    iconName: 'Monitor',
    description: 'Innovation-focused tech sector investments'
  },
  {
    id: 'etf',
    label: 'ETFs',
    iconName: 'BarChart2',
    description: 'Diversified funds tracking indices or sectors'
  },
  {
    id: 'international',
    label: 'International',
    iconName: 'Globe',
    description: 'Global markets beyond US equities'
  },
  {
    id: 'smallcap',
    label: 'Small Cap',
    iconName: 'Rocket',
    description: 'Smaller companies with higher growth potential'
  },
  {
    id: 'quant',
    label: 'Quantitative',
    iconName: 'Calculator',
    description: 'Data-driven algorithmic investment strategies'
  },
];

export const RISK_PROFILES = [
  {
    id: 'conservative',
    label: 'Conservative',
    iconName: 'Shield',
    description: 'Preserve capital with steady, predictable returns',
    allocation: { stocks: 30, bonds: 50, cash: 20 },
    volatilityTolerance: 'low',
    timeHorizon: '1-3 years',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    iconName: 'Scale',
    description: 'Balance growth and stability for long-term wealth',
    allocation: { stocks: 60, bonds: 30, cash: 10 },
    volatilityTolerance: 'medium',
    timeHorizon: '3-7 years',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    iconName: 'Zap',
    description: 'Maximize growth potential, accept higher volatility',
    allocation: { stocks: 85, bonds: 10, cash: 5 },
    volatilityTolerance: 'high',
    timeHorizon: '7+ years',
  },
];

export const ONBOARDING_STORAGE_KEY = 'investment_onboarding_data';
export const ONBOARDING_COMPLETE_KEY = 'investment_onboarding_complete';

export const saveOnboardingData = async (userId, data) => {
  try {
    const storageData = {
      userId,
      data,
      completedAt: new Date().toISOString(),
    };

    // Save to localStorage (immediate)
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(storageData));
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');

    // Try to save to backend (async, non-blocking)
    if (typeof window !== 'undefined' && window.fetch) {
      try {
        const API_BASE = process.env.REACT_APP_API_URL || '';
        await fetch(`${API_BASE}/api/onboarding/preferences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } catch (backendError) {
        console.warn('Could not sync to backend, localStorage saved:', backendError);
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to save onboarding data:', error);
    return false;
  }
};

export const getOnboardingData = () => {
  try {
    const data = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to get onboarding data:', error);
    return null;
  }
};

export const isOnboardingComplete = () => {
  return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
};

export const resetOnboarding = () => {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
};
