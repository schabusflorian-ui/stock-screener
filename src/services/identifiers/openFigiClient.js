// src/services/identifiers/openFigiClient.js
// OpenFIGI API client for mapping ISIN/ticker to FIGI identifiers
// Uses Bloomberg's free OpenFIGI API: https://www.openfigi.com/

const axios = require('axios');

class OpenFigiClient {
  constructor(apiKey = null) {
    this.baseUrl = 'https://api.openfigi.com/v3';
    this.apiKey = apiKey || process.env.OPENFIGI_API_KEY;
    this.headers = { 'Content-Type': 'application/json' };

    if (this.apiKey) {
      this.headers['X-OPENFIGI-APIKEY'] = this.apiKey;
    }

    // Rate limiting: 25 req/min with key, 5 req/min without
    this.rateLimit = this.apiKey ? 25 : 5;
    this.requestCount = 0;
    this.lastReset = Date.now();
  }

  /**
   * Map ISIN to FIGI/ticker information
   * @param {string} isin - 12-character ISIN
   * @param {string} exchangeCode - Optional MIC exchange code (e.g., 'XLON', 'XETR')
   * @returns {Promise<Array>} Array of matching securities
   */
  async mapISIN(isin, exchangeCode = null) {
    const job = { idType: 'ID_ISIN', idValue: isin };
    if (exchangeCode) {
      job.exchCode = exchangeCode;
    }

    const results = await this._request([job]);
    return this._parseResults(results[0]);
  }

  /**
   * Map ticker symbol to FIGI information
   * @param {string} ticker - Stock ticker symbol
   * @param {string} exchangeCode - MIC exchange code (required for accuracy)
   * @returns {Promise<Array>} Array of matching securities
   */
  async mapTicker(ticker, exchangeCode) {
    const job = {
      idType: 'TICKER',
      idValue: ticker.toUpperCase()
    };

    if (exchangeCode) {
      job.exchCode = exchangeCode;
    }

    const results = await this._request([job]);
    return this._parseResults(results[0]);
  }

  /**
   * Map CUSIP to FIGI information
   * @param {string} cusip - 9-character CUSIP
   * @returns {Promise<Array>} Array of matching securities
   */
  async mapCUSIP(cusip) {
    const results = await this._request([{
      idType: 'ID_CUSIP',
      idValue: cusip
    }]);
    return this._parseResults(results[0]);
  }

  /**
   * Map SEDOL to FIGI information
   * @param {string} sedol - 7-character SEDOL (UK/Ireland)
   * @returns {Promise<Array>} Array of matching securities
   */
  async mapSEDOL(sedol) {
    const results = await this._request([{
      idType: 'ID_SEDOL',
      idValue: sedol
    }]);
    return this._parseResults(results[0]);
  }

  /**
   * Batch map multiple ISINs
   * @param {Array<string>} isins - Array of ISIN codes
   * @returns {Promise<Map>} Map of ISIN -> results
   */
  async batchMapISINs(isins) {
    // OpenFIGI allows up to 100 jobs per request
    const batchSize = 100;
    const mapping = new Map();

    for (let i = 0; i < isins.length; i += batchSize) {
      const batch = isins.slice(i, i + batchSize);
      const jobs = batch.map(isin => ({ idType: 'ID_ISIN', idValue: isin }));

      const results = await this._request(jobs);

      batch.forEach((isin, idx) => {
        mapping.set(isin, this._parseResults(results[idx]));
      });

      // Brief pause between batches to respect rate limits
      if (i + batchSize < isins.length) {
        await this._sleep(100);
      }
    }

    return mapping;
  }

  /**
   * Batch map multiple tickers with their exchanges
   * @param {Array<{ticker: string, exchangeCode: string}>} items
   * @returns {Promise<Map>} Map of ticker -> results
   */
  async batchMapTickers(items) {
    const batchSize = 100;
    const mapping = new Map();

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const jobs = batch.map(item => ({
        idType: 'TICKER',
        idValue: item.ticker.toUpperCase(),
        exchCode: item.exchangeCode
      }));

      const results = await this._request(jobs);

      batch.forEach((item, idx) => {
        const key = `${item.ticker}:${item.exchangeCode}`;
        mapping.set(key, this._parseResults(results[idx]));
      });

      if (i + batchSize < items.length) {
        await this._sleep(100);
      }
    }

