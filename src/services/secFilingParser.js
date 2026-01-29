// src/services/secFilingParser.js
// Service for parsing SEC 10-K, 10-Q, and DEF14A filings for PRISM reports

const SECFilingFetcher = require('./secFilingFetcher');
const db = require('../database');

class SECFilingParser {
  constructor() {
    this.fetcher = new SECFilingFetcher('PRISM Investment Analyzer contact@example.com');
    this.database = db.getDatabase();

    // CIK mapping cache
    this.cikCache = new Map();
  }

  /**
   * Get CIK for a symbol from SEC EDGAR
   * @param {string} symbol - Stock ticker symbol
   * @returns {string|null} CIK number
   */
  async getCIK(symbol) {
    // Check cache first
    if (this.cikCache.has(symbol)) {
      return this.cikCache.get(symbol);
    }

    try {
      // Try to get from company tickers JSON
      const tickersUrl = 'https://www.sec.gov/files/company_tickers.json';
      const response = await this.fetcher.fetch(tickersUrl);

      if (response) {
        const data = JSON.parse(response);

        // Search for matching symbol
        for (const key of Object.keys(data)) {
          const company = data[key];
          if (company.ticker && company.ticker.toUpperCase() === symbol.toUpperCase()) {
            const cik = company.cik_str.toString().padStart(10, '0');
            this.cikCache.set(symbol, cik);
            return cik;
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching CIK for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Get recent filings for a company
   * @param {string} symbol - Stock ticker
   * @param {string[]} formTypes - Array of form types to fetch
   * @returns {Array} Array of filing objects
   */
  async getRecentFilings(symbol, formTypes = ['10-K', '10-Q']) {
    const cik = await this.getCIK(symbol);
    if (!cik) {
      console.log(`  Could not find CIK for ${symbol}`);
      return [];
    }

    const submissions = await this.fetcher.getCompanySubmissions(cik);
    if (!submissions || !submissions.filings?.recent) {
      return [];
    }

    const recent = submissions.filings.recent;
    const filings = [];

    // Iterate through recent filings
    for (let i = 0; i < recent.form.length; i++) {
      const formType = recent.form[i];

      if (formTypes.includes(formType)) {
        filings.push({
          formType,
          filingDate: recent.filingDate[i],
          accessionNumber: recent.accessionNumber[i],
          primaryDocument: recent.primaryDocument[i],
          reportDate: recent.reportDate?.[i],
          cik: cik.replace(/^0+/, ''),
          symbol
        });
      }
    }

    return filings;
  }

  /**
   * Get the latest 10-K filing for a company
   * @param {string} symbol - Stock ticker
   * @returns {Object|null} Filing object or null
   */
  async getLatest10K(symbol) {
    const filings = await this.getRecentFilings(symbol, ['10-K']);
    return filings.length > 0 ? filings[0] : null;
  }

  /**
   * Fetch and parse a 10-K filing
   * @param {string} symbol - Stock ticker
   * @param {Object} filing - Filing object from getRecentFilings
   * @returns {Object} Parsed filing data
   */
  async parse10K(symbol, filing = null) {
    console.log(`Parsing 10-K for ${symbol}...`);

    // Get latest filing if not provided
    if (!filing) {
      filing = await this.getLatest10K(symbol);
      if (!filing) {
        console.log(`  No 10-K found for ${symbol}`);
        return null;
      }
    }

    const result = {
      symbol,
      cik: filing.cik,
      formType: '10-K',
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber,
      fiscalYear: this.extractFiscalYear(filing.reportDate || filing.filingDate),
      fiscalPeriod: 'FY',
      businessDescription: null,
      riskFactors: null,
      mdaDiscussion: null,
      competitionSection: null,
      rawSections: {},
      keyMetrics: {},
      filingUrl: this.fetcher.buildFilingUrl(filing.cik, filing.accessionNumber)
    };

    try {
      // Fetch the filing document
      const docContent = await this.fetcher.getFilingDocument(
        filing.cik,
        filing.accessionNumber,
        filing.primaryDocument
      );

      if (!docContent) {
        console.log(`  Could not fetch document for ${symbol}`);
        return result;
      }

      // Parse the sections
      result.businessDescription = this.extractItem1(docContent);
      result.riskFactors = this.extractItem1A(docContent);
      result.mdaDiscussion = this.extractItem7(docContent);
      result.competitionSection = this.extractCompetitionSection(docContent);
      result.keyMetrics = this.extractKeyMetrics(docContent);

      // Store raw sections for future reference
      result.rawSections = {
        item1: result.businessDescription ? true : false,
        item1a: result.riskFactors ? true : false,
        item7: result.mdaDiscussion ? true : false,
        competition: result.competitionSection ? true : false
      };

      console.log(`  Successfully parsed ${symbol} 10-K`);
      console.log(`    - Business Description: ${result.businessDescription ? result.businessDescription.length + ' chars' : 'not found'}`);
      console.log(`    - Risk Factors: ${result.riskFactors ? result.riskFactors.length + ' chars' : 'not found'}`);
      console.log(`    - MD&A: ${result.mdaDiscussion ? result.mdaDiscussion.length + ' chars' : 'not found'}`);

    } catch (error) {
      console.error(`  Error parsing 10-K for ${symbol}:`, error.message);
    }

    return result;
  }

  /**
   * Extract Item 1 - Business Description
   */
  extractItem1(content) {
    // First try XBRL/iXBRL-specific extraction
    const xbrlResult = this.extractXBRLSection(content, 'item1', 'business');
    if (xbrlResult) {
      return this.cleanExtractedText(xbrlResult, 30000);
    }

    const patterns = [
      // Standard patterns with various item formats
      /item\s*1[.\s]*(?:business|description\s*of\s*business)\s*[\r\n]+([\s\S]{500,50000}?)(?=item\s*1a|item\s*2|risk\s*factors)/i,
      // Alternative pattern for different formatting
      /<a[^>]*name="?item1"?[^>]*>[\s\S]*?<\/a>[\s\S]*?([\s\S]{500,50000}?)(?=<a[^>]*name="?item1a|<a[^>]*name="?item2)/i,
      // Pattern for plain text sections
      /(?:^|\n)ITEM\s*1[.\s]+BUSINESS\s*\n+([\s\S]{500,30000}?)(?=\nITEM\s*1A|\nITEM\s*2)/i,
      // XBRL inline pattern - look for id attributes
      /id="?item1[^"]*"?[^>]*>([\s\S]{500,50000}?)(?=id="?item1a|id="?item2|ITEM\s*1A)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.cleanExtractedText(match[1], 30000);
      }
    }

    // Fallback: look for business description keywords
    const fallbackMatch = content.match(
      /(?:our\s+company|company\s+overview|business\s+overview)[:\s]*([\s\S]{200,10000}?)(?=\n\n|\r\n\r\n|<\/p>)/i
    );

    return fallbackMatch ? this.cleanExtractedText(fallbackMatch[1], 10000) : null;
  }

  /**
   * Extract Item 1A - Risk Factors
   */
  extractItem1A(content) {
    // First try XBRL/iXBRL-specific extraction
    const xbrlResult = this.extractXBRLSection(content, 'item1a', 'risk');
    if (xbrlResult) {
      return this.cleanExtractedText(xbrlResult, 50000);
    }

    const patterns = [
      /item\s*1a[.\s]*risk\s*factors\s*[\r\n]+([\s\S]{500,100000}?)(?=item\s*1b|item\s*2|unresolved\s*staff|properties)/i,
      /<a[^>]*name="?item1a"?[^>]*>[\s\S]*?([\s\S]{500,100000}?)(?=<a[^>]*name="?item1b|<a[^>]*name="?item2)/i,
      /(?:^|\n)ITEM\s*1A[.\s]+RISK\s*FACTORS\s*\n+([\s\S]{500,50000}?)(?=\nITEM\s*1B|\nITEM\s*2)/i,
      // XBRL inline pattern
      /id="?item1a[^"]*"?[^>]*>([\s\S]{500,100000}?)(?=id="?item1b|id="?item2|ITEM\s*1B|ITEM\s*2)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.cleanExtractedText(match[1], 50000);
      }
    }

    return null;
  }

  /**
   * Extract Item 7 - MD&A (Management Discussion and Analysis)
   */
  extractItem7(content) {
    // First try XBRL/iXBRL-specific extraction
    const xbrlResult = this.extractXBRLSection(content, 'item7', 'management');
    if (xbrlResult) {
      return this.cleanExtractedText(xbrlResult, 50000);
    }

    const patterns = [
      /item\s*7[.\s]*(?:management['']?s?\s*discussion|md&?a)\s*[\s\S]*?[\r\n]+([\s\S]{500,100000}?)(?=item\s*7a|item\s*8|quantitative\s*and\s*qualitative)/i,
      /<a[^>]*name="?item7"?[^>]*>[\s\S]*?([\s\S]{500,100000}?)(?=<a[^>]*name="?item7a|<a[^>]*name="?item8)/i,
      /(?:^|\n)ITEM\s*7[.\s]+MANAGEMENT['']?S?\s*DISCUSSION\s*[\s\S]*?\n+([\s\S]{500,50000}?)(?=\nITEM\s*7A|\nITEM\s*8)/i,
      // XBRL inline pattern
      /id="?item7[^"]*"?[^>]*>([\s\S]{500,100000}?)(?=id="?item7a|id="?item8|ITEM\s*7A|ITEM\s*8)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.cleanExtractedText(match[1], 50000);
      }
    }

