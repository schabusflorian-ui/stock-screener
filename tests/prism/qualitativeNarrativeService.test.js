// tests/prism/qualitativeNarrativeService.test.js
// Unit tests for Qualitative Narrative Service - helper functions and parsing

describe('QualitativeNarrativeService', () => {
  // ============================================
  // RESPONSE PARSING
  // ============================================

  describe('Response Parsing', () => {
    const parseAnalysisResponse = (response) => {
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
    };

    it('should parse narrative and key points correctly', () => {
      const response = `NARRATIVE:
Apple demonstrates elite profitability with ROIC of 111.3%, far exceeding the technology sector median. The company's cash generation remains robust with FCF margin of 24.8%.

KEY POINTS:
- ROIC of 111.3% vs. sector median of 15-20%
- FCF margin of 24.8% provides capital allocation flexibility
- Debt-to-equity of 1.12x maintains moderate leverage`;

      const parsed = parseAnalysisResponse(response);

      expect(parsed.narrative).toContain('Apple demonstrates elite profitability');
      expect(parsed.narrative).toContain('FCF margin of 24.8%');
      expect(parsed.keyPoints).toHaveLength(3);
      expect(parsed.keyPoints[0]).toContain('111.3%');
    });

    it('should handle response without KEY POINTS section', () => {
      const response = `NARRATIVE:
This is a simple narrative without key points.`;

      const parsed = parseAnalysisResponse(response);

      expect(parsed.narrative).toContain('simple narrative');
      expect(parsed.keyPoints).toHaveLength(0);
    });

    it('should handle raw response without NARRATIVE label', () => {
      const response = 'This is a raw narrative without any labels.';

      const parsed = parseAnalysisResponse(response);

      expect(parsed.narrative).toBe(response);
      expect(parsed.keyPoints).toHaveLength(0);
    });

    it('should handle bullet points with different markers', () => {
      const response = `NARRATIVE:
Test narrative.

KEY POINTS:
• First bullet point
- Second bullet point
* Third bullet point`;

      const parsed = parseAnalysisResponse(response);

      expect(parsed.keyPoints).toHaveLength(3);
      expect(parsed.keyPoints[0]).toBe('First bullet point');
      expect(parsed.keyPoints[1]).toBe('Second bullet point');
      expect(parsed.keyPoints[2]).toBe('Third bullet point');
    });

    it('should filter empty lines in key points', () => {
      const response = `NARRATIVE:
Test.

KEY POINTS:
- Point one

- Point two

`;

      const parsed = parseAnalysisResponse(response);

      expect(parsed.keyPoints).toHaveLength(2);
    });
  });

  // ============================================
  // CONTEXT PREPARATION
  // ============================================

  describe('Context Preparation', () => {
    const prepareContext = (rawData) => {
      return {
        symbol: rawData.symbol,
        companyName: rawData.company?.name || rawData.symbol,
        sector: rawData.company?.sector || 'Unknown',
        industry: rawData.company?.industry || 'Unknown',
        marketCap: rawData.company?.marketCap || 0,

        // Financial metrics
        financials: rawData.metrics?.latest ? {
          revenue: rawData.metrics.latest.revenue,
          grossMargin: rawData.metrics.latest.gross_margin,
          operatingMargin: rawData.metrics.latest.operating_margin,
          netMargin: rawData.metrics.latest.net_margin,
          roic: rawData.metrics.latest.roic,
          roe: rawData.metrics.latest.roe,
          fcf: rawData.metrics.latest.free_cash_flow,
          debtToEquity: rawData.metrics.latest.debt_to_equity,
        } : null,

        // Trends
        trends: rawData.metrics?.latest ? {
          revenueGrowth: rawData.metrics.latest.revenue_growth_yoy,
          epsGrowth: rawData.metrics.latest.earnings_growth_yoy,
        } : null,

        // SEC filing data
        secFiling: rawData.secFiling ? {
          businessDescription: rawData.secFiling.business_description,
          riskFactors: rawData.secFiling.risk_factors,
          mdaDiscussion: rawData.secFiling.mda_discussion,
          competitionSection: rawData.secFiling.competition_section,
        } : null,
      };
    };

    it('should extract company info correctly', () => {
      const rawData = {
        symbol: 'AAPL',
        company: {
          name: 'Apple Inc.',
          sector: 'Technology',
          industry: 'Consumer Electronics',
          marketCap: 3e12,
        },
      };

      const context = prepareContext(rawData);

      expect(context.symbol).toBe('AAPL');
      expect(context.companyName).toBe('Apple Inc.');
      expect(context.sector).toBe('Technology');
      expect(context.marketCap).toBe(3e12);
    });

    it('should extract financial metrics correctly', () => {
      const rawData = {
        symbol: 'AAPL',
        metrics: {
          latest: {
            revenue: 400e9,
            gross_margin: 45.5,
            operating_margin: 30.2,
            roic: 111.3,
            revenue_growth_yoy: 6.4,
          },
        },
      };

      const context = prepareContext(rawData);

      expect(context.financials.revenue).toBe(400e9);
      expect(context.financials.grossMargin).toBe(45.5);
      expect(context.trends.revenueGrowth).toBe(6.4);
    });

    it('should handle missing data gracefully', () => {
      const rawData = { symbol: 'UNKNOWN' };

      const context = prepareContext(rawData);

      expect(context.symbol).toBe('UNKNOWN');
      expect(context.companyName).toBe('UNKNOWN');
      expect(context.sector).toBe('Unknown');
      expect(context.financials).toBeNull();
    });
  });

  // ============================================
  // NUMBER FORMATTING
  // ============================================

  describe('Number Formatting', () => {
    const formatNumber = (value) => {
      if (value == null) return 'N/A';
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
      if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return value.toFixed(0);
    };

    it('should format trillions correctly', () => {
      expect(formatNumber(3e12)).toBe('3.00T');
      expect(formatNumber(1.5e12)).toBe('1.50T');
    });

    it('should format billions correctly', () => {
      expect(formatNumber(400e9)).toBe('400.0B');
      expect(formatNumber(50.5e9)).toBe('50.5B');
    });

    it('should format millions correctly', () => {
      expect(formatNumber(500e6)).toBe('500.0M');
    });

    it('should format thousands correctly', () => {
      expect(formatNumber(50000)).toBe('50.0K');
    });

    it('should handle null/undefined', () => {
      expect(formatNumber(null)).toBe('N/A');
      expect(formatNumber(undefined)).toBe('N/A');
    });
  });

  // ============================================
  // QUOTE EXTRACTION PATTERNS
  // ============================================

  describe('Quote Extraction', () => {
    const extractQuoteContext = (quote) => {
      // Detect if quote is about growth, margins, guidance, etc.
      const contexts = [];

      if (/growth|grew|increase|expand/i.test(quote)) contexts.push('growth');
      if (/margin|profitability|operating/i.test(quote)) contexts.push('margins');
      if (/guidance|outlook|expect|forecast/i.test(quote)) contexts.push('guidance');
      if (/competition|market share|competitor/i.test(quote)) contexts.push('competition');
      if (/invest|capital|spend/i.test(quote)) contexts.push('investment');

      return contexts;
    };

    it('should identify growth-related quotes', () => {
      const quote = 'We saw strong revenue growth of 15% this quarter.';
      expect(extractQuoteContext(quote)).toContain('growth');
    });

    it('should identify margin-related quotes', () => {
      const quote = 'Operating margins expanded by 200 basis points.';
      expect(extractQuoteContext(quote)).toContain('margins');
    });

    it('should identify guidance-related quotes', () => {
      const quote = 'We expect continued momentum in the coming quarters.';
      expect(extractQuoteContext(quote)).toContain('guidance');
    });

    it('should identify multiple contexts', () => {
      const quote = 'We grew revenue while expanding margins and investing in R&D.';
      const contexts = extractQuoteContext(quote);
      expect(contexts).toContain('growth');
      expect(contexts).toContain('margins');
      expect(contexts).toContain('investment');
    });
  });

  // ============================================
  // SOURCE ATTRIBUTION
  // ============================================

  describe('Source Attribution', () => {
    const getSourcesUsed = (context) => {
      const sources = [];

      if (context.secFiling?.businessDescription) sources.push('SEC 10-K');
      if (context.transcripts?.preparedRemarks) sources.push('Earnings Transcript');
      if (context.wikipedia?.summary) sources.push('Wikipedia');
      if (context.news?.recent?.length > 0) sources.push('News Articles');
      if (context.analyst?.estimates) sources.push('Analyst Estimates');
      if (context.insiders?.recentTransactions?.length > 0) sources.push('Insider Transactions');

      return sources;
    };

    it('should identify SEC filing as source', () => {
      const context = {
        secFiling: { businessDescription: 'Apple designs...' },
      };
      expect(getSourcesUsed(context)).toContain('SEC 10-K');
    });

    it('should identify multiple sources', () => {
      const context = {
        secFiling: { businessDescription: 'Test' },
        wikipedia: { summary: 'Test' },
        news: { recent: [{ title: 'Test' }] },
      };
      const sources = getSourcesUsed(context);
      expect(sources).toContain('SEC 10-K');
      expect(sources).toContain('Wikipedia');
      expect(sources).toContain('News Articles');
    });

    it('should handle empty context', () => {
      const sources = getSourcesUsed({});
      expect(sources).toHaveLength(0);
    });
  });

  // ============================================
  // CATEGORY ANALYSIS STRUCTURE
  // ============================================

  describe('Category Analysis Structure', () => {
    const createCategoryResult = (narrative, keyPoints, success = true) => {
      return {
        narrative: narrative || null,
        keyPoints: keyPoints || [],
        success,
      };
    };

    it('should create successful result with data', () => {
      const result = createCategoryResult(
        'This is the narrative.',
        ['Point 1', 'Point 2'],
        true
      );

      expect(result.success).toBe(true);
      expect(result.narrative).toBe('This is the narrative.');
      expect(result.keyPoints).toHaveLength(2);
    });

    it('should create failed result', () => {
      const result = createCategoryResult(null, [], false);

      expect(result.success).toBe(false);
      expect(result.narrative).toBeNull();
      expect(result.keyPoints).toHaveLength(0);
    });
  });

  // ============================================
  // PROMPT VALIDATION
  // ============================================

  describe('Prompt Construction', () => {
    const hasRequiredPromptElements = (prompt) => {
      const requirements = {
        hasPersona: /Vice President|VP|Equity Research|Goldman|Morgan Stanley|JPM/i.test(prompt),
        hasCompanyName: /\$?\{?company|symbol\}?/i.test(prompt) || prompt.includes('${'),
        hasAnalyticalFramework: /analytical|framework|focus/i.test(prompt),
        hasToneGuidance: /tone|avoid|professional/i.test(prompt),
        hasOutputFormat: /format|narrative|key points/i.test(prompt),
      };

      return requirements;
    };

    it('should identify IB persona in prompt template', () => {
      const prompt = 'You are a Vice President in Equity Research at Goldman Sachs...';
      expect(hasRequiredPromptElements(prompt).hasPersona).toBe(true);
    });

    it('should identify analytical framework', () => {
      const prompt = 'ANALYTICAL FOCUS: 1. Identify value creation levers...';
      expect(hasRequiredPromptElements(prompt).hasAnalyticalFramework).toBe(true);
    });

    it('should identify tone guidance', () => {
      const prompt = 'TONE: Professional skepticism. AVOID: Generic claims.';
      expect(hasRequiredPromptElements(prompt).hasToneGuidance).toBe(true);
    });
  });

  // ============================================
  // STATS TRACKING
  // ============================================

  describe('Stats Tracking', () => {
    const createStats = () => ({
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
    });

    const updateStats = (stats, usage) => {
      return {
        calls: stats.calls + 1,
        promptTokens: stats.promptTokens + (usage.input_tokens || 0),
        completionTokens: stats.completionTokens + (usage.output_tokens || 0),
      };
    };

    const getEstimatedCost = (stats) => {
      // Based on Claude pricing
      const inputCost = (stats.promptTokens * 0.003) / 1000;
      const outputCost = (stats.completionTokens * 0.015) / 1000;
      return `$${(inputCost + outputCost).toFixed(4)}`;
    };

    it('should track API calls', () => {
      let stats = createStats();
      stats = updateStats(stats, { input_tokens: 1000, output_tokens: 500 });
      stats = updateStats(stats, { input_tokens: 1000, output_tokens: 500 });

      expect(stats.calls).toBe(2);
      expect(stats.promptTokens).toBe(2000);
      expect(stats.completionTokens).toBe(1000);
    });

    it('should estimate costs correctly', () => {
      const stats = {
        calls: 5,
        promptTokens: 10000,
        completionTokens: 5000,
      };

      const cost = getEstimatedCost(stats);
      expect(cost).toMatch(/\$0\.\d+/);
    });

    it('should handle zero usage', () => {
      const stats = createStats();
      expect(getEstimatedCost(stats)).toBe('$0.0000');
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  describe('Error Handling', () => {
    const handleGenerationError = (error, section) => {
      return {
        narrative: null,
        keyPoints: [],
        success: false,
        error: error.message || 'Unknown error',
        section,
      };
    };

    it('should capture error message', () => {
      const error = new Error('API rate limited');
      const result = handleGenerationError(error, 'financialAnalysis');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limited');
      expect(result.section).toBe('financialAnalysis');
    });

    it('should handle errors without message', () => {
      const result = handleGenerationError({}, 'competitiveAnalysis');
      expect(result.error).toBe('Unknown error');
    });
  });
});

// ============================================
// NARRATIVE OUTPUT VALIDATION
// ============================================

describe('Narrative Output Validation', () => {
  describe('Word Count Validation', () => {
    const countWords = (text) => {
      if (!text) return 0;
      return text.split(/\s+/).filter(word => word.length > 0).length;
    };

    const isWithinRange = (text, min, max) => {
      const count = countWords(text);
      return count >= min && count <= max;
    };

    it('should count words correctly', () => {
      expect(countWords('One two three four five.')).toBe(5);
      expect(countWords('   Spaced   words   ')).toBe(2);
    });

    it('should validate word count range', () => {
      const narrative = 'This is a test narrative with some words in it.';
      expect(isWithinRange(narrative, 5, 20)).toBe(true);
      expect(isWithinRange(narrative, 50, 100)).toBe(false);
    });
  });

  describe('Content Quality Checks', () => {
    const hasQuantifiedClaims = (text) => {
      return /\d+(\.\d+)?%|\$\d+|\d+x|\d+(B|M|K|T)/i.test(text);
    };

    const avoidsGenericPhrases = (text) => {
      const genericPhrases = [
        'synergy',
        'best-in-class',
        'market leader',
        'world-class',
        'innovative solutions',
      ];
      return !genericPhrases.some(phrase => text.toLowerCase().includes(phrase));
    };

    it('should detect quantified claims', () => {
      expect(hasQuantifiedClaims('Revenue grew 15% year-over-year')).toBe(true);
      expect(hasQuantifiedClaims('Strong market position')).toBe(false);
      expect(hasQuantifiedClaims('Market cap of $3.5T')).toBe(true);
      expect(hasQuantifiedClaims('Debt-to-equity of 1.12x')).toBe(true);
    });

    it('should detect generic phrases', () => {
      expect(avoidsGenericPhrases('Apple has best-in-class margins')).toBe(false);
      expect(avoidsGenericPhrases('Apple generates 45% gross margin')).toBe(true);
    });
  });
});
