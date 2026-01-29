// components/onboarding/OnboardingManager.jsx
import { useEffect } from 'react';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { WelcomeFlow } from './WelcomeFlow';
import { useTour } from '../../hooks/useTour';

/**
 * OnboardingManager handles the orchestration of onboarding flows
 * including welcome flow and feature tours
 */
export const OnboardingManager = () => {
  const { user } = useAuth();
  const { showWelcomeFlow, completeWelcomeFlow, shouldStartTour, completeTour } = useOnboarding();
  const { startTour } = useTour('main');

  // Start tour when shouldStartTour is true
  useEffect(() => {
    if (shouldStartTour) {
      // Small delay to ensure welcome flow has closed
      setTimeout(() => {
        startTour();
        completeTour();
      }, 500);
    }
  }, [shouldStartTour, startTour, completeTour]);

  if (!showWelcomeFlow) {
    return null;
  }

  const handleComplete = (onboardingData) => {
    // User wants to start the tour
    completeWelcomeFlow({ ...onboardingData, startTour: true });
  };

  const handleSkip = (onboardingData) => {
    // User skipped the tour
    completeWelcomeFlow({ ...onboardingData, startTour: false });
  };

  return (
    <WelcomeFlow
      user={user}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
};
