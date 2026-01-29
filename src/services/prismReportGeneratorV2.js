// src/services/prismReportGeneratorV2.js
// Enhanced PRISM Report Generator V2 - Institutional-quality equity research
// Uses comprehensive data collection and AI synthesis for Fyva-quality reports

require('dotenv').config();
const db = require('../database');
const PRISMScorer = require('./prismScorer');
const PRISMDataCollector = require('./prismDataCollector');
const PRISMAISynthesizer = require('./prismAISynthesizer');
const PRISMAISynthesizerV2 = require('./prismAISynthesizerV2');
const TriangulatedValuationService = require('./triangulatedValuationService');

const database = db.getDatabase();

class PRISMReportGeneratorV2 {
  constructor() {
    this.scorer = new PRISMScorer();
    this.dataCollector = new PRISMDataCollector();
    this.aiSynthesizer = new PRISMAISynthesizer();
    this.aiSynthesizerV2 = new PRISMAISynthesizerV2();
    this.triangulatedValuationService = new TriangulatedValuationService(database);
    this.db = database;
  }

  /**
   * Generate an institutional-quality PRISM report
   * @param {string} symbol - Stock ticker
   * @param {Object} options - Generation options
   * @returns {Object} Complete PRISM report
   */
  async generateReport(symbol, options = {}) {
    const {
      useAI = true,        // Use AI synthesis (set false for faster rule-based)
      useV2 = true,        // Use V2 synthesizer with Data Fusion Engine (recommended)
      forceRefresh = false // Force regeneration even if cached
    } = options;

    const symbolUpper = symbol.toUpperCase();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PRISM REPORT GENERATION ${useV2 ? 'V2 (INSTITUTIONAL)' : 'V1'} - ${symbolUpper}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Options: AI=${useAI}, V2=${useV2}, ForceRefresh=${forceRefresh}`);

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.getCachedReport(symbolUpper);
      if (cached && !this.isExpired(cached)) {
        console.log(`✅ Using cached report (generated ${this.timeSince(cached.generated_at)} ago)`);
        return this.parseReportFromCache(cached);
      }
    }

    const startTime = Date.now();

    // Step 1: Collect comprehensive data
    console.log('\n📊 Step 1: Collecting comprehensive data...');
    const dataPackage = await this.dataCollector.collectComprehensiveData(symbolUpper);

    // Step 2: Calculate Business Scorecard
    console.log('\n📈 Step 2: Calculating Business Scorecard...');
    const scorecard = await this.scorer.calculateScorecard(symbolUpper);

    // Step 3: Generate report sections
    let report;
    if (useAI && useV2) {
      console.log('\n🤖 Step 3: AI Synthesis V2 (institutional-quality with Data Fusion)...');
      report = await this.generateV2Report(dataPackage, scorecard);
    } else if (useAI) {
      console.log('\n🤖 Step 3: AI Synthesis V1 (standard generation)...');
      report = await this.generateAIPoweredReport(dataPackage, scorecard);
    } else {
      console.log('\n📝 Step 3: Rule-based generation (faster, less depth)...');
      report = await this.generateRuleBasedReport(dataPackage, scorecard);
    }

    // Step 4: Calculate triangulated valuation (DCF + Analyst + Reverse DCF)
    console.log('\n💰 Step 4: Calculating triangulated valuation...');
    let triangulatedValuation = null;
    try {
      triangulatedValuation = await this.triangulatedValuationService.calculateTriangulatedValuation(
        dataPackage.company.id,
        {
          currentPrice: dataPackage.prices?.current?.close,
          analystData: dataPackage.analyst?.estimates,
          historicalGrowth: dataPackage.metrics?.trends?.revenue_growth_yoy
        }
      );

      if (triangulatedValuation?.success) {
        console.log(`   ✓ Triangulation: ${triangulatedValuation.triangulation?.alignment?.level} alignment (${triangulatedValuation.triangulation?.alignment?.score}/100)`);
        console.log(`   ✓ DCF Intrinsic: $${triangulatedValuation.perspectives?.dcfIntrinsic?.baseCase?.toFixed(2) || 'N/A'}`);
        console.log(`   ✓ Analyst Mean: $${triangulatedValuation.perspectives?.analystConsensus?.targetMean?.toFixed(2) || 'N/A'}`);
        console.log(`   ✓ Implied Growth: ${triangulatedValuation.perspectives?.marketImplied?.impliedGrowthPct || 'N/A'}%`);
      } else {
        console.log('   ⚠ Triangulation partial - using fallback scenarios');
      }
    } catch (error) {
      console.log(`   ⚠ Triangulation error: ${error.message} - using fallback scenarios`);
    }

    // Step 5: Add valuation scenarios (triangulated or fallback)
    console.log('\n📊 Step 5: Generating valuation scenarios...');
    if (triangulatedValuation?.success) {
      report.scenarios = triangulatedValuation.enhancedScenarios;
      report.triangulatedValuation = triangulatedValuation;
    } else {
      // Fallback to simple analyst-based scenarios
      report.scenarios = this.generateValuationScenarios(dataPackage, scorecard);
      report.triangulatedValuation = triangulatedValuation; // Include partial data
    }

    // Step 7: Add metadata
    const modelVersion = useAI && useV2
      ? 'PRISM-2.0-institutional'
      : useAI
        ? 'PRISM-2.0-ai-synthesized'
        : 'PRISM-2.0-rule-based';

    report.metadata = {
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      modelVersion,
      generationTimeMs: Date.now() - startTime,
      dataQuality: dataPackage.dataQuality.overall,
      dataSources: this.getDataSources(dataPackage),
      // V2-specific metadata
      ...(useV2 && report.dataFusion ? {
        conflictsDetected: report.dataFusion.conflictsDetected,
        dataConfidenceScore: report.dataFusion.dataConfidence?.score,
        dataConfidenceLevel: report.dataFusion.dataConfidence?.level,
      } : {}),
      // Triangulated valuation metadata
      ...(triangulatedValuation?.success ? {
        triangulationAlignment: triangulatedValuation.triangulation?.alignment?.level,
        triangulationScore: triangulatedValuation.triangulation?.alignment?.score,
        valuationMethod: 'triangulated'
      } : {
        valuationMethod: 'analyst_consensus'
      })
    };

    // Step 8: Save to database
    console.log('\n💾 Step 8: Saving report...');
    await this.scorer.saveScorecard(symbolUpper, scorecard);
    await this.saveReport(dataPackage.company.id, symbolUpper, report);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ PRISM Report generated for ${symbolUpper}`);
    console.log(`   Score: ${report.overallScore}/10 | Quality: ${report.metadata.dataQuality}`);
    if (useV2 && report.dataFusion) {
      console.log(`   Data Confidence: ${report.dataFusion.dataConfidence?.level || 'N/A'} (${report.dataFusion.dataConfidence?.score || 0}/100)`);
      console.log(`   Conflicts: ${report.dataFusion.conflictsDetected} | Gaps: ${report.dataFusion.dataGaps?.length || 0}`);
    }
    if (triangulatedValuation?.success) {
      console.log(`   Triangulation: ${triangulatedValuation.triangulation?.alignment?.level} (${triangulatedValuation.triangulation?.alignment?.score}/100)`);
      console.log(`   Backward Reasoning: ${triangulatedValuation.backwardReasoning?.headline || 'N/A'}`);
    }
    console.log(`   Time: ${report.metadata.generationTimeMs}ms | Model: ${report.metadata.modelVersion}`);
    console.log(`${'='.repeat(60)}\n`);