    return null;
  }

  /**
   * Extract competition-related text from Item 1 or elsewhere
   */
  extractCompetitionSection(content) {
    const patterns = [
      // Direct competition section
      /(?:competition|competitive\s*environment|competitive\s*landscape)[:\s]*([\s\S]{200,10000}?)(?=\n\n[A-Z]|\r\n\r\n[A-Z]|<\/p>|<h[1-6])/i,
      // Competition paragraph in business section
      /(?:we\s+compete|our\s+competitors|competitive\s+factors)[^.]*[.]([\s\S]{100,5000}?)(?=\n\n|\r\n\r\n)/i,
      // Our competition header
      /(?:our\s+competition|competitors)[:\s]*([\s\S]{200,8000}?)(?=\n[A-Z]|<\/div>|<h[1-6])/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.cleanExtractedText(match[1], 8000);
      }
    }

    return null;
  }

  /**
   * Extract key metrics mentioned in the filing
   */
  extractKeyMetrics(content) {
    const metrics = {};

    // Revenue patterns
    const revenuePatterns = [
      /(?:total\s+)?(?:net\s+)?revenues?\s+(?:was|were|of)\s+\$?([\d,.]+)\s*(billion|million|B|M)/i,
      /\$?([\d,.]+)\s*(billion|million|B|M)\s+(?:in\s+)?(?:total\s+)?revenues?/i
    ];

    for (const pattern of revenuePatterns) {
      const match = content.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2].toLowerCase();
        const multiplier = (unit === 'billion' || unit === 'b') ? 1e9 : 1e6;
        metrics.revenue = value * multiplier;
        break;
      }
    }

    // Employee count
    const employeeMatch = content.match(
      /(?:approximately\s+)?([\d,]+)\s+(?:full-time\s+)?employees/i
    );
    if (employeeMatch) {
      metrics.employeeCount = parseInt(employeeMatch[1].replace(/,/g, ''), 10);
    }

    // Market position mentions
    const marketPositionPatterns = [
      /(?:leading|largest|#1|number\s+one|market\s+leader)/i,
      /(?:market\s+share|market\s+position)\s+(?:of\s+)?(?:approximately\s+)?([\d.]+)%/i
    ];

    for (const pattern of marketPositionPatterns) {
      const match = content.match(pattern);
      if (match) {
        metrics.hasLeadershipClaim = true;
        if (match[1]) {
          metrics.marketShareClaim = parseFloat(match[1]);
        }
        break;
      }
    }

    // TAM/SAM/SOM mentions
    const tamMatch = content.match(
      /(?:total\s+addressable\s+market|TAM|market\s+opportunity)\s+(?:of\s+)?(?:approximately\s+)?\$?([\d,.]+)\s*(billion|trillion|million)/i
    );
    if (tamMatch) {
      const value = parseFloat(tamMatch[1].replace(/,/g, ''));
      const unit = tamMatch[2].toLowerCase();
      const multiplier = unit === 'trillion' ? 1e12 : (unit === 'billion' ? 1e9 : 1e6);
      metrics.tam = value * multiplier;
    }

    return metrics;
  }

  /**
   * Extract section from XBRL/iXBRL and modern HTML formatted SEC documents
   * Modern SEC filings use inline XBRL with HTML entities for formatting
   */
  extractXBRLSection(content, sectionId, keyword) {
    // Section markers with HTML entity patterns (&#160; = non-breaking space, &#8217; = apostrophe)
    // These patterns match how modern SEC filings format section headers
    const sectionMarkers = {
      'item1': {
        // Start: "Item 1.    Business" with various HTML entity spacings
        startPatterns: [
          /Item\s*1\.(?:&#160;|&nbsp;|\s)+Business/i,
          /ITEM\s*1\.(?:&#160;|&nbsp;|\s)+BUSINESS/i,
          /Item\s*1[.\s\-–—]+Business/i,
          /ITEM\s*1[.\s\-–—]+BUSINESS/i
        ],
        // End: Item 1A starts
        endPatterns: [
          /Item\s*1A\.(?:&#160;|&nbsp;|\s)+Risk\s*Factors/i,
          /ITEM\s*1A\.(?:&#160;|&nbsp;|\s)+RISK\s*FACTORS/i,
          /Item\s*1A[.\s\-–—]+Risk/i,
          /ITEM\s*1A[.\s\-–—]+RISK/i,
          /Item\s*2\.(?:&#160;|&nbsp;|\s)+Properties/i
        ]
      },
      'item1a': {
        startPatterns: [
          /Item\s*1A\.(?:&#160;|&nbsp;|\s)+Risk\s*Factors/i,
          /ITEM\s*1A\.(?:&#160;|&nbsp;|\s)+RISK\s*FACTORS/i,
          /Item\s*1A[.\s\-–—]+Risk\s*Factors/i,
          /ITEM\s*1A[.\s\-–—]+RISK\s*FACTORS/i
        ],
        endPatterns: [
          /Item\s*1B\.(?:&#160;|&nbsp;|\s)+Unresolved/i,
          /ITEM\s*1B\.(?:&#160;|&nbsp;|\s)+UNRESOLVED/i,
          /Item\s*2\.(?:&#160;|&nbsp;|\s)+Properties/i,
          /ITEM\s*2\.(?:&#160;|&nbsp;|\s)+PROPERTIES/i,
          /Item\s*1B[.\s\-–—]+/i,
          /Item\s*2[.\s\-–—]+Properties/i
        ]
      },
      'item7': {
        startPatterns: [
          /Item\s*7\.(?:&#160;|&nbsp;|\s)+Management(?:&#8217;|'|')s/i,
          /ITEM\s*7\.(?:&#160;|&nbsp;|\s)+MANAGEMENT(?:&#8217;|'|')S/i,
          /Item\s*7[.\s\-–—]+Management/i,
          /ITEM\s*7[.\s\-–—]+MANAGEMENT/i
        ],
        endPatterns: [
          /Item\s*7A\.(?:&#160;|&nbsp;|\s)+Quantitative/i,
          /ITEM\s*7A\.(?:&#160;|&nbsp;|\s)+QUANTITATIVE/i,
          /Item\s*8\.(?:&#160;|&nbsp;|\s)+Financial\s*Statements/i,
          /ITEM\s*8\.(?:&#160;|&nbsp;|\s)+FINANCIAL\s*STATEMENTS/i,
          /Item\s*7A[.\s\-–—]+/i,
          /Item\s*8[.\s\-–—]+Financial/i
        ]
      }
    };

    const section = sectionMarkers[sectionId];
    if (!section) return null;

    // Find start position
    let startIndex = -1;
    let matchedPattern = null;
    for (const pattern of section.startPatterns) {
      const match = content.match(pattern);
      if (match) {
        startIndex = match.index;
        matchedPattern = pattern;
        break;
      }
    }

    if (startIndex === -1) return null;

    // Find end position - search from start position + offset to skip the header itself
    const searchOffset = 100; // Skip past the section header
    const remainingContent = content.substring(startIndex + searchOffset);
    let endOffset = Math.min(remainingContent.length, 150000); // Cap at 150k chars per section

    for (const pattern of section.endPatterns) {
      const match = remainingContent.match(pattern);
      if (match && match.index > 100 && match.index < endOffset) {
        // Ensure we're not matching within the same header
        endOffset = match.index;
      }
    }

    // Extract the section
    const sectionContent = content.substring(startIndex, startIndex + searchOffset + endOffset);

    // Validate we got meaningful content (at least 1000 chars of actual text after cleaning)
    if (sectionContent.length < 1000) return null;

    return sectionContent;
  }

  /**
   * Clean extracted text by removing HTML/XBRL tags and normalizing whitespace
   */
  cleanExtractedText(text, maxLength = 30000) {
    if (!text) return null;

    let cleaned = text
      // Remove XBRL-specific tags (ix:nonfraction, ix:continuation, etc.)
      .replace(/<ix:[^>]+>/gi, '')
      .replace(/<\/ix:[^>]+>/gi, '')
      // Remove other namespace tags
      .replace(/<[a-z]+:[^>]+>/gi, ' ')
      .replace(/<\/[a-z]+:[^>]+>/gi, ' ')
      // Remove style blocks
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove script blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, '"')
      .replace(/&ldquo;/g, '"')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&#\d+;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      // Remove excessive whitespace but preserve paragraph breaks
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      // Remove line numbers and table of contents artifacts
      .replace(/^\d+\s+/gm, '')
      .replace(/\.\s*\.\s*\.\s*\d+/g, '')
      // Trim
      .trim();

    // Truncate if too long
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '...';
    }

    return cleaned.length > 100 ? cleaned : null;
  }

  /**
   * Extract fiscal year from date string
   */
  extractFiscalYear(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.getFullYear();
  }

  /**
   * Save parsed filing to database
   */
  async saveFilingToDatabase(parsedFiling) {
    if (!parsedFiling) return null;

    try {
      // Check if we have a company_id for this symbol
      const company = db.getCompany(parsedFiling.symbol);
      const companyId = company ? company.id : null;

      const stmt = this.database.prepare(`
        INSERT INTO sec_filings (
          company_id, symbol, cik, form_type, filing_date, accession_number,
          fiscal_year, fiscal_period, business_description, risk_factors,
          mda_discussion, competition_section, raw_sections, key_metrics,
          filing_url, parse_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, accession_number) DO UPDATE SET
          company_id = excluded.company_id,
          business_description = excluded.business_description,
          risk_factors = excluded.risk_factors,
          mda_discussion = excluded.mda_discussion,
          competition_section = excluded.competition_section,
          raw_sections = excluded.raw_sections,
          key_metrics = excluded.key_metrics,
          parsed_at = CURRENT_TIMESTAMP,
          parse_version = excluded.parse_version
      `);

      const result = stmt.run(
        companyId,
        parsedFiling.symbol,
        parsedFiling.cik,
        parsedFiling.formType,
        parsedFiling.filingDate,
        parsedFiling.accessionNumber,
        parsedFiling.fiscalYear,
        parsedFiling.fiscalPeriod,
        parsedFiling.businessDescription,
        parsedFiling.riskFactors,
        parsedFiling.mdaDiscussion,
        parsedFiling.competitionSection,
        JSON.stringify(parsedFiling.rawSections),
        JSON.stringify(parsedFiling.keyMetrics),
        parsedFiling.filingUrl,
        '1.0'
      );

      console.log(`  Saved ${parsedFiling.symbol} ${parsedFiling.formType} to database`);
      return result;
    } catch (error) {
      console.error('  Error saving filing to database:', error.message);
      return null;
    }
  }

  /**
   * Get cached filing from database
   */
  getCachedFiling(symbol, formType = '10-K') {
    try {
      const stmt = this.database.prepare(`
        SELECT * FROM sec_filings
        WHERE symbol = ? AND form_type = ?
        ORDER BY filing_date DESC
        LIMIT 1
      `);
      return stmt.get(symbol.toUpperCase(), formType);
    } catch (error) {
      console.error('Error getting cached filing:', error.message);
      return null;
    }
  }

  /**
   * Parse and cache 10-K for a symbol (main entry point)
   * @param {string} symbol - Stock ticker
   * @param {boolean} forceRefresh - Force re-parsing even if cached
   * @returns {Object} Parsed filing data
   */
  async parseAndCache10K(symbol, forceRefresh = false) {
    const symbolUpper = symbol.toUpperCase();

    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCachedFiling(symbolUpper, '10-K');
      if (cached) {
        // Check if cached version is recent enough (less than 90 days old)
        const parsedAt = new Date(cached.parsed_at);
        const daysSinceParsed = (Date.now() - parsedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceParsed < 90) {
          console.log(`Using cached 10-K for ${symbolUpper} (parsed ${Math.floor(daysSinceParsed)} days ago)`);
          return {
            ...cached,
            rawSections: cached.raw_sections ? JSON.parse(cached.raw_sections) : {},
            keyMetrics: cached.key_metrics ? JSON.parse(cached.key_metrics) : {},
            fromCache: true
          };
        }
      }
    }

    // Parse fresh filing
    const parsed = await this.parse10K(symbolUpper);

    if (parsed) {
      await this.saveFilingToDatabase(parsed);
    }

    return parsed;
  }

  /**
   * Batch parse 10-K filings for multiple symbols
   * @param {string[]} symbols - Array of stock tickers
   * @param {number} delayMs - Delay between requests (SEC rate limit)
   */
  async batchParse10K(symbols, delayMs = 200) {
    console.log(`\nBatch parsing 10-K filings for ${symbols.length} symbols...`);

    const results = {
      success: [],
      failed: [],
      cached: []
    };

    for (const symbol of symbols) {
      try {
        const cached = this.getCachedFiling(symbol.toUpperCase(), '10-K');

        if (cached) {
          const parsedAt = new Date(cached.parsed_at);
          const daysSinceParsed = (Date.now() - parsedAt.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceParsed < 90) {
            results.cached.push(symbol);
            continue;
          }
        }

        const parsed = await this.parseAndCache10K(symbol, true);

        if (parsed && parsed.businessDescription) {
          results.success.push(symbol);
        } else {
          results.failed.push({ symbol, reason: 'No content extracted' });
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, delayMs));

      } catch (error) {
        results.failed.push({ symbol, reason: error.message });
      }
    }

    console.log('\nBatch parse complete:');
    console.log(`  Success: ${results.success.length}`);
    console.log(`  Cached: ${results.cached.length}`);
    console.log(`  Failed: ${results.failed.length}`);

    return results;
  }
}

module.exports = SECFilingParser;

// If run directly, test with a symbol
if (require.main === module) {
  const parser = new SECFilingParser();

  // Test with Apple
  (async () => {
    console.log('Testing SEC Filing Parser...\n');

    const result = await parser.parseAndCache10K('AAPL');

    if (result) {
      console.log('\nParsed Result:');
      console.log('  Symbol:', result.symbol);
      console.log('  Filing Date:', result.filingDate);
      console.log('  Business Desc Length:', result.businessDescription?.length || 0);
      console.log('  Risk Factors Length:', result.riskFactors?.length || 0);
      console.log('  MD&A Length:', result.mdaDiscussion?.length || 0);
      console.log('  Key Metrics:', result.keyMetrics);
    }
  })();
}
