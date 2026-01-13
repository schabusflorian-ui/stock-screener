// src/services/indexMappingService.js
// Maps companies to their home market index based on country

/**
 * Country to home index mapping
 * Each country maps to its primary stock market index
 */
const COUNTRY_TO_INDEX = {
  // United States
  'US': { code: 'SPX', etf: 'SPY', name: 'S&P 500', flag: '🇺🇸' },

  // United Kingdom
  'GB': { code: 'FTSE', etf: 'ISF.L', name: 'FTSE 100', flag: '🇬🇧' },

  // Germany
  'DE': { code: 'DAX', etf: 'EXS1.DE', name: 'DAX 40', flag: '🇩🇪' },

  // France
  'FR': { code: 'CAC', etf: 'CAC.PA', name: 'CAC 40', flag: '🇫🇷' },

  // Netherlands (use US-listed EWN as IAEX.AS has issues)
  'NL': { code: 'AEX', etf: 'EWN', name: 'AEX', flag: '🇳🇱' },

  // Switzerland
  'CH': { code: 'SMI', etf: 'CSSMI.SW', name: 'SMI', flag: '🇨🇭' },

  // Spain
  'ES': { code: 'IBEX', etf: 'LYXIB.MC', name: 'IBEX 35', flag: '🇪🇸' },

  // Italy
  'IT': { code: 'FTSEMIB', etf: 'IMIB.MI', name: 'FTSE MIB', flag: '🇮🇹' },

  // Sweden (use US-listed EWD as local ETFs unavailable)
  'SE': { code: 'OMX30', etf: 'EWD', name: 'OMX Stockholm 30', flag: '🇸🇪' },

  // Denmark (use US-listed EDEN as local ETFs unavailable)
  'DK': { code: 'OMXC25', etf: 'EDEN', name: 'OMX Copenhagen 25', flag: '🇩🇰' },

  // Norway
  'NO': { code: 'OBX', etf: 'OBX.OL', name: 'OBX', flag: '🇳🇴' },

  // Austria (use US-listed EWO as local ETFs unavailable)
  'AT': { code: 'ATX', etf: 'EWO', name: 'ATX', flag: '🇦🇹' },

  // Belgium (use US-listed EWK as local ETFs unavailable)
  'BE': { code: 'BEL20', etf: 'EWK', name: 'BEL 20', flag: '🇧🇪' },

  // Poland
  'PL': { code: 'WIG20', etf: 'WIG20.WA', name: 'WIG 20', flag: '🇵🇱' },

  // Ireland
  'IE': { code: 'ISEQ', etf: 'ISEQ.IR', name: 'ISEQ', flag: '🇮🇪' },

  // Finland (use US-listed EFNL)
  'FI': { code: 'OMXH25', etf: 'EFNL', name: 'OMX Helsinki 25', flag: '🇫🇮' },

  // Portugal (use US-listed PGAL)
  'PT': { code: 'PSI20', etf: 'PGAL', name: 'PSI 20', flag: '🇵🇹' },

  // Greece (use US-listed GREK)
  'GR': { code: 'ATHEX', etf: 'GREK', name: 'Athens General', flag: '🇬🇷' },

  // Japan
  'JP': { code: 'N225', etf: 'EWJ', name: 'Nikkei 225', flag: '🇯🇵' },

  // China
  'CN': { code: 'SSE', etf: 'FXI', name: 'Shanghai Composite', flag: '🇨🇳' },

  // Hong Kong
  'HK': { code: 'HSI', etf: 'EWH', name: 'Hang Seng', flag: '🇭🇰' },

  // Australia
  'AU': { code: 'ASX200', etf: 'EWA', name: 'ASX 200', flag: '🇦🇺' },

  // Canada
  'CA': { code: 'TSX', etf: 'EWC', name: 'S&P/TSX', flag: '🇨🇦' },

  // Brazil
  'BR': { code: 'IBOV', etf: 'EWZ', name: 'Bovespa', flag: '🇧🇷' },

  // India
  'IN': { code: 'NIFTY', etf: 'INDA', name: 'Nifty 50', flag: '🇮🇳' },

  // South Korea
  'KR': { code: 'KOSPI', etf: 'EWY', name: 'KOSPI', flag: '🇰🇷' },

  // Singapore
  'SG': { code: 'STI', etf: 'EWS', name: 'Straits Times', flag: '🇸🇬' },

  // South Africa
  'ZA': { code: 'JSE', etf: 'EZA', name: 'JSE All Share', flag: '🇿🇦' },

  // Mexico
  'MX': { code: 'IPC', etf: 'EWW', name: 'IPC', flag: '🇲🇽' },

  // New Zealand
  'NZ': { code: 'NZX50', etf: 'ENZL', name: 'NZX 50', flag: '🇳🇿' },
};

// Fallback for Eurozone countries without specific index
const EUROZONE_FALLBACK = { code: 'SX5E', etf: 'FEZ', name: 'Euro Stoxx 50', flag: '🇪🇺' };