    return report;
  }

  /**
   * Generate AI-powered report with comprehensive narratives
   */
  async generateAIPoweredReport(dataPackage, scorecard) {
    // Use AI synthesizer for rich content
    const synthesized = await this.aiSynthesizer.synthesizeReport(dataPackage, scorecard);

    return {
      symbol: dataPackage.symbol,
      companyName: dataPackage.company.name,
      sector: dataPackage.company.sector,
      industry: dataPackage.company.industry,

      // Overall scores
      overallScore: scorecard.overallScore,
      confidenceLevel: this.determineConfidenceLevel(scorecard),

      // AI-synthesized sections
      conclusion: synthesized.conclusion,
      companyOverview: synthesized.companyOverview,
      businessAnalysis: synthesized.businessAnalysis,
      whatMatters: synthesized.whatMatters,
      investmentPositives: synthesized.investmentPositives,
      investmentRisks: synthesized.investmentRisks,

      // Data-driven sections
      keyMetricsTable: synthesized.keyMetricsTable,
      scorecard: scorecard,

      // Data package summary for frontend
      dataSummary: this.createDataSummary(dataPackage)
    };
  }

  /**
   * Generate V2 report with Data Fusion Engine and institutional prompts
   * This is the recommended mode for highest quality output
   */
  async generateV2Report(dataPackage, scorecard) {
    // V2 synthesizer handles data fusion internally
    const synthesized = await this.aiSynthesizerV2.synthesizeReport(dataPackage, scorecard);

    return {
      symbol: dataPackage.symbol,
      companyName: dataPackage.company.name,
      sector: dataPackage.company.sector,
      industry: dataPackage.company.industry,

      // Overall scores
      overallScore: parseFloat(synthesized.overallScore) || scorecard.overallScore,
      confidenceLevel: synthesized.confidenceLevel || this.determineConfidenceLevel(scorecard),

      // Company profile from Data Fusion Engine
      companyProfile: synthesized.companyProfile,

      // AI-synthesized sections (V2 format) - top-level for convenience
      conclusion: synthesized.sections?.executiveSummary || '',
      companyOverview: synthesized.sections?.companyOverview || '',
      whatMatters: synthesized.sections?.whatMatters || '',
      investmentPositives: synthesized.sections?.investmentPositives || '',
      investmentRisks: synthesized.sections?.investmentRisks || '',
      valuationScenarios: synthesized.sections?.valuationScenarios || '',

      // All sections bundled (for API formatting)
      sections: {
        executiveSummary: synthesized.sections?.executiveSummary || '',
        companyOverview: synthesized.sections?.companyOverview || '',
        businessAnalysis: synthesized.sections?.businessAnalysis || '',
        whatMatters: synthesized.sections?.whatMatters || '',
        investmentPositives: synthesized.sections?.investmentPositives || '',
        investmentRisks: synthesized.sections?.investmentRisks || '',
        valuationScenarios: synthesized.sections?.valuationScenarios || '',
      },

      // Scorecard
      scorecard: synthesized.scorecard || scorecard,

      // Structured category analyses for BusinessAnalysisCards
      // Format: { financial: { narrative, keyPoints }, competitive: {...}, market: {...}, management: {...} }
      businessAnalysis: synthesized.businessAnalysis || null,

      // V2-specific: Data Fusion insights
      dataFusion: {
        conflictsDetected: synthesized.metadata?.conflictsDetected || 0,
        dataGaps: synthesized.metadata?.dataGaps || [],
        dataConfidence: synthesized.metadata?.dataConfidence || null,
        qualityGate: synthesized.metadata?.qualityGate || null,
      },

      // Key metrics table (generate if not in V2 output)
      keyMetricsTable: this.aiSynthesizer.generateKeyMetricsTable(dataPackage),

      // Data package summary for frontend
      dataSummary: this.createDataSummary(dataPackage),

      // Mark as V2 generated
      isV2: true,
    };
  }

  /**
   * Generate rule-based report (faster, less depth)
   */
  async generateRuleBasedReport(dataPackage, scorecard) {
    return {
      symbol: dataPackage.symbol,
      companyName: dataPackage.company.name,
      sector: dataPackage.company.sector,
      industry: dataPackage.company.industry,

      overallScore: scorecard.overallScore,
      confidenceLevel: this.determineConfidenceLevel(scorecard),

      // Rule-based sections
      conclusion: this.generateRuleBasedConclusion(dataPackage, scorecard),
      investmentThesis: this.generateInvestmentThesis(dataPackage, scorecard),
      whatMatters: this.generateRuleBasedWhatMatters(dataPackage, scorecard),
      investmentPositives: this.generateRuleBasedPositives(dataPackage, scorecard),
      investmentRisks: this.generateRuleBasedRisks(dataPackage, scorecard),

      scorecard: scorecard,
      keyMetricsTable: this.aiSynthesizer.generateKeyMetricsTable(dataPackage),
      dataSummary: this.createDataSummary(dataPackage)
    };
  }

  /**
   * Generate valuation scenarios (Bull/Base/Bear)
   */
  generateValuationScenarios(dataPackage, scorecard) {
    const currentPrice = dataPackage.prices.current?.close;
    const analyst = dataPackage.analyst.estimates;

    // Use analyst targets if available
    if (analyst?.target_high && analyst?.target_low && analyst?.target_mean) {
      const scenarios = {
        current: currentPrice,
        bull: {
          price: analyst.target_high,
          probability: 0.20,
          upside: currentPrice ? ((analyst.target_high - currentPrice) / currentPrice * 100).toFixed(1) : null,
          assumptions: [
            'Analyst high target achieved',
            'Execution exceeds expectations',
            'Favorable market environment'
          ]
        },
        base: {
          price: analyst.target_mean,
          probability: 0.55,
          upside: currentPrice ? ((analyst.target_mean - currentPrice) / currentPrice * 100).toFixed(1) : null,
          assumptions: [
            'Analyst consensus target',
            'In-line execution',
            'Normal market conditions'
          ]
        },
        bear: {
          price: analyst.target_low,
          probability: 0.25,
          upside: currentPrice ? ((analyst.target_low - currentPrice) / currentPrice * 100).toFixed(1) : null,
          assumptions: [
            'Analyst low target',
            'Execution challenges',
            'Adverse market conditions'
          ]
        }
      };

      // Calculate probability-weighted target
      scenarios.probabilityWeighted = (
        scenarios.bull.price * scenarios.bull.probability +
        scenarios.base.price * scenarios.base.probability +
        scenarios.bear.price * scenarios.bear.probability
      ).toFixed(2);

      return scenarios;
    }

    // Fallback: generate from current price and score
    if (currentPrice) {
      const multiplier = scorecard.overallScore / 10; // Higher score = more upside potential
      return {
        current: currentPrice,
        bull: {
          price: Math.round(currentPrice * (1 + 0.3 * multiplier) * 100) / 100,
          probability: 0.20,
          upside: (30 * multiplier).toFixed(1),
          assumptions: ['Growth acceleration', 'Margin expansion', 'Multiple expansion']
        },
        base: {
          price: Math.round(currentPrice * (1 + 0.1 * multiplier) * 100) / 100,
          probability: 0.55,
          upside: (10 * multiplier).toFixed(1),
          assumptions: ['Continue current trajectory', 'Stable margins', 'Current multiple maintained']
        },
        bear: {
          price: Math.round(currentPrice * (1 - 0.15) * 100) / 100,
          probability: 0.25,
          upside: '-15.0',
          assumptions: ['Growth deceleration', 'Margin pressure', 'Multiple compression']
        }
      };
    }

    return null;
  }

  // ============================================
  // RULE-BASED GENERATION METHODS
  // ============================================

  generateRuleBasedConclusion(dataPackage, scorecard) {
    const score = scorecard.overallScore;
    const company = dataPackage.company;

    let verdict, reasoning;

    if (score >= 8) {
      verdict = 'Strong Buy';
      reasoning = `I view ${company.name} as an exceptional investment opportunity`;
    } else if (score >= 7) {
      verdict = 'Buy';
      reasoning = `${company.name} represents an above-average opportunity`;
    } else if (score >= 5) {
      verdict = 'Hold';
      reasoning = `${company.name} offers a balanced risk/reward profile`;
    } else {
      verdict = 'Underweight';
      reasoning = `${company.name} faces significant headwinds`;
    }

    const strengths = this.getTopStrengths(scorecard, 2);
    const weaknesses = this.getTopWeaknesses(scorecard, 1);

    return `${reasoning} with a PRISM Score of ${score}/10. ${strengths}. ${weaknesses ? `Key concern: ${weaknesses}` : ''} Overall verdict: ${verdict}.`;
  }

  generateInvestmentThesis(dataPackage, scorecard) {
    const score = scorecard.overallScore;
    const strengths = this.getTopStrengthsArray(scorecard, 3);

    if (score >= 8) {
      return `This company represents an exceptional investment opportunity with a PRISM Score of ${score}/10. Key strengths include ${strengths.join(', ')}. The combination of quality metrics suggests a best-in-class business with sustainable competitive advantages.`;
    } else if (score >= 6) {
      return `With a PRISM Score of ${score}/10, this is an above-average investment opportunity. The company demonstrates strength in ${strengths.slice(0, 2).join(' and ')}.`;
    } else {
      return `A PRISM Score of ${score}/10 indicates a below-average risk/reward profile. Careful evaluation of specific catalysts is recommended.`;
    }
  }

  generateRuleBasedWhatMatters(dataPackage, scorecard) {
    const drivers = [];
    const metrics = dataPackage.metrics;
    const factors = scorecard.factors;

    // Add relevant drivers based on scorecard
    if (factors.financial.growthMomentum.score <= 3) {
      drivers.push({
        name: 'Revenue Growth Trajectory',
        description: 'Current growth is below average - acceleration needed',
        bullCase: 'New products/markets drive growth reacceleration',
        bearCase: 'Growth continues to decelerate',
        impact: 'high'
      });
    }

    if (factors.financial.profitability.score >= 4) {
      drivers.push({
        name: 'Margin Sustainability',
        description: 'Strong margins are a key strength - must be defended',
        bullCase: 'Operating leverage drives further expansion',
        bearCase: 'Competitive pressure compresses margins',
        impact: 'high'
      });
    }

    if (factors.competitive.competitiveStrength.score >= 4) {
      drivers.push({
        name: 'Competitive Position',
        description: 'Dominant position must be maintained',
        bullCase: 'Continue gaining share through differentiation',
        bearCase: 'New entrants or disruption erodes position',
        impact: 'high'
      });
    }

    if (factors.financial.balanceSheet.score <= 3) {
      drivers.push({
        name: 'Balance Sheet Health',
        description: 'Leverage is elevated - deleveraging path matters',
        bullCase: 'Cash generation reduces debt faster than expected',
        bearCase: 'Rising rates increase interest burden',
        impact: 'medium'
      });
    }

    // Always add macro
    drivers.push({
      name: 'Market Environment',
      description: 'Broader economic conditions affect demand',
      bullCase: 'Favorable macro supports growth',
      bearCase: 'Economic downturn pressures demand',
      impact: 'medium'
    });

    return drivers.slice(0, 5);
  }

  generateRuleBasedPositives(dataPackage, scorecard) {
    const positives = [];
    const factors = scorecard.factors;
    const metrics = dataPackage.metrics.latest;

    if (factors.financial.profitability.score >= 4) {
      positives.push({
        thesis: 'Superior profitability demonstrates pricing power and operational excellence',
        evidence: factors.financial.profitability.justification,
        dataPoints: factors.financial.profitability.dataPoints || [],
        confidence: 'HIGH'
      });
    }

    if (factors.financial.cashGeneration.score >= 4) {
      positives.push({
        thesis: 'Excellent cash generation provides flexibility for growth and shareholder returns',
        evidence: factors.financial.cashGeneration.justification,
        dataPoints: factors.financial.cashGeneration.dataPoints || [],
        confidence: 'HIGH'
      });
    }

    if (factors.competitive.competitiveStrength.score >= 4) {
      positives.push({
        thesis: 'Dominant market position creates sustainable competitive advantages',
        evidence: factors.competitive.competitiveStrength.justification,
        dataPoints: factors.competitive.competitiveStrength.dataPoints || [],
        confidence: 'MEDIUM'
      });
    }

    if (factors.competitive.moatDurability.score >= 4) {
      positives.push({
        thesis: 'Durable competitive moat protects long-term returns',
        evidence: factors.competitive.moatDurability.justification,
        dataPoints: factors.competitive.moatDurability.dataPoints || [],
        confidence: 'MEDIUM'
      });
    }

    if (dataPackage.analyst.estimates?.upside_potential > 10) {
      positives.push({
        thesis: 'Strong analyst consensus supports investment thesis',
        evidence: `${dataPackage.analyst.estimates.upside_potential.toFixed(0)}% upside to consensus target`,
        dataPoints: [`${dataPackage.analyst.estimates.number_of_analysts || 'Multiple'} analysts covering`],
        confidence: 'MEDIUM'
      });
    }

    return positives.slice(0, 5);
  }

  generateRuleBasedRisks(dataPackage, scorecard) {
    const risks = [];
    const factors = scorecard.factors;
    const metrics = dataPackage.metrics.latest;

    if (factors.financial.balanceSheet.score <= 2) {
      risks.push({
        thesis: 'Leveraged balance sheet increases financial risk',
        evidence: factors.financial.balanceSheet.justification,
        severity: 'medium',
        probability: 'low'
      });
    }

    if (factors.financial.growthMomentum.score <= 2) {
      risks.push({
        thesis: 'Weak growth momentum may indicate structural challenges',
        evidence: factors.financial.growthMomentum.justification,
        severity: 'high',
        probability: 'medium'
      });
    }

    if (metrics?.pe_ratio > 35) {
      risks.push({
        thesis: 'Elevated valuation leaves limited margin of safety',
        evidence: `P/E ratio of ${metrics.pe_ratio.toFixed(1)}x is above market average`,
        severity: 'medium',
        probability: 'medium'
      });
    }

    // Always add market risk
    risks.push({
      thesis: 'Macro/market conditions could impact demand',
      evidence: 'Economic cycles affect consumer and enterprise spending',
      severity: 'medium',
      probability: 'medium',
      mitigation: 'Diversified revenue base provides some resilience'
    });

    return risks.slice(0, 5);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  getTopStrengths(scorecard, count) {
    const strengths = this.getTopStrengthsArray(scorecard, count);
    return `Key strengths: ${strengths.join(', ')}`;
  }

  getTopStrengthsArray(scorecard, count) {
    const allFactors = [];
    const categories = ['market', 'competitive', 'financial', 'management'];

    for (const category of categories) {
      for (const [name, data] of Object.entries(scorecard.factors[category])) {
        if (data.score >= 4) {
          allFactors.push({ name: this.camelToTitle(name), score: data.score });
        }
      }
    }

    return allFactors
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(f => f.name.toLowerCase());
  }

  getTopWeaknesses(scorecard, count) {
    const allFactors = [];
    const categories = ['market', 'competitive', 'financial', 'management'];

    for (const category of categories) {
      for (const [name, data] of Object.entries(scorecard.factors[category])) {
        if (data.score <= 2 && data.score != null) {
          allFactors.push({ name: this.camelToTitle(name), score: data.score });
        }
      }
    }

    if (allFactors.length === 0) return null;

    return allFactors
      .sort((a, b) => a.score - b.score)
      .slice(0, count)
      .map(f => f.name.toLowerCase())
      .join(', ');
  }

  determineConfidenceLevel(scorecard) {
    const factors = [
      ...Object.values(scorecard.factors.financial),
      ...Object.values(scorecard.factors.competitive),
      ...Object.values(scorecard.factors.management),
      ...Object.values(scorecard.factors.market)
    ];

    const highCount = factors.filter(f => f.confidence === 'HIGH').length;
    const lowCount = factors.filter(f => f.confidence === 'LOW').length;

    if (highCount >= 6 && lowCount <= 2) return 'HIGH';
    if (lowCount >= 6) return 'LOW';
    return 'MEDIUM';
  }

  createDataSummary(dataPackage) {
    return {
      financialYears: dataPackage.financials.annual?.length || 0,
      hasSecFiling: !!dataPackage.secFiling.latest10K,
      newsArticles: dataPackage.news.recent?.length || 0,
      sentimentAvailable: !!dataPackage.sentiment.combined,
      insiderTransactions: dataPackage.insiders.recentTransactions?.length || 0,
      peerCount: dataPackage.peers.industryPeers?.length || 0,
      dataQuality: dataPackage.dataQuality
    };
  }

  getDataSources(dataPackage) {
    const sources = [];
    if (dataPackage.financials.annual?.length > 0) sources.push('financial_statements');
    if (dataPackage.metrics.latest) sources.push('calculated_metrics');
    if (dataPackage.analyst.estimates) sources.push('analyst_estimates');
    if (dataPackage.prices.current) sources.push('price_data');
    if (dataPackage.secFiling.latest10K) sources.push('sec_10k');
    if (dataPackage.news.recent?.length > 0) sources.push('news');
    if (dataPackage.sentiment.combined) sources.push('sentiment');
    if (dataPackage.insiders.recentTransactions?.length > 0) sources.push('insider_transactions');
    if (dataPackage.institutional.topHolders?.length > 0) sources.push('institutional_holdings');
    return sources;
  }

  camelToTitle(str) {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  // ============================================
  // CACHING
  // ============================================

  async getCachedReport(symbol) {
    try {
      return this.db.prepare(`
        SELECT * FROM prism_reports
        WHERE symbol = ?
        ORDER BY generated_at DESC
        LIMIT 1
      `).get(symbol);
    } catch (e) {
      return null;
    }
  }

  isExpired(cachedReport) {
    if (!cachedReport.expires_at) return true;
    return new Date(cachedReport.expires_at) < new Date();
  }

  timeSince(dateStr) {
    const ms = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) return 'less than an hour';
    if (hours < 24) return `${hours} hours`;
    return `${Math.floor(hours / 24)} days`;
  }

  parseReportFromCache(cached) {
    try {
      const report = JSON.parse(cached.report_data);
      report.fromCache = true;
      return report;
    } catch (e) {
      return null;
    }
  }

  async saveReport(companyId, symbol, report) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO prism_reports (
          company_id, symbol, generated_at, expires_at, report_data,
          overall_score, confidence_level, data_sources
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id) DO UPDATE SET
          symbol = excluded.symbol,
          generated_at = excluded.generated_at,
          expires_at = excluded.expires_at,
          report_data = excluded.report_data,
          overall_score = excluded.overall_score,
          confidence_level = excluded.confidence_level,
          data_sources = excluded.data_sources
      `);

      stmt.run(
        companyId,
        symbol,
        report.metadata.generatedAt,
        report.metadata.expiresAt,
        JSON.stringify(report),
        report.overallScore,
        report.confidenceLevel,
        JSON.stringify(report.metadata.dataSources)
      );

      console.log('  ✓ Report saved to database');
    } catch (error) {
      console.error('  Error saving report:', error.message);
    }
  }
}

module.exports = PRISMReportGeneratorV2;

// Test if run directly
if (require.main === module) {
  const generator = new PRISMReportGeneratorV2();

  (async () => {
    try {
      // Test with AI synthesis
      console.log('\n🚀 Testing PRISM Report Generator V2...\n');

      const report = await generator.generateReport('AAPL', {
        useAI: true,
        forceRefresh: true
      });

      console.log('\n📄 Report Preview:');
      console.log('─'.repeat(60));
      console.log(`Company: ${report.companyName}`);
      console.log(`PRISM Score: ${report.overallScore}/10`);
      console.log(`Confidence: ${report.confidenceLevel}`);
      console.log(`Data Quality: ${report.metadata.dataQuality}`);
      console.log('─'.repeat(60));

      if (report.conclusion) {
        console.log('\n📝 Conclusion Preview:');
        console.log(report.conclusion.substring(0, 500) + '...');
      }

      if (report.investmentPositives?.length > 0) {
        console.log(`\n✅ ${report.investmentPositives.length} Investment Positives generated`);
      }

      if (report.investmentRisks?.length > 0) {
        console.log(`⚠️ ${report.investmentRisks.length} Investment Risks generated`);
      }

    } catch (error) {
      console.error('Error:', error.message);
      console.error(error.stack);
    }
  })();
}
