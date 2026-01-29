// src/services/metricCalculator.js

/**
 * Metric Calculator Service
 *
 * Transforms raw financial data into value investing metrics.
 *
 * ============================================================================
 * NULL HANDLING POLICY
 * ============================================================================
 *
 * This service follows consistent null handling rules to ensure data quality:
 *
 * 1. INPUT VALIDATION:
 *    - Missing or invalid input data returns null (not 0, not NaN)
 *    - The getField() helper returns null if field is missing or unparseable
 *    - All calculation methods check for null inputs before proceeding
 *
 * 2. CALCULATION RULES:
 *    - Division by zero returns null (not Infinity, not error)
 *    - Operations with null operands return null (null propagation)
 *    - Negative denominators use Math.abs() for growth calculations
 *
 * 3. AGGREGATION RULES:
 *    - SQL AVG() automatically excludes null values
 *    - JavaScript aggregations filter nulls: values.filter(v => v != null)
 *    - Empty arrays after filtering return null, not 0
 *
 * 4. DATA QUALITY:
 *    - dataQualityScore: 0-100 based on metric completeness
 *    - Metrics requiring specific data (e.g., market cap) may be null
 *    - Period-specific metrics (QoQ for annual, CAGR for quarterly) are null
 *
 * 5. DISPLAY RECOMMENDATIONS:
 *    - Frontend should show "N/A" or "-" for null values
 *    - Charts should exclude null data points (not plot as 0)
 *    - Screening filters should use IS NOT NULL to exclude incomplete data
 *
 * ============================================================================
 *
 * Implements calculations for:
 * - ROIC (Return on Invested Capital)
 * - FCF (Free Cash Flow) and FCF Yield
 * - Owner Earnings (Buffett's preferred metric)
 * - Quality metrics (debt ratios, margins, efficiency)
 * - Valuation metrics (P/E, P/B, etc.)
 * - Growth metrics (YoY, QoQ, CAGR)
 * - DuPont analysis (ROE decomposition)
 */
class MetricCalculator {
  // Define reasonable bounds for all metrics to prevent extreme outliers
  // IMPORTANT: Include both camelCase and snake_case versions since database uses snake_case
  static METRIC_BOUNDS = {
    // Return metrics (percentage bounds)
    roic: [-200, 300],
    roce: [-200, 300],
    roe: [-200, 300],
    roa: [-100, 100],

    // Margin metrics
    grossMargin: [0, 100],
    gross_margin: [0, 100],
    operatingMargin: [-100, 100],
    operating_margin: [-100, 100],
    netMargin: [-200, 100],
    net_margin: [-200, 100],
    fcfYield: [-100, 100],
    fcf_yield: [-100, 100],
    fcf_margin: [-100, 100],

    // Valuation ratios
    peRatio: [0, 1000],
    pe_ratio: [0, 1000],
    pbRatio: [0, 100],
    pb_ratio: [0, 100],
    psRatio: [0, 100],
    ps_ratio: [0, 100],
    evEbitda: [0, 100],
    ev_ebitda: [0, 100],
    pegRatio: [-20, 20],
    peg_ratio: [-20, 20],
    pegyRatio: [-20, 20],
    pegy_ratio: [-20, 20],
    earningsYield: [-50, 100],
    earnings_yield: [-50, 100],
    tobins_q: [0, 20],
    graham_number: [0, 10000],

    // Leverage/liquidity ratios
    debtToEquity: [0, 20],
    debt_to_equity: [0, 20],
    debtToAssets: [0, 1],
    debt_to_assets: [0, 1],
    currentRatio: [0, 50],
    current_ratio: [0, 50],
    quickRatio: [0, 50],
    quick_ratio: [0, 50],
    cashRatio: [0, 20],
    cash_ratio: [0, 20],
    interestCoverage: [-100, 1000],
    interest_coverage: [-100, 1000],

    // Efficiency metrics
    assetTurnover: [0, 20],
    asset_turnover: [0, 20],
    equityMultiplier: [0, 50],
    equity_multiplier: [0, 50],
    dupontRoe: [-200, 300],
    dupont_roe: [-200, 300],

    // Growth metrics (percentage bounds)
    revenue_growth_yoy: [-100, 1000],
    earnings_growth_yoy: [-100, 1000],
    fcf_growth_yoy: [-100, 1000],
    revenue_growth_qoq: [-100, 500],
    earnings_growth_qoq: [-100, 500],
    revenue_cagr_3y: [-50, 200],
    revenue_cagr_5y: [-50, 200],
    earnings_cagr_3y: [-50, 200],
    earnings_cagr_5y: [-50, 200],

    // Yield metrics (percentage bounds)
    dividend_yield: [0, 30],
    buyback_yield: [0, 30],
    shareholder_yield: [0, 50]
  };

  constructor() {
    console.log('✅ Metric Calculator initialized');
  }

