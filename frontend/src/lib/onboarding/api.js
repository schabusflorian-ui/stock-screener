// lib/onboarding/api.js
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Save onboarding preferences to backend
 */
export const saveOnboardingToBackend = async (onboardingData) => {
  try {
    const response = await axios.post(
      `${API_BASE}/api/onboarding/preferences`,
      onboardingData,
      { withCredentials: true }
    );

    return response.data;
  } catch (error) {
    console.error('Failed to save onboarding to backend:', error);
    // Don't throw - localStorage backup is fine
    return { success: false, error: error.message };
  }
};

/**
 * Fetch onboarding preferences from backend
 */
export const fetchOnboardingPreferences = async () => {
  try {
    const response = await axios.get(
      `${API_BASE}/api/onboarding/preferences`,
      { withCredentials: true }
    );

    return response.data;
  } catch (error) {
    console.error('Failed to fetch onboarding preferences:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get personalized stock recommendations
 */
export const fetchPersonalizedRecommendations = async () => {
  try {
    const response = await axios.get(
      `${API_BASE}/api/onboarding/recommendations`,
      { withCredentials: true }
    );

    return response.data;
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    return { success: false, error: error.message };
  }
};
