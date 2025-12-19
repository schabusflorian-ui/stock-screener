/**
 * Professional DCF Calculator
 *
 * PE/Banking-grade valuation with multi-stage growth, dual terminal methods,
 * automatic scenarios, and sanity checks.
 *
 * Features:
 * - Multi-stage growth model (3 stages + terminal)
 * - Dual terminal value methods (Gordon Growth + Exit Multiple)
 * - Auto-generated bull/base/bear scenarios
 * - WACC calculation via CAPM
 * - Comprehensive sanity checks
 * - Margin of safety buy targets
 */

class DCFCalculator {
  constructor(db) {
    this.db = db;

    // Default assumptions (can be overridden)
    this.defaults = {
      riskFreeRate: 0.043,       // 10-year Treasury (Dec 2024)
      equityRiskPremium: 0.05,   // Historical average
      terminalGrowth: 0.025,     // Max 2.5%, typically GDP growth
      maxGrowthRate: 0.30,       // Cap any growth rate at 30%
      minGrowthRate: -0.10,      // Floor at -10%
      defaultBeta: 1.0,

      // Scenario adjustments
      bullAdjustments: {
        growthDelta: 0.02,       // +2% growth
        discountDelta: -0.01,    // -1% discount rate
        marginDelta: 0.02        // +2% margin
      },
      bearAdjustments: {
        growthDelta: -0.03,      // -3% growth
        discountDelta: 0.015,    // +1.5% discount rate
        marginDelta: -0.02       // -2% margin
      },

      // Probability weights for scenarios
      scenarioWeights: {
        bull: 0.25,
        base: 0.50,
        bear: 0.25
      }
    };
  }

