// src/services/identifiers/exchangeMapper.js
// Maps exchange codes (MIC) to data provider symbol formats
// Supports Yahoo Finance, Alpha Vantage, and other providers

/**
 * Exchange mappings from MIC (ISO 10383) to provider-specific formats
 * MIC = Market Identifier Code
 */
const EXCHANGE_MAPPINGS = {
  // United Kingdom
  'XLON': { yahoo: '.L', av: '.LON', name: 'London Stock Exchange', country: 'GB', currency: 'GBP' },
  'XLON:LSE': { yahoo: '.L', av: '.LON', name: 'London Stock Exchange', country: 'GB', currency: 'GBP' },
  'XAIM': { yahoo: '.L', av: '.LON', name: 'AIM (LSE)', country: 'GB', currency: 'GBP' },

  // Germany
  'XETR': { yahoo: '.DE', av: '.DEX', name: 'XETRA', country: 'DE', currency: 'EUR' },
  'XFRA': { yahoo: '.F', av: '.FRK', name: 'Frankfurt Stock Exchange', country: 'DE', currency: 'EUR' },
  'XSTU': { yahoo: '.SG', av: null, name: 'Stuttgart Stock Exchange', country: 'DE', currency: 'EUR' },
  'XBER': { yahoo: '.BE', av: null, name: 'Berlin Stock Exchange', country: 'DE', currency: 'EUR' },
  'XHAM': { yahoo: '.HM', av: null, name: 'Hamburg Stock Exchange', country: 'DE', currency: 'EUR' },
  'XMUN': { yahoo: '.MU', av: null, name: 'Munich Stock Exchange', country: 'DE', currency: 'EUR' },
  'XDUS': { yahoo: '.DU', av: null, name: 'Dusseldorf Stock Exchange', country: 'DE', currency: 'EUR' },

  // France
  'XPAR': { yahoo: '.PA', av: '.PAR', name: 'Euronext Paris', country: 'FR', currency: 'EUR' },

  // Netherlands
  'XAMS': { yahoo: '.AS', av: '.AMS', name: 'Euronext Amsterdam', country: 'NL', currency: 'EUR' },

  // Belgium
  'XBRU': { yahoo: '.BR', av: '.BRU', name: 'Euronext Brussels', country: 'BE', currency: 'EUR' },

  // Portugal
  'XLIS': { yahoo: '.LS', av: null, name: 'Euronext Lisbon', country: 'PT', currency: 'EUR' },

  // Ireland
  'XDUB': { yahoo: '.IR', av: null, name: 'Euronext Dublin', country: 'IE', currency: 'EUR' },

  // Spain
  'XMAD': { yahoo: '.MC', av: null, name: 'Bolsa de Madrid', country: 'ES', currency: 'EUR' },
  'XMCE': { yahoo: '.MC', av: null, name: 'BME Spanish Exchanges', country: 'ES', currency: 'EUR' },

  // Italy
  'XMIL': { yahoo: '.MI', av: null, name: 'Borsa Italiana', country: 'IT', currency: 'EUR' },
  'MTAA': { yahoo: '.MI', av: null, name: 'Borsa Italiana - MTA', country: 'IT', currency: 'EUR' },

  // Switzerland
  'XSWX': { yahoo: '.SW', av: '.SWX', name: 'SIX Swiss Exchange', country: 'CH', currency: 'CHF' },
  'XVTX': { yahoo: '.VX', av: null, name: 'SIX Swiss Exchange (VX)', country: 'CH', currency: 'CHF' },

  // Nordic countries
  'XSTO': { yahoo: '.ST', av: null, name: 'Nasdaq Stockholm', country: 'SE', currency: 'SEK' },
  'XHEL': { yahoo: '.HE', av: null, name: 'Nasdaq Helsinki', country: 'FI', currency: 'EUR' },
  'XCSE': { yahoo: '.CO', av: null, name: 'Nasdaq Copenhagen', country: 'DK', currency: 'DKK' },
  'XOSL': { yahoo: '.OL', av: null, name: 'Oslo Bors', country: 'NO', currency: 'NOK' },
  'XICE': { yahoo: '.IC', av: null, name: 'Nasdaq Iceland', country: 'IS', currency: 'ISK' },

  // Austria
  'XWBO': { yahoo: '.VI', av: null, name: 'Vienna Stock Exchange', country: 'AT', currency: 'EUR' },

  // Poland
  'XWAR': { yahoo: '.WA', av: null, name: 'Warsaw Stock Exchange', country: 'PL', currency: 'PLN' },

  // Czech Republic
  'XPRA': { yahoo: '.PR', av: null, name: 'Prague Stock Exchange', country: 'CZ', currency: 'CZK' },

  // Hungary
  'XBUD': { yahoo: '.BD', av: null, name: 'Budapest Stock Exchange', country: 'HU', currency: 'HUF' },

  // Greece
  'XATH': { yahoo: '.AT', av: null, name: 'Athens Stock Exchange', country: 'GR', currency: 'EUR' },

  // Turkey
  'XIST': { yahoo: '.IS', av: null, name: 'Borsa Istanbul', country: 'TR', currency: 'TRY' },

  // Russia (for reference, may have restrictions)
  'XMOS': { yahoo: '.ME', av: null, name: 'Moscow Exchange', country: 'RU', currency: 'RUB' },

  // USA (for completeness)
  'XNYS': { yahoo: '', av: '', name: 'NYSE', country: 'US', currency: 'USD' },
  'XNAS': { yahoo: '', av: '', name: 'NASDAQ', country: 'US', currency: 'USD' },
  'XASE': { yahoo: '', av: '', name: 'NYSE American', country: 'US', currency: 'USD' },
  'ARCX': { yahoo: '', av: '', name: 'NYSE Arca', country: 'US', currency: 'USD' },
  'BATS': { yahoo: '', av: '', name: 'BATS Exchange', country: 'US', currency: 'USD' },

  // Canada
  'XTSE': { yahoo: '.TO', av: '.TOR', name: 'Toronto Stock Exchange', country: 'CA', currency: 'CAD' },
  'XTSX': { yahoo: '.V', av: null, name: 'TSX Venture', country: 'CA', currency: 'CAD' },

  // Australia
  'XASX': { yahoo: '.AX', av: null, name: 'Australian Securities Exchange', country: 'AU', currency: 'AUD' },

  // Japan
  'XTKS': { yahoo: '.T', av: null, name: 'Tokyo Stock Exchange', country: 'JP', currency: 'JPY' },

  // Hong Kong
  'XHKG': { yahoo: '.HK', av: null, name: 'Hong Kong Stock Exchange', country: 'HK', currency: 'HKD' },

  // Singapore
  'XSES': { yahoo: '.SI', av: null, name: 'Singapore Exchange', country: 'SG', currency: 'SGD' },

  // South Korea
  'XKOS': { yahoo: '.KS', av: null, name: 'Korea Exchange (KOSPI)', country: 'KR', currency: 'KRW' },
  'XKRX': { yahoo: '.KQ', av: null, name: 'Korea Exchange (KOSDAQ)', country: 'KR', currency: 'KRW' },

  // Taiwan
  'XTAI': { yahoo: '.TW', av: null, name: 'Taiwan Stock Exchange', country: 'TW', currency: 'TWD' },

  // India
  'XBOM': { yahoo: '.BO', av: '.BSE', name: 'Bombay Stock Exchange', country: 'IN', currency: 'INR' },
  'XNSE': { yahoo: '.NS', av: '.NSE', name: 'National Stock Exchange India', country: 'IN', currency: 'INR' },

  // China
  'XSHG': { yahoo: '.SS', av: null, name: 'Shanghai Stock Exchange', country: 'CN', currency: 'CNY' },
  'XSHE': { yahoo: '.SZ', av: null, name: 'Shenzhen Stock Exchange', country: 'CN', currency: 'CNY' },

  // Brazil
  'BVMF': { yahoo: '.SA', av: null, name: 'B3 (Brasil Bolsa Balcão)', country: 'BR', currency: 'BRL' },

  // Mexico
  'XMEX': { yahoo: '.MX', av: null, name: 'Mexican Stock Exchange', country: 'MX', currency: 'MXN' },

  // South Africa
  'XJSE': { yahoo: '.JO', av: null, name: 'Johannesburg Stock Exchange', country: 'ZA', currency: 'ZAR' },

  // Israel
  'XTAE': { yahoo: '.TA', av: null, name: 'Tel Aviv Stock Exchange', country: 'IL', currency: 'ILS' },

  // Saudi Arabia
  'XSAU': { yahoo: '.SR', av: null, name: 'Saudi Exchange (Tadawul)', country: 'SA', currency: 'SAR' },

  // UAE
  'XDFM': { yahoo: '.AE', av: null, name: 'Dubai Financial Market', country: 'AE', currency: 'AED' },
  'XADS': { yahoo: '.AD', av: null, name: 'Abu Dhabi Securities Exchange', country: 'AE', currency: 'AED' },

  // New Zealand
  'XNZE': { yahoo: '.NZ', av: null, name: 'New Zealand Exchange', country: 'NZ', currency: 'NZD' }
};

