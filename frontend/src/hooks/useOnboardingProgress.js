// hooks/useOnboardingProgress.js
import { useState, useEffect } from 'react';

const ONBOARDING_TASKS_KEY = 'onboarding_completed_tasks';
const ONBOARDING_DISMISSED_KEY = 'onboarding_progress_dismissed';

export const ONBOARDING_TASKS = [
  { id: 'profile', label: 'Complete your profile', link: '/settings/profile' },
  { id: 'watchlist', label: 'Add 3 stocks to watchlist', link: '/watchlist' },
  { id: 'portfolio', label: 'Create a portfolio', link: '/portfolios' },
  { id: 'alert', label: 'Set your first alert', link: '/alerts' },
  { id: 'ai_query', label: 'Ask the AI a question', link: '/' },
];

export const useOnboardingProgress = () => {
  const [completedTasks, setCompletedTasks] = useState([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Load completed tasks from localStorage
    const stored = localStorage.getItem(ONBOARDING_TASKS_KEY);
    if (stored) {
      try {
        setCompletedTasks(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse onboarding tasks:', error);
      }
    }

    // Check if dismissed
    const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY);
    if (dismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const markTaskComplete = (taskId) => {
    if (!completedTasks.includes(taskId)) {
      const updated = [...completedTasks, taskId];
      setCompletedTasks(updated);
      localStorage.setItem(ONBOARDING_TASKS_KEY, JSON.stringify(updated));
    }
  };

  const dismissOnboarding = () => {
    setIsVisible(false);
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
  };

  const resetOnboarding = () => {
    setCompletedTasks([]);
    setIsVisible(true);
    localStorage.removeItem(ONBOARDING_TASKS_KEY);
    localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
  };

  const progress = (completedTasks.length / ONBOARDING_TASKS.length) * 100;
  const allComplete = completedTasks.length === ONBOARDING_TASKS.length;

  return {
    completedTasks,
    markTaskComplete,
    dismissOnboarding,
    resetOnboarding,
    isVisible: isVisible && !allComplete,
    progress,
    allComplete,
  };
};
