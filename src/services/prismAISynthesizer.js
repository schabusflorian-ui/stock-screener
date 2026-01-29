// src/services/prismAISynthesizer.js
// AI-powered synthesis layer for generating institutional-quality equity research
// This is where raw data becomes Fyva-quality narratives

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

class PRISMAISynthesizer {
  constructor() {
    this.client = new Anthropic();
    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 4096;
  }

  /**
   * Generate a complete institutional-quality equity research report
   * @param {Object} dataPackage - Comprehensive data from PRISMDataCollector
   * @param {Object} scorecard - PRISM scorecard from PRISMScorer
   * @returns {Object} AI-synthesized report sections
   */
  async synthesizeReport(dataPackage, scorecard) {
    console.log(`\n🤖 AI Synthesis starting for ${dataPackage.symbol}...`);

    const synthesizedReport = {
      conclusion: null,
      companyOverview: null,
      businessAnalysis: null,
      whatMatters: null,
      investmentPositives: null,
      investmentRisks: null,
      outlook: null,
      keyMetricsTable: null,
      generationMeta: {
        model: this.model,
        generatedAt: new Date().toISOString(),
        dataQuality: dataPackage.dataQuality.overall
      }
    };

    try {
      // Generate sections in parallel where possible
      const [
        conclusion,
        companyOverview,
        businessAnalysis,
        whatMatters,
        positivesAndRisks
      ] = await Promise.all([
        this.generateConclusion(dataPackage, scorecard),
        this.generateCompanyOverview(dataPackage),
        this.generateBusinessAnalysis(dataPackage, scorecard),
        this.generateWhatMatters(dataPackage, scorecard),
        this.generatePositivesAndRisks(dataPackage, scorecard)
      ]);

      synthesizedReport.conclusion = conclusion;
      synthesizedReport.companyOverview = companyOverview;
      synthesizedReport.businessAnalysis = businessAnalysis;
      synthesizedReport.whatMatters = whatMatters;
      synthesizedReport.investmentPositives = positivesAndRisks.positives;
      synthesizedReport.investmentRisks = positivesAndRisks.risks;

      // Generate key metrics table (data-driven, no AI needed)
      synthesizedReport.keyMetricsTable = this.generateKeyMetricsTable(dataPackage);

      console.log(`✅ AI Synthesis complete for ${dataPackage.symbol}`);

    } catch (error) {
      console.error('❌ AI Synthesis error:', error.message);
      throw error;
    }

    return synthesizedReport;
  }

  // ============================================
  // CONCLUSION / EXECUTIVE SUMMARY
  // ============================================

  async generateConclusion(dataPackage, scorecard) {
    const prompt = `You are an elite equity research analyst writing the executive summary/conclusion for an institutional-quality investment report.

COMPANY: ${dataPackage.company.name} (${dataPackage.symbol})
SECTOR: ${dataPackage.company.sector} / ${dataPackage.company.industry}

PRISM SCORE: ${scorecard.overallScore}/10
KEY SCORECARD FACTORS:
${this.formatScorecardForPrompt(scorecard)}

FINANCIAL HIGHLIGHTS:
${this.formatFinancialsForPrompt(dataPackage)}

RECENT NEWS THEMES: ${dataPackage.news.themes?.map(t => t.theme).join(', ') || 'None available'}
NEWS SENTIMENT: ${dataPackage.news.sentimentSummary?.overallSentiment || 'Unknown'}

INSIDER ACTIVITY: ${dataPackage.insiders.netActivity?.signal || 'No data'}

EARNINGS CALL TRANSCRIPT INSIGHTS:
${this.formatTranscriptInsights(dataPackage)}

SEC 10-K BUSINESS DESCRIPTION (excerpt):
${this.truncateText(dataPackage.secFiling.businessDescription, 2000)}

Write a compelling 2-3 paragraph executive conclusion that:
1. Opens with a definitive statement about whether this is a buy/hold/avoid opportunity (based on PRISM score)
2. Identifies the 2-3 most critical factors driving the investment thesis
3. Acknowledges the key risks but frames them in context
4. Concludes with a clear perspective on the risk/reward profile

IMPORTANT: Write in first person ("I view...", "I believe...") like an analyst giving their opinion.
Be specific with numbers and metrics. Avoid generic statements.

Return ONLY the conclusion text, no headers or labels.`;

    return await this.callClaude(prompt);
  }

