// src/api/routes/prism.js
// API routes for PRISM Investment Reports

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const SECFilingParser = require('../../services/secFilingParser');
const PRISMReportGeneratorV2 = require('../../services/prismReportGeneratorV2');
const { requireAuth } = require('../../middleware/auth');
const { requireFeature } = require('../../middleware/subscription');

const secParser = new SECFilingParser();
const reportGenerator = new PRISMReportGeneratorV2();

/**
 * GET /api/prism/:symbol/report
 * Get full PRISM report for a company
 */
router.get('/:symbol/report', requireAuth, requireFeature('prism_reports'), async (req, res) => {
  const { symbol } = req.params;
  const { refresh } = req.query;

  try {
    const symbolUpper = symbol.toUpperCase();

    // Check for cached report
    if (!refresh) {
      const cachedReport = await getCachedReport(symbolUpper);
      if (cachedReport && !isReportExpired(cachedReport)) {
        return res.json({
          success: true,
          fromCache: true,
          report: formatReport(cachedReport)
        });
      }
    }

    // Get company info
    const database = await getDatabaseAsync();
    const companyResult = await database.query('SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)', [symbolUpper]);
    const company = companyResult.rows[0];
    if (!company) {
      return res.status(404).json({
        success: false,
        error: `Company ${symbolUpper} not found`
      });
    }

    // Check if we have enough data to generate a report
    const hasData = await checkDataAvailability(company.id, symbolUpper);

    if (!hasData.hasMinimumData) {
      return res.json({
        success: true,
        available: false,
        message: 'Insufficient data for PRISM report',
        missingData: hasData.missing,
        symbol: symbolUpper
      });
    }

    // Generate report if we have enough data
    try {
      const report = await reportGenerator.generateReport(symbolUpper, {
        useAI: true,
        useV2: true,
        forceRefresh: refresh === 'true'
      });
      return res.json({
        success: true,
        fromCache: false,
        report: formatV2Report(report)
      });
    } catch (genError) {
      console.error('Error generating report:', genError);
      return res.json({
        success: true,
        available: true,
        generationPending: true,
        message: 'Report generation failed: ' + genError.message,
        symbol: symbolUpper,
        dataAvailable: hasData
      });
    }

  } catch (error) {
    console.error('Error getting PRISM report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prism/:symbol/summary
 * Get executive summary only (faster endpoint)
 */
router.get('/:symbol/summary', async (req, res) => {
  const { symbol } = req.params;

  try {
    const symbolUpper = symbol.toUpperCase();
    const cachedReport = await getCachedReport(symbolUpper);

    if (cachedReport) {
      return res.json({
        success: true,
        summary: {
          symbol: symbolUpper,
          overallScore: cachedReport.overall_score,
          confidenceLevel: cachedReport.confidence_level,
          investmentThesis: cachedReport.investment_thesis,
          scenarios: {
            bull: { price: cachedReport.bull_case_price, probability: cachedReport.bull_probability },
            base: { price: cachedReport.base_case_price, probability: cachedReport.base_probability },
            bear: { price: cachedReport.bear_case_price, probability: cachedReport.bear_probability }
          },
          generatedAt: cachedReport.generated_at
        }
      });
    }

    return res.json({
      success: true,
      available: false,
      message: 'No PRISM report available for this symbol'
    });

  } catch (error) {
    console.error('Error getting PRISM summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prism/:symbol/scorecard
 * Get the 12-factor Business Scorecard
 */
router.get('/:symbol/scorecard', async (req, res) => {
  const { symbol } = req.params;

  try {
    const database = await getDatabaseAsync();
    const symbolUpper = symbol.toUpperCase();

    // Get latest scorecard from prism_scores
    const scorecardResult = await database.query(`
      SELECT * FROM prism_scores
      WHERE symbol = ?
      ORDER BY scored_at DESC
      LIMIT 1
    `, [symbolUpper]);
    const scorecard = scorecardResult.rows[0];

    if (scorecard) {
      return res.json({
        success: true,
        scorecard: formatScorecard(scorecard)
      });
    }

    return res.json({
      success: true,
      available: false,
      message: 'No scorecard available for this symbol'
    });

  } catch (error) {
    console.error('Error getting PRISM scorecard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prism/:symbol/sec-filings
 * Get parsed SEC filings for a company
 */
router.get('/:symbol/sec-filings', async (req, res) => {
  const { symbol } = req.params;
  const { formType, refresh } = req.query;

  try {
    const database = await getDatabaseAsync();
    const symbolUpper = symbol.toUpperCase();

    // Get cached filings
    const filingsResult = await database.query(`
      SELECT * FROM sec_filings
      WHERE symbol = ?
      ${formType ? 'AND form_type = ?' : ''}
      ORDER BY filing_date DESC
    `, formType ? [symbolUpper, formType] : [symbolUpper]);
    const filings = filingsResult.rows;

    // If no filings and refresh requested, try to parse
    if (filings.length === 0 && refresh === 'true') {
      console.log(`Fetching SEC filings for ${symbolUpper}...`);
      const parsed = await secParser.parseAndCache10K(symbolUpper, true);

      if (parsed) {
        return res.json({
          success: true,
          filings: [formatSecFiling(parsed)],
          freshlyParsed: true
        });
      }
    }

    return res.json({
      success: true,
      filings: filings.map(formatSecFiling),
      count: filings.length
    });

  } catch (error) {
    console.error('Error getting SEC filings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prism/:symbol/refresh
 * Force regeneration of PRISM report
 */
router.post('/:symbol/refresh', requireAuth, requireFeature('prism_reports'), async (req, res) => {
  const { symbol } = req.params;

  try {
    const symbolUpper = symbol.toUpperCase();

    // Verify company exists
    const database = await getDatabaseAsync();
    const companyResult = await database.query('SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)', [symbolUpper]);
    const company = companyResult.rows[0];
    if (!company) {
      return res.status(404).json({
        success: false,
        error: `Company ${symbolUpper} not found`
      });
    }

    // First, refresh SEC filings
    console.log(`Refreshing SEC filings for ${symbolUpper}...`);
    const secResult = await secParser.parseAndCache10K(symbolUpper, true);

    // Return status (full AI generation not yet implemented)
    return res.json({
      success: true,
      message: 'SEC filings refreshed. Full report generation pending implementation.',
      secFilingRefreshed: !!secResult,
      symbol: symbolUpper
    });

  } catch (error) {
    console.error('Error refreshing PRISM report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prism/coverage
 * List all companies with pre-generated PRISM reports
 */
router.get('/coverage', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { index, minScore } = req.query;

    let query = `
      SELECT
        p.symbol,
        c.name,
        c.sector,
        p.overall_score,
        p.confidence_level,
        p.generated_at,
        p.bull_case_price,
        p.base_case_price,
        p.bear_case_price
      FROM prism_reports p
      JOIN companies c ON p.company_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (minScore) {
      query += ' AND p.overall_score >= ?';
      params.push(parseFloat(minScore));
    }

    query += ' ORDER BY p.overall_score DESC, p.generated_at DESC';

    const reportsResult = await database.query(query, params);
    const reports = reportsResult.rows;

    // Also get SEC filings coverage
    const secCoverageResult = await database.query(`
      SELECT COUNT(DISTINCT symbol) as count FROM sec_filings WHERE form_type = '10-K'
    `, []);
    const secCoverage = secCoverageResult.rows[0];

    return res.json({
      success: true,
      coverage: {
        prismReports: reports.length,
        secFilings: secCoverage.count
      },
      reports: reports.map(r => ({
        symbol: r.symbol,
        name: r.name,
        sector: r.sector,
        overallScore: r.overall_score,
        confidenceLevel: r.confidence_level,
        generatedAt: r.generated_at,
        scenarios: {
          bull: r.bull_case_price,
          base: r.base_case_price,
          bear: r.bear_case_price
        }
      }))
    });

  } catch (error) {
    console.error('Error getting PRISM coverage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prism/:symbol/score-history
 * Get historical PRISM scores for trending
 */
router.get('/:symbol/score-history', async (req, res) => {
  const { symbol } = req.params;
  const { limit = 30 } = req.query;

  try {
    const database = await getDatabaseAsync();
    const symbolUpper = symbol.toUpperCase();

    const historyResult = await database.query(`
      SELECT
        scored_at,
        overall_score,
        growth_momentum_score,
        profitability_score,
        cash_generation_score,
        balance_sheet_score,
        competitive_strength_score,
        moat_durability_score
      FROM prism_scores
      WHERE symbol = ?
      ORDER BY scored_at DESC
      LIMIT ?
    `, [symbolUpper, parseInt(limit, 10)]);
    const history = historyResult.rows;

    return res.json({
      success: true,
      symbol: symbolUpper,
      history: history.map(h => ({
        date: h.scored_at,
        overallScore: h.overall_score,
        factors: {
          growthMomentum: h.growth_momentum_score,
          profitability: h.profitability_score,
          cashGeneration: h.cash_generation_score,
          balanceSheet: h.balance_sheet_score,
          competitiveStrength: h.competitive_strength_score,
          moatDurability: h.moat_durability_score
        }
      }))
    });

  } catch (error) {
    console.error('Error getting PRISM score history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Helper Functions
// ============================================

async function getCachedReport(symbol) {
  try {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM prism_reports WHERE symbol = ?
    `, [symbol]);
    return result.rows[0];
  } catch (error) {
    return null;
  }
}

function isReportExpired(report) {
  if (!report.expires_at) return false;
  return new Date(report.expires_at) < new Date();
}

function formatReport(report) {
  const reportData = report.report_data ? JSON.parse(report.report_data) : {};
  const dataSources = report.data_sources ? JSON.parse(report.data_sources) : [];

  // Extract pureDCFScenarios from triangulatedValuation.enhancedScenarios.pureDCF
  // This matches what formatV2Report() does for fresh reports
  if (reportData.triangulatedValuation?.enhancedScenarios?.pureDCF) {
    reportData.triangulatedValuation.pureDCFScenarios = reportData.triangulatedValuation.enhancedScenarios.pureDCF;
  }

  return {
    symbol: report.symbol,
    overallScore: report.overall_score,
    confidenceLevel: report.confidence_level,
    investmentThesis: report.investment_thesis,
    scenarios: {
      bull: { price: report.bull_case_price, probability: report.bull_probability },
      base: { price: report.base_case_price, probability: report.base_probability },
      bear: { price: report.bear_case_price, probability: report.bear_probability }
    },
    ...reportData,
    metadata: {
      generatedAt: report.generated_at,
      expiresAt: report.expires_at,
      modelVersion: report.model_version,
      dataSources
    }
  };
}

/**
 * Format V2 report for frontend consumption
 * V2 reports have a different structure with AI-generated sections
 */
function formatV2Report(report) {
  // Extract triangulated valuation data if available
  const triangulated = report.triangulatedValuation;
  const hasTriangulation = triangulated?.success;

  return {
    symbol: report.symbol,
    companyName: report.companyName,
    sector: report.sector,
    industry: report.industry,
    overallScore: report.overallScore,
    confidenceLevel: report.confidenceLevel,

    // V2 uses 'conclusion' as the main thesis/summary
    investmentThesis: report.conclusion,

    // Scenarios - use triangulated scenarios if available
    scenarios: report.scenarios || {
      bull: { price: null, probability: 0.25 },
      base: { price: null, probability: 0.50 },
      bear: { price: null, probability: 0.25 }
    },

    // Triangulated Valuation - NEW: Three perspectives
    triangulatedValuation: hasTriangulation ? {
      // Three valuation perspectives
      perspectives: triangulated.perspectives,

      // Triangulation analysis
      triangulation: {
        alignment: triangulated.triangulation?.alignment,
        keyInsight: triangulated.triangulation?.keyInsight,
        comparisons: triangulated.triangulation?.comparisons,
        confidenceFactors: triangulated.triangulation?.confidenceFactors
      },

      // Enhanced scenarios (contains both triangulated and pureDCF)
      enhancedScenarios: triangulated.enhancedScenarios,

      // Pure DCF scenarios (direct access for convenience)
      // These match the DCF tab exactly: 25%/50%/25% probabilities with pure DCF values
      pureDCFScenarios: triangulated.enhancedScenarios?.pureDCF || null,

      // Backward reasoning ("What's Priced In")
      backwardReasoning: triangulated.backwardReasoning,

      // Enhanced reverse DCF with interpretation and sensitivity
      reverseDCF: triangulated.reverseDCF,

      // Data quality assessment
      dataQuality: triangulated.dataQuality,

      // Current price for reference
      currentPrice: triangulated.currentPrice
    } : null,

    // AI-generated sections (markdown content)
    sections: {
      conclusion: report.conclusion,
      companyOverview: report.companyOverview,
      businessAnalysisProse: report.sections?.businessAnalysis, // Legacy prose version
      whatMatters: report.whatMatters,
      investmentPositives: report.investmentPositives,
      investmentRisks: report.investmentRisks,
      valuationScenarios: report.valuationScenarios
    },

    // Structured category analyses for BusinessAnalysisCards
    // Format: { financial: { narrative, keyPoints }, competitive: {...}, market: {...}, management: {...} }
    businessAnalysis: report.businessAnalysis,

    // Scorecard with 12-factor analysis
    scorecard: report.scorecard,

    // Data fusion insights
    dataFusion: report.dataFusion,

    // Company profile from classification
    companyProfile: report.companyProfile,

    // Key metrics table
    keyMetricsTable: report.keyMetricsTable,

    // Metadata
    metadata: {
      generatedAt: report.metadata?.generatedAt,
      expiresAt: report.metadata?.expiresAt,
      modelVersion: report.metadata?.modelVersion,
      dataQuality: report.metadata?.dataQuality,
      dataSources: report.metadata?.dataSources,
      conflictsDetected: report.metadata?.conflictsDetected,
      dataConfidenceScore: report.metadata?.dataConfidenceScore,
      dataConfidenceLevel: report.metadata?.dataConfidenceLevel,
      triangulationAlignment: report.metadata?.triangulationAlignment,
      triangulationScore: report.metadata?.triangulationScore,
      valuationMethod: report.metadata?.valuationMethod
    },

    // Mark as V2 report
    isV2: true,
    hasTriangulation
  };
}

function formatScorecard(scorecard) {
  return {
    overallScore: scorecard.overall_score,
    scoredAt: scorecard.scored_at,
    factors: {
      market: {
        marketNeed: {
          score: scorecard.market_need_score,
          confidence: scorecard.market_need_confidence
        },
        marketDirection: {
          score: scorecard.market_direction_score,
          confidence: scorecard.market_direction_confidence
        },
        marketSize: {
          score: scorecard.market_size_score,
          confidence: scorecard.market_size_confidence
        }
      },
      competitive: {
        competitiveStrength: {
          score: scorecard.competitive_strength_score,
          confidence: scorecard.competitive_strength_confidence
        },
        competitiveDirection: {
          score: scorecard.competitive_direction_score,
          confidence: scorecard.competitive_direction_confidence
        },
        moatDurability: {
          score: scorecard.moat_durability_score,
          confidence: scorecard.moat_durability_confidence
        }
      },
      financial: {
        growthMomentum: {
          score: scorecard.growth_momentum_score,
          confidence: scorecard.growth_momentum_confidence
        },
        profitability: {
          score: scorecard.profitability_score,
          confidence: scorecard.profitability_confidence
        },
        cashGeneration: {
          score: scorecard.cash_generation_score,
          confidence: scorecard.cash_generation_confidence
        },
        balanceSheet: {
          score: scorecard.balance_sheet_score,
          confidence: scorecard.balance_sheet_confidence
        }
      },
      management: {
        capitalAllocation: {
          score: scorecard.capital_allocation_score,
          confidence: scorecard.capital_allocation_confidence
        },
        leadershipQuality: {
          score: scorecard.leadership_quality_score,
          confidence: scorecard.leadership_quality_confidence
        }
      }
    },
    rawScorecard: scorecard.scorecard ? JSON.parse(scorecard.scorecard) : null
  };
}

function formatSecFiling(filing) {
  return {
    symbol: filing.symbol,
    cik: filing.cik,
    formType: filing.formType || filing.form_type,
    filingDate: filing.filingDate || filing.filing_date,
    accessionNumber: filing.accessionNumber || filing.accession_number,
    fiscalYear: filing.fiscalYear || filing.fiscal_year,
    fiscalPeriod: filing.fiscalPeriod || filing.fiscal_period,
    sections: {
      businessDescription: filing.businessDescription || filing.business_description,
      riskFactors: filing.riskFactors || filing.risk_factors,
      mdaDiscussion: filing.mdaDiscussion || filing.mda_discussion,
      competitionSection: filing.competitionSection || filing.competition_section
    },
    keyMetrics: filing.keyMetrics || (filing.key_metrics ? JSON.parse(filing.key_metrics) : {}),
    filingUrl: filing.filingUrl || filing.filing_url,
    parsedAt: filing.parsedAt || filing.parsed_at
  };
}

async function checkDataAvailability(companyId, symbol) {
  const database = await getDatabaseAsync();
  const result = {
    hasMinimumData: false,
    available: [],
    missing: []
  };

  // Check financial data
  const financialsResult = await database.query(`
    SELECT COUNT(*) as count FROM financial_data
    WHERE company_id = ? AND period_type = 'annual'
  `, [companyId]);
  const financials = financialsResult.rows[0];

  if (financials.count >= 2) {
    result.available.push('financials');
  } else {
    result.missing.push('financials (need 2+ years)');
  }

  // Check analyst estimates
  const estimatesResult = await database.query(`
    SELECT COUNT(*) as count FROM analyst_estimates WHERE company_id = ?
  `, [companyId]);
  const estimates = estimatesResult.rows[0];

  if (estimates.count > 0) {
    result.available.push('analystEstimates');
  } else {
    result.missing.push('analystEstimates');
  }

  // Check SEC filings
  const secFilingsResult = await database.query(`
    SELECT COUNT(*) as count FROM sec_filings WHERE symbol = ? AND form_type = '10-K'
  `, [symbol]);
  const secFilings = secFilingsResult.rows[0];

  if (secFilings.count > 0) {
    result.available.push('secFilings');
  } else {
    result.missing.push('secFilings (10-K)');
  }

  // Check prices
  const pricesResult = await database.query(`
    SELECT COUNT(*) as count FROM daily_prices WHERE company_id = ?
  `, [companyId]);
  const prices = pricesResult.rows[0];

  if (prices.count >= 30) {
    result.available.push('priceHistory');
  } else {
    result.missing.push('priceHistory');
  }

  // Minimum requirement: financials + prices
  result.hasMinimumData = result.available.includes('financials') && result.available.includes('priceHistory');

  return result;
}

module.exports = router;
