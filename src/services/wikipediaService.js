// src/services/wikipediaService.js
// Fetches company information from Wikipedia for PRISM report enrichment
// Uses the free Wikipedia API - no API key required

const https = require('https');
const { registry } = require('../utils/circuitBreaker');

class WikipediaService {
  constructor() {
    this.baseUrl = 'https://en.wikipedia.org/api/rest_v1';
    this.searchUrl = 'https://en.wikipedia.org/w/api.php';
    this.cache = new Map();
    this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    // Circuit breaker for Wikipedia API resilience
    this.circuitBreaker = registry.get('wikipedia', {
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
    });
  }

  /**
   * Make HTTP request with circuit breaker protection
   */
  async fetchJSON(url) {
    return this.circuitBreaker.execute(() => this._doFetchJSON(url));
  }

  /**
   * Internal HTTP request implementation
   */
  _doFetchJSON(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'InvestmentProjectBot/1.0 (Research Application)',
          'Accept': 'application/json'
        }
      };

      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Wikipedia request timeout'));
      });
    });
  }

  /**
   * Search Wikipedia for a company page
   */
  async searchCompany(companyName) {
    const cacheKey = `search:${companyName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Clean up company name for search
      const searchName = companyName
        .replace(/\s+(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLC|PLC|Co\.?)$/i, '')
        .trim();

      const url = `${this.searchUrl}?action=query&list=search&srsearch=${encodeURIComponent(searchName + ' company')}&format=json&srlimit=5`;
      const data = await this.fetchJSON(url);

      if (data.query?.search?.length > 0) {
        // Find the best match (prefer exact matches or company pages)
        const results = data.query.search;
        let bestMatch = results[0];

        for (const result of results) {
          const title = result.title.toLowerCase();
          const search = searchName.toLowerCase();

          // Prefer exact or close matches
          if (title === search || title.startsWith(search)) {
            bestMatch = result;
            break;
          }
          // Prefer pages that are clearly company articles
          if (title.includes('(company)') || title.includes('(corporation)')) {
            bestMatch = result;
            break;
          }
        }

        this.cache.set(cacheKey, { data: bestMatch.title, timestamp: Date.now() });
        return bestMatch.title;
      }

      return null;
    } catch (error) {
      console.error(`Wikipedia search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get article summary from Wikipedia
   */
  async getArticleSummary(title) {
    const cacheKey = `summary:${title}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/page/summary/${encodeURIComponent(title)}`;
      const data = await this.fetchJSON(url);

      const summary = {
        title: data.title,
        extract: data.extract,
        description: data.description,
        thumbnail: data.thumbnail?.source,
        pageUrl: data.content_urls?.desktop?.page
      };

      this.cache.set(cacheKey, { data: summary, timestamp: Date.now() });
      return summary;
    } catch (error) {
      console.error(`Wikipedia summary error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get full article content with sections
   */
  async getArticleContent(title) {
    const cacheKey = `content:${title}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      // Get article with parsed sections
      const url = `${this.searchUrl}?action=parse&page=${encodeURIComponent(title)}&format=json&prop=sections|wikitext`;
      const data = await this.fetchJSON(url);

      if (!data.parse) {
        return null;
      }

      const sections = data.parse.sections || [];
      const wikitext = data.parse.wikitext?.['*'] || '';

      // Extract key sections
      const content = {
        title: data.parse.title,
        sections: sections.map(s => ({ title: s.line, level: s.level })),
        hasHistory: sections.some(s => s.line.toLowerCase().includes('history')),
        hasProducts: sections.some(s => s.line.toLowerCase().includes('product')),
        hasControversies: sections.some(s =>
          s.line.toLowerCase().includes('controvers') ||
          s.line.toLowerCase().includes('criticism')
        )
      };

      // Extract founding info from infobox or text
      // Use helper to extract value that may contain templates with pipes
      content.founded = this.extractInfoboxValue(wikitext, 'founded');
      content.founders = this.extractInfoboxValue(wikitext, 'founders') ||
                         this.extractInfoboxValue(wikitext, 'founder');
      content.headquarters = this.extractInfoboxValue(wikitext, 'hq_location') ||
                             this.extractInfoboxValue(wikitext, 'hq_location_city') ||
                             this.extractInfoboxValue(wikitext, 'headquarters') ||
                             this.extractInfoboxValue(wikitext, 'location');
      content.employees = this.extractInfoboxValue(wikitext, 'num_employees');

      this.cache.set(cacheKey, { data: content, timestamp: Date.now() });
      return content;
    } catch (error) {
      console.error(`Wikipedia content error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract history section from Wikipedia
   */
  async getHistorySection(title) {
    try {
      const url = `${this.searchUrl}?action=parse&page=${encodeURIComponent(title)}&section=0&format=json&prop=text`;
      const introData = await this.fetchJSON(url);

      // Also try to get the History section
      const sectionsUrl = `${this.searchUrl}?action=parse&page=${encodeURIComponent(title)}&format=json&prop=sections`;
      const sectionsData = await this.fetchJSON(sectionsUrl);

      let historyText = '';

      if (sectionsData.parse?.sections) {
        const historySection = sectionsData.parse.sections.find(s =>
          s.line.toLowerCase() === 'history' ||
          s.line.toLowerCase().includes('history')
        );

        if (historySection) {
          const historyUrl = `${this.searchUrl}?action=parse&page=${encodeURIComponent(title)}&section=${historySection.index}&format=json&prop=text`;
          const historyData = await this.fetchJSON(historyUrl);

          if (historyData.parse?.text?.['*']) {
            historyText = this.htmlToPlainText(historyData.parse.text['*']);
          }
        }
      }

      // Get introduction text
      let introText = '';
      if (introData.parse?.text?.['*']) {
        introText = this.htmlToPlainText(introData.parse.text['*']);
      }

      return {
        introduction: introText.substring(0, 2000),
        history: historyText.substring(0, 3000)
      };
    } catch (error) {
      console.error(`Wikipedia history section error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get comprehensive company info for PRISM report
   */
  async getCompanyInfo(companyName, symbol) {
    const result = {
      available: false,
      source: 'wikipedia',
      summary: null,
      founded: null,
      founders: null,
      headquarters: null,
      employees: null,
      introduction: null,
      history: null,
      pageUrl: null,
      keyFacts: []
    };

    try {
      // First search for the company
      let title = await this.searchCompany(companyName);

      // If not found, try with symbol
      if (!title && symbol) {
        title = await this.searchCompany(`${symbol} stock`);
      }

      if (!title) {
        console.log(`  Wikipedia: No article found for ${companyName}`);
        return result;
      }

      console.log(`  Wikipedia: Found article "${title}"`);

      // Get summary
      const summary = await this.getArticleSummary(title);
      if (summary) {
        result.summary = summary.extract;
        result.pageUrl = summary.pageUrl;
        result.available = true;
      }

      // Get detailed content
      const content = await this.getArticleContent(title);
      if (content) {
        result.founded = content.founded;
        result.founders = content.founders;
        result.headquarters = content.headquarters;
        result.employees = content.employees;

        // Build key facts
        if (content.founded) result.keyFacts.push(`Founded: ${content.founded}`);
        if (content.founders) result.keyFacts.push(`Founders: ${content.founders}`);
        if (content.headquarters) result.keyFacts.push(`HQ: ${content.headquarters}`);
      }

      // Get history section
      const history = await this.getHistorySection(title);
      if (history) {
        result.introduction = history.introduction;
        result.history = history.history;
      }

    } catch (error) {
      console.error(`  Wikipedia error for ${companyName}: ${error.message}`);
    }

    return result;
  }

  /**
   * Extract a value from Wikipedia infobox, handling nested templates
   */
  extractInfoboxValue(wikitext, fieldName) {
    // Find the field in the infobox
    const fieldRegex = new RegExp(`\\|\\s*${fieldName}\\s*=\\s*`, 'i');
    const fieldMatch = wikitext.match(fieldRegex);

    if (!fieldMatch) return null;

    const startIndex = fieldMatch.index + fieldMatch[0].length;
    let value = '';
    let braceCount = 0;
    let bracketCount = 0;

    // Parse character by character, tracking nested braces/brackets
    for (let i = startIndex; i < wikitext.length; i++) {
      const char = wikitext[i];
      const nextChar = wikitext[i + 1] || '';

      // Track nested templates {{...}}
      if (char === '{' && nextChar === '{') {
        braceCount++;
        value += '{{';
        i++;
        continue;
      }
      if (char === '}' && nextChar === '}') {
        braceCount--;
        value += '}}';
        i++;
        continue;
      }

      // Track nested links [[...]]
      if (char === '[' && nextChar === '[') {
        bracketCount++;
        value += '[[';
        i++;
        continue;
      }
      if (char === ']' && nextChar === ']') {
        bracketCount--;
        value += ']]';
        i++;
        continue;
      }

      // Stop at newline followed by pipe (next field) when not inside nested structure
      if (char === '\n' && braceCount === 0 && bracketCount === 0) {
        // Check if next non-whitespace is a pipe or closing brace
        const rest = wikitext.substring(i).match(/^\s*(\||\}\})/);
        if (rest) break;
      }

      // Stop at pipe when not inside nested structure (same line field)
      if (char === '|' && braceCount === 0 && bracketCount === 0) {
        break;
      }

      value += char;
    }

    value = value.trim();
    if (!value) return null;

    return this.cleanWikiText(value);
  }

  /**
   * Clean Wikipedia markup from text
   */
  cleanWikiText(text) {
    if (!text) return null;

    let cleaned = text;

    // Handle date templates first - replace template with formatted date
    // {{Start date and age|1976|04|01|p=yes}} or {{start date|1976|4|1}}
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    cleaned = cleaned.replace(
      /\{\{[Ss]tart[ _]date(?:[ _]and[ _]age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})[^}]*\}\}/g,
      (match, year, month, day) => {
        return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
      }
    );

    // Handle {{as of}} templates
    cleaned = cleaned.replace(
      /\{\{[Aa]s[ _]of\|(\d{4})\|(\d{1,2})\|(\d{1,2})[^}]*\}\}/g,
      (match, year, month, day) => {
        return `(as of ${months[parseInt(month) - 1]} ${year})`;
      }
    );

    // Handle list templates (Unbulleted list, flatlist, etc.) - extract items separated by |
    cleaned = cleaned.replace(
      /\{\{(?:[Uu]nbulleted[ _]list|[Ff]latlist|[Pp]lainlist|[Hh]list)\s*\|([^}]+)\}\}/g,
      (match, content) => {
        // Split by | and clean each item, join with commas
        const items = content.split('|')
          .map(item => item.trim())
          .filter(item => item && !item.includes('='));
        return items.join(', ');
      }
    );

    // Remove links keeping text
    cleaned = cleaned
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
      .replace(/\[\[([^\]]+)\]\]/g, '$1'); // [[link]] -> link

    // Remove remaining templates
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, '');

    // Clean up
    cleaned = cleaned
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || null;
  }

  /**
   * Convert HTML to plain text
   */
  htmlToPlainText(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '') // Remove citations
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = WikipediaService;

// Test if run directly
if (require.main === module) {
  const service = new WikipediaService();

  // Clear cache for testing
  service.cache.clear();

  (async () => {
    console.log('\n📚 Testing Wikipedia Service...\n');

    // Test with Apple
    console.log('Testing: Apple Inc.');
    const apple = await service.getCompanyInfo('Apple Inc.', 'AAPL');
    console.log(`  Available: ${apple.available}`);
    console.log(`  Founded: ${apple.founded || 'N/A'}`);
    console.log(`  Founders: ${apple.founders || 'N/A'}`);
    console.log(`  HQ: ${apple.headquarters || 'N/A'}`);
    console.log(`  Summary: ${apple.summary?.substring(0, 200)}...`);
    console.log(`  History: ${apple.history ? 'Available' : 'Not available'}`);
    console.log(`  URL: ${apple.pageUrl}`);

    // Test with Microsoft
    console.log('\nTesting: Microsoft Corporation');
    const msft = await service.getCompanyInfo('Microsoft Corporation', 'MSFT');
    console.log(`  Available: ${msft.available}`);
    console.log(`  Founded: ${msft.founded || 'N/A'}`);
    console.log(`  Summary: ${msft.summary?.substring(0, 200)}...`);
  })();
}