  // ============================================
  // COMPANY OVERVIEW
  // ============================================

  async generateCompanyOverview(dataPackage) {
    const prompt = `You are an elite equity research analyst writing the Company Overview section.

COMPANY: ${dataPackage.company.name} (${dataPackage.symbol})
SECTOR: ${dataPackage.company.sector} / ${dataPackage.company.industry}
EXCHANGE: ${dataPackage.company.exchange || 'N/A'}
COUNTRY: ${dataPackage.company.country || 'N/A'}

WIKIPEDIA COMPANY INFORMATION:
${this.formatWikipediaForPrompt(dataPackage)}

BUSINESS DESCRIPTION FROM 10-K:
${this.truncateText(dataPackage.secFiling.businessDescription, 3500)}

COMPETITION SECTION FROM 10-K:
${this.truncateText(dataPackage.secFiling.competitionSection, 1500)}

KEY FINANCIAL METRICS:
- Latest Revenue: $${this.formatNumber(dataPackage.financials.latest?.total_revenue)}
- Employees: ${dataPackage.secFiling.keyMetrics?.employeeCount || dataPackage.wikipedia?.employees || 'N/A'}
- Market Position: ${dataPackage.secFiling.extractedInsights?.marketPositioning || 'N/A'}

RECENT NEWS THEMES: ${dataPackage.news.themes?.map(t => t.theme).join(', ') || 'None'}

Write a comprehensive Company Overview with these sub-sections:

1. **Company Summary** (1 paragraph): What does this company do? What is its core value proposition? Position in the industry? Include founding date and key milestones if available.

2. **Business Model** (1 paragraph): How does the company make money? What are the key revenue drivers?

3. **Competitive Position** (1 paragraph): Who are the main competitors? What differentiates this company?

4. **Recent Developments** (1 paragraph): What are the most significant recent events or strategic moves based on the news themes?

Format with markdown headers (##) for each sub-section.
Be specific with details from the filings and Wikipedia. Use numbers where available.
Write in an objective, analytical tone suitable for institutional investors.`;

    return await this.callClaude(prompt);
  }

  // ============================================
  // BUSINESS ANALYSIS (Scorecard Narrative)
  // ============================================

  async generateBusinessAnalysis(dataPackage, scorecard) {
    const prompt = `You are an elite equity research analyst writing the Business Analysis section based on a proprietary scorecard.

COMPANY: ${dataPackage.company.name} (${dataPackage.symbol})

PRISM SCORECARD (Each factor scored 1-5):
${this.formatDetailedScorecardForPrompt(scorecard)}

FINANCIAL DATA:
${this.formatFinancialsForPrompt(dataPackage)}

PEER COMPARISON:
${this.formatPeerComparisonForPrompt(dataPackage)}

INSIDER ACTIVITY: ${dataPackage.insiders.netActivity?.signal || 'No significant activity'}
${dataPackage.insiders.keyInsiders?.length > 0 ? `Notable insiders: ${dataPackage.insiders.keyInsiders.map(i => `${i.insider_title}: ${i.transaction_type}`).join(', ')}` : ''}

10-K RISK FACTORS (excerpt):
${this.truncateText(dataPackage.secFiling.riskFactors, 1500)}

Write a comprehensive Business Analysis section that:

1. **Scorecard Summary** (formatted table showing all 11 factors with scores and brief labels like "Exceptional", "Strong", "Average", etc.)

2. **Analysis Paragraph** (2-3 paragraphs):
   - Provide a synthesized view of what the scorecard reveals about business quality
   - Write in first person ("I view this as...", "The data suggests...")
   - Highlight the 2-3 strongest factors and why they matter
   - Address the 1-2 weakest factors and their implications
   - Compare to peers where relevant
   - Conclude with an overall assessment of business quality

3. **Outlook** (1 paragraph): Based on the scorecard and trends, what is your view on the trajectory of business quality?

IMPORTANT: The scorecard table should use this format:
| Factor | Score | Assessment |
|--------|-------|------------|
| Market Need | X/5 | (Brief description) |
...

Be opinionated but grounded in the data.`;

    return await this.callClaude(prompt);
  }

