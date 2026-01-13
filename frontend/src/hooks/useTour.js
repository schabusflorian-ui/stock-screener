// hooks/useTour.js
import { useCallback, useEffect } from 'react';
import { createTour, TOURS, markTourComplete, hasCompletedTour as checkTourComplete, resetTour as resetTourStorage } from '../lib/tours/tourDriver';

export const useTour = (tourId, autoStart = false, delay = 1000) => {
  const hasCompletedTour = checkTourComplete(tourId);

  const startTour = useCallback(() => {
    const tourSteps = TOURS[tourId];
    if (!tourSteps) {
      console.warn(`Tour "${tourId}" not found`);
      return;
    }

    // Check if all tour elements exist
    const allElementsExist = tourSteps.every(step => {
      if (!step.element) return true; // Skip steps without elements
      return document.querySelector(step.element) !== null;
    });

    if (!allElementsExist) {
      console.warn(`Not all elements for tour "${tourId}" exist yet`);
      return;
    }

    const driverObj = createTour(tourSteps, {
      onDestroyed: () => {
        markTourComplete(tourId);
      },
      onDestroyStarted: () => {
        if (driverObj.hasNextStep()) {
          // User closed early, still mark as complete to avoid annoying them
          markTourComplete(tourId);
        }
      },
    });

    driverObj.drive();
  }, [tourId]);

  const resetTour = useCallback(() => {
    resetTourStorage(tourId);
  }, [tourId]);

  // Auto-start tour for new users
  useEffect(() => {
    if (autoStart && !hasCompletedTour) {
      const timer = setTimeout(() => {
        startTour();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [autoStart, hasCompletedTour, startTour, delay]);

  return {
    startTour,
    hasCompletedTour,
    resetTour,
  };
};
