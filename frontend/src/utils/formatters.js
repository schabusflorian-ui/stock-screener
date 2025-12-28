/**
 * Formatters Utility
 *
 * Centralized formatting functions that respect user preferences.
 * Use useFormatters() hook for preference-aware formatting in components.
 */

import { CURRENCIES } from '../context/PreferencesContext';

// Date formatting constants
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format date according to specified format string
 * Supports: YYYY, YY, MMMM, MMM, MM, DD, D
 */
export const formatDate = (date, { format = 'MMM D, YYYY' } = {}) => {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  const pad = (n) => n.toString().padStart(2, '0');

  // Handle legacy format options
  if (format === 'short') {
    return `${MONTH_ABBREVS[month]} ${day}`;
  }
  if (format === 'medium') {
    return `${MONTH_ABBREVS[month]} ${day}, ${year}`;
  }
  if (format === 'long') {
    return `${MONTH_NAMES[month]} ${day}, ${year}`;
  }
  if (format === 'iso') {
    return d.toISOString().split('T')[0];
  }

  return format
    .replace('YYYY', year)
    .replace('YY', year.toString().slice(-2))
    .replace('MMMM', MONTH_NAMES[month])
    .replace('MMM', MONTH_ABBREVS[month])
    .replace('MM', pad(month + 1))
    .replace('DD', pad(day))
    .replace('D', day.toString());
};

/**
 * Format currency values with locale support
 */
export const formatCurrency = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const {
    currency = 'USD',
    locale = 'en-US',
    compact = true,
    decimals = 1,
    showSign = false,
  } = options;

  const num = Number(value);
  const absValue = Math.abs(num);
  const currencyInfo = CURRENCIES?.find(c => c.code === currency) || { symbol: '$' };
  const sign = showSign && num > 0 ? '+' : '';

  if (compact && absValue >= 1000) {
    let suffix = '';
    let divisor = 1;
    if (absValue >= 1e12) { suffix = 'T'; divisor = 1e12; }
    else if (absValue >= 1e9) { suffix = 'B'; divisor = 1e9; }
    else if (absValue >= 1e6) { suffix = 'M'; divisor = 1e6; }
    else if (absValue >= 1e3) { suffix = 'K'; divisor = 1e3; }

    const divided = num / divisor;
    try {
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      }).format(divided);
      return `${sign}${currencyInfo.symbol}${formatted}${suffix}`;
    } catch {
      return `${sign}${currencyInfo.symbol}${divided.toFixed(decimals)}${suffix}`;
    }
  }

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
    return showSign && num > 0 ? '+' + formatted : formatted;
  } catch {
    return `${sign}${currencyInfo.symbol}${num.toFixed(decimals)}`;
  }
};

/**
 * Format percentage values
 */
export const formatPercent = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const {
    locale = 'en-US',
    decimals = 1,
    showSign = false,
    multiply = false, // If true, multiply by 100
  } = options;

  let num = Number(value);
  if (multiply) num = num * 100;

  const sign = showSign ? (num >= 0 ? '+' : '') : '';

  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
    return `${sign}${formatted}%`;
  } catch {
    return `${sign}${num.toFixed(decimals)}%`;
  }
};

/**
 * Format large numbers with locale support
 */
export const formatNumber = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const {
    locale = 'en-US',
    compact = true,
    decimals = 1,
    showSign = false,
  } = options;

  const num = Number(value);
  const absValue = Math.abs(num);
  const sign = showSign && num > 0 ? '+' : '';

  if (compact && absValue >= 1000) {
    let suffix = '';
    let divisor = 1;
    if (absValue >= 1e12) { suffix = 'T'; divisor = 1e12; }
    else if (absValue >= 1e9) { suffix = 'B'; divisor = 1e9; }
    else if (absValue >= 1e6) { suffix = 'M'; divisor = 1e6; }
    else if (absValue >= 1e3) { suffix = 'K'; divisor = 1e3; }

    const divided = num / divisor;
    try {
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      }).format(divided);
      return `${sign}${formatted}${suffix}`;
    } catch {
      return `${sign}${divided.toFixed(decimals)}${suffix}`;
    }
  }

  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(num);
    return `${sign}${formatted}`;
  } catch {
    return `${sign}${num.toFixed(decimals)}`;
  }
};

