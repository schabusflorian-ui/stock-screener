// src/services/alphaVantageService.js
const axios = require('axios');

/**
 * Alpha Vantage API Client
 * 
 * Handles all communication with Alpha Vantage API
 * Features:
 * - Rate limiting (5 calls/minute for free tier)
 * - Response caching
 * - Error handling and retries
 * - Clean data normalization
 */
class AlphaVantageService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }
    
    this.apiKey = apiKey;
    this.baseURL = 'https://www.alphavantage.co/query';
    
    // Rate limiting for free tier (5 calls per minute)
    this.requestDelay = 12000; // 12 seconds between calls
    this.lastRequestTime = 0;
    
    // Simple in-memory cache
    this.cache = new Map();
    this.cacheConfig = {
      overview: 7 * 24 * 60 * 60 * 1000,      // 7 days
      financials: 7 * 24 * 60 * 60 * 1000,    // 7 days
      prices: 24 * 60 * 60 * 1000              // 24 hours
    };
    
    console.log('✅ Alpha Vantage service initialized');
  }
  
  /**
   * Wait to respect rate limits
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      console.log(`⏳ Rate limit: waiting ${Math.round(waitTime / 1000)}s...`);
      await this.delay(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Helper: Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Check cache for data
   */
  getCached(key, ttl) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > ttl) {
      this.cache.delete(key);
      return null;
    }
    
    console.log(`✨ Cache hit: ${key}`);
    return cached.data;
  }
  
  /**
   * Store data in cache
   */
  setCache(key, data, ttl) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  /**
   * Make API request with error handling
   */
  async makeRequest(params) {
    // Check cache first
    const cacheKey = JSON.stringify(params);
    const ttl = this.cacheConfig[params.function?.toLowerCase()] || this.cacheConfig.overview;
    const cached = this.getCached(cacheKey, ttl);
    if (cached) return cached;
    
    // Wait for rate limit
    await this.waitForRateLimit();
    
    // Build URL
    const url = new URL(this.baseURL);
    url.searchParams.append('apikey', this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
    
    console.log(`🌐 API Request: ${params.function} for ${params.symbol || 'data'}`);
    
    try {
      const response = await axios.get(url.toString(), {
        timeout: 30000 // 30 second timeout
      });
      
      const data = response.data;
      
      // Check for API errors
      if (data.Note) {
        throw new Error(`API rate limit: ${data.Note}`);
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
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('No response from API - check internet connection');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Get company overview (fundamental data)
   * Returns: Company info, market cap, P/E, P/B, etc.
   */
  async getCompanyOverview(symbol) {
    console.log(`📊 Fetching overview for ${symbol}...`);
    
    const data = await this.makeRequest({
      function: 'OVERVIEW',
      symbol: symbol.toUpperCase()
    });
    
    // Normalize the data
    return {
      symbol: data.Symbol,
      name: data.Name,
      description: data.Description,
      sector: data.Sector,
      industry: data.Industry,
      exchange: data.Exchange,
      currency: data.Currency,
      country: data.Country,
      
      // Market data
      marketCap: parseFloat(data.MarketCapitalization) || null,
      peRatio: parseFloat(data.PERatio) || null,
      pbRatio: parseFloat(data.PriceToBookRatio) || null,
      dividendYield: parseFloat(data.DividendYield) || null,
      eps: parseFloat(data.EPS) || null,
      
      // Profitability
      profitMargin: parseFloat(data.ProfitMargin) || null,
      operatingMarginTTM: parseFloat(data.OperatingMarginTTM) || null,
      returnOnAssetsTTM: parseFloat(data.ReturnOnAssetsTTM) || null,
      returnOnEquityTTM: parseFloat(data.ReturnOnEquityTTM) || null,
      
      // Financial data
      revenueTTM: parseFloat(data.RevenueTTM) || null,
      grossProfitTTM: parseFloat(data.GrossProfitTTM) || null,
      
      // Analyst data
      analystTargetPrice: parseFloat(data.AnalystTargetPrice) || null,
      
      // Dates
      fiscalYearEnd: data.FiscalYearEnd,
      latestQuarter: data.LatestQuarter,
      
      // Raw data for debugging
      raw: data
    };
  }
  
  /**
   * Get balance sheet statements
   * Returns: Annual and quarterly balance sheets
   */
  async getBalanceSheet(symbol) {
    console.log(`📊 Fetching balance sheet for ${symbol}...`);
    
    const data = await this.makeRequest({
      function: 'BALANCE_SHEET',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(report => this.normalizeBalanceSheet(report)),
      quarterly: (data.quarterlyReports || []).map(report => this.normalizeBalanceSheet(report))
    };
  }
  
  /**
   * Normalize balance sheet data
   */
  normalizeBalanceSheet(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      
      // Assets
      totalAssets: parseFloat(report.totalAssets) || 0,
      currentAssets: parseFloat(report.totalCurrentAssets) || 0,
      cashAndEquivalents: parseFloat(report.cashAndCashEquivalentsAtCarryingValue) || 0,
      inventory: parseFloat(report.inventory) || 0,
      
      // Liabilities
      totalLiabilities: parseFloat(report.totalLiabilities) || 0,
      currentLiabilities: parseFloat(report.totalCurrentLiabilities) || 0,
      shortTermDebt: parseFloat(report.shortTermDebt) || 0,
      longTermDebt: parseFloat(report.longTermDebt) || 0,
      
      // Equity
      shareholderEquity: parseFloat(report.totalShareholderEquity) || 0,
      retainedEarnings: parseFloat(report.retainedEarnings) || 0,
      
      // For calculations
      raw: report
    };
  }
  
  /**
   * Get income statement
   * Returns: Annual and quarterly income statements
   */
  async getIncomeStatement(symbol) {
    console.log(`📊 Fetching income statement for ${symbol}...`);
    
    const data = await this.makeRequest({
      function: 'INCOME_STATEMENT',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(report => this.normalizeIncomeStatement(report)),
      quarterly: (data.quarterlyReports || []).map(report => this.normalizeIncomeStatement(report))
    };
  }
  
  /**
   * Normalize income statement data
   */
  normalizeIncomeStatement(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      
      // Revenue
      totalRevenue: parseFloat(report.totalRevenue) || 0,
      costOfRevenue: parseFloat(report.costOfRevenue) || 0,
      grossProfit: parseFloat(report.grossProfit) || 0,
      
      // Operating
      operatingExpenses: parseFloat(report.operatingExpenses) || 0,
      operatingIncome: parseFloat(report.operatingIncome) || 0,
      
      // Profitability
      ebitda: parseFloat(report.ebitda) || 0,
      netIncome: parseFloat(report.netIncome) || 0,
      
      // Taxes
      incomeTaxExpense: parseFloat(report.incomeTaxExpense) || 0,
      incomeBeforeTax: parseFloat(report.incomeBeforeTax) || 0,
      
      // Per share
      eps: parseFloat(report.reportedEPS) || 0,
      
      // For calculations
      raw: report
    };
  }
  
  /**
   * Get cash flow statement
   * Returns: Annual and quarterly cash flows
   */
  async getCashFlow(symbol) {
    console.log(`📊 Fetching cash flow for ${symbol}...`);
    
    const data = await this.makeRequest({
      function: 'CASH_FLOW',
      symbol: symbol.toUpperCase()
    });
    
    return {
      symbol: data.symbol,
      currency: data.currency,
      annual: (data.annualReports || []).map(report => this.normalizeCashFlow(report)),
      quarterly: (data.quarterlyReports || []).map(report => this.normalizeCashFlow(report))
    };
  }
  
  /**
   * Normalize cash flow data
   */
  normalizeCashFlow(report) {
    return {
      fiscalDateEnding: report.fiscalDateEnding,
      
      // Operating activities
      operatingCashflow: parseFloat(report.operatingCashflow) || 0,
      
      // Investing activities
      capitalExpenditures: parseFloat(report.capitalExpenditures) || 0,
      
      // Financing activities
      dividendPayout: parseFloat(report.dividendPayout) || 0,
      
      // Changes
      changeInCash: parseFloat(report.changeInCashAndCashEquivalents) || 0,
      
      // For calculations
      raw: report
    };
  }
  
  /**
   * Get current quote (real-time price)
   */
  async getGlobalQuote(symbol) {
    console.log(`💰 Fetching quote for ${symbol}...`);
    
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
      low: parseFloat(quote['04. low']) || null
    };
  }
  
  /**
   * Fetch all data for a company at once
   * (Useful for bulk imports)
   */
  async fetchAllData(symbol) {
    console.log(`\n📦 Fetching complete data for ${symbol}...`);
    console.log('━'.repeat(50));
    
    try {
      const overview = await this.getCompanyOverview(symbol);
      const balanceSheet = await this.getBalanceSheet(symbol);
      const incomeStatement = await this.getIncomeStatement(symbol);
      const cashFlow = await this.getCashFlow(symbol);
      
      console.log('━'.repeat(50));
      console.log(`✅ Successfully fetched all data for ${symbol}\n`);
      
      return {
        overview,
        balanceSheet,
        incomeStatement,
        cashFlow
      };
      
    } catch (error) {
      console.log('━'.repeat(50));
      console.log(`❌ Failed to fetch data for ${symbol}: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️  Cache cleared');
  }
}

module.exports = AlphaVantageService;

// If run directly (for testing)
if (require.main === module) {
  require('dotenv').config();
  
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  
  if (!apiKey) {
    console.error('❌ Error: ALPHA_VANTAGE_KEY not found in .env file');
    process.exit(1);
  }
  
  const service = new AlphaVantageService(apiKey);
  
  // Test with Apple
  (async () => {
    try {
      console.log('\n🧪 Testing Alpha Vantage Service with AAPL...\n');
      
      const overview = await service.getCompanyOverview('AAPL');
      console.log('\n📊 Company Overview:');
      console.log(`   Name: ${overview.name}`);
      console.log(`   Sector: ${overview.sector}`);
      console.log(`   Market Cap: $${(overview.marketCap / 1e9).toFixed(2)}B`);
      console.log(`   P/E Ratio: ${overview.peRatio}`);
      
      const quote = await service.getGlobalQuote('AAPL');
      console.log('\n💰 Current Quote:');
      console.log(`   Price: $${quote.price}`);
      console.log(`   Change: ${quote.changePercent}`);
      
      console.log('\n✅ All tests passed!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  })();
}