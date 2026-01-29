/**
 * Yahoo Finance Data Fetcher
 *
 * Fetches financial metrics from Yahoo Finance for validation.
 * Includes rate limiting and error handling.
 */

class YahooFetcher {
  constructor(options = {}) {
    this.delay = options.delay || 500; // ms between requests
    this.maxRetries = options.maxRetries || 3;
    this.rateLimitWaitMs = options.rateLimitWaitMs || 60000; // 60 seconds on rate limit
    this.lastRequest = 0;
    this.yahooFinance = null;
    this.initialized = false;
  }

  /**
   * Initialize Yahoo Finance library (lazy loading for ESM)
   */
  async init() {
    if (!this.initialized) {
      // yahoo-finance2 v3.x is an ESM module requiring instantiation
      const yf = await import('yahoo-finance2');
      // v3.x requires creating an instance
      const YahooFinance = yf.default;
      this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
      this.initialized = true;
    }
  }

  /**
   * Rate limiter - ensures we don't exceed API limits
   */
  async rateLimit() {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.delay) {
      await new Promise(r => setTimeout(r, this.delay - elapsed));
    }
    this.lastRequest = Date.now();
  }

  /**
   * Fetch metrics for a single company
   * @param {string} symbol - Stock symbol
   * @returns {Object} Metrics data or error
   */
  async fetchMetrics(symbol) {
    await this.init();
    await this.rateLimit();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.yahooFinance.quoteSummary(symbol, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail']
        });

        const fd = result.financialData || {};
        const ks = result.defaultKeyStatistics || {};
        const sd = result.summaryDetail || {};

        // Transform Yahoo values to match our format (percentages as whole numbers)
        return {
          symbol,
          success: true,
          timestamp: new Date().toISOString(),
          data: {
            // Profitability metrics (Yahoo returns as decimals, we store as percentages)
            roe: this.toPercent(fd.returnOnEquity),
            roa: this.toPercent(fd.returnOnAssets),
            gross_margin: this.toPercent(fd.grossMargins),
            operating_margin: this.toPercent(fd.operatingMargins),
            net_margin: this.toPercent(fd.profitMargins),

            // Liquidity ratios (already as ratios)
            current_ratio: this.toNumber(fd.currentRatio),
            quick_ratio: this.toNumber(fd.quickRatio),

            // Leverage (Yahoo returns as percentage, we store as ratio)
            debt_to_equity: fd.debtToEquity != null ? fd.debtToEquity / 100 : null,

            // Valuation metrics
            pe_ratio: this.toNumber(ks.trailingPE) || this.toNumber(sd.trailingPE),
            forward_pe: this.toNumber(ks.forwardPE) || this.toNumber(sd.forwardPE),
            pb_ratio: this.toNumber(ks.priceToBook),
            ps_ratio: this.toNumber(ks.priceToSalesTrailing12Months),
            peg_ratio: this.toNumber(ks.pegRatio),

            // Growth metrics
            earnings_growth: this.toPercent(fd.earningsGrowth),
            revenue_growth: this.toPercent(fd.revenueGrowth),

            // Dividend info
            dividend_yield: this.toPercent(sd.dividendYield),

            // Additional data points for reference
            beta: this.toNumber(ks.beta),
            market_cap: this.toNumber(sd.marketCap),
            enterprise_value: this.toNumber(ks.enterpriseValue),
          },
          raw: {
            financialData: fd,
            keyStatistics: ks,
            summaryDetail: sd,
          }
        };

      } catch (error) {
        if (attempt === this.maxRetries) {
          return {
            symbol,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }

        // Wait before retry with exponential backoff
        await new Promise(r => setTimeout(r, this.delay * attempt));
      }
    }
  }

  /**
   * Convert decimal to percentage (0.15 -> 15)
   */
  toPercent(value) {
    if (value == null || isNaN(value)) return null;
    return value * 100;
  }

  /**
   * Safely convert to number
   */
  toNumber(value) {
    if (value == null || isNaN(value)) return null;
    return Number(value);
  }

  /**
   * Fetch metrics for multiple companies with progress callback
   * @param {Array} symbols - Array of stock symbols
   * @param {Function} onProgress - Progress callback
   * @returns {Array} Array of results
   */
  async fetchMultiple(symbols, onProgress = () => {}) {
    const results = [];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const result = await this.fetchMetrics(symbol);
      results.push(result);

      onProgress({
        current: i + 1,
        total: symbols.length,
        symbol,
        success: result.success,
      });
    }

    return results;
  }

  /**
   * Get estimated time for fetching N symbols
   */
  estimateTime(count) {
    const msPerSymbol = this.delay + 200; // delay + average fetch time
    const totalMs = count * msPerSymbol;
    return {
      seconds: Math.ceil(totalMs / 1000),
      minutes: (totalMs / 60000).toFixed(1),
    };
  }

  /**
   * Fetch financial statements (income, balance sheet, cash flow) from Yahoo Finance
   * Uses fundamentalsTimeSeries API (required since Nov 2024)
   *
   * @param {string} symbol - Yahoo Finance symbol (e.g., 'SAP.DE')
   * @returns {Object} Financial statements data
   */
  async fetchFinancials(symbol) {
    await this.init();
    await this.rateLimit();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Use fundamentalsTimeSeries for financial data (new API since Nov 2024)
        const timeSeries = await this.yahooFinance.fundamentalsTimeSeries(symbol, {
          period1: '2019-01-01',
          period2: new Date().toISOString().split('T')[0],
          type: 'annual',
          module: 'all',
        });

        // Also get quarterly data
        const quarterlyTimeSeries = await this.yahooFinance.fundamentalsTimeSeries(symbol, {
          period1: '2022-01-01',
          period2: new Date().toISOString().split('T')[0],
          type: 'quarterly',
          module: 'all',
        });

        // Get key stats from quoteSummary (still works)
        const summary = await this.yahooFinance.quoteSummary(symbol, {
          modules: ['financialData', 'defaultKeyStatistics']
        });

        return {
          symbol,
          success: true,
          timestamp: new Date().toISOString(),
          data: {
            incomeStatement: {
              annual: this.normalizeTimeSeriesStatements(timeSeries, 'income'),
              quarterly: this.normalizeTimeSeriesStatements(quarterlyTimeSeries, 'income'),
            },
            balanceSheet: {
              annual: this.normalizeTimeSeriesStatements(timeSeries, 'balance'),
              quarterly: this.normalizeTimeSeriesStatements(quarterlyTimeSeries, 'balance'),
            },
            cashFlow: {
              annual: this.normalizeTimeSeriesStatements(timeSeries, 'cashflow'),
              quarterly: this.normalizeTimeSeriesStatements(quarterlyTimeSeries, 'cashflow'),
            },
            financialData: summary.financialData || {},
            keyStatistics: summary.defaultKeyStatistics || {},
          },
        };

      } catch (error) {
        // Handle rate limiting with much longer waits
        if (error.message?.includes('429') || error.message?.includes('Too Many')) {
          const waitTime = this.rateLimitWaitMs * attempt; // 60s, 120s, 180s...
          console.log(`  Rate limited (${symbol}), waiting ${waitTime/1000}s before retry ${attempt}/${this.maxRetries}...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        if (attempt === this.maxRetries) {
          return {
            symbol,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }

        // Wait before retry with exponential backoff for other errors
        await new Promise(r => setTimeout(r, this.delay * attempt * 2));
      }
    }
  }

  /**
   * Normalize fundamentalsTimeSeries data to our format
   */
  normalizeTimeSeriesStatements(timeSeries, type) {
    if (!timeSeries || !Array.isArray(timeSeries)) return [];

    return timeSeries.map(entry => {
      const date = entry.date || entry.asOfDate;
      if (!date) return null;

      const endDate = new Date(date).toISOString().split('T')[0];

      const base = {
        fiscalDateEnding: endDate,
        fiscalYear: new Date(date).getFullYear(),
        source: 'yahoo_finance',
      };

      if (type === 'income') {
        return {
          ...base,
          totalRevenue: this.toNumber(entry.TotalRevenue),
          costOfRevenue: this.toNumber(entry.CostOfRevenue),
          grossProfit: this.toNumber(entry.GrossProfit),
          operatingExpenses: this.toNumber(entry.OperatingExpense),
          operatingIncome: this.toNumber(entry.OperatingIncome),
          netIncome: this.toNumber(entry.NetIncome || entry.NetIncomeCommonStockholders),
          ebit: this.toNumber(entry.EBIT),
          ebitda: this.toNumber(entry.EBITDA),
          interestExpense: this.toNumber(entry.InterestExpense),
          incomeBeforeTax: this.toNumber(entry.PretaxIncome),
          incomeTaxExpense: this.toNumber(entry.TaxProvision),
          researchDevelopment: this.toNumber(entry.ResearchAndDevelopment),
        };
      }

      if (type === 'balance') {
        return {
          ...base,
          totalAssets: this.toNumber(entry.TotalAssets),
          totalLiabilities: this.toNumber(entry.TotalLiabilitiesNetMinorityInterest || entry.TotalLiabilities),
          shareholderEquity: this.toNumber(entry.StockholdersEquity || entry.TotalEquityGrossMinorityInterest),
          currentAssets: this.toNumber(entry.CurrentAssets),
          currentLiabilities: this.toNumber(entry.CurrentLiabilities),
          cashAndEquivalents: this.toNumber(entry.CashAndCashEquivalents || entry.CashCashEquivalentsAndShortTermInvestments),
          shortTermInvestments: this.toNumber(entry.OtherShortTermInvestments),
          inventory: this.toNumber(entry.Inventory),
          accountsReceivable: this.toNumber(entry.AccountsReceivable || entry.Receivables),
          longTermDebt: this.toNumber(entry.LongTermDebt),
          shortTermDebt: this.toNumber(entry.CurrentDebt || entry.ShortTermDebt),
          retainedEarnings: this.toNumber(entry.RetainedEarnings),
          propertyPlantEquipment: this.toNumber(entry.NetPPE || entry.PropertyPlantEquipmentNet),
          goodwill: this.toNumber(entry.Goodwill),
          intangibleAssets: this.toNumber(entry.GoodwillAndOtherIntangibleAssets),
        };
      }

      if (type === 'cashflow') {
        const opCashflow = this.toNumber(entry.OperatingCashFlow || entry.CashFlowFromContinuingOperatingActivities);
        const capex = this.toNumber(entry.CapitalExpenditure || entry.PurchaseOfPPE);

        return {
          ...base,
          operatingCashflow: opCashflow,
          capitalExpenditures: capex,
          freeCashFlow: opCashflow && capex ? opCashflow - Math.abs(capex) : null,
          dividendsPaid: this.toNumber(entry.CashDividendsPaid || entry.PaymentOfDividends),
          stockRepurchased: this.toNumber(entry.RepurchaseOfCapitalStock),
          debtRepayment: this.toNumber(entry.RepaymentOfDebt),
          investmentsInProperty: capex,
          changeInCash: this.toNumber(entry.ChangeInCashSupplementalAsReported),
        };
      }

      return base;
    }).filter(Boolean);
  }

  /**
   * Normalize Yahoo Finance statements to our database format
   */
  normalizeStatements(statements, type) {
    if (!statements || !Array.isArray(statements)) return [];

    return statements.map(stmt => {
      const endDate = stmt.endDate ? new Date(stmt.endDate).toISOString().split('T')[0] : null;
      if (!endDate) return null;

      const base = {
        fiscalDateEnding: endDate,
        fiscalYear: new Date(endDate).getFullYear(),
        source: 'yahoo_finance',
      };

      if (type === 'income') {
        return {
          ...base,
          totalRevenue: this.toNumber(stmt.totalRevenue),
          costOfRevenue: this.toNumber(stmt.costOfRevenue),
          grossProfit: this.toNumber(stmt.grossProfit),
          operatingExpenses: this.toNumber(stmt.totalOperatingExpenses),
          operatingIncome: this.toNumber(stmt.operatingIncome),
          netIncome: this.toNumber(stmt.netIncome),
          ebit: this.toNumber(stmt.ebit),
          interestExpense: this.toNumber(stmt.interestExpense),
          incomeBeforeTax: this.toNumber(stmt.incomeBeforeTax),
          incomeTaxExpense: this.toNumber(stmt.incomeTaxExpense),
          researchDevelopment: this.toNumber(stmt.researchDevelopment),
        };
      }

      if (type === 'balance') {
        return {
          ...base,
          totalAssets: this.toNumber(stmt.totalAssets),
          totalLiabilities: this.toNumber(stmt.totalLiab),
          shareholderEquity: this.toNumber(stmt.totalStockholderEquity),
          currentAssets: this.toNumber(stmt.totalCurrentAssets),
          currentLiabilities: this.toNumber(stmt.totalCurrentLiabilities),
          cashAndEquivalents: this.toNumber(stmt.cash),
          shortTermInvestments: this.toNumber(stmt.shortTermInvestments),
          inventory: this.toNumber(stmt.inventory),
          accountsReceivable: this.toNumber(stmt.netReceivables),
          longTermDebt: this.toNumber(stmt.longTermDebt),
          shortTermDebt: this.toNumber(stmt.shortLongTermDebt),
          retainedEarnings: this.toNumber(stmt.retainedEarnings),
          propertyPlantEquipment: this.toNumber(stmt.propertyPlantEquipment),
          goodwill: this.toNumber(stmt.goodWill),
          intangibleAssets: this.toNumber(stmt.intangibleAssets),
        };
      }

      if (type === 'cashflow') {
        return {
          ...base,
          operatingCashflow: this.toNumber(stmt.totalCashFromOperatingActivities),
          capitalExpenditures: this.toNumber(stmt.capitalExpenditures),
          freeCashFlow: this.toNumber(stmt.totalCashFromOperatingActivities) -
                        Math.abs(this.toNumber(stmt.capitalExpenditures) || 0),
          dividendsPaid: this.toNumber(stmt.dividendsPaid),
          stockRepurchased: this.toNumber(stmt.repurchaseOfStock),
          debtRepayment: this.toNumber(stmt.repaymentOfDebt),
          investmentsInProperty: this.toNumber(stmt.capitalExpenditures),
          acquisitions: this.toNumber(stmt.acquisitions),
          changeInCash: this.toNumber(stmt.changeInCash),
        };
      }

      return base;
    }).filter(Boolean);
  }
}

module.exports = YahooFetcher;