    return mapping;
  }

  /**
   * Search for securities by name using the /search endpoint
   * @param {string} query - Company name to search
   * @param {string} exchangeCode - Optional exchange filter (MIC code like XLON)
   * @returns {Promise<Array>}
   */
  async search(query, exchangeCode = null) {
    await this._checkRateLimit();

    try {
      const body = { query };
      if (exchangeCode) {
        // Map MIC code (XLON) to OpenFIGI exchange code (LN)
        const figiExchCode = this._micToFigiExchange(exchangeCode);
        if (figiExchCode) {
          body.exchCode = figiExchCode;
        }
      }

      const response = await axios.post(
        `${this.baseUrl}/search`,
        body,
        {
          headers: this.headers,
          timeout: 30000
        }
      );

      this.requestCount++;

      // Search endpoint returns { data: [...] }
      const results = response.data.data || [];
      return results.map(item => ({
        figi: item.figi,
        compositeFigi: item.compositeFIGI,
        shareClassFigi: item.shareClassFIGI,
        ticker: item.ticker,
        name: item.name,
        exchangeCode: this._figiToMicExchange(item.exchCode) || item.exchCode,
        micCode: this._figiToMicExchange(item.exchCode),
        currency: item.currency,
        marketSector: item.marketSector,
        securityType: item.securityType,
        securityType2: item.securityType2,
        securityDescription: item.securityDescription
      }));
    } catch (error) {
      console.warn(`OpenFIGI search failed for "${query}":`, error.message);
      return [];
    }
  }

  /**
   * Map MIC exchange code to OpenFIGI exchange code
   * @private
   */
  _micToFigiExchange(mic) {
    const mapping = {
      // Europe
      'XLON': 'LN',   // London
      'XAIM': 'LN',   // AIM (London)
      'XETR': 'GY',   // Frankfurt/Xetra
      'XFRA': 'GF',   // Frankfurt
      'XSTU': 'GS',   // Stuttgart
      'XBER': 'GB',   // Berlin
      'XHAM': 'GH',   // Hamburg
      'XMUN': 'GM',   // Munich
      'XDUS': 'GD',   // Dusseldorf
      'XPAR': 'FP',   // Paris
      'XAMS': 'NA',   // Amsterdam
      'XBRU': 'BB',   // Brussels
      'XLIS': 'PL',   // Lisbon
      'XMAD': 'SM',   // Madrid
      'XMCE': 'SM',   // BME Spanish
      'XMIL': 'IM',   // Milan
      'MTAA': 'IM',   // Milan MTA
      'XSWX': 'SW',   // Switzerland
      'XVTX': 'VX',   // SIX Swiss (alternate)
      'XSTO': 'SS',   // Stockholm
      'XCSE': 'DC',   // Copenhagen
      'XHEL': 'FH',   // Helsinki
      'XOSL': 'NO',   // Oslo
      'XWAR': 'PW',   // Warsaw
      'XWBO': 'AV',   // Vienna
      'XDUB': 'ID',   // Dublin
      'XATH': 'GA',   // Athens
      'XPRA': 'CP',   // Prague
      'XBUD': 'HB',   // Budapest
      // Americas
      'XNYS': 'UN',   // NYSE
      'XNAS': 'UQ',   // NASDAQ
      'XASE': 'UA',   // NYSE American
      'ARCX': 'UP',   // NYSE Arca
      'BATS': 'UF',   // BATS
      'XTSE': 'CT',   // Toronto
      'XTSX': 'CN',   // TSX Venture
      'BVMF': 'BZ',   // Brazil
      'XMEX': 'MM',   // Mexico
      // Asia-Pacific
      'XASX': 'AU',   // Australia
      'XTKS': 'JT',   // Tokyo
      'XHKG': 'HK',   // Hong Kong
      'XSES': 'SP',   // Singapore
      'XKOS': 'KS',   // Korea KOSPI
      'XKRX': 'KQ',   // Korea KOSDAQ
      'XTAI': 'TT',   // Taiwan
      'XBOM': 'IB',   // Bombay
      'XNSE': 'IN',   // NSE India
      'XSHG': 'CH',   // Shanghai
      'XSHE': 'CZ',   // Shenzhen
      // Others
      'XJSE': 'SJ',   // Johannesburg
      'XTAE': 'IT',   // Tel Aviv
      'XSAU': 'AB',   // Saudi Arabia
      'XNZE': 'NZ',   // New Zealand
    };
    return mapping[mic] || null;
  }

  /**
   * Map OpenFIGI exchange code to MIC code
   * @private
   */
  _figiToMicExchange(figiCode) {
    const mapping = {
      'LN': 'XLON',
      'GY': 'XETR',
      'GR': 'XETR',  // Frankfurt
      'GD': 'XETR',  // Dusseldorf
      'GF': 'XFRA',  // Frankfurt
      'GS': 'XSTU',  // Stuttgart
      'GB': 'XBER',  // Berlin
      'GH': 'XHAM',  // Hamburg
      'GM': 'XMUN',  // Munich
      'FP': 'XPAR',
      'NA': 'XAMS',
      'BB': 'XBRU',
      'PL': 'XLIS',
      'SM': 'XMAD',
      'IM': 'XMIL',
      'SW': 'XSWX',
      'VX': 'XVTX',  // SIX Swiss (alternate)
      'SS': 'XSTO',
      'DC': 'XCSE',
      'FH': 'XHEL',
      'NO': 'XOSL',
      'PW': 'XWAR',
      'AV': 'XWBO',
      'ID': 'XDUB',
      'UN': 'XNYS',
      'UQ': 'XNAS',
      'UA': 'XASE',  // NYSE American
      'UP': 'ARCX',  // NYSE Arca
      'US': 'XNYS',  // US composite
      'CT': 'XTSE',  // Toronto
      'CN': 'XTSX',  // TSX Venture
      'AU': 'XASX',  // Australia
      'JT': 'XTKS',  // Tokyo
      'HK': 'XHKG',  // Hong Kong
      'SP': 'XSES',  // Singapore
      'KS': 'XKOS',  // Korea KOSPI
      'KQ': 'XKRX',  // Korea KOSDAQ
      'TT': 'XTAI',  // Taiwan
      'IB': 'XBOM',  // Bombay
      'IN': 'XNSE',  // NSE India
      'CH': 'XSHG',  // Shanghai
      'CZ': 'XSHE',  // Shenzhen
      'BZ': 'BVMF',  // Brazil
      'MM': 'XMEX',  // Mexico
      'SJ': 'XJSE',  // Johannesburg
      'IT': 'XTAE',  // Tel Aviv
      'AB': 'XSAU',  // Saudi Arabia
      'NZ': 'XNZE',  // New Zealand
    };
    return mapping[figiCode] || null;
  }

  /**
   * Make request to OpenFIGI API
   * @private
   */
  async _request(jobs) {
    await this._checkRateLimit();

    try {
      const response = await axios.post(
        `${this.baseUrl}/mapping`,
        jobs,
        {
          headers: this.headers,
          timeout: 30000
        }
      );

      this.requestCount++;
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;

        if (status === 429) {
          // Rate limited - wait and retry
          console.warn('OpenFIGI rate limit hit, waiting 60 seconds...');
          await this._sleep(60000);
          return this._request(jobs);
        }

        if (status === 400) {
          throw new Error(`OpenFIGI bad request: ${JSON.stringify(error.response.data)}`);
        }

        throw new Error(`OpenFIGI API error (${status}): ${error.response.statusText}`);
      }

      throw error;
    }
  }

  /**
   * Parse OpenFIGI response into normalized format
   * @private
   */
  _parseResults(result) {
    if (!result) return [];

    // Check for error response
    if (result.error) {
      console.warn('OpenFIGI returned error:', result.error);
      return [];
    }

    if (!result.data || !Array.isArray(result.data)) {
      return [];
    }

    return result.data.map(item => ({
      figi: item.figi,
      compositeFigi: item.compositeFIGI,
      shareClassFigi: item.shareClassFIGI,
      ticker: item.ticker,
      name: item.name,
      exchangeCode: item.exchCode,
      micCode: item.micCode,
      currency: item.currency,
      marketSector: item.marketSector,
      securityType: item.securityType,
      securityType2: item.securityType2,
      securityDescription: item.securityDescription
    }));
  }

  /**
   * Check and enforce rate limiting
   * @private
   */
  async _checkRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastReset;

    // Reset counter every minute
    if (elapsed >= 60000) {
      this.requestCount = 0;
      this.lastReset = now;
      return;
    }

    // Wait if at rate limit
    if (this.requestCount >= this.rateLimit) {
      const waitTime = 60000 - elapsed + 100;
      console.log(`Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await this._sleep(waitTime);
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { OpenFigiClient };
