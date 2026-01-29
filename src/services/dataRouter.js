// src/services/dataRouter.js

/**
 * International Data Router
 * EU/UK Public Markets Coverage - Unified Data Access Layer
 *
 * Routes requests to the appropriate data source based on country/market:
 * - US stocks: Alpha Vantage (fundamentals + prices)
 * - UK stocks: XBRL/Companies House (fundamentals) + Alpha Vantage (prices)
 * - EU stocks: XBRL Filings Index (fundamentals) + Alpha Vantage (prices)
 *
 * Provides a single interface for the rest of the system, abstracting away
 * the complexity of multiple data sources.
 */

const AlphaVantageProvider = require('../providers/AlphaVantageProvider');
const { XBRLProvider } = require('./providers/xbrlProvider');
const { PriceProvider } = require('./providers/priceProvider');

// Country to fundamentals data source mapping
const FUNDAMENTALS_SOURCE = {
  // North America - Alpha Vantage
  'US': 'alphavantage',
  'CA': 'alphavantage',

  // United Kingdom - XBRL (Companies House + ESEF)
  'GB': 'xbrl',
  'UK': 'xbrl', // Alias

  // European Union - XBRL (ESEF mandate since 2021)
  'DE': 'xbrl', // Germany
  'FR': 'xbrl', // France
  'NL': 'xbrl', // Netherlands
  'ES': 'xbrl', // Spain
  'IT': 'xbrl', // Italy
  'BE': 'xbrl', // Belgium
  'CH': 'xbrl', // Switzerland
  'SE': 'xbrl', // Sweden
  'DK': 'xbrl', // Denmark
  'NO': 'xbrl', // Norway
  'FI': 'xbrl', // Finland
  'IE': 'xbrl', // Ireland
  'AT': 'xbrl', // Austria
  'PT': 'xbrl', // Portugal
  'PL': 'xbrl', // Poland
  'GR': 'xbrl', // Greece
  'CZ': 'xbrl', // Czech Republic
  'HU': 'xbrl', // Hungary
  'RO': 'xbrl', // Romania
  'LU': 'xbrl', // Luxembourg
};

// Price data works globally via Alpha Vantage
const PRICE_SOURCE = 'alphavantage';

class DataRouter {
  constructor(database, config = {}) {
    this.db = database;

    // Initialize providers
    const apiKey = config.alphaVantageKey || process.env.ALPHA_VANTAGE_KEY;

    if (apiKey) {
      this.alphaVantage = new AlphaVantageProvider(apiKey);
      this.price = new PriceProvider(apiKey);
    } else {
      console.warn('   DataRouter: No Alpha Vantage API key provided');
      this.alphaVantage = null;
      this.price = null;
    }

    this.xbrl = new XBRLProvider(database);

    // Optional symbol resolver (from Agent 11)
    this.symbolResolver = config.symbolResolver || null;

    console.log('DataRouter initialized');
    console.log(`   - Alpha Vantage: ${this.alphaVantage ? 'enabled' : 'disabled'}`);
    console.log('   - XBRL Provider: enabled');
    console.log(`   - Price Provider: ${this.price ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get company fundamentals - routes to correct source based on country
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional, will be detected)
   * @returns {Object} - Normalized fundamentals data
   */
  async getFundamentals(identifier, country = null) {
    // 1. Resolve identifier if needed
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';

    // 2. Route to correct source
    const source = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    console.log(`DataRouter: Routing fundamentals for ${identifier} (${targetCountry}) to ${source}`);

    if (source === 'alphavantage') {
      return this._getAlphaVantageFundamentals(resolved.symbol || identifier);
    } else {
      return this._getXBRLFundamentals(resolved);
    }
  }

  /**
   * Get price data - works for all markets via Alpha Vantage
   * @param {string} symbol - Stock symbol
   * @param {Object} options - Options (interval, outputSize)
   * @returns {Array} - Historical price data
   */
  async getPrices(symbol, options = {}) {
    if (!this.price) {
      throw new Error('Price provider not available (no API key)');
    }
    return this.price.getHistory(symbol, options);
  }

  /**
   * Get current quote
   * @param {string} symbol - Stock symbol
   * @returns {Object} - Current quote data
   */
  async getQuote(symbol) {
    if (!this.price) {
      throw new Error('Price provider not available (no API key)');
    }
    return this.price.getQuote(symbol);
  }

  /**
   * Get company overview/profile
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Company profile data
   */
  async getCompanyOverview(identifier, country = null) {
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';
    const source = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    if (source === 'alphavantage' && this.alphaVantage) {
      return this.alphaVantage.getCompanyOverview(resolved.symbol || identifier);
    } else {
      return this.xbrl.getCompanyProfile(resolved);
    }
  }

  /**
   * Get income statement
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Income statement data
   */
  async getIncomeStatement(identifier, country = null) {
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';
    const source = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    if (source === 'alphavantage' && this.alphaVantage) {
      return this.alphaVantage.getIncomeStatement(resolved.symbol || identifier);
    } else {
      return this.xbrl.getIncomeStatement(resolved);
    }
  }

  /**
   * Get balance sheet
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Balance sheet data
   */
  async getBalanceSheet(identifier, country = null) {
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';
    const source = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    if (source === 'alphavantage' && this.alphaVantage) {
      return this.alphaVantage.getBalanceSheet(resolved.symbol || identifier);
    } else {
      return this.xbrl.getBalanceSheet(resolved);
    }
  }

  /**
   * Get cash flow statement
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Cash flow data
   */
  async getCashFlow(identifier, country = null) {
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';
    const source = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    if (source === 'alphavantage' && this.alphaVantage) {
      return this.alphaVantage.getCashFlow(resolved.symbol || identifier);
    } else {
      return this.xbrl.getCashFlow(resolved);
    }
  }

  /**
   * Get key financial ratios (calculated from fundamentals + price)
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Financial ratios
   */
  async getFinancialRatios(identifier, country = null) {
    const [fundamentals, quote] = await Promise.all([
      this.getFundamentals(identifier, country),
      this.price ? this.getQuote(identifier) : null,
    ]);

    return this._calculateRatios(fundamentals, quote);
  }

  /**
   * Batch get fundamentals for multiple companies
   * @param {Array} identifiers - Array of { symbol, country } objects
   * @returns {Array} - Results for each identifier
   */
  async batchGetFundamentals(identifiers) {
    const results = await Promise.allSettled(
      identifiers.map(id =>
        this.getFundamentals(id.symbol || id.identifier, id.country)
      )
    );

    return identifiers.map((id, i) => ({
      identifier: id,
      data: results[i].status === 'fulfilled' ? results[i].value : null,
      error: results[i].status === 'rejected' ? results[i].reason.message : null,
    }));
  }

  /**
   * Search companies across all markets
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} - Deduplicated search results
   */
  async searchCompanies(query, options = {}) {
    const results = [];
    const promises = [];

    // Search XBRL database (EU/UK companies)
    if (!options.excludeXBRL) {
      promises.push(
        this.xbrl.searchCompanies(query, options)
          .then(xbrlResults => {
            results.push(...xbrlResults.map(r => ({ ...r, source: 'xbrl' })));
          })
          .catch(err => {
            console.error('XBRL search error:', err.message);
          })
      );
    }

    // Search Alpha Vantage (US + global symbols)
    if (!options.excludeAlphaVantage && this.alphaVantage) {
      promises.push(
        this._searchAlphaVantage(query)
          .then(avResults => {
            results.push(...avResults.map(r => ({ ...r, source: 'alphavantage' })));
          })
          .catch(err => {
            console.error('Alpha Vantage search error:', err.message);
          })
      );
    }

    await Promise.all(promises);

    return this._deduplicateResults(results);
  }

  /**
   * Get data availability information for a company
   * @param {string} identifier - Symbol, LEI, or ISIN
   * @param {string} country - ISO country code (optional)
   * @returns {Object} - Data availability details
   */
  async getDataAvailability(identifier, country = null) {
    const resolved = await this._resolveIdentifier(identifier);
    const targetCountry = country || resolved.country || 'US';
    const fundamentalsSource = FUNDAMENTALS_SOURCE[targetCountry.toUpperCase()] || 'xbrl';

    return {
      identifier: resolved,
      country: targetCountry,
      fundamentalsSource,
      priceSource: this.price ? PRICE_SOURCE : 'unavailable',
      capabilities: {
        incomeStatement: true,
        balanceSheet: true,
        cashFlow: true,
        historicalPrices: !!this.price,
        realTimeQuote: !!this.price,
        earnings: targetCountry === 'US' && !!this.alphaVantage,
        insiderTransactions: targetCountry === 'US',
        xbrlFilings: fundamentalsSource === 'xbrl',
      },
    };
  }

  /**
   * Get companies by country
   * @param {string} countryCode - ISO country code
   * @param {Object} options - Options
   * @returns {Array} - Companies in the country
   */
  async getCompaniesByCountry(countryCode, options = {}) {
    const source = FUNDAMENTALS_SOURCE[countryCode.toUpperCase()];

    if (source === 'xbrl') {
      return this.xbrl.getCompaniesByCountry(countryCode, options);
    }

    // For non-XBRL countries, return from local database
    const limit = options.limit || 100;
    const stmt = this.db.prepare(`
      SELECT symbol, name, sector, industry, exchange, country
      FROM companies
      WHERE country = ?
      ORDER BY name
      LIMIT ?
    `);

    return stmt.all(countryCode.toUpperCase(), limit);
  }

  /**
   * Get statistics about data coverage
   * @returns {Object} - Data coverage statistics
   */
  getStats() {
    return {
      xbrl: this.xbrl.getStats(),
      supportedCountries: Object.keys(FUNDAMENTALS_SOURCE),
      routing: {
        fundamentalsSources: {
          alphavantage: Object.entries(FUNDAMENTALS_SOURCE)
            .filter(([_, v]) => v === 'alphavantage')
            .map(([k]) => k),
          xbrl: Object.entries(FUNDAMENTALS_SOURCE)
            .filter(([_, v]) => v === 'xbrl')
            .map(([k]) => k),
        },
        priceSource: PRICE_SOURCE,
      },
    };
  }

  // ========================================
  // Private methods
  // ========================================

  /**
   * Resolve identifier to standardized format
   * @private
   */
  async _resolveIdentifier(identifier) {
    // If it's already a resolved object, return it
    if (typeof identifier === 'object' && (identifier.symbol || identifier.lei)) {
      return identifier;
    }

    // Check if it's an LEI (20 alphanumeric characters)
    if (typeof identifier === 'string' && identifier.length === 20 && /^[A-Z0-9]+$/.test(identifier)) {
      const stmt = this.db.prepare(`
        SELECT * FROM company_identifiers WHERE lei = ?
      `);
      const byLei = stmt.get(identifier);
      if (byLei) {
        return {
          symbol: byLei.yahoo_symbol || byLei.ticker,
          ticker: byLei.ticker,
          lei: byLei.lei,
          isin: byLei.isin,
          country: byLei.country,
          exchange: byLei.exchange,
          companyId: byLei.company_id,
          identifierId: byLei.id,
        };
      }
    }

    // Check company_identifiers table by ticker
    const stmt = this.db.prepare(`
      SELECT * FROM company_identifiers
      WHERE ticker = ? OR yahoo_symbol = ?
      LIMIT 1
    `);
    const byTicker = stmt.get(identifier.toUpperCase(), identifier.toUpperCase());
    if (byTicker) {
      return {
        symbol: byTicker.yahoo_symbol || byTicker.ticker,
        ticker: byTicker.ticker,
        lei: byTicker.lei,
        country: byTicker.country,
        exchange: byTicker.exchange,
        companyId: byTicker.company_id,
        identifierId: byTicker.id,
      };
    }

    // Check main companies table
    const companyStmt = this.db.prepare(`
      SELECT id, symbol, name, country, exchange, lei, isin
      FROM companies
      WHERE symbol = ? OR UPPER(symbol) = ?
      LIMIT 1
    `);
    const company = companyStmt.get(identifier, identifier.toUpperCase());
    if (company) {
      return {
        symbol: company.symbol,
        ticker: company.symbol,
        lei: company.lei,
        isin: company.isin,
        country: company.country,
        exchange: company.exchange,
        companyId: company.id,
      };
    }

    // Try symbol resolver (Agent 11) if available
    if (this.symbolResolver) {
      for (const exchange of ['XLON', 'XETR', 'XPAR', 'XAMS', 'XNAS', 'XNYS']) {
        try {
          const result = await this.symbolResolver.resolveFromTicker?.(identifier, exchange);
          if (result) return result;
        } catch (e) {
          // Continue to next exchange
        }
      }
    }

    // Fallback - assume US stock
    return {
      symbol: identifier.toUpperCase(),
      ticker: identifier.toUpperCase(),
      country: 'US',
    };
  }

  /**
   * Get fundamentals from Alpha Vantage
   * @private
   */
  async _getAlphaVantageFundamentals(symbol) {
    if (!this.alphaVantage) {
      throw new Error('Alpha Vantage provider not available');
    }

    const [income, balance, cashflow, overview] = await Promise.all([
      this.alphaVantage.getIncomeStatement(symbol),
      this.alphaVantage.getBalanceSheet(symbol),
      this.alphaVantage.getCashFlow(symbol),
      this.alphaVantage.getCompanyOverview(symbol),
    ]);

    return {
      source: 'alphavantage',
      symbol,
      overview,
      incomeStatement: income,
      balanceSheet: balance,
      cashFlow: cashflow,
    };
  }

  /**
   * Get fundamentals from XBRL
   * @private
   */
  async _getXBRLFundamentals(resolved) {
    const fundamentals = await this.xbrl.getFundamentals(resolved);

    if (!fundamentals) {
      return null;
    }

    return {
      source: 'xbrl',
      symbol: resolved.symbol,
      ticker: resolved.ticker,
      lei: resolved.lei,
      ...fundamentals,
    };
  }

  /**
   * Search Alpha Vantage symbol search
   * @private
   */
  async _searchAlphaVantage(query) {
    if (!this.alphaVantage) return [];

    try {
      const data = await this.alphaVantage.makeRequest({
        function: 'SYMBOL_SEARCH',
        keywords: query,
      });

      return (data?.bestMatches || []).map(m => ({
        symbol: m['1. symbol'],
        name: m['2. name'],
        type: m['3. type'],
        region: m['4. region'],
        marketOpen: m['5. marketOpen'],
        marketClose: m['6. marketClose'],
        timezone: m['7. timezone'],
        currency: m['8. currency'],
        matchScore: parseFloat(m['9. matchScore']),
      }));
    } catch (error) {
      console.error('Alpha Vantage search error:', error.message);
      return [];
    }
  }

  /**
   * Calculate financial ratios from fundamentals and quote
   * @private
   */
  _calculateRatios(fundamentals, quote) {
    if (!fundamentals) return null;

    const bs = fundamentals?.balanceSheet?.latestAnnual || {};
    const is = fundamentals?.incomeStatement?.latestAnnual || {};
    const price = quote?.price;

    const ratios = {};

    // Valuation ratios (need price)
    if (price && is.netIncome && bs.totalEquity) {
      const sharesOutstanding = is.sharesOutstanding || bs.sharesOutstanding || 1;
      const eps = is.netIncome / sharesOutstanding;
      ratios.peRatio = eps !== 0 ? price / eps : null;
    }

    if (price && bs.totalEquity) {
      const sharesOutstanding = is.sharesOutstanding || bs.sharesOutstanding || 1;
      const bookValuePerShare = bs.totalEquity / sharesOutstanding;
      ratios.priceToBook = bookValuePerShare !== 0 ? price / bookValuePerShare : null;
    }

    // Profitability ratios
    if (is.revenue && is.revenue !== 0) {
      if (is.grossProfit !== undefined) {
        ratios.grossMargin = is.grossProfit / is.revenue;
      }
      if (is.operatingIncome !== undefined) {
        ratios.operatingMargin = is.operatingIncome / is.revenue;
      }
      if (is.netIncome !== undefined) {
        ratios.netMargin = is.netIncome / is.revenue;
      }
    }

    // Returns
    if (bs.totalEquity && bs.totalEquity !== 0 && is.netIncome !== undefined) {
      ratios.returnOnEquity = is.netIncome / bs.totalEquity;
    }
    if (bs.totalAssets && bs.totalAssets !== 0 && is.netIncome !== undefined) {
      ratios.returnOnAssets = is.netIncome / bs.totalAssets;
    }

    // Leverage
    if (bs.totalLiabilities !== undefined && bs.totalEquity && bs.totalEquity !== 0) {
      ratios.debtToEquity = bs.totalLiabilities / bs.totalEquity;
    }
    if (bs.currentAssets !== undefined && bs.currentLiabilities && bs.currentLiabilities !== 0) {
      ratios.currentRatio = bs.currentAssets / bs.currentLiabilities;
    }

    return {
      source: fundamentals.source,
      symbol: fundamentals.symbol,
      currentPrice: price,
      ...ratios,
    };
  }

  /**
   * Deduplicate search results
   * @private
   */
  _deduplicateResults(results) {
    const seen = new Set();
    return results.filter(r => {
      const key = `${r.symbol}-${r.exchange || r.region || 'unknown'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Export the routing configuration for external use
module.exports = {
  DataRouter,
  FUNDAMENTALS_SOURCE,
  PRICE_SOURCE,
};