  // ============================================
  // WHAT MATTERS (Key Value Drivers)
  // ============================================

  async generateWhatMatters(dataPackage, scorecard) {
    const prompt = `You are an elite equity research analyst identifying the 5 key value drivers that will determine bull vs bear outcomes.

COMPANY: ${dataPackage.company.name} (${dataPackage.symbol})
CURRENT PRICE: $${dataPackage.prices.current?.close || 'N/A'}

ANALYST TARGETS:
- Bull (High): $${dataPackage.analyst.estimates?.target_high || 'N/A'}
- Base (Mean): $${dataPackage.analyst.estimates?.target_mean || 'N/A'}
- Bear (Low): $${dataPackage.analyst.estimates?.target_low || 'N/A'}
- Upside to Mean: ${dataPackage.analyst.estimates?.upside_potential?.toFixed(1) || 'N/A'}%

SCORECARD WEAK POINTS:
${this.getWeakFactors(scorecard)}

SCORECARD STRONG POINTS:
${this.getStrongFactors(scorecard)}

10-K MD&A (Management Discussion - excerpt):
${this.truncateText(dataPackage.secFiling.mdaDiscussion, 2000)}

10-K RISK FACTORS (excerpt):
${this.truncateText(dataPackage.secFiling.riskFactors, 1500)}

EARNINGS CALL MANAGEMENT COMMENTARY:
${this.formatTranscriptForWhatMatters(dataPackage)}

RECENT NEWS THEMES: ${dataPackage.news.themes?.map(t => `${t.theme} (${t.count} mentions)`).join(', ') || 'None'}

METRIC TRENDS:
${this.formatMetricTrendsForPrompt(dataPackage)}

Identify the 5 MOST CRITICAL factors that will determine whether the stock achieves bull case or bear case.

For each factor:
1. **Factor Name**: Specific and company-relevant (not generic like "Revenue Growth")
2. **Why It Matters**: 1-2 sentences explaining the impact on valuation
3. **Bull Scenario**: What needs to happen for upside
4. **Bear Scenario**: What could drive downside
5. **Current Trajectory**: Is the company trending toward bull or bear based on latest data?

Format as:

### 1. [Factor Name]
**Why It Matters:** [explanation]
- **Bull Scenario:** [specific bull case]
- **Bear Scenario:** [specific bear case]
- **Current Trajectory:** [assessment]

Be SPECIFIC to this company. Use actual numbers and metrics where available.
These should be the factors an analyst would focus on when deciding to buy or sell.`;

    return await this.callClaude(prompt);
  }

  // ============================================
  // INVESTMENT POSITIVES & RISKS
  // ============================================

  async generatePositivesAndRisks(dataPackage, scorecard) {
    const prompt = `You are an elite equity research analyst writing the Investment Positives and Investment Risks sections.

COMPANY: ${dataPackage.company.name} (${dataPackage.symbol})
PRISM SCORE: ${scorecard.overallScore}/10

SCORECARD HIGHLIGHTS:
${this.formatScorecardForPrompt(scorecard)}

FINANCIAL STRENGTHS:
${this.formatFinancialStrengthsForPrompt(dataPackage)}

FINANCIAL CONCERNS:
${this.formatFinancialConcernsForPrompt(dataPackage)}

BUSINESS DESCRIPTION:
${this.truncateText(dataPackage.secFiling.businessDescription, 1500)}

RISK FACTORS FROM 10-K:
${this.truncateText(dataPackage.secFiling.riskFactors, 2000)}

NEWS SENTIMENT: ${dataPackage.news.sentimentSummary?.overallSentiment || 'N/A'}
RECENT NEWS THEMES: ${dataPackage.news.themes?.map(t => t.theme).join(', ') || 'None'}

INSIDER ACTIVITY: ${dataPackage.insiders.netActivity?.signal || 'No data'}
INSTITUTIONAL OWNERSHIP: ${dataPackage.institutional.ownershipSummary?.famousInvestors?.join(', ') || 'No famous investors tracked'}

CAPITAL RETURN PROFILE: ${dataPackage.capital.summary?.capitalReturnProfile || 'Unknown'}

Write TWO sections:

## Investment Positives

Write 4-5 investment positives. Each positive should have:
1. **Bold thesis statement** (10-15 words) - the key insight
2. **Supporting paragraph** (2-3 sentences) with specific data points and numbers
3. **Confidence level** (High/Medium/Low) based on data availability

Example format:
**The premium brand positioning creates sustainable pricing power and margin protection.**
Apple's gross margins of 45%+ reflect its ability to command premium prices in a commoditized hardware market. The Services segment (24% of revenue) generates 71% gross margins and grew 14% YoY, creating a high-margin recurring revenue stream that diversifies beyond hardware cycles. [HIGH]

## Investment Risks

Write 4-5 investment risks. Each risk should have:
1. **Bold thesis statement** (10-15 words) - the key concern
2. **Supporting paragraph** (2-3 sentences) explaining the risk and potential impact
3. **Severity** (High/Medium/Low) and **Probability** (High/Medium/Low)
4. **Potential Mitigation** (if any)

Example format:
**Customer concentration in China creates geopolitical and revenue risk.**
Greater China represents ~19% of revenue, exposing Apple to trade tensions, regulatory pressure, and local competition from Huawei. A material loss of market share or regulatory action could impact both revenue and the critical supply chain. [Severity: HIGH | Probability: MEDIUM]
*Mitigation: Diversified supply chain expansion to India and Vietnam.*

Be specific with numbers. Ground everything in the actual data provided.
Return as JSON with structure:
{
  "positives": [
    {
      "thesis": "...",
      "evidence": "...",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ],
  "risks": [
    {
      "thesis": "...",
      "evidence": "...",
      "severity": "HIGH|MEDIUM|LOW",
      "probability": "HIGH|MEDIUM|LOW",
      "mitigation": "..." (optional)
    }
  ]
}`;

    const response = await this.callClaude(prompt);

    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Error parsing positives/risks JSON:', e.message);
    }

    // Fallback: return as-is
    return { positives: [], risks: [], rawResponse: response };
  }

  // ============================================
  // KEY METRICS TABLE (Data-driven)
  // ============================================

  generateKeyMetricsTable(dataPackage) {
    const metrics = dataPackage.metrics;
    const financials = dataPackage.financials;
    const analyst = dataPackage.analyst;

    // Build historical metrics from available data
    const table = {
      headers: ['Metric', 'Current', 'Prior Year', '2Y Ago', '3Y Ago'],
      rows: []
    };

    const history = metrics.history || [];

    // Revenue
    if (financials.annual?.length > 0) {
      const revRow = ['Revenue ($M)'];
      for (let i = 0; i < Math.min(4, financials.annual.length); i++) {
        const rev = financials.annual[i]?.total_revenue;
        revRow.push(rev ? `$${(rev / 1e6).toFixed(0)}` : '—');
      }
      table.rows.push(revRow);
    }

    // Revenue Growth
    if (history.length > 0) {
      const growthRow = ['Revenue Growth %'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const growth = history[i]?.revenue_growth_yoy;
        growthRow.push(growth != null ? `${growth.toFixed(1)}%` : '—');
      }
      table.rows.push(growthRow);
    }

    // Operating Margin
    if (history.length > 0) {
      const marginRow = ['Operating Margin %'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const margin = history[i]?.operating_margin;
        marginRow.push(margin != null ? `${margin.toFixed(1)}%` : '—');
      }
      table.rows.push(marginRow);
    }

    // Net Margin
    if (history.length > 0) {
      const netRow = ['Net Margin %'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const margin = history[i]?.net_margin;
        netRow.push(margin != null ? `${margin.toFixed(1)}%` : '—');
      }
      table.rows.push(netRow);
    }

    // ROIC
    if (history.length > 0) {
      const roicRow = ['ROIC %'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const roic = history[i]?.roic;
        roicRow.push(roic != null ? `${roic.toFixed(1)}%` : '—');
      }
      table.rows.push(roicRow);
    }

    // FCF Yield
    if (history.length > 0) {
      const fcfRow = ['FCF Yield %'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const fcf = history[i]?.fcf_yield;
        fcfRow.push(fcf != null ? `${fcf.toFixed(1)}%` : '—');
      }
      table.rows.push(fcfRow);
    }

    // Debt to Equity
    if (history.length > 0) {
      const deRow = ['Debt/Equity'];
      for (let i = 0; i < Math.min(4, history.length); i++) {
        const de = history[i]?.debt_to_equity;
        deRow.push(de != null ? `${de.toFixed(2)}x` : '—');
      }
      table.rows.push(deRow);
    }

    // Valuation (current only)
    if (metrics.latest) {
      table.rows.push(['P/E Ratio', metrics.latest.pe_ratio ? `${metrics.latest.pe_ratio.toFixed(1)}x` : '—', '—', '—', '—']);
      table.rows.push(['EV/EBITDA', metrics.latest.ev_ebitda ? `${metrics.latest.ev_ebitda.toFixed(1)}x` : '—', '—', '—', '—']);
    }

    return table;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async callClaude(prompt) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude API error:', error.message);
      throw error;
    }
  }

  truncateText(text, maxLength) {
    if (!text) return 'Not available';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  formatNumber(num) {
    if (num == null) return 'N/A';
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    return num.toLocaleString();
  }

  formatScorecardForPrompt(scorecard) {
    const factors = [];
    const allFactors = {
      ...scorecard.factors.market,
      ...scorecard.factors.competitive,
      ...scorecard.factors.financial,
      ...scorecard.factors.management
    };

    for (const [name, data] of Object.entries(allFactors)) {
      if (data.score != null) {
        factors.push(`- ${this.camelToTitle(name)}: ${data.score}/5 [${data.confidence}] - ${data.justification}`);
      }
    }
    return factors.join('\n');
  }

  formatDetailedScorecardForPrompt(scorecard) {
    const lines = [];

    const categories = {
      'Market Factors': scorecard.factors.market,
      'Competitive Factors': scorecard.factors.competitive,
      'Financial Factors': scorecard.factors.financial,
      'Management Factors': scorecard.factors.management
    };

    for (const [category, factors] of Object.entries(categories)) {
      lines.push(`\n${category}:`);
      for (const [name, data] of Object.entries(factors)) {
        if (data.score != null) {
          lines.push(`  - ${this.camelToTitle(name)}: ${data.score}/5 [${data.confidence}]`);
          lines.push(`    Reason: ${data.justification}`);
          if (data.dataPoints?.length > 0) {
            lines.push(`    Data: ${data.dataPoints.join(', ')}`);
          }
        }
      }
    }
    return lines.join('\n');
  }

  formatFinancialsForPrompt(dataPackage) {
    const m = dataPackage.metrics.latest;
    const f = dataPackage.financials.latest;

    if (!m && !f) return 'No financial data available';

    const lines = [];
    if (f?.total_revenue) lines.push(`Revenue: $${this.formatNumber(f.total_revenue)}`);
    if (m?.revenue_growth_yoy != null) lines.push(`Revenue Growth: ${m.revenue_growth_yoy.toFixed(1)}%`);
    if (m?.operating_margin != null) lines.push(`Operating Margin: ${m.operating_margin.toFixed(1)}%`);
    if (m?.net_margin != null) lines.push(`Net Margin: ${m.net_margin.toFixed(1)}%`);
    if (m?.roic != null) lines.push(`ROIC: ${m.roic.toFixed(1)}%`);
    if (m?.roe != null) lines.push(`ROE: ${m.roe.toFixed(1)}%`);
    if (m?.fcf_yield != null) lines.push(`FCF Yield: ${m.fcf_yield.toFixed(1)}%`);
    if (m?.debt_to_equity != null) lines.push(`Debt/Equity: ${m.debt_to_equity.toFixed(2)}x`);
    if (m?.pe_ratio != null) lines.push(`P/E Ratio: ${m.pe_ratio.toFixed(1)}x`);

    return lines.join('\n');
  }

  formatFinancialStrengthsForPrompt(dataPackage) {
    const m = dataPackage.metrics.latest;
    if (!m) return 'No metrics available';

    const strengths = [];
    if (m.roic > 15) strengths.push(`High ROIC of ${m.roic.toFixed(1)}%`);
    if (m.net_margin > 15) strengths.push(`Strong net margin of ${m.net_margin.toFixed(1)}%`);
    if (m.fcf_yield > 4) strengths.push(`Attractive FCF yield of ${m.fcf_yield.toFixed(1)}%`);
    if (m.debt_to_equity < 0.5) strengths.push(`Low leverage with D/E of ${m.debt_to_equity.toFixed(2)}x`);
    if (m.revenue_growth_yoy > 10) strengths.push(`Strong revenue growth of ${m.revenue_growth_yoy.toFixed(1)}%`);

    return strengths.length > 0 ? strengths.join('\n') : 'No standout financial strengths identified';
  }

  formatFinancialConcernsForPrompt(dataPackage) {
    const m = dataPackage.metrics.latest;
    if (!m) return 'No metrics available';

    const concerns = [];
    if (m.roic < 8) concerns.push(`Low ROIC of ${m.roic.toFixed(1)}%`);
    if (m.net_margin < 5) concerns.push(`Thin net margin of ${m.net_margin.toFixed(1)}%`);
    if (m.debt_to_equity > 1.5) concerns.push(`High leverage with D/E of ${m.debt_to_equity.toFixed(2)}x`);
    if (m.revenue_growth_yoy < 0) concerns.push(`Declining revenue of ${m.revenue_growth_yoy.toFixed(1)}%`);
    if (m.pe_ratio > 40) concerns.push(`Elevated valuation at ${m.pe_ratio.toFixed(1)}x P/E`);

    return concerns.length > 0 ? concerns.join('\n') : 'No major financial concerns identified';
  }

  formatPeerComparisonForPrompt(dataPackage) {
    const peers = dataPackage.peers.industryPeers?.slice(0, 5);
    if (!peers || peers.length === 0) return 'No peer data available';

    const lines = ['Top Industry Peers:'];
    for (const peer of peers) {
      lines.push(`- ${peer.symbol}: ROIC ${peer.roic?.toFixed(1) || 'N/A'}%, Margin ${peer.net_margin?.toFixed(1) || 'N/A'}%`);
    }

    if (dataPackage.peers.comparison) {
      const c = dataPackage.peers.comparison;
      lines.push('\nCompany Percentile Ranks vs Peers:');
      if (c.roicRank != null) lines.push(`- ROIC: ${c.roicRank}th percentile`);
      if (c.marginRank != null) lines.push(`- Margin: ${c.marginRank}th percentile`);
      if (c.growthRank != null) lines.push(`- Growth: ${c.growthRank}th percentile`);
    }

    return lines.join('\n');
  }

  formatMetricTrendsForPrompt(dataPackage) {
    const trends = dataPackage.metrics.trends;
    if (!trends || Object.keys(trends).length === 0) return 'No trend data available';

    const lines = [];
    for (const [metric, data] of Object.entries(trends)) {
      const direction = data.improving ? '↑ Improving' : data.stable ? '→ Stable' : '↓ Declining';
      lines.push(`- ${this.camelToTitle(metric)}: ${direction} (${data.latest.toFixed(1)} from ${data.oldest.toFixed(1)})`);
    }
    return lines.join('\n');
  }

  getWeakFactors(scorecard) {
    const weak = [];
    const allFactors = {
      ...scorecard.factors.market,
      ...scorecard.factors.competitive,
      ...scorecard.factors.financial,
      ...scorecard.factors.management
    };

    for (const [name, data] of Object.entries(allFactors)) {
      if (data.score != null && data.score <= 2) {
        weak.push(`- ${this.camelToTitle(name)}: ${data.score}/5 - ${data.justification}`);
      }
    }
    return weak.length > 0 ? weak.join('\n') : 'No significant weak factors';
  }

  getStrongFactors(scorecard) {
    const strong = [];
    const allFactors = {
      ...scorecard.factors.market,
      ...scorecard.factors.competitive,
      ...scorecard.factors.financial,
      ...scorecard.factors.management
    };

    for (const [name, data] of Object.entries(allFactors)) {
      if (data.score != null && data.score >= 4) {
        strong.push(`- ${this.camelToTitle(name)}: ${data.score}/5 - ${data.justification}`);
      }
    }
    return strong.length > 0 ? strong.join('\n') : 'No standout strong factors';
  }

  camelToTitle(str) {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }

  // ============================================
  // EARNINGS TRANSCRIPT FORMATTING
  // ============================================

  formatTranscriptInsights(dataPackage) {
    const t = dataPackage.transcripts;
    if (!t?.available || !t.summary) {
      return 'No earnings call transcript data available';
    }

    const lines = [];
    const s = t.summary;

    lines.push(`Latest Call: ${s.latestCall?.quarter || 'N/A'} (${s.latestCall?.date || 'N/A'})`);
    lines.push(`Management Tone: ${s.latestCall?.tone || 'neutral'} (sentiment: ${s.latestCall?.sentimentScore?.toFixed(2) || 'N/A'})`);
    lines.push(`Tone Trend: ${s.toneTrend || 'stable'}`);
    lines.push(`Guidance Direction: ${s.guidanceDirection || 'maintained'}`);
    lines.push(`Forward-Looking Statements: ${s.forwardLookingStatements || 0}`);
    lines.push(`Risk Mentions: ${s.riskMentions || 0}`);

    // Add key quotes if available
    if (t.keyQuotes && t.keyQuotes.length > 0) {
      lines.push('\nKey Management Quotes:');
      t.keyQuotes.slice(0, 2).forEach((q, i) => {
        lines.push(`${i + 1}. "${this.truncateText(q, 200)}"`);
      });
    }

    return lines.join('\n');
  }

  formatTranscriptForWhatMatters(dataPackage) {
    const t = dataPackage.transcripts;
    if (!t?.available) {
      return 'No earnings call transcript available';
    }

    const lines = [];

    // Include guidance analysis
    if (t.guidanceAnalysis) {
      const g = t.guidanceAnalysis;
      lines.push(`Guidance: ${g.direction} (tone: ${g.tone})`);
      lines.push(`Management Confidence Level: ${g.uncertaintyLevel > 20 ? 'Cautious (high uncertainty language)' : g.uncertaintyLevel > 10 ? 'Moderate' : 'Confident'}`);
      lines.push(`Forward-Looking Focus: ${g.forwardLookingStatements > 50 ? 'High' : g.forwardLookingStatements > 25 ? 'Moderate' : 'Low'}`);
    }

    // Include prepared remarks excerpt for context
    if (t.preparedRemarksExcerpt) {
      lines.push('\nPrepared Remarks Excerpt:');
      lines.push(this.truncateText(t.preparedRemarksExcerpt, 1500));
    }

    // Include key quotes
    if (t.keyQuotes && t.keyQuotes.length > 0) {
      lines.push('\nKey Strategic Statements:');
      t.keyQuotes.slice(0, 3).forEach((q, i) => {
        lines.push(`- "${this.truncateText(q, 250)}"`);
      });
    }

    return lines.join('\n');
  }

  // ============================================
  // WIKIPEDIA FORMATTING
  // ============================================

  formatWikipediaForPrompt(dataPackage) {
    const wiki = dataPackage.wikipedia;
    if (!wiki?.available) {
      return 'No Wikipedia data available';
    }

    const lines = [];

    // Key facts
    if (wiki.keyFacts && wiki.keyFacts.length > 0) {
      lines.push('Key Facts:');
      wiki.keyFacts.forEach(fact => lines.push(`- ${fact}`));
    }

    // Summary
    if (wiki.summary) {
      lines.push('\nWikipedia Summary:');
      lines.push(this.truncateText(wiki.summary, 800));
    }

    // History excerpt
    if (wiki.history) {
      lines.push('\nCompany History:');
      lines.push(this.truncateText(wiki.history, 1200));
    }

    return lines.join('\n');
  }
}

module.exports = PRISMAISynthesizer;

// Test if run directly
if (require.main === module) {
  console.log('PRISMAISynthesizer module loaded successfully');
  console.log('Use with PRISMDataCollector and PRISMScorer to generate reports');
}
