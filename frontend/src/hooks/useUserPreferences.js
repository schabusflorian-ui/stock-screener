// hooks/useUserPreferences.js
import { useState, useEffect } from 'react';
import { getOnboardingData } from '../lib/onboarding/welcomeFlow';

/**
 * Hook to access user's onboarding preferences throughout the app
 * This makes onboarding selections visible and usable in the system
 */
export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreferences = () => {
      const onboardingData = getOnboardingData();

      if (onboardingData) {
        setPreferences({
          interests: onboardingData.data?.interests || [],
          riskProfile: onboardingData.data?.riskProfile || null,
          watchlistStocks: onboardingData.data?.firstStocks || [],
          completedAt: onboardingData.completedAt,
        });
      }

      setLoading(false);
    };

    loadPreferences();
  }, []);

  // Helper functions to use preferences
  const hasInterest = (interestId) => {
    return preferences?.interests?.includes(interestId) || false;
  };

  const isRiskProfile = (profileId) => {
    return preferences?.riskProfile === profileId;
  };

  const getRiskLevel = () => {
    if (!preferences?.riskProfile) return null;

    const riskLevels = {
      conservative: { level: 'low', score: 1 },
      moderate: { level: 'medium', score: 2 },
      aggressive: { level: 'high', score: 3 },
    };

    return riskLevels[preferences.riskProfile] || null;
  };

  return {
    preferences,
    loading,
    hasInterest,
    isRiskProfile,
    getRiskLevel,
    // Flag indicating if user has completed onboarding
    hasCompletedOnboarding: !!preferences,
  };
};

/**
 * Hook to get personalized content based on user preferences
 */
export const usePersonalizedContent = () => {
  const { preferences, hasInterest } = useUserPreferences();

  const getRecommendedStocks = () => {
    // Return stocks matching user's interests
    if (!preferences?.interests?.length) {
      return ['AAPL', 'MSFT', 'GOOGL', 'AMZN']; // Default suggestions
    }

    const stocksByInterest = {
      growth: ['NVDA', 'TSLA', 'META', 'AMZN'],
      value: ['BRK.B', 'JPM', 'BAC', 'WFC'],
      dividend: ['JNJ', 'PG', 'KO', 'PEP'],
      tech: ['AAPL', 'MSFT', 'GOOGL', 'NVDA'],
      etf: ['SPY', 'VOO', 'QQQ', 'VTI'],
      international: ['VXUS', 'EEM', 'VEA'],
      smallcap: ['IWM', 'VB', 'SCHA'],
      quant: ['AAPL', 'MSFT', 'GOOGL'],
    };

    const recommended = new Set();
    preferences.interests.forEach(interest => {
      stocksByInterest[interest]?.forEach(stock => recommended.add(stock));
    });

    return Array.from(recommended).slice(0, 6);
  };

  const shouldShowRiskWarning = (volatility) => {
    const riskLevel = preferences?.riskProfile;

    if (!riskLevel) return false;

    // Show warning if stock volatility doesn't match risk profile
    if (riskLevel === 'conservative' && volatility === 'high') return true;
    if (riskLevel === 'aggressive' && volatility === 'low') return false;

    return false;
  };

  const getPersonalizedGreeting = () => {
    const interests = preferences?.interests || [];
    const risk = preferences?.riskProfile;

    if (interests.includes('growth') && risk === 'aggressive') {
      return 'Looking for high-growth opportunities?';
    }
    if (interests.includes('dividend') && risk === 'conservative') {
      return 'Here are steady income generators for you';
    }
    if (interests.includes('value')) {
      return 'Undervalued gems matching your criteria';
    }

    return 'Personalized recommendations for you';
  };

  return {
    getRecommendedStocks,
    shouldShowRiskWarning,
    getPersonalizedGreeting,
    hasInterest,
  };
};