/**
 * Format price values
 */
export const formatPrice = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  const { currency = 'USD', locale = 'en-US', decimals = 2 } = options;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    const currencyInfo = CURRENCIES?.find(c => c.code === currency) || { symbol: '$' };
    return `${currencyInfo.symbol}${Number(value).toFixed(decimals)}`;
  }
};

/**
 * Format ratio values (P/E, etc.)
 */
export const formatRatio = (value, { decimals = 2, suffix = 'x', locale = 'en-US' } = {}) => {
  if (value === null || value === undefined || isNaN(value)) return '-';

  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
    return `${formatted}${suffix}`;
  } catch {
    return `${Number(value).toFixed(decimals)}${suffix}`;
  }
};

/**
 * Format volume values
 */
export const formatVolume = (value, options = {}) => {
  if (!value || isNaN(value)) return '-';
  return formatNumber(value, { ...options, compact: true, decimals: 1 });
};

/**
 * Format relative time (e.g., "2 hours ago")
 */
export const formatRelativeTime = (date) => {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  return formatDate(d, { format: 'MMM D, YYYY' });
};

/**
 * Format market cap tier
 */
export const formatMarketCapTier = (marketCap) => {
  if (!marketCap || isNaN(marketCap)) return '-';

  if (marketCap >= 200e9) return 'Mega Cap';
  if (marketCap >= 10e9) return 'Large Cap';
  if (marketCap >= 2e9) return 'Mid Cap';
  if (marketCap >= 300e6) return 'Small Cap';
  return 'Micro Cap';
};

/**
 * Format change with color class
 */
export const formatChange = (value, options = {}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return { value: '-', text: '-', class: 'neutral', className: 'neutral' };
  }

  const {
    type = 'percent',
    locale = 'en-US',
    currency = 'USD',
    decimals = 2,
    compact = false,
  } = options;

  const num = Number(value);
  let text;

  switch (type) {
    case 'currency':
      text = formatCurrency(num, { locale, currency, decimals, showSign: true, compact });
      break;
    case 'number':
      text = formatNumber(num, { locale, decimals, showSign: true, compact });
      break;
    case 'percent':
    default:
      text = formatPercent(num, { locale, decimals, showSign: true });
  }

  const colorClass = num > 0 ? 'positive' : num < 0 ? 'negative' : 'neutral';

  return { value: text, text, class: colorClass, className: colorClass };
};

/**
 * Create a formatter factory bound to user preferences
 * Use this with useFormatters() hook in components
 */
export function createFormatter(preferences = {}) {
  const locale = preferences.numberFormat || 'en-US';
  const currency = preferences.currency || 'USD';
  const dateFormat = preferences.dateFormat || 'MMM D, YYYY';
  const compact = preferences.compactNumbers !== false;

  return {
    date: (value, format) => formatDate(value, { format: format || dateFormat }),
    number: (value, opts = {}) => formatNumber(value, { locale, compact, ...opts }),
    currency: (value, opts = {}) => formatCurrency(value, { locale, currency, compact, ...opts }),
    price: (value, opts = {}) => formatPrice(value, { locale, currency, ...opts }),
    percent: (value, opts = {}) => formatPercent(value, { locale, ...opts }),
    ratio: (value, opts = {}) => formatRatio(value, { locale, ...opts }),
    volume: (value, opts = {}) => formatVolume(value, { locale, ...opts }),
    change: (value, opts = {}) => formatChange(value, { locale, currency, compact, ...opts }),
    relativeTime: formatRelativeTime,
    marketCapTier: formatMarketCapTier,
  };
}

const formatters = {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatPrice,
  formatRatio,
  formatVolume,
  formatDate,
  formatRelativeTime,
  formatMarketCapTier,
  formatChange,
  createFormatter,
};

export default formatters;
