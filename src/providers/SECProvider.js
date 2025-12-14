// src/providers/SECProvider-v2.js
const DataProvider = require('./base/DataProvider');
const axios = require('axios');

/**
 * SEC EDGAR Data Provider (Fixed)
 * 
 * Updated to work with current SEC API endpoints
 */
class SECProvider extends DataProvider {
  constructor(config = {}) {
    super({
      name: 'SEC-EDGAR',
      priority: 10,
      ...config
    });
    
    // SEC requires a proper User-Agent with contact info
    this.userAgent = config.userAgent || 
      'StockAnalyzer/1.0 schabus.florian@gmail.com';
    
    // Rate limiting: SEC allows 10 requests per second
    this.requestDelay = config.requestDelay || 100; // 100ms between requests
    this.lastRequestTime = 0;
    
    // CIK cache
    this.cikCache = new Map();
    this.tickersCache = null;
    
    // Data cache
    this.cache = new Map();
    
    console.log(`✓ ${this.name} provider initialized`);
  }
  
  canProvide(dataType, symbol) {
    const supportedTypes = [
      'overview',
      'balance_sheet',
      'income_statement',
      'cash_flow'
    ];
    
    return this.enabled && supportedTypes.includes(dataType);
  }
  
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.requestDelay - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
  }
  
  getCached(key) {
    return this.cache.get(key);
  }
  
  setCache(key, data) {
    this.cache.set(key, data);
  }
  
  async makeRequest(url) {
    // Check cache
    const cached = this.getCached(url);
    if (cached) {
      console.log(`   ✨ [${this.name}] Cache hit`);
      return cached;
    }
    
    // Rate limit
    await this.waitForRateLimit();
    
    console.log(`   🌐 [${this.name}] GET ${url}`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Host': new URL(url).host
        },
        timeout: 30000
      });
      
      // Cache it
      this.setCache(url, response.data);
      
      return response.data;
      
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error(
          'SEC API returned 403 Forbidden. Please ensure:\n' +
          '1. Your User-Agent includes contact info\n' +
          '2. You are not making too many requests\n' +
          '3. Your IP is not blocked by SEC'
        );
      }
      
      if (error.response?.status === 404) {
        throw new Error(`SEC data not found at: ${url}`);
      }
      
      throw new Error(`SEC request failed: ${error.message}`);
    }
  }
  
  /**
   * Get tickers mapping - try multiple endpoints
   */
  async getTickersMapping() {
    if (this.tickersCache) {
      return this.tickersCache;
    }
    
    console.log(`   📥 [${this.name}] Downloading tickers mapping...`);
    
    // Try multiple endpoints (SEC has changed these over time)
    const endpoints = [
      'https://www.sec.gov/files/company_tickers_exchange.json',
      'https://www.sec.gov/files/company_tickers.json',
      'https://data.sec.gov/files/company_tickers.json'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const data = await this.makeRequest(endpoint);
        
        // Parse the data based on format
        const mapping = this.parseTickersData(data);
        
        if (mapping.size > 0) {
          console.log(`   ✓ Loaded ${mapping.size} tickers from ${endpoint}`);
          this.tickersCache = mapping;
          return mapping;
        }
        
      } catch (error) {
        console.log(`   ⚠️  Failed to load from ${endpoint}: ${error.message}`);
        // Continue to next endpoint
      }
    }
    
    throw new Error('Could not load tickers mapping from any SEC endpoint');
  }
  
  /**
   * Parse tickers data (handles multiple formats)
   */
  parseTickersData(data) {
    const mapping = new Map();
    
    // Format 1: company_tickers_exchange.json
    // { "fields": [...], "data": [[cik, name, ticker, exchange], ...] }
    if (data.fields && data.data) {
      for (const row of data.data) {
        const cik = String(row[0]).padStart(10, '0');
        const name = row[1];
        const ticker = row[2];
        
        if (ticker) {
          mapping.set(ticker.toUpperCase(), { cik, name });
        }
      }
      return mapping;
    }
    
    // Format 2: company_tickers.json (old format)
    // { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        const company = data[key];
        
        if (company.ticker && company.cik_str !== undefined) {
          const cik = String(company.cik_str).padStart(10, '0');
          const ticker = company.ticker.toUpperCase();
          const name = company.title || company.name;
          
          mapping.set(ticker, { cik, name });
        }
      }
      return mapping;
    }
    
    return mapping;
  }
  
  /**
   * Convert symbol to CIK
   */
  async getCIK(symbol) {
    symbol = symbol.toUpperCase();
    
    // Check cache
    if (this.cikCache.has(symbol)) {
      return this.cikCache.get(symbol);
    }
    
    // Get mapping
    const mapping = await this.getTickersMapping();
    const company = mapping.get(symbol);
    
    if (!company) {
      throw new Error(
        `Symbol ${symbol} not found in SEC database. ` +
        `This may not be a US public company or may have a different ticker.`
      );
    }
    
    // Cache it
    this.cikCache.set(symbol, company.cik);
    
    return company.cik;
  }
  
  /**
   * Get company submissions
   */
  async getSubmissions(symbol) {
    const cik = await this.getCIK(symbol);
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    return await this.makeRequest(url);
  }
  
  /**
   * Get company facts (XBRL)
   */
  async getCompanyFacts(symbol) {
    const cik = await this.getCIK(symbol);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    return await this.makeRequest(url);
  }
  
  /**
   * Get company overview
   */
  async getCompanyOverview(symbol) {
    const submissions = await this.getSubmissions(symbol);
    
    return {
      symbol: symbol.toUpperCase(),
      name: submissions.name,
      cik: submissions.cik,
      sicCode: submissions.sic,
      sicDescription: submissions.sicDescription,
      industry: submissions.sicDescription,
      sector: this.mapSICToSector(submissions.sic),
      fiscalYearEnd: submissions.fiscalYearEnd,
      stateOfIncorporation: submissions.stateOfIncorporation,
      phone: submissions.phone,
      ein: submissions.ein,
      category: submissions.category,
      exchanges: submissions.exchanges,
      entityType: submissions.entityType,
      address: submissions.addresses?.business,
      _source: 'SEC-EDGAR',
      _raw: submissions
    };
  }
  
  /**
   * Get balance sheet
   */
  async getBalanceSheet(symbol) {
    const facts = await this.getCompanyFacts(symbol);
    const usGaap = facts.facts['us-gaap'];
    
    if (!usGaap) {
      throw new Error('No US-GAAP data found for this company');
    }
    
    const balanceSheetData = this.extractBalanceSheetData(usGaap);
    const organized = this.organizePeriods(balanceSheetData);
    
    return {
      symbol: symbol.toUpperCase(),
      currency: 'USD',
      annual: organized.annual,
      quarterly: organized.quarterly,
      _source: 'SEC-EDGAR'
    };
  }
  
  /**
   * Clean and deduplicate XBRL data at source
   * Filters to only 10-K/10-Q forms and keeps latest filing for each period
   */
  cleanXBRLData(values) {
    if (!values || values.length === 0) return [];

    // Filter to only 10-K and 10-Q forms
    const filtered = values.filter(item =>
      item.form === '10-K' || item.form === '10-Q'
    );

    // Deduplicate: keep latest filing for each (end date, fiscal period) combination
    const periodMap = new Map();

    for (const item of filtered) {
      const key = `${item.end}-${item.fp}`;
      const existing = periodMap.get(key);

      // If no existing or this filing is newer, use it
      if (!existing || item.filed > existing.filed) {
        periodMap.set(key, item);
      }
    }

    return Array.from(periodMap.values());
  }

  /**
   * Extract balance sheet data from XBRL
   */
  extractBalanceSheetData(usGaap) {
    const data = {};

    const mappings = {
      // Assets
      totalAssets: ['Assets'],
      currentAssets: ['AssetsCurrent'],
      cashAndEquivalents: [
        'CashAndCashEquivalentsAtCarryingValue',
        'Cash',
        'CashCashEquivalentsAndShortTermInvestments'
      ],
      inventory: ['InventoryNet', 'Inventory'],
      accountsReceivable: [
        'AccountsReceivableNetCurrent',
        'AccountsReceivableNet',
        'ReceivablesNetCurrent'
      ],
      propertyPlantEquipment: [
        'PropertyPlantAndEquipmentNet',
        'PropertyPlantAndEquipmentGross'
      ],
      goodwill: ['Goodwill'],
      intangibleAssets: [
        'IntangibleAssetsNetExcludingGoodwill',
        'FiniteLivedIntangibleAssetsNet'
      ],

      // Liabilities
      totalLiabilities: ['Liabilities'],
      currentLiabilities: ['LiabilitiesCurrent'],
      longTermDebt: ['LongTermDebt', 'LongTermDebtNoncurrent'],
      shortTermDebt: ['ShortTermDebt', 'DebtCurrent', 'ShortTermBorrowings'],
      accountsPayable: ['AccountsPayableCurrent', 'AccountsPayable'],
      accruedLiabilities: [
        'AccruedLiabilitiesCurrent',
        'OtherLiabilitiesCurrent'
      ],

      // Equity
      shareholderEquity: ['StockholdersEquity', 'ShareholdersEquity'],
      retainedEarnings: ['RetainedEarningsAccumulatedDeficit'],
      commonStock: ['CommonStockValue', 'CommonStocksIncludingAdditionalPaidInCapital'],
      treasuryStock: ['TreasuryStockValue']
    };

    for (const [key, aliases] of Object.entries(mappings)) {
      for (const alias of aliases) {
        if (usGaap[alias]?.units?.USD) {
          // Clean the data at source
          data[key] = this.cleanXBRLData(usGaap[alias].units.USD);
          break;
        }
      }

      if (!data[key]) {
        data[key] = [];
      }
    }

    return data;
  }
  
  /**
   * Get income statement
   */
  async getIncomeStatement(symbol) {
    const facts = await this.getCompanyFacts(symbol);
    const usGaap = facts.facts['us-gaap'];
    
    if (!usGaap) {
      throw new Error('No US-GAAP data found for this company');
    }
    
    const incomeData = this.extractIncomeStatementData(usGaap);
    const organized = this.organizePeriods(incomeData);
    
    return {
      symbol: symbol.toUpperCase(),
      currency: 'USD',
      annual: organized.annual,
      quarterly: organized.quarterly,
      _source: 'SEC-EDGAR'
    };
  }
  
  /**
   * Extract income statement data
   */
  extractIncomeStatementData(usGaap) {
    const data = {};

    const mappings = {
      // Revenue
      totalRevenue: [
        'Revenues',
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'SalesRevenueNet',
        'RevenueFromContractWithCustomer'
      ],
      costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'],
      grossProfit: ['GrossProfit'],

      // Operating
      operatingExpenses: ['OperatingExpenses', 'OperatingCostsAndExpenses'],
      researchAndDevelopment: [
        'ResearchAndDevelopmentExpense',
        'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'
      ],
      sellingGeneralAdministrative: [
        'SellingGeneralAndAdministrativeExpense',
        'GeneralAndAdministrativeExpense'
      ],
      operatingIncome: ['OperatingIncomeLoss'],

      // Income
      netIncome: ['NetIncomeLoss', 'ProfitLoss'],
      incomeTaxExpense: ['IncomeTaxExpenseBenefit'],
      incomeBeforeTax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'],
      interestExpense: ['InterestExpense'],
      interestIncome: ['InterestIncomeOther', 'InvestmentIncomeInterest'],

      // Other metrics
      ebitda: ['EarningsBeforeInterestTaxesDepreciationAndAmortization'],
      eps: ['EarningsPerShareBasic', 'EarningsPerShareDiluted'],
      epsBasic: ['EarningsPerShareBasic'],
      epsDiluted: ['EarningsPerShareDiluted'],
      sharesOutstanding: ['WeightedAverageNumberOfSharesOutstandingBasic'],
      sharesOutstandingDiluted: ['WeightedAverageNumberOfDilutedSharesOutstanding']
    };

    for (const [key, aliases] of Object.entries(mappings)) {
      for (const alias of aliases) {
        if (usGaap[alias]?.units?.USD) {
          // Clean the data at source
          data[key] = this.cleanXBRLData(usGaap[alias].units.USD);
          break;
        }
      }

      if (!data[key]) {
        data[key] = [];
      }
    }

    return data;
  }
  
  /**
   * Get cash flow
   */
  async getCashFlow(symbol) {
    const facts = await this.getCompanyFacts(symbol);
    const usGaap = facts.facts['us-gaap'];
    
    if (!usGaap) {
      throw new Error('No US-GAAP data found for this company');
    }
    
    const cashFlowData = this.extractCashFlowData(usGaap);
    const organized = this.organizePeriods(cashFlowData);
    
    return {
      symbol: symbol.toUpperCase(),
      currency: 'USD',
      annual: organized.annual,
      quarterly: organized.quarterly,
      _source: 'SEC-EDGAR'
    };
  }
  
  /**
   * Extract cash flow data
   */
  extractCashFlowData(usGaap) {
    const data = {};

    const mappings = {
      // Operating Activities
      operatingCashflow: ['NetCashProvidedByUsedInOperatingActivities'],
      depreciation: ['Depreciation', 'DepreciationAndAmortization', 'DepreciationDepletionAndAmortization'],
      stockBasedCompensation: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
      deferredIncomeTax: ['DeferredIncomeTaxExpenseBenefit'],

      // Investing Activities
      investingCashflow: ['NetCashProvidedByUsedInInvestingActivities'],
      capitalExpenditures: [
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'PaymentsForCapitalImprovements'
      ],
      acquisitions: ['PaymentsToAcquireBusinessesNetOfCashAcquired'],
      purchaseOfInvestments: ['PaymentsToAcquireInvestments', 'PaymentsToAcquireAvailableForSaleSecuritiesDebt'],
      saleOfInvestments: ['ProceedsFromSaleOfAvailableForSaleSecuritiesDebt'],

      // Financing Activities
      financingCashflow: ['NetCashProvidedByUsedInFinancingActivities'],
      dividendPayout: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
      stockRepurchase: ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfEquity'],
      debtIssuance: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromDebtNetOfIssuanceCosts'],
      debtRepayment: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt'],

      // Net Change
      changeInCash: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],
      freeCashFlow: [] // Will be calculated: operating - capex
    };

    for (const [key, aliases] of Object.entries(mappings)) {
      for (const alias of aliases) {
        if (usGaap[alias]?.units?.USD) {
          // Clean the data at source
          data[key] = this.cleanXBRLData(usGaap[alias].units.USD);
          break;
        }
      }

      if (!data[key]) {
        data[key] = [];
      }
    }

    return data;
  }
  
  /**
   * Separate annual and quarterly periods properly
   * Annual: FY period from 10-K forms
   * Quarterly: Q1, Q2, Q3 from 10-Q forms (Q4 is included in 10-K as FY)
   */
  separateAnnualQuarterly(periods) {
    const annualMap = new Map();
    const quarterlyMap = new Map();

    for (const period of periods) {
      // Annual reports: 10-K forms with FY period ONLY
      if (period.form === '10-K' && period.fiscalPeriod === 'FY') {
        const key = period.fiscalDateEnding;
        const existing = annualMap.get(key);

        // Keep the latest filed version if duplicates exist
        if (!existing || period.filed > existing.filed) {
          annualMap.set(key, period);
        }
      }
      // Quarterly reports: ONLY 10-Q forms with Q1, Q2, Q3
      // Note: Q4 is not separately filed; it's included in the annual 10-K
      // Ignore any quarterly data in 10-K forms (they contain full year data)
      else if (period.form === '10-Q' && ['Q1', 'Q2', 'Q3'].includes(period.fiscalPeriod)) {
        const key = period.fiscalDateEnding;
        const existing = quarterlyMap.get(key);

        // Keep the latest filed version if duplicates exist
        if (!existing || period.filed > existing.filed) {
          quarterlyMap.set(key, period);
        }
      }
    }

    const annual = Array.from(annualMap.values())
      .sort((a, b) => b.fiscalDateEnding.localeCompare(a.fiscalDateEnding));

    const quarterly = Array.from(quarterlyMap.values())
      .sort((a, b) => b.fiscalDateEnding.localeCompare(a.fiscalDateEnding));

    return { annual, quarterly };
  }

  /**
   * Organize XBRL data by period
   * Data is already cleaned by cleanXBRLData(), so no duplicates here
   */
  organizePeriods(xbrlData) {
    const periodMap = new Map();

    // Merge all concepts into periods
    for (const [concept, values] of Object.entries(xbrlData)) {
      for (const item of values) {
        const key = `${item.end}-${item.fp}`;

        if (!periodMap.has(key)) {
          periodMap.set(key, {
            fiscalDateEnding: item.end,
            fiscalYear: item.fy,
            fiscalPeriod: item.fp,
            form: item.form,
            filed: item.filed
          });
        }

        periodMap.get(key)[concept] = item.val;
      }
    }

    const periods = Array.from(periodMap.values());

    // Use improved separation logic
    const separated = this.separateAnnualQuarterly(periods);

    return {
      annual: separated.annual.map(p => this.normalizeFinancialData(p)),
      quarterly: separated.quarterly.map(p => this.normalizeFinancialData(p))
    };
  }
  
  /**
   * Normalize financial data - preserves ALL XBRL fields for future analysis
   */
  normalizeFinancialData(data) {
    // Calculate shareholder equity if not found
    // This is a critical fallback for companies where SEC doesn't provide it directly
    let shareholderEquity = data.shareholderEquity || 0;

    if (!shareholderEquity && data.totalAssets && data.totalLiabilities) {
      // Basic accounting equation: Assets = Liabilities + Equity
      // Therefore: Equity = Assets - Liabilities
      shareholderEquity = data.totalAssets - data.totalLiabilities;

      // Validate the calculated equity is reasonable
      if (shareholderEquity < 0 || shareholderEquity > data.totalAssets) {
        console.warn(`⚠️  Calculated unusual equity: $${(shareholderEquity/1e9).toFixed(2)}B`);
      }
    }

    // Store complete XBRL data + commonly accessed fields for performance
    const result = {
      // Metadata
      fiscalDateEnding: data.fiscalDateEnding,
      fiscalYear: data.fiscalYear,
      fiscalPeriod: data.fiscalPeriod,
      form: data.form,
      filed: data.filed,

      // Commonly accessed fields (extracted for query performance)
      // Balance Sheet
      totalAssets: data.totalAssets || null,
      totalLiabilities: data.totalLiabilities || null,
      shareholderEquity: shareholderEquity || null,
      currentAssets: data.currentAssets || null,
      currentLiabilities: data.currentLiabilities || null,
      cashAndEquivalents: data.cashAndEquivalents || null,
      longTermDebt: data.longTermDebt || null,
      shortTermDebt: data.shortTermDebt || null,

      // Income Statement
      totalRevenue: data.totalRevenue || null,
      netIncome: data.netIncome || null,
      operatingIncome: data.operatingIncome || null,
      costOfRevenue: data.costOfRevenue || null,
      grossProfit: data.grossProfit || null,

      // Cash Flow
      operatingCashflow: data.operatingCashflow || null,
      capitalExpenditures: data.capitalExpenditures ? Math.abs(data.capitalExpenditures) : null,

      // Complete XBRL data (ALL fields preserved)
      // This includes 200+ fields like AccountsReceivable, Goodwill, R&D, etc.
      xbrl: { ...data }  // Store everything
    };

    // Clean up redundant nested data
    delete result.xbrl.fiscalDateEnding;
    delete result.xbrl.fiscalYear;
    delete result.xbrl.fiscalPeriod;
    delete result.xbrl.form;
    delete result.xbrl.filed;

    return result;
  }
  
  /**
   * Map SIC code to sector
   */
  mapSICToSector(sic) {
    if (!sic) return 'Unknown';
    
    const sicInt = parseInt(sic);
    
    if (sicInt >= 100 && sicInt <= 999) return 'Agriculture';
    if (sicInt >= 1000 && sicInt <= 1499) return 'Mining';
    if (sicInt >= 1500 && sicInt <= 1799) return 'Construction';
    if (sicInt >= 2000 && sicInt <= 3999) return 'Manufacturing';
    if (sicInt >= 4000 && sicInt <= 4999) return 'Transportation';
    if (sicInt >= 5000 && sicInt <= 5199) return 'Wholesale Trade';
    if (sicInt >= 5200 && sicInt <= 5999) return 'Retail Trade';
    if (sicInt >= 6000 && sicInt <= 6799) return 'Finance';
    if (sicInt >= 7000 && sicInt <= 8999) return 'Services';
    if (sicInt >= 9100 && sicInt <= 9729) return 'Public Administration';
    
    return 'Other';
  }
  
  async getQuote(symbol) {
    throw new Error('SEC EDGAR does not provide real-time quotes');
  }
  
  async getHistoricalPrices(symbol, interval) {
    throw new Error('SEC EDGAR does not provide price data');
  }
  
  /**
   * Fetch all data for a symbol (for stock importer)
   */
  async fetchAllData(symbol) {
    console.log(`\n📦 [${this.name}] Fetching complete data for ${symbol}...`);

    try {
      const overview = await this.getCompanyOverview(symbol);
      const balanceSheet = await this.getBalanceSheet(symbol);
      const incomeStatement = await this.getIncomeStatement(symbol);
      const cashFlow = await this.getCashFlow(symbol);

      console.log(`✅ [${this.name}] Successfully fetched all data for ${symbol}`);

      return {
        overview,
        balanceSheet,
        incomeStatement,
        cashFlow
      };
    } catch (error) {
      console.error(`❌ [${this.name}] Failed to fetch data for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  async healthCheck() {
    try {
      await this.getSubmissions('AAPL');
      return true;
    } catch (error) {
      console.error(`❌ [${this.name}] Health check failed:`, error.message);
      return false;
    }
  }

  getStats() {
    return {
      ...super.getStats(),
      cacheSize: this.cache.size,
      cikCacheSize: this.cikCache.size,
      tickersCached: this.tickersCache ? this.tickersCache.size : 0,
      capabilities: ['overview', 'balance_sheet', 'income_statement', 'cash_flow']
    };
  }
}

module.exports = SECProvider;