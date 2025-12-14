// src/services/secFilingFetcher.js
// Service for fetching SEC filings (S-1, amendments, prospectuses, etc.)

const https = require('https');
const http = require('http');

class SECFilingFetcher {
  constructor(userAgent = 'Stock Analyzer contact@example.com') {
    this.userAgent = userAgent;
    this.baseUrl = 'https://www.sec.gov';
    this.dataBaseUrl = 'https://data.sec.gov';
    this.eftsBaseUrl = 'https://efts.sec.gov';
    this.requestDelay = 100; // 10 requests/sec max per SEC guidelines
    this.lastRequestTime = 0;
    this.cache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Rate limit requests to comply with SEC guidelines
   */
  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.requestDelay) {
      await new Promise(r => setTimeout(r, this.requestDelay - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Generic fetch with rate limiting and error handling
   */
  async fetch(url, options = {}) {
    await this.rateLimit();

    // Check cache
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': options.accept || 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...options.headers
        }
      };

      const req = protocol.request(requestOptions, (res) => {
        let data = '';

        // Handle gzip
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          data = Buffer.concat(chunks).toString();

          if (res.statusCode === 200) {
            // Cache successful responses
            this.cache.set(cacheKey, {
              data,
              timestamp: Date.now()
            });
            resolve(data);
          } else if (res.statusCode === 301 || res.statusCode === 302) {
            // Handle redirects
            const redirectUrl = res.headers.location;
            this.fetch(redirectUrl, options).then(resolve).catch(reject);
          } else if (res.statusCode === 403) {
            reject(new Error(`SEC rate limited: ${res.statusCode}. Wait and retry.`));
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`SEC request failed: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Fetch recent filings via RSS/Atom feed
   * @param {string} formType - Form type (S-1, S-1/A, 424B4, etc.)
   * @param {number} count - Number of results to fetch
   * @returns {Array} Array of filing objects
   */
  async fetchRecentFilings(formType, count = 100) {
    console.log(`  Fetching recent ${formType} filings...`);

    try {
      // URL encode the form type for the request
      const encodedFormType = encodeURIComponent(formType);
      const url = `${this.baseUrl}/cgi-bin/browse-edgar?action=getcurrent&type=${encodedFormType}&company=&dateb=&owner=include&count=${count}&output=atom`;

      const response = await this.fetch(url, { accept: 'application/atom+xml' });
      if (!response) return [];

      // Parse Atom XML
      const filings = this.parseAtomFeed(response, formType);
      console.log(`    Found ${filings.length} ${formType} filings`);

      return filings;
    } catch (error) {
      console.error(`    Error fetching ${formType} filings:`, error.message);
      return [];
    }
  }

  /**
   * Parse SEC Atom feed response
   */
  parseAtomFeed(xml, expectedFormType) {
    const filings = [];

    // Simple XML parsing using regex (avoid XML parser dependency)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const titleRegex = /<title[^>]*>([^<]+)<\/title>/;
    const linkRegex = /<link[^>]*href="([^"]+)"[^>]*\/>/;
    const updatedRegex = /<updated>([^<]+)<\/updated>/;
    const idRegex = /<id>([^<]+)<\/id>/;
    const summaryRegex = /<summary[^>]*>([\s\S]*?)<\/summary>/;

    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      try {
        const title = (titleRegex.exec(entry) || [])[1] || '';
        const link = (linkRegex.exec(entry) || [])[1] || '';
        const updated = (updatedRegex.exec(entry) || [])[1] || '';
        const id = (idRegex.exec(entry) || [])[1] || '';
        const summary = (summaryRegex.exec(entry) || [])[1] || '';

        // Extract CIK from title - format: "Form Type - Company Name (CIK)"
        const cikMatch = title.match(/\((\d{10})\)/);
        const cik = cikMatch ? cikMatch[1] : this.extractCIKFromId(id);

        // Extract company name
        const nameMatch = title.match(/^\s*[\w\/-]+\s*-\s*(.+?)\s*\(\d{10}\)/);
        const companyName = nameMatch ? nameMatch[1].trim() : this.extractCompanyName(summary);

        // Extract form type from title
        const formMatch = title.match(/^([A-Z0-9\/-]+)\s*-/);
        const formType = formMatch ? formMatch[1].trim() : expectedFormType;

        // Extract accession number from id
        const accessionMatch = id.match(/accession-number=(\d{10}-\d{2}-\d{6})/);
        const accessionNumber = accessionMatch ? accessionMatch[1] : this.extractAccessionFromLink(link);

        // Parse filing date
        const filingDate = updated ? updated.split('T')[0] : new Date().toISOString().split('T')[0];

        if (cik && accessionNumber) {
          filings.push({
            cik: cik.replace(/^0+/, ''), // Remove leading zeros
            companyName,
            formType,
            accessionNumber,
            filingDate,
            filingUrl: link
          });
        }
      } catch (parseError) {
        console.warn('    Warning: Failed to parse entry:', parseError.message);
      }
    }

    return filings;
  }

  /**
   * Extract CIK from various ID formats
   */
  extractCIKFromId(id) {
    // Try urn:tag format
    const urnMatch = id.match(/(\d{10})/);
    return urnMatch ? urnMatch[1] : null;
  }

  /**
   * Extract accession number from filing link
   */
  extractAccessionFromLink(link) {
    const match = link.match(/\/(\d{10}-\d{2}-\d{6})/);
    return match ? match[1] : null;
  }

  /**
   * Extract company name from summary
   */
  extractCompanyName(summary) {
    // Clean HTML entities
    const cleaned = summary
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/<[^>]+>/g, '');

    // Look for company name patterns
    const patterns = [
      /Filed by:\s*(.+?)(?:\s*CIK|\s*$)/i,
      /Issuer:\s*(.+?)(?:\s*CIK|\s*$)/i
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) return match[1].trim();
    }

    return 'Unknown Company';
  }

  /**
   * Fetch filings via EDGAR full-text search API
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  async searchFilings(options = {}) {
    const {
      forms = ['S-1'],
      startDate,
      endDate,
      query,
      limit = 100
    } = options;

    console.log(`  Searching filings: ${forms.join(', ')}...`);

    try {
      // Build search URL
      const params = new URLSearchParams();
      params.append('forms', forms.join(','));

      if (startDate && endDate) {
        params.append('dateRange', 'custom');
        params.append('startdt', startDate);
        params.append('enddt', endDate);
      }

      if (query) {
        params.append('q', query);
      }

      const url = `${this.eftsBaseUrl}/LATEST/search-index?${params.toString()}`;

      const response = await this.fetch(url);
      if (!response) return [];

      const data = JSON.parse(response);
      return data.hits?.hits?.slice(0, limit) || [];
    } catch (error) {
      console.error('    Error searching filings:', error.message);
      return [];
    }
  }

  /**
   * Get all submissions for a company by CIK
   * @param {string} cik - Company CIK (with or without leading zeros)
   * @returns {Object} Company submissions data
   */
  async getCompanySubmissions(cik) {
    const paddedCik = cik.toString().padStart(10, '0');
    console.log(`  Fetching submissions for CIK ${paddedCik}...`);

    try {
      const url = `${this.dataBaseUrl}/submissions/CIK${paddedCik}.json`;
      const response = await this.fetch(url);

      if (!response) return null;

      return JSON.parse(response);
    } catch (error) {
      console.error(`    Error fetching submissions for CIK ${paddedCik}:`, error.message);
      return null;
    }
  }

  /**
   * Get filing index (list of documents)
   * @param {string} cik - Company CIK
   * @param {string} accessionNumber - Filing accession number
   * @returns {Object} Filing index data
   */
  async getFilingIndex(cik, accessionNumber) {
    const paddedCik = cik.toString().padStart(10, '0');
    const accessionClean = accessionNumber.replace(/-/g, '');

    try {
      const url = `${this.baseUrl}/Archives/edgar/data/${paddedCik}/${accessionClean}/index.json`;
      const response = await this.fetch(url);

      if (!response) return null;

      return JSON.parse(response);
    } catch (error) {
      console.error('    Error fetching filing index:', error.message);
      return null;
    }
  }

  /**
   * Fetch a specific document from a filing
   * @param {string} cik - Company CIK
   * @param {string} accessionNumber - Filing accession number
   * @param {string} documentName - Document filename
   * @returns {string} Document content
   */
  async getFilingDocument(cik, accessionNumber, documentName) {
    const paddedCik = cik.toString().padStart(10, '0');
    const accessionClean = accessionNumber.replace(/-/g, '');

    try {
      const url = `${this.baseUrl}/Archives/edgar/data/${paddedCik}/${accessionClean}/${documentName}`;
      const response = await this.fetch(url, { accept: 'text/html' });

      return response;
    } catch (error) {
      console.error('    Error fetching filing document:', error.message);
      return null;
    }
  }

  /**
   * Build SEC filing URL
   * @param {string} cik - Company CIK
   * @param {string} accessionNumber - Filing accession number
   * @returns {string} Filing URL
   */
  buildFilingUrl(cik, accessionNumber) {
    const paddedCik = cik.toString().padStart(10, '0');
    const accessionClean = accessionNumber.replace(/-/g, '');
    return `${this.baseUrl}/Archives/edgar/data/${paddedCik}/${accessionClean}/${accessionNumber}-index.htm`;
  }

  /**
   * Get recent IPO-related filings of all types
   * @param {number} daysBack - How many days back to look
   * @returns {Object} Categorized filings
   */
  async getRecentIPOFilings(daysBack = 7) {
    console.log(`Fetching IPO filings from last ${daysBack} days...`);

    const results = {
      registrations: [],    // S-1, F-1
      amendments: [],       // S-1/A, F-1/A
      prospectuses: [],     // 424B forms
      effective: [],        // EFFECT
      withdrawn: [],        // RW
      errors: []
    };

    // Fetch different form types in parallel
    const [s1, s1a, f1, f1a, b424b4, effect] = await Promise.all([
      this.fetchRecentFilings('S-1', 50).catch(e => { results.errors.push(e.message); return []; }),
      this.fetchRecentFilings('S-1/A', 100).catch(e => { results.errors.push(e.message); return []; }),
      this.fetchRecentFilings('F-1', 20).catch(e => { results.errors.push(e.message); return []; }),
      this.fetchRecentFilings('F-1/A', 50).catch(e => { results.errors.push(e.message); return []; }),
      this.fetchRecentFilings('424B4', 50).catch(e => { results.errors.push(e.message); return []; }),
      this.fetchRecentFilings('EFFECT', 50).catch(e => { results.errors.push(e.message); return []; })
    ]);

    results.registrations = [...s1, ...f1];
    results.amendments = [...s1a, ...f1a];
    results.prospectuses = b424b4;
    results.effective = effect;

    console.log(`  Total filings found:`);
    console.log(`    Registrations: ${results.registrations.length}`);
    console.log(`    Amendments: ${results.amendments.length}`);
    console.log(`    Prospectuses: ${results.prospectuses.length}`);
    console.log(`    Effective notices: ${results.effective.length}`);

    return results;
  }

  /**
   * Extract key data from S-1 filing
   * @param {string} cik - Company CIK
   * @param {string} accessionNumber - Filing accession number
   * @returns {Object} Extracted data
   */
  async parseS1Filing(cik, accessionNumber) {
    console.log(`  Parsing S-1 filing ${accessionNumber}...`);

    const result = {
      companyName: null,
      proposedTicker: null,
      proposedExchange: null,
      industry: null,
      sector: null,
      businessDescription: null,
      headquartersState: null,
      revenueLatest: null,
      netIncomeLatest: null,
      totalAssets: null,
      leadUnderwriters: null,
      priceRangeLow: null,
      priceRangeHigh: null,
      sharesOffered: null
    };

    try {
      // Get filing index to find main document
      const index = await this.getFilingIndex(cik, accessionNumber);
      if (!index?.directory?.item) return result;

      // Find primary S-1 document (usually largest HTML file)
      const items = index.directory.item;
      const htmlDoc = items.find(item =>
        item.name.endsWith('.htm') &&
        !item.name.includes('index') &&
        !item.name.includes('FilingSummary')
      );

      if (!htmlDoc) return result;

      // Fetch the document
      const docContent = await this.getFilingDocument(cik, accessionNumber, htmlDoc.name);
      if (!docContent) return result;

      // Extract data using patterns
      result.proposedTicker = this.extractTicker(docContent);
      result.proposedExchange = this.extractExchange(docContent);
      result.businessDescription = this.extractBusinessDescription(docContent);
      result.headquartersState = this.extractHeadquarters(docContent);
      result.leadUnderwriters = this.extractUnderwriters(docContent);

      // Extract price range if present
      const priceData = this.extractPriceRange(docContent);
      result.priceRangeLow = priceData.low;
      result.priceRangeHigh = priceData.high;
      result.sharesOffered = priceData.shares;

      // Try to extract financial data
      const financials = this.extractFinancials(docContent);
      result.revenueLatest = financials.revenue;
      result.netIncomeLatest = financials.netIncome;
      result.totalAssets = financials.totalAssets;

    } catch (error) {
      console.error(`    Error parsing S-1:`, error.message);
    }

    return result;
  }

  /**
   * Extract ticker symbol from document
   */
  extractTicker(content) {
    const patterns = [
      /symbol\s*[:\-"']?\s*["\']?([A-Z]{1,5})["\']?\s*(?:on|for|at)/i,
      /proposed\s+(?:ticker|trading)\s+symbol[:\-\s]*["\']?([A-Z]{1,5})["\']?/i,
      /(?:NASDAQ|NYSE|AMEX|NYSE\s*MKT)[\s:]*["\']?([A-Z]{1,5})["\']?/i,
      /list(?:ed|ing)\s+(?:under\s+the\s+symbol|on)\s*["\']?([A-Z]{1,5})["\']?/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1].toUpperCase();
    }

    return null;
  }

  /**
   * Extract proposed exchange from document
   */
  extractExchange(content) {
    const exchanges = {
      'NASDAQ': ['NASDAQ', 'Nasdaq Global Select', 'Nasdaq Global Market', 'Nasdaq Capital'],
      'NYSE': ['NYSE', 'New York Stock Exchange'],
      'NYSE MKT': ['NYSE MKT', 'NYSE American', 'AMEX']
    };

    const contentUpper = content.toUpperCase();

    for (const [exchange, variants] of Object.entries(exchanges)) {
      for (const variant of variants) {
        if (contentUpper.includes(variant.toUpperCase())) {
          return exchange;
        }
      }
    }

    return null;
  }

  /**
   * Extract business description
   */
  extractBusinessDescription(content) {
    // Look for business section
    const patterns = [
      /(?:overview|our\s+business|business\s+overview)[:\s]*<\/?\w+[^>]*>\s*([\s\S]{100,500}?)(?:<\/p>|<br|<\/div)/i,
      /(?:we\s+are\s+a|the\s+company\s+is\s+a)\s+([\s\S]{50,300}?)(?:\.|\.|<)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        // Clean HTML tags and trim
        return match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 500);
      }
    }

    return null;
  }

  /**
   * Extract headquarters location
   */
  extractHeadquarters(content) {
    const patterns = [
      /(?:headquarters|principal\s+(?:executive\s+)?office)(?:\s+(?:is|are))?\s+(?:located\s+)?(?:in|at)\s+([A-Za-z\s,]+(?:CA|NY|TX|FL|WA|MA|IL|PA|OH|GA|NC|NJ|VA|AZ|CO|MI|MN|WI|OR|TN|MD|IN|MO|SC|AL|LA|KY|OK|CT|IA|MS|AR|KS|NV|UT|NE|NM|WV|ID|HI|NH|ME|MT|RI|DE|SD|ND|AK|VT|WY|DC))/i,
      /(?:address|located)[:\s]+\d+[^,]+,\s+([A-Za-z\s]+,\s*[A-Z]{2})/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        // Extract state abbreviation
        const stateMatch = match[1].match(/([A-Z]{2})\s*$/);
        return stateMatch ? stateMatch[1] : null;
      }
    }

    return null;
  }

  /**
   * Extract underwriters
   */
  extractUnderwriters(content) {
    const patterns = [
      /(?:lead\s+)?(?:book-running\s+)?(?:managing\s+)?underwriters?[:\s]*(?:<[^>]+>)*\s*([A-Za-z\s,&]+(?:Securities|Capital|Partners|LLC|Inc|Co))/i,
      /(?:Goldman\s+Sachs|Morgan\s+Stanley|J\.?P\.?\s*Morgan|Citigroup|BofA\s+Securities|Bank\s+of\s+America|Credit\s+Suisse|Deutsche\s+Bank|Barclays|UBS)/gi
    ];

    const underwriters = [];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        if (Array.isArray(matches)) {
          underwriters.push(...matches.slice(0, 3));
        } else {
          underwriters.push(matches);
        }
      }
    }

    return underwriters.length > 0 ? underwriters.slice(0, 5).join(', ') : null;
  }

  /**
   * Extract price range
   */
  extractPriceRange(content) {
    const result = { low: null, high: null, shares: null };

    // Price range pattern: $X.XX to $Y.YY per share
    const pricePattern = /\$(\d+(?:\.\d{1,2})?)\s*(?:to|and|-)\s*\$(\d+(?:\.\d{1,2})?)\s*per\s*share/i;
    const priceMatch = content.match(pricePattern);

    if (priceMatch) {
      result.low = parseFloat(priceMatch[1]);
      result.high = parseFloat(priceMatch[2]);
    }

    // Shares offered pattern
    const sharesPattern = /(\d{1,3}(?:,\d{3})*)\s*shares\s*of\s*(?:common\s+)?stock/i;
    const sharesMatch = content.match(sharesPattern);

    if (sharesMatch) {
      result.shares = parseInt(sharesMatch[1].replace(/,/g, ''), 10);
    }

    return result;
  }

  /**
   * Extract basic financial data
   */
  extractFinancials(content) {
    const result = { revenue: null, netIncome: null, totalAssets: null };

    // These are rough patterns - real extraction would need more sophisticated parsing
    const revenuePatterns = [
      /total\s+(?:net\s+)?revenue[s]?\s*(?:<[^>]+>)*\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:million|M)/i,
      /(?:net\s+)?revenue[s]?\s+(?:was|were|of)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(?:million|M)/i
    ];

    for (const pattern of revenuePatterns) {
      const match = content.match(pattern);
      if (match) {
        result.revenue = parseFloat(match[1].replace(/,/g, '')) * 1000000;
        break;
      }
    }

    const netIncomePatterns = [
      /net\s+(?:income|loss)[s]?\s*(?:<[^>]+>)*\s*\$?\s*\(?(\d[\d,]*(?:\.\d+)?)\)?\s*(?:million|M)/i
    ];

    for (const pattern of netIncomePatterns) {
      const match = content.match(pattern);
      if (match) {
        result.netIncome = parseFloat(match[1].replace(/,/g, '')) * 1000000;
        break;
      }
    }

    return result;
  }

  /**
   * Parse amendment for updated info
   */
  async parseAmendment(cik, accessionNumber) {
    console.log(`  Parsing amendment ${accessionNumber}...`);

    const result = {
      priceRangeLow: null,
      priceRangeHigh: null,
      sharesOffered: null
    };

    try {
      const index = await this.getFilingIndex(cik, accessionNumber);
      if (!index?.directory?.item) return result;

      const items = index.directory.item;
      const htmlDoc = items.find(item =>
        item.name.endsWith('.htm') &&
        !item.name.includes('index')
      );

      if (!htmlDoc) return result;

      const docContent = await this.getFilingDocument(cik, accessionNumber, htmlDoc.name);
      if (!docContent) return result;

      const priceData = this.extractPriceRange(docContent);
      result.priceRangeLow = priceData.low;
      result.priceRangeHigh = priceData.high;
      result.sharesOffered = priceData.shares;

    } catch (error) {
      console.error(`    Error parsing amendment:`, error.message);
    }

    return result;
  }

  /**
   * Parse 424B prospectus for final pricing
   */
  async parsePricingProspectus(cik, accessionNumber) {
    console.log(`  Parsing pricing prospectus ${accessionNumber}...`);

    const result = {
      finalPrice: null,
      sharesOffered: null,
      ticker: null,
      exchange: null
    };

    try {
      const index = await this.getFilingIndex(cik, accessionNumber);
      if (!index?.directory?.item) return result;

      const items = index.directory.item;
      const htmlDoc = items.find(item =>
        item.name.endsWith('.htm') &&
        !item.name.includes('index')
      );

      if (!htmlDoc) return result;

      const docContent = await this.getFilingDocument(cik, accessionNumber, htmlDoc.name);
      if (!docContent) return result;

      // Final price pattern: usually stated as "public offering price of $X.XX"
      const finalPricePattern = /(?:public\s+offering\s+price|offered\s+at)\s+(?:of\s+)?\$(\d+(?:\.\d{1,2})?)\s*per\s*share/i;
      const priceMatch = docContent.match(finalPricePattern);
      if (priceMatch) {
        result.finalPrice = parseFloat(priceMatch[1]);
      }

      // Also try simple price patterns
      if (!result.finalPrice) {
        const simplePricePattern = /\$(\d+(?:\.\d{1,2})?)\s*per\s*share/i;
        const simpleMatch = docContent.match(simplePricePattern);
        if (simpleMatch) {
          result.finalPrice = parseFloat(simpleMatch[1]);
        }
      }

      // Shares offered
      const sharesPattern = /(\d{1,3}(?:,\d{3})*)\s*shares/i;
      const sharesMatch = docContent.match(sharesPattern);
      if (sharesMatch) {
        result.sharesOffered = parseInt(sharesMatch[1].replace(/,/g, ''), 10);
      }

      result.ticker = this.extractTicker(docContent);
      result.exchange = this.extractExchange(docContent);

    } catch (error) {
      console.error(`    Error parsing prospectus:`, error.message);
    }

    return result;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    console.log('  SEC Filing Fetcher cache cleared');
  }
}

module.exports = SECFilingFetcher;
