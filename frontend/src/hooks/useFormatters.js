// frontend/src/hooks/useFormatters.js
// Hook that provides preference-aware formatting functions

import { useMemo } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import { createFormatter } from '../utils/formatters';

/**
 * Hook that returns formatting functions bound to user preferences
 *
 * Usage:
 *   const fmt = useFormatters();
 *   fmt.currency(1234.56)  // "$1.2K" or "1.234,56 €" depending on prefs
 *   fmt.date(new Date())   // "Dec 28, 2025" or "28/12/2025" depending on prefs
 *   fmt.percent(0.05)      // "5.0%"
 */
export function useFormatters() {
  const { preferences, convertCurrency, getCurrencySymbol } = usePreferences();

  const formatter = useMemo(() => {
    const base = createFormatter(preferences);

    // Add currency conversion support
    return {
      ...base,
      // Convert and format currency
      convertedCurrency: (value, fromCurrency = 'USD', opts = {}) => {
        const converted = convertCurrency(value, fromCurrency);
        return base.currency(converted, opts);
      },
      // Get current currency symbol
      currencySymbol: () => getCurrencySymbol(),
      // Raw conversion without formatting
      convert: convertCurrency,
    };
  }, [preferences, convertCurrency, getCurrencySymbol]);

  return formatter;
}

export default useFormatters;
