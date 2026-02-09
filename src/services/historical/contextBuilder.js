// src/services/historical/contextBuilder.js
// Builds rich historical context for AI analyst prompts

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
const PrecedentFinder = require('./precedentFinder');
const PatternMatcher = require('./patternMatcher');

/**
 * ContextBuilder
 *
 * Builds comprehensive historical context for AI analyst prompts by:
 * 1. Finding similar historical situations (precedents)
 * 2. Finding what famous investors did in similar situations
 * 3. Matching to investment patterns with historical success rates
 * 4. Generating formatted context text for prompt injection
 */
class ContextBuilder {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.precedentFinder = new PrecedentFinder();
    this.patternMatcher = new PatternMatcher();
  }

  /**
   * Build complete historical context for AI analyst
   */
  async buildContext(symbol, analystType = 'value') {
    const context = {
      symbol,
      analystType,
      timestamp: new Date().toISOString(),
      precedents: null,
      investorDecisions: null,
      patternMatch: null,
      cautionaryTales: null,
      marketContext: null,
      analystSpecificInsights: null
    };

    try {
      // 1. Find similar historical precedents
      const precedents = await this.precedentFinder.findPrecedents(symbol, {
        limit: 5,
        minSimilarity: 0.5
      });
      context.precedents = precedents.error ? null : precedents;

      // 2. Find what famous investors did
      const investorDecisions = await this._findRelevantInvestorDecisions(symbol, analystType);
      context.investorDecisions = investorDecisions;

      // 3. Match current situation to patterns
      const currentMetrics = await this._getCurrentMetrics(symbol);
      if (currentMetrics) {
        const patternMatch = await this._matchCurrentToPatterns(currentMetrics);
        context.patternMatch = patternMatch;
      }

      // 4. Find cautionary tales (similar situations that failed)
      const cautionaryTales = await this._findCautionaryTales(symbol);
      context.cautionaryTales = cautionaryTales;

      // 5. Get current market context
      context.marketContext = await this._getCurrentMarketContext();

      // 6. Generate analyst-specific insights
      context.analystSpecificInsights = this._generateAnalystInsights(
        analystType,
        currentMetrics,
        context
      );

    } catch (error) {
      context.error = error.message;
    }

    return context;
  }

  /**
   * Format context for prompt injection
   */
  formatForPrompt(context) {
    if (!context || context.error) {
      return '';
    }

    const sections = [];

    // Section 1: Similar Historical Situations
    if (context.precedents?.precedents?.length > 0) {
      sections.push(this._formatPrecedentsSection(context.precedents));
    }

    // Section 2: What Famous Investors Did
    if (context.investorDecisions?.length > 0) {
      sections.push(this._formatInvestorDecisionsSection(context.investorDecisions));
    }

    // Section 3: Pattern Match Analysis
    if (context.patternMatch) {
      sections.push(this._formatPatternSection(context.patternMatch));
    }

    // Section 4: Cautionary Examples
    if (context.cautionaryTales?.length > 0) {
      sections.push(this._formatCautionarySection(context.cautionaryTales));
    }

    // Section 5: Market Context
    if (context.marketContext) {
      sections.push(this._formatMarketContextSection(context.marketContext));
    }

    // Section 6: Analyst-Specific Insights
    if (context.analystSpecificInsights) {
      sections.push(this._formatAnalystInsightsSection(context.analystSpecificInsights));
    }

    if (sections.length === 0) {
      return '';
    }

    return `
## Historical Intelligence Context

${sections.join('\n\n')}

---
*Use this historical context to ground your analysis in real-world precedents and outcomes.*
`;
  }

  // ============================================
  // Context Building Methods
  // ============================================

  /**
   * Find investor decisions relevant for this analyst type
   */
  async _findRelevantInvestorDecisions(symbol, analystType) {
    // Map analyst type to relevant investor styles
    const styleMapping = {
      value: ['value', 'deep_value'],
      growth: ['growth', 'technology'],
      contrarian: ['deep_value', 'activist', 'distressed'],
      quant: ['quant', 'multi_strategy'],
      tailrisk: ['deep_value', 'macro'],
      tech: ['technology', 'growth']
    };

    const styles = styleMapping[analystType] || ['value'];

    // Find similar decisions by matching investor styles
    const similarDecisions = await this.precedentFinder.findSimilarDecisions(symbol, {
      limit: 10,
      investorStyles: styles
    });

    if (similarDecisions.error) return null;

    // Also find any decisions on this exact stock
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        d.id, d.decision_date, d.decision_type, d.return_1y, d.alpha_1y,
        d.pe_ratio, d.portfolio_weight, d.outcome_category,
        fi.name as investor_name, fi.investment_style,
        ip.pattern_name
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      LEFT JOIN investment_patterns ip ON d.primary_pattern_id = ip.id
      WHERE d.symbol = $1
      ORDER BY d.decision_date DESC
      LIMIT 15
    `, [symbol]);

    const sameStockDecisions = result.rows;

    return {
      sameStock: sameStockDecisions,
      similar: similarDecisions.similarDecisions || [],
      summary: similarDecisions.summary
    };
  }

  /**
   * Get current stock metrics
   */
  async _getCurrentMetrics(symbol) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, name, sector, industry, market_cap
      FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);

    const company = companyResult.rows[0];
    if (!company) return null;

    const metricsResult = await database.query(`
      SELECT * FROM calculated_metrics
      WHERE company_id = $1
      ORDER BY fiscal_period DESC
      LIMIT 1
    `, [company.id]);

    const metrics = metricsResult.rows[0];

    return {
      symbol,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      market_cap: company.market_cap,
      ...metrics
    };
  }

  /**
   * Match current stock to investment patterns
   */
  async _matchCurrentToPatterns(currentMetrics) {
    const patterns = await this.patternMatcher.getAllPatterns();

    const matches = [];
    for (const pattern of patterns) {
      const score = this._calculatePatternScore(currentMetrics, pattern);
      if (score.confidence > 0.3) {
        matches.push({
          pattern,
          score: score.confidence,
          matchedCriteria: score.matched,
          historicalWinRate: pattern.win_rate,
          historicalAvgReturn: pattern.avg_return_1y,
          sampleSize: pattern.sample_size
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) return null;

    return {
      primaryPattern: matches[0],
      secondaryPatterns: matches.slice(1, 3),
      matchConfidence: matches[0].score
    };
  }

  /**
   * Calculate pattern match score for current metrics
   */
  _calculatePatternScore(metrics, pattern) {
    const typicalMetrics = pattern.typical_metrics;
    if (!typicalMetrics) return { confidence: 0, matched: [] };

    const matched = [];
    let totalChecks = 0;
    let passedChecks = 0;

    const checks = [
      { metric: 'pe_ratio', current: metrics.pe_ratio },
      { metric: 'pb_ratio', current: metrics.pb_ratio },
      { metric: 'roic', current: metrics.roic },
      { metric: 'fcf_yield', current: metrics.fcf_yield },
      { metric: 'revenue_growth_yoy', current: metrics.revenue_growth_yoy }
    ];

    for (const check of checks) {
      const range = typicalMetrics[check.metric];
      if (!range || check.current == null) continue;

      totalChecks++;
      if (check.current >= range.min && check.current <= range.max) {
        passedChecks++;
        matched.push(check.metric);
      }
    }

    return {
      confidence: totalChecks > 0 ? passedChecks / totalChecks : 0,
      matched
    };
  }

  /**
   * Find cautionary tales (similar situations that failed)
   */
  async _findCautionaryTales(symbol) {
    const currentMetrics = await this._getCurrentMetrics(symbol);
    if (!currentMetrics) return null;

    const database = await getDatabaseAsync();

    // Find decisions with similar metrics that had poor outcomes
    let query = `
      SELECT
        d.symbol, d.decision_date, d.return_1y, d.alpha_1y,
        d.pe_ratio, d.roic, d.revenue_growth_yoy,
        d.outcome_category,
        fi.name as investor_name
      FROM investment_decisions d
      JOIN famous_investors fi ON d.investor_id = fi.id
      WHERE d.outcome_category IN ('loser', 'big_loser')
        AND d.return_1y IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    // Same sector
    if (currentMetrics.sector) {
      query += ` AND d.sector = $${paramIndex}`;
      params.push(currentMetrics.sector);
      paramIndex++;
    }

    // Similar P/E range
    if (currentMetrics.pe_ratio) {
      query += ` AND d.pe_ratio BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(currentMetrics.pe_ratio * 0.5, currentMetrics.pe_ratio * 2);
      paramIndex += 2;
    }

    query += ' ORDER BY d.return_1y ASC LIMIT 5';

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Get current market context
   */
  async _getCurrentMarketContext() {
    const database = await getDatabaseAsync();

    const latestResult = await database.query(`
      SELECT * FROM market_context_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 1
    `);

    const latest = latestResult.rows[0];

    if (!latest) {
      // Try to get from SPY data
      const spyResult = await database.query(`
        SELECT id FROM companies WHERE symbol = 'SPY'
      `);

      const spy = spyResult.rows[0];
      if (!spy) return null;

      // Calculate rough market context
      const currentPriceResult = await database.query(`
        SELECT close, date FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC LIMIT 1
      `, [spy.id]);

      const currentPrice = currentPriceResult.rows[0];

      // Dialect-aware date interval
      const dateInterval = isUsingPostgres()
        ? `date <= CURRENT_TIMESTAMP - INTERVAL '1 year'`
        : `date <= date('now', '-1 year')`;

      const yearAgoPriceResult = await database.query(`
        SELECT close FROM daily_prices
        WHERE company_id = $1 AND ${dateInterval}
        ORDER BY date DESC LIMIT 1
      `, [spy.id]);

      const yearAgoPrice = yearAgoPriceResult.rows[0];

      if (currentPrice && yearAgoPrice) {
        const sp500_1y_return = ((currentPrice.close - yearAgoPrice.close) / yearAgoPrice.close) * 100;

        let cycle = 'mid_bull';
        if (sp500_1y_return > 20) cycle = 'late_bull';
        else if (sp500_1y_return > 10) cycle = 'mid_bull';
        else if (sp500_1y_return > 0) cycle = 'early_bull';
        else if (sp500_1y_return > -20) cycle = 'correction';
        else cycle = 'bear';

        return {
          date: currentPrice.date,
          sp500_1y_return,
          market_cycle: cycle
        };
      }
    }

    return latest;
  }

  /**
   * Generate insights specific to the analyst type
   */
  _generateAnalystInsights(analystType, metrics, context) {
    const insights = [];

    if (!metrics) return insights;

    switch (analystType) {
      case 'value':
        if (metrics.pe_ratio && metrics.pe_ratio < 15) {
          insights.push(`P/E of ${metrics.pe_ratio.toFixed(1)} is below the market average - potential value opportunity`);
        }
        if (context.precedents?.historicalOutcomes?.winRate > 60) {
          insights.push(`Similar value situations have historically beaten the market ${context.precedents.historicalOutcomes.winRate.toFixed(0)}% of the time`);
        }
        if (metrics.fcf_yield && metrics.fcf_yield > 8) {
          insights.push(`FCF yield of ${metrics.fcf_yield.toFixed(1)}% suggests strong cash generation`);
        }
        break;

      case 'growth':
        if (metrics.revenue_growth_yoy && metrics.revenue_growth_yoy > 20) {
          insights.push(`Revenue growth of ${metrics.revenue_growth_yoy.toFixed(1)}% is above average`);
        }
        if (metrics.pe_ratio && metrics.revenue_growth_yoy) {
          const peg = metrics.pe_ratio / metrics.revenue_growth_yoy;
          if (peg < 1.5) {
            insights.push(`PEG ratio of ${peg.toFixed(2)} suggests growth is reasonably priced`);
          } else if (peg > 3) {
            insights.push(`PEG ratio of ${peg.toFixed(2)} suggests premium valuation vs growth`);
          }
        }
        break;

      case 'contrarian':
        if (context.cautionaryTales?.length > 0) {
          insights.push(`Found ${context.cautionaryTales.length} similar situations that underperformed - check for value trap signals`);
        }
        if (context.investorDecisions?.sameStock?.some(d => d.decision_type === 'sold_out')) {
          insights.push('Some famous investors have exited this position recently');
        }
        break;

      case 'quant':
        if (metrics.roic && metrics.roic > 15) {
          insights.push(`ROIC of ${metrics.roic.toFixed(1)}% places this in the top quality quartile`);
        }
        break;

      case 'tailrisk':
        if (metrics.debt_to_equity && metrics.debt_to_equity > 1) {
          insights.push(`Debt/Equity of ${metrics.debt_to_equity.toFixed(2)} warrants stress testing`);
        }
        if (metrics.current_ratio && metrics.current_ratio < 1) {
          insights.push('Current ratio below 1 indicates potential liquidity risk');
        }
        break;

      case 'tech':
        if (metrics.revenue_growth_yoy && metrics.gross_margin) {
          const rule40 = metrics.revenue_growth_yoy + metrics.gross_margin;
          insights.push(`Rule of 40 score: ${rule40.toFixed(1)} (Growth + Margin)`);
        }
        break;
    }

    return insights;
  }

  // ============================================
  // Formatting Methods
  // ============================================

  _formatPrecedentsSection(precedents) {
    let text = '### Similar Historical Situations\n\n';

    for (const p of precedents.precedents.slice(0, 3)) {
      const outcome = p.outcome?.return_1y != null
        ? `${p.outcome.return_1y > 0 ? '+' : ''}${p.outcome.return_1y.toFixed(1)}%`
        : 'N/A';
      const alpha = p.outcome?.alpha_1y != null
        ? `(α: ${p.outcome.alpha_1y > 0 ? '+' : ''}${p.outcome.alpha_1y.toFixed(1)}%)`
        : '';

      text += `- **${p.symbol}** (${p.decisionDate}): ${p.investor} ${p.decisionType.replace('_', ' ')}\n`;
      text += `  P/E: ${p.metricsAtDecision?.pe_ratio?.toFixed(1) || 'N/A'}, `;
      text += `ROIC: ${p.metricsAtDecision?.roic?.toFixed(1) || 'N/A'}%\n`;
      text += `  Outcome 1Y: ${outcome} ${alpha}\n`;
    }

    if (precedents.historicalOutcomes) {
      text += '\n**Historical Statistics:**\n';
      text += `- Win Rate: ${precedents.historicalOutcomes.winRate?.toFixed(0) || 'N/A'}%\n`;
      text += `- Median Return: ${precedents.historicalOutcomes.medianReturn?.toFixed(1) || 'N/A'}%\n`;
      text += `- Best Case: +${precedents.historicalOutcomes.bestCase?.toFixed(1) || 'N/A'}%\n`;
      text += `- Worst Case: ${precedents.historicalOutcomes.worstCase?.toFixed(1) || 'N/A'}%\n`;
    }

    return text;
  }

  _formatInvestorDecisionsSection(decisions) {
    let text = '### What Famous Investors Did\n\n';

    // Same stock decisions
    if (decisions.sameStock?.length > 0) {
      text += '**On This Exact Stock:**\n';
      for (const d of decisions.sameStock.slice(0, 5)) {
        const outcome = d.return_1y != null
          ? ` → ${d.return_1y > 0 ? '+' : ''}${d.return_1y.toFixed(1)}% (1Y)`
          : '';
        text += `- ${d.investor_name} (${d.investment_style}): ${d.decision_type.replace('_', ' ')} on ${d.decision_date}${outcome}\n`;
      }
      text += '\n';
    }

    // Similar situations
    if (decisions.similar?.length > 0) {
      text += '**In Similar Situations:**\n';
      for (const d of decisions.similar.slice(0, 5)) {
        const outcome = d.outcome?.return_1y != null
          ? ` → ${d.outcome.return_1y > 0 ? '+' : ''}${d.outcome.return_1y.toFixed(1)}%`
          : '';
        text += `- ${d.investor} bought ${d.symbol} (${d.date})${outcome}\n`;
      }
    }

    return text;
  }

  _formatPatternSection(patternMatch) {
    const p = patternMatch.primaryPattern;
    let text = '### Pattern Analysis\n\n';

    text += `**Primary Match: ${p.pattern.pattern_name}** (${(patternMatch.matchConfidence * 100).toFixed(0)}% confidence)\n\n`;
    text += `${p.pattern.description}\n\n`;

    if (p.sampleSize > 0) {
      text += '**Historical Performance of This Pattern:**\n';
      text += `- Sample Size: ${p.sampleSize} decisions\n`;
      text += `- Win Rate: ${p.historicalWinRate?.toFixed(1) || 'N/A'}%\n`;
      text += `- Avg 1Y Return: ${p.historicalAvgReturn != null ? (p.historicalAvgReturn > 0 ? '+' : '') + p.historicalAvgReturn.toFixed(1) : 'N/A'}%\n`;
    }

    if (patternMatch.secondaryPatterns?.length > 0) {
      text += '\n**Secondary Patterns:**\n';
      for (const sp of patternMatch.secondaryPatterns) {
        text += `- ${sp.pattern.pattern_name} (${(sp.score * 100).toFixed(0)}% match)\n`;
      }
    }

    return text;
  }

  _formatCautionarySection(tales) {
    let text = '### Cautionary Examples\n\n';
    text += 'Similar situations that underperformed:\n\n';

    for (const t of tales.slice(0, 3)) {
      text += `- **${t.symbol}** (${t.decision_date}): ${t.investor_name} bought at P/E ${t.pe_ratio?.toFixed(1) || 'N/A'}\n`;
      text += `  Result: ${t.return_1y.toFixed(1)}% return, ${t.outcome_category}\n`;
    }

    text += '\n*Consider what made these situations fail.*\n';

    return text;
  }

  _formatMarketContextSection(context) {
    let text = '### Current Market Context\n\n';

    if (context.market_cycle) {
      const cycleDescriptions = {
        'early_bull': 'Early Bull Market - Recovery phase',
        'mid_bull': 'Mid Bull Market - Healthy expansion',
        'late_bull': 'Late Bull Market - Elevated valuations',
        'correction': 'Correction - Market under pressure',
        'bear': 'Bear Market - Significant decline'
      };
      text += `- Market Cycle: **${cycleDescriptions[context.market_cycle] || context.market_cycle}**\n`;
    }

    if (context.sp500_1y_return != null) {
      text += `- S&P 500 1Y Return: ${context.sp500_1y_return > 0 ? '+' : ''}${context.sp500_1y_return.toFixed(1)}%\n`;
    }

    if (context.sp500_pe) {
      text += `- S&P 500 P/E: ${context.sp500_pe.toFixed(1)}\n`;
    }

    if (context.vix) {
      text += `- VIX: ${context.vix.toFixed(1)}\n`;
    }

    return text;
  }

  _formatAnalystInsightsSection(insights) {
    if (!insights || insights.length === 0) return '';

    let text = '### Key Insights\n\n';
    for (const insight of insights) {
      text += `- ${insight}\n`;
    }

    return text;
  }
}

module.exports = ContextBuilder;
