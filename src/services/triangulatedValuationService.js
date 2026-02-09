/**
 * Triangulated Valuation Service
 *
 * Provides institutional-grade valuation analysis by triangulating three perspectives:
 * 1. Analyst Consensus - What Wall Street thinks (target prices)
 * 2. DCF Intrinsic Value - What fundamentals suggest (our model)
 * 3. Reverse DCF - What the market is pricing in (implied growth/WACC)
 *
 * Key Features:
 * - Alignment scoring to measure confidence
 * - Backward reasoning ("current price implies X% growth")
 * - Enhanced scenarios combining analyst and DCF perspectives
 * - "What must go right" sanity checks
 */

const DCFCalculator = require('./dcfCalculator');
const { getDatabaseAsync } = require('../lib/db');

class TriangulatedValuationService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.dcfCalculator = new DCFCalculator();
  }

  /**
   * Main entry point - calculate triangulated valuation
   */
  async calculateTriangulatedValuation(companyId, options = {}) {
    const { currentPrice, analystData, historicalGrowth } = options;

    try {
      // 1. Get current price if not provided
      const priceData = currentPrice
        ? { price: currentPrice }
        : await this.getCurrentPrice(companyId);

      if (!priceData?.price) {
        return { success: false, error: 'No price data available' };
      }

      // 2. Get analyst consensus
      const analystConsensus = analystData || await this.getAnalystConsensus(companyId);

      // 3. Run DCF calculation
      const dcfResult = await this.dcfCalculator.calculateDCF(companyId, {
        currentPrice: priceData.price
      });

      if (!dcfResult.success) {
        // Return partial results with analyst only if DCF fails
        return this.buildPartialResult(priceData.price, analystConsensus, dcfResult.errors);
      }

      // 4. Run Reverse DCF calculations in parallel (using enhanced version with interpretation)
      const [enhancedReverseDCF, impliedWACCResult] = await Promise.all([
        this.dcfCalculator.calculateEnhancedReverseDCF(companyId, priceData.price, {
          includeInterpretation: true,
          includeSensitivity: true
        }).catch(e => null),
        this.dcfCalculator.calculateImpliedWACC(companyId, priceData.price).catch(e => null)
      ]);

      // Extract basic implied growth result for backward compatibility
      const impliedGrowthResult = enhancedReverseDCF?.success ? {
        success: true,
        impliedGrowth: enhancedReverseDCF.impliedGrowth,
        impliedGrowthPct: enhancedReverseDCF.impliedGrowthPct,
        baseGrowth: enhancedReverseDCF.baseGrowth,
        baseGrowthPct: enhancedReverseDCF.baseGrowthPct,
        growthGap: enhancedReverseDCF.growthGap,
        growthGapPct: enhancedReverseDCF.growthGapPct
      } : null;

      // 5. Get historical growth for comparison
      const historicalGrowthData = historicalGrowth || dcfResult.assumptions?.historicalGrowth;

      // 6. Build perspectives
      const perspectives = this.buildPerspectives(
        priceData.price,
        analystConsensus,
        dcfResult,
        impliedGrowthResult,
        impliedWACCResult,
        historicalGrowthData
      );

      // 7. Triangulate and assess alignment
      const triangulation = this.triangulate(perspectives);

      // 8. Generate enhanced scenarios
      const enhancedScenarios = this.generateEnhancedScenarios(
        analystConsensus,
        dcfResult,
        priceData.price
      );

      // 9. Generate backward reasoning narrative
      const backwardReasoning = this.generateBackwardReasoning(
        perspectives.marketImplied,
        dcfResult,
        historicalGrowthData
      );

      // 10. Assess data quality
      const dataQuality = this.assessDataQuality(
        analystConsensus,
        dcfResult,
        impliedGrowthResult
      );

      return {
        success: true,
        symbol: dcfResult.company?.symbol,
        calculatedAt: new Date().toISOString(),
        currentPrice: priceData.price,

        perspectives,
        triangulation,
        enhancedScenarios,
        backwardReasoning,
        dataQuality,

        // Enhanced Reverse DCF with interpretation and sensitivity table
        // Note: We patch the interpretation to use the same historical value shown in the card
        reverseDCF: enhancedReverseDCF?.success ? {
          impliedGrowth: enhancedReverseDCF.impliedGrowth,
          impliedGrowthPct: enhancedReverseDCF.impliedGrowthPct,
          baseGrowth: enhancedReverseDCF.baseGrowth,
          baseGrowthPct: enhancedReverseDCF.baseGrowthPct,
          growthGap: enhancedReverseDCF.growthGap,
          growthGapPct: enhancedReverseDCF.growthGapPct,
          interpretation: this.patchInterpretationHistorical(
            enhancedReverseDCF.interpretation,
            perspectives.marketImplied.historicalGrowthRate
          ),
          sensitivityTable: enhancedReverseDCF.sensitivityTable,
          flags: enhancedReverseDCF.flags
        } : null,

        // Include raw data for frontend flexibility
        rawDCF: {
          intrinsicValue: dcfResult.intrinsicValue,
          scenarios: dcfResult.scenarios,
          assumptions: dcfResult.assumptions,
          sanityChecks: dcfResult.sanityChecks
        }
      };

    } catch (error) {
      console.error('[TriangulatedValuation] Error:', error);
      return {
        success: false,
        error: error.message,
        partialData: await this.getPartialData(companyId, options)
      };
    }
  }

  /**
   * Build the three valuation perspectives
   */
  buildPerspectives(currentPrice, analyst, dcf, impliedGrowth, impliedWACC, historicalGrowth) {
    // 1. Analyst Consensus perspective
    const analystConsensus = {
      targetLow: analyst?.target_low || null,
      targetMean: analyst?.target_mean || null,
      targetHigh: analyst?.target_high || null,
      analystCount: analyst?.number_of_analysts || 0,
      upsidePotential: analyst?.upside_potential || null,
      confidence: this.getAnalystConfidence(analyst?.number_of_analysts),
      dataSource: 'analyst_estimates'
    };

    // 2. DCF Intrinsic Value perspective
    const dcfIntrinsic = {
      baseCase: dcf.scenarios?.base?.intrinsicValuePerShare || dcf.intrinsicValue,
      bullCase: dcf.scenarios?.bull?.intrinsicValuePerShare || null,
      bearCase: dcf.scenarios?.bear?.intrinsicValuePerShare || null,
      weightedValue: dcf.scenarios?.weighted?.value || null,
      terminalValuePct: dcf.scenarios?.base?.terminalPct || null,
      assumptions: {
        growthStage1: dcf.assumptions?.growth?.stage1 || null,
        growthStage2: dcf.assumptions?.growth?.stage2 || null,
        growthStage3: dcf.assumptions?.growth?.stage3 || null,
        terminalGrowth: dcf.assumptions?.growth?.terminal || null,
        wacc: dcf.assumptions?.wacc || null
      },
      confidence: this.getDCFConfidence(dcf.sanityChecks),
      warnings: dcf.sanityChecks?.warnings || [],
      dataSource: 'dcf_calculator'
    };

    // 3. Market Implied perspective (Reverse DCF)
    const impliedGrowthRate = impliedGrowth?.impliedGrowth || null;

    // Get historical growth rate from PRISM trends or DCF assumptions
    // IMPORTANT: PRISM trends store values as PERCENTAGES (e.g., 6.27 for 6.27%)
    // while DCF assumptions store as DECIMALS (e.g., 0.0627 for 6.27%)
    let historicalGrowthRate = null;

    // Prefer DCF calculator's threeYearCAGR (already in decimal format)
    if (historicalGrowth?.threeYearCAGR !== null && historicalGrowth?.threeYearCAGR !== undefined) {
      historicalGrowthRate = historicalGrowth.threeYearCAGR;
    }
    // Fallback to PRISM trends average (in percentage format, needs conversion)
    else if (historicalGrowth?.average !== null && historicalGrowth?.average !== undefined) {
      // PRISM trends.revenue_growth_yoy.average is in percentage (e.g., 6.27 means 6.27%)
      // Convert to decimal for consistency (divide by 100)
      historicalGrowthRate = historicalGrowth.average / 100;
    }
    // Fallback to recent growth from DCF (already in decimal)
    else if (historicalGrowth?.recent !== null && historicalGrowth?.recent !== undefined) {
      historicalGrowthRate = historicalGrowth.recent;
    }

    const growthGap = (impliedGrowthRate !== null && historicalGrowthRate !== null)
      ? impliedGrowthRate - historicalGrowthRate
      : null;

    // Check if implied growth hit the binary search bounds (indicates extreme valuation)
    const impliedHitCeiling = impliedGrowthRate !== null && impliedGrowthRate >= 0.495;
    const impliedHitFloor = impliedGrowthRate !== null && impliedGrowthRate <= -0.095;

    const impliedWACCValue = impliedWACC?.impliedWACC || null;
    const estimatedWACC = dcf.assumptions?.wacc || null;
    const waccGap = (impliedWACCValue !== null && estimatedWACC !== null)
      ? impliedWACCValue - estimatedWACC
      : null;

    const marketImplied = {
      currentPrice,
      impliedGrowthRate,
      impliedGrowthPct: impliedGrowthRate !== null ? (impliedGrowthRate * 100).toFixed(1) : null,
      impliedHitCeiling,  // True if implied growth >= 50% (hit upper bound)
      impliedHitFloor,    // True if implied growth <= -10% (hit lower bound)
      impliedGrowthNote: impliedHitCeiling
        ? 'Implied growth at model ceiling (>50%) - stock may be extremely overvalued or model assumptions too conservative'
        : impliedHitFloor
          ? 'Implied growth at model floor (<-10%) - market pricing severe decline or model assumptions too aggressive'
          : null,
      historicalGrowthRate,
      historicalGrowthPct: historicalGrowthRate !== null ? (historicalGrowthRate * 100).toFixed(1) : null,
      growthGap,
      growthGapPct: growthGap !== null ? (growthGap * 100).toFixed(1) : null,
      growthInterpretation: this.interpretGrowthGap(impliedGrowthRate, historicalGrowthRate),

      impliedWACC: impliedWACCValue,
      impliedWACCPct: impliedWACCValue !== null ? (impliedWACCValue * 100).toFixed(1) : null,
      estimatedWACC,
      estimatedWACCPct: estimatedWACC !== null ? (estimatedWACC * 100).toFixed(1) : null,
      waccGap,
      waccGapPct: waccGap !== null ? (waccGap * 100).toFixed(1) : null,
      waccInterpretation: this.interpretWACCGap(impliedWACCValue, estimatedWACC),

      marketSentiment: this.determineMarketSentiment(growthGap, waccGap),
      confidence: impliedGrowth?.success ? 'HIGH' : 'LOW',
      dataSource: 'reverse_dcf'
    };

    return { analystConsensus, dcfIntrinsic, marketImplied };
  }

  /**
   * Triangulate the three perspectives and assess alignment
   */
  triangulate(perspectives) {
    const { analystConsensus, dcfIntrinsic, marketImplied } = perspectives;

    const dcfBase = dcfIntrinsic.baseCase;
    const analystMean = analystConsensus.targetMean;
    const currentPrice = marketImplied.currentPrice;

    // Calculate pairwise divergences
    const comparisons = {};

    // DCF vs Analyst
    if (dcfBase && analystMean) {
      const diff = dcfBase - analystMean;
      const diffPct = (diff / analystMean) * 100;
      comparisons.dcfVsAnalyst = {
        dcfBaseCase: dcfBase,
        analystMean,
        difference: diff,
        differencePct: diffPct.toFixed(1),
        verdict: diffPct > 10 ? 'DCF_HIGHER' : diffPct < -10 ? 'DCF_LOWER' : 'ALIGNED',
        interpretation: this.interpretDCFvsAnalyst(diffPct)
      };
    }

    // DCF vs Market (Current Price)
    if (dcfBase && currentPrice) {
      const upside = ((dcfBase / currentPrice) - 1) * 100;
      comparisons.dcfVsMarket = {
        dcfBaseCase: dcfBase,
        currentPrice,
        upside: upside.toFixed(1),
        verdict: upside > 20 ? 'UNDERVALUED' : upside < -20 ? 'OVERVALUED' : 'FAIRLY_VALUED',
        interpretation: this.interpretDCFvsMarket(upside)
      };
    }

    // Market vs Analyst
    if (analystMean && currentPrice) {
      const upside = ((analystMean / currentPrice) - 1) * 100;
      comparisons.marketVsAnalyst = {
        currentPrice,
        analystMean,
        upside: upside.toFixed(1),
        verdict: upside > 15 ? 'SIGNIFICANT_UPSIDE' : upside > 5 ? 'MODEST_UPSIDE' : upside < -5 ? 'DOWNSIDE' : 'AT_TARGET'
      };
    }

    // Calculate alignment score (0-100)
    const alignmentScore = this.calculateAlignmentScore(perspectives, comparisons);
    const alignmentLevel = alignmentScore >= 80 ? 'STRONG'
      : alignmentScore >= 50 ? 'PARTIAL'
      : 'DIVERGENT';

    // Generate key insight
    const keyInsight = this.generateKeyInsight(perspectives, comparisons, alignmentLevel);

    return {
      alignment: {
        level: alignmentLevel,
        score: alignmentScore,
        interpretation: this.getAlignmentInterpretation(alignmentLevel)
      },
      comparisons,
      keyInsight,
      confidenceFactors: this.getConfidenceFactors(perspectives)
    };
  }

  /**
   * Generate enhanced scenarios blending analyst and DCF
   */
  generateEnhancedScenarios(analyst, dcf, currentPrice) {
    const dcfBull = dcf.scenarios?.bull?.intrinsicValuePerShare;
    const dcfBase = dcf.scenarios?.base?.intrinsicValuePerShare || dcf.intrinsicValue;
    const dcfBear = dcf.scenarios?.bear?.intrinsicValuePerShare;

    const analystHigh = analyst?.target_high;
    const analystMean = analyst?.target_mean;
    const analystLow = analyst?.target_low;

    // Bull: Take higher of analyst high vs DCF bull (optimistic but grounded)
    const bullPrice = this.blendScenarios(analystHigh, dcfBull, 'bull');

    // Base: Weighted average of analyst mean and DCF base
    const basePrice = this.blendScenarios(analystMean, dcfBase, 'base');

    // Bear: Take lower of analyst low vs DCF bear (conservative)
    const bearPrice = this.blendScenarios(analystLow, dcfBear, 'bear');

    const scenarios = {
      bull: {
        price: bullPrice,
        probability: 0.20,
        upside: currentPrice ? (((bullPrice / currentPrice) - 1) * 100).toFixed(1) : null,
        sources: {
          analystHigh,
          dcfBull,
          selected: this.getScenarioSource(analystHigh, dcfBull, bullPrice)
        },
        assumptions: [
          'Growth exceeds expectations',
          'Margin expansion from operating leverage',
          'Multiple expansion as market re-rates',
          'Favorable macro environment'
        ]
      },
      base: {
        price: basePrice,
        probability: 0.55,
        upside: currentPrice ? (((basePrice / currentPrice) - 1) * 100).toFixed(1) : null,
        sources: {
          analystMean,
          dcfBase,
          selected: 'weighted_average'
        },
        assumptions: [
          'Continue current growth trajectory',
          'Margins stable at current levels',
          'Current valuation multiple maintained',
          'Normal market conditions'
        ]
      },
      bear: {
        price: bearPrice,
        probability: 0.25,
        upside: currentPrice ? (((bearPrice / currentPrice) - 1) * 100).toFixed(1) : null,
        sources: {
          analystLow,
          dcfBear,
          selected: this.getScenarioSource(analystLow, dcfBear, bearPrice, true)
        },
        assumptions: [
          'Growth decelerates significantly',
          'Margin compression from competition',
          'Multiple contraction',
          'Adverse macro conditions'
        ]
      }
    };

    // Calculate expected value (probability-weighted)
    const expectedValue = (
      scenarios.bull.price * scenarios.bull.probability +
      scenarios.base.price * scenarios.base.probability +
      scenarios.bear.price * scenarios.bear.probability
    );

    scenarios.expectedValue = {
      price: Math.round(expectedValue * 100) / 100,
      upside: currentPrice ? (((expectedValue / currentPrice) - 1) * 100).toFixed(1) : null,
      calculation: `${(scenarios.bull.probability * 100).toFixed(0)}% × $${scenarios.bull.price?.toFixed(0)} + ${(scenarios.base.probability * 100).toFixed(0)}% × $${scenarios.base.price?.toFixed(0)} + ${(scenarios.bear.probability * 100).toFixed(0)}% × $${scenarios.bear.price?.toFixed(0)}`
    };

    // === PURE DCF SCENARIOS ===
    // These use the standard 25%-50%-25% probability weighting (same as DCF tab)
    // and pure DCF values without analyst blending
    const pureDCFWeightedValue = dcfBull && dcfBase && dcfBear
      ? (dcfBull * 0.25 + dcfBase * 0.50 + dcfBear * 0.25)
      : dcfBase; // Fallback to base if scenarios unavailable

    scenarios.pureDCF = {
      bull: {
        price: dcfBull,
        probability: 0.25,
        upside: currentPrice && dcfBull ? (((dcfBull / currentPrice) - 1) * 100).toFixed(1) : null
      },
      base: {
        price: dcfBase,
        probability: 0.50,
        upside: currentPrice && dcfBase ? (((dcfBase / currentPrice) - 1) * 100).toFixed(1) : null
      },
      bear: {
        price: dcfBear,
        probability: 0.25,
        upside: currentPrice && dcfBear ? (((dcfBear / currentPrice) - 1) * 100).toFixed(1) : null
      },
      weightedTarget: pureDCFWeightedValue ? Math.round(pureDCFWeightedValue * 100) / 100 : null,
      weightedUpside: currentPrice && pureDCFWeightedValue
        ? (((pureDCFWeightedValue / currentPrice) - 1) * 100).toFixed(1)
        : null,
      calculation: dcfBull && dcfBase && dcfBear
        ? `25% × $${dcfBull.toFixed(0)} + 50% × $${dcfBase.toFixed(0)} + 25% × $${dcfBear.toFixed(0)}`
        : null,
      note: 'Pure DCF values with standard 25%/50%/25% probability weighting (matches DCF tab)'
    };

    return scenarios;
  }

  /**
   * Generate backward reasoning narrative
   */
  generateBackwardReasoning(marketImplied, dcf, historicalGrowth) {
    const { impliedGrowthRate, historicalGrowthRate, impliedWACC, estimatedWACC } = marketImplied;

    // Build headline
    let headline = '';
    if (impliedGrowthRate !== null && historicalGrowthRate !== null) {
      const impliedPct = (impliedGrowthRate * 100).toFixed(0);
      const historicalPct = (historicalGrowthRate * 100).toFixed(0);
      headline = `Current price implies ${impliedPct}% annual growth for 10 years - historical was ${historicalPct}%`;
    } else if (impliedGrowthRate !== null) {
      headline = `Current price implies ${(impliedGrowthRate * 100).toFixed(0)}% annual growth for 10 years`;
    } else {
      headline = 'Unable to calculate implied growth rate';
    }

    // Build market assumptions
    const marketAssumptions = [];

    if (impliedGrowthRate !== null) {
      marketAssumptions.push(
        `Market is pricing in ${(impliedGrowthRate * 100).toFixed(1)}% annual revenue growth for the next decade`
      );
    }

    if (impliedGrowthRate !== null && historicalGrowthRate !== null) {
      const gap = impliedGrowthRate - historicalGrowthRate;
      if (gap > 0.05) {
        marketAssumptions.push(
          `This is ${(gap * 100).toFixed(0)} percentage points above the company's historical average`
        );
      } else if (gap < -0.05) {
        marketAssumptions.push(
          `This is ${(Math.abs(gap) * 100).toFixed(0)} percentage points below the company's historical average`
        );
      }
    }

    if (impliedWACC !== null && estimatedWACC !== null) {
      const waccGap = impliedWACC - estimatedWACC;
      if (Math.abs(waccGap) > 0.01) {
        marketAssumptions.push(
          waccGap < 0
            ? `Market accepts a ${(Math.abs(waccGap) * 100).toFixed(0)}bps lower required return than our estimate`
            : `Market demands a ${(waccGap * 100).toFixed(0)}bps higher required return than our estimate`
        );
      }
    }

    // Sanity check
    const sanityCheck = this.performSanityCheck(impliedGrowthRate, historicalGrowthRate, impliedWACC);

    // What must go right
    const whatMustGoRight = this.generateWhatMustGoRight(marketImplied, dcf);

    return {
      headline,
      marketAssumptions,
      sanityCheck,
      whatMustGoRight
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Get current price from database
   */
  async getCurrentPrice(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT p.close as price, c.shares_outstanding
      FROM price_data p
      JOIN companies c ON c.id = p.company_id
      WHERE p.company_id = $1
      ORDER BY p.date DESC
      LIMIT 1
    `, [companyId]);

    return result.rows[0] || null;
  }

  /**
   * Get analyst consensus from database
   */
  async getAnalystConsensus(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        target_low, target_mean, target_high,
        number_of_analysts, upside_potential,
        consensus_rating
      FROM analyst_estimates
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [companyId]);

    return result.rows[0] || {};
  }

  /**
   * Blend analyst and DCF scenarios
   */
  blendScenarios(analystValue, dcfValue, scenarioType) {
    if (!analystValue && !dcfValue) return null;
    if (!analystValue) return dcfValue;
    if (!dcfValue) return analystValue;

    switch (scenarioType) {
      case 'bull':
        // Take higher value for bull case
        return Math.max(analystValue, dcfValue);
      case 'bear':
        // Take lower value for bear case
        return Math.min(analystValue, dcfValue);
      case 'base':
      default:
        // Weighted average: 60% DCF, 40% Analyst (favor fundamentals)
        return Math.round((dcfValue * 0.6 + analystValue * 0.4) * 100) / 100;
    }
  }

  /**
   * Get scenario source description
   */
  getScenarioSource(analystValue, dcfValue, selectedValue, isConservative = false) {
    if (!analystValue && !dcfValue) return 'unavailable';
    if (!analystValue) return 'dcf_only';
    if (!dcfValue) return 'analyst_only';

    if (Math.abs(selectedValue - analystValue) < 0.01) return 'analyst';
    if (Math.abs(selectedValue - dcfValue) < 0.01) return 'dcf';
    return 'weighted_average';
  }

  /**
   * Calculate alignment score (0-100)
   */
  calculateAlignmentScore(perspectives, comparisons) {
    let score = 100;

    const { dcfIntrinsic, analystConsensus, marketImplied } = perspectives;
    const dcf = dcfIntrinsic.baseCase;
    const analyst = analystConsensus.targetMean;
    const current = marketImplied.currentPrice;

    // Penalize DCF vs Analyst divergence
    if (dcf && analyst) {
      const divergence = Math.abs((dcf - analyst) / analyst);
      if (divergence > 0.30) score -= 25;
      else if (divergence > 0.20) score -= 15;
      else if (divergence > 0.10) score -= 5;
    }

    // Penalize DCF vs Market divergence
    if (dcf && current) {
      const divergence = Math.abs((dcf - current) / current);
      if (divergence > 0.40) score -= 20;
      else if (divergence > 0.25) score -= 10;
    }

    // Penalize implied growth vs historical divergence
    const growthGap = marketImplied.growthGap;
    if (growthGap !== null) {
      if (Math.abs(growthGap) > 0.10) score -= 20;
      else if (Math.abs(growthGap) > 0.05) score -= 10;
    }

    // Bonus for multiple sources agreeing
    if (comparisons.dcfVsAnalyst?.verdict === 'ALIGNED' &&
        comparisons.dcfVsMarket?.verdict === 'FAIRLY_VALUED') {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Interpret growth gap between implied and historical
   */
  interpretGrowthGap(impliedGrowth, historicalGrowth) {
    if (impliedGrowth === null || historicalGrowth === null) {
      return 'Unable to compare implied vs historical growth';
    }

    const gap = impliedGrowth - historicalGrowth;
    const impliedPct = (impliedGrowth * 100).toFixed(0);
    const historicalPct = (historicalGrowth * 100).toFixed(0);

    // Special handling for negative implied growth
    if (impliedGrowth < -0.05) {
      return `Market pricing significant decline (${impliedPct}%) vs historical ${historicalPct}% - investigate fundamentals`;
    } else if (impliedGrowth < 0) {
      return `Market pricing decline (${impliedPct}%) vs historical ${historicalPct}% - bearish sentiment or distress`;
    }

    // Standard growth gap interpretation
    if (gap > 0.10) {
      return `Market expects significant acceleration: ${impliedPct}% vs ${historicalPct}% historical - very optimistic`;
    } else if (gap > 0.05) {
      return `Market expects growth acceleration: ${impliedPct}% vs ${historicalPct}% historical - moderately optimistic`;
    } else if (gap > -0.03) {
      return `Market pricing roughly in-line with historical: ${impliedPct}% vs ${historicalPct}%`;
    } else if (gap > -0.10) {
      return `Market expects growth deceleration: ${impliedPct}% vs ${historicalPct}% historical - pessimistic`;
    } else {
      return `Market expects major slowdown: ${impliedPct}% vs ${historicalPct}% historical - very pessimistic`;
    }
  }

  /**
   * Interpret WACC gap
   */
  interpretWACCGap(impliedWACC, estimatedWACC) {
    if (impliedWACC === null || estimatedWACC === null) {
      return 'Unable to compare implied vs estimated discount rate';
    }

    const gap = impliedWACC - estimatedWACC;

    if (gap < -0.02) {
      return 'Market accepts lower required return - stock may be overvalued';
    } else if (gap < -0.01) {
      return 'Market accepts slightly lower required return';
    } else if (gap > 0.02) {
      return 'Market demands higher required return - stock may be undervalued';
    } else if (gap > 0.01) {
      return 'Market demands slightly higher required return';
    } else {
      return 'Market discount rate aligned with our estimate';
    }
  }

  /**
   * Determine market sentiment based on gaps
   */
  determineMarketSentiment(growthGap, waccGap) {
    if (growthGap === null && waccGap === null) return 'UNKNOWN';

    let optimismScore = 0;

    // Growth expectations
    if (growthGap !== null) {
      if (growthGap > 0.05) optimismScore += 2;
      else if (growthGap > 0.02) optimismScore += 1;
      else if (growthGap < -0.03) optimismScore -= 2;
      else if (growthGap < -0.01) optimismScore -= 1;
    }

    // WACC expectations (lower WACC = more optimistic)
    if (waccGap !== null) {
      if (waccGap < -0.02) optimismScore += 1;
      else if (waccGap > 0.02) optimismScore -= 1;
    }

    if (optimismScore >= 2) return 'OPTIMISTIC';
    if (optimismScore <= -2) return 'PESSIMISTIC';
    return 'ALIGNED';
  }

  /**
   * Interpret DCF vs Analyst comparison
   */
  interpretDCFvsAnalyst(diffPct) {
    if (diffPct > 20) {
      return 'Fundamentals suggest significantly more upside than analyst consensus';
    } else if (diffPct > 10) {
      return 'Fundamentals suggest more upside than analyst consensus';
    } else if (diffPct < -20) {
      return 'Fundamentals suggest less upside than analyst consensus - analysts may be too optimistic';
    } else if (diffPct < -10) {
      return 'Fundamentals suggest less upside than analyst consensus';
    } else {
      return 'DCF and analyst targets roughly aligned';
    }
  }

  /**
   * Interpret DCF vs Market comparison
   */
  interpretDCFvsMarket(upside) {
    if (upside > 30) {
      return 'Significantly undervalued based on fundamentals - potential opportunity';
    } else if (upside > 15) {
      return 'Moderately undervalued based on fundamentals';
    } else if (upside < -30) {
      return 'Significantly overvalued based on fundamentals - caution warranted';
    } else if (upside < -15) {
      return 'Moderately overvalued based on fundamentals';
    } else {
      return 'Trading near fair value based on fundamentals';
    }
  }

  /**
   * Get alignment interpretation
   */
  getAlignmentInterpretation(level) {
    switch (level) {
      case 'STRONG':
        return 'All valuation methods converge - high conviction in fair value estimate';
      case 'PARTIAL':
        return 'Some divergence between methods - moderate conviction, consider multiple scenarios';
      case 'DIVERGENT':
        return 'Significant disagreement between methods - low conviction, deeper analysis needed';
      default:
        return 'Unable to assess alignment';
    }
  }

  /**
   * Patch interpretation to use consistent historical value
   * The DCF calculator may use a different historical source than what we show in the card
   */
  patchInterpretationHistorical(interpretation, correctHistorical) {
    if (!interpretation || correctHistorical === null || correctHistorical === undefined) {
      return interpretation;
    }

    // Deep clone to avoid mutating original
    const patched = JSON.parse(JSON.stringify(interpretation));

    // Update metrics
    if (patched.metrics) {
      patched.metrics.historicalGrowth = correctHistorical;
    }

    // Update text references to historical in details
    // The interpretation text contains "(X.X%)" historical values that need updating
    const oldHistPct = patched.metrics?.historicalGrowth
      ? (patched.metrics.historicalGrowth * 100).toFixed(1)
      : null;
    const newHistPct = (correctHistorical * 100).toFixed(1);

    if (patched.details && Array.isArray(patched.details)) {
      patched.details = patched.details.map(detail => {
        // Replace historical references in the text
        // Pattern: "historical (X.X%)" -> "historical (newPct%)"
        return detail.replace(
          /historical \([\d.-]+%\)/g,
          `historical (${newHistPct}%)`
        );
      });

      // Also update summary if it's the first detail
      if (patched.summary) {
        patched.summary = patched.summary.replace(
          /historical \([\d.-]+%\)/g,
          `historical (${newHistPct}%)`
        );
      }
    }

    return patched;
  }

  /**
   * Generate key insight based on triangulation
   */
  generateKeyInsight(perspectives, comparisons, alignmentLevel) {
    const { marketImplied, dcfIntrinsic, analystConsensus } = perspectives;

    if (alignmentLevel === 'STRONG') {
      return `All three valuation perspectives align around $${dcfIntrinsic.baseCase?.toFixed(0)}-${analystConsensus.targetMean?.toFixed(0)}, suggesting high confidence in the fair value range.`;
    }

    const parts = [];

    // Market sentiment insight
    if (marketImplied.marketSentiment === 'OPTIMISTIC') {
      parts.push(`Market is pricing in aggressive growth assumptions (${marketImplied.impliedGrowthPct}% CAGR)`);
      if (marketImplied.historicalGrowthPct) {
        parts.push(`that exceed historical performance (${marketImplied.historicalGrowthPct}%)`);
      }
    } else if (marketImplied.marketSentiment === 'PESSIMISTIC') {
      parts.push('Market appears pessimistic relative to both fundamentals and analyst views');
    }

    // DCF vs Analyst insight
    if (comparisons.dcfVsAnalyst) {
      if (comparisons.dcfVsAnalyst.verdict === 'DCF_HIGHER') {
        parts.push('Our DCF model suggests more upside than analyst consensus');
      } else if (comparisons.dcfVsAnalyst.verdict === 'DCF_LOWER') {
        parts.push('Analyst consensus may be overly optimistic compared to fundamentals');
      }
    }

    return parts.join('. ') + '.';
  }

  /**
   * Get confidence factors breakdown
   */
  getConfidenceFactors(perspectives) {
    return [
      {
        factor: 'DCF data quality',
        score: perspectives.dcfIntrinsic.confidence === 'HIGH' ? 90 : perspectives.dcfIntrinsic.confidence === 'MEDIUM' ? 70 : 50,
        weight: 0.4
      },
      {
        factor: 'Analyst coverage',
        score: perspectives.analystConsensus.analystCount >= 20 ? 95 : perspectives.analystConsensus.analystCount >= 10 ? 80 : perspectives.analystConsensus.analystCount >= 5 ? 60 : 30,
        weight: 0.3
      },
      {
        factor: 'Reverse DCF reliability',
        score: perspectives.marketImplied.confidence === 'HIGH' ? 85 : 50,
        weight: 0.2
      },
      {
        factor: 'Method alignment',
        score: 70, // Will be updated based on actual alignment
        weight: 0.1
      }
    ];
  }

  /**
   * Perform sanity check on implied values
   * Flags unusual cases like negative growth or large gaps vs historical
   */
  performSanityCheck(impliedGrowth, historicalGrowth, impliedWACC) {
    const issues = [];
    const flags = [];  // Special flags for UI display
    let riskLevel = 'LOW';

    if (impliedGrowth !== null) {
      // Check for negative implied growth - market may be pricing distress or deep undervaluation
      if (impliedGrowth < 0) {
        if (impliedGrowth < -0.05) {
          issues.push(`Negative implied growth (${(impliedGrowth * 100).toFixed(1)}%) - market pricing significant decline or distress`);
          riskLevel = 'HIGH';
          flags.push('MANUAL_REVIEW_REQUIRED');
          flags.push('NEGATIVE_GROWTH');
        } else {
          issues.push(`Negative implied growth (${(impliedGrowth * 100).toFixed(1)}%) - potential deep undervaluation or secular decline`);
          riskLevel = 'MEDIUM';
          flags.push('REQUIRES_ATTENTION');
          flags.push('NEGATIVE_GROWTH');
        }
      }
      // Check for very high implied growth
      else if (impliedGrowth > 0.25) {
        issues.push('Implied growth rate >25% is rarely sustainable long-term');
        riskLevel = 'HIGH';
        flags.push('AGGRESSIVE_ASSUMPTIONS');
      } else if (impliedGrowth > 0.15) {
        issues.push('Implied growth rate >15% requires exceptional execution');
        riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel;
      }

      // Check for large gap vs historical (both directions)
      if (historicalGrowth !== null) {
        const gap = impliedGrowth - historicalGrowth;

        if (impliedGrowth > historicalGrowth * 2 && impliedGrowth > 0) {
          issues.push('Implied growth is >2x historical - very aggressive assumption');
          riskLevel = 'HIGH';
          flags.push('GROWTH_DISCONNECT');
        } else if (gap < -0.15) {
          // Implied growth significantly below historical (>15pp below)
          issues.push(`Implied growth ${(impliedGrowth * 100).toFixed(1)}% vs historical ${(historicalGrowth * 100).toFixed(1)}% - market expects significant deceleration`);
          riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel;
          flags.push('GROWTH_DISCONNECT');
        } else if (impliedGrowth < 0 && historicalGrowth > 0.05) {
          // Negative implied vs positive historical - major red flag
          issues.push(`Market pricing decline (${(impliedGrowth * 100).toFixed(1)}%) despite historical growth (${(historicalGrowth * 100).toFixed(1)}%)`);
          riskLevel = 'HIGH';
          flags.push('MANUAL_REVIEW_REQUIRED');
          flags.push('GROWTH_DISCONNECT');
        }
      }
    }

    if (impliedWACC !== null && impliedWACC < 0.05) {
      issues.push('Implied WACC <5% suggests market accepting very low returns');
      riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : riskLevel;
    }

    return {
      isReasonable: issues.length === 0,
      reason: issues.length > 0 ? issues.join('; ') : 'Implied assumptions are within reasonable bounds',
      riskLevel,
      issues,
      flags,  // Array of special flags for UI handling
      requiresManualReview: flags.includes('MANUAL_REVIEW_REQUIRED')
    };
  }

  /**
   * Generate "what must go right" list (or "what's driving pessimism" for negative implied growth)
   */
  generateWhatMustGoRight(marketImplied, dcf) {
    const items = [];
    const impliedGrowth = marketImplied.impliedGrowthRate;

    // Handle negative implied growth - explain what market fears
    if (impliedGrowth !== null && impliedGrowth < 0) {
      items.push('Market may be pricing structural business decline or disruption risk');
      items.push('Investigate if earnings quality or competitive position has deteriorated');
      if (impliedGrowth < -0.05) {
        items.push('Significant negative growth suggests distress, secular decline, or deep undervaluation');
      }
      items.push('For value opportunity: verify business fundamentals are intact');
      items.push('Check for temporary headwinds (macro, one-time charges) vs permanent impairment');
      return items.slice(0, 5);
    }

    // Standard "what must go right" for positive growth scenarios
    if (impliedGrowth > 0.10) {
      items.push('Revenue growth must accelerate or sustain above historical rates');
    }

    if (impliedGrowth > 0.15) {
      items.push('New products or markets must drive significant expansion');
    }

    if (marketImplied.impliedWACC && marketImplied.estimatedWACC &&
        marketImplied.impliedWACC < marketImplied.estimatedWACC - 0.01) {
      items.push('Risk premium must remain compressed (low volatility environment)');
    }

    // Default items
    if (items.length < 3) {
      items.push('Competitive position must be maintained or strengthened');
      items.push('Margin structure must prove durable');
      items.push('Capital allocation must remain disciplined');
    }

    return items.slice(0, 5);
  }

  /**
   * Get analyst confidence based on coverage
   */
  getAnalystConfidence(analystCount) {
    if (!analystCount) return 'LOW';
    if (analystCount >= 20) return 'HIGH';
    if (analystCount >= 10) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get DCF confidence based on sanity checks
   */
  getDCFConfidence(sanityChecks) {
    if (!sanityChecks) return 'LOW';

    const warningCount = sanityChecks.warningCount || 0;
    const health = sanityChecks.overallHealth;

    if (health === 'good' && warningCount <= 1) return 'HIGH';
    if (health === 'caution' || warningCount <= 3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Assess overall data quality
   */
  assessDataQuality(analyst, dcf, impliedGrowth) {
    const factors = [];

    // DCF quality
    const dcfQuality = dcf.success && dcf.intrinsicValue ? 'HIGH' : 'LOW';
    factors.push({ source: 'DCF Model', quality: dcfQuality });

    // Analyst quality
    const analystQuality = analyst?.number_of_analysts >= 10 ? 'HIGH' : analyst?.number_of_analysts >= 5 ? 'MEDIUM' : 'LOW';
    factors.push({ source: 'Analyst Coverage', quality: analystQuality });

    // Reverse DCF quality
    const reverseDCFQuality = impliedGrowth?.success ? 'HIGH' : 'LOW';
    factors.push({ source: 'Reverse DCF', quality: reverseDCFQuality });

    // Calculate overall
    const qualityScores = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const avgScore = factors.reduce((sum, f) => sum + qualityScores[f.quality], 0) / factors.length;

    const overall = avgScore >= 2.5 ? 'HIGH' : avgScore >= 1.5 ? 'MEDIUM' : 'LOW';

    return {
      overall,
      factors,
      warnings: dcf.sanityChecks?.warnings || []
    };
  }

  /**
   * Build partial result when DCF fails
   */
  buildPartialResult(currentPrice, analystConsensus, errors) {
    return {
      success: false,
      partial: true,
      currentPrice,
      perspectives: {
        analystConsensus: {
          targetLow: analystConsensus?.target_low,
          targetMean: analystConsensus?.target_mean,
          targetHigh: analystConsensus?.target_high,
          analystCount: analystConsensus?.number_of_analysts,
          confidence: this.getAnalystConfidence(analystConsensus?.number_of_analysts)
        },
        dcfIntrinsic: null,
        marketImplied: null
      },
      errors,
      message: 'DCF calculation failed - showing analyst consensus only'
    };
  }

  /**
   * Get partial data for error cases
   */
  async getPartialData(companyId, options) {
    try {
      const [price, analyst] = await Promise.all([
        this.getCurrentPrice(companyId),
        this.getAnalystConsensus(companyId)
      ]);
      return { price, analyst };
    } catch (e) {
      return null;
    }
  }
}

module.exports = TriangulatedValuationService;
