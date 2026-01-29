// src/services/xbrl/enrichmentService.js

/**
 * Enrichment Service
 *
 * Fetches additional company data (sector, industry, etc.) for EU/UK companies
 * from external sources like Yahoo Finance, OpenFIGI, or GLEIF.
 *
 * This fills gaps in XBRL data which doesn't include sector/industry classification.
 */

const axios = require('axios');

class EnrichmentService {
  constructor(database) {
    this.db = database;
    this._prepareStatements();
    console.log('✅ EnrichmentService initialized');
  }

  /**
   * Prepare SQL statements
   * @private
   */
  _prepareStatements() {
    this.stmtGetCompaniesWithoutSector = this.db.prepare(`
      SELECT id, symbol, name, country, lei, isin
      FROM companies
      WHERE (sector IS NULL OR sector = '')
        AND is_active = 1
      ORDER BY id
    `);

    this.stmtUpdateCompanySector = this.db.prepare(`
      UPDATE companies
      SET sector = ?, industry = ?, last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtGetCompanyBySymbol = this.db.prepare(`
      SELECT id, symbol, name, country FROM companies WHERE symbol = ?
    `);
  }

  /**
   * Enrich a single company with sector/industry from Yahoo Finance
   * @param {Object} company - Company record with symbol, name, country
   * @returns {Object} - { success, sector, industry, error }
   */
  async enrichFromYahoo(company) {
    const { id, symbol, name, country } = company;

    // Try to build a Yahoo Finance compatible symbol
    const yahooSymbol = this._buildYahooSymbol(symbol, country);

    if (!yahooSymbol) {
      return { success: false, error: 'Cannot build Yahoo symbol' };
    }

    try {
      // Use Yahoo Finance v8 API (free, no key required)
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestmentApp/1.0)'
        }
      });

      const result = response.data?.chart?.result?.[0];
      if (!result) {
        return { success: false, error: 'No data from Yahoo' };
      }

      // Extract sector from quote summary
      // Note: This endpoint might not return sector directly
      // We may need to use quoteSummary endpoint instead
      return { success: false, error: 'Need quoteSummary endpoint' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Enrich company using Yahoo Finance quoteSummary (has sector info)
   * @param {Object} company - Company record
   * @returns {Object} - Enrichment result
   */
  async enrichFromYahooQuoteSummary(company) {
    const { id, symbol, name, country, lei } = company;

    // Try Yahoo symbol or LEI-based lookup
    let yahooSymbol = this._buildYahooSymbol(symbol, country);

    // If symbol looks like a LEI (20 chars), try name-based search
    if (!yahooSymbol || symbol.length === 20) {
      yahooSymbol = await this._searchYahooByName(name, country);
    }

    if (!yahooSymbol) {
      return { success: false, error: 'Cannot find Yahoo symbol', companyId: id };
    }

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile`;

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const profile = response.data?.quoteSummary?.result?.[0]?.assetProfile;

      if (!profile) {
        return { success: false, error: 'No profile data', companyId: id };
      }

      const sector = profile.sector || null;
      const industry = profile.industry || null;

      if (sector || industry) {
        // Update the database
        this.stmtUpdateCompanySector.run(sector, industry, id);

        return {
          success: true,
          companyId: id,
          symbol: yahooSymbol,
          sector,
          industry
        };
      }

      return { success: false, error: 'No sector/industry in profile', companyId: id };
    } catch (error) {
      if (error.response?.status === 404) {
        return { success: false, error: 'Symbol not found on Yahoo', companyId: id };
      }
      return { success: false, error: error.message, companyId: id };
    }
  }

