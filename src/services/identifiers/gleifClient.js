// src/services/identifiers/gleifClient.js
// GLEIF API client for LEI (Legal Entity Identifier) lookups
// Uses the free GLEIF API: https://www.gleif.org/en/lei-data/gleif-lei-look-up-api

const axios = require('axios');

class GleifClient {
  constructor() {
    this.baseUrl = 'https://api.gleif.org/api/v1';
    this.timeout = 30000;
  }

  /**
   * Get LEI record by LEI code
   * @param {string} lei - 20-character Legal Entity Identifier
   * @returns {Promise<Object|null>} LEI record or null if not found
   */
  async getLeiRecord(lei) {
    if (!lei || lei.length !== 20) {
      throw new Error('Invalid LEI format - must be 20 characters');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/lei-records/${lei}`,
        { timeout: this.timeout }
      );

      return this._transformRecord(response.data.data);
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }

      if (error.response?.status === 400) {
        throw new Error(`Invalid LEI format: ${lei}`);
      }

      throw new Error(`GLEIF API error: ${error.message}`);
    }
  }

  /**
   * Search for entities by legal name
   * @param {string} name - Company name to search
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching LEI records
   */
  async searchByName(name, options = {}) {
    const {
      exactMatch = false,
      country = null,
      pageSize = 50,
      page = 1
    } = options;

    const params = {
      'page[size]': Math.min(pageSize, 200),
      'page[number]': page
    };

    if (exactMatch) {
      params['filter[entity.legalName]'] = name;
    } else {
      params['filter[fulltext]'] = name;
    }

    if (country) {
      params['filter[entity.legalAddress.country]'] = country;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/lei-records`,
        { params, timeout: this.timeout }
      );

      const records = response.data.data || [];
      return records.map(record => this._transformRecord(record));
    } catch (error) {
      throw new Error(`GLEIF search error: ${error.message}`);
    }
  }

  /**
   * Search for entities by registration number (company registry ID)
   * @param {string} registrationNumber - Company registration number
   * @param {string} country - ISO 3166-1 alpha-2 country code
   * @returns {Promise<Array>} Array of matching LEI records
   */
  async searchByRegistration(registrationNumber, country = null) {
    const params = {
      'filter[entity.registeredAs]': registrationNumber,
      'page[size]': 50
    };

    if (country) {
      params['filter[entity.jurisdiction]'] = country;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/lei-records`,
        { params, timeout: this.timeout }
      );

      const records = response.data.data || [];
      return records.map(record => this._transformRecord(record));
    } catch (error) {
      throw new Error(`GLEIF registration search error: ${error.message}`);
    }
  }

  /**
   * Get ISIN mappings for an LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Promise<Array>} Array of associated ISINs
   */
  async getIsinMappings(lei) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/lei-records/${lei}/isin`,
        { timeout: this.timeout }
      );

      const data = response.data.data || [];
      return data.map(item => ({
        isin: item.attributes?.isin || item.id,
        lei: lei
      }));
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      console.warn(`Failed to get ISIN mappings for ${lei}:`, error.message);
      return [];
    }
  }

  /**
   * Get parent/child relationships for an LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Promise<Object>} Relationship information
   */
  async getRelationships(lei) {
    try {
      const [directParent, ultimateParent] = await Promise.all([
        this._getRelationship(lei, 'direct-parent'),
        this._getRelationship(lei, 'ultimate-parent')
      ]);

      return {
        lei,
        directParent,
        ultimateParent
      };
    } catch (error) {
      console.warn(`Failed to get relationships for ${lei}:`, error.message);
      return { lei, directParent: null, ultimateParent: null };
    }
  }

  /**
   * Batch lookup multiple LEIs
   * @param {Array<string>} leis - Array of LEI codes
   * @returns {Promise<Map>} Map of LEI -> record
   */
  async batchLookup(leis) {
    const results = new Map();

    // GLEIF doesn't have a true batch endpoint, so we parallelize with limits
    const batchSize = 10;

    for (let i = 0; i < leis.length; i += batchSize) {
      const batch = leis.slice(i, i + batchSize);

      const promises = batch.map(async lei => {
        try {
          const record = await this.getLeiRecord(lei);
          return { lei, record };
        } catch (error) {
          console.warn(`Failed to lookup LEI ${lei}:`, error.message);
          return { lei, record: null };
        }
      });

      const batchResults = await Promise.all(promises);

      for (const { lei, record } of batchResults) {
        results.set(lei, record);
      }

      // Brief pause between batches
      if (i + batchSize < leis.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return results;
  }

  /**
   * Validate LEI checksum
   * @param {string} lei - LEI to validate
   * @returns {boolean} True if valid
   */
  static validateLei(lei) {
    if (!lei || typeof lei !== 'string' || lei.length !== 20) {
      return false;
    }

    // LEI format: 4 alphanumeric (LOU) + 14 alphanumeric (entity) + 2 digits (checksum)
    if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) {
      return false;
    }

    // ISO 17442 checksum validation using MOD 97-10 (similar to IBAN)
    const numericLei = lei
      .split('')
      .map(char => {
        const code = char.charCodeAt(0);
        // Convert letters to numbers (A=10, B=11, ..., Z=35)
        if (code >= 65 && code <= 90) {
          return (code - 55).toString();
        }
        return char;
      })
      .join('');

    // Calculate MOD 97
    let remainder = 0;
    for (let i = 0; i < numericLei.length; i++) {
      remainder = (remainder * 10 + parseInt(numericLei[i])) % 97;
    }

    return remainder === 1;
  }

  /**
   * Get relationship data
   * @private
   */
  async _getRelationship(lei, type) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/lei-records/${lei}/${type}`,
        { timeout: this.timeout }
      );

      const data = response.data.data;
      if (!data) return null;

      return {
        lei: data.id,
        name: data.attributes?.entity?.legalName?.name,
        country: data.attributes?.entity?.legalAddress?.country,
        status: data.attributes?.entity?.status
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Transform raw GLEIF record to normalized format
   * @private
   */
  _transformRecord(data) {
    if (!data) return null;

    const attributes = data.attributes || {};
    const entity = attributes.entity || {};
    const registration = attributes.registration || {};

    // Extract legal address
    const legalAddress = entity.legalAddress || {};

    // Extract headquarters address
    const hqAddress = entity.headquartersAddress || {};

    // Extract other names
    const otherNames = (entity.otherNames || []).map(n => ({
      name: n.name,
      type: n.type,
      language: n.language
    }));

    return {
      lei: data.id,
      legalName: entity.legalName?.name,
      legalNameLanguage: entity.legalName?.language,
      otherNames,

      // Status
      status: entity.status,
      entityCategory: entity.category,
      entitySubCategory: entity.subCategory,
      legalForm: entity.legalForm?.id,

      // Registration
      registeredAs: entity.registeredAs,
      registrationAuthority: entity.registrationAuthority?.id,
      jurisdiction: entity.jurisdiction,

      // Legal address
      legalAddress: {
        line1: legalAddress.addressLines?.[0],
        line2: legalAddress.addressLines?.[1],
        city: legalAddress.city,
        region: legalAddress.region,
        country: legalAddress.country,
        postalCode: legalAddress.postalCode
      },

      // Headquarters address
      headquartersAddress: {
        line1: hqAddress.addressLines?.[0],
        line2: hqAddress.addressLines?.[1],
        city: hqAddress.city,
        region: hqAddress.region,
        country: hqAddress.country,
        postalCode: hqAddress.postalCode
      },

      // Country shortcuts
      country: legalAddress.country,
      headquartersCountry: hqAddress.country,

      // LEI registration info
      initialRegistrationDate: registration.initialRegistrationDate,
      lastUpdateDate: registration.lastUpdateDate,
      nextRenewalDate: registration.nextRenewalDate,
      managingLou: registration.managingLou,
      registrationStatus: registration.status
    };
  }
}

module.exports = { GleifClient };