// Default fallback (US)
const DEFAULT_INDEX = COUNTRY_TO_INDEX['US'];

/**
 * All available indices for selection UI
 */
const ALL_INDICES = {
  // Major US Indices
  'SPX': { code: 'SPX', etf: 'SPY', name: 'S&P 500', region: 'US', flag: '🇺🇸' },
  'DOW': { code: 'DOW', etf: 'DIA', name: 'Dow Jones', region: 'US', flag: '🇺🇸' },
  'NASDAQ': { code: 'NASDAQ', etf: 'QQQ', name: 'Nasdaq 100', region: 'US', flag: '🇺🇸' },
  'RUT': { code: 'RUT', etf: 'IWM', name: 'Russell 2000', region: 'US', flag: '🇺🇸' },

  // Major European Indices
  'FTSE': { code: 'FTSE', etf: 'ISF.L', name: 'FTSE 100', region: 'Europe', flag: '🇬🇧' },
  'DAX': { code: 'DAX', etf: 'EXS1.DE', name: 'DAX 40', region: 'Europe', flag: '🇩🇪' },
  'CAC': { code: 'CAC', etf: 'CAC.PA', name: 'CAC 40', region: 'Europe', flag: '🇫🇷' },
  'SX5E': { code: 'SX5E', etf: 'FEZ', name: 'Euro Stoxx 50', region: 'Europe', flag: '🇪🇺' },
  'AEX': { code: 'AEX', etf: 'AEX.AS', name: 'AEX', region: 'Europe', flag: '🇳🇱' },
  'SMI': { code: 'SMI', etf: 'CSSMI.SW', name: 'SMI', region: 'Europe', flag: '🇨🇭' },
  'IBEX': { code: 'IBEX', etf: 'LYXIB.MC', name: 'IBEX 35', region: 'Europe', flag: '🇪🇸' },
  'FTSEMIB': { code: 'FTSEMIB', etf: 'IMIB.MI', name: 'FTSE MIB', region: 'Europe', flag: '🇮🇹' },
  'OMX30': { code: 'OMX30', etf: 'XACT.ST', name: 'OMX Stockholm 30', region: 'Europe', flag: '🇸🇪' },
  'ATX': { code: 'ATX', etf: 'ATX.VI', name: 'ATX', region: 'Europe', flag: '🇦🇹' },
};

/**
 * Indices grouped by region for UI display
 */
const INDICES_BY_REGION = {
  'US': ['SPX', 'DOW', 'NASDAQ', 'RUT'],
  'Europe': ['FTSE', 'DAX', 'CAC', 'SX5E', 'AEX', 'SMI', 'IBEX', 'FTSEMIB', 'OMX30', 'ATX'],
};

/**
 * Get the home index for a company based on its country
 * @param {string} countryCode - ISO 2-letter country code (e.g., 'DE', 'GB', 'US')
 * @returns {Object} Index info { code, etf, name, flag }
 */
function getHomeIndex(countryCode) {
  if (!countryCode) {
    return DEFAULT_INDEX;
  }

  const country = countryCode.toUpperCase();

  // Direct match
  if (COUNTRY_TO_INDEX[country]) {
    return COUNTRY_TO_INDEX[country];
  }

  // Check if it's a Eurozone country without specific index
  const eurozoneCountries = ['CY', 'EE', 'LV', 'LT', 'LU', 'MT', 'SK', 'SI'];
  if (eurozoneCountries.includes(country)) {
    return EUROZONE_FALLBACK;
  }

  // Default to US
  return DEFAULT_INDEX;
}

/**
 * Check if a company is from the US
 * @param {string} countryCode - ISO 2-letter country code
 * @returns {boolean}
 */
function isUSCompany(countryCode) {
  return countryCode?.toUpperCase() === 'US';
}

/**
 * Get all available indices
 * @returns {Object} All indices keyed by code
 */
function getAllIndices() {
  return ALL_INDICES;
}

/**
 * Get indices grouped by region
 * @returns {Object} Indices grouped by region
 */
function getIndicesByRegion() {
  return INDICES_BY_REGION;
}

/**
 * Get index info by code
 * @param {string} indexCode - Index code (e.g., 'DAX', 'FTSE')
 * @returns {Object|null} Index info or null if not found
 */
function getIndexByCode(indexCode) {
  return ALL_INDICES[indexCode?.toUpperCase()] || null;
}

/**
 * Get the global benchmark (SPY)
 * @returns {Object} SPY index info
 */
function getGlobalBenchmark() {
  return ALL_INDICES['SPX'];
}

module.exports = {
  getHomeIndex,
  isUSCompany,
  getAllIndices,
  getIndicesByRegion,
  getIndexByCode,
  getGlobalBenchmark,
  COUNTRY_TO_INDEX,
  ALL_INDICES,
  INDICES_BY_REGION,
};
