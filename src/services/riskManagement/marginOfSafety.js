/**
 * Margin of Safety Calculator
 *
 * Calculates intrinsic value using multiple methods and determines
 * margin of safety for value investing decisions.
 *
 * Methods:
 * 1. DCF (Discounted Cash Flow) - Uses existing DCFCalculator
 * 2. Graham Number - sqrt(22.5 × EPS × Book Value)
 * 3. Earnings Power Value (EPV) - Normalized earnings / Cost of equity
 * 4. Book Value - Conservative floor valuation
 * 5. Dividend Discount Model (DDM) - For dividend payers
 *
 * Integrates with existing DCF calculator and calculated_metrics.
 */

const DCFCalculator = require('../dcfCalculator');

class MarginOfSafetyCalculator {
  constructor(db) {
    this.db = db;
    this.dcfCalculator = new DCFCalculator(db);

    // Method weights (adjusted based on data availability)
    this.DEFAULT_WEIGHTS = {
      dcf: 0.35,
      graham: 0.20,
      epv: 0.25,
      bookValue: 0.10,
      ddm: 0.10
    };

    // Prepare statements
    this.prepareStatements();
  }

  prepareStatements() {
    this.getCompanyMetrics = this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        -- Price data
        pm.last_price,
        pm.market_cap,
        pm.shares_outstanding,
        pm.beta,
        -- Calculated metrics
        cm.pe_ratio,
        cm.pb_ratio,
        cm.ps_ratio,
        cm.ev_ebitda,
        cm.fcf_yield,
        cm.earnings_yield,
        cm.dividend_yield,
        cm.roic,
        cm.roe,
        cm.operating_margin,
        cm.net_margin,
        cm.debt_to_equity,
        cm.current_ratio,
        cm.revenue_growth_yoy,
        cm.eps,
        cm.book_value_per_share
      FROM companies c
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      LEFT JOIN calculated_metrics cm ON cm.company_id = c.id AND cm.period_type = 'annual'
      WHERE c.id = ?
      ORDER BY cm.fiscal_period DESC
      LIMIT 1
    `);

    this.getFinancials = this.db.prepare(`
      SELECT
        total_revenue,
        operating_income,
        net_income,
        total_assets,
        total_liabilities,
        total_equity,
        operating_cash_flow,
        free_cash_flow,
        dividends_paid,
        fiscal_date_ending
      FROM financial_data
      WHERE company_id = ?
        AND period_type = 'annual'
      ORDER BY fiscal_date_ending DESC
      LIMIT 3
    `);

    this.getDividendHistory = this.db.prepare(`
      SELECT
        dividend_amount,
        dividend_yield,
        annual_dividend,
        cagr_5y
      FROM dividends
      WHERE company_id = ?
      ORDER BY ex_date DESC
      LIMIT 1
    `);

    this.getExistingDCF = this.db.prepare(`
      SELECT
        intrinsic_value_base,
        intrinsic_value_bull,
        intrinsic_value_bear,
        wacc,
        terminal_growth,
        confidence_score,
        calculated_at
      FROM dcf_valuations
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `);

    this.insertEstimate = this.db.prepare(`
      INSERT INTO intrinsic_value_estimates (
        company_id, symbol, estimate_date,
        dcf_value, dcf_confidence, dcf_assumptions,
        graham_number, eps_used, book_value_used,
        epv_value, normalized_earnings, cost_of_equity,
        book_value_per_share, tangible_book_value,
        ddm_value, dividend_used, dividend_growth_rate,
        weighted_intrinsic_value, method_weights, confidence_level, data_quality_score,
        current_price, margin_of_safety, valuation_signal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, estimate_date) DO UPDATE SET
        dcf_value = excluded.dcf_value,
        dcf_confidence = excluded.dcf_confidence,
        graham_number = excluded.graham_number,
        epv_value = excluded.epv_value,
        ddm_value = excluded.ddm_value,
        weighted_intrinsic_value = excluded.weighted_intrinsic_value,
        current_price = excluded.current_price,
        margin_of_safety = excluded.margin_of_safety,
        valuation_signal = excluded.valuation_signal
    `);

    this.getLatestEstimate = this.db.prepare(`
      SELECT * FROM intrinsic_value_estimates
      WHERE company_id = ?
      ORDER BY estimate_date DESC
      LIMIT 1
    `);
  }

  /**
   * Calculate intrinsic value using all available methods
   */
  async calculateIntrinsicValue(companyId, options = {}) {
    const { forceRecalcDCF = false, customWeights = null } = options;

    // Get company data
    const metrics = this.getCompanyMetrics.get(companyId);
    if (!metrics) {
      return { success: false, error: 'Company not found' };
    }

    const financials = this.getFinancials.all(companyId);
    const dividends = this.getDividendHistory.get(companyId);

    // Initialize results
    const results = {
      symbol: metrics.symbol,
      name: metrics.name,
      currentPrice: metrics.last_price,
      methods: {},
      dataQuality: { available: 0, total: 5 }
    };

    // 1. DCF Value (use existing or recalculate)
    const dcfResult = await this.getDCFValue(companyId, forceRecalcDCF);
    if (dcfResult.value) {
      results.methods.dcf = dcfResult;
      results.dataQuality.available++;
    }

    // 2. Graham Number
    const grahamResult = this.calculateGrahamNumber(metrics);
    if (grahamResult.value) {
      results.methods.graham = grahamResult;
      results.dataQuality.available++;
    }

    // 3. Earnings Power Value
    const epvResult = this.calculateEPV(metrics, financials);
    if (epvResult.value) {
      results.methods.epv = epvResult;
      results.dataQuality.available++;
    }

    // 4. Book Value
    const bookResult = this.calculateBookValue(metrics);
    if (bookResult.value) {
      results.methods.bookValue = bookResult;
      results.dataQuality.available++;
    }

    // 5. Dividend Discount Model
    const ddmResult = this.calculateDDM(metrics, dividends);
    if (ddmResult.value) {
      results.methods.ddm = ddmResult;
      results.dataQuality.available++;
    }

    // Calculate weighted average intrinsic value
    const weights = customWeights || this.calculateAdaptiveWeights(results.methods, metrics);
    const weighted = this.calculateWeightedValue(results.methods, weights);

    results.weights = weights;
    results.weightedIntrinsicValue = weighted.value;
    results.confidence = weighted.confidence;

    // Calculate margin of safety
    if (metrics.last_price && weighted.value) {
      results.marginOfSafety = (weighted.value - metrics.last_price) / weighted.value;
      results.upside = (weighted.value / metrics.last_price - 1) * 100;

      // Valuation signal
      if (results.marginOfSafety >= 0.50) {
        results.valuationSignal = 'DEEPLY_UNDERVALUED';
      } else if (results.marginOfSafety >= 0.25) {
        results.valuationSignal = 'UNDERVALUED';
      } else if (results.marginOfSafety >= 0) {
        results.valuationSignal = 'FAIRLY_VALUED';
      } else if (results.marginOfSafety >= -0.25) {
        results.valuationSignal = 'OVERVALUED';
      } else {
        results.valuationSignal = 'SIGNIFICANTLY_OVERVALUED';
      }
    }

    // Calculate data quality score
    results.dataQualityScore = results.dataQuality.available / results.dataQuality.total;

    // Store results
    this.storeEstimate(companyId, results);

    return { success: true, ...results };
  }

  /**
   * Get DCF value (existing or new calculation)
   */
  async getDCFValue(companyId, forceRecalc = false) {
    if (!forceRecalc) {
      // Check for recent DCF calculation (within 7 days)
      const existing = this.getExistingDCF.get(companyId);
      if (existing) {
        const daysSinceCalc = (Date.now() - new Date(existing.calculated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCalc < 7) {
          return {
            value: existing.intrinsic_value_base,
            bullCase: existing.intrinsic_value_bull,
            bearCase: existing.intrinsic_value_bear,
            wacc: existing.wacc,
            terminalGrowth: existing.terminal_growth,
            confidence: existing.confidence_score || 0.7,
            source: 'cached'
          };
        }
      }
    }

    // Calculate new DCF
    try {
      const dcfResult = await this.dcfCalculator.calculateDCF(companyId);
      if (dcfResult.success) {
        return {
          value: dcfResult.intrinsicValue,
          bullCase: dcfResult.scenarios?.bull?.intrinsicValuePerShare,
          bearCase: dcfResult.scenarios?.bear?.intrinsicValuePerShare,
          wacc: dcfResult.assumptions?.wacc,
          terminalGrowth: dcfResult.assumptions?.growth?.terminal,
          confidence: dcfResult.sanityChecks?.overallConfidence || 0.7,
          source: 'calculated',
          assumptions: JSON.stringify(dcfResult.assumptions)
        };
      }
    } catch (error) {
      console.error(`DCF calculation failed for company ${companyId}: ${error.message}`);
    }

    return { value: null };
  }

  /**
   * Calculate Graham Number
   * Formula: sqrt(22.5 × EPS × Book Value per Share)
   */
  calculateGrahamNumber(metrics) {
    const eps = metrics.eps;
    const bookValue = metrics.book_value_per_share;

    if (!eps || eps <= 0 || !bookValue || bookValue <= 0) {
      return { value: null, reason: 'Negative or missing EPS/Book Value' };
    }

    // Graham's original formula
    const grahamNumber = Math.sqrt(22.5 * eps * bookValue);

    return {
      value: grahamNumber,
      eps: eps,
      bookValue: bookValue,
      confidence: 0.6, // Graham number is a rough estimate
      notes: 'Conservative estimate based on Graham\'s formula'
    };
  }

  /**
   * Calculate Earnings Power Value (EPV)
   * Formula: Normalized Earnings / Cost of Equity
   */
  calculateEPV(metrics, financials) {
    if (!financials || financials.length === 0) {
      return { value: null, reason: 'No financial data' };
    }

    // Calculate 3-year average operating income (normalized)
    const operatingIncomes = financials
      .filter(f => f.operating_income)
      .map(f => f.operating_income);

    if (operatingIncomes.length === 0) {
      return { value: null, reason: 'No operating income data' };
    }

    const avgOperatingIncome = operatingIncomes.reduce((a, b) => a + b, 0) / operatingIncomes.length;

    // Apply tax adjustment (assume 25% effective tax rate)
    const taxRate = 0.25;
    const normalizedEarnings = avgOperatingIncome * (1 - taxRate);

    // Cost of equity via CAPM
    const riskFreeRate = 0.043; // 10-year Treasury
    const equityRiskPremium = 0.05;
    const beta = metrics.beta || 1.0;
    const costOfEquity = riskFreeRate + (beta * equityRiskPremium);

    if (normalizedEarnings <= 0 || costOfEquity <= 0) {
      return { value: null, reason: 'Negative earnings or invalid cost of equity' };
    }

    // EPV = Normalized Earnings / Cost of Equity
    const epvTotal = normalizedEarnings / costOfEquity;
    const epvPerShare = metrics.shares_outstanding > 0
      ? epvTotal / metrics.shares_outstanding
      : null;

    return {
      value: epvPerShare,
      totalValue: epvTotal,
      normalizedEarnings: normalizedEarnings,
      costOfEquity: costOfEquity,
      yearsAveraged: operatingIncomes.length,
      confidence: operatingIncomes.length >= 3 ? 0.7 : 0.5
    };
  }

  /**
   * Calculate Book Value (floor valuation)
   */
  calculateBookValue(metrics) {
    const bookValue = metrics.book_value_per_share;

    if (!bookValue || bookValue <= 0) {
      return { value: null, reason: 'No positive book value' };
    }

    // Also calculate tangible book value (exclude intangibles)
    // Rough estimate: book value * 0.7 for companies with significant intangibles
    const tangibleMultiplier = metrics.sector === 'Technology' ? 0.5 : 0.8;
    const tangibleBookValue = bookValue * tangibleMultiplier;

    return {
      value: bookValue,
      tangibleBookValue: tangibleBookValue,
      confidence: 0.5, // Book value is a floor estimate
      notes: 'Conservative liquidation value estimate'
    };
  }

  /**
   * Calculate Dividend Discount Model (DDM)
   * Formula: Dividend / (Required Return - Growth Rate)
   */
  calculateDDM(metrics, dividends) {
    if (!dividends || !dividends.annual_dividend || dividends.annual_dividend <= 0) {
      return { value: null, reason: 'No dividend data' };
    }

    const annualDividend = dividends.annual_dividend;

    // Required return (cost of equity)
    const riskFreeRate = 0.043;
    const equityRiskPremium = 0.05;
    const beta = metrics.beta || 1.0;
    const requiredReturn = riskFreeRate + (beta * equityRiskPremium);

    // Dividend growth rate (use historical or conservative estimate)
    let growthRate = dividends.cagr_5y || 0.03;
    growthRate = Math.min(growthRate, requiredReturn - 0.01); // Must be less than required return

    if (growthRate >= requiredReturn) {
      return { value: null, reason: 'Growth rate exceeds required return' };
    }

    // Gordon Growth Model
    const ddmValue = annualDividend / (requiredReturn - growthRate);

    return {
      value: ddmValue,
      dividend: annualDividend,
      growthRate: growthRate,
      requiredReturn: requiredReturn,
      confidence: dividends.cagr_5y ? 0.7 : 0.5,
      notes: 'Gordon Growth Model valuation'
    };
  }

  /**
   * Calculate adaptive weights based on data availability and company type
   */
  calculateAdaptiveWeights(methods, metrics) {
    const weights = { ...this.DEFAULT_WEIGHTS };

    // Adjust weights based on available data
    const available = Object.keys(methods).filter(m => methods[m]?.value);

    // If DCF not available, redistribute weight
    if (!methods.dcf?.value) {
      weights.dcf = 0;
      weights.epv += 0.15;
      weights.graham += 0.10;
      weights.bookValue += 0.10;
    }

    // If no dividends, redistribute DDM weight
    if (!methods.ddm?.value) {
      weights.ddm = 0;
      weights.dcf += 0.05;
      weights.epv += 0.05;
    }

    // Adjust for company type
    if (metrics.sector === 'Financials') {
      // Book value more important for financials
      weights.bookValue += 0.10;
      weights.dcf -= 0.10;
    }

    if (metrics.sector === 'Real Estate') {
      // Book value and DDM more important
      weights.bookValue += 0.10;
      weights.ddm += 0.10;
      weights.epv -= 0.20;
    }

    // High growth companies - DCF more important
    if (metrics.revenue_growth_yoy > 0.20) {
      weights.dcf += 0.10;
      weights.graham -= 0.05;
      weights.bookValue -= 0.05;
    }

    // Normalize weights to sum to 1
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key in weights) {
      weights[key] = weights[key] / total;
    }

    return weights;
  }

  /**
   * Calculate weighted average value
   */
  calculateWeightedValue(methods, weights) {
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;

    for (const method in weights) {
      if (methods[method]?.value && weights[method] > 0) {
        weightedSum += methods[method].value * weights[method];
        totalWeight += weights[method];
        confidenceSum += (methods[method].confidence || 0.5) * weights[method];
      }
    }

    if (totalWeight === 0) {
      return { value: null, confidence: 0 };
    }

    return {
      value: weightedSum / totalWeight,
      confidence: confidenceSum / totalWeight
    };
  }

  /**
   * Store estimate in database
   */
  storeEstimate(companyId, results) {
    const today = new Date().toISOString().split('T')[0];

    this.insertEstimate.run(
      companyId,
      results.symbol,
      today,
      results.methods.dcf?.value,
      results.methods.dcf?.confidence,
      results.methods.dcf?.assumptions,
      results.methods.graham?.value,
      results.methods.graham?.eps,
      results.methods.graham?.bookValue,
      results.methods.epv?.value,
      results.methods.epv?.normalizedEarnings,
      results.methods.epv?.costOfEquity,
      results.methods.bookValue?.value,
      results.methods.bookValue?.tangibleBookValue,
      results.methods.ddm?.value,
      results.methods.ddm?.dividend,
      results.methods.ddm?.growthRate,
      results.weightedIntrinsicValue,
      JSON.stringify(results.weights),
      results.confidence,
      results.dataQualityScore,
      results.currentPrice,
      results.marginOfSafety,
      results.valuationSignal
    );
  }

  /**
   * Get latest estimate for a company
   */
  getLatestEstimate(companyId) {
    return this.getLatestEstimate.get(companyId);
  }

  /**
   * Check if margin of safety requirement is met
   */
  checkMarginOfSafety(companyId, minMargin = 0.25) {
    const estimate = this.getLatestEstimate.get(companyId);

    if (!estimate) {
      return {
        passed: false,
        reason: 'No valuation estimate available',
        marginOfSafety: null,
        required: minMargin
      };
    }

    const marginOfSafety = estimate.margin_of_safety;

    return {
      passed: marginOfSafety >= minMargin,
      marginOfSafety: marginOfSafety,
      required: minMargin,
      intrinsicValue: estimate.weighted_intrinsic_value,
      currentPrice: estimate.current_price,
      valuationSignal: estimate.valuation_signal,
      confidence: estimate.confidence_level
    };
  }

  /**
   * Batch calculate intrinsic values
   */
  async batchCalculate(companyIds, options = {}) {
    const results = [];

    for (const companyId of companyIds) {
      try {
        const result = await this.calculateIntrinsicValue(companyId, options);
        if (result.success) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error calculating for company ${companyId}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get undervalued stocks (margin of safety > threshold)
   */
  getUndervaluedStocks(minMargin = 0.25, limit = 50) {
    return this.db.prepare(`
      SELECT
        ive.*,
        c.name,
        c.sector,
        c.industry,
        pm.market_cap,
        cm.roic,
        cm.roe,
        cm.debt_to_equity
      FROM intrinsic_value_estimates ive
      JOIN companies c ON ive.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      LEFT JOIN calculated_metrics cm ON cm.company_id = c.id AND cm.period_type = 'annual'
      WHERE ive.margin_of_safety >= ?
        AND ive.confidence_level >= 0.5
        AND ive.estimate_date >= date('now', '-30 days')
      ORDER BY ive.margin_of_safety DESC
      LIMIT ?
    `).all(minMargin, limit);
  }
}

module.exports = { MarginOfSafetyCalculator };