  /**
   * Search Yahoo Finance by company name to find symbol
   * @private
   */
  async _searchYahooByName(name, country) {
    if (!name) return null;

    try {
      // Clean up name for search
      const searchName = name
        .replace(/\b(plc|ltd|limited|inc|corp|corporation|ag|sa|nv|se)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .substring(0, 50);

      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchName)}&quotesCount=5&newsCount=0`;

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const quotes = response.data?.quotes || [];

      // Try to find a match in the target country
      const countryMatch = quotes.find(q =>
        q.exchange &&
        this._exchangeMatchesCountry(q.exchange, country)
      );

      if (countryMatch) {
        return countryMatch.symbol;
      }

      // Fall back to first equity result
      const equity = quotes.find(q => q.quoteType === 'EQUITY');
      return equity?.symbol || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if exchange matches country
   * @private
   */
  _exchangeMatchesCountry(exchange, country) {
    const exchangeCountryMap = {
      'LSE': 'GB', 'LON': 'GB',
      'FRA': 'DE', 'XETRA': 'DE', 'ETR': 'DE',
      'EPA': 'FR', 'PAR': 'FR',
      'AMS': 'NL', 'EAM': 'NL',
      'SIX': 'CH', 'EBS': 'CH',
      'BME': 'ES', 'MCE': 'ES',
      'BIT': 'IT', 'MIL': 'IT',
      'STO': 'SE', 'OMX': 'SE',
      'CPH': 'DK',
      'OSL': 'NO',
      'HEL': 'FI',
      'VIE': 'AT',
    };

    return exchangeCountryMap[exchange] === country;
  }

  /**
   * Build Yahoo Finance symbol from our symbol and country
   * @private
   */
  _buildYahooSymbol(symbol, country) {
    if (!symbol) return null;

    // If symbol already has suffix, use as-is
    if (symbol.includes('.')) return symbol;

    // If it's a LEI (20 chars), can't build Yahoo symbol directly
    if (symbol.length === 20 && /^[A-Z0-9]+$/.test(symbol)) {
      return null;
    }

    // Add exchange suffix based on country
    const suffixMap = {
      'GB': '.L',     // London
      'UK': '.L',
      'DE': '.DE',    // Germany (XETRA)
      'FR': '.PA',    // Paris
      'NL': '.AS',    // Amsterdam
      'ES': '.MC',    // Madrid
      'IT': '.MI',    // Milan
      'CH': '.SW',    // Swiss
      'SE': '.ST',    // Stockholm
      'DK': '.CO',    // Copenhagen
      'NO': '.OL',    // Oslo
      'FI': '.HE',    // Helsinki
      'BE': '.BR',    // Brussels
      'AT': '.VI',    // Vienna
      'PT': '.LS',    // Lisbon
      'IE': '.IR',    // Ireland
    };

    const suffix = suffixMap[country];
    if (!suffix) return symbol; // Try without suffix for US or unknown

    return symbol + suffix;
  }

  /**
   * Enrich all companies without sector/industry
   * @param {Object} options - { limit, delay }
   * @returns {Object} - Summary { total, enriched, failed, errors }
   */
  async enrichAllWithoutSector(options = {}) {
    const { limit = 100, delay = 1000 } = options;

    const companies = this.stmtGetCompaniesWithoutSector.all();
    const toProcess = companies.slice(0, limit);

    console.log(`Found ${companies.length} companies without sector, processing ${toProcess.length}`);

    const summary = {
      total: toProcess.length,
      enriched: 0,
      failed: 0,
      errors: []
    };

    for (const company of toProcess) {
      try {
        const result = await this.enrichFromYahooQuoteSummary(company);

        if (result.success) {
          summary.enriched++;
          console.log(`  ✓ ${company.name}: ${result.sector} / ${result.industry}`);
        } else {
          summary.failed++;
          summary.errors.push({ company: company.name, error: result.error });
        }

        // Rate limiting - be respectful to Yahoo
        await this._sleep(delay);
      } catch (error) {
        summary.failed++;
        summary.errors.push({ company: company.name, error: error.message });
      }
    }

    console.log(`\nEnrichment complete: ${summary.enriched} enriched, ${summary.failed} failed`);
    return summary;
  }

  /**
   * Get enrichment statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_active = 1').get();
    const withSector = this.db.prepare('SELECT COUNT(*) as count FROM companies WHERE sector IS NOT NULL AND LENGTH(sector) > 0 AND is_active = 1').get();
    const withIndustry = this.db.prepare('SELECT COUNT(*) as count FROM companies WHERE industry IS NOT NULL AND LENGTH(industry) > 0 AND is_active = 1').get();

    const byCountry = this.db.prepare(`
      SELECT
        country,
        COUNT(*) as total,
        SUM(CASE WHEN sector IS NOT NULL AND LENGTH(sector) > 0 THEN 1 ELSE 0 END) as with_sector
      FROM companies
      WHERE is_active = 1
      GROUP BY country
      ORDER BY total DESC
      LIMIT 20
    `).all();

    return {
      totalCompanies: total.count,
      withSector: withSector.count,
      withIndustry: withIndustry.count,
      withoutSector: total.count - withSector.count,
      coverageByCountry: byCountry
    };
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { EnrichmentService };
