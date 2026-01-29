// src/services/identifiers/symbolResolver.js
// Unified symbol resolution service that orchestrates identifier lookups
// Bridges XBRL filings (LEI) to tradeable securities (Yahoo Finance symbols)

const { OpenFigiClient } = require('./openFigiClient');
const { GleifClient } = require('./gleifClient');
const { ExchangeMapper } = require('./exchangeMapper');

class SymbolResolver {
  /**
   * Create a new SymbolResolver instance
   * @param {Object} db - better-sqlite3 database instance
   * @param {Object} config - Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.figi = new OpenFigiClient(config.openFigiKey);
    this.gleif = new GleifClient();
    this.exchange = new ExchangeMapper();

    // Cache TTL in days
    this.cacheTtlDays = config.cacheTtlDays || 7;

    // Prepare statements for cache operations
    this._prepareStatements();
  }

  /**
   * Prepare SQLite statements for cache operations
   * @private
   */
  _prepareStatements() {
    // Create cache table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identifier_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier_type TEXT NOT NULL,
        identifier_value TEXT NOT NULL,
        resolution_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        UNIQUE(identifier_type, identifier_value)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identifier_cache_lookup
      ON identifier_cache(identifier_type, identifier_value)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_identifier_cache_expires
      ON identifier_cache(expires_at)
    `);

    // Prepare statements
    this.stmtGetCache = this.db.prepare(`
      SELECT resolution_data FROM identifier_cache
      WHERE identifier_type = ? AND identifier_value = ?
      AND expires_at > datetime('now')
    `);

    this.stmtSetCache = this.db.prepare(`
      INSERT INTO identifier_cache (identifier_type, identifier_value, resolution_data, expires_at)
      VALUES (?, ?, ?, datetime('now', ? || ' days'))
      ON CONFLICT(identifier_type, identifier_value) DO UPDATE SET
        resolution_data = excluded.resolution_data,
        expires_at = excluded.expires_at,
        created_at = datetime('now')
    `);

    this.stmtClearExpired = this.db.prepare(`
      DELETE FROM identifier_cache WHERE expires_at < datetime('now')
    `);
  }

  /**
   * Resolve identifiers from LEI (Legal Entity Identifier)
   * Primary method for XBRL data integration
   *
   * @param {string} lei - 20-character Legal Entity Identifier
   * @returns {Promise<Object|null>} Resolution result with company info and listings
   */
  async resolveFromLEI(lei) {
    // Check cache first
    const cached = this._getCache('lei', lei);
    if (cached) return cached;

    // Validate LEI
    if (!GleifClient.validateLei(lei)) {
      console.warn(`Invalid LEI format: ${lei}`);
      return null;
    }

    // Step 1: Get LEI record from GLEIF
    const leiRecord = await this.gleif.getLeiRecord(lei);
    if (!leiRecord) {
      console.warn(`LEI not found: ${lei}`);
      return null;
    }

    // Step 2: Get ISIN mappings for this LEI
    const isinMappings = await this.gleif.getIsinMappings(lei);

    // Step 3: Resolve ISINs to ticker symbols via OpenFIGI
    const listings = [];

    for (const { isin } of isinMappings) {
      try {
        const figiResults = await this.figi.mapISIN(isin);

        for (const result of figiResults) {
          // Filter for equity securities
          if (result.securityType === 'Common Stock' ||
              result.securityType === 'Ordinary Shares' ||
              result.marketSector === 'Equity') {
            listings.push({
              isin,
              figi: result.figi,
              compositeFigi: result.compositeFigi,
              ticker: result.ticker,
              exchange: result.exchangeCode,
              exchangeName: this.exchange.getExchangeInfo(result.exchangeCode)?.name,
              currency: result.currency,
              yahooSymbol: this.exchange.getYahooSymbol(result.ticker, result.exchangeCode),
              securityType: result.securityType,
              name: result.name
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to resolve ISIN ${isin}:`, error.message);
      }
    }

    // Step 4: If no ISIN mappings, try searching by company name
    if (listings.length === 0 && leiRecord.legalName) {
      const primaryExchange = this.exchange.getPrimaryExchange(leiRecord.country);

      try {
        const searchResults = await this.figi.search(leiRecord.legalName, primaryExchange);

        for (const result of searchResults.slice(0, 5)) {
          if (result.marketSector === 'Equity') {
            listings.push({
              figi: result.figi,
              compositeFigi: result.compositeFigi,
              ticker: result.ticker,
              exchange: result.exchangeCode,
              exchangeName: this.exchange.getExchangeInfo(result.exchangeCode)?.name,
              currency: result.currency,
              yahooSymbol: this.exchange.getYahooSymbol(result.ticker, result.exchangeCode),
              securityType: result.securityType,
              name: result.name,
              matchedByName: true
            });
          }
        }
      } catch (error) {
        console.warn(`Name search failed for ${leiRecord.legalName}:`, error.message);
      }
    }

    // Build result
    const result = {
      lei,
      companyName: leiRecord.legalName,
      country: leiRecord.country,
      jurisdiction: leiRecord.jurisdiction,
      registeredAs: leiRecord.registeredAs,
      status: leiRecord.status,
      legalAddress: leiRecord.legalAddress,
      listings: this._deduplicateListings(listings),
      primaryListing: this._selectPrimaryListing(listings, leiRecord.country),
      resolvedAt: new Date().toISOString()
    };

    // Cache the result
    this._setCache('lei', lei, result);

    return result;
  }

  /**
   * Resolve identifiers from ISIN
   *
   * @param {string} isin - 12-character ISIN
   * @returns {Promise<Object>} Resolution result with listings
   */
  async resolveFromISIN(isin) {
    // Check cache
    const cached = this._getCache('isin', isin);
    if (cached) return cached;

    // Validate ISIN format
    if (!isin || isin.length !== 12) {
      throw new Error('Invalid ISIN format - must be 12 characters');
    }

    // Country from ISIN prefix
    const countryCode = isin.substring(0, 2);

    // Resolve via OpenFIGI
    const figiResults = await this.figi.mapISIN(isin);

    const listings = figiResults
      .filter(r => r.marketSector === 'Equity')
      .map(result => ({
        isin,
        figi: result.figi,
        compositeFigi: result.compositeFigi,
        ticker: result.ticker,
        exchange: result.exchangeCode,
        exchangeName: this.exchange.getExchangeInfo(result.exchangeCode)?.name,
        currency: result.currency,
        yahooSymbol: this.exchange.getYahooSymbol(result.ticker, result.exchangeCode),
        securityType: result.securityType,
        name: result.name
      }));

    const result = {
      isin,
      countryCode,
      listings: this._deduplicateListings(listings),
      primaryListing: this._selectPrimaryListing(listings, countryCode),
      resolvedAt: new Date().toISOString()
    };

    this._setCache('isin', isin, result);
    return result;
  }

  /**
   * Resolve identifiers from ticker and exchange
   *
   * @param {string} ticker - Stock ticker symbol
   * @param {string} exchangeCode - MIC exchange code
   * @returns {Promise<Object>} Resolution result
   */
  async resolveFromTicker(ticker, exchangeCode) {
    const cacheKey = `${ticker}:${exchangeCode}`;

    // Check cache
    const cached = this._getCache('ticker', cacheKey);
    if (cached) return cached;

    // Resolve via OpenFIGI
    const figiResults = await this.figi.mapTicker(ticker, exchangeCode);

    if (figiResults.length === 0) {
      return {
        ticker,
        exchangeCode,
        found: false,
        resolvedAt: new Date().toISOString()
      };
    }

    const primary = figiResults[0];
    const exchangeInfo = this.exchange.getExchangeInfo(exchangeCode);

    const result = {
      ticker,
      exchangeCode,
      found: true,
      figi: primary.figi,
      compositeFigi: primary.compositeFigi,
      name: primary.name,
      currency: primary.currency || exchangeInfo?.currency,
      yahooSymbol: this.exchange.getYahooSymbol(ticker, exchangeCode),
      exchangeName: exchangeInfo?.name,
      country: exchangeInfo?.country,
      securityType: primary.securityType,
      resolvedAt: new Date().toISOString()
    };

    this._setCache('ticker', cacheKey, result);
    return result;
  }

  /**
   * Resolve from Yahoo Finance symbol
   *
   * @param {string} yahooSymbol - Yahoo Finance symbol (e.g., 'BP.L')
   * @returns {Promise<Object>} Resolution result
   */
  async resolveFromYahooSymbol(yahooSymbol) {
    // Parse the Yahoo symbol
    const parsed = this.exchange.parseYahooSymbol(yahooSymbol);
    if (!parsed) return null;

    // Resolve via ticker/exchange
    const result = await this.resolveFromTicker(parsed.ticker, parsed.exchangeCode);

    return {
      ...result,
      yahooSymbol,
      parsedTicker: parsed.ticker,
      parsedExchange: parsed.exchangeCode
    };
  }

  /**
   * Batch resolve multiple LEIs
   *
   * @param {Array<string>} leis - Array of LEI codes
   * @returns {Promise<Map>} Map of LEI -> resolution result
   */
  async batchResolveFromLEI(leis) {
    const results = new Map();

    // Check cache for all
    const uncached = [];
    for (const lei of leis) {
      const cached = this._getCache('lei', lei);
      if (cached) {
        results.set(lei, cached);
      } else {
        uncached.push(lei);
      }
    }

    // Resolve uncached in parallel (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < uncached.length; i += concurrency) {
      const batch = uncached.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async lei => {
          try {
            return { lei, result: await this.resolveFromLEI(lei) };
          } catch (error) {
            console.warn(`Failed to resolve LEI ${lei}:`, error.message);
            return { lei, result: null };
          }
        })
      );

      for (const { lei, result } of batchResults) {
        results.set(lei, result);
      }

      // Brief pause between batches
      if (i + concurrency < uncached.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }

  /**
   * Batch resolve multiple ISINs
   *
   * @param {Array<string>} isins - Array of ISIN codes
   * @returns {Promise<Map>} Map of ISIN -> resolution result
   */
  async batchResolveFromISIN(isins) {
    const results = new Map();

    // Check cache for all
    const uncached = [];
    for (const isin of isins) {
      const cached = this._getCache('isin', isin);
      if (cached) {
        results.set(isin, cached);
      } else {
        uncached.push(isin);
      }
    }

    if (uncached.length === 0) return results;

    // Use OpenFIGI batch API
    const figiMapping = await this.figi.batchMapISINs(uncached);

    for (const [isin, figiResults] of figiMapping) {
      const countryCode = isin.substring(0, 2);

      const listings = (figiResults || [])
        .filter(r => r.marketSector === 'Equity')
        .map(result => ({
          isin,
          figi: result.figi,
          compositeFigi: result.compositeFigi,
          ticker: result.ticker,
          exchange: result.exchangeCode,
          yahooSymbol: this.exchange.getYahooSymbol(result.ticker, result.exchangeCode),
          currency: result.currency,
          name: result.name
        }));

      const result = {
        isin,
        countryCode,
        listings: this._deduplicateListings(listings),
        primaryListing: this._selectPrimaryListing(listings, countryCode),
        resolvedAt: new Date().toISOString()
      };

      this._setCache('isin', isin, result);
      results.set(isin, result);
    }

    return results;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const result = this.stmtClearExpired.run();
    console.log(`Cleared ${result.changes} expired cache entries`);
    return result.changes;
  }

  /**
   * Get cache entry
   * @private
   */
  _getCache(type, value) {
    const row = this.stmtGetCache.get(type, value);
    if (!row) return null;

    try {
      return JSON.parse(row.resolution_data);
    } catch {
      return null;
    }
  }

  /**
   * Set cache entry
   * @private
   */
  _setCache(type, value, data) {
    try {
      this.stmtSetCache.run(
        type,
        value,
        JSON.stringify(data),
        String(this.cacheTtlDays)
      );
    } catch (error) {
      console.warn(`Failed to cache ${type}:${value}:`, error.message);
    }
  }

  /**
   * Deduplicate listings by ticker+exchange
   * @private
   */
  _deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      const key = `${listing.ticker}:${listing.exchange}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Select the primary listing for a company
   * Prefers: home country exchange > largest exchange > first
   * @private
   */
  _selectPrimaryListing(listings, homeCountry) {
    if (!listings || listings.length === 0) return null;
    if (listings.length === 1) return listings[0];

    // Priority order for primary listing selection
    const primaryExchange = this.exchange.getPrimaryExchange(homeCountry);

    // First: match home country primary exchange
    if (primaryExchange) {
      const homeMatch = listings.find(l => l.exchange === primaryExchange);
      if (homeMatch) return homeMatch;
    }

    // Second: match any home country exchange
    const homeCountryListings = listings.filter(l => {
      const info = this.exchange.getExchangeInfo(l.exchange);
      return info?.country === homeCountry;
    });
    if (homeCountryListings.length > 0) return homeCountryListings[0];

    // Third: prefer major exchanges
    const majorExchanges = ['XNYS', 'XNAS', 'XLON', 'XETR', 'XPAR', 'XSWX', 'XTKS'];
    for (const majorMic of majorExchanges) {
      const match = listings.find(l => l.exchange === majorMic);
      if (match) return match;
    }

    // Fallback: first listing
    return listings[0];
  }
}

module.exports = { SymbolResolver };