/**
 * Primary exchange for each country (for default resolution)
 */
const COUNTRY_PRIMARY_EXCHANGE = {
  'GB': 'XLON',
  'DE': 'XETR',
  'FR': 'XPAR',
  'NL': 'XAMS',
  'BE': 'XBRU',
  'ES': 'XMAD',
  'IT': 'XMIL',
  'CH': 'XSWX',
  'SE': 'XSTO',
  'FI': 'XHEL',
  'DK': 'XCSE',
  'NO': 'XOSL',
  'AT': 'XWBO',
  'PT': 'XLIS',
  'IE': 'XDUB',
  'PL': 'XWAR',
  'GR': 'XATH',
  'US': 'XNYS',
  'CA': 'XTSE',
  'AU': 'XASX',
  'JP': 'XTKS',
  'HK': 'XHKG',
  'SG': 'XSES',
  'KR': 'XKOS',
  'TW': 'XTAI',
  'IN': 'XNSE',
  'CN': 'XSHG',
  'BR': 'BVMF',
  'MX': 'XMEX',
  'ZA': 'XJSE',
  'IL': 'XTAE',
  'SA': 'XSAU',
  'NZ': 'XNZE'
};

class ExchangeMapper {
  /**
   * Get Yahoo Finance symbol from ticker and exchange code
   * @param {string} ticker - Raw ticker symbol
   * @param {string} exchangeCode - MIC exchange code
   * @returns {string} Yahoo Finance formatted symbol
   */
  getYahooSymbol(ticker, exchangeCode) {
    if (!ticker) return null;

    const mapping = EXCHANGE_MAPPINGS[exchangeCode];
    if (!mapping) {
      console.warn(`Unknown exchange code: ${exchangeCode}`);
      return ticker;
    }

    // US exchanges don't need suffix
    if (!mapping.yahoo) {
      return ticker.toUpperCase();
    }

    return `${ticker.toUpperCase()}${mapping.yahoo}`;
  }