  /**
   * Clamp a metric value to reasonable bounds
   * @param {string} metricName - Name of the metric
   * @param {number} value - Raw calculated value
   * @returns {number|null} Clamped value or null if input was null
   */
  clampMetric(metricName, value) {
    if (value === null || value === undefined || isNaN(value)) return null;

    const bounds = MetricCalculator.METRIC_BOUNDS[metricName];
    if (!bounds) return value; // No bounds defined, return as-is

    const [min, max] = bounds;
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Apply clamping to all metrics in an object
   * @param {Object} metrics - Object containing metric values
   * @returns {Object} Metrics with values clamped to reasonable bounds
   */
  clampAllMetrics(metrics) {
    const clamped = { ...metrics };

    for (const [key, bounds] of Object.entries(MetricCalculator.METRIC_BOUNDS)) {
      if (clamped[key] !== null && clamped[key] !== undefined && !isNaN(clamped[key])) {
        const [min, max] = bounds;
        clamped[key] = Math.max(min, Math.min(max, clamped[key]));
      }
    }

    return clamped;
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
   * @param {Object} prevFinancialData - Optional previous period financial data (for average calculations)
   * @returns {Object} All calculated metrics
   */
  calculateAllMetrics(financialData, marketCap, currentPrice, context = null, prevFinancialData = null) {
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
      cashRatio: null,
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
      earnings_growth_yoy: null,
      fcf_growth_yoy: null,
      revenue_growth_qoq: null,
      earnings_growth_qoq: null,
      revenue_cagr_3y: null,
      revenue_cagr_5y: null,
      earnings_cagr_3y: null,
      earnings_cagr_5y: null,
      equityMultiplier: null,
      dupontRoe: null,
      pegRatio: null,
      pegyRatio: null,
      evEbitda: null,
      msi: null,
      tobins_q: null,
      graham_number: null,
      dividend_yield: null,
      buyback_yield: null,
      shareholder_yield: null
    };

    // Validate we have minimum required data
    if (!financialData || typeof financialData !== 'object') {
      return metrics;
    }

    // Use 'all' statement type as fallback when individual statement types don't exist
    // Some data sources (like Alpha Vantage) only provide 'all' without separate statements
    const income_statement = financialData.income_statement || financialData.all || null;
    const balance_sheet = financialData.balance_sheet || financialData.all || null;
    const cash_flow = financialData.cash_flow || financialData.all || null;
    const prev_balance_sheet = prevFinancialData?.balance_sheet || prevFinancialData?.all || null;

    // MODIFIED: Allow partial calculations even with incomplete data
    // Some metrics only need income statement (margins, growth)
    // Some need balance sheet + income (ROIC, ROE, ROA)
    // Some need cash flow + income (FCF, Owner Earnings)

    // Minimum requirement: must have income statement data (directly or via 'all')
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
        metrics.roe = this.calculateROE(income_statement, balance_sheet, periodType, prev_balance_sheet);
      } catch (e) {}

      try {
        metrics.roa = this.calculateROA(income_statement, balance_sheet, periodType, prev_balance_sheet);
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

      try {
        metrics.cashRatio = this.calculateCashRatio(balance_sheet);
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
        if (netIncome && netIncome > 0) { // Only calculate P/E for profitable companies
          if (periodType === 'quarterly') {
            netIncome = netIncome * 4;
          }
          const peRatio = marketCap / netIncome;
          // Clamp P/E to reasonable bounds (0-1000) - raised from 500 to include high-growth stocks
          if (peRatio > 0 && peRatio <= 1000) {
            metrics.peRatio = Math.round(peRatio * 100) / 100;
          }
        }
      } catch (e) {}

      try {
        // Parse and annualize quarterly revenue for P/S ratio
        let totalRevenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']);
        if (totalRevenue && totalRevenue > 0) {
          if (periodType === 'quarterly') {
            totalRevenue = totalRevenue * 4;
          }
          const psRatio = marketCap / totalRevenue;
          if (psRatio > 0 && psRatio <= 100) {
            metrics.psRatio = Math.round(psRatio * 100) / 100;
          }
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

      // Tobin's Q - proper formula: (Market Cap + Total Debt) / Total Assets
      // This approximates replacement cost with book value of assets
      // Note: Uses actual debt (long-term + short-term) not total liabilities
      // to avoid inflating Q for companies with large non-debt liabilities (e.g., banks)
      try {
        const totalAssets = this.getField(balance_sheet, ['totalAssets', 'Assets']);
        const longTermDebt = this.getField(balance_sheet, ['longTermDebt', 'LongTermDebt', 'longTermDebtNoncurrent']) || 0;
        const shortTermDebt = this.getField(balance_sheet, ['shortTermDebt', 'ShortTermBorrowings', 'currentDebt', 'ShortTermDebt', 'debtCurrent']) || 0;
        if (totalAssets && totalAssets > 0) {
          // Tobin's Q: (Market Value of Equity + Debt) / Total Assets
          const totalDebt = longTermDebt + shortTermDebt;
          metrics.tobins_q = (marketCap + totalDebt) / totalAssets;
        }
      } catch (e) {}

      // MSI (EV/Book) - Enterprise Value / Book Value
      // Note: Uses actual debt (long-term + short-term) for EV calculation
      // to avoid inflating EV for companies with large non-debt liabilities
      try {
        const totalLiabilities = this.getField(balance_sheet, ['totalLiabilities', 'Liabilities', 'LiabilitiesAndStockholdersEquity']);
        const totalAssets = this.getField(balance_sheet, ['totalAssets', 'Assets']);
        const cash = this.getField(balance_sheet, ['cashAndEquivalents', 'CashAndCashEquivalentsAtCarryingValue', 'Cash', 'cashAndCashEquivalents']) || 0;
        const longTermDebt = this.getField(balance_sheet, ['longTermDebt', 'LongTermDebt', 'longTermDebtNoncurrent']) || 0;
        const shortTermDebt = this.getField(balance_sheet, ['shortTermDebt', 'ShortTermBorrowings', 'currentDebt', 'ShortTermDebt', 'debtCurrent']) || 0;

        if (totalLiabilities && totalAssets) {
          const totalDebt = longTermDebt + shortTermDebt;
          const enterpriseValue = marketCap + totalDebt - cash;
          const bookValue = totalAssets - totalLiabilities; // Shareholder equity

          if (bookValue && bookValue > 0) {
            metrics.msi = enterpriseValue / bookValue;
          }

          // EV/EBITDA calculation
          // EBITDA = Operating Income + Depreciation & Amortization
          const operatingIncome = this.getField(income_statement, [
            'operatingIncome', 'OperatingIncomeLoss', 'operatingRevenue', 'ebit'
          ]);

          // Get D&A from cash flow (non-cash expense add-back)
          let depAmort = 0;
          if (cash_flow) {
            depAmort = Math.abs(this.getField(cash_flow, [
              'depreciationAndAmortization', 'DepreciationDepletionAndAmortization',
              'depreciation', 'Depreciation', 'DepreciationAmortizationAndAccretion'
            ]) || 0);
          }

          if (operatingIncome !== null && operatingIncome !== undefined) {
            const ebitda = operatingIncome + depAmort;

            // Annualize if quarterly
            const annualizedEbitda = periodType === 'quarterly' ? ebitda * 4 : ebitda;

            if (annualizedEbitda > 0) {
              metrics.evEbitda = enterpriseValue / annualizedEbitda;
            }
          }
        }
      } catch (e) {}
    }

    // Graham Number - Benjamin Graham's intrinsic value formula
    // Formula: √(22.5 × EPS × BVPS)
    // Only valid when both EPS and BVPS are positive
    if (hasValidBalanceSheet && currentPrice) {
      try {
        let netIncome = this.getField(income_statement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
        const shareholderEquity = this.getField(balance_sheet, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);

        // We need shares outstanding to calculate EPS and BVPS
        // Estimate from market cap / price if available
        if (netIncome && shareholderEquity && marketCap && currentPrice > 0) {
          const sharesOutstanding = marketCap / currentPrice;

          // Annualize quarterly earnings
          if (periodType === 'quarterly') {
            netIncome = netIncome * 4;
          }

          const eps = netIncome / sharesOutstanding;
          const bvps = shareholderEquity / sharesOutstanding;

          // Graham Number only valid for profitable companies with positive book value
          if (eps > 0 && bvps > 0) {
            metrics.graham_number = Math.sqrt(22.5 * eps * bvps);
          }
        }
      } catch (e) {}
    }

    // Dividend Yield and Shareholder Yield
    // These require cash flow statement for dividend/buyback data
    if (cash_flow && marketCap && marketCap > 0) {
      try {
        // Dividends paid (usually negative in cash flow, so take absolute value)
        let dividendsPaid = Math.abs(this.getField(cash_flow, [
          'dividendsPaid', 'PaymentsOfDividends', 'DividendsPaid',
          'PaymentsOfDividendsCommonStock', 'dividendPayout'
        ]) || 0);

        // Share repurchases (usually negative, so take absolute value)
        let shareRepurchases = Math.abs(this.getField(cash_flow, [
          'commonStockRepurchased', 'PaymentsForRepurchaseOfCommonStock',
          'RepurchaseOfCommonStock', 'stockRepurchased', 'buybackOfShares',
          'PaymentsForRepurchaseOfEquity'
        ]) || 0);

        // Annualize if quarterly
        if (periodType === 'quarterly') {
          dividendsPaid = dividendsPaid * 4;
          shareRepurchases = shareRepurchases * 4;
        }

        // Dividend Yield = Annual Dividends / Market Cap * 100
        if (dividendsPaid > 0) {
          metrics.dividend_yield = (dividendsPaid / marketCap) * 100;
        }

        // Buyback Yield = Annual Buybacks / Market Cap * 100
        if (shareRepurchases > 0) {
          metrics.buyback_yield = (shareRepurchases / marketCap) * 100;
        }

        // Shareholder Yield = Dividend Yield + Buyback Yield
        // Total capital returned to shareholders as % of market cap
        const totalReturned = dividendsPaid + shareRepurchases;
        if (totalReturned > 0) {
          metrics.shareholder_yield = (totalReturned / marketCap) * 100;
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

      // DuPont Analysis: ROE = Net Margin × Asset Turnover × Equity Multiplier
      // Equity Multiplier = Total Assets / Shareholder Equity (measures leverage)
      try {
        const totalAssets = this.getField(balance_sheet, ['totalAssets', 'Assets']);
        const shareholderEquity = this.getField(balance_sheet, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);

        if (totalAssets && shareholderEquity && shareholderEquity > 0) {
          metrics.equityMultiplier = totalAssets / shareholderEquity;

          // Calculate DuPont ROE if we have all three components
          // DuPont ROE = Net Margin × Asset Turnover × Equity Multiplier
          if (metrics.netMargin !== null && metrics.assetTurnover !== null) {
            // Convert net margin from percentage to decimal for calculation
            const netMarginDecimal = metrics.netMargin / 100;
            metrics.dupontRoe = netMarginDecimal * metrics.assetTurnover * metrics.equityMultiplier * 100;
          }
        }
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

      // Earnings (Net Income) Growth YoY
      try {
        const netIncome = this.getField(income_statement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
        if (netIncome !== null && netIncome !== undefined) {
          metrics.earnings_growth_yoy = this.calculateEarningsGrowth(
            context.companyId,
            context.fiscalDate,
            context.periodType,
            netIncome
          );
        }
      } catch (e) {}

      // FCF Growth YoY (requires cash_flow and fcf to be calculated)
      if (cash_flow && metrics.fcf !== null && metrics.fcf !== undefined) {
        try {
          metrics.fcf_growth_yoy = this.calculateFCFGrowth(
            context.companyId,
            context.fiscalDate,
            context.periodType,
            metrics.fcf
          );
        } catch (e) {}
      }

      // QoQ Growth Metrics (only meaningful for quarterly data)
      if (context.periodType === 'quarterly') {
        // Revenue Growth QoQ
        try {
          const totalRevenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']);
          if (totalRevenue !== null && totalRevenue !== undefined) {
            metrics.revenue_growth_qoq = this.calculateRevenueGrowthQoQ(
              context.companyId,
              context.fiscalDate,
              context.periodType,
              totalRevenue
            );
          }
        } catch (e) {}

        // Earnings Growth QoQ
        try {
          const netIncome = this.getField(income_statement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
          if (netIncome !== null && netIncome !== undefined) {
            metrics.earnings_growth_qoq = this.calculateEarningsGrowthQoQ(
              context.companyId,
              context.fiscalDate,
              context.periodType,
              netIncome
            );
          }
        } catch (e) {}
      }

      // PEG Ratio (P/E divided by Earnings Growth)
      // Calculate for any non-zero growth (positive or negative)
      // Note: Negative PEG indicates declining earnings - use with caution
      // Fallback: Use revenue growth when earnings growth is unavailable
      if (metrics.peRatio !== null) {
        try {
          let growthForPEG = null;

          // Primary: Use earnings growth if available and non-zero
          if (metrics.earnings_growth_yoy !== null && metrics.earnings_growth_yoy !== 0) {
            growthForPEG = metrics.earnings_growth_yoy;
          }
          // Fallback: Use revenue growth if earnings growth unavailable/zero and revenue growth is non-zero
          else if (metrics.revenue_growth_yoy !== null && metrics.revenue_growth_yoy !== 0) {
            growthForPEG = metrics.revenue_growth_yoy;
          }

          if (growthForPEG !== null && growthForPEG !== 0) {
            // PEG = P/E ratio / Growth Rate (as a percentage)
            // Positive PEG with positive growth: <1 undervalued, >1 overvalued
            // Negative PEG: indicates declining earnings, signals caution
            metrics.pegRatio = metrics.peRatio / growthForPEG;
          }
        } catch (e) {}
      }

      // PEGY Ratio (PEG adjusted for dividend yield) - calculated separately from PEG
      // PEGY = P/E / (Growth + Dividend Yield)
      // Useful for dividend-paying stocks - lower is better
      // This can be calculated even when:
      // - Growth is negative/zero but dividend yield is positive
      // - Growth is positive but dividend yield is zero
      // Fallback: Use revenue growth when earnings growth is unavailable
      if (metrics.peRatio !== null) {
        try {
          // Use earnings growth if available, otherwise fall back to revenue growth
          const growth = metrics.earnings_growth_yoy ?? metrics.revenue_growth_yoy ?? 0;
          const divYield = metrics.dividend_yield || 0;
          const growthPlusYield = growth + divYield;

          // Only calculate if combined value is positive
          if (growthPlusYield > 0) {
            metrics.pegyRatio = metrics.peRatio / growthPlusYield;
          }
        } catch (e) {}
      }

      // CAGR Calculations (only for annual data - CAGR over quarters doesn't make sense)
      if (context.periodType === 'annual') {
        const currentRevenue = this.getField(income_statement, ['revenue', 'totalRevenue', 'Revenues']);
        const currentNetIncome = this.getField(income_statement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);

        // 3-Year CAGR
        try {
          if (currentRevenue > 0) {
            const revCagr3y = this.calculateCAGR(context.companyId, context.fiscalDate, 'revenue', 3);
            if (revCagr3y !== null) metrics.revenue_cagr_3y = revCagr3y;
          }
          if (currentNetIncome > 0) {
            const earnCagr3y = this.calculateCAGR(context.companyId, context.fiscalDate, 'earnings', 3);
            if (earnCagr3y !== null) metrics.earnings_cagr_3y = earnCagr3y;
          }
        } catch (e) {}

        // 5-Year CAGR
        try {
          if (currentRevenue > 0) {
            const revCagr5y = this.calculateCAGR(context.companyId, context.fiscalDate, 'revenue', 5);
            if (revCagr5y !== null) metrics.revenue_cagr_5y = revCagr5y;
          }
          if (currentNetIncome > 0) {
            const earnCagr5y = this.calculateCAGR(context.companyId, context.fiscalDate, 'earnings', 5);
            if (earnCagr5y !== null) metrics.earnings_cagr_5y = earnCagr5y;
          }
        } catch (e) {}
      }
    }

    // ========================================
    // 7. QUALITY SCORE (0-100)
    // ========================================

    try {
      metrics.dataQualityScore = this.calculateQualityScore(metrics);
    } catch (e) {
      metrics.dataQualityScore = 0;
    }

    // Apply clamping to all metrics to prevent extreme outliers
    return this.clampAllMetrics(metrics);
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
   * Uses AVERAGE equity (current + previous period / 2) to match Yahoo Finance methodology.
   * For quarterly data: Annualizes net income by multiplying by 4
   *
   * Good: > 15%
   * Great: > 20%
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   * @param {Object} prevBalance - Previous period balance sheet (optional, for averaging)
   */
  calculateROE(income, balance, periodType = 'annual', prevBalance = null) {
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

      // Use AVERAGE equity if previous period data is available (Yahoo Finance methodology)
      let equityForCalc = shareholderEquity;
      if (prevBalance) {
        const prevEquity = this.getField(prevBalance, ['shareholderEquity', 'StockholdersEquity', 'totalShareholderEquity']);
        if (prevEquity && prevEquity > 0) {
          equityForCalc = (shareholderEquity + prevEquity) / 2;
        }
      }

      const roe = (netIncome / equityForCalc) * 100;
      return Math.round(roe * 10) / 10;

    } catch (error) {
      return null;
    }
  }

  /**
   * ROA - Return on Assets
   *
   * Formula: Net Income / Average Total Assets
   *
   * Shows how efficiently a company uses its assets to generate profit.
   * Uses AVERAGE assets (current + previous period / 2) to match Yahoo Finance methodology.
   * For quarterly data: Annualizes net income by multiplying by 4
   *
   * @param {Object} income - Income statement data
   * @param {Object} balance - Balance sheet data
   * @param {String} periodType - 'quarterly' or 'annual' (default: 'annual')
   * @param {Object} prevBalance - Previous period balance sheet (optional, for averaging)
   */
  calculateROA(income, balance, periodType = 'annual', prevBalance = null) {
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

      // Use AVERAGE assets if previous period data is available (Yahoo Finance methodology)
      let assetsForCalc = totalAssets;
      if (prevBalance) {
        const prevAssets = this.getField(prevBalance, ['totalAssets', 'Assets']);
        if (prevAssets && prevAssets > 0) {
          assetsForCalc = (totalAssets + prevAssets) / 2;
        }
      }

      const roa = (netIncome / assetsForCalc) * 100;
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

      // Extended field variations for long-term debt
      const longTermDebt = this.getField(balance, [
        'longTermDebt',
        'LongTermDebtNoncurrent',
        'LongTermDebt',
        'Debt',
        'DebtNoncurrent',
        'LongTermDebtAndCapitalLeaseObligations',
        'LongTermDebtAndFinanceLeaseObligations',
        'FinanceLeaseLiabilityNoncurrent',
        'NotesPayableNoncurrent',
        'SeniorNotesNoncurrent',
        'ConvertibleDebtNoncurrent'
      ]) || 0;

      // Extended field variations for short-term debt
      const shortTermDebt = this.getField(balance, [
        'shortTermDebt',
        'ShortTermBorrowings',
        'LongTermDebtCurrent',
        'DebtCurrent',
        'ShortTermDebt',
        'CommercialPaper',
        'ShortTermBorrowingsAndCurrentPortionOfLongTermDebt',
        'FinanceLeaseLiabilityCurrent',
        'NotesPayableCurrent',
        'SeniorNotesCurrent',
        'ConvertibleDebtCurrent'
      ]) || 0;

      // Operating lease liabilities (ASC 842 - effective 2019+)
      const operatingLeaseLiabilitiesNoncurrent = this.getField(balance, [
        'operatingLeaseLiabilityNoncurrent',
        'OperatingLeaseLiabilityNoncurrent'
      ]) || 0;
      const operatingLeaseLiabilitiesCurrent = this.getField(balance, [
        'operatingLeaseLiabilityCurrent',
        'OperatingLeaseLiabilityCurrent'
      ]) || 0;

      const totalDebt = longTermDebt + shortTermDebt + operatingLeaseLiabilitiesNoncurrent + operatingLeaseLiabilitiesCurrent;

      // If no debt found through specific fields, try totalLiabilities approach as fallback
      if (totalDebt === 0) {
        const totalLiabilities = this.getField(balance, ['totalLiabilities', 'Liabilities']);
        const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent', 'totalCurrentLiabilities']) || 0;

        // Non-current liabilities often approximates long-term debt for many companies
        if (totalLiabilities && totalLiabilities > currentLiabilities) {
          const nonCurrentLiabilities = totalLiabilities - currentLiabilities;
          const ratio = nonCurrentLiabilities / shareholderEquity;
          return Math.round(ratio * 100) / 100;
        }
      }

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
   * STANDARD FORMULA (Yahoo Finance compatible):
   * (Current Assets - Inventory) / Current Liabilities
   *
   * This matches Yahoo Finance's calculation methodology.
   * The traditional formula excludes inventory because it's less liquid.
   *
   * Good: > 1.0
   * Great: > 1.5
   */
  calculateQuickRatio(balance) {
    try {
      // Use robust field getter to handle all naming variations
      const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent', 'totalCurrentLiabilities']);
      if (!currentLiabilities || currentLiabilities <= 0) return null;

      // Standard formula: (Current Assets - Inventory) / Current Liabilities
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
   * Cash Ratio
   *
   * Formula: Cash and Cash Equivalents / Current Liabilities
   *
   * Most conservative liquidity measure - shows ability to pay
   * short-term obligations using only cash on hand.
   *
   * Good: > 0.5
   * Excellent: > 1.0
   * Very high (>2) may indicate inefficient cash management
   */
  calculateCashRatio(balance) {
    try {
      // Get current liabilities
      const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent', 'totalCurrentLiabilities']);
      if (!currentLiabilities || currentLiabilities <= 0) return null;

      // Get cash and cash equivalents
      const cash = this.getField(balance, [
        'cashAndCashEquivalentsAtCarryingValue',
        'CashAndCashEquivalentsAtCarryingValue',
        'cashAndShortTermInvestments',
        'CashAndShortTermInvestments',
        'cash',
        'Cash'
      ]);

      if (!cash || cash < 0) return null;

      const ratio = cash / currentLiabilities;
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
   * Calculate Earnings (Net Income) Growth Year-over-Year
   *
   * Formula: ((Current Net Income - Prior Year Net Income) / |Prior Year Net Income|) * 100
   *
   * Uses absolute value in denominator to handle negative-to-positive transitions correctly.
   * Uses direct database columns for better reliability (same fix as FCF).
   *
   * @param {Number} companyId - Company ID for database query
   * @param {String} fiscalDate - Current fiscal period end date
   * @param {String} periodType - 'quarterly' or 'annual'
   * @param {Number} currentNetIncome - Current period net income
   * @returns {Number|null} Earnings growth percentage
   */
  calculateEarningsGrowth(companyId, fiscalDate, periodType, currentNetIncome) {
    if (!companyId || !fiscalDate || currentNetIncome === null || currentNetIncome === undefined) return null;

    try {
      const db = require('../database');
      const database = db.getDatabase();

      // Parse current date
      const currentDate = new Date(fiscalDate);
      const priorYearDate = new Date(currentDate);
      priorYearDate.setFullYear(currentDate.getFullYear() - 1);

      // Format date range for query (allow +/- 90 days for better matching)
      // Extended from 45 days to accommodate irregular fiscal years
      const minDate = new Date(priorYearDate);
      minDate.setDate(minDate.getDate() - 90);
      const maxDate = new Date(priorYearDate);
      maxDate.setDate(maxDate.getDate() + 90);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Query prior year data using direct columns (more reliable than JSON parsing)
      const priorData = database.prepare(`
        SELECT net_income, data
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

      // Try direct column first (more reliable), fall back to JSON parsing
      let priorNetIncome = priorData.net_income;

      if (priorNetIncome === null || priorNetIncome === undefined) {
        // Fallback to JSON parsing for older data
        try {
          const priorIncomeStatement = JSON.parse(priorData.data);
          priorNetIncome = this.getField(priorIncomeStatement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
        } catch (e) {
          return null;
        }
      }

      // Skip if prior year had zero earnings (undefined growth)
      if (priorNetIncome === null || priorNetIncome === undefined || priorNetIncome === 0) return null;

      // Calculate growth percentage using absolute value for denominator
      // This handles negative-to-positive transitions correctly
      const growth = ((currentNetIncome - priorNetIncome) / Math.abs(priorNetIncome)) * 100;
      return growth;

    } catch (error) {
      console.error('Error calculating earnings growth:', error.message);
      return null;
    }
  }

  /**
   * Calculate Free Cash Flow Growth Year-over-Year
   *
   * Formula: ((Current FCF - Prior Year FCF) / |Prior Year FCF|) * 100
   *
   * FCF = Operating Cash Flow - Capital Expenditures
   *
   * @param {Number} companyId - Company ID for database query
   * @param {String} fiscalDate - Current fiscal period end date
   * @param {String} periodType - 'quarterly' or 'annual'
   * @param {Number} currentFCF - Current period free cash flow
   * @returns {Number|null} FCF growth percentage
   */
  calculateFCFGrowth(companyId, fiscalDate, periodType, currentFCF) {
    if (!companyId || !fiscalDate || currentFCF === null || currentFCF === undefined) return null;

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

      // Query prior year cash flow data
      const priorData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'cash_flow'
          AND period_type = ?
          AND fiscal_date_ending >= ?
          AND fiscal_date_ending <= ?
        ORDER BY ABS(JULIANDAY(fiscal_date_ending) - JULIANDAY(?))
        LIMIT 1
      `).get(companyId, periodType, minDateStr, maxDateStr, priorYearDate.toISOString().split('T')[0]);

      if (!priorData) return null;

      const priorCashFlow = JSON.parse(priorData.data);

      // Calculate prior year FCF
      const priorOperatingCF = this.getField(priorCashFlow, [
        'operatingCashflow', 'NetCashProvidedByUsedInOperatingActivities',
        'CashFlowsFromOperatingActivities', 'netCashFromOperatingActivities'
      ]);
      const priorCapex = Math.abs(this.getField(priorCashFlow, [
        'capitalExpenditures', 'PaymentsToAcquirePropertyPlantAndEquipment',
        'CapitalExpenditures', 'purchaseOfPropertyPlantEquipment'
      ]) || 0);

      if (priorOperatingCF === null || priorOperatingCF === undefined) return null;

      const priorFCF = priorOperatingCF - priorCapex;

      // Skip if prior year had zero FCF (undefined growth)
      if (priorFCF === 0) return null;

      // Calculate growth percentage using absolute value for denominator
      const growth = ((currentFCF - priorFCF) / Math.abs(priorFCF)) * 100;
      return growth;

    } catch (error) {
      console.error('Error calculating FCF growth:', error.message);
      return null;
    }
  }

  /**
   * Calculate Revenue Growth Quarter-over-Quarter
   * Compares current quarter to the previous quarter (sequential growth)
   *
   * @param {Number} companyId - Company ID for database query
   * @param {String} fiscalDate - Current fiscal period end date
   * @param {String} periodType - Should be 'quarterly' for meaningful QoQ
   * @param {Number} currentRevenue - Current period revenue
   * @returns {Number|null} Revenue growth percentage
   */
  calculateRevenueGrowthQoQ(companyId, fiscalDate, periodType, currentRevenue) {
    // QoQ only makes sense for quarterly data
    if (!companyId || !fiscalDate || !currentRevenue || periodType !== 'quarterly') return null;

    try {
      const db = require('../database');
      const database = db.getDatabase();

      // Find the previous quarter (approximately 90 days before)
      const currentDate = new Date(fiscalDate);
      const priorQuarterDate = new Date(currentDate);
      priorQuarterDate.setDate(currentDate.getDate() - 90);

      // Format date range for query (allow +/- 30 days for matching)
      const minDate = new Date(priorQuarterDate);
      minDate.setDate(minDate.getDate() - 30);
      const maxDate = new Date(priorQuarterDate);
      maxDate.setDate(maxDate.getDate() + 30);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Query prior quarter data
      const priorData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'income_statement'
          AND period_type = 'quarterly'
          AND fiscal_date_ending >= ?
          AND fiscal_date_ending <= ?
          AND fiscal_date_ending < ?
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `).get(companyId, minDateStr, maxDateStr, fiscalDate);

      if (!priorData) return null;

      const priorIncomeStatement = JSON.parse(priorData.data);
      const priorRevenue = this.getField(priorIncomeStatement, ['revenue', 'totalRevenue', 'Revenues']);

      if (!priorRevenue || priorRevenue <= 0) return null;

      // Calculate growth percentage
      const growth = ((currentRevenue - priorRevenue) / priorRevenue) * 100;
      return growth;

    } catch (error) {
      console.error('Error calculating revenue QoQ growth:', error.message);
      return null;
    }
  }

  /**
   * Calculate Earnings Growth Quarter-over-Quarter
   * Compares current quarter to the previous quarter (sequential growth)
   *
   * @param {Number} companyId - Company ID for database query
   * @param {String} fiscalDate - Current fiscal period end date
   * @param {String} periodType - Should be 'quarterly' for meaningful QoQ
   * @param {Number} currentNetIncome - Current period net income
   * @returns {Number|null} Earnings growth percentage
   */
  calculateEarningsGrowthQoQ(companyId, fiscalDate, periodType, currentNetIncome) {
    // QoQ only makes sense for quarterly data
    if (!companyId || !fiscalDate || currentNetIncome === null || currentNetIncome === undefined || periodType !== 'quarterly') return null;

    try {
      const db = require('../database');
      const database = db.getDatabase();

      // Find the previous quarter (approximately 90 days before)
      const currentDate = new Date(fiscalDate);
      const priorQuarterDate = new Date(currentDate);
      priorQuarterDate.setDate(currentDate.getDate() - 90);

      // Format date range for query (allow +/- 30 days for matching)
      const minDate = new Date(priorQuarterDate);
      minDate.setDate(minDate.getDate() - 30);
      const maxDate = new Date(priorQuarterDate);
      maxDate.setDate(maxDate.getDate() + 30);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Query prior quarter data
      const priorData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'income_statement'
          AND period_type = 'quarterly'
          AND fiscal_date_ending >= ?
          AND fiscal_date_ending <= ?
          AND fiscal_date_ending < ?
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `).get(companyId, minDateStr, maxDateStr, fiscalDate);

      if (!priorData) return null;

      const priorIncomeStatement = JSON.parse(priorData.data);
      const priorNetIncome = this.getField(priorIncomeStatement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);

      // Skip if prior quarter had zero earnings
      if (priorNetIncome === null || priorNetIncome === undefined || priorNetIncome === 0) return null;

      // Calculate growth percentage using absolute value for denominator
      const growth = ((currentNetIncome - priorNetIncome) / Math.abs(priorNetIncome)) * 100;
      return growth;

    } catch (error) {
      console.error('Error calculating earnings QoQ growth:', error.message);
      return null;
    }
  }

  /**
   * Calculate Compound Annual Growth Rate (CAGR)
   *
   * Formula: CAGR = ((End Value / Start Value) ^ (1/n)) - 1
   * Where n = number of years
   *
   * @param {Number} companyId - Company ID for database query
   * @param {String} fiscalDate - Current fiscal period end date
   * @param {String} metricType - 'revenue' or 'earnings'
   * @param {Number} years - Number of years (3 or 5)
   * @returns {Number|null} CAGR as percentage (e.g., 15.5 for 15.5% annual growth)
   */
  calculateCAGR(companyId, fiscalDate, metricType, years) {
    if (!companyId || !fiscalDate || !metricType || !years) return null;

    try {
      const db = require('../database');
      const database = db.getDatabase();

      // Get current period data
      const currentData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'income_statement'
          AND period_type = 'annual'
          AND fiscal_date_ending <= ?
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `).get(companyId, fiscalDate);

      if (!currentData) return null;

      const currentIncomeStatement = JSON.parse(currentData.data);
      let currentValue;
      if (metricType === 'revenue') {
        currentValue = this.getField(currentIncomeStatement, ['revenue', 'totalRevenue', 'Revenues']);
      } else {
        currentValue = this.getField(currentIncomeStatement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      }

      if (!currentValue || currentValue <= 0) return null;

      // Calculate the target start date (years ago)
      const currentDate = new Date(fiscalDate);
      const startDate = new Date(currentDate);
      startDate.setFullYear(currentDate.getFullYear() - years);

      // Allow +/- 90 days for fiscal year alignment
      const minDate = new Date(startDate);
      minDate.setDate(minDate.getDate() - 90);
      const maxDate = new Date(startDate);
      maxDate.setDate(maxDate.getDate() + 90);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Get start period data
      const startData = database.prepare(`
        SELECT data
        FROM financial_data
        WHERE company_id = ?
          AND statement_type = 'income_statement'
          AND period_type = 'annual'
          AND fiscal_date_ending >= ?
          AND fiscal_date_ending <= ?
        ORDER BY ABS(JULIANDAY(fiscal_date_ending) - JULIANDAY(?))
        LIMIT 1
      `).get(companyId, minDateStr, maxDateStr, startDate.toISOString().split('T')[0]);

      if (!startData) return null;

      const startIncomeStatement = JSON.parse(startData.data);
      let startValue;
      if (metricType === 'revenue') {
        startValue = this.getField(startIncomeStatement, ['revenue', 'totalRevenue', 'Revenues']);
      } else {
        startValue = this.getField(startIncomeStatement, ['netIncome', 'NetIncomeLoss', 'ProfitLoss']);
      }

      // CAGR only works with positive start values
      if (!startValue || startValue <= 0) return null;

      // CAGR = ((End / Start) ^ (1/years) - 1) * 100
      const cagr = (Math.pow(currentValue / startValue, 1 / years) - 1) * 100;

      return cagr;

    } catch (error) {
      console.error(`Error calculating ${years}Y CAGR for ${metricType}:`, error.message);
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

  /**
   * Calculate and save all metrics for a company
   * This is the main entry point for scheduled/batch metric calculation
   * @param {number} companyId - The company ID
   * @param {object} db - Database instance (optional, will use default if not provided)
   * @returns {object} Results summary
   */
  async calculateForCompany(companyId, db = null) {
    if (!db) {
      db = require('../database').getDatabase();
    }

    // Get current price metrics (for current/recent periods)
    const priceMetrics = db.prepare(`
      SELECT pm.market_cap, pm.last_price, pm.shares_outstanding, c.market_cap as company_market_cap
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE pm.company_id = ?
    `).get(companyId);

    const currentMarketCap = priceMetrics?.market_cap || priceMetrics?.company_market_cap || null;
    const currentPrice = priceMetrics?.last_price || null;
    const sharesOutstanding = priceMetrics?.shares_outstanding || null;

    // Calculate share multiplier for multi-class stocks (GOOGL, BRK-B, etc.)
    // If company has multiple share classes, the stored market cap will be higher
    // than shares_outstanding × price. We use this ratio to adjust historical calculations.
    let shareMultiplier = 1.0;
    if (sharesOutstanding && currentPrice && currentMarketCap) {
      const calculatedMarketCap = sharesOutstanding * currentPrice;
      if (calculatedMarketCap > 0) {
        shareMultiplier = currentMarketCap / calculatedMarketCap;
        // Only apply if there's a significant difference (>10%)
        if (shareMultiplier < 1.1) {
          shareMultiplier = 1.0;
        }
      }
    }

    // Prepare statement to get historical price for a given date
    // This allows us to calculate historical market cap
    const getHistoricalPriceStmt = db.prepare(`
      SELECT close, date FROM daily_prices
      WHERE company_id = ? AND date <= ?
      ORDER BY date DESC
      LIMIT 1
    `);

    // Get all financial periods for this company
    const periods = db.prepare(`
      SELECT DISTINCT fiscal_date_ending, period_type, fiscal_year
      FROM financial_data
      WHERE company_id = ?
      ORDER BY fiscal_date_ending DESC
    `).all(companyId);

    if (periods.length === 0) {
      return { success: false, message: 'No financial data found' };
    }

    let updated = 0;
    let errors = 0;

    // Prepare upsert statement with all metric columns including the missing ones
    const upsertStmt = db.prepare(`
      INSERT INTO calculated_metrics (
        company_id, fiscal_period, period_type, fiscal_year,
        roic, roe, roa, roce,
        operating_margin, net_margin, gross_margin,
        fcf, fcf_yield, fcf_margin, fcf_per_share,
        pe_ratio, pb_ratio, ps_ratio, peg_ratio, pegy_ratio,
        tobins_q, ev_ebitda, earnings_yield,
        debt_to_equity, debt_to_assets, current_ratio, quick_ratio, cash_ratio, interest_coverage,
        revenue_growth_yoy, earnings_growth_yoy, fcf_growth_yoy,
        revenue_growth_qoq, earnings_growth_qoq,
        revenue_cagr_3y, revenue_cagr_5y, earnings_cagr_3y, earnings_cagr_5y,
        asset_turnover, owner_earnings, msi,
        equity_multiplier, dupont_roe,
        graham_number, dividend_yield, buyback_yield, shareholder_yield,
        data_quality_score, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, datetime('now')
      )
      ON CONFLICT(company_id, fiscal_period, period_type) DO UPDATE SET
        roic = excluded.roic,
        roe = excluded.roe,
        roa = excluded.roa,
        roce = excluded.roce,
        operating_margin = excluded.operating_margin,
        net_margin = excluded.net_margin,
        gross_margin = excluded.gross_margin,
        fcf = excluded.fcf,
        fcf_yield = excluded.fcf_yield,
        fcf_margin = excluded.fcf_margin,
        fcf_per_share = excluded.fcf_per_share,
        pe_ratio = excluded.pe_ratio,
        pb_ratio = excluded.pb_ratio,
        ps_ratio = excluded.ps_ratio,
        peg_ratio = excluded.peg_ratio,
        pegy_ratio = excluded.pegy_ratio,
        tobins_q = excluded.tobins_q,
        ev_ebitda = excluded.ev_ebitda,
        earnings_yield = excluded.earnings_yield,
        debt_to_equity = excluded.debt_to_equity,
        debt_to_assets = excluded.debt_to_assets,
        current_ratio = excluded.current_ratio,
        quick_ratio = excluded.quick_ratio,
        cash_ratio = excluded.cash_ratio,
        interest_coverage = excluded.interest_coverage,
        revenue_growth_yoy = excluded.revenue_growth_yoy,
        earnings_growth_yoy = excluded.earnings_growth_yoy,
        fcf_growth_yoy = excluded.fcf_growth_yoy,
        revenue_growth_qoq = excluded.revenue_growth_qoq,
        earnings_growth_qoq = excluded.earnings_growth_qoq,
        revenue_cagr_3y = excluded.revenue_cagr_3y,
        revenue_cagr_5y = excluded.revenue_cagr_5y,
        earnings_cagr_3y = excluded.earnings_cagr_3y,
        earnings_cagr_5y = excluded.earnings_cagr_5y,
        asset_turnover = excluded.asset_turnover,
        owner_earnings = excluded.owner_earnings,
        msi = excluded.msi,
        equity_multiplier = excluded.equity_multiplier,
        dupont_roe = excluded.dupont_roe,
        graham_number = excluded.graham_number,
        dividend_yield = excluded.dividend_yield,
        buyback_yield = excluded.buyback_yield,
        shareholder_yield = excluded.shareholder_yield,
        data_quality_score = excluded.data_quality_score,
        updated_at = datetime('now')
    `);

    for (const period of periods) {
      try {
        // Get financial data for this period - include both JSON and direct columns
        const financials = db.prepare(`
          SELECT statement_type, data,
            total_assets, total_liabilities, shareholder_equity,
            current_assets, current_liabilities, cash_and_equivalents,
            long_term_debt, short_term_debt,
            total_revenue, net_income, operating_income,
            cost_of_revenue, gross_profit,
            operating_cashflow, capital_expenditures, shares_outstanding
          FROM financial_data
          WHERE company_id = ?
            AND fiscal_date_ending = ?
        `).all(companyId, period.fiscal_date_ending);

        if (financials.length === 0) continue;

        // Parse and organize the data - merge JSON with direct columns
        const financialData = {};
        for (const f of financials) {
          try {
            // Start with JSON data if available
            let parsed = {};
            if (f.data) {
              try { parsed = JSON.parse(f.data); } catch (e) {}
            }

            // Merge direct columns (they take precedence as they're more reliable)
            const directColumns = {
              totalAssets: f.total_assets,
              totalLiabilities: f.total_liabilities,
              shareholderEquity: f.shareholder_equity,
              currentAssets: f.current_assets,
              currentLiabilities: f.current_liabilities,
              cashAndEquivalents: f.cash_and_equivalents,
              longTermDebt: f.long_term_debt,
              shortTermDebt: f.short_term_debt,
              totalRevenue: f.total_revenue,
              revenue: f.total_revenue,
              netIncome: f.net_income,
              operatingIncome: f.operating_income,
              costOfRevenue: f.cost_of_revenue,
              grossProfit: f.gross_profit,
              operatingCashFlow: f.operating_cashflow,
              operatingCashflow: f.operating_cashflow,
              capitalExpenditures: f.capital_expenditures,
              sharesOutstanding: f.shares_outstanding
            };

            // Merge: direct columns override JSON values if they exist
            for (const [key, value] of Object.entries(directColumns)) {
              if (value !== null && value !== undefined) {
                parsed[key] = value;
              }
            }

            financialData[f.statement_type] = parsed;
          } catch (e) {
            // Skip if processing fails
          }
        }

        // ========================================
        // DATA QUALITY: Reconcile conflicting revenue values
        // ========================================
        // Sometimes 'income_statement' has wrong revenue while 'all' has correct values
        // When both exist and differ significantly (>10x), prefer 'all' values for income fields
        if (financialData.income_statement && financialData.all) {
          const incomeRev = financialData.income_statement.totalRevenue || financialData.income_statement.revenue;
          const allRev = financialData.all.totalRevenue || financialData.all.revenue;

          if (incomeRev && allRev && incomeRev > 0 && allRev > 0) {
            const ratio = incomeRev / allRev;

            // If income_statement revenue is >10x or <0.1x the 'all' revenue, it's likely wrong
            if (ratio > 10 || ratio < 0.1) {
              // Copy income fields from 'all' to 'income_statement' (preserving other fields)
              const incomeFieldsFromAll = ['totalRevenue', 'revenue', 'grossProfit', 'operatingIncome',
                'netIncome', 'costOfRevenue', 'operatingExpenses', 'interestExpense', 'incomeTaxExpense'];

              for (const field of incomeFieldsFromAll) {
                if (financialData.all[field] !== null && financialData.all[field] !== undefined) {
                  financialData.income_statement[field] = financialData.all[field];
                }
              }
            }
          }
        }

        // ========================================
        // DATA QUALITY: Reconcile conflicting balance sheet values
        // ========================================
        // Sometimes 'balance_sheet' has wrong equity while 'all' has correct values
        // When 'all' balances (Assets = L+E) but 'balance_sheet' doesn't, prefer 'all' values
        if (financialData.balance_sheet && financialData.all) {
          const allAssets = financialData.all.totalAssets;
          const allLiabilities = financialData.all.totalLiabilities;
          const allEquity = financialData.all.shareholderEquity || financialData.all.totalShareholderEquity;

          // Check if 'all' has complete balance sheet data that balances
          if (allAssets && allLiabilities && allEquity && allAssets > 0) {
            const allDiff = Math.abs(allAssets - (allLiabilities + allEquity)) / allAssets;

            // If 'all' balances within 1%
            if (allDiff < 0.01) {
              const bsAssets = financialData.balance_sheet.totalAssets;
              const bsLiabilities = financialData.balance_sheet.totalLiabilities;
              const bsEquity = financialData.balance_sheet.shareholderEquity || financialData.balance_sheet.totalShareholderEquity;

              if (bsAssets && bsLiabilities && bsEquity && bsAssets > 0) {
                const bsDiff = Math.abs(bsAssets - (bsLiabilities + bsEquity)) / bsAssets;

                // If 'balance_sheet' doesn't balance (>5% difference), use 'all' values
                if (bsDiff > 0.05) {
                  const balanceSheetFieldsFromAll = ['totalAssets', 'totalLiabilities', 'shareholderEquity',
                    'totalShareholderEquity', 'currentAssets', 'currentLiabilities', 'totalDebt',
                    'longTermDebt', 'shortTermDebt', 'cashAndEquivalents', 'cashAndShortTermInvestments',
                    'inventory', 'accountsReceivable', 'accountsPayable', 'retainedEarnings',
                    'commonStock', 'propertyPlantEquipment', 'goodwill', 'intangibleAssets'];

                  for (const field of balanceSheetFieldsFromAll) {
                    if (financialData.all[field] !== null && financialData.all[field] !== undefined) {
                      financialData.balance_sheet[field] = financialData.all[field];
                    }
                  }
                }
              }
            }
          }
        }

        // Get previous period data for growth calculations
        // Include both JSON and direct columns (same as current period)
        const prevPeriod = db.prepare(`
          SELECT fd.statement_type, fd.data,
            fd.total_assets, fd.total_liabilities, fd.shareholder_equity,
            fd.current_assets, fd.current_liabilities, fd.cash_and_equivalents,
            fd.long_term_debt, fd.short_term_debt,
            fd.total_revenue, fd.net_income, fd.operating_income,
            fd.cost_of_revenue, fd.gross_profit,
            fd.operating_cashflow, fd.capital_expenditures, fd.shares_outstanding
          FROM financial_data fd
          WHERE fd.company_id = ?
            AND fd.fiscal_date_ending < ?
            AND fd.period_type = ?
          ORDER BY fd.fiscal_date_ending DESC
          LIMIT 4
        `).all(companyId, period.fiscal_date_ending, period.period_type);

        const prevFinancialData = {};
        for (const f of prevPeriod) {
          try {
            if (!prevFinancialData[f.statement_type]) {
              // Start with JSON data if available
              let parsed = {};
              if (f.data) {
                try { parsed = JSON.parse(f.data); } catch (e) {}
              }

              // Merge direct columns (they take precedence as they're more reliable)
              const directColumns = {
                totalAssets: f.total_assets,
                totalLiabilities: f.total_liabilities,
                shareholderEquity: f.shareholder_equity,
                currentAssets: f.current_assets,
                currentLiabilities: f.current_liabilities,
                cashAndEquivalents: f.cash_and_equivalents,
                longTermDebt: f.long_term_debt,
                shortTermDebt: f.short_term_debt,
                totalRevenue: f.total_revenue,
                revenue: f.total_revenue,
                netIncome: f.net_income,
                operatingIncome: f.operating_income,
                costOfRevenue: f.cost_of_revenue,
                grossProfit: f.gross_profit,
                operatingCashFlow: f.operating_cashflow,
                operatingCashflow: f.operating_cashflow,
                capitalExpenditures: f.capital_expenditures,
                sharesOutstanding: f.shares_outstanding
              };

              // Merge: direct columns override JSON values if they exist
              for (const [key, value] of Object.entries(directColumns)) {
                if (value !== null && value !== undefined) {
                  parsed[key] = value;
                }
              }

              prevFinancialData[f.statement_type] = parsed;
            }
          } catch (e) {}
        }

        // Apply balance sheet reconciliation to previous period data too
        if (prevFinancialData.balance_sheet && prevFinancialData.all) {
          const allAssets = prevFinancialData.all.totalAssets;
          const allLiabilities = prevFinancialData.all.totalLiabilities;
          const allEquity = prevFinancialData.all.shareholderEquity || prevFinancialData.all.totalShareholderEquity;

          if (allAssets && allLiabilities && allEquity && allAssets > 0) {
            const allDiff = Math.abs(allAssets - (allLiabilities + allEquity)) / allAssets;

            if (allDiff < 0.01) {
              const bsAssets = prevFinancialData.balance_sheet.totalAssets;
              const bsLiabilities = prevFinancialData.balance_sheet.totalLiabilities;
              const bsEquity = prevFinancialData.balance_sheet.shareholderEquity || prevFinancialData.balance_sheet.totalShareholderEquity;

              if (bsAssets && bsLiabilities && bsEquity && bsAssets > 0) {
                const bsDiff = Math.abs(bsAssets - (bsLiabilities + bsEquity)) / bsAssets;

                if (bsDiff > 0.05) {
                  const balanceSheetFieldsFromAll = ['totalAssets', 'totalLiabilities', 'shareholderEquity',
                    'totalShareholderEquity', 'currentAssets', 'currentLiabilities', 'totalDebt',
                    'longTermDebt', 'shortTermDebt', 'cashAndEquivalents', 'cashAndShortTermInvestments'];

                  for (const field of balanceSheetFieldsFromAll) {
                    if (prevFinancialData.all[field] !== null && prevFinancialData.all[field] !== undefined) {
                      prevFinancialData.balance_sheet[field] = prevFinancialData.all[field];
                    }
                  }
                }
              }
            }
          }
        }

        // Calculate historical market cap for this period
        // For valuation metrics (P/E, P/B, etc.) we need the market cap as of the fiscal period end
        let periodMarketCap = currentMarketCap;
        let periodPrice = currentPrice;

        // Check if this is a historical period (more than 60 days old)
        const periodDate = new Date(period.fiscal_date_ending);
        const daysSincePeriod = (Date.now() - periodDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSincePeriod > 60 && sharesOutstanding) {
          // Get historical price for this period
          const historicalPrice = getHistoricalPriceStmt.get(companyId, period.fiscal_date_ending);
          if (historicalPrice?.close) {
            // Calculate historical market cap = historical price × shares outstanding × shareMultiplier
            // The shareMultiplier adjusts for multi-class stocks (GOOGL, BRK-B, etc.)
            // where the tracked share class only represents a portion of total shares
            periodPrice = historicalPrice.close;
            periodMarketCap = historicalPrice.close * sharesOutstanding * shareMultiplier;
          }
        }

        // Calculate metrics
        const context = {
          companyId,
          fiscalDate: period.fiscal_date_ending,
          periodType: period.period_type
        };

        const metrics = this.calculateAllMetrics(
          financialData,
          periodMarketCap,
          periodPrice,
          context,
          Object.keys(prevFinancialData).length > 0 ? prevFinancialData : null
        );

        if (metrics) {
          // Insert/update the calculated metrics
          upsertStmt.run(
            companyId,
            period.fiscal_date_ending,
            period.period_type,
            period.fiscal_year,
            metrics.roic,
            metrics.roe,
            metrics.roa,
            metrics.roce,
            metrics.operatingMargin,
            metrics.netMargin,
            metrics.grossMargin,
            metrics.fcf,
            metrics.fcfYield,
            metrics.fcf_margin,
            metrics.fcf_per_share,
            metrics.peRatio,
            metrics.pbRatio,
            metrics.psRatio,
            metrics.pegRatio,
            metrics.pegyRatio,
            metrics.tobins_q,
            metrics.evEbitda,
            metrics.earningsYield,
            metrics.debtToEquity,
            metrics.debtToAssets,
            metrics.currentRatio,
            metrics.quickRatio,
            metrics.cashRatio,
            metrics.interestCoverage,
            metrics.revenue_growth_yoy,
            metrics.earnings_growth_yoy,
            metrics.fcf_growth_yoy,
            metrics.revenue_growth_qoq,
            metrics.earnings_growth_qoq,
            metrics.revenue_cagr_3y,
            metrics.revenue_cagr_5y,
            metrics.earnings_cagr_3y,
            metrics.earnings_cagr_5y,
            metrics.assetTurnover,
            metrics.ownerEarnings,
            metrics.msi,
            metrics.equityMultiplier,
            metrics.dupontRoe,
            metrics.graham_number,
            metrics.dividend_yield,
            metrics.buyback_yield,
            metrics.shareholder_yield,
            metrics.data_quality_score || 100
          );
          updated++;
        }
      } catch (e) {
        errors++;
        console.error(`Error calculating metrics for company ${companyId}, period ${period.fiscal_date_ending}:`, e.message);
      }
    }

    return {
      success: true,
      companyId,
      periodsProcessed: periods.length,
      updated,
      errors
    };
  }

  /**
   * Calculate TTM (Trailing Twelve Months) metrics for a company
   *
   * This method calculates margins and ratios from quarterly data and updates
   * existing TTM records. It uses COALESCE to only fill in NULL values,
   * preserving any existing data from imports (PE, PB, EV/EBITDA, etc.).
   *
   * @param {Object} db - Database connection
   * @param {number} companyId - Company ID to calculate TTM for
   * @returns {Object} Result with success status and details
   */
  calculateTTMForCompany(db, companyId) {
    try {
      // Get last 4 quarterly records with actual data
      const quarters = db.prepare(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ? AND period_type = 'quarterly'
          AND (net_margin IS NOT NULL OR gross_margin IS NOT NULL OR roe IS NOT NULL)
        ORDER BY fiscal_period DESC
        LIMIT 4
      `).all(companyId);

      if (quarters.length < 2) {
        return { success: false, reason: 'Insufficient quarterly data', quarters: quarters.length };
      }

      const latest = quarters[0];

      // Helper to average non-null values
      const avgNonNull = (arr, field) => {
        const values = arr.map(q => q[field]).filter(v => v !== null && v !== undefined);
        if (values.length === 0) return null;
        return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
      };

      // Calculate ONLY the missing metrics (margins/ratios)
      // These are derived from quarterly data, not from imports
      const calculatedFields = {
        // Average margins over last 4 quarters (or available quarters)
        net_margin: avgNonNull(quarters, 'net_margin'),
        gross_margin: avgNonNull(quarters, 'gross_margin'),
        operating_margin: avgNonNull(quarters, 'operating_margin'),
        roe: avgNonNull(quarters, 'roe'),
        roa: avgNonNull(quarters, 'roa'),
        roic: avgNonNull(quarters, 'roic'),
        roce: avgNonNull(quarters, 'roce'),
        fcf_margin: avgNonNull(quarters, 'fcf_margin'),

        // Point-in-time from most recent quarter (balance sheet items)
        current_ratio: latest.current_ratio,
        quick_ratio: latest.quick_ratio,
        cash_ratio: latest.cash_ratio,
        debt_to_equity: latest.debt_to_equity,
        debt_to_assets: latest.debt_to_assets,
        interest_coverage: latest.interest_coverage,
        asset_turnover: latest.asset_turnover,
      };

      // Find existing TTM record (may have PE, PB from imports)
      const existingTTM = db.prepare(`
        SELECT id FROM calculated_metrics
        WHERE company_id = ? AND period_type = 'ttm'
        ORDER BY fiscal_period DESC LIMIT 1
      `).get(companyId);

      if (existingTTM) {
        // UPDATE only the calculated fields, preserve existing import data
        // Uses COALESCE to only update if calculated value is not null
        db.prepare(`
          UPDATE calculated_metrics SET
            net_margin = COALESCE(?, net_margin),
            gross_margin = COALESCE(?, gross_margin),
            operating_margin = COALESCE(?, operating_margin),
            roe = COALESCE(?, roe),
            roa = COALESCE(?, roa),
            roic = COALESCE(?, roic),
            roce = COALESCE(?, roce),
            fcf_margin = COALESCE(?, fcf_margin),
            current_ratio = COALESCE(?, current_ratio),
            quick_ratio = COALESCE(?, quick_ratio),
            cash_ratio = COALESCE(?, cash_ratio),
            debt_to_equity = COALESCE(?, debt_to_equity),
            debt_to_assets = COALESCE(?, debt_to_assets),
            interest_coverage = COALESCE(?, interest_coverage),
            asset_turnover = COALESCE(?, asset_turnover),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          calculatedFields.net_margin,
          calculatedFields.gross_margin,
          calculatedFields.operating_margin,
          calculatedFields.roe,
          calculatedFields.roa,
          calculatedFields.roic,
          calculatedFields.roce,
          calculatedFields.fcf_margin,
          calculatedFields.current_ratio,
          calculatedFields.quick_ratio,
          calculatedFields.cash_ratio,
          calculatedFields.debt_to_equity,
          calculatedFields.debt_to_assets,
          calculatedFields.interest_coverage,
          calculatedFields.asset_turnover,
          existingTTM.id
        );

        return { success: true, action: 'updated', ttmId: existingTTM.id };
      } else {
        // No existing TTM record - create a new one
        const fiscalPeriod = `TTM-${latest.fiscal_period}`;

        const result = db.prepare(`
          INSERT INTO calculated_metrics (
            company_id, fiscal_period, period_type,
            net_margin, gross_margin, operating_margin,
            roe, roa, roic, roce, fcf_margin,
            current_ratio, quick_ratio, cash_ratio, debt_to_equity, debt_to_assets,
            interest_coverage, asset_turnover,
            created_at, updated_at
          ) VALUES (?, ?, 'ttm', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          companyId,
          fiscalPeriod,
          calculatedFields.net_margin,
          calculatedFields.gross_margin,
          calculatedFields.operating_margin,
          calculatedFields.roe,
          calculatedFields.roa,
          calculatedFields.roic,
          calculatedFields.roce,
          calculatedFields.fcf_margin,
          calculatedFields.current_ratio,
          calculatedFields.quick_ratio,
          calculatedFields.cash_ratio,
          calculatedFields.debt_to_equity,
          calculatedFields.debt_to_assets,
          calculatedFields.interest_coverage,
          calculatedFields.asset_turnover
        );

        return { success: true, action: 'inserted', ttmId: result.lastInsertRowid };
      }
    } catch (error) {
      console.error(`Error calculating TTM for company ${companyId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recalculate TTM metrics for all active companies
   *
   * @param {Object} db - Database connection
   * @returns {Object} Result with counts of updated/inserted/failed
   */
  recalculateAllTTM(db) {
    const companies = db.prepare('SELECT id, symbol FROM companies WHERE is_active = 1').all();

    let updated = 0;
    let inserted = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`\n📊 Calculating TTM metrics for ${companies.length} companies...`);

    for (const company of companies) {
      const result = this.calculateTTMForCompany(db, company.id);

      if (result.success) {
        if (result.action === 'updated') updated++;
        else if (result.action === 'inserted') inserted++;
      } else if (result.reason === 'Insufficient quarterly data') {
        skipped++;
      } else {
        failed++;
        console.error(`  ❌ ${company.symbol}: ${result.error || result.reason}`);
      }
    }

    console.log(`✅ TTM calculation complete: ${updated} updated, ${inserted} inserted, ${skipped} skipped, ${failed} failed`);

    return { updated, inserted, skipped, failed, total: companies.length };
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
