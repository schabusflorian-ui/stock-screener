// context/OnboardingContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isOnboardingComplete, saveOnboardingData, getOnboardingData } from '../lib/onboarding/welcomeFlow';
import { useAuth } from './AuthContext';

const OnboardingContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '';

export function OnboardingProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [showWelcomeFlow, setShowWelcomeFlow] = useState(false);
  const [shouldStartTour, setShouldStartTour] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Sync onboarding preferences with backend when user authenticates
  useEffect(() => {
    if (isAuthenticated && user?.id && user.id !== 'admin' && user.id !== 'legacy') {
      syncOnboardingPreferences();
    }
  }, [isAuthenticated, user?.id]);

  /**
   * Sync onboarding preferences between localStorage and backend
   */
  const syncOnboardingPreferences = async () => {
    if (syncing) return;

    setSyncing(true);
    try {
      // Fetch backend preferences
      const response = await fetch(`${API_BASE}/api/onboarding/preferences`, {
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn('Failed to fetch onboarding preferences from backend');
        setSyncing(false);
        // Check if user needs onboarding
        if (!isOnboardingComplete()) {
          setTimeout(() => setShowWelcomeFlow(true), 500);
        }
        return;
      }

      const data = await response.json();
      const localData = getOnboardingData();

      if (data.hasCompletedOnboarding && data.data) {
        // Backend has preferences
        if (!localData.completed) {
          // Local doesn't have them - sync down
          localStorage.setItem('investment_onboarding_data', JSON.stringify({
            completed: true,
            completedAt: data.data.completedAt,
            data: {
              interests: data.data.interests,
              riskProfile: data.data.riskProfile
            }
          }));
          console.log('Onboarding preferences synced from backend');
        }
        // Both have data - backend is source of truth (already in localStorage)
      } else if (localData.completed) {
        // Local has preferences, backend doesn't - sync up
        await saveOnboardingData(user.id, localData.data);
        console.log('Onboarding preferences synced to backend');
      } else {
        // Neither has preferences - show onboarding
        setTimeout(() => setShowWelcomeFlow(true), 500);
      }

    } catch (error) {
      console.error('Failed to sync onboarding preferences:', error);
      // Fall back to local check
      if (!isOnboardingComplete()) {
        setTimeout(() => setShowWelcomeFlow(true), 500);
      }
    } finally {
      setSyncing(false);
    }
  };

  const completeWelcomeFlow = useCallback((onboardingData) => {
    setShowWelcomeFlow(false);

    // Check if user wants to start the tour
    if (onboardingData.startTour !== false) {
      // Delay tour start to let welcome flow close
      setTimeout(() => {
        setShouldStartTour(true);
      }, 300);
    }
  }, []);

  const skipWelcomeFlow = useCallback(() => {
    saveOnboardingData(user?.id || 'anonymous', { skipped: true });
    setShowWelcomeFlow(false);
  }, [user]);

  const startTour = useCallback((tourId) => {
    setShouldStartTour(tourId);
  }, []);

  const completeTour = useCallback(() => {
    setShouldStartTour(false);
  }, []);

  const value = {
    showWelcomeFlow,
    setShowWelcomeFlow,
    completeWelcomeFlow,
    skipWelcomeFlow,
    shouldStartTour,
    startTour,
    completeTour,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export default OnboardingContext;