  /**
   * Get Alpha Vantage symbol from ticker and exchange code
   * @param {string} ticker - Raw ticker symbol
   * @param {string} exchangeCode - MIC exchange code
   * @returns {string|null} Alpha Vantage formatted symbol or null if not supported
   */
  getAlphaVantageSymbol(ticker, exchangeCode) {
    if (!ticker) return null;

    const mapping = EXCHANGE_MAPPINGS[exchangeCode];
    if (!mapping || mapping.av === null) {
      return null; // Not supported by Alpha Vantage
    }

    if (!mapping.av) {
      return ticker.toUpperCase();
    }

    return `${ticker.toUpperCase()}${mapping.av}`;
  }

  /**
   * Parse a Yahoo Finance symbol to extract ticker and exchange
   * @param {string} yahooSymbol - Yahoo Finance symbol (e.g., 'BP.L', 'SAP.DE')
   * @returns {Object} { ticker, exchangeCode, country, currency }
   */
  parseYahooSymbol(yahooSymbol) {
    if (!yahooSymbol) return null;

    // Find matching suffix
    for (const [mic, mapping] of Object.entries(EXCHANGE_MAPPINGS)) {
      if (mapping.yahoo && yahooSymbol.endsWith(mapping.yahoo)) {
        const ticker = yahooSymbol.slice(0, -mapping.yahoo.length);
        return {
          ticker,
          yahooSymbol,
          exchangeCode: mic,
          exchangeName: mapping.name,
          country: mapping.country,
          currency: mapping.currency
        };
      }
    }

    // No suffix found - assume US
    return {
      ticker: yahooSymbol,
      yahooSymbol,
      exchangeCode: 'XNYS',
      exchangeName: 'NYSE/NASDAQ',
      country: 'US',
      currency: 'USD'
    };
  }

  /**
   * Get primary exchange for a country
   * @param {string} countryCode - ISO 3166-1 alpha-2 country code
   * @returns {string|null} MIC exchange code
   */
  getPrimaryExchange(countryCode) {
    return COUNTRY_PRIMARY_EXCHANGE[countryCode?.toUpperCase()] || null;
  }

  /**
   * Get all exchanges for a country
   * @param {string} countryCode - ISO 3166-1 alpha-2 country code
   * @returns {Array} Array of exchange info objects
   */
  getExchangesForCountry(countryCode) {
    const country = countryCode?.toUpperCase();

    return Object.entries(EXCHANGE_MAPPINGS)
      .filter(([, mapping]) => mapping.country === country)
      .map(([mic, mapping]) => ({
        mic,
        ...mapping
      }));
  }

  /**
   * Get exchange info by MIC code
   * @param {string} exchangeCode - MIC exchange code
   * @returns {Object|null} Exchange information
   */
  getExchangeInfo(exchangeCode) {
    const mapping = EXCHANGE_MAPPINGS[exchangeCode];
    if (!mapping) return null;

    return {
      mic: exchangeCode,
      ...mapping
    };
  }

  /**
   * Get all supported exchanges
   * @returns {Object} Exchange mappings
   */
  getAllExchanges() {
    return { ...EXCHANGE_MAPPINGS };
  }

  /**
   * Get all EU/EEA exchanges
   * @returns {Array} Array of exchange info objects
   */
  getEuropeanExchanges() {
    const euCountries = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'NO', 'IS', 'CH'
    ];

    return Object.entries(EXCHANGE_MAPPINGS)
      .filter(([, mapping]) => euCountries.includes(mapping.country))
      .map(([mic, mapping]) => ({
        mic,
        ...mapping
      }));
  }

  /**
   * Normalize ticker for consistent comparison
   * @param {string} ticker - Ticker symbol
   * @returns {string} Normalized ticker
   */
  normalizeTicker(ticker) {
    if (!ticker) return '';

    // Remove common suffixes, whitespace, special chars
    return ticker
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }
}

module.exports = {
  ExchangeMapper,
  EXCHANGE_MAPPINGS,
  COUNTRY_PRIMARY_EXCHANGE
};
