// src/services/xbrl/companiesHouseClient.js
const axios = require('axios');

/**
 * Companies House Client
 *
 * Fetches UK company data from Companies House API
 * Coverage: 4+ million UK companies
 * Cost: FREE (requires free API key from https://developer.company-information.service.gov.uk/)
 * Rate Limit: 600 requests / 5 minutes
 */
class CompaniesHouseClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.COMPANIES_HOUSE_API_KEY;

    if (!this.apiKey) {
      console.warn('⚠️ COMPANIES_HOUSE_API_KEY not set. Get free key at: https://developer.company-information.service.gov.uk/');
    }

    this.baseUrl = config.baseUrl || 'https://api.company-information.service.gov.uk';
    this.timeout = config.timeout || 30000;

    // Rate limiting: 600 requests / 5 minutes = 2 req/sec
    this.requestDelay = config.requestDelay || 500; // 500ms between requests
    this.lastRequestTime = 0;

    // Request tracking for rate limit compliance
    this.requestWindow = [];
    this.windowDuration = 5 * 60 * 1000; // 5 minutes
    this.maxRequestsPerWindow = 600;

    console.log('✅ CompaniesHouseClient initialized');
  }

  /**
   * Get company profile by company number
   * @param {string} companyNumber - UK company number (8 chars, e.g., '00000006')
   * @returns {Promise<Object>} - Company profile
   */
  async getCompany(companyNumber) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    return this._request(`/company/${normalized}`);
  }

  /**
   * Search for companies by name
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.itemsPerPage - Results per page (default 20, max 100)
   * @param {number} options.startIndex - Starting index for pagination
   * @returns {Promise<Object>} - Search results
   */
  async searchCompanies(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      items_per_page: Math.min(options.itemsPerPage || 20, 100)
    });

    if (options.startIndex) {
      params.append('start_index', options.startIndex);
    }

    const result = await this._request(`/search/companies?${params}`);

    return {
      companies: (result.items || []).map(item => this._transformCompanySearchResult(item)),
      meta: {
        total: result.total_results || 0,
        startIndex: result.start_index || 0,
        itemsPerPage: result.items_per_page || 20
      }
    };
  }

  /**
   * Get company filing history
   * @param {string} companyNumber - UK company number
   * @param {Object} options - Filter options
   * @param {string} options.category - Filing category (accounts, confirmation-statement, etc.)
   * @param {number} options.itemsPerPage - Results per page
   * @returns {Promise<Object>} - Filing history
   */
  async getFilingHistory(companyNumber, options = {}) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    const params = new URLSearchParams();

    if (options.category) {
      params.append('category', options.category);
    }
    if (options.itemsPerPage) {
      params.append('items_per_page', Math.min(options.itemsPerPage, 100));
    }
    if (options.startIndex) {
      params.append('start_index', options.startIndex);
    }

    const queryString = params.toString() ? `?${params}` : '';
    const result = await this._request(`/company/${normalized}/filing-history${queryString}`);

    return {
      filings: (result.items || []).map(item => this._transformFiling(item)),
      meta: {
        total: result.total_count || 0,
        startIndex: result.start_index || 0,
        itemsPerPage: result.items_per_page || 25
      }
    };
  }

  /**
   * Get company officers (directors, secretaries)
   * @param {string} companyNumber - UK company number
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - Officers list
   */
  async getOfficers(companyNumber, options = {}) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    const params = new URLSearchParams();

    if (options.itemsPerPage) {
      params.append('items_per_page', Math.min(options.itemsPerPage, 100));
    }
    if (options.startIndex) {
      params.append('start_index', options.startIndex);
    }

    const queryString = params.toString() ? `?${params}` : '';
    const result = await this._request(`/company/${normalized}/officers${queryString}`);

    return {
      officers: (result.items || []).map(item => this._transformOfficer(item)),
      meta: {
        total: result.total_results || result.active_count || 0,
        activeCount: result.active_count || 0,
        resignedCount: result.resigned_count || 0
      }
    };
  }

  /**
   * Get persons with significant control (PSC)
   * @param {string} companyNumber - UK company number
   * @returns {Promise<Object>} - PSC list
   */
  async getPersonsWithSignificantControl(companyNumber) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    const result = await this._request(`/company/${normalized}/persons-with-significant-control`);

    return {
      psc: (result.items || []).map(item => ({
        name: item.name,
        naturesOfControl: item.natures_of_control || [],
        kind: item.kind,
        nationality: item.nationality,
        countryOfResidence: item.country_of_residence,
        notifiedOn: item.notified_on,
        ceasedOn: item.ceased_on
      })),
      meta: {
        total: result.total_results || 0,
        activeCount: result.active_count || 0
      }
    };
  }

  /**
   * Get company charges (mortgages, liens)
   * @param {string} companyNumber - UK company number
   * @returns {Promise<Object>} - Charges list
   */
  async getCharges(companyNumber) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    const result = await this._request(`/company/${normalized}/charges`);

    return {
      charges: (result.items || []).map(item => ({
        id: item.id,
        status: item.status,
        classification: item.classification?.description,
        createdOn: item.created_on,
        deliveredOn: item.delivered_on,
        satisfiedOn: item.satisfied_on,
        particulars: item.particulars?.description,
        personsEntitled: item.persons_entitled?.map(p => p.name) || []
      })),
      meta: {
        total: result.total_count || 0,
        satisfiedCount: result.satisfied_count || 0,
        partSatisfiedCount: result.part_satisfied_count || 0,
        unresolvedCount: result.unfiltered_count || 0
      }
    };
  }

  /**
   * Get document metadata for a filing
   * @param {string} companyNumber - UK company number
   * @param {string} filingId - Transaction ID from filing history
   * @returns {Promise<Object>} - Document metadata
   */
  async getFilingDocument(companyNumber, filingId) {
    const normalized = this._normalizeCompanyNumber(companyNumber);
    return this._request(`/company/${normalized}/filing-history/${filingId}`);
  }

  /**
   * Advanced search for companies with specific criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Object>} - Search results
   */
  async advancedSearch(criteria = {}) {
    const params = new URLSearchParams();

    if (criteria.companyName) params.append('company_name_includes', criteria.companyName);
    if (criteria.location) params.append('location', criteria.location);
    if (criteria.incorporatedFrom) params.append('incorporated_from', criteria.incorporatedFrom);
    if (criteria.incorporatedTo) params.append('incorporated_to', criteria.incorporatedTo);
    if (criteria.companyStatus) params.append('company_status', criteria.companyStatus);
    if (criteria.companyType) params.append('company_type', criteria.companyType);
    if (criteria.sicCodes) params.append('sic_codes', criteria.sicCodes);

    params.append('size', Math.min(criteria.size || 20, 100));
    if (criteria.startIndex) params.append('start_index', criteria.startIndex);

    const result = await this._request(`/advanced-search/companies?${params}`);

    return {
      companies: (result.items || []).map(item => this._transformCompanySearchResult(item)),
      meta: {
        total: result.hits || 0,
        startIndex: criteria.startIndex || 0
      }
    };
  }

  /**
   * Get company insolvency information
   * @param {string} companyNumber - UK company number
   * @returns {Promise<Object>} - Insolvency data
   */
  async getInsolvency(companyNumber) {
    const normalized = this._normalizeCompanyNumber(companyNumber);

    try {
      const result = await this._request(`/company/${normalized}/insolvency`);
      return {
        cases: (result.cases || []).map(c => ({
          type: c.type,
          dates: c.dates,
          practitioners: c.practitioners?.map(p => ({
            name: p.name,
            address: p.address,
            role: p.role,
            appointedOn: p.appointed_on,
            ceasedToActOn: p.ceased_to_act_on
          })) || [],
          notes: c.notes
        })),
        status: result.status
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { cases: [], status: 'none' };
      }
      throw error;
    }
  }

  /**
   * Transform company search result to standard format
   * @private
   */
  _transformCompanySearchResult(item) {
    return {
      companyNumber: item.company_number,
      companyName: item.title || item.company_name,
      companyStatus: item.company_status,
      companyType: item.company_type,
      dateOfCreation: item.date_of_creation,
      dateOfCessation: item.date_of_cessation,
      registeredAddress: item.address ? {
        line1: item.address.address_line_1,
        line2: item.address.address_line_2,
        locality: item.address.locality,
        region: item.address.region,
        postalCode: item.address.postal_code,
        country: item.address.country
      } : null,
      sicCodes: item.sic_codes || [],
      snippet: item.snippet,
      links: {
        self: item.links?.self
      }
    };
  }

  /**
   * Transform filing to standard format
   * @private
   */
  _transformFiling(item) {
    return {
      transactionId: item.transaction_id,
      category: item.category,
      type: item.type,
      description: item.description,
      date: item.date,
      madeUpDate: item.made_up_date,
      barcode: item.barcode,
      paperFiled: item.paper_filed || false,
      links: {
        self: item.links?.self,
        document: item.links?.document_metadata
      }
    };
  }

  /**
   * Transform officer to standard format
   * @private
   */
  _transformOfficer(item) {
    return {
      name: item.name,
      role: item.officer_role,
      appointedOn: item.appointed_on,
      resignedOn: item.resigned_on,
      nationality: item.nationality,
      countryOfResidence: item.country_of_residence,
      occupation: item.occupation,
      dateOfBirth: item.date_of_birth ? {
        month: item.date_of_birth.month,
        year: item.date_of_birth.year
      } : null,
      address: item.address ? {
        line1: item.address.address_line_1,
        line2: item.address.address_line_2,
        locality: item.address.locality,
        region: item.address.region,
        postalCode: item.address.postal_code,
        country: item.address.country
      } : null
    };
  }

  /**
   * Normalize company number to 8 characters with leading zeros
   * @private
   */
  _normalizeCompanyNumber(companyNumber) {
    if (!companyNumber) {
      throw new Error('Company number is required');
    }

    // Remove any spaces or dashes
    let normalized = companyNumber.toString().replace(/[\s-]/g, '').toUpperCase();

    // Handle prefixed numbers (SC, NI, etc.)
    const prefixMatch = normalized.match(/^([A-Z]{2})(\d+)$/);
    if (prefixMatch) {
      const [, prefix, num] = prefixMatch;
      normalized = prefix + num.padStart(6, '0');
    } else if (/^\d+$/.test(normalized)) {
      // Pure numeric - pad to 8 digits
      normalized = normalized.padStart(8, '0');
    }

    return normalized;
  }

  /**
   * Make HTTP request with rate limiting and retry logic
   * @private
   */
  async _request(endpoint) {
    if (!this.apiKey) {
      throw new Error('COMPANIES_HOUSE_API_KEY is required. Get free key at: https://developer.company-information.service.gov.uk/');
    }

    await this._rateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'User-Agent': 'InvestmentProject-CompaniesHouseClient/1.0'
        }
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;

        if (status === 401) {
          throw new Error('Invalid Companies House API key');
        }
        if (status === 404) {
          throw Object.assign(new Error('Resource not found'), { response: error.response });
        }
        if (status === 429) {
          // Rate limited - wait and retry once
          console.warn('Companies House rate limit hit, waiting 60 seconds...');
          await this._sleep(60000);
          return this._request(endpoint);
        }

        throw new Error(`Companies House API error: ${status} - ${error.response.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Rate limiting helper - ensures we stay under 600 req/5min
   * @private
   */
  async _rateLimit() {
    const now = Date.now();

    // Clean old requests from window
    this.requestWindow = this.requestWindow.filter(
      time => now - time < this.windowDuration
    );

    // Check if we're at the limit
    if (this.requestWindow.length >= this.maxRequestsPerWindow) {
      const oldestRequest = this.requestWindow[0];
      const waitTime = this.windowDuration - (now - oldestRequest) + 1000;
      console.warn(`Rate limit approaching, waiting ${Math.round(waitTime / 1000)}s...`);
      await this._sleep(waitTime);
    }

    // Enforce minimum delay between requests
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.requestDelay) {
      await this._sleep(this.requestDelay - elapsed);
    }

    this.lastRequestTime = Date.now();
    this.requestWindow.push(this.lastRequestTime);
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { CompaniesHouseClient };
