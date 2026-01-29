// src/services/xbrl/xbrlFilingsClient.js
const axios = require('axios');

/**
 * XBRL Filings Client
 *
 * Fetches EU/UK XBRL filings from filings.xbrl.org (FREE, no API key required)
 * Coverage: All EU + UK listed companies since 2021 (ESEF mandate)
 *
 * Key advantage: Provides PRE-PARSED xBRL-JSON - no raw XBRL parsing needed!
 */
class XBRLFilingsClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://filings.xbrl.org';
    this.apiUrl = `${this.baseUrl}/api/filings`;
    this.timeout = config.timeout || 30000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Rate limiting: be respectful to free service
    this.requestDelay = config.requestDelay || 200; // 200ms between requests
    this.lastRequestTime = 0;

    console.log('✅ XBRLFilingsClient initialized');
  }

  /**
   * Search filings with various filters
   * @param {Object} filters - Search filters
   * @param {string} filters.lei - Legal Entity Identifier
   * @param {string} filters.country - ISO 2-letter country code (GB, DE, FR, etc.)
   * @param {string} filters.entityName - Company name search
   * @param {string} filters.periodEnd - Period end date (YYYY-MM-DD)
   * @param {number} filters.pageSize - Results per page (default 100, max 500)
   * @param {number} filters.page - Page number (1-indexed)
   * @returns {Promise<Object>} - { filings: [], meta: { total, page, pageSize } }
   */
  async searchFilings(filters = {}) {
    await this._rateLimit();

    const params = new URLSearchParams();

    // Apply filters using JSON:API query syntax
    if (filters.lei) {
      params.append('filter[entity_lei]', filters.lei);
    }
    if (filters.country) {
      params.append('filter[country]', filters.country.toUpperCase());
    }
    if (filters.entityName) {
      params.append('filter[entity_name]', filters.entityName);
    }
    if (filters.periodEnd) {
      params.append('filter[period_end]', filters.periodEnd);
    }

    // Pagination
    const pageSize = Math.min(filters.pageSize || 100, 500);
    params.append('page[size]', pageSize);
    if (filters.page) {
      params.append('page[number]', filters.page);
    }

    // Sort by most recent period end
    params.append('sort', '-period_end');

    const url = `${this.apiUrl}?${params.toString()}`;

    try {
      const response = await this._request(url);

      // Transform to standardized format
      const filings = (response.data || []).map(filing => this._transformFiling(filing));

      return {
        filings,
        meta: {
          total: response.meta?.count || filings.length,
          page: filters.page || 1,
          pageSize: pageSize,
          hasMore: filings.length === pageSize
        }
      };
    } catch (error) {
      console.error('Error searching filings:', error.message);
      throw error;
    }
  }

  /**
   * Get all filings for a specific LEI
   * @param {string} lei - Legal Entity Identifier
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} - Array of filings
   */
  async getFilingsByLEI(lei, options = {}) {
    if (!lei || lei.length !== 20) {
      throw new Error('Invalid LEI: must be 20 characters');
    }

    const result = await this.searchFilings({ ...options, lei });
    return result.filings;
  }

  /**
   * Get all filings for a country
   * @param {string} countryCode - ISO 2-letter country code
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - { filings: [], meta: {} }
   */
  async getFilingsByCountry(countryCode, options = {}) {
    return this.searchFilings({ ...options, country: countryCode });
  }

  /**
   * Get pre-parsed xBRL-JSON for a filing (KEY METHOD)
   * This is the main advantage - no need to parse raw XBRL!
   * @param {string} filingHashOrUrl - Filing hash/ID (fxo_id) or json_url
   * @returns {Promise<Object>} - Parsed xBRL-JSON data
   */
  async getXBRLJson(filingHashOrUrl) {
    if (!filingHashOrUrl) {
      throw new Error('Filing hash or URL is required');
    }

    await this._rateLimit();

    // If it's a URL path, use it directly
    let url;
    if (filingHashOrUrl.startsWith('/')) {
      url = `${this.baseUrl}${filingHashOrUrl}`;
    } else if (filingHashOrUrl.startsWith('http')) {
      url = filingHashOrUrl;
    } else {
      // It's a hash - try to construct URL
      url = `${this.baseUrl}/${filingHashOrUrl}/reports/xbrl-json.json`;
    }

    try {
      const response = await this._request(url);
      return response;
    } catch (error) {
      // Try alternative URL formats
      if (error.response?.status === 404) {
        const alternatives = [
          `${this.baseUrl}/${filingHashOrUrl}/xbrl-json.json`,
          // Extract LEI from hash (first 20 chars) and try that format
        ];

        for (const altUrl of alternatives) {
          try {
            return await this._request(altUrl);
          } catch {
            continue;
          }
        }
        throw new Error(`xBRL-JSON not available for filing ${filingHashOrUrl}`);
      }
      throw error;
    }
  }

  /**
   * Get filing metadata by hash
   * @param {string} filingHash - Filing hash/ID
   * @returns {Promise<Object>} - Filing metadata
   */
  async getFilingMetadata(filingHash) {
    await this._rateLimit();

    const url = `${this.apiUrl}/${filingHash}`;

    try {
      const response = await this._request(url);
      return this._transformFiling(response.data || response);
    } catch (error) {
      console.error(`Error fetching filing metadata for ${filingHash}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all available report types for a filing
   * @param {string} filingHash - Filing hash/ID
   * @returns {Promise<Array>} - Available report types
   */
  async getAvailableReports(filingHash) {
    await this._rateLimit();

    const url = `${this.baseUrl}/${filingHash}/reports`;

    try {
      const response = await this._request(url);
      return response;
    } catch (error) {
      console.error(`Error fetching reports for ${filingHash}:`, error.message);
      return [];
    }
  }

  /**
   * Stream all filings for a country (handles pagination)
   * @param {string} countryCode - ISO 2-letter country code
   * @param {Function} callback - Called with each batch of filings
   * @param {Object} options - Additional options
   */
  async streamFilingsByCountry(countryCode, callback, options = {}) {
    let page = 1;
    let hasMore = true;
    const pageSize = options.pageSize || 100;

    while (hasMore) {
      const result = await this.getFilingsByCountry(countryCode, { page, pageSize, ...options });

      if (result.filings.length > 0) {
        await callback(result.filings, { page, total: result.meta.total });
      }

      hasMore = result.meta.hasMore;
      page++;

      // Safety limit
      if (page > 1000) {
        console.warn('Reached page limit (1000), stopping pagination');
        break;
      }
    }
  }

  /**
   * Transform raw API response to standardized format
   * @private
   */
  _transformFiling(filing) {
    const attrs = filing.attributes || filing;

    // Extract LEI from fxo_id (first 20 characters before the date)
    const fxoId = attrs.fxo_id || '';
    const lei = attrs.entity_lei || (fxoId.length >= 20 ? fxoId.substring(0, 20) : null);

    return {
      id: filing.id || attrs.id,
      hash: fxoId || filing.id,
      entityName: attrs.entity_name,
      entityLEI: lei,
      country: attrs.country,
      periodEnd: attrs.period_end,
      periodStart: attrs.period_start,
      filingDate: attrs.date_added || attrs.filing_date,
      documentType: attrs.document_type,
      currency: attrs.reporting_currency,
      language: attrs.language,
      source: 'filings.xbrl.org',
      // URLs for reports - json_url is the actual path to the JSON file
      jsonUrl: attrs.json_url,
      urls: {
        json: attrs.json_url ? `${this.baseUrl}${attrs.json_url}` : null,
        viewer: attrs.viewer_url ? `${this.baseUrl}${attrs.viewer_url}` : null,
        package: attrs.package_url ? `${this.baseUrl}${attrs.package_url}` : null,
      }
    };
  }

  /**
   * Make HTTP request with retry logic
   * @private
   */
  async _request(url, options = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: this.timeout,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'InvestmentProject-XBRLClient/1.0'
          },
          ...options
        });

        return response.data;
      } catch (error) {
        lastError = error;

        // Don't retry on 404
        if (error.response?.status === 404) {
          throw error;
        }

        // Wait before retry
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * attempt;
          console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt}/${this.retryAttempts})`);
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Rate limiting helper
   * @private
   */
  async _rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.requestDelay) {
      await this._sleep(this.requestDelay - elapsed);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { XBRLFilingsClient };
