// src/services/prismAISynthesizerV2.js
// Enhanced AI Synthesis Layer V2 - Institutional-Quality Equity Research
//
// This version integrates:
// - DataFusionEngine for intelligent signal weighting
// - Institutional-quality prompts that produce hedge fund-grade writing
// - Citation requirements and data grounding
// - Conflict detection and acknowledgment
// - Explicit uncertainty handling

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const DataFusionEngine = require('./dataFusionEngine');
const QualitativeNarrativeService = require('./qualitativeNarrativeService');
const { PROMPTS, ANALYST_PERSONA, calculateOverallScore } = require('./institutionalPrompts');

class PRISMAISynthesizerV2 {
  constructor() {
    this.client = new Anthropic();
    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 4096;
    this.fusionEngine = new DataFusionEngine();
    this.narrativeService = new QualitativeNarrativeService();

    // Track generation for cost awareness
    this.generationStats = {
      promptTokens: 0,
      completionTokens: 0,
      calls: 0,
    };
  }

  /**
   * Main entry point: Generate complete institutional-quality report
   */
  async synthesizeReport(rawDataPackage, scorecard) {
    const symbol = rawDataPackage.symbol;
    console.log(`\n🤖 AI Synthesis V2 starting for ${symbol}...`);

    // Step 0: Generate qualitative narratives (IB-style prose)
    console.log('  Step 0: Generating qualitative narratives...');
    let narratives = null;
    try {
      narratives = await this.narrativeService.generateNarratives(rawDataPackage);
      console.log(`  ✓ Generated ${Object.keys(narratives).filter(k => narratives[k]?.success).length}/5 narrative sections`);
    } catch (error) {
      console.log(`  ⚠️ Narrative generation failed: ${error.message} - continuing without narratives`);
    }

    // Step 0.5: Generate category analyses for BusinessAnalysisCards (needs scorecard)
    console.log('  Step 0.5: Generating category analyses...');
    let categoryAnalyses = null;
    try {
      const context = this.narrativeService.prepareContext(rawDataPackage);
      categoryAnalyses = await this.narrativeService.generateCategoryAnalyses(context, scorecard);
      const successCount = Object.values(categoryAnalyses).filter(c => c?.success).length;
      console.log(`  ✓ Generated ${successCount}/4 category analyses`);
    } catch (error) {
      console.log(`  ⚠️ Category analysis generation failed: ${error.message} - continuing without`);
    }

    // Step 1: Fuse data through the intelligent engine
    console.log('  Step 1: Running Data Fusion Engine...');
    const fusedData = await this.fusionEngine.fuseData(rawDataPackage);

    // Attach narratives to fusedData for use in prompts
    fusedData.narratives = narratives;
    fusedData.categoryAnalyses = categoryAnalyses;

    // Step 2: Quality gate - check if we have enough data
    const qualityGate = this.checkDataQuality(fusedData);
    if (!qualityGate.pass) {
      console.log(`  ⚠️ Quality Gate Warning: ${qualityGate.reason}`);
    }

    // Step 3: Generate report sections in optimized order
    console.log('  Step 2: Generating report sections...');

    // Generate in parallel where possible
    const [
      executiveSummary,
      companyOverview,
      businessAnalysis,
    ] = await Promise.all([
      this.generateSection('executiveSummary', fusedData, scorecard),
      this.generateSection('companyOverview', fusedData, scorecard),
      this.generateSection('businessAnalysis', fusedData, scorecard),
    ]);

    // These depend on understanding the business first
    const [
      whatMatters,
      investmentPositives,
      investmentRisks,
    ] = await Promise.all([
      this.generateSection('whatMatters', fusedData, scorecard),
      this.generateSection('investmentPositives', fusedData, scorecard),
      this.generateSection('investmentRisks', fusedData, scorecard),
    ]);

    // Valuation scenarios last (needs full context)
    const valuationScenarios = await this.generateSection('valuationScenarios', fusedData, scorecard);

    // Step 4: Post-process for consistency
    console.log('  Step 3: Post-processing...');
    const processedSections = this.postProcess({
      executiveSummary,
      companyOverview,
      businessAnalysis,
      whatMatters,
      investmentPositives,
      investmentRisks,
      valuationScenarios,
    }, fusedData);

    // Step 5: Compile final report
    const report = {
      symbol,
      companyName: rawDataPackage.company.name,
      sector: rawDataPackage.company.sector,
      industry: rawDataPackage.company.industry,

      // Scores and confidence
      overallScore: calculateOverallScore(scorecard),
      confidenceLevel: fusedData.dataConfidence.level,
      scorecard,

      // Company profile used for analysis
      companyProfile: fusedData.companyProfile,

      // Sections (prose content)
      sections: processedSections,

      // Structured category analyses for BusinessAnalysisCards
      // Format: { financial: { narrative, keyPoints }, competitive: {...}, market: {...}, management: {...} }
      businessAnalysis: categoryAnalyses,

      // Metadata for transparency
      metadata: {
        generatedAt: new Date().toISOString(),
        dataConfidence: fusedData.dataConfidence,
        conflictsDetected: fusedData.conflicts.length,
        dataGaps: fusedData.analystBriefing.dataGaps,
        qualityGate: qualityGate,
        modelUsed: this.model,
        engineVersion: '2.0',
      },

      // Raw data preserved
      fusedData: fusedData,
    };

    console.log(`✅ AI Synthesis V2 complete for ${symbol}`);
    console.log(`   - Confidence: ${fusedData.dataConfidence.level}`);
    console.log(`   - Conflicts: ${fusedData.conflicts.length}`);
    console.log(`   - API calls: ${this.generationStats.calls}`);

    return report;
  }

  /**
   * Generate individual report section
   */
  async generateSection(sectionName, fusedData, scorecard) {
    const promptGenerator = PROMPTS[sectionName];
    if (!promptGenerator) {
      console.error(`  Unknown section: ${sectionName}`);
      return `[Section ${sectionName} not available]`;
    }

    try {
      const prompt = promptGenerator(fusedData, scorecard);
      const content = await this.callClaude(prompt, sectionName);
      return content;
    } catch (error) {
      console.error(`  Error generating ${sectionName}: ${error.message}`);
      return `[Error generating ${sectionName}: ${error.message}]`;
    }
  }

  /**
   * Call Claude API with appropriate settings
   */
  async callClaude(prompt, sectionName = 'unknown') {
    this.generationStats.calls++;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent, factual output
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Track token usage
      if (response.usage) {
        this.generationStats.promptTokens += response.usage.input_tokens || 0;
        this.generationStats.completionTokens += response.usage.output_tokens || 0;
      }

      const content = response.content[0]?.text || '';

      // Basic quality check
      if (content.length < 100) {
        console.warn(`  Warning: Short response for ${sectionName} (${content.length} chars)`);
      }

      return content;
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - wait and retry once
        console.log(`  Rate limited on ${sectionName}, waiting 5s...`);
        await this.sleep(5000);
        return this.callClaude(prompt, sectionName);
      }
      throw error;
    }
  }

  /**
   * Check if we have sufficient data quality
   */
  checkDataQuality(fusedData) {
    const { dataConfidence, sources, conflicts } = fusedData;

    // Hard requirements
    if (!sources.financials?.available) {
      return {
        pass: false,
        reason: 'No financial data available - cannot generate meaningful analysis',
        recommendation: 'Collect financial statements before generating report',
      };
    }

    // Soft warnings
    const warnings = [];

    if (dataConfidence.score < 40) {
      warnings.push('Very low data confidence - report should be viewed skeptically');
    }

    if (conflicts.filter(c => c.severity === 'high').length >= 2) {
      warnings.push('Multiple high-severity conflicts - investment thesis uncertain');
    }

    if (fusedData.analystBriefing.dataGaps.length >= 3) {
      warnings.push('Multiple data gaps - analysis incomplete');
    }

    return {
      pass: true,
      warnings: warnings,
      reason: warnings.length > 0 ? warnings.join('; ') : 'Data quality acceptable',
      recommendation: warnings.length > 0 ?
        'Proceed with caution - acknowledge limitations in report' :
        'Data foundation solid for analysis',
    };
  }

  /**
   * Post-process sections for consistency and quality
   */
  postProcess(sections, fusedData) {
    const processed = {};

    for (const [name, content] of Object.entries(sections)) {
      // Remove any remaining placeholder text
      let cleaned = content
        .replace(/\[INSERT.*?\]/gi, '')
        .replace(/\[PLACEHOLDER.*?\]/gi, '')
        .replace(/\[TODO.*?\]/gi, '');

      // Ensure we don't have duplicate headers
      cleaned = this.deduplicateHeaders(cleaned);

      // Add conflict disclaimer if high-severity conflicts exist
      if (name === 'executiveSummary' && fusedData.conflicts.some(c => c.severity === 'high')) {
        cleaned += '\n\n**Note:** This analysis contains conflicting data signals that warrant additional investigation.';
      }

      // Add data confidence disclaimer if low
      if (name === 'executiveSummary' && fusedData.dataConfidence.level === 'LOW') {
        cleaned += '\n\n**Data Quality Note:** Analysis based on limited data. Conclusions should be viewed with appropriate skepticism.';
      }

      processed[name] = cleaned.trim();
    }

    return processed;
  }

  /**
   * Remove duplicate markdown headers
   */
  deduplicateHeaders(content) {
    const lines = content.split('\n');
    const seenHeaders = new Set();
    const filtered = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch) {
        const headerKey = headerMatch[2].toLowerCase().trim();
        if (seenHeaders.has(headerKey)) {
          continue; // Skip duplicate header
        }
        seenHeaders.add(headerKey);
      }
      filtered.push(line);
    }

    return filtered.join('\n');
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get generation statistics
   */
  getStats() {
    const estimatedCost = (
      (this.generationStats.promptTokens * 0.003 / 1000) +
      (this.generationStats.completionTokens * 0.015 / 1000)
    );

    return {
      ...this.generationStats,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    };
  }

  /**
   * Reset stats (for new report)
   */
  resetStats() {
    this.generationStats = {
      promptTokens: 0,
      completionTokens: 0,
      calls: 0,
    };
  }
}

module.exports = PRISMAISynthesizerV2;

// Test if run directly
if (require.main === module) {
  console.log('PRISMAISynthesizerV2 loaded successfully');
  console.log('This version includes:');
  console.log('  - DataFusionEngine for intelligent signal weighting');
  console.log('  - Institutional-quality prompts');
  console.log('  - Conflict detection and acknowledgment');
  console.log('  - Explicit uncertainty handling');
}
