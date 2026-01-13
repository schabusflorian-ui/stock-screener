/**
 * Analytics Context
 *
 * Provides privacy-respecting analytics tracking throughout the application.
 * Respects user consent preferences and provides easy-to-use tracking hooks.
 */

import React, { createContext, useContext, useEffect, useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import api from '../services/api';
import { hasConsent, getConsent } from '../lib/cookies';

// Generate a unique session ID
const generateSessionId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
};

// Get or create session ID from sessionStorage
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// Get device type
const getDeviceType = () => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

// Get browser info
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Other';
};

// Get OS info
const getOSInfo = () => {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  return 'Other';
};

const AnalyticsContext = createContext(null);

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};

export const AnalyticsProvider = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const sessionStartTime = useRef(Date.now());
  const eventQueue = useRef([]);
  const flushTimeout = useRef(null);
  const [isEnabled, setIsEnabled] = useState(true);

  // Session info
  const sessionId = useRef(getSessionId());
  const deviceType = useRef(getDeviceType());
  const browser = useRef(getBrowserInfo());
  const os = useRef(getOSInfo());

  // Check if analytics is enabled based on consent
  useEffect(() => {
    const checkConsent = () => {
      const consent = getConsent();
      const analyticsAllowed = consent?.analytics === true;
      setIsEnabled(analyticsAllowed);
    };

    checkConsent();

    // Listen for consent updates
    const handleConsentUpdate = () => {
      checkConsent();
    };

    window.addEventListener('consentUpdated', handleConsentUpdate);
    return () => window.removeEventListener('consentUpdated', handleConsentUpdate);
  }, []);

  // Start session on mount
  useEffect(() => {
    if (!isEnabled) return;

    const startSession = async () => {
      try {
        await api.post('/analytics/session/start', {
          sessionId: sessionId.current,
          device: deviceType.current,
          browser: browser.current,
          os: os.current,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          landingPage: location.pathname,
          referrer: document.referrer || null,
          utmSource: new URLSearchParams(location.search).get('utm_source'),
          utmMedium: new URLSearchParams(location.search).get('utm_medium'),
          utmCampaign: new URLSearchParams(location.search).get('utm_campaign')
        });
      } catch (error) {
        console.debug('Failed to start analytics session:', error);
      }
    };

    startSession();

    // End session on page unload
    const endSession = () => {
      const duration = Math.floor((Date.now() - sessionStartTime.current) / 1000);
      // Use sendBeacon for reliable delivery on page unload
      const data = JSON.stringify({
        sessionId: sessionId.current,
        duration,
        pageViews: parseInt(sessionStorage.getItem('page_view_count') || '0'),
        eventsCount: parseInt(sessionStorage.getItem('events_count') || '0')
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/session/end', data);
      }
    };

    window.addEventListener('beforeunload', endSession);
    return () => window.removeEventListener('beforeunload', endSession);
  }, [isEnabled, location.pathname, location.search]);

  // Track page views automatically
  useEffect(() => {
    if (!isEnabled) return;

    const pageViewCount = parseInt(sessionStorage.getItem('page_view_count') || '0') + 1;
    sessionStorage.setItem('page_view_count', pageViewCount.toString());

    trackEvent('page_view', 'navigation', {
      page: location.pathname,
      referrer: document.referrer,
      pageViewNumber: pageViewCount
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isEnabled]);

  // Flush event queue periodically or when it gets large
  const flushEvents = useCallback(async () => {
    if (eventQueue.current.length === 0) return;

    const events = [...eventQueue.current];
    eventQueue.current = [];

    try {
      await api.post('/analytics/track/batch', { events });
    } catch (error) {
      console.debug('Failed to flush analytics events:', error);
      // Re-add events to queue on failure (up to a limit)
      if (eventQueue.current.length < 50) {
        eventQueue.current = [...events, ...eventQueue.current];
      }
    }
  }, []);

  // Set up periodic flush
  useEffect(() => {
    const interval = setInterval(flushEvents, 30000); // Flush every 30 seconds
    return () => clearInterval(interval);
  }, [flushEvents]);

  /**
   * Track an analytics event
   *
   * @param {string} event - Event name (e.g., 'analysis_completed')
   * @param {string} category - Event category (e.g., 'feature', 'navigation')
   * @param {object} properties - Additional event properties
   */
  const trackEvent = useCallback((event, category, properties = {}) => {
    if (!isEnabled) return;

    const eventsCount = parseInt(sessionStorage.getItem('events_count') || '0') + 1;
    sessionStorage.setItem('events_count', eventsCount.toString());

    const eventData = {
      event,
      category,
      properties,
      sessionId: sessionId.current,
      page: location.pathname,
      device: deviceType.current,
      browser: browser.current,
      sessionDuration: Math.floor((Date.now() - sessionStartTime.current) / 1000)
    };

    eventQueue.current.push(eventData);

    // Flush if queue is getting large
    if (eventQueue.current.length >= 10) {
      if (flushTimeout.current) {
        clearTimeout(flushTimeout.current);
      }
      flushTimeout.current = setTimeout(flushEvents, 1000);
    }
  }, [isEnabled, location.pathname, flushEvents]);

  /**
   * Track a feature usage event
   */
  const trackFeature = useCallback((featureName, action = 'used', properties = {}) => {
    trackEvent(`feature_${action}`, 'feature', {
      feature: featureName,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track feature start (for measuring completion)
   */
  const trackFeatureStart = useCallback((featureName, properties = {}) => {
    trackEvent('feature_started', 'feature', {
      feature: featureName,
      startTime: Date.now(),
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track feature completion
   */
  const trackFeatureComplete = useCallback((featureName, properties = {}) => {
    trackEvent('feature_completed', 'feature', {
      feature: featureName,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track feature abandonment
   */
  const trackFeatureAbandoned = useCallback((featureName, step, properties = {}) => {
    trackEvent('feature_abandoned', 'feature', {
      feature: featureName,
      step,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track an error
   */
  const trackError = useCallback((errorType, errorMessage, properties = {}) => {
    trackEvent('error_encountered', 'error', {
      errorType,
      errorMessage,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track a click/interaction
   */
  const trackClick = useCallback((elementName, properties = {}) => {
    trackEvent('element_clicked', 'interaction', {
      element: elementName,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Track search
   */
  const trackSearch = useCallback((query, resultCount, properties = {}) => {
    trackEvent('search_performed', 'search', {
      query,
      resultCount,
      ...properties
    });
  }, [trackEvent]);

  /**
   * Get current session ID (for feedback/support)
   */
  const getSessionInfo = useCallback(() => ({
    sessionId: sessionId.current,
    device: deviceType.current,
    browser: browser.current,
    os: os.current,
    sessionDuration: Math.floor((Date.now() - sessionStartTime.current) / 1000)
  }), []);

  /**
   * Enable or disable analytics
   */
  const setAnalyticsEnabled = useCallback((enabled) => {
    setIsEnabled(enabled);
    if (!enabled) {
      // Clear queued events
      eventQueue.current = [];
    }
  }, []);

  const value = {
    // Core tracking
    trackEvent,
    trackFeature,
    trackFeatureStart,
    trackFeatureComplete,
    trackFeatureAbandoned,
    trackError,
    trackClick,
    trackSearch,

    // Session info
    getSessionInfo,
    sessionId: sessionId.current,

    // State
    isEnabled,
    setAnalyticsEnabled
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export default AnalyticsContext;
