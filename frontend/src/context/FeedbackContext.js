/**
 * Feedback Context
 *
 * Manages feedback collection, prompt timing, and user feedback preferences.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useAnalytics } from './AnalyticsContext';
import api from '../services/api';

const FeedbackContext = createContext(null);

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};

export const FeedbackProvider = ({ children }) => {
  const { user } = useAuth();
  const { getSessionInfo, trackEvent } = useAnalytics();

  const [isEnabled, setIsEnabled] = useState(true);
  const [promptsShownThisSession, setPromptsShownThisSession] = useState(new Set());
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track feedback given per feature in this session
  const feedbackGivenRef = useRef(new Set());

  /**
   * Submit quick feedback (thumbs up/down)
   */
  const submitQuickFeedback = useCallback(async (type, feature, response, contentId = null) => {
    if (!isEnabled) return { success: false, reason: 'disabled' };

    const sessionInfo = getSessionInfo();

    try {
      setIsSubmitting(true);

      const result = await api.post('/feedback/quick', {
        type,
        feature,
        contentId,
        response,
        sessionId: sessionInfo.sessionId,
        page: window.location.pathname
      });

      // Track this feedback was given
      feedbackGivenRef.current.add(`${feature}-${contentId || 'general'}`);

      // Track in analytics
      trackEvent('feedback_submitted', 'feedback', {
        feedbackType: 'quick',
        feature,
        response
      });

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Failed to submit quick feedback:', error);
      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  }, [isEnabled, getSessionInfo, trackEvent]);

  /**
   * Submit detailed feedback
   */
  const submitFeedback = useCallback(async ({
    type,
    category,
    rating,
    message,
    feature,
    metadata = {}
  }) => {
    const sessionInfo = getSessionInfo();

    try {
      setIsSubmitting(true);

      const result = await api.post('/feedback', {
        type,
        category,
        rating,
        message,
        feature,
        page: window.location.pathname,
        sessionId: sessionInfo.sessionId,
        metadata: {
          ...metadata,
          browser: sessionInfo.browser,
          device: sessionInfo.device,
          os: sessionInfo.os
        }
      });

      trackEvent('feedback_submitted', 'feedback', {
        feedbackType: type,
        category,
        rating,
        hasMessage: !!message
      });

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  }, [getSessionInfo, trackEvent]);

  /**
   * Submit support request
   */
  const submitSupportRequest = useCallback(async ({
    requestType,
    subject,
    description,
    email,
    includeDebugInfo = false,
    includeScreenshot = false
  }) => {
    const sessionInfo = getSessionInfo();

    try {
      setIsSubmitting(true);

      const debugInfo = includeDebugInfo ? {
        url: window.location.href,
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        sessionDuration: sessionInfo.sessionDuration,
        localStorage: Object.keys(localStorage).length,
        sessionStorage: Object.keys(sessionStorage).length
      } : null;

      const result = await api.post('/feedback/support', {
        requestType,
        subject,
        description,
        email,
        sessionId: sessionInfo.sessionId,
        page: window.location.pathname,
        browser: sessionInfo.browser,
        device: sessionInfo.device,
        os: sessionInfo.os,
        includeDebugInfo,
        debugInfo,
        includeScreenshot
      });

      trackEvent('support_request_submitted', 'feedback', {
        requestType,
        includeDebugInfo,
        includeScreenshot
      });

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Failed to submit support request:', error);
      return { success: false, error: error.message };
    } finally {
      setIsSubmitting(false);
    }
  }, [getSessionInfo, trackEvent]);

  /**
   * Check if a feedback prompt should be shown
   */
  const shouldShowPrompt = useCallback(async (promptType) => {
    if (!isEnabled) return false;

    // Check if already shown in this session
    if (promptsShownThisSession.has(promptType)) {
      return false;
    }

    const sessionInfo = getSessionInfo();

    try {
      const result = await api.get('/feedback/prompt/should-show', {
        params: {
          promptType,
          sessionId: sessionInfo.sessionId
        }
      });

      return result.data.shouldShow;
    } catch (error) {
      console.error('Failed to check prompt eligibility:', error);
      return false;
    }
  }, [isEnabled, promptsShownThisSession, getSessionInfo]);

  /**
   * Show a feedback prompt
   */
  const showPrompt = useCallback(async (promptType, trigger = null, config = {}) => {
    if (!isEnabled) return;

    const canShow = await shouldShowPrompt(promptType);
    if (!canShow) return;

    const sessionInfo = getSessionInfo();

    // Record that prompt was shown
    try {
      const result = await api.post('/feedback/prompt/shown', {
        promptType,
        trigger,
        sessionId: sessionInfo.sessionId,
        page: window.location.pathname
      });

      setPromptsShownThisSession(prev => new Set([...prev, promptType]));

      setCurrentPrompt({
        id: result.data.id,
        type: promptType,
        trigger,
        ...config
      });

      trackEvent('feedback_prompt_shown', 'feedback', {
        promptType,
        trigger
      });
    } catch (error) {
      console.error('Failed to show prompt:', error);
    }
  }, [isEnabled, shouldShowPrompt, getSessionInfo, trackEvent]);

  /**
   * Dismiss the current prompt
   */
  const dismissPrompt = useCallback(async (reason = 'dismissed') => {
    if (!currentPrompt) return;

    try {
      await api.post('/feedback/prompt/response', {
        promptId: currentPrompt.id,
        response: null,
        dismissed: true
      });

      trackEvent('feedback_prompt_dismissed', 'feedback', {
        promptType: currentPrompt.type,
        reason
      });
    } catch (error) {
      console.error('Failed to record prompt dismissal:', error);
    } finally {
      setCurrentPrompt(null);
    }
  }, [currentPrompt, trackEvent]);

  /**
   * Respond to the current prompt
   */
  const respondToPrompt = useCallback(async (response) => {
    if (!currentPrompt) return;

    try {
      await api.post('/feedback/prompt/response', {
        promptId: currentPrompt.id,
        response: JSON.stringify(response),
        dismissed: false
      });

      trackEvent('feedback_prompt_responded', 'feedback', {
        promptType: currentPrompt.type,
        hasResponse: true
      });
    } catch (error) {
      console.error('Failed to record prompt response:', error);
    } finally {
      setCurrentPrompt(null);
    }
  }, [currentPrompt, trackEvent]);

  /**
   * Check if feedback was already given for a feature in this session
   */
  const hasFeedbackBeenGiven = useCallback((feature, contentId = null) => {
    return feedbackGivenRef.current.has(`${feature}-${contentId || 'general'}`);
  }, []);

  /**
   * Get user's feedback history
   */
  const getFeedbackHistory = useCallback(async () => {
    if (!user) return [];

    try {
      const result = await api.get('/feedback/mine');
      return result.data.data || [];
    } catch (error) {
      console.error('Failed to fetch feedback history:', error);
      return [];
    }
  }, [user]);

  /**
   * Get user's support requests
   */
  const getSupportRequests = useCallback(async () => {
    if (!user) return [];

    try {
      const result = await api.get('/feedback/support/mine');
      return result.data.data || [];
    } catch (error) {
      console.error('Failed to fetch support requests:', error);
      return [];
    }
  }, [user]);

  const value = {
    // Quick feedback
    submitQuickFeedback,
    hasFeedbackBeenGiven,

    // Detailed feedback
    submitFeedback,

    // Support
    submitSupportRequest,
    getSupportRequests,

    // Prompts
    shouldShowPrompt,
    showPrompt,
    dismissPrompt,
    respondToPrompt,
    currentPrompt,

    // History
    getFeedbackHistory,

    // State
    isEnabled,
    setIsEnabled,
    isSubmitting
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  );
};

export default FeedbackContext;