  /**
   * Main DCF calculation entry point
   */
  async calculateDCF(companyId, overrides = {}) {
    try {
      // 1. Gather all required data
      const inputs = await this.gatherInputs(companyId, overrides);

      // 2. Validate inputs
      const validation = this.validateInputs(inputs);
      if (!validation.valid) {
        return { success: false, errors: validation.errors, inputs };
      }

      // 3. Calculate base case
      const baseCase = this.calculateScenario(inputs, 'base');

      // 4. Calculate bull/bear scenarios
      const bullCase = this.calculateScenario(inputs, 'bull');
      const bearCase = this.calculateScenario(inputs, 'bear');

      // 5. Calculate probability-weighted value
      const weightedValue = this.calculateWeightedValue(baseCase, bullCase, bearCase, inputs.scenarioWeights);

      // 6. Run sanity checks
      const sanityChecks = this.runSanityChecks(inputs, baseCase);

      // 7. Calculate buy targets
      const buyTargets = this.calculateBuyTargets(baseCase.intrinsicValuePerShare);

      // 8. Compile results
      const results = {
        success: true,
        company: inputs.company,

        // Core valuation
        intrinsicValue: baseCase.intrinsicValuePerShare,
        currentPrice: inputs.currentPrice,
        upside: inputs.currentPrice > 0
          ? ((baseCase.intrinsicValuePerShare / inputs.currentPrice) - 1) * 100
          : null,

        // Scenarios
        scenarios: {
          base: baseCase,
          bull: bullCase,
          bear: bearCase,
          weighted: weightedValue
        },

        // Terminal value comparison
        terminalAnalysis: {
          gordonGrowth: baseCase.terminalValueGordon,
          exitMultiple: baseCase.terminalValueExitMultiple,
          divergence: baseCase.terminalDivergence,
          methodUsed: baseCase.terminalDivergence < 20 ? 'average' : 'gordon'
        },

        // Sanity checks
        sanityChecks: sanityChecks,

        // Buy targets
        buyTargets: buyTargets,

        // Inputs used (for transparency)
        assumptions: {
          // Base financials
          fcf: inputs.normalizedFCF,
          ebitda: inputs.ebitda,
          revenue: inputs.revenue,
          operatingCashFlow: inputs.operatingCashFlow,
          capex: inputs.capex,
          depreciation: inputs.depreciation,
          workingCapital: inputs.workingCapitalChange,
          cash: inputs.cash,
          totalDebt: inputs.totalDebt,
          sharesOutstanding: inputs.sharesOutstanding,
          netDebt: inputs.netDebt,
          // Growth assumptions
          growth: {
            stage1: inputs.growthStage1,
            stage2: inputs.growthStage2,
            stage3: inputs.growthStage3,
            terminal: inputs.terminalGrowth
          },
          // Margin-based inputs (Excel-style)
          margins: {
            ebitdaMargin: inputs.ebitdaMargin,
            targetEbitdaMargin: inputs.targetEbitdaMargin,
            fcfConversion: inputs.fcfConversion,
            capexPctRevenue: inputs.capexPctRevenue,
            daPctRevenue: inputs.daPctRevenue,
            nwcPctRevenueChange: inputs.nwcPctRevenueChange,
            taxRate: inputs.taxRate,
            marginImprovementYears: inputs.marginImprovementYears
          },
          // Legacy margin fields for compatibility
          currentMargin: inputs.currentMargin,
          targetMargin: inputs.targetMargin,
          // Discount rate
          wacc: inputs.wacc,
          riskFreeRate: inputs.riskFreeRate,
          equityRiskPremium: this.defaults.equityRiskPremium,
          beta: inputs.beta,
          costOfEquity: inputs.riskFreeRate + inputs.beta * this.defaults.equityRiskPremium,
          exitMultiple: inputs.exitMultiple,
          // Scenario probabilities (editable)
          scenarioWeights: inputs.scenarioWeights || this.defaults.scenarioWeights,
          // Historical context
          historicalGrowth: inputs.historicalGrowth
        },

        // Warnings
        warnings: sanityChecks.warnings,

        calculatedAt: new Date().toISOString()
      };

      // 9. Save to database
      await this.saveValuation(companyId, results);

      return results;
    } catch (error) {
      console.error('DCF calculation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gather all inputs from database and apply smart defaults
   */
  async gatherInputs(companyId, overrides) {
    // Get company info
    const company = this.db.prepare(`
      SELECT c.*, c.market_cap
      FROM companies c
      WHERE c.id = ?
    `).get(companyId);

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    // Get financial data (last 5 years, annual)
    const financials = this.db.prepare(`
      SELECT
        statement_type,
        fiscal_date_ending,
        period_type,
        total_revenue,
        net_income,
        operating_income,
        gross_profit,
        operating_cashflow,
        capital_expenditures,
        total_assets,
        total_liabilities,
        shareholder_equity,
        current_assets,
        current_liabilities,
        cash_and_equivalents,
        long_term_debt,
        short_term_debt
      FROM financial_data
      WHERE company_id = ?
        AND period_type = 'annual'
      ORDER BY fiscal_date_ending DESC
    `).all(companyId);

    // Parse and organize financials
    const parsed = this.parseFinancials(financials);

    // Get industry benchmarks
    const industry = company.industry || company.sector || 'Default';
    const benchmarks = this.db.prepare(`
      SELECT * FROM industry_benchmarks
      WHERE industry = ?
         OR industry LIKE ?
         OR sector = ?
         OR industry = 'Default'
      ORDER BY
        CASE WHEN industry = ? THEN 0
             WHEN industry LIKE ? THEN 1
             WHEN sector = ? THEN 2
             ELSE 3 END
      LIMIT 1
    `).get(industry, `%${industry}%`, company.sector, industry, `%${industry}%`, company.sector);

    // Calculate normalized FCF (3-year average to smooth volatility)
    const normalizedFCF = overrides.fcf || this.calculateNormalizedFCF(parsed);

    // Calculate EBITDA
    const ebitda = overrides.ebitda || parsed.latestEbitda;

    // Calculate historical growth rates
    const historicalGrowth = this.calculateHistoricalGrowth(parsed);

    // Calculate WACC
    const wacc = overrides.wacc || this.calculateWACC(company, benchmarks);

    // Estimate shares outstanding from market cap and price if not available
    let sharesOutstanding = overrides.sharesOutstanding || parsed.sharesOutstanding;
    let currentPrice = overrides.currentPrice;

    // If we have market cap but no shares/price, estimate
    if (company.market_cap && !sharesOutstanding) {
      // Try to get shares from most recent balance sheet equity / book value per share
      // For now, use a reasonable estimate based on market cap
      if (currentPrice) {
        sharesOutstanding = company.market_cap / currentPrice;
      }
    }

    // Calculate margin-based metrics from historical data
    const latestRevenue = parsed.latestRevenue || 0;
    const calcEbitdaMargin = latestRevenue > 0 && ebitda ? ebitda / latestRevenue : (benchmarks?.margin_median || 0.20);
    const calcFCFMargin = latestRevenue > 0 && normalizedFCF ? normalizedFCF / latestRevenue : calcEbitdaMargin * 0.6;
    const calcFCFConversion = ebitda > 0 && normalizedFCF ? normalizedFCF / ebitda : 0.6;
    const calcCapexPct = latestRevenue > 0 && parsed.latestCapex ? parsed.latestCapex / latestRevenue : 0.05;
    const calcDAPct = latestRevenue > 0 && parsed.latestDepreciation ? parsed.latestDepreciation / latestRevenue : calcCapexPct * 0.8;
    const calcNWCPct = 0.10; // Default: 10% of revenue change goes to working capital

    // Build inputs object with smart defaults
    const inputs = {
      company: {
        id: companyId,
        symbol: company.symbol,
        name: company.name,
        industry: industry,
        sector: company.sector
      },

      // Current market data
      currentPrice: currentPrice || 0,
      sharesOutstanding: sharesOutstanding,
      marketCap: company.market_cap,

      // Base financials (actuals)
      revenue: overrides.revenue ?? latestRevenue,
      ebitda: overrides.ebitda ?? ebitda,
      normalizedFCF: overrides.fcf ?? normalizedFCF,
      operatingCashFlow: overrides.operatingCashFlow ?? parsed.latestOperatingCashFlow,
      capex: overrides.capex ?? parsed.latestCapex,
      depreciation: overrides.depreciation ?? parsed.latestDepreciation,
      workingCapitalChange: overrides.workingCapital ?? parsed.latestWorkingCapitalChange,
      cash: overrides.cash ?? parsed.latestCash,
      totalDebt: overrides.totalDebt ?? ((parsed.latestShortTermDebt || 0) + (parsed.latestLongTermDebt || 0)),
      netDebt: overrides.netDebt ?? this.calculateNetDebt(parsed),

      // Revenue growth assumptions (multi-stage)
      growthStage1: this.capGrowth(overrides.growthStage1 ?? (historicalGrowth.recent || benchmarks?.revenue_growth_median * 1.2 || 0.10)),
      growthStage2: this.capGrowth(overrides.growthStage2 ?? ((historicalGrowth.recent || 0.05) + (benchmarks?.revenue_growth_median || 0.05)) / 2),
      growthStage3: this.capGrowth(overrides.growthStage3 ?? (benchmarks?.revenue_growth_median || 0.05)),
      terminalGrowth: Math.min(overrides.terminalGrowth ?? this.defaults.terminalGrowth, 0.03),

      // Margin-based inputs (Excel-style)
      ebitdaMargin: overrides.ebitdaMargin ?? calcEbitdaMargin,
      targetEbitdaMargin: overrides.targetEbitdaMargin ?? Math.max(calcEbitdaMargin, benchmarks?.margin_median || 0.20),
      fcfConversion: overrides.fcfConversion ?? calcFCFConversion,
      capexPctRevenue: overrides.capexPctRevenue ?? calcCapexPct,
      daPctRevenue: overrides.daPctRevenue ?? calcDAPct,
      nwcPctRevenueChange: overrides.nwcPctRevenueChange ?? calcNWCPct,
      taxRate: overrides.taxRate ?? 0.21,
      marginImprovementYears: overrides.marginImprovementYears ?? 5,

      // Legacy margin for compatibility
      currentMargin: parsed.latestFCFMargin,
      targetMargin: overrides.targetMargin ?? Math.max(parsed.latestFCFMargin || 0, benchmarks?.margin_median || 0.15),

      // Discount rate
      wacc: wacc,
      riskFreeRate: overrides.riskFreeRate ?? this.defaults.riskFreeRate,
      beta: overrides.beta ?? benchmarks?.beta_median ?? this.defaults.defaultBeta,

      // Terminal value
      exitMultiple: overrides.exitMultiple ?? (benchmarks?.ev_ebitda_median || 12),

      // Scenario probabilities (allow override)
      scenarioWeights: overrides.scenarioWeights ?? this.defaults.scenarioWeights,

      // Benchmarks for comparison
      benchmarks: benchmarks,

      // Historical data for reference
      historicalGrowth: historicalGrowth
    };

    return inputs;
  }

  /**
   * Calculate a single scenario (base/bull/bear)
   * Uses revenue-driven model with margin-based FCF calculation
   */
  calculateScenario(inputs, scenarioType) {
    // Apply scenario adjustments
    let growth1, growth2, growth3, terminalGrowth, wacc, marginAdj;

    if (scenarioType === 'bull') {
      const adj = this.defaults.bullAdjustments;
      growth1 = inputs.growthStage1 + adj.growthDelta;
      growth2 = inputs.growthStage2 + adj.growthDelta * 0.7;
      growth3 = inputs.growthStage3 + adj.growthDelta * 0.5;
      terminalGrowth = Math.min(inputs.terminalGrowth + 0.005, 0.03);
      wacc = Math.max(inputs.wacc + adj.discountDelta, 0.05);
      marginAdj = adj.marginDelta;
    } else if (scenarioType === 'bear') {
      const adj = this.defaults.bearAdjustments;
      growth1 = Math.max(inputs.growthStage1 + adj.growthDelta, -0.1);
      growth2 = Math.max(inputs.growthStage2 + adj.growthDelta * 0.7, 0);
      growth3 = Math.max(inputs.growthStage3 + adj.growthDelta * 0.5, 0.01);
      terminalGrowth = Math.max(inputs.terminalGrowth - 0.005, 0.015);
      wacc = inputs.wacc + adj.discountDelta;
      marginAdj = adj.marginDelta;
    } else {
      // Base case
      growth1 = inputs.growthStage1;
      growth2 = inputs.growthStage2;
      growth3 = inputs.growthStage3;
      terminalGrowth = inputs.terminalGrowth;
      wacc = inputs.wacc;
      marginAdj = 0;
    }

    // Revenue-driven projections
    const projections = [];
    let revenue = inputs.revenue || 0;
    let prevRevenue = revenue;
    let ebitdaMargin = inputs.ebitdaMargin || 0.20;
    const targetEbitdaMargin = (inputs.targetEbitdaMargin || 0.25) + marginAdj;
    const marginStep = (targetEbitdaMargin - ebitdaMargin) / (inputs.marginImprovementYears || 5);
    const fcfConversion = inputs.fcfConversion || 0.60;
    const capexPct = inputs.capexPctRevenue || 0.05;
    const daPct = inputs.daPctRevenue || 0.04;
    const nwcPct = inputs.nwcPctRevenueChange || 0.10;
    const taxRate = inputs.taxRate || 0.21;

    for (let year = 1; year <= 10; year++) {
      // Determine revenue growth rate for this year
      let growthRate;
      if (year <= 3) {
        growthRate = growth1;
      } else if (year <= 7) {
        // Linear fade from stage2 to stage3
        const fadeProgress = (year - 3) / 4;
        growthRate = growth2 * (1 - fadeProgress) + growth3 * fadeProgress;
      } else {
        growthRate = growth3;
      }

      // Project revenue
      prevRevenue = revenue;
      revenue = revenue * (1 + growthRate);

      // Apply margin improvement over first N years
      if (year <= (inputs.marginImprovementYears || 5)) {
        ebitdaMargin = Math.min(ebitdaMargin + marginStep, targetEbitdaMargin);
      }

      // Calculate EBITDA = Revenue × EBITDA Margin
      const ebitda = revenue * ebitdaMargin;

      // Calculate D&A
      const da = revenue * daPct;

      // EBIT = EBITDA - D&A
      const ebit = ebitda - da;

      // Tax
      const tax = Math.max(ebit * taxRate, 0);

      // NOPAT (Net Operating Profit After Tax)
      const nopat = ebit - tax;

      // CapEx
      const capex = revenue * capexPct;

      // Change in NWC (as % of revenue change)
      const revenueChange = revenue - prevRevenue;
      const nwcChange = revenueChange * nwcPct;

      // Free Cash Flow = NOPAT + D&A - CapEx - ΔNWC
      // Alternative: FCF = EBITDA × FCF Conversion (simpler)
      const fcf = nopat + da - capex - nwcChange;

      // Discount factor
      const discountFactor = Math.pow(1 + wacc, year);
      const presentValue = fcf / discountFactor;

      projections.push({
        year,
        revenue,
        revenueGrowth: growthRate,
        ebitda,
        ebitdaMargin,
        da,
        ebit,
        tax,
        nopat,
        capex,
        nwcChange,
        fcf,
        discountFactor,
        presentValue
      });
    }

    // Calculate terminal values (both methods)
    const year10FCF = projections[9].fcf;
    const year10EBITDA = projections[9].ebitda;
    const year10Revenue = projections[9].revenue;

    // Gordon Growth Model
    const terminalValueGordon = (year10FCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    const terminalPVGordon = terminalValueGordon / Math.pow(1 + wacc, 10);

    // Exit Multiple Method (EV/EBITDA)
    const terminalValueExitMultiple = year10EBITDA * inputs.exitMultiple;
    const terminalPVExitMultiple = terminalValueExitMultiple / Math.pow(1 + wacc, 10);

    // Check divergence
    const avgTerminal = (terminalPVGordon + terminalPVExitMultiple) / 2;
    const terminalDivergence = avgTerminal > 0
      ? Math.abs(terminalPVGordon - terminalPVExitMultiple) / avgTerminal * 100
      : 0;

    // Use average if close, otherwise Gordon (more conservative typically)
    const terminalPV = terminalDivergence < 20
      ? avgTerminal
      : terminalPVGordon;

    // Sum of discounted FCFs
    const pvOfFCFs = projections.reduce((sum, p) => sum + p.presentValue, 0);

    // Enterprise Value
    const enterpriseValue = pvOfFCFs + terminalPV;

    // Equity Value
    const equityValue = enterpriseValue - (inputs.netDebt || 0);

    // Per share value
    const intrinsicValuePerShare = inputs.sharesOutstanding > 0
      ? equityValue / inputs.sharesOutstanding
      : equityValue / 1e9; // Fallback: show in billions

    // Terminal value as % of total (important sanity check)
    const terminalPct = enterpriseValue > 0 ? (terminalPV / enterpriseValue) * 100 : 0;

    return {
      scenarioType,
      intrinsicValuePerShare,
      enterpriseValue,
      equityValue,
      pvOfFCFs,
      terminalValueGordon: terminalPVGordon,
      terminalValueExitMultiple: terminalPVExitMultiple,
      terminalPV,
      terminalDivergence,
      terminalPct,
      projections,
      year10Summary: {
        revenue: year10Revenue,
        ebitda: year10EBITDA,
        fcf: year10FCF,
        ebitdaMargin: projections[9].ebitdaMargin
      },
      assumptions: {
        growth: [growth1, growth2, growth3],
        terminalGrowth,
        wacc,
        exitMultiple: inputs.exitMultiple,
        ebitdaMargin: inputs.ebitdaMargin,
        targetEbitdaMargin,
        fcfConversion,
        capexPct,
        daPct,
        nwcPct,
        taxRate
      }
    };
  }

  /**
   * Calculate probability-weighted value
   */
  calculateWeightedValue(baseCase, bullCase, bearCase, customWeights = null) {
    const weights = customWeights || this.defaults.scenarioWeights;

    const weightedValue =
      baseCase.intrinsicValuePerShare * weights.base +
      bullCase.intrinsicValuePerShare * weights.bull +
      bearCase.intrinsicValuePerShare * weights.bear;

    return {
      value: weightedValue,
      weights: weights,
      range: {
        low: bearCase.intrinsicValuePerShare,
        mid: baseCase.intrinsicValuePerShare,
        high: bullCase.intrinsicValuePerShare
      }
    };
  }

  /**
   * Run sanity checks and generate warnings
   */
  runSanityChecks(inputs, baseCase) {
    const warnings = [];
    const checks = {};

    // 1. Terminal value too high?
    checks.terminalPct = baseCase.terminalPct;
    if (baseCase.terminalPct > 75) {
      warnings.push(`Terminal value = ${baseCase.terminalPct.toFixed(0)}% of total (high - value sensitive to terminal assumptions)`);
    } else if (baseCase.terminalPct > 60) {
      warnings.push(`Terminal value = ${baseCase.terminalPct.toFixed(0)}% of total (moderate)`);
    }

    // 2. Growth rate vs historical
    checks.growthVsHistorical = {
      assumed: inputs.growthStage1,
      historical: inputs.historicalGrowth?.recent
    };
    if (inputs.historicalGrowth?.recent && inputs.growthStage1 > inputs.historicalGrowth.recent * 1.5) {
      warnings.push(`Growth assumption (${(inputs.growthStage1 * 100).toFixed(1)}%) exceeds historical (${(inputs.historicalGrowth.recent * 100).toFixed(1)}%)`);
    }

    // 3. Implied multiples vs industry
    const impliedEVEBITDA = inputs.ebitda > 0 ? baseCase.enterpriseValue / inputs.ebitda : null;
    const impliedPFCF = inputs.normalizedFCF > 0 ? baseCase.equityValue / inputs.normalizedFCF : null;

    checks.impliedMultiples = {
      evEbitda: impliedEVEBITDA,
      pfcf: impliedPFCF
    };

    checks.industryMultiples = {
      evEbitda: inputs.benchmarks?.ev_ebitda_median,
      pe: inputs.benchmarks?.pe_median
    };

    if (impliedEVEBITDA && inputs.benchmarks?.ev_ebitda_median &&
        impliedEVEBITDA > inputs.benchmarks.ev_ebitda_median * 1.5) {
      warnings.push(`Implied EV/EBITDA (${impliedEVEBITDA.toFixed(1)}x) significantly above industry (${inputs.benchmarks.ev_ebitda_median}x)`);
    }

    // 4. Terminal methods divergence
    checks.terminalDivergence = baseCase.terminalDivergence;
    if (baseCase.terminalDivergence > 30) {
      warnings.push(`Terminal value methods diverge by ${baseCase.terminalDivergence.toFixed(0)}% - review assumptions`);
    }

    // 5. Negative FCF
    if (inputs.normalizedFCF <= 0) {
      warnings.push('Negative or zero FCF - DCF may not be appropriate valuation method');
    }

    // 6. WACC sanity
    if (inputs.wacc < 0.06) {
      warnings.push(`WACC (${(inputs.wacc * 100).toFixed(1)}%) seems low - verify discount rate`);
    } else if (inputs.wacc > 0.15) {
      warnings.push(`WACC (${(inputs.wacc * 100).toFixed(1)}%) seems high - verify discount rate`);
    }

    // 7. Missing shares outstanding
    if (!inputs.sharesOutstanding || inputs.sharesOutstanding <= 0) {
      warnings.push('Shares outstanding unknown - per-share value may be inaccurate');
    }

    return {
      checks,
      warnings,
      warningCount: warnings.length,
      overallHealth: warnings.length === 0 ? 'good' : warnings.length <= 2 ? 'caution' : 'review'
    };
  }

  /**
   * Calculate buy targets with margin of safety
   */
  calculateBuyTargets(intrinsicValue) {
    return {
      intrinsicValue,
      marginOfSafety25: intrinsicValue * 0.75,
      marginOfSafety33: intrinsicValue * 0.67,
      marginOfSafety50: intrinsicValue * 0.50
    };
  }

  /**
   * Calculate WACC (Weighted Average Cost of Capital)
   */
  calculateWACC(company, benchmarks) {
    const riskFreeRate = this.defaults.riskFreeRate;
    const equityRiskPremium = this.defaults.equityRiskPremium;
    const beta = benchmarks?.beta_median || this.defaults.defaultBeta;

    // Cost of equity (CAPM)
    const costOfEquity = riskFreeRate + beta * equityRiskPremium;

    // Cost of debt (simplified - use risk-free + spread based on industry)
    const debtSpread = 0.02; // Assume 2% spread
    const costOfDebt = riskFreeRate + debtSpread;
    const taxRate = 0.21; // US corporate tax rate
    const afterTaxCostOfDebt = costOfDebt * (1 - taxRate);

    // Capital structure (simplified - assume from benchmarks or 80/20)
    const equityWeight = 0.80;
    const debtWeight = 0.20;

    const wacc = (costOfEquity * equityWeight) + (afterTaxCostOfDebt * debtWeight);

    return Math.max(0.05, Math.min(wacc, 0.20)); // Bound between 5% and 20%
  }

  /**
   * Calculate normalized FCF (3-year average)
   */
  calculateNormalizedFCF(parsed) {
    if (!parsed.fcfHistory || parsed.fcfHistory.length === 0) {
      return null;
    }

    // Get last 3 years of FCF
    const recentFCFs = parsed.fcfHistory
      .slice(0, 3)
      .filter(fcf => fcf !== null && !isNaN(fcf));

    if (recentFCFs.length === 0) return null;

    // Return average
    return recentFCFs.reduce((sum, fcf) => sum + fcf, 0) / recentFCFs.length;
  }

  /**
   * Calculate net debt
   */
  calculateNetDebt(parsed) {
    const totalDebt = (parsed.latestShortTermDebt || 0) + (parsed.latestLongTermDebt || 0);
    const cash = parsed.latestCash || 0;
    return totalDebt - cash;
  }

  /**
   * Calculate historical growth rates
   */
  calculateHistoricalGrowth(parsed) {
    if (!parsed.revenues || parsed.revenues.length < 2) {
      return { recent: 0.05, threeYearCAGR: 0.05, average: 0.05 };
    }

    const revenues = parsed.revenues.filter(r => r !== null && r > 0);

    if (revenues.length < 2) {
      return { recent: 0.05, threeYearCAGR: 0.05, average: 0.05 };
    }

    // Recent growth (YoY)
    const recentGrowth = (revenues[0] - revenues[1]) / Math.abs(revenues[1]);

    // 3-year CAGR
    const threeYearCAGR = revenues.length >= 4
      ? Math.pow(revenues[0] / revenues[3], 1 / 3) - 1
      : recentGrowth;

    return {
      recent: this.capGrowth(recentGrowth),
      threeYearCAGR: this.capGrowth(threeYearCAGR),
      average: this.capGrowth((recentGrowth + threeYearCAGR) / 2)
    };
  }

  /**
   * Cap growth rate at maximum/minimum
   */
  capGrowth(rate) {
    if (rate === null || isNaN(rate)) return 0.05;
    return Math.min(Math.max(rate, this.defaults.minGrowthRate), this.defaults.maxGrowthRate);
  }

  /**
   * Parse financial data from database format
   */
  parseFinancials(financials) {
    const result = {
      revenues: [],
      fcfHistory: [],
      latestEbitda: null,
      latestRevenue: null,
      latestFCFMargin: null,
      latestCash: null,
      latestLongTermDebt: null,
      latestShortTermDebt: null,
      latestOperatingCashFlow: null,
      latestCapex: null,
      latestDepreciation: null,
      latestWorkingCapitalChange: null,
      sharesOutstanding: null
    };

    // Group by fiscal date
    const byDate = {};
    for (const row of financials) {
      const date = row.fiscal_date_ending;
      if (!byDate[date]) byDate[date] = {};
      byDate[date][row.statement_type] = row;
    }

    // Process each period
    const sortedDates = Object.keys(byDate).sort().reverse();

    for (const date of sortedDates) {
      const period = byDate[date];

      // Revenue
      if (period.income_statement?.total_revenue) {
        result.revenues.push(period.income_statement.total_revenue);
      }

      // FCF = Operating Cash Flow - CapEx
      if (period.cash_flow) {
        const ocf = period.cash_flow.operating_cashflow || 0;
        const capex = Math.abs(period.cash_flow.capital_expenditures || 0);
        const fcf = ocf - capex;
        result.fcfHistory.push(fcf);

        // FCF margin
        if (period.income_statement?.total_revenue && !result.latestFCFMargin) {
          result.latestFCFMargin = fcf / period.income_statement.total_revenue;
        }

        // Latest cash flow components
        if (!result.latestOperatingCashFlow) result.latestOperatingCashFlow = ocf;
        if (!result.latestCapex) result.latestCapex = capex;
        if (!result.latestDepreciation) {
          result.latestDepreciation = period.cash_flow.depreciation_amortization || 0;
        }
      }

      // Latest values
      if (!result.latestRevenue && period.income_statement?.total_revenue) {
        result.latestRevenue = period.income_statement.total_revenue;
      }

      if (!result.latestEbitda && period.income_statement) {
        const is = period.income_statement;
        // EBITDA = Operating Income + D&A (estimate from gross - operating if needed)
        result.latestEbitda = is.operating_income
          ? is.operating_income * 1.15 // Rough estimate: add ~15% for D&A
          : (is.gross_profit || 0) * 0.5;
      }

      if (period.balance_sheet) {
        const bs = period.balance_sheet;
        if (!result.latestCash) result.latestCash = bs.cash_and_equivalents;
        if (!result.latestLongTermDebt) result.latestLongTermDebt = bs.long_term_debt;
        if (!result.latestShortTermDebt) result.latestShortTermDebt = bs.short_term_debt;
      }
    }

    return result;
  }

  /**
   * Validate inputs before calculation
   */
  validateInputs(inputs) {
    const errors = [];

    if (!inputs.normalizedFCF || inputs.normalizedFCF === 0) {
      errors.push('Missing or zero Free Cash Flow');
    }

    if (!inputs.sharesOutstanding || inputs.sharesOutstanding <= 0) {
      // Warning but not blocking - we can still calculate EV
    }

    if (!inputs.wacc || inputs.wacc <= 0) {
      errors.push('Invalid WACC');
    }

    if (inputs.terminalGrowth >= inputs.wacc) {
      errors.push('Terminal growth must be less than WACC');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Save valuation to database
   */
  async saveValuation(companyId, results) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO dcf_valuations (
          company_id, base_fcf, base_ebitda, base_revenue, shares_outstanding, net_debt,
          growth_stage1, growth_stage2, growth_stage3, terminal_growth,
          current_margin, target_margin, wacc,
          terminal_value_gordon, terminal_value_exit_multiple, exit_multiple_used,
          terminal_method_divergence,
          enterprise_value, equity_value, intrinsic_value_per_share,
          bull_case_value, bear_case_value, weighted_value,
          implied_ev_ebitda, terminal_value_pct,
          margin_of_safety_25, margin_of_safety_50,
          warning_flags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        companyId,
        results.assumptions.fcf,
        results.assumptions.ebitda,
        results.assumptions.revenue,
        results.assumptions.sharesOutstanding,
        results.assumptions.netDebt,
        results.assumptions.growth.stage1,
        results.assumptions.growth.stage2,
        results.assumptions.growth.stage3,
        results.assumptions.growth.terminal,
        results.assumptions.currentMargin,
        results.assumptions.targetMargin,
        results.assumptions.wacc,
        results.terminalAnalysis.gordonGrowth,
        results.terminalAnalysis.exitMultiple,
        results.assumptions.exitMultiple,
        results.terminalAnalysis.divergence,
        results.scenarios.base.enterpriseValue,
        results.scenarios.base.equityValue,
        results.intrinsicValue,
        results.scenarios.bull.intrinsicValuePerShare,
        results.scenarios.bear.intrinsicValuePerShare,
        results.scenarios.weighted.value,
        results.sanityChecks.checks.impliedMultiples?.evEbitda,
        results.scenarios.base.terminalPct,
        results.buyTargets.marginOfSafety25,
        results.buyTargets.marginOfSafety50,
        JSON.stringify(results.warnings)
      );
    } catch (error) {
      console.error('Error saving DCF valuation:', error);
      // Don't throw - saving is optional
    }
  }

  /**
   * Get historical DCF valuations for a company
   */
  getHistoricalValuations(companyId, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM dcf_valuations
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT ?
    `).all(companyId, limit);
  }

  /**
   * Get sensitivity matrix
   */
  async calculateSensitivity(companyId, baseWACC, baseGrowth) {
    const waccRange = [-0.02, -0.01, 0, 0.01, 0.02];
    const growthRange = [-0.03, -0.015, 0, 0.015, 0.03];

    const matrix = [];

    for (const waccDelta of waccRange) {
      const row = [];
      for (const growthDelta of growthRange) {
        const result = await this.calculateDCF(companyId, {
          wacc: baseWACC + waccDelta,
          growthStage1: baseGrowth + growthDelta
        });
        row.push(result.success ? result.intrinsicValue : null);
      }
      matrix.push(row);
    }

    return {
      waccValues: waccRange.map(d => baseWACC + d),
      growthValues: growthRange.map(d => baseGrowth + d),
      matrix
    };
  }
}

module.exports = DCFCalculator;
