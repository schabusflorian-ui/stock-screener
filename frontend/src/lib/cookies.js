/**
 * Cookie Management Utilities
 * Handles cookie operations with compliance features
 */

/**
 * Set a cookie with proper encoding and security flags
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} days - Expiration in days
 * @param {object} options - Additional options
 */
export const setCookie = (name, value, days, options = {}) => {
  let expires = '';

  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = `; expires=${date.toUTCString()}`;
  }

  const {
    path = '/',
    secure = window.location.protocol === 'https:',
    sameSite = 'Lax'
  } = options;

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; path=${path}`;

  if (secure) {
    cookieString += '; Secure';
  }

  if (sameSite) {
    cookieString += `; SameSite=${sameSite}`;
  }

  document.cookie = cookieString;
};

/**
 * Get a cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null if not found
 */
export const getCookie = (name) => {
  const nameEQ = encodeURIComponent(name) + '=';
  const cookies = document.cookie.split(';');

  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i];
    while (cookie.charAt(0) === ' ') {
      cookie = cookie.substring(1, cookie.length);
    }
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
    }
  }

  return null;
};

/**
 * Delete a cookie by name
 * @param {string} name - Cookie name
 * @param {string} path - Cookie path (default: '/')
 */
export const deleteCookie = (name, path = '/') => {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}`;
};

/**
 * Check if a specific cookie consent has been granted
 * @param {string} type - Cookie type ('essential', 'functional', 'analytics')
 * @returns {boolean}
 */
export const hasConsent = (type) => {
  const consent = getCookie('cookie_consent');

  if (!consent) {
    return type === 'essential'; // Essential cookies always allowed
  }

  try {
    const preferences = JSON.parse(consent);
    return preferences[type] === true;
  } catch (e) {
    return false;
  }
};

/**
 * Save cookie consent preferences
 * @param {object} preferences - Consent preferences
 */
export const saveConsent = (preferences) => {
  const consent = {
    essential: true, // Always true
    functional: preferences.functional || false,
    analytics: preferences.analytics || false,
    timestamp: new Date().toISOString()
  };

  setCookie('cookie_consent', JSON.stringify(consent), 365);

  // Initialize or cleanup based on consent
  if (consent.analytics && window.initAnalytics) {
    window.initAnalytics();
  } else if (!consent.analytics && window.disableAnalytics) {
    window.disableAnalytics();
  }

  // Emit custom event for other components to react
  window.dispatchEvent(new CustomEvent('consentUpdated', { detail: consent }));
};

/**
 * Get current consent preferences
 * @returns {object|null} Consent preferences or null if not set
 */
export const getConsent = () => {
  const consent = getCookie('cookie_consent');

  if (!consent) {
    return null;
  }

  try {
    return JSON.parse(consent);
  } catch (e) {
    return null;
  }
};

/**
 * Check if user has made a cookie consent decision
 * @returns {boolean}
 */
export const hasConsentDecision = () => {
  return getCookie('cookie_consent') !== null;
};

/**
 * Clear all non-essential cookies based on consent
 */
export const clearNonEssentialCookies = () => {
  const consent = getConsent();

  if (!consent) return;

  const allCookies = document.cookie.split(';');
  const essentialCookies = ['session_id', 'csrf_token', 'auth_token', 'cookie_consent'];

  allCookies.forEach(cookie => {
    const cookieName = cookie.split('=')[0].trim();

    // Skip essential cookies
    if (essentialCookies.includes(cookieName)) {
      return;
    }

    // Delete functional cookies if not consented
    const functionalCookies = ['theme', 'language', 'layout_preferences', 'last_viewed_stocks', 'chart_preferences', 'watchlist_view'];
    if (!consent.functional && functionalCookies.includes(cookieName)) {
      deleteCookie(cookieName);
    }

    // Delete analytics cookies if not consented
    const analyticsCookies = ['_ga', '_gid', '_gat'];
    if (!consent.analytics && (analyticsCookies.includes(cookieName) || cookieName.startsWith('_ga_'))) {
      deleteCookie(cookieName);
    }
  });
};

/**
 * Local Storage Management (GDPR compliant)
 */

/**
 * Set item in local storage if consent is granted
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @param {string} type - Storage type ('functional' or 'analytics')
 */
export const setLocalStorage = (key, value, type = 'functional') => {
  if (!hasConsent(type) && type !== 'essential') {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to set local storage:', e);
  }
};

/**
 * Get item from local storage
 * @param {string} key - Storage key
 * @returns {any|null}
 */
export const getLocalStorage = (key) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    return null;
  }
};

/**
 * Remove item from local storage
 * @param {string} key - Storage key
 */
export const removeLocalStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Failed to remove local storage:', e);
  }
};

/**
 * Clear all local storage based on consent
 */
export const clearLocalStorageByConsent = () => {
  const consent = getConsent();

  if (!consent) return;

  const keysToCheck = Object.keys(localStorage);

  keysToCheck.forEach(key => {
    // Preserve essential data
    if (key.startsWith('auth_') || key === 'user_id') {
      return;
    }

    // Clear functional data if no consent
    if (!consent.functional && (
      key.includes('preference') ||
      key.includes('theme') ||
      key.includes('layout') ||
      key.includes('cached_')
    )) {
      removeLocalStorage(key);
    }

    // Clear analytics data if no consent
    if (!consent.analytics && key.includes('analytics')) {
      removeLocalStorage(key);
    }
  });
};

/**
 * Initialize cookie management system
 */
export const initCookieManagement = () => {
  // Check for existing consent
  const consent = getConsent();

  if (consent) {
    // Clean up cookies and storage based on consent
    clearNonEssentialCookies();
    clearLocalStorageByConsent();

    // Initialize analytics if consented
    if (consent.analytics && window.initAnalytics) {
      window.initAnalytics();
    }
  }

  // Listen for consent updates
  window.addEventListener('consentUpdated', (event) => {
    clearNonEssentialCookies();
    clearLocalStorageByConsent();
  });
};

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  initCookieManagement();
}
