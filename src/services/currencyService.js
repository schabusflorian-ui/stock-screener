// src/services/currencyService.js
// Currency conversion service for standardizing financial data across currencies

const { getDatabase } = require('../database');

// Default exchange rates (fallback if API unavailable)
// Rates are relative to USD (1 USD = X of currency)
const FALLBACK_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157.5,
  CHF: 0.90,
  CAD: 1.44,
  AUD: 1.62,
  CNY: 7.30,
  INR: 85.5,
  KRW: 1480,
  BRL: 6.20,
  MXN: 17.2,
  SGD: 1.36,
  HKD: 7.82,
  SEK: 11.0,
  NOK: 11.3,
  DKK: 7.05,
  PLN: 4.02,
  ZAR: 18.5,
  NZD: 1.78,
};

// Cache for exchange rates
let ratesCache = {
  rates: null,
  lastFetched: null,
};

class CurrencyService {
  constructor() {
    this.db = getDatabase();
    this.ensureRatesTable();
  }

  /**
   * Ensure historical exchange rates table exists
   */
  ensureRatesTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exchange_rates_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        base_currency TEXT DEFAULT 'USD',
        currency TEXT NOT NULL,
        rate REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, base_currency, currency)
      );
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates_history(date);
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates_history(currency);
    `);
  }

  /**
   * Get current exchange rates (with caching)
   * @returns {Object} Exchange rates relative to USD
   */
  async getCurrentRates() {
    const oneHour = 60 * 60 * 1000;
    if (ratesCache.rates && ratesCache.lastFetched && (Date.now() - ratesCache.lastFetched) < oneHour) {
      return ratesCache.rates;
    }

    try {
      const response = await fetch('https://api.exchangerate.host/latest?base=USD');
      if (response.ok) {
        const data = await response.json();
        if (data.success !== false && data.rates) {
          ratesCache = { rates: data.rates, lastFetched: Date.now() };
          return data.rates;
        }
      }
    } catch (err) {
      console.log('Exchange rate API failed, using fallback rates');
    }

    ratesCache = { rates: FALLBACK_RATES, lastFetched: Date.now() };
    return FALLBACK_RATES;
  }

  /**
   * Convert amount from one currency to another
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code
   * @param {string} toCurrency - Target currency code (default: USD)
   * @param {Object} rates - Optional rates object (uses current if not provided)
   * @returns {number} Converted amount
   */
  convert(amount, fromCurrency, toCurrency = 'USD', rates = null) {
    if (!amount || fromCurrency === toCurrency) return amount;

    const effectiveRates = rates || ratesCache.rates || FALLBACK_RATES;
    const fromRate = effectiveRates[fromCurrency] || 1;
    const toRate = effectiveRates[toCurrency] || 1;

    // Convert: amount in fromCurrency -> USD -> toCurrency
    return (amount / fromRate) * toRate;
  }

  /**
   * Convert amount to USD using current rates
   * @param {number} amount - Amount in original currency
   * @param {string} fromCurrency - Original currency code
   * @returns {number} Amount in USD
   */
  toUSD(amount, fromCurrency) {
    return this.convert(amount, fromCurrency, 'USD');
  }

  /**
   * Get historical exchange rate for a specific date
   * @param {string} currency - Currency code
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {number|null} Exchange rate or null if not found
   */
  getHistoricalRate(currency, date) {
    const row = this.db.prepare(`
      SELECT rate FROM exchange_rates_history
      WHERE currency = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `).get(currency, date);

    return row?.rate || null;
  }

  /**
   * Store historical exchange rate
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} currency - Currency code
   * @param {number} rate - Exchange rate relative to USD
   */
  storeHistoricalRate(date, currency, rate) {
    this.db.prepare(`
      INSERT OR REPLACE INTO exchange_rates_history (date, base_currency, currency, rate)
      VALUES (?, 'USD', ?, ?)
    `).run(date, currency, rate);
  }

  /**
   * Enrich financial data with USD-converted values
   * @param {Object} data - Financial data object
   * @param {string} originalCurrency - Currency of the original data
   * @param {Array<string>} monetaryFields - List of field names containing monetary values
   * @returns {Object} Enriched data with _usd suffixed fields
   */
  enrichWithUSD(data, originalCurrency, monetaryFields) {
    if (!data || originalCurrency === 'USD') return data;

    const enriched = { ...data };
    const rates = ratesCache.rates || FALLBACK_RATES;

    for (const field of monetaryFields) {
      if (data[field] !== null && data[field] !== undefined) {
        enriched[`${field}_usd`] = this.convert(data[field], originalCurrency, 'USD', rates);
      }
    }

    enriched._original_currency = originalCurrency;
    enriched._conversion_rate = rates[originalCurrency] || 1;

    return enriched;
  }

  /**
   * Get company's reporting currency
   * @param {number} companyId - Company ID
   * @returns {string} Currency code (default: USD)
   */
  getCompanyCurrency(companyId) {
    // Check companies table for reporting_currency (set by migration based on country)
    const company = this.db.prepare(`
      SELECT reporting_currency FROM companies
      WHERE id = ?
    `).get(companyId);

    return company?.reporting_currency || 'USD';
  }

  /**
   * Batch enrich company metrics with USD conversions
   * @param {Array} metrics - Array of metrics objects
   * @returns {Array} Enriched metrics
   */
  enrichMetricsWithUSD(metrics) {
    const monetaryFields = [
      'revenue', 'net_income', 'operating_income', 'gross_profit',
      'fcf', 'total_assets', 'total_liabilities', 'shareholder_equity',
      'market_cap', 'enterprise_value', 'ebitda'
    ];

    return metrics.map(m => {
      const currency = m.currency || 'USD';
      return this.enrichWithUSD(m, currency, monetaryFields);
    });
  }

  /**
   * Get display info for currency
   * @param {string} currencyCode - Currency code
   * @returns {Object} Currency display info
   */
  getCurrencyInfo(currencyCode) {
    const currencies = {
      USD: { symbol: '$', name: 'US Dollar' },
      EUR: { symbol: '€', name: 'Euro' },
      GBP: { symbol: '£', name: 'British Pound' },
      CHF: { symbol: 'Fr', name: 'Swiss Franc' },
      JPY: { symbol: '¥', name: 'Japanese Yen' },
      SEK: { symbol: 'kr', name: 'Swedish Krona' },
      NOK: { symbol: 'kr', name: 'Norwegian Krone' },
      DKK: { symbol: 'kr', name: 'Danish Krone' },
      PLN: { symbol: 'zł', name: 'Polish Zloty' },
      CAD: { symbol: 'C$', name: 'Canadian Dollar' },
      AUD: { symbol: 'A$', name: 'Australian Dollar' },
      CNY: { symbol: '¥', name: 'Chinese Yuan' },
      INR: { symbol: '₹', name: 'Indian Rupee' },
      KRW: { symbol: '₩', name: 'South Korean Won' },
      BRL: { symbol: 'R$', name: 'Brazilian Real' },
      MXN: { symbol: '$', name: 'Mexican Peso' },
      SGD: { symbol: 'S$', name: 'Singapore Dollar' },
      HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
      ZAR: { symbol: 'R', name: 'South African Rand' },
      NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
    };

    return currencies[currencyCode] || { symbol: currencyCode, name: currencyCode };
  }
}

// Export singleton
module.exports = new CurrencyService();
