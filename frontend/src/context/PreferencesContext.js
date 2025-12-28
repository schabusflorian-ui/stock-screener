// frontend/src/context/PreferencesContext.js
// Global preferences context - provides user settings to all components

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/api';

const PreferencesContext = createContext(null);

// Supported options
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  { code: 'GBP', symbol: '\u00a3', name: 'British Pound' },
  { code: 'JPY', symbol: '\u00a5', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CNY', symbol: '\u00a5', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '\u20b9', name: 'Indian Rupee' },
  { code: 'KRW', symbol: '\u20a9', name: 'South Korean Won' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'z\u0142', name: 'Polish Zloty' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
];

export const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '12/28/2025' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '28/12/2025' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2025-12-28' },
  { value: 'MMM D, YYYY', label: 'MMM D, YYYY', example: 'Dec 28, 2025' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY', example: '28 Dec 2025' },
  { value: 'MMMM D, YYYY', label: 'MMMM D, YYYY', example: 'December 28, 2025' },
  { value: 'D MMMM YYYY', label: 'D MMMM YYYY', example: '28 December 2025' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY', example: '28.12.2025' },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD', example: '2025/12/28' },
];

export const NUMBER_FORMATS = [
  { value: 'en-US', label: '1,234.56 (US)', locale: 'en-US' },
  { value: 'en-GB', label: '1,234.56 (UK)', locale: 'en-GB' },
  { value: 'de-DE', label: '1.234,56 (German)', locale: 'de-DE' },
  { value: 'de-CH', label: "1'234.56 (Swiss)", locale: 'de-CH' },
  { value: 'fr-FR', label: '1 234,56 (French)', locale: 'fr-FR' },
  { value: 'es-ES', label: '1.234,56 (Spanish)', locale: 'es-ES' },
  { value: 'it-IT', label: '1.234,56 (Italian)', locale: 'it-IT' },
  { value: 'pt-BR', label: '1.234,56 (Brazilian)', locale: 'pt-BR' },
  { value: 'ja-JP', label: '1,234.56 (Japanese)', locale: 'ja-JP' },
  { value: 'zh-CN', label: '1,234.56 (Chinese)', locale: 'zh-CN' },
  { value: 'ko-KR', label: '1,234.56 (Korean)', locale: 'ko-KR' },
  { value: 'en-IN', label: '1,23,456.78 (Indian)', locale: 'en-IN' },
  { value: 'ar-SA', label: '\u0661\u066c\u0662\u0663\u0664\u066b\u0665\u0666 (Arabic)', locale: 'ar-SA' },
  { value: 'he-IL', label: '1,234.56 (Hebrew)', locale: 'he-IL' },
  { value: 'ru-RU', label: '1 234,56 (Russian)', locale: 'ru-RU' },
  { value: 'pl-PL', label: '1 234,56 (Polish)', locale: 'pl-PL' },
  { value: 'nl-NL', label: '1.234,56 (Dutch)', locale: 'nl-NL' },
  { value: 'sv-SE', label: '1 234,56 (Swedish)', locale: 'sv-SE' },
];

export const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

// Default preferences
const DEFAULT_PREFERENCES = {
  theme: 'dark',
  currency: 'USD',
  dateFormat: 'MMM D, YYYY',
  numberFormat: 'en-US',
  showPercentages: true,
  compactNumbers: true,
  autoRefreshInterval: 0,
  notificationsEnabled: false,
  defaultBenchmark: 'SPY',
  defaultTimeHorizon: 10,
};

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [exchangeRates, setExchangeRates] = useState({ USD: 1 });
  const [loading, setLoading] = useState(true);
  const [ratesLoading, setRatesLoading] = useState(false);

  // Fetch preferences from API
  const fetchPreferences = useCallback(async () => {
    try {
      const response = await settingsAPI.getPreferences();
      const prefs = response.data.data || response.data.preferences || {};
      setPreferences(prev => ({ ...prev, ...prefs }));
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch exchange rates
  const fetchExchangeRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const response = await settingsAPI.getExchangeRates();
      if (response.data.rates) {
        setExchangeRates(response.data.rates);
      }
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
      // Use fallback rates if API fails
      setExchangeRates({
        USD: 1, EUR: 0.92, GBP: 0.79, JPY: 157.5, CHF: 0.90,
        CAD: 1.44, AUD: 1.62, CNY: 7.30, INR: 85.5, KRW: 1480,
        BRL: 6.20, MXN: 17.2, SGD: 1.36, HKD: 7.82, SEK: 11.0,
        NOK: 11.3, DKK: 7.05, PLN: 4.02, ZAR: 18.5, NZD: 1.78,
      });
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
    fetchExchangeRates();
    // Refresh rates every hour
    const interval = setInterval(fetchExchangeRates, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPreferences, fetchExchangeRates]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    let effectiveTheme = preferences.theme;

    if (effectiveTheme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.setAttribute('data-theme', effectiveTheme);

    // Listen for system theme changes
    if (preferences.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e) => {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [preferences.theme]);

  // Update preferences
  const updatePreferences = useCallback(async (newPrefs) => {
    const merged = { ...preferences, ...newPrefs };
    setPreferences(merged);
    try {
      await settingsAPI.updatePreferences(merged);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    }
  }, [preferences]);

  // Convert amount to user's currency
  const convertCurrency = useCallback((amount, fromCurrency = 'USD') => {
    if (!amount || fromCurrency === preferences.currency) return amount;
    const fromRate = exchangeRates[fromCurrency] || 1;
    const toRate = exchangeRates[preferences.currency] || 1;
    return (amount / fromRate) * toRate;
  }, [exchangeRates, preferences.currency]);

  // Get currency symbol
  const getCurrencySymbol = useCallback((code = preferences.currency) => {
    const currency = CURRENCIES.find(c => c.code === code);
    return currency?.symbol || '$';
  }, [preferences.currency]);

  const value = {
    preferences,
    updatePreferences,
    loading,
    exchangeRates,
    ratesLoading,
    convertCurrency,
    getCurrencySymbol,
    refreshRates: fetchExchangeRates,
    refreshPreferences: fetchPreferences,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

export default PreferencesContext;
