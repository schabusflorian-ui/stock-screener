// src/providers/AlphaVantageProvider.js
const DataProvider = require('./base/DataProvider');
const axios = require('axios');

/**
 * Alpha Vantage Data Provider
 * 
 * Capabilities:
 * ✓ Company overview
 * ✓ Financial statements (all 3)
 * ✓ Real-time quotes
 * ✓ Historical prices
 * ✓ International stocks
 * 
 * Limitations:
 * - Rate limited (5/min free, 75/min premium)
 * - Some data quality issues
 * - Delayed data on free tier
 */
class AlphaVantageProvider extends DataProvider {
  constructor(apiKey, config = {}) {
    super({
      name: 'AlphaVantage',
      priority: 20, // High priority for US stocks
      ...config
    });
    
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }
    
    this.apiKey = apiKey;
    this.baseURL = 'https://www.alphavantage.co/query';
    
    // Rate limiting
    this.requestDelay = config.requestDelay || 12000; // 12 seconds (5/min)
    this.lastRequestTime = 0;
    
    // Cache
    this.cache = new Map();
    this.cacheConfig = {
      overview: 7 * 24 * 60 * 60 * 1000,      // 7 days
      financials: 7 * 24 * 60 * 60 * 1000,    // 7 days
      prices: 24 * 60 * 60 * 1000,            // 24 hours
      quote: 15 * 60 * 1000                   // 15 minutes
    };
  }
  
  /**
   * Check if this provider can handle the request
   */
  canProvide(dataType, symbol) {
    // Alpha Vantage can provide most data for most stocks
    const supportedTypes = [
      'overview', 
      'balance_sheet', 
      'income_statement', 
      'cash_flow', 
      'quote', 
      'prices'
    ];
    
    return this.enabled && supportedTypes.includes(dataType);
  }
  
  /**
   * Wait for rate limit
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      console.log(`   ⏳ [${this.name}] Rate limit: waiting ${Math.round(waitTime / 1000)}s...`);
      await this.delay(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cache management
   */
  getCached(key, ttl) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > ttl) {
      this.cache.delete(key);
      return null;
    }
    
    console.log(`   ✨ [${this.name}] Cache hit: ${key}`);
    return cached.data;
  }
  
  setCache(key, data, ttl) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  clearCache() {
    this.cache.clear();
    console.log(`🗑️  [${this.name}] Cache cleared`);
  }
  
  /**
   * Make API request
   */
  async makeRequest(params) {
    const cacheKey = JSON.stringify(params);
    const cacheType = params.function?.toLowerCase() || 'default';
    const ttl = this.cacheConfig[cacheType] || this.cacheConfig.overview;
    
    // Check cache
    const cached = this.getCached(cacheKey, ttl);
    if (cached) return cached;
    
    // Rate limit
    await this.waitForRateLimit();
    
    // Build URL
    const url = new URL(this.baseURL);
    url.searchParams.append('apikey', this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
    
    console.log(`   🌐 [${this.name}] ${params.function} for ${params.symbol || 'data'}`);
    
    try {
      const response = await axios.get(url.toString(), {
        timeout: 30000
      });
      
      const data = response.data;
      
      // Check for API errors
      if (data.Note) {
        throw new Error(`Rate limit: ${data.Note}`);
      }
      
      if (data['Error Message']) {
        throw new Error(`API error: ${data['Error Message']}`);
      }
      
      if (data.Information) {
        throw new Error(`API info: ${data.Information}`);
      }
      
      // Cache successful response
      this.setCache(cacheKey, data, ttl);
      
      return data;
      
    } catch (error) {
      console.error(`   ❌ [${this.name}] Request failed:`, error.message);
      throw error;
    }
  }
  
  /**
   * Get company overview
   */
  async getCompanyOverview(symbol) {
    const data = await this.makeRequest({
      function: 'OVERVIEW',
      symbol: symbol.toUpperCase()
    });
    
    return this.normalizeOverview(data);
  }
  
  normalizeOverview(data) {
    return {
      symbol: data.Symbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      exchange: data.Exchange,
      currency: data.Currency,
      country: data.Country,
      marketCap: parseFloat(data.MarketCapitalization) || null,
      peRatio: parseFloat(data.PERatio) || null,
      pbRatio: parseFloat(data.PriceToBookRatio) || null,
      dividendYield: parseFloat(data.DividendYield) || null,
      eps: parseFloat(data.EPS) || null,
      profitMargin: parseFloat(data.ProfitMargin) || null,
      operatingMarginTTM: parseFloat(data.OperatingMarginTTM) || null,
      returnOnAssetsTTM: parseFloat(data.ReturnOnAssetsTTM) || null,
      returnOnEquityTTM: parseFloat(data.ReturnOnEquityTTM) || null,
      revenueTTM: parseFloat(data.RevenueTTM) || null,
      grossProfitTTM: parseFloat(data.GrossProfitTTM) || null,
      fiscalYearEnd: data.FiscalYearEnd,
      latestQuarter: data.LatestQuarter,
      _source: 'AlphaVantage',
      _raw: data
    };
  }
  
  /**
   * Get balance sheet
   */
  async getBalanceSheet(symbol) {
    const data = await this.makeRequest({
      function: 'BALANCE_SHEET',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(r => this.normalizeBalanceSheet(r)),
      quarterly: (data.quarterlyReports || []).map(r => this.normalizeBalanceSheet(r)),
      _source: 'AlphaVantage'
    };
  }
  
  normalizeBalanceSheet(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      totalAssets: parseFloat(report.totalAssets) || 0,
      currentAssets: parseFloat(report.totalCurrentAssets) || 0,
      cashAndEquivalents: parseFloat(report.cashAndCashEquivalentsAtCarryingValue) || 0,
      inventory: parseFloat(report.inventory) || 0,
      totalLiabilities: parseFloat(report.totalLiabilities) || 0,
      currentLiabilities: parseFloat(report.totalCurrentLiabilities) || 0,
      shortTermDebt: parseFloat(report.shortTermDebt) || 0,
      longTermDebt: parseFloat(report.longTermDebt) || 0,
      shareholderEquity: parseFloat(report.totalShareholderEquity) || 0,
      retainedEarnings: parseFloat(report.retainedEarnings) || 0,
      raw: report
    };
  }
  
  /**
   * Get income statement
   */
  async getIncomeStatement(symbol) {
    const data = await this.makeRequest({
      function: 'INCOME_STATEMENT',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(r => this.normalizeIncomeStatement(r)),
      quarterly: (data.quarterlyReports || []).map(r => this.normalizeIncomeStatement(r)),
      _source: 'AlphaVantage'
    };
  }
  
  normalizeIncomeStatement(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      totalRevenue: parseFloat(report.totalRevenue) || 0,
      costOfRevenue: parseFloat(report.costOfRevenue) || 0,
      grossProfit: parseFloat(report.grossProfit) || 0,
      operatingExpenses: parseFloat(report.operatingExpenses) || 0,
      operatingIncome: parseFloat(report.operatingIncome) || 0,
      ebitda: parseFloat(report.ebitda) || 0,
      netIncome: parseFloat(report.netIncome) || 0,
      incomeTaxExpense: parseFloat(report.incomeTaxExpense) || 0,
      incomeBeforeTax: parseFloat(report.incomeBeforeTax) || 0,
      eps: parseFloat(report.reportedEPS) || 0,
      raw: report
    };
  }
  
  /**
   * Get cash flow
   */
  async getCashFlow(symbol) {
    const data = await this.makeRequest({
      function: 'CASH_FLOW',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(r => this.normalizeCashFlow(r)),
      quarterly: (data.quarterlyReports || []).map(r => this.normalizeCashFlow(r)),
      _source: 'AlphaVantage'
    };
  }
  
  normalizeCashFlow(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      operatingCashflow: parseFloat(report.operatingCashflow) || 0,
      capitalExpenditures: parseFloat(report.capitalExpenditures) || 0,
      dividendPayout: parseFloat(report.dividendPayout) || 0,
      changeInCash: parseFloat(report.changeInCashAndCashEquivalents) || 0,
      raw: report
    };
  }
  
  /**
   * Get quote
   */
  async getQuote(symbol) {
    const data = await this.makeRequest({
      function: 'GLOBAL_QUOTE',
      symbol: symbol.toUpperCase()
    });
    
    const quote = data['Global Quote'] || {};
    
    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']) || null,
      change: parseFloat(quote['09. change']) || null,
      changePercent: quote['10. change percent'],
      volume: parseInt(quote['06. volume']) || null,
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']) || null,
      open: parseFloat(quote['02. open']) || null,
      high: parseFloat(quote['03. high']) || null,
      low: parseFloat(quote['04. low']) || null,
      _source: 'AlphaVantage'
    };
  }
  
  /**
   * Get historical prices
   */
  async getHistoricalPrices(symbol, interval = 'daily') {
    const functionMap = {
      'daily': 'TIME_SERIES_DAILY',
      'weekly': 'TIME_SERIES_WEEKLY',
      'monthly': 'TIME_SERIES_MONTHLY'
    };
    
    const data = await this.makeRequest({
      function: functionMap[interval] || 'TIME_SERIES_DAILY',
      symbol: symbol.toUpperCase(),
      outputsize: 'full'
    });
    
    // Parse time series data
    const timeSeriesKey = Object.keys(data).find(key => key.includes('Time Series'));
    if (!timeSeriesKey) return [];
    
    const timeSeries = data[timeSeriesKey];
    
    return Object.entries(timeSeries).map(([date, values]) => ({
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'])
    }));
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Try a simple request
      await this.makeRequest({
        function: 'OVERVIEW',
        symbol: 'IBM'
      });
      return true;
    } catch (error) {
      console.error(`❌ [${this.name}] Health check failed:`, error.message);
      return false;
    }
  }
  
  /**
   * Get stats
   */
  getStats() {
    return {
      ...super.getStats(),
      cacheSize: this.cache.size,
      requestDelay: this.requestDelay,
      capabilities: ['overview', 'financials', 'quotes', 'prices']
    };
  }
}

module.exports = AlphaVantageProvider;