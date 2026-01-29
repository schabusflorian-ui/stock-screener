// src/services/qualitativeNarrativeService.js
// Qualitative Narrative Engine - Investment Banking Research Quality
//
// This service transforms raw qualitative sources (SEC filings, earnings transcripts,
// news, Wikipedia) into institutional-grade analytical narratives.
//
// Tone: VP at a Tier 1 Investment Bank (Goldman Sachs, Morgan Stanley, J.P. Morgan)
// Focus:
// - Root causes and structural drivers, not surface observations
// - Quantified analysis with fundamental grounding
// - Professional skepticism with evidence-based conclusions
// - Value drivers, competitive moats, and risk assessment
// - Capital allocation discipline and management credibility

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

class QualitativeNarrativeService {
  constructor() {
    this.client = new Anthropic();
    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 2048;

    // Track generation stats
    this.stats = {
      calls: 0,
      totalTokens: 0,
    };
  }

  /**
   * Main entry point: Generate all narrative paragraphs for a company
   * @param {Object} dataPackage - Raw data from prismDataCollector
   * @returns {Object} - 5 narrative paragraphs with metadata
   */
  async generateNarratives(dataPackage) {
    const companyName = dataPackage.company?.name || dataPackage.symbol;
    const symbol = dataPackage.symbol;

    console.log(`\n📝 Generating qualitative narratives for ${companyName}...`);

    // Prepare data context for all prompts
    const context = this.prepareContext(dataPackage);

    // Generate narratives in parallel for speed
    const [
      companyStory,
      competitiveLandscape,
      managementVoice,
      riskNarrative,
      opportunityNarrative,
    ] = await Promise.all([
      this.generateCompanyStory(context),
      this.generateCompetitiveLandscape(context),
      this.generateManagementVoice(context),
      this.generateRiskNarrative(context),
      this.generateOpportunityNarrative(context),
    ]);

    console.log(`✅ Narratives generated (${this.stats.calls} API calls)`);

    return {
      companyStory,
      competitiveLandscape,
      managementVoice,
      riskNarrative,
      opportunityNarrative,
      metadata: {
        generatedAt: new Date().toISOString(),
        symbol,
        companyName,
        apiCalls: this.stats.calls,
      },
    };
  }

  /**
   * Prepare unified context from data package
   */
  prepareContext(dataPackage) {
    return {
      symbol: dataPackage.symbol,
      companyName: dataPackage.company?.name || dataPackage.symbol,
      sector: dataPackage.company?.sector,
      industry: dataPackage.company?.industry,
      marketCap: dataPackage.company?.marketCap,

      // Wikipedia data
      wikipedia: {
        summary: dataPackage.wikipedia?.summary,
        founded: dataPackage.wikipedia?.founded,
        founders: dataPackage.wikipedia?.founders,
        headquarters: dataPackage.wikipedia?.headquarters,
        keyPeople: dataPackage.wikipedia?.keyPeople,
        history: dataPackage.wikipedia?.history,
      },

      // SEC filing data
      secFiling: {
        businessDescription: dataPackage.secFiling?.businessDescription,
        riskFactors: dataPackage.secFiling?.riskFactors,
        mdaDiscussion: dataPackage.secFiling?.mdaDiscussion,
        competitionSection: dataPackage.secFiling?.competitionSection,
      },

      // Earnings transcripts
      transcripts: {
        latestCall: dataPackage.transcripts?.latest,
        preparedRemarks: dataPackage.transcripts?.latest?.preparedRemarks,
        qaSection: dataPackage.transcripts?.latest?.qaSection,
        managementTone: dataPackage.transcripts?.managementTone,
        keyQuotes: dataPackage.transcripts?.keyQuotes,
      },

      // News data
      news: {
        recent: dataPackage.news?.recent?.slice(0, 10),
        themes: dataPackage.news?.themes,
        sentiment: dataPackage.news?.sentimentSummary,
      },

      // Financial highlights
      financials: {
        revenue: dataPackage.financials?.annual?.[0]?.revenue,
        revenueGrowth: dataPackage.metrics?.trends?.revenue_growth_yoy,
        netIncome: dataPackage.financials?.annual?.[0]?.netIncome,
        grossMargin: dataPackage.metrics?.latest?.gross_margin,
        operatingMargin: dataPackage.metrics?.latest?.operating_margin,
        fcf: dataPackage.financials?.annual?.[0]?.freeCashFlow,
      },

      // Analyst data
      analyst: {
        targetMean: dataPackage.analyst?.estimates?.target_mean,
        targetHigh: dataPackage.analyst?.estimates?.target_high,
        targetLow: dataPackage.analyst?.estimates?.target_low,
        rating: dataPackage.analyst?.estimates?.rating,
        numAnalysts: dataPackage.analyst?.estimates?.number_of_analysts,
      },

      // Peer comparison data (for competitive context)
      peers: {
        available: !!dataPackage.peers?.comparisons,
        comparisons: dataPackage.peers?.comparisons?.slice(0, 5),
        percentileRanks: dataPackage.peers?.percentileRanks,
        sectorMedians: dataPackage.peers?.sectorMedians,
      },

      // Insider activity (for management voice)
      insiders: {
        netBuying: dataPackage.insiders?.summary?.netBuying,
        recentTransactions: dataPackage.insiders?.transactions?.slice(0, 5),
        signal: dataPackage.insiders?.signal,
      },

      // Institutional holdings (for opportunity narrative)
      institutional: {
        famousInvestors: dataPackage.institutional?.famousInvestors?.slice(0, 5),
        totalHolders: dataPackage.institutional?.ownershipSummary?.totalHolders,
        institutionalOwnership: dataPackage.institutional?.ownershipSummary?.institutionalOwnership,
      },

      // Extended metrics trends
      trends: {
        revenueGrowth: dataPackage.metrics?.trends?.revenue_growth_yoy,
        epsGrowth: dataPackage.metrics?.trends?.eps_growth_yoy,
        marginTrend: dataPackage.metrics?.trends?.operating_margin_trend,
        roicTrend: dataPackage.metrics?.trends?.roic_trend,
      },

      // Capital allocation (for opportunity/management)
      capitalAllocation: {
        buybackYield: dataPackage.capitalAllocation?.buybackYield,
        dividendYield: dataPackage.capitalAllocation?.dividendYield,
        totalReturn: dataPackage.capitalAllocation?.totalShareholderReturn,
      },
    };
  }

  /**
   * Generate Company Story narrative
   * Origin → Evolution → Current state (200-300 words)
   */
  async generateCompanyStory(context) {
    const prompt = this.buildCompanyStoryPrompt(context);

    try {
      const paragraph = await this.callClaude(prompt, 'companyStory');
      return {
        paragraph,
        keyFacts: this.extractKeyFacts(context),
        sources: this.identifySources(context, ['wikipedia', 'secFiling']),
        success: true,
      };
    } catch (error) {
      console.error('  Error generating companyStory:', error.message);
      return {
        paragraph: null,
        error: error.message,
        success: false,
      };
    }
  }

  buildCompanyStoryPrompt(context) {
    const hasWikipedia = context.wikipedia?.summary;
    const hasSec = context.secFiling?.businessDescription;

    return `You are a Vice President in Equity Research at Goldman Sachs, writing the Company Overview section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 200-300 word analytical narrative that explains how this company creates value and why its business model works (or doesn't).

${hasWikipedia ? `COMPANY BACKGROUND:
- Founded: ${context.wikipedia.founded || 'Unknown'}
- Founders: ${context.wikipedia.founders || 'Unknown'}
- Headquarters: ${context.wikipedia.headquarters || 'Unknown'}
- Overview: ${context.wikipedia.summary?.substring(0, 1500) || 'Not available'}
${context.wikipedia.history ? `- Key History: ${context.wikipedia.history.substring(0, 1000)}` : ''}
` : ''}

${hasSec ? `SEC 10-K BUSINESS DESCRIPTION:
${context.secFiling.businessDescription?.substring(0, 2000) || 'Not available'}
` : ''}

FINANCIAL SCALE:
- Market Cap: $${this.formatNumber(context.marketCap)}
- Revenue: $${this.formatNumber(context.financials?.revenue)}
- Gross Margin: ${context.financials?.grossMargin ? (context.financials.grossMargin * 100).toFixed(1) + '%' : 'N/A'}
- Operating Margin: ${context.financials?.operatingMargin ? (context.financials.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}
- Sector: ${context.sector} / ${context.industry}

WRITING STYLE - Investment Banking Equity Research:
1. Lead with the CORE VALUE PROPOSITION - what fundamental economic advantage does this business have?
2. Explain the business model mechanics - how does revenue flow, what drives margins?
3. Identify the KEY VALUE DRIVERS - the 2-3 factors that actually determine this company's worth
4. Connect historical evolution to current competitive position
5. Ground all observations in fundamentals (margins, returns, capital efficiency)
6. Be analytical and precise - every sentence should add insight
7. Write with the authority of someone who has done deep due diligence

TONE:
- Institutional, authoritative, analytically rigorous
- Focus on structural advantages and unit economics
- Identify root causes, not surface observations
- Professional skepticism where warranted
- No promotional language or superlatives

AVOID:
- Generic descriptions that could apply to any company
- Chronological history without analytical thread
- Buzzwords: "innovative", "disruptive", "cutting-edge", "industry-leading"
- Superficial observations without insight into WHY

The narrative should answer: "What is the fundamental economic engine of this business?"

Write the narrative now:`;
  }

  /**
   * Generate Competitive Landscape narrative
   * Market position, rivals, differentiation (200-300 words)
   */
  async generateCompetitiveLandscape(context) {
    const prompt = this.buildCompetitiveLandscapePrompt(context);

    try {
      const paragraph = await this.callClaude(prompt, 'competitiveLandscape');
      return {
        paragraph,
        competitors: this.extractCompetitors(context),
        sources: this.identifySources(context, ['secFiling', 'news']),
        success: true,
      };
    } catch (error) {
      console.error('  Error generating competitiveLandscape:', error.message);
      return {
        paragraph: null,
        error: error.message,
        success: false,
      };
    }
  }

  buildCompetitiveLandscapePrompt(context) {
    const hasCompetition = context.secFiling?.competitionSection;
    const hasPeers = context.peers?.available && context.peers?.comparisons?.length > 0;

    return `You are a Vice President in Equity Research at Morgan Stanley, writing the Competitive Position section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 200-300 word analytical narrative that dissects this company's competitive moat and market position with the rigor expected by institutional investors.

${hasCompetition ? `SEC 10-K COMPETITION SECTION:
${context.secFiling.competitionSection?.substring(0, 2500) || 'Not available'}
` : ''}

${context.secFiling?.businessDescription ? `BUSINESS CONTEXT:
${context.secFiling.businessDescription?.substring(0, 1500)}
` : ''}

MARKET POSITIONING DATA:
- Sector: ${context.sector}
- Industry: ${context.industry}
- Market Cap: $${this.formatNumber(context.marketCap)}
- Gross Margin: ${context.financials?.grossMargin ? (context.financials.grossMargin * 100).toFixed(1) + '%' : 'N/A'}
- Operating Margin: ${context.financials?.operatingMargin ? (context.financials.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}

${hasPeers ? `QUANTITATIVE PEER COMPARISON:
${context.peers.comparisons.map(p => `- ${p.symbol}: Market Cap $${this.formatNumber(p.marketCap)}, Margin ${p.operatingMargin ? (p.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}`).join('\n')}

PERCENTILE RANKINGS VS PEERS:
${context.peers.percentileRanks ? Object.entries(context.peers.percentileRanks).map(([metric, rank]) => `- ${metric}: ${rank}th percentile`).join('\n') : 'Not available'}
` : ''}

${context.news?.themes?.length > 0 ? `RECENT NEWS THEMES: ${context.news.themes.map(t => t.theme).join(', ')}` : ''}

ANALYTICAL FRAMEWORK - Institutional Quality:
1. IDENTIFY THE MOAT SOURCE - Is it scale, network effects, switching costs, brand, regulatory capture, or cost advantage? Be specific.
2. QUANTIFY THE ADVANTAGE - Use margin differentials, market share data, pricing power evidence
3. ASSESS MOAT DURABILITY - What threatens the competitive position? How defensible is it?
4. EXPLAIN THE STRUCTURAL DYNAMICS - Why does this industry structure favor or disfavor the company?
5. ANALYZE COMPETITIVE INTENSITY - Porter-style assessment of rivalry, substitution threats, buyer/supplier power
${hasPeers ? '6. USE PEER DATA AS EVIDENCE - "Operating margins 400bps above peer median signal pricing power" is better than "outperforming peers"' : ''}

TONE:
- Analytical and evidence-based
- Focus on structural and sustainable advantages, not temporary wins
- Acknowledge competitive threats with appropriate gravity
- Professional skepticism where moat claims seem overstated
- Every assertion backed by data or logical reasoning

AVOID:
- Vague claims like "strong competitive position" without evidence
- Generic industry descriptions
- Promotional language about market leadership
- Surface-level competitor lists without strategic analysis

The narrative should answer: "What is the source and durability of this company's competitive advantage, and how is it reflected in financial performance?"

Write the competitive landscape narrative now:`;
  }

  /**
   * Generate Management Voice narrative
   * What leadership is saying, with woven quotes (150-250 words)
   */
  async generateManagementVoice(context) {
    // First, extract key quotes if we have transcripts
    let keyQuotes = [];
    if (context.transcripts?.preparedRemarks || context.transcripts?.qaSection) {
      keyQuotes = await this.extractKeyQuotes(context);
    }

    const prompt = this.buildManagementVoicePrompt(context, keyQuotes);

    try {
      const paragraph = await this.callClaude(prompt, 'managementVoice');
      return {
        paragraph,
        keyQuotes,
        tone: this.assessManagementTone(context),
        sources: this.identifySources(context, ['transcripts']),
        success: true,
      };
    } catch (error) {
      console.error('  Error generating managementVoice:', error.message);
      return {
        paragraph: null,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Extract key quotes from earnings transcripts
   */
  async extractKeyQuotes(context, maxQuotes = 4) {
    const transcript = context.transcripts?.preparedRemarks || '';
    const qa = context.transcripts?.qaSection || '';

    if (!transcript && !qa) {
      return [];
    }

    const prompt = `Extract the ${maxQuotes} most insightful and quotable statements from this earnings call transcript.

TRANSCRIPT EXCERPTS:
${transcript.substring(0, 3000)}

${qa ? `Q&A SECTION:
${qa.substring(0, 2000)}` : ''}

For each quote, provide JSON in this exact format:
[
  {
    "quote": "The exact quote, verbatim, 1-2 sentences max",
    "speaker": "Name and title if known",
    "context": "What prompted this statement",
    "significance": "Why this quote matters for investors"
  }
]

Focus on quotes that reveal:
- Strategic direction or major pivots
- Confidence or caution about future performance
- Competitive positioning statements
- Challenges management is acknowledging
- Forward guidance or outlook

Return ONLY the JSON array, no other text.`;

    try {
      const response = await this.callClaude(prompt, 'quoteExtraction');
      return JSON.parse(response);
    } catch (error) {
      console.error('  Error extracting quotes:', error.message);
      return [];
    }
  }

  buildManagementVoicePrompt(context, keyQuotes) {
    const hasTranscripts = context.transcripts?.preparedRemarks || keyQuotes.length > 0;
    const tone = context.transcripts?.managementTone?.tone || 'unknown';
    const hasInsiderActivity = context.insiders?.signal || context.insiders?.recentTransactions?.length > 0;

    return `You are a Vice President in Equity Research at J.P. Morgan, writing the Management Assessment section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 150-250 word analytical assessment of management's strategic messaging, capital allocation philosophy, and execution credibility. This is NOT a summary of what they said—it's an EVALUATION of their strategy and track record.

${hasTranscripts ? `MANAGEMENT TONE ASSESSMENT: ${tone}

KEY STATEMENTS TO ANALYZE:
${keyQuotes.map((q, i) => `${i + 1}. "${q.quote}" - ${q.speaker || 'Management'}
   Context: ${q.context}
   Significance: ${q.significance}`).join('\n\n')}
` : 'No recent earnings transcript available. Base assessment on SEC filings and capital allocation history.'}

${context.secFiling?.mdaDiscussion ? `MD&A - MANAGEMENT'S STATED STRATEGY:
${context.secFiling.mdaDiscussion.substring(0, 1500)}
` : ''}

${hasInsiderActivity ? `INSIDER ACTIVITY - REVEALED PREFERENCES:
- Net Position: ${context.insiders.netBuying ? 'Insiders are net buyers - alignment signal' : context.insiders.netBuying === false ? 'Insiders are net sellers - worth scrutiny' : 'Mixed activity'}
- Signal Interpretation: ${context.insiders.signal?.direction || 'Neutral'} - ${context.insiders.signal?.reason || 'No significant pattern'}
${context.insiders.recentTransactions?.length > 0 ? `- Recent Transactions: ${context.insiders.recentTransactions.slice(0, 3).map(t => `${t.insiderName || 'Insider'} ${t.transactionType} $${this.formatNumber(t.value)}`).join(', ')}` : ''}
` : ''}

COMPANY CONTEXT:
- Company: ${context.companyName} (${context.symbol})
- Leadership: ${context.wikipedia?.keyPeople || 'Unknown'}
- Recent Revenue Growth: ${context.trends?.revenueGrowth ? (context.trends.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- EPS Growth: ${context.trends?.epsGrowth ? (context.trends.epsGrowth * 100).toFixed(1) + '%' : 'N/A'}

ANALYTICAL FRAMEWORK - Institutional Quality:
1. EVALUATE STRATEGIC CLARITY - Does management articulate clear priorities, or are they scattering focus across too many initiatives?
2. ASSESS CAPITAL ALLOCATION DISCIPLINE - How have they deployed capital? Buybacks at highs? Acquisitions that destroyed value? Prudent reinvestment?
3. IDENTIFY EXECUTION TRACK RECORD - Have they delivered on past guidance? What's the pattern of beats/misses?
4. ANALYZE INCENTIVE ALIGNMENT - How is management compensated? Does insider activity confirm or contradict public messaging?
5. DETECT LANGUAGE PATTERNS - What does management emphasize repeatedly? What questions do they deflect?
6. COMPARE WORDS TO RESULTS - Are the financial results consistent with strategic claims?

TONE:
- Analytical assessment, not transcription
- Professional skepticism toward corporate messaging
- Evidence-based judgments on management quality
- Acknowledge both strengths and areas of concern
- Institutional investor perspective: "Would I trust this team with capital?"

AVOID:
- Simply summarizing what management said
- Promotional language or taking claims at face value
- Generic praise like "experienced management team"
- Missing the signal in insider selling when management is bullish

The narrative should answer: "Is this management team credible, aligned with shareholders, and executing well?"

Write the management assessment narrative now:`;
  }

  /**
   * Generate Risk Narrative
   * Key risks told as a story (200-300 words)
   */
  async generateRiskNarrative(context) {
    const prompt = this.buildRiskNarrativePrompt(context);

    try {
      const paragraph = await this.callClaude(prompt, 'riskNarrative');
      return {
        paragraph,
        topRisks: this.extractTopRisks(context),
        sources: this.identifySources(context, ['secFiling', 'news']),
        success: true,
      };
    } catch (error) {
      console.error('  Error generating riskNarrative:', error.message);
      return {
        paragraph: null,
        error: error.message,
        success: false,
      };
    }
  }

  buildRiskNarrativePrompt(context) {
    const hasRiskFactors = context.secFiling?.riskFactors;

    return `You are a Vice President in Equity Research at Goldman Sachs, writing the Key Risks section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 200-300 word analytical assessment of the 2-3 most material risks that could impair the investment thesis. This is NOT a summary of 10-K boilerplate—it's a distillation of what actually matters.

${hasRiskFactors ? `SEC 10-K RISK FACTORS (raw material to analyze):
${context.secFiling.riskFactors?.substring(0, 3000)}
` : 'SEC risk factors not available.'}

${context.news?.sentiment?.overallSentiment === 'negative' ? `RECENT NEGATIVE DEVELOPMENTS:
${context.news.themes?.filter(t => t.sentiment === 'negative').map(t => t.theme).join(', ') || 'None identified'}
` : ''}

FINANCIAL CONTEXT:
- Sector: ${context.sector} / ${context.industry}
- Market Cap: $${this.formatNumber(context.marketCap)}
- Operating Margin: ${context.financials?.operatingMargin ? (context.financials.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}
- Gross Margin: ${context.financials?.grossMargin ? (context.financials.grossMargin * 100).toFixed(1) + '%' : 'N/A'}
- Revenue: $${this.formatNumber(context.financials?.revenue)}

ANALYTICAL FRAMEWORK - Institutional Quality:
1. IDENTIFY ROOT CAUSE RISKS - What are the fundamental vulnerabilities in the business model? (Not symptoms, but structural weaknesses)
2. QUANTIFY EXPOSURE - Use specific data: "18% of revenue from China" is meaningful; "international exposure" is not
3. ANALYZE TRANSMISSION MECHANISM - HOW does each risk translate to earnings impact? Through revenue, margins, or multiple compression?
4. ASSESS PROBABILITY AND MAGNITUDE - What's the likelihood, and what's the potential impact range?
5. CONNECT TO VALUATION - A risk that could compress the multiple 20% matters more than one that might reduce revenue 2%
6. DISTINGUISH IDIOSYNCRATIC FROM SYSTEMATIC - What's specific to this company vs. sector-wide?

PRIORITIZATION:
- Focus on MATERIAL risks that could change the investment conclusion
- Ignore boilerplate risks that apply to every company
- Highlight risks where the market may be complacent
- Note any risks that are already priced in vs. underappreciated

TONE:
- Sober and analytical, not alarmist
- Quantified where possible
- Acknowledge uncertainty ranges
- Professional risk management perspective: "What could go wrong, and how bad could it get?"

AVOID:
- Copying 10-K language verbatim
- Generic risks (competition, regulation, macro) without company-specific analysis
- Listing 5+ risks when 2-3 are truly material
- Being dismissive of real threats

The narrative should answer: "What are the specific scenarios that could materially impair this investment, and how exposed is the company?"

Write the risk assessment narrative now:`;
  }

  /**
   * Generate Opportunity Narrative
   * Growth story and catalysts (200-300 words)
   */
  async generateOpportunityNarrative(context) {
    const prompt = this.buildOpportunityNarrativePrompt(context);

    try {
      const paragraph = await this.callClaude(prompt, 'opportunityNarrative');
      return {
        paragraph,
        catalysts: this.extractCatalysts(context),
        sources: this.identifySources(context, ['secFiling', 'transcripts', 'news']),
        success: true,
      };
    } catch (error) {
      console.error('  Error generating opportunityNarrative:', error.message);
      return {
        paragraph: null,
        error: error.message,
        success: false,
      };
    }
  }

  buildOpportunityNarrativePrompt(context) {
    const hasFamousInvestors = context.institutional?.famousInvestors?.length > 0;
    const hasCapitalReturn = context.capitalAllocation?.buybackYield || context.capitalAllocation?.dividendYield;

    return `You are a Vice President in Equity Research at Morgan Stanley, writing the Growth Catalysts & Opportunity section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 200-300 word analytical assessment of the 2-3 most credible value creation opportunities. This is NOT promotional—it's a rigorous analysis of what could drive upside from current levels.

${context.secFiling?.businessDescription ? `BUSINESS MODEL:
${context.secFiling.businessDescription?.substring(0, 1500)}
` : ''}

${context.secFiling?.mdaDiscussion ? `MD&A - MANAGEMENT'S STATED GROWTH INITIATIVES:
${context.secFiling.mdaDiscussion?.substring(0, 1500)}
` : ''}

${context.news?.themes?.length > 0 ? `RECENT NEWS THEMES: ${context.news.themes.map(t => `${t.theme} (${t.count} articles)`).join(', ')}` : ''}

FUNDAMENTAL TRAJECTORY:
- Revenue: $${this.formatNumber(context.financials?.revenue)}
- Revenue Growth: ${context.trends?.revenueGrowth ? (context.trends.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- EPS Growth: ${context.trends?.epsGrowth ? (context.trends.epsGrowth * 100).toFixed(1) + '%' : 'N/A'}
- Operating Margin: ${context.financials?.operatingMargin ? (context.financials.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}
- Analyst Target (Mean): $${context.analyst?.targetMean || 'N/A'}
- Analyst Consensus: ${context.analyst?.rating || 'N/A'}

${hasFamousInvestors ? `INSTITUTIONAL POSITIONING:
Notable investors: ${context.institutional.famousInvestors.map(i => i.investorName || i.name).join(', ')}
Institutional Ownership: ${context.institutional.institutionalOwnership ? (context.institutional.institutionalOwnership * 100).toFixed(1) + '%' : 'N/A'}
` : ''}

${hasCapitalReturn ? `CAPITAL RETURN ANALYSIS:
- Buyback Yield: ${context.capitalAllocation.buybackYield ? (context.capitalAllocation.buybackYield * 100).toFixed(1) + '%' : 'N/A'}
- Dividend Yield: ${context.capitalAllocation.dividendYield ? (context.capitalAllocation.dividendYield * 100).toFixed(1) + '%' : 'N/A'}
- Total Shareholder Yield: ${context.capitalAllocation.totalReturn ? (context.capitalAllocation.totalReturn * 100).toFixed(1) + '%' : 'N/A'}
` : ''}

ANALYTICAL FRAMEWORK - Institutional Quality:
1. IDENTIFY VALUE CREATION LEVERS - Where can this company credibly grow earnings? Through revenue growth, margin expansion, capital return, or multiple expansion?
2. QUANTIFY THE OPPORTUNITY - "TAM of $50B with 5% market share implies runway" is better than "large addressable market"
3. ASSESS EXECUTION PROBABILITY - What's the track record? Is this management capable of delivering?
4. CONNECT TO FUNDAMENTALS - Every opportunity should translate to revenue, margins, or cash flow—trace the path
5. ANALYZE WHAT'S NOT PRICED IN - Where might the market be underestimating this company?
6. ACKNOWLEDGE EXECUTION RISKS - Every opportunity has obstacles; credibility requires addressing them

RETURN DECOMPOSITION PERSPECTIVE:
- Revenue growth contribution
- Margin expansion potential
- Capital return yield
- Multiple re-rating possibility (if undervalued)

TONE:
- Analytically rigorous, not promotional
- Grounded in fundamentals and reasonable assumptions
- Acknowledge what must go right for upside to materialize
- Institutional investor perspective: "What's the credible path to value creation?"

AVOID:
- Promotional language or management-speak
- Generic growth narratives ("AI opportunity", "digital transformation") without specific impact
- Ignoring execution challenges
- Overstating TAM without share gain analysis

The narrative should answer: "What are the specific, quantifiable drivers that could create value from current levels, and how realistic are they?"

Write the growth opportunity narrative now:`;
  }

  // =============================================================================
  // CATEGORY ANALYSIS - Deep Dive per Scorecard Category
  // =============================================================================

  /**
   * Generate all 4 category analyses for BusinessAnalysisCards
   * Returns structured object matching frontend expectations
   */
  async generateCategoryAnalyses(context, scorecard) {
    console.log('  Generating category analyses...');

    const [financial, competitive, market, management] = await Promise.all([
      this.generateFinancialAnalysis(context, scorecard),
      this.generateCompetitiveAnalysis(context, scorecard),
      this.generateMarketAnalysis(context, scorecard),
      this.generateManagementAnalysis(context, scorecard),
    ]);

    return {
      financial,
      competitive,
      market,
      management,
    };
  }

  /**
   * Financial Strength Analysis
   */
  async generateFinancialAnalysis(context, scorecard) {
    const prompt = this.buildFinancialAnalysisPrompt(context, scorecard);

    try {
      const response = await this.callClaude(prompt, 'financialAnalysis');
      const parsed = this.parseAnalysisResponse(response);
      return {
        narrative: parsed.narrative,
        keyPoints: parsed.keyPoints,
        success: true,
      };
    } catch (error) {
      console.error('  Error generating financial analysis:', error.message);
      return { narrative: null, keyPoints: [], success: false };
    }
  }

  buildFinancialAnalysisPrompt(context, scorecard) {
    const financialFactors = scorecard?.factors?.financial || {};

    return `You are a Vice President in Equity Research at Goldman Sachs, writing the Financial Strength section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 150-200 word analytical narrative assessing the company's financial foundation, plus 3-4 key data points.

SCORECARD DATA:
${Object.entries(financialFactors).map(([k, v]) => `- ${k}: ${v?.score || 'N/A'}/5 [${v?.confidence || 'N/A'}] - ${v?.justification || ''}`).join('\n')}

FINANCIAL METRICS:
- Revenue: $${this.formatNumber(context.financials?.revenue)}
- Revenue Growth: ${context.trends?.revenueGrowth ? (context.trends.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- Gross Margin: ${context.financials?.grossMargin ? (context.financials.grossMargin * 100).toFixed(1) + '%' : 'N/A'}
- Operating Margin: ${context.financials?.operatingMargin ? (context.financials.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}
- FCF: $${this.formatNumber(context.financials?.fcf)}
- Debt/Equity: ${context.financials?.debtToEquity?.toFixed(2) || 'N/A'}

ANALYTICAL FOCUS:
1. CAPITAL EFFICIENCY - How effectively does this company convert invested capital into returns? ROIC vs WACC spread?
2. MARGIN QUALITY - Are margins sustainable, expanding, or under pressure? What drives margin performance?
3. CASH CONVERSION - How much of reported earnings converts to actual cash? Working capital efficiency?
4. BALANCE SHEET STRENGTH - Is the capital structure appropriate? Debt serviceability?

TONE: Institutional, quantified, analytical. Focus on what the numbers reveal about business quality.

FORMAT YOUR RESPONSE AS:
NARRATIVE:
[Your 150-200 word analysis here]

KEY POINTS:
- [Specific quantified insight 1]
- [Specific quantified insight 2]
- [Specific quantified insight 3]

Write the financial analysis now:`;
  }

  /**
   * Competitive Position Analysis
   */
  async generateCompetitiveAnalysis(context, scorecard) {
    const prompt = this.buildCompetitiveAnalysisPrompt(context, scorecard);

    try {
      const response = await this.callClaude(prompt, 'competitiveAnalysis');
      const parsed = this.parseAnalysisResponse(response);
      return {
        narrative: parsed.narrative,
        keyPoints: parsed.keyPoints,
        success: true,
      };
    } catch (error) {
      console.error('  Error generating competitive analysis:', error.message);
      return { narrative: null, keyPoints: [], success: false };
    }
  }

  buildCompetitiveAnalysisPrompt(context, scorecard) {
    const competitiveFactors = scorecard?.factors?.competitive || {};
    const hasPeers = context.peers?.available && context.peers?.comparisons?.length > 0;

    return `You are a Vice President in Equity Research at Morgan Stanley, writing the Competitive Position section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 150-200 word analytical narrative assessing competitive moat and market position, plus 3-4 key data points.

SCORECARD DATA:
${Object.entries(competitiveFactors).map(([k, v]) => `- ${k}: ${v?.score || 'N/A'}/5 [${v?.confidence || 'N/A'}] - ${v?.justification || ''}`).join('\n')}

${context.secFiling?.competitionSection ? `SEC 10-K COMPETITION:
${context.secFiling.competitionSection.substring(0, 1500)}
` : ''}

${hasPeers ? `PEER COMPARISON:
${context.peers.comparisons.map(p => `- ${p.symbol}: Margin ${p.operatingMargin ? (p.operatingMargin * 100).toFixed(1) + '%' : 'N/A'}`).join('\n')}
` : ''}

POSITIONING DATA:
- Market Cap: $${this.formatNumber(context.marketCap)}
- Gross Margin: ${context.financials?.grossMargin ? (context.financials.grossMargin * 100).toFixed(1) + '%' : 'N/A'}
- Sector: ${context.sector} / ${context.industry}

ANALYTICAL FOCUS:
1. MOAT SOURCE - Scale, network effects, switching costs, brand, IP, regulatory? Be specific.
2. MOAT DURABILITY - What threatens the competitive position? How defensible?
3. MARKET SHARE TRAJECTORY - Gaining, maintaining, or losing ground?
4. PRICING POWER - Can they raise prices without losing volume? Evidence?

TONE: Institutional, evidence-based. Every claim backed by data or logical reasoning.

FORMAT YOUR RESPONSE AS:
NARRATIVE:
[Your 150-200 word analysis here]

KEY POINTS:
- [Specific insight about moat/position 1]
- [Specific insight about moat/position 2]
- [Specific insight about moat/position 3]

Write the competitive analysis now:`;
  }

  /**
   * Market Dynamics Analysis
   */
  async generateMarketAnalysis(context, scorecard) {
    const prompt = this.buildMarketAnalysisPrompt(context, scorecard);

    try {
      const response = await this.callClaude(prompt, 'marketAnalysis');
      const parsed = this.parseAnalysisResponse(response);
      return {
        narrative: parsed.narrative,
        keyPoints: parsed.keyPoints,
        success: true,
      };
    } catch (error) {
      console.error('  Error generating market analysis:', error.message);
      return { narrative: null, keyPoints: [], success: false };
    }
  }

  buildMarketAnalysisPrompt(context, scorecard) {
    const marketFactors = scorecard?.factors?.market || {};

    return `You are a Vice President in Equity Research at J.P. Morgan, writing the Market Dynamics section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 150-200 word analytical narrative assessing market opportunity and industry dynamics, plus 3-4 key data points.

SCORECARD DATA:
${Object.entries(marketFactors).map(([k, v]) => `- ${k}: ${v?.score || 'N/A'}/5 [${v?.confidence || 'N/A'}] - ${v?.justification || ''}`).join('\n')}

${context.secFiling?.businessDescription ? `BUSINESS DESCRIPTION:
${context.secFiling.businessDescription.substring(0, 1500)}
` : ''}

${context.news?.themes?.length > 0 ? `RECENT NEWS THEMES: ${context.news.themes.map(t => t.theme).join(', ')}` : ''}

MARKET CONTEXT:
- Sector: ${context.sector}
- Industry: ${context.industry}
- Company Revenue Growth: ${context.trends?.revenueGrowth ? (context.trends.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}

ANALYTICAL FOCUS:
1. TAM/SAM/SOM - What's the realistic addressable opportunity? Quantify if possible.
2. MARKET GROWTH - Is the underlying market expanding, stable, or contracting?
3. SECULAR TRENDS - What structural forces shape this market? Tailwinds or headwinds?
4. CYCLICALITY - How sensitive is demand to economic conditions?

TONE: Institutional, forward-looking but grounded in data. Avoid promotional TAM claims.

FORMAT YOUR RESPONSE AS:
NARRATIVE:
[Your 150-200 word analysis here]

KEY POINTS:
- [Specific market insight 1]
- [Specific market insight 2]
- [Specific market insight 3]

Write the market analysis now:`;
  }

  /**
   * Management Quality Analysis
   */
  async generateManagementAnalysis(context, scorecard) {
    const prompt = this.buildManagementAnalysisPrompt(context, scorecard);

    try {
      const response = await this.callClaude(prompt, 'managementAnalysis');
      const parsed = this.parseAnalysisResponse(response);
      return {
        narrative: parsed.narrative,
        keyPoints: parsed.keyPoints,
        success: true,
      };
    } catch (error) {
      console.error('  Error generating management analysis:', error.message);
      return { narrative: null, keyPoints: [], success: false };
    }
  }

  buildManagementAnalysisPrompt(context, scorecard) {
    const managementFactors = scorecard?.factors?.management || {};
    const hasInsiders = context.insiders?.recentTransactions?.length > 0;

    return `You are a Vice President in Equity Research at Goldman Sachs, writing the Management Quality section of an institutional research report on ${context.companyName} (${context.symbol}).

Your task: Write a 150-200 word analytical narrative assessing management credibility and capital allocation, plus 3-4 key data points.

SCORECARD DATA:
${Object.entries(managementFactors).map(([k, v]) => `- ${k}: ${v?.score || 'N/A'}/5 [${v?.confidence || 'N/A'}] - ${v?.justification || ''}`).join('\n')}

LEADERSHIP:
- Key People: ${context.wikipedia?.keyPeople || 'Unknown'}

${hasInsiders ? `INSIDER ACTIVITY:
- Net Position: ${context.insiders.netBuying ? 'Net Buyers' : context.insiders.netBuying === false ? 'Net Sellers' : 'Mixed'}
- Recent: ${context.insiders.recentTransactions.slice(0, 3).map(t => `${t.insiderName || 'Insider'} ${t.transactionType}`).join(', ')}
` : ''}

CAPITAL ALLOCATION:
- Buyback Yield: ${context.capitalAllocation?.buybackYield ? (context.capitalAllocation.buybackYield * 100).toFixed(1) + '%' : 'N/A'}
- Dividend Yield: ${context.capitalAllocation?.dividendYield ? (context.capitalAllocation.dividendYield * 100).toFixed(1) + '%' : 'N/A'}

PERFORMANCE:
- Revenue Growth: ${context.trends?.revenueGrowth ? (context.trends.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- EPS Growth: ${context.trends?.epsGrowth ? (context.trends.epsGrowth * 100).toFixed(1) + '%' : 'N/A'}

ANALYTICAL FOCUS:
1. CAPITAL ALLOCATION DISCIPLINE - Prudent reinvestment? Buybacks at right price? M&A track record?
2. EXECUTION TRACK RECORD - Do they deliver on guidance? Pattern of beats/misses?
3. INCENTIVE ALIGNMENT - How is management compensated? Insider ownership significant?
4. STRATEGIC CLARITY - Clear priorities or scattered focus?

TONE: Professional skepticism. Evaluate, don't summarize. Actions over words.

FORMAT YOUR RESPONSE AS:
NARRATIVE:
[Your 150-200 word analysis here]

KEY POINTS:
- [Specific management insight 1]
- [Specific management insight 2]
- [Specific management insight 3]

Write the management analysis now:`;
  }

  /**
   * Parse analysis response into narrative and key points
   */
  parseAnalysisResponse(response) {
    const narrative = response.match(/NARRATIVE:\s*([\s\S]*?)(?=KEY POINTS:|$)/i)?.[1]?.trim() || response;
    const keyPointsMatch = response.match(/KEY POINTS:\s*([\s\S]*?)$/i)?.[1];

    let keyPoints = [];
    if (keyPointsMatch) {
      keyPoints = keyPointsMatch
        .split('\n')
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    return { narrative, keyPoints };
  }

  /**
   * Call Claude API
   */
  async callClaude(prompt, section) {
    this.stats.calls++;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0]?.text || '';
      this.stats.totalTokens += response.usage?.output_tokens || 0;

      return content.trim();
    } catch (error) {
      console.error(`  Claude API error (${section}):`, error.message);
      throw error;
    }
  }

  /**
   * Helper: Format large numbers
   */
  formatNumber(num) {
    if (!num) return 'N/A';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toLocaleString();
  }

  /**
   * Helper: Extract key facts from context
   */
  extractKeyFacts(context) {
    const facts = [];
    if (context.wikipedia?.founded) facts.push(`Founded ${context.wikipedia.founded}`);
    if (context.wikipedia?.founders) facts.push(`Founders: ${context.wikipedia.founders}`);
    if (context.wikipedia?.headquarters) facts.push(`HQ: ${context.wikipedia.headquarters}`);
    if (context.financials?.revenue) facts.push(`Revenue: $${this.formatNumber(context.financials.revenue)}`);
    if (context.marketCap) facts.push(`Market Cap: $${this.formatNumber(context.marketCap)}`);
    return facts;
  }

  /**
   * Helper: Extract competitors mentioned
   */
  extractCompetitors(context) {
    // This would ideally use NLP - simplified for now
    const competitionText = context.secFiling?.competitionSection || '';
    // Return empty array - can be enhanced with NLP later
    return [];
  }

  /**
   * Helper: Extract top risks
   */
  extractTopRisks(context) {
    // Simplified - would use NLP in production
    return [];
  }

  /**
   * Helper: Extract growth catalysts
   */
  extractCatalysts(context) {
    // Simplified - would use NLP in production
    return [];
  }

  /**
   * Helper: Assess management tone
   */
  assessManagementTone(context) {
    return context.transcripts?.managementTone?.tone || 'neutral';
  }

  /**
   * Helper: Identify which sources were used
   */
  identifySources(context, types) {
    const sources = [];
    if (types.includes('wikipedia') && context.wikipedia?.summary) {
      sources.push('Wikipedia');
    }
    if (types.includes('secFiling') && (context.secFiling?.businessDescription || context.secFiling?.riskFactors)) {
      sources.push('SEC 10-K');
    }
    if (types.includes('transcripts') && context.transcripts?.preparedRemarks) {
      sources.push('Earnings Transcript');
    }
    if (types.includes('news') && context.news?.recent?.length > 0) {
      sources.push('News Articles');
    }
    return sources;
  }
}

module.exports = QualitativeNarrativeService;
