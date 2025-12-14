// src/services/metricCalculator.js

/**
 * Metric Calculator Service
 * 
 * Transforms raw financial data into value investing metrics
 * 
 * Implements calculations for:
 * - ROIC (Return on Invested Capital)
 * - FCF (Free Cash Flow) and FCF Yield
 * - Owner Earnings (Buffett's preferred metric)
 * - Quality metrics (debt ratios, margins, efficiency)
 * - Valuation metrics (P/E, P/B, etc.)
 */
class MetricCalculator {
  constructor() {
    console.log('✅ Metric Calculator initialized');
  }

  /**
   * Robust field getter - tries multiple field name variations
   * Handles both normalized (camelCase) and original SEC (PascalCase) field names
   *
   * @param {Object} data - Financial statement data object
   * @param {Array<String>} fieldNames - Array of possible field names to try (in order of preference)
   * @returns {Number|null} Parsed float value or null if not found
   */
  getField(data, fieldNames) {
    if (!data) return null;

    for (const fieldName of fieldNames) {
      if (data[fieldName] !== undefined && data[fieldName] !== null) {
        const value = parseFloat(data[fieldName]);
        if (!isNaN(value)) {
          return value;
        }
      }
    }
    return null;
  }

  /**
   * Calculate all metrics for a company's fiscal period
   *
   * @param {Object} financialData - Object containing balance_sheet, income_statement, cash_flow
   * @param {Number} marketCap - Current market capitalization
   * @param {Number} currentPrice - Current stock price
   * @param {Object} context - Optional context for time-series metrics (companyId, fiscalDate, periodType)
   * @returns {Object} All calculated metrics
   */
  calculateAllMetrics(financialData, marketCap, currentPrice, context = null) {
    // Initialize result object with defaults
    const metrics = {
      roic: null,
      roce: null,
      roe: null,
      roa: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      assetTurnover: null,
      debtToEquity: null,
      debtToAssets: null,
      currentRatio: null,
      quickRatio: null,
      interestCoverage: null,
      fcf: null,
      fcfYield: null,
      ownerEarnings: null,
      peRatio: null,
      pbRatio: null,
      psRatio: null,
      earningsYield: null,
      dataQualityScore: 0,
      revenue_growth_yoy: null,
      msi: null,
      tobins_q: null
    };

    // Validate we have minimum required data
    if (!financialData || typeof financialData !== 'object') {
      return metrics;
    }

    const { balance_sheet, income_statement, cash_flow } = financialData;

    // MODIFIED: Allow partial calculations even with incomplete data
    // Some metrics only need income statement (margins, growth)
    // Some need balance sheet + income (ROIC, ROE, ROA)
    // Some need cash flow + income (FCF, Owner Earnings)

    // Minimum requirement: must have income statement
    if (!income_statement) {
      return metrics;
    }

    // SANITY CHECKS: Filter out unrealistic/corrupt data
    // Only check balance sheet values if balance sheet exists
    const totalAssets = balance_sheet ? (this.getField(balance_sheet, ['totalAssets', 'Assets']) || 0) : 0;
    const shareholderEquity = balance_sheet ? (this.getField(balance_sheet, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']) || 0) : 0;
    const revenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']) || 0;

    // Skip companies with unrealistic values
    // Minimum threshold: $1K for revenue (income statement required)
    // Balance sheet thresholds only apply if balance sheet exists
    if (revenue < 1000) {
      metrics.dataQualityScore = 0; // Mark as low quality
      return metrics; // Return null metrics
    }

    // If balance sheet exists but has unrealistic values, skip balance-sheet-dependent metrics
    const hasValidBalanceSheet = balance_sheet && totalAssets >= 10000 && Math.abs(shareholderEquity) >= 10000;

    // Extract period type from context (quarterly vs annual)
    const periodType = context && context.periodType ? context.periodType : 'annual';

    // ========================================
    // 1. PROFITABILITY METRICS
    // ========================================

    // Balance sheet dependent metrics - only calculate if valid balance sheet exists
    if (hasValidBalanceSheet) {
      try {
        metrics.roic = this.calculateROIC(income_statement, balance_sheet, periodType);
      } catch (e) {}

      try {
        metrics.roce = this.calculateROCE(income_statement, balance_sheet, periodType);
      } catch (e) {}

      try {
        metrics.roe = this.calculateROE(income_statement, balance_sheet, periodType);
      } catch (e) {}

      try {
        metrics.roa = this.calculateROA(income_statement, balance_sheet, periodType);
      } catch (e) {}
    }

    // Margins - only need income statement, always calculate
    try {
      metrics.grossMargin = this.calculateGrossMargin(income_statement);
    } catch (e) {}

    try {
      metrics.operatingMargin = this.calculateOperatingMargin(income_statement);
    } catch (e) {}

    try {
      metrics.netMargin = this.calculateNetMargin(income_statement);
    } catch (e) {}

    // ========================================
    // 2. CASH FLOW METRICS
    // ========================================

    // Cash flow dependent metrics - only if cash_flow exists
    if (cash_flow) {
      try {
        metrics.fcf = this.calculateFCF(cash_flow, periodType);
      } catch (e) {}

      try {
        metrics.fcf_margin = this.calculateFCFMargin(cash_flow, income_statement);
      } catch (e) {}

      // Owner earnings requires both cash flow and balance sheet
      if (hasValidBalanceSheet) {
        try {
          metrics.ownerEarnings = this.calculateOwnerEarnings(
            income_statement,
            cash_flow,
            balance_sheet,
            periodType
          );
        } catch (e) {}
      }

      // Cash flow yields (requires market cap)
      if (marketCap) {
        try {
          metrics.fcfYield = this.calculateFCFYield(metrics.fcf, marketCap);
        } catch (e) {}
      }
    }

    // Earnings yield only needs income statement + market cap
    if (marketCap) {
      try {
        metrics.earningsYield = this.calculateEarningsYield(income_statement, marketCap, periodType);
      } catch (e) {}
    }

    // ========================================
    // 3. FINANCIAL HEALTH METRICS
    // ========================================

    // All require balance sheet
    if (hasValidBalanceSheet) {
      try {
        metrics.debtToEquity = this.calculateDebtToEquity(balance_sheet);
      } catch (e) {}

      try {
        metrics.debtToAssets = this.calculateDebtToAssets(balance_sheet);
      } catch (e) {}

      try {
        metrics.currentRatio = this.calculateCurrentRatio(balance_sheet);
      } catch (e) {}

      try {
        metrics.quickRatio = this.calculateQuickRatio(balance_sheet);
      } catch (e) {}
    }

    // Interest coverage only needs income statement
    try {
      metrics.interestCoverage = this.calculateInterestCoverage(income_statement);
    } catch (e) {}

    // ========================================
    // 4. VALUATION METRICS (require market data)
    // ========================================

    // P/E and P/S only need income statement
    if (marketCap) {
      try {
        // Parse and annualize quarterly net income for P/E ratio
        let netIncome = this.getField(income_statement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
        if (netIncome) {
          if (periodType === 'quarterly') {
            netIncome = netIncome * 4;
          }
          metrics.peRatio = marketCap / netIncome;
        }
      } catch (e) {}

      try {
        // Parse and annualize quarterly revenue for P/S ratio
        let totalRevenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']);
        if (totalRevenue) {
          if (periodType === 'quarterly') {
            totalRevenue = totalRevenue * 4;
          }
          metrics.psRatio = marketCap / totalRevenue;
        }
      } catch (e) {}
    }

    // P/B, Tobin's Q, and MSI require balance sheet
    if (hasValidBalanceSheet && marketCap) {
      try {
        const shareholderEquity = this.getField(balance_sheet, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);
        if (shareholderEquity) {
          metrics.pbRatio = marketCap / shareholderEquity;
        }
      } catch (e) {}

      try {
        const totalAssets = this.getField(balance_sheet, ['totalAssets', 'Assets']);
        if (totalAssets) {
          metrics.tobins_q = marketCap / totalAssets;
        }
      } catch (e) {}

      // Misean Stationarity Index (MSI) - Enterprise Value / Book Value
      try {
        const totalLiabilities = this.getField(balance_sheet, ['totalLiabilities', 'Liabilities', 'LiabilitiesAndStockholdersEquity']);
        const totalAssets = this.getField(balance_sheet, ['totalAssets', 'Assets']);
        const cash = this.getField(balance_sheet, ['cashAndEquivalents', 'CashAndCashEquivalentsAtCarryingValue', 'Cash', 'cashAndCashEquivalents']) || 0;

        if (totalLiabilities && totalAssets) {
          const totalDebt = totalLiabilities;
          const enterpriseValue = marketCap + totalDebt - cash;
          const bookValue = totalAssets - totalLiabilities; // Shareholder equity

          if (bookValue && bookValue > 0) {
            metrics.msi = enterpriseValue / bookValue;
          }
        }
      } catch (e) {}
    }

    // ========================================
    // 5. EFFICIENCY METRICS
    // ========================================

    // Asset turnover requires balance sheet
    if (hasValidBalanceSheet) {
      try {
        metrics.assetTurnover = this.calculateAssetTurnover(income_statement, balance_sheet, periodType);
      } catch (e) {}
    }

    // ========================================
    // 6. GROWTH METRICS (require historical data)
    // ========================================

    // Revenue Growth YoY
    if (context && context.companyId && context.fiscalDate && context.periodType) {
      try {
        const totalRevenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']);
        if (totalRevenue) {
          metrics.revenue_growth_yoy = this.calculateRevenueGrowth(
            context.companyId,
            context.fiscalDate,
            context.periodType,
            totalRevenue
          );
        }
      } catch (e) {}
    }

    // ========================================
    // 7. QUALITY SCORE (0-100)
    // ========================================

    try {
      metrics.dataQualityScore = this.calculateQualityScore(metrics);
    } catch (e) {
      metrics.dataQualityScore = 0;
    }

    return metrics;
  }
  
  /**
   * ROIC - Return on Invested Capital
   *
   * Formula: NOPAT / Invested Capital
   * Where:
   *   NOPAT = Operating Income * (1 - Tax Rate)
   *   Invested Capital = Total Assets - Non-interest-bearing Current Liabilities
   *
   * Uses industry standard formula for Invested Capital:
   *   IC = Total Assets - (Current Liabilities - Short-term Debt)
   *
   * This captures all capital invested in operations, including:
   * - Long-term assets (PP&E, intangibles, etc.)
   * - Working capital (excluding cash)
   * - Debt (both short and long-term)
   *
   * For quarterly data: Annualizes NOPAT by multiplying by 4
   *
   * This is Warren Buffett's favorite metric!
   * Shows how efficiently a company uses its capital.
   *
   * Good: > 15%
   * Great: > 20%
   * World-class: > 30%
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateROIC(income, balance, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      const operatingIncome = this.getField(income, ['operatingIncome', 'OperatingIncomeLoss']);
      const netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      const incomeTaxExpense = this.getField(income, ['incomeTaxExpense', 'IncomeTaxExpenseBenefit']) || 0;

      // Balance sheet items for invested capital calculation
      const totalAssets = this.getField(balance, ['totalAssets', 'Assets']);
      const currentLiabilities = this.getField(balance, ['currentLiabilities', 'totalCurrentLiabilities', 'LiabilitiesCurrent']) || 0;
      const shortTermDebt = this.getField(balance, ['shortTermDebt', 'ShortTermBorrowings', 'LongTermDebtCurrent']) || 0;

      // Need operating income for NOPAT calculation
      if (!operatingIncome || operatingIncome === 0) return null;
      if (!totalAssets || totalAssets === 0) return null;

      // Calculate tax rate
      // If incomeBeforeTax is missing, derive it from netIncome + incomeTaxExpense
      let incomeBeforeTax = parseFloat(income.incomeBeforeTax);
      if (!incomeBeforeTax && netIncome && incomeTaxExpense) {
        incomeBeforeTax = netIncome + incomeTaxExpense;
      }

      // Calculate tax rate (handle cases where incomeBeforeTax might be 0 or negative)
      let taxRate = 0;
      if (incomeBeforeTax && incomeBeforeTax !== 0) {
        taxRate = incomeTaxExpense / incomeBeforeTax;
        // Tax rate should be between 0 and 1
        taxRate = Math.max(0, Math.min(1, taxRate));
      }

      // NOPAT = Operating Income * (1 - Tax Rate)
      let nopat = operatingIncome * (1 - taxRate);

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of earnings
      // But invested capital (balance sheet) is the full capital base
      // So we must annualize quarterly NOPAT to get comparable annual rate
      if (periodType === 'quarterly') {
        nopat = nopat * 4;
      }

      // INDUSTRY STANDARD FORMULA:
      // Invested Capital = Total Assets - Non-interest-bearing Current Liabilities
      // Non-interest-bearing current liabilities = Current Liabilities - Short-term Debt
      const nonDebtCurrentLiabilities = currentLiabilities - shortTermDebt;
      const investedCapital = totalAssets - nonDebtCurrentLiabilities;

      if (investedCapital <= 0) return null;

      const roic = (nopat / investedCapital) * 100;

      return Math.round(roic * 10) / 10; // Round to 1 decimal

    } catch (error) {
      console.warn('Could not calculate ROIC:', error.message);
      return null;
    }
  }

  /**
   * ROCE - Return on Capital Employed
   *
   * Formula: EBIT / Capital Employed
   * Where:
   *   EBIT = Operating Income (pre-tax)
   *   Capital Employed = Total Assets - Current Liabilities
   *
   * Popular in UK/European markets. Simpler than ROIC because it's pre-tax.
   * Useful for comparing companies across different tax jurisdictions.
   * For quarterly data: Annualizes EBIT by multiplying by 4
   *
   * Good: > 15%
   * Great: > 20%
   * World-class: > 30%
   *
   * Note: ROCE will typically be higher than ROIC because it's pre-tax.
   * To compare to after-tax cost of capital, use ROIC instead.
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateROCE(income, balance, periodType = 'annual') {
    try {
      // EBIT = Operating Income (already pre-tax)
      let ebit = this.getField(income, ['operatingIncome', 'OperatingIncomeLoss']);

      // Capital Employed = Total Assets - Current Liabilities
      const totalAssets = this.getField(balance, ['totalAssets', 'Assets']);
      const currentLiabilities = this.getField(balance, [
        'currentLiabilities',
        'totalCurrentLiabilities',
        'LiabilitiesCurrent'
      ]) || 0;

      if (!ebit || !totalAssets || totalAssets <= 0) return null;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of earnings
      // But capital employed (balance sheet) is the full capital base
      if (periodType === 'quarterly') {
        ebit = ebit * 4;
      }

      const capitalEmployed = totalAssets - currentLiabilities;

      if (capitalEmployed <= 0) return null;

      const roce = (ebit / capitalEmployed) * 100;

      return Math.round(roce * 10) / 10; // Round to 1 decimal

    } catch (error) {
      console.warn('Could not calculate ROCE:', error.message);
      return null;
    }
  }

  /**
   * ROE - Return on Equity
   *
   * Formula: Net Income / Shareholder Equity
   *
   * Shows how much profit a company generates with shareholders' money.
   * For quarterly data: Annualizes net income by multiplying by 4
   *
   * Good: > 15%
   * Great: > 20%
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateROE(income, balance, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      let netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      const shareholderEquity = this.getField(balance, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);

      if (!netIncome || !shareholderEquity || shareholderEquity <= 0) return null;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of earnings
      // But equity (balance sheet) is the full capital base
      if (periodType === 'quarterly') {
        netIncome = netIncome * 4;
      }

      const roe = (netIncome / shareholderEquity) * 100;
      return Math.round(roe * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * ROA - Return on Assets
   *
   * Formula: Net Income / Total Assets
   *
   * Shows how efficiently a company uses its assets to generate profit.
   * For quarterly data: Annualizes net income by multiplying by 4
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateROA(income, balance, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      let netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      const totalAssets = this.getField(balance, ['totalAssets', 'Assets']);

      if (!netIncome || !totalAssets || totalAssets <= 0) return null;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of earnings
      // But total assets (balance sheet) is the full asset base
      if (periodType === 'quarterly') {
        netIncome = netIncome * 4;
      }

      const roa = (netIncome / totalAssets) * 100;
      return Math.round(roa * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Gross Margin
   * 
   * Formula: (Revenue - Cost of Revenue) / Revenue * 100
   * 
   * Shows pricing power and cost efficiency.
   * 
   * Good varies by industry:
   * - Software: 70-90%
   * - Retail: 20-40%
   * - Manufacturing: 30-50%
   */
  calculateGrossMargin(income) {
    try {
      // Use robust field getter to handle all naming variations
      const revenue = this.getField(income, ['revenue', 'totalRevenue', 'Revenues']);
      if (!revenue || revenue <= 0) return null;

      const grossProfit = this.getField(income, ['grossProfit', 'GrossProfit']);
      const costOfRevenue = this.getField(income, ['costOfRevenue', 'CostOfRevenue', 'CostOfGoodsAndServicesSold']) || 0;

      const actualGrossProfit = grossProfit || (revenue - costOfRevenue);
      const margin = (actualGrossProfit / revenue) * 100;

      return Math.round(margin * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Operating Margin
   * 
   * Formula: Operating Income / Revenue * 100
   * 
   * Shows operational efficiency.
   */
  calculateOperatingMargin(income) {
    try {
      // Use robust field getter to handle all naming variations
      const revenue = this.getField(income, ['revenue', 'totalRevenue', 'Revenues']);
      if (!revenue || revenue <= 0) return null;

      const operatingIncome = this.getField(income, ['operatingIncome', 'OperatingIncomeLoss']) || 0;
      const margin = (operatingIncome / revenue) * 100;
      return Math.round(margin * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Net Margin
   * 
   * Formula: Net Income / Revenue * 100
   * 
   * The bottom line - how much of each dollar becomes profit.
   */
  calculateNetMargin(income) {
    try {
      // Use robust field getter to handle all naming variations
      const revenue = this.getField(income, ['revenue', 'totalRevenue', 'Revenues']);
      if (!revenue || revenue <= 0) return null;

      const netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']) || 0;
      const margin = (netIncome / revenue) * 100;
      return Math.round(margin * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Free Cash Flow (FCF)
   *
   * Formula: Operating Cash Flow - Capital Expenditures
   *
   * The cash a company generates after maintaining/expanding its asset base.
   * This is REAL money that can be:
   * - Returned to shareholders (dividends/buybacks)
   * - Used for growth
   * - Paid down debt
   *
   * Buffett: "Cash is king"
   * For quarterly data: Returns annualized FCF by multiplying by 4
   *
   * @param {Object} cashFlow - Cash flow statement data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateFCF(cashFlow, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      const operatingCashFlow = this.getField(cashFlow, ['operatingCashFlow', 'operatingCashflow', 'NetCashProvidedByUsedInOperatingActivities']) || 0;
      let capex = this.getField(cashFlow, ['capitalExpenditures', 'PaymentsToAcquirePropertyPlantAndEquipment', 'capEx']) || 0;

      // CapEx is usually negative in SEC data, ensure it's positive for subtraction
      capex = Math.abs(capex);

      let fcf = operatingCashFlow - capex;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly cash flow statement shows only 3 months of cash flows
      if (periodType === 'quarterly') {
        fcf = fcf * 4;
      }

      return fcf;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * FCF Margin
   * 
   * Formula: FCF / Revenue * 100
   * 
   * Shows what % of revenue becomes actual free cash.
   */
  calculateFCFMargin(cashFlow, income) {
    try {
      const fcf = this.calculateFCF(cashFlow);
      const totalRevenue = this.getField(income, ['revenue', 'totalRevenue', 'Revenues']);

      if (!fcf || !totalRevenue) return null;

      const margin = (fcf / totalRevenue) * 100;
      return Math.round(margin * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Owner Earnings (Buffett's Metric)
   *
   * Formula: Net Income + D&A - Maintenance CapEx - Working Capital Changes
   *
   * This is what Buffett actually looks at!
   * More accurate than FCF because it accounts for:
   * - Depreciation & Amortization (non-cash)
   * - Only MAINTENANCE capex (not growth capex)
   * - Working capital needs
   *
   * Problem: We don't always know maintenance vs growth capex
   * So we estimate: Maintenance CapEx ≈ 50-70% of total CapEx
   * For quarterly data: Returns annualized owner earnings by multiplying by 4
   *
   * @param {Object} income - Income statement data
   * @param {Object} cashFlow - Cash flow statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateOwnerEarnings(income, cashFlow, balance, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      // Note: netIncome declared but not used - kept for potential future use
      const netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']) || 0;

      // D&A is embedded in operating cash flow calculation
      // So we can approximate: Owner Earnings ≈ Operating Cash Flow - Maintenance CapEx

      const operatingCashFlow = this.getField(cashFlow, ['operatingCashFlow', 'operatingCashflow', 'NetCashProvidedByUsedInOperatingActivities']) || 0;
      let totalCapex = this.getField(cashFlow, ['capitalExpenditures', 'PaymentsToAcquirePropertyPlantAndEquipment', 'capEx']) || 0;

      // CapEx is usually negative in SEC data, ensure it's positive
      totalCapex = Math.abs(totalCapex);

      // Estimate maintenance capex as 60% of total capex
      const maintenanceCapex = totalCapex * 0.6;

      let ownerEarnings = operatingCashFlow - maintenanceCapex;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly cash flow statement shows only 3 months of cash flows
      if (periodType === 'quarterly') {
        ownerEarnings = ownerEarnings * 4;
      }

      return ownerEarnings;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * FCF Yield
   * 
   * Formula: FCF / Market Cap * 100
   * 
   * Like a dividend yield, but better (includes all cash, not just dividends)
   * 
   * Good: > 5%
   * Great: > 8%
   */
  calculateFCFYield(fcf, marketCap) {
    try {
      if (!fcf || !marketCap || marketCap <= 0) return null;
      
      const yield_pct = (fcf / marketCap) * 100;
      return Math.round(yield_pct * 10) / 10;
      
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Earnings Yield
   *
   * Formula: Net Income / Market Cap * 100
   *
   * The inverse of P/E ratio. Easier to compare with bond yields.
   * For quarterly data: Uses annualized net income by multiplying by 4
   *
   * Example: If earnings yield is 5% and bonds yield 3%,
   * stocks might be attractive.
   *
   * @param {Object} income - Income statement data
   * @param {Number} marketCap - Market capitalization
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   */
  calculateEarningsYield(income, marketCap, periodType = 'annual') {
    try {
      if (!marketCap || marketCap <= 0) return null;

      // Use robust field getter to handle all naming variations
      let netIncome = this.getField(income, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      if (!netIncome) return null;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of earnings
      // But market cap is the full company valuation
      if (periodType === 'quarterly') {
        netIncome = netIncome * 4;
      }

      const yield_pct = (netIncome / marketCap) * 100;
      return Math.round(yield_pct * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Debt to Equity Ratio
   *
   * Formula: Total Debt / Shareholder Equity
   *
   * NOW INCLUDES OPERATING LEASE LIABILITIES (ASC 842, post-2019)
   *
   * Shows financial leverage.
   *
   * Buffett prefers: < 0.5 (low debt)
   * Acceptable: < 1.0
   * Risky: > 2.0
   */
  calculateDebtToEquity(balance) {
    try {
      // Use robust field getter to handle all naming variations
      const shareholderEquity = this.getField(balance, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);
      if (!shareholderEquity || shareholderEquity <= 0) return null;

      const longTermDebt = this.getField(balance, ['longTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebt']) || 0;
      const shortTermDebt = this.getField(balance, ['shortTermDebt', 'ShortTermBorrowings', 'LongTermDebtCurrent']) || 0;

      // CRITICAL FIX: Add operating lease liabilities (ASC 842 - effective 2019+)
      // These are real obligations that must be paid, just like debt
      // Significantly understated for companies like Starbucks, airlines, retailers
      const operatingLeaseLiabilitiesNoncurrent = this.getField(balance, [
        'operatingLeaseLiabilityNoncurrent',
        'OperatingLeaseLiabilityNoncurrent'
      ]) || 0;
      const operatingLeaseLiabilitiesCurrent = this.getField(balance, [
        'operatingLeaseLiabilityCurrent',
        'OperatingLeaseLiabilityCurrent'
      ]) || 0;

      const totalDebt = longTermDebt + shortTermDebt + operatingLeaseLiabilitiesNoncurrent + operatingLeaseLiabilitiesCurrent;
      const ratio = totalDebt / shareholderEquity;

      return Math.round(ratio * 100) / 100; // Round to 2 decimals

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Debt to Assets Ratio
   *
   * Formula: Total Debt / Total Assets
   *
   * NOW INCLUDES OPERATING LEASE LIABILITIES (ASC 842, post-2019)
   *
   * Alternative debt measure.
   *
   * Good: < 0.3
   * Acceptable: < 0.5
   */
  calculateDebtToAssets(balance) {
    try {
      // Use robust field getter to handle all naming variations
      const totalAssets = this.getField(balance, ['totalAssets', 'Assets']);
      if (!totalAssets || totalAssets <= 0) return null;

      const longTermDebt = this.getField(balance, ['longTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebt']) || 0;
      const shortTermDebt = this.getField(balance, ['shortTermDebt', 'ShortTermBorrowings', 'LongTermDebtCurrent']) || 0;

      // CRITICAL FIX: Add operating lease liabilities (ASC 842 - effective 2019+)
      const operatingLeaseLiabilitiesNoncurrent = this.getField(balance, [
        'operatingLeaseLiabilityNoncurrent',
        'OperatingLeaseLiabilityNoncurrent'
      ]) || 0;
      const operatingLeaseLiabilitiesCurrent = this.getField(balance, [
        'operatingLeaseLiabilityCurrent',
        'OperatingLeaseLiabilityCurrent'
      ]) || 0;

      const totalDebt = longTermDebt + shortTermDebt + operatingLeaseLiabilitiesNoncurrent + operatingLeaseLiabilitiesCurrent;
      const ratio = totalDebt / totalAssets;

      return Math.round(ratio * 100) / 100;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Current Ratio
   * 
   * Formula: Current Assets / Current Liabilities
   * 
   * Measures short-term liquidity.
   * 
   * Good: > 1.5
   * Minimum: > 1.0
   */
  calculateCurrentRatio(balance) {
    try {
      // Use robust field getter to handle all naming variations
      const currentAssets = this.getField(balance, ['currentAssets', 'AssetsCurrent']);
      const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent', 'totalCurrentLiabilities']);

      if (!currentAssets || !currentLiabilities || currentLiabilities <= 0) return null;

      const ratio = currentAssets / currentLiabilities;
      return Math.round(ratio * 100) / 100;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Quick Ratio (Acid Test)
   *
   * IMPROVED FORMULA:
   * (Cash + Marketable Securities + Receivables) / Current Liabilities
   *
   * Traditional: (Current Assets - Inventory) / Current Liabilities
   * New: More precise by explicitly including most liquid assets
   *
   * This is MORE ACCURATE because:
   * - Explicitly includes marketable securities (highly liquid)
   * - For tech companies like Apple with $100B+ in marketable securities,
   *   the old formula significantly understated true liquidity
   *
   * Good: > 1.0
   * Great: > 1.5
   */
  calculateQuickRatio(balance) {
    try {
      // Use robust field getter to handle all naming variations
      const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent', 'totalCurrentLiabilities']);
      if (!currentLiabilities || currentLiabilities <= 0) return null;

      // IMPROVED: Explicitly sum most liquid assets
      const cash = this.getField(balance, [
        'cashAndEquivalents',
        'CashAndCashEquivalentsAtCarryingValue',
        'Cash',
        'cashAndCashEquivalents'
      ]) || 0;

      const marketableSecurities = this.getField(balance, [
        'marketableSecurities',
        'MarketableSecurities',
        'AvailableForSaleSecurities',
        'AvailableForSaleSecuritiesCurrent'
      ]) || 0;

      const receivables = this.getField(balance, [
        'accountsReceivable',
        'AccountsReceivableNetCurrent',
        'receivables',
        'Receivables'
      ]) || 0;

      // If we have explicit components, use them
      if (cash > 0 || marketableSecurities > 0 || receivables > 0) {
        const quickAssets = cash + marketableSecurities + receivables;
        const ratio = quickAssets / currentLiabilities;
        return Math.round(ratio * 100) / 100;
      }

      // Fallback to traditional formula if explicit components not available
      const currentAssets = this.getField(balance, ['currentAssets', 'AssetsCurrent']);
      const inventory = this.getField(balance, ['inventory', 'InventoryNet', 'Inventory']) || 0;

      if (!currentAssets) return null;

      const quickAssets = currentAssets - inventory;
      const ratio = quickAssets / currentLiabilities;

      return Math.round(ratio * 100) / 100;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Interest Coverage Ratio
   * 
   * Formula: Operating Income / Interest Expense
   * 
   * How many times can the company pay its interest?
   * 
   * Good: > 5
   * Minimum: > 2
   * Dangerous: < 1.5
   */
  calculateInterestCoverage(income) {
    try {
      // Use robust field getter to handle all naming variations
      const operatingIncome = this.getField(income, ['operatingIncome', 'OperatingIncomeLoss']);

      // Interest expense might be in the raw data or directly on income object
      const interestExpense = income.raw?.interestExpense ||
                             income.raw?.interestAndDebtExpense ||
                             this.getField(income, ['interestExpense', 'InterestExpense', 'interestAndDebtExpense']);

      if (!operatingIncome || !interestExpense || interestExpense <= 0) return null;

      const ratio = operatingIncome / interestExpense;
      return Math.round(ratio * 10) / 10;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Asset Turnover
   * 
   * Formula: Revenue / Total Assets
   * 
   * How efficiently does the company use its assets to generate revenue?
   * 
   * Higher is better (varies by industry)
   * - Tech/Software: 0.5-1.0
   * - Retail: 2.0-3.0
   */
  calculateAssetTurnover(income, balance, periodType = 'annual') {
    try {
      // Use robust field getter to handle all naming variations
      let totalRevenue = this.getField(income, ['revenue', 'totalRevenue', 'Revenues']);
      const totalAssets = this.getField(balance, ['totalAssets', 'Assets']);

      if (!totalRevenue || !totalAssets || totalAssets <= 0) return null;

      // ANNUALIZE QUARTERLY DATA
      // Quarterly income statement shows only 3 months of revenue
      // But total assets (balance sheet) is the full asset base
      if (periodType === 'quarterly') {
        totalRevenue = totalRevenue * 4;
      }

      const turnover = totalRevenue / totalAssets;
      return Math.round(turnover * 100) / 100;

    } catch (error) {
      return null;
    }
  }
  
  /**
   * Quality Score (0-100)
   * 
   * Our proprietary scoring system based on:
   * - High ROIC (20 points)
   * - Strong margins (20 points)
   * - Low debt (20 points)
   * - Positive FCF (20 points)
   * - Good liquidity (10 points)
   * - Reasonable valuation (10 points)
   * 
   * This gives you a quick way to rank companies!
   */
  calculateQualityScore(metrics) {
    let score = 0;
    
    // 1. ROIC (20 points)
    if (metrics.roic !== null) {
      if (metrics.roic >= 30) score += 20;
      else if (metrics.roic >= 20) score += 15;
      else if (metrics.roic >= 15) score += 10;
      else if (metrics.roic >= 10) score += 5;
    }
    
    // 2. Margins (20 points)
    if (metrics.net_margin !== null) {
      if (metrics.net_margin >= 20) score += 20;
      else if (metrics.net_margin >= 15) score += 15;
      else if (metrics.net_margin >= 10) score += 10;
      else if (metrics.net_margin >= 5) score += 5;
    }
    
    // 3. Debt (20 points)
    if (metrics.debt_to_equity !== null) {
      if (metrics.debt_to_equity <= 0.3) score += 20;
      else if (metrics.debt_to_equity <= 0.5) score += 15;
      else if (metrics.debt_to_equity <= 1.0) score += 10;
      else if (metrics.debt_to_equity <= 2.0) score += 5;
    }
    
    // 4. Free Cash Flow (20 points)
    if (metrics.fcf_yield !== null) {
      if (metrics.fcf_yield >= 8) score += 20;
      else if (metrics.fcf_yield >= 5) score += 15;
      else if (metrics.fcf_yield >= 3) score += 10;
      else if (metrics.fcf_yield >= 1) score += 5;
    }
    
    // 5. Liquidity (10 points)
    if (metrics.current_ratio !== null) {
      if (metrics.current_ratio >= 2.0) score += 10;
      else if (metrics.current_ratio >= 1.5) score += 7;
      else if (metrics.current_ratio >= 1.0) score += 4;
    }
    
    // 6. Valuation (10 points)
    if (metrics.pe_ratio !== null) {
      if (metrics.pe_ratio <= 15) score += 10;
      else if (metrics.pe_ratio <= 20) score += 7;
      else if (metrics.pe_ratio <= 25) score += 4;
    }
    
    return score;
  }

  /**
   * Calculate revenue growth year-over-year
   * Compares current period revenue to same period prior year
   *
   * @param {Number} companyId - Company ID
   * @param {String} fiscalDate - Current period fiscal date (YYYY-MM-DD)
   * @param {String} periodType - 'annual' or 'quarterly'
   * @param {Number} currentRevenue - Current period revenue
   * @returns {Number|null} Revenue growth percentage (e.g., 25.5 for 25.5% growth)
   */
  calculateRevenueGrowth(companyId, fiscalDate, periodType, currentRevenue) {
    if (!companyId || !fiscalDate || !currentRevenue) return null;

    try {
      const db = require('../database');
      const database = db.getDatabase();

      // Parse current date
      const currentDate = new Date(fiscalDate);
      const priorYearDate = new Date(currentDate);
      priorYearDate.setFullYear(currentDate.getFullYear() - 1);

      // Format date range for query (allow +/- 45 days for quarterly matching)
      const minDate = new Date(priorYearDate);
      minDate.setDate(minDate.getDate() - 45);
      const maxDate = new Date(priorYearDate);
      maxDate.setDate(maxDate.getDate() + 45);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Query prior year data
      const priorData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'income_statement'
          AND period_type = ?
          AND fiscal_date_ending >= ?
          AND fiscal_date_ending <= ?
        ORDER BY ABS(JULIANDAY(fiscal_date_ending) - JULIANDAY(?))
        LIMIT 1
      `).get(companyId, periodType, minDateStr, maxDateStr, priorYearDate.toISOString().split('T')[0]);

      if (!priorData) return null;

      const priorIncomeStatement = JSON.parse(priorData.data);
      const priorRevenue = this.getField(priorIncomeStatement, ['revenue', 'totalRevenue', 'Revenues']);

      if (!priorRevenue || priorRevenue <= 0) return null;

      // Calculate growth percentage
      const growth = ((currentRevenue - priorRevenue) / priorRevenue) * 100;
      return growth;

    } catch (error) {
      console.error('Error calculating revenue growth:', error.message);
      return null;
    }
  }

  /**
   * Get metric interpretation
   * Helps users understand what the numbers mean
   */
  interpretMetric(metricName, value) {
    const interpretations = {
      roic: [
        { threshold: 30, label: 'World-class', color: 'green' },
        { threshold: 20, label: 'Excellent', color: 'green' },
        { threshold: 15, label: 'Good', color: 'blue' },
        { threshold: 10, label: 'Average', color: 'yellow' },
        { threshold: 0, label: 'Poor', color: 'red' }
      ],
      fcf_yield: [
        { threshold: 8, label: 'Excellent value', color: 'green' },
        { threshold: 5, label: 'Good value', color: 'green' },
        { threshold: 3, label: 'Fair value', color: 'blue' },
        { threshold: 0, label: 'Expensive', color: 'yellow' }
      ],
      debt_to_equity: [
        { threshold: 0.3, label: 'Very safe', color: 'green' },
        { threshold: 0.5, label: 'Safe', color: 'green' },
        { threshold: 1.0, label: 'Moderate risk', color: 'yellow' },
        { threshold: 2.0, label: 'High risk', color: 'red' },
        { threshold: Infinity, label: 'Very high risk', color: 'red' }
      ],
      quality_score: [
        { threshold: 80, label: 'Exceptional', color: 'green' },
        { threshold: 60, label: 'High quality', color: 'green' },
        { threshold: 40, label: 'Average quality', color: 'blue' },
        { threshold: 20, label: 'Low quality', color: 'yellow' },
        { threshold: 0, label: 'Poor quality', color: 'red' }
      ]
    };
    
    const scale = interpretations[metricName];
    if (!scale || value === null) return { label: 'N/A', color: 'gray' };
    
    for (const level of scale) {
      if (value >= level.threshold) {
        return level;
      }
    }
    
    return { label: 'N/A', color: 'gray' };
  }
}

module.exports = MetricCalculator;

// If run directly (for testing)
if (require.main === module) {
  const db = require('../database');
  
  console.log('\n🧪 Testing Metric Calculator...\n');
  
  const calculator = new MetricCalculator();
  
  // Get a company with financial data
  const company = db.getDatabase().prepare(`
    SELECT * FROM companies WHERE symbol = 'AAPL' LIMIT 1
  `).get();
  
  if (!company) {
    console.log('❌ No company data found. Run the importer first!');
    process.exit(1);
  }
  
  console.log(`📊 Calculating metrics for ${company.symbol}...\n`);
  
  // Get latest financial data
  const financials = db.getDatabase().prepare(`
    SELECT statement_type, data
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending = (
        SELECT MAX(fiscal_date_ending) 
        FROM financial_data 
        WHERE company_id = ?
      )
  `).all(company.id, company.id);
  
  // Parse and organize the data
  const financialData = {};
  financials.forEach(f => {
    financialData[f.statement_type] = JSON.parse(f.data);
  });
  
  // Calculate metrics
  const metrics = calculator.calculateAllMetrics(
    financialData,
    company.market_cap,
    null // We don't have current price in this test
  );
  
  if (metrics) {
    console.log('✅ PROFITABILITY:');
    console.log(`   ROIC: ${metrics.roic}% ${calculator.interpretMetric('roic', metrics.roic).label}`);
    console.log(`   ROE: ${metrics.roe}%`);
    console.log(`   ROA: ${metrics.roa}%`);
    console.log('');
    
    console.log('✅ MARGINS:');
    console.log(`   Gross Margin: ${metrics.gross_margin}%`);
    console.log(`   Operating Margin: ${metrics.operating_margin}%`);
    console.log(`   Net Margin: ${metrics.net_margin}%`);
    console.log('');
    
    console.log('✅ CASH FLOW:');
    console.log(`   Free Cash Flow: $${(metrics.fcf / 1e9).toFixed(2)}B`);
    console.log(`   FCF Margin: ${metrics.fcf_margin}%`);
    console.log(`   FCF Yield: ${metrics.fcf_yield}%`);
    console.log('');
    
    console.log('✅ FINANCIAL HEALTH:');
    console.log(`   Debt/Equity: ${metrics.debt_to_equity} ${calculator.interpretMetric('debt_to_equity', metrics.debt_to_equity).label}`);
    console.log(`   Current Ratio: ${metrics.current_ratio}`);
    console.log('');
    
    console.log('✅ VALUATION:');
    console.log(`   P/E Ratio: ${metrics.pe_ratio?.toFixed(1) || 'N/A'}`);
    console.log(`   P/B Ratio: ${metrics.pb_ratio?.toFixed(1) || 'N/A'}`);
    console.log('');
    
    console.log('⭐ QUALITY SCORE:', metrics.quality_score, '/100');
    console.log(`   ${calculator.interpretMetric('quality_score', metrics.quality_score).label}`);
    
  } else {
    console.log('❌ Could not calculate metrics');
  }
}