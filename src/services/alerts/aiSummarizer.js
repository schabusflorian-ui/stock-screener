// src/services/alerts/aiSummarizer.js
// AI-powered alert summarization for "What Matters Today" feature

const Anthropic = require('@anthropic-ai/sdk');
const { getDatabaseAsync } = require('../../lib/db');

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 500;
const TEMPERATURE = 0.3; // Lower temperature for more focused summaries

class AlertAISummarizer {
  constructor() {
    this.client = null;
    this.initialized = false;

    this.initializeClient();
  }

  /**
   * Initialize the Anthropic client
   */
  initializeClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('[AlertAISummarizer] ANTHROPIC_API_KEY not set - AI summaries disabled');
      return;
    }

    try {
      this.client = new Anthropic({ apiKey });
      this.initialized = true;
      console.log('[AlertAISummarizer] Initialized with Claude API');
    } catch (error) {
      console.error('[AlertAISummarizer] Failed to initialize:', error.message);
    }
  }

  /**
   * Get the system prompt for alert summarization
   */
  getSystemPrompt() {
    return `You are analyzing investment alerts for a user. Your job is to provide a concise, actionable summary.

Guidelines:
1. Identify the 2-3 most important signals that deserve attention
2. Explain WHY they matter in the current market context
3. Distinguish idiosyncratic moves (company-specific) from market-wide movements
4. Suggest specific next steps when appropriate
5. Be concise - aim for 2-4 sentences total

Avoid:
- Generic advice like "do your own research"
- Overly bullish/bearish language without context
- Mentioning every single alert - focus on what MATTERS

Signal type meanings:
- strong_bullish/strong_buy: Strong positive signal
- bullish/buy: Positive signal
- warning: Potential concern
- watch: Worth monitoring
- info: Informational only`;
  }

  /**
   * Build the user prompt with alerts and context
   */
  buildPrompt(alerts, context = {}) {
    const { regime, portfolioPositions = [], watchlist = [] } = context;

    let prompt = '';

    // Add market context if available
    if (regime) {
      prompt += `Market Regime: ${regime.regime || 'Unknown'}`;
      if (regime.vix) prompt += ` (VIX: ${regime.vix.toFixed(1)})`;
      if (regime.description) prompt += `\n${regime.description}`;
      prompt += '\n\n';
    }

    // Add portfolio context
    if (portfolioPositions.length > 0) {
      const top5 = portfolioPositions
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
        .slice(0, 5);
      prompt += `User's Top Positions: ${top5.map(p => `${p.symbol} (${(p.weight || 0).toFixed(1)}%)`).join(', ')}\n`;
    }

    // Add watchlist context
    if (watchlist.length > 0) {
      prompt += `Watchlist: ${watchlist.slice(0, 10).join(', ')}\n`;
    }

    prompt += '\n';

    // Add alerts
    prompt += `Today's Alerts (${alerts.length} total):\n`;

    // Sort by priority and limit to top 15
    const topAlerts = alerts
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 15);

    for (const alert of topAlerts) {
      const symbol = alert.symbol || 'Unknown';
      const signalType = alert.signal_type || 'watch';
      const priority = alert.priority || 3;

      prompt += `- ${symbol}: ${alert.title || alert.alert_code} (${signalType}, P${priority})`;

      // Add extra context for important signals
      if (priority >= 4 && alert.description) {
        prompt += `\n  ${alert.description}`;
      }

      prompt += '\n';
    }

    prompt += `\nProvide a 2-4 sentence summary of what matters most today and any suggested actions.`;

    return prompt;
  }

  /**
   * Generate AI summary for a set of alerts
   */
  async summarize(alerts, context = {}) {
    if (!this.initialized || !this.client) {
      return this.getFallbackSummary(alerts);
    }

    if (!alerts || alerts.length === 0) {
      return {
        summary: 'No alerts to summarize.',
        topPriorities: [],
        suggestedActions: [],
        generated: false
      };
    }

    try {
      const prompt = this.buildPrompt(alerts, context);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [
          { role: 'user', content: prompt }
        ],
        system: this.getSystemPrompt()
      });

      const content = response.content?.[0]?.text || '';

      return {
        summary: content,
        topPriorities: this.extractTopPriorities(alerts),
        suggestedActions: this.extractActions(content, alerts),
        generated: true,
        model: MODEL,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens
      };
    } catch (error) {
      console.error('[AlertAISummarizer] Error generating summary:', error.message);
      return this.getFallbackSummary(alerts);
    }
  }

  /**
   * Generate a fallback summary without AI
   */
  getFallbackSummary(alerts) {
    if (!alerts || alerts.length === 0) {
      return {
        summary: 'No alerts to summarize.',
        topPriorities: [],
        suggestedActions: [],
        generated: false
      };
    }

    const highPriority = alerts.filter(a => a.priority >= 4);
    const buySignals = alerts.filter(a =>
      ['strong_bullish', 'bullish', 'strong_buy', 'buy'].includes(a.signal_type)
    );
    const warnings = alerts.filter(a => a.signal_type === 'warning');

    let summary = '';

    if (highPriority.length > 0) {
      const symbols = [...new Set(highPriority.map(a => a.symbol).filter(Boolean))];
      summary = `${highPriority.length} important signal${highPriority.length > 1 ? 's' : ''} detected`;

      if (symbols.length <= 3) {
        summary += ` for ${symbols.join(', ')}`;
      } else {
        summary += ` across ${symbols.length} stocks`;
      }
      summary += '. ';
    }

    if (buySignals.length > warnings.length && buySignals.length > 2) {
      summary += `${buySignals.length} bullish signals indicate potential opportunities. `;
    } else if (warnings.length > buySignals.length && warnings.length > 2) {
      summary += `${warnings.length} warnings require attention. `;
    }

    if (summary === '') {
      summary = `${alerts.length} alerts generated. Review the list to identify any worth investigating.`;
    }

    return {
      summary: summary.trim(),
      topPriorities: this.extractTopPriorities(alerts),
      suggestedActions: this.getSuggestedActions(alerts),
      generated: false
    };
  }

  /**
   * Extract top priority alerts
   */
  extractTopPriorities(alerts) {
    return alerts
      .filter(a => a.priority >= 4)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3)
      .map(a => ({
        symbol: a.symbol,
        title: a.title || a.alert_code,
        signalType: a.signal_type,
        priority: a.priority
      }));
  }

  /**
   * Extract suggested actions from AI response
   */
  extractActions(content, alerts) {
    const actions = [];

    // Look for action keywords in the AI response
    const actionKeywords = [
      'consider', 'review', 'investigate', 'watch', 'monitor',
      'research', 'evaluate', 'check', 'assess'
    ];

    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (actionKeywords.some(kw => lowerSentence.includes(kw))) {
        actions.push(sentence);
      }
    }

    // If no actions found in AI response, generate from alerts
    if (actions.length === 0) {
      return this.getSuggestedActions(alerts);
    }

    return actions.slice(0, 3);
  }

  /**
   * Generate suggested actions from alerts
   */
  getSuggestedActions(alerts) {
    const actions = [];
    const highPriority = alerts.filter(a => a.priority >= 4);

    // Find insider buying signals
    const insiderBuying = alerts.filter(a =>
      a.alert_code?.includes('insider_buying')
    );
    if (insiderBuying.length > 0) {
      const symbols = [...new Set(insiderBuying.map(a => a.symbol).filter(Boolean))];
      actions.push(`Review insider activity for ${symbols.slice(0, 3).join(', ')}`);
    }

    // Find valuation signals
    const valuationSignals = alerts.filter(a =>
      a.alert_type === 'valuation' && a.priority >= 4
    );
    if (valuationSignals.length > 0) {
      const symbols = [...new Set(valuationSignals.map(a => a.symbol).filter(Boolean))];
      actions.push(`Evaluate valuation metrics for ${symbols.slice(0, 3).join(', ')}`);
    }

    // Find warning signals
    const warnings = alerts.filter(a => a.signal_type === 'warning');
    if (warnings.length > 2) {
      actions.push(`Review positions with warning signals for risk assessment`);
    }

    return actions.slice(0, 3);
  }

  /**
   * Get context data for summary generation
   */
  async getContext(userId = 'default') {
    const context = {
      regime: null,
      portfolioPositions: [],
      watchlist: []
    };

    try {
      const database = await getDatabaseAsync();

      // Get current market regime
      const regimeResult = await database.query(`
        SELECT * FROM market_regime_history
        ORDER BY detected_at DESC
        LIMIT 1
      `);

      if (regimeResult.rows.length > 0) {
        context.regime = regimeResult.rows[0];
      }

      // Get user's portfolio positions
      const positionsResult = await database.query(`
        SELECT
          c.symbol,
          pp.shares * pp.current_price / p.current_value * 100 as weight
        FROM portfolio_positions pp
        JOIN portfolios p ON pp.portfolio_id = p.id
        JOIN companies c ON pp.company_id = c.id
        WHERE p.user_id = $1
        ORDER BY weight DESC
        LIMIT 20
      `, [userId]);

      context.portfolioPositions = positionsResult.rows;

      // Get user's watchlist
      const watchlistResult = await database.query(`
        SELECT c.symbol
        FROM watchlist w
        JOIN companies c ON w.company_id = c.id
        WHERE w.user_id = $1 OR w.user_id IS NULL
        ORDER BY w.created_at DESC
        LIMIT 20
      `, [userId]);

      context.watchlist = watchlistResult.rows.map(w => w.symbol);

    } catch (err) {
      console.warn('[AlertAISummarizer] Error fetching context:', err.message);
    }

    return context;
  }

  /**
   * Generate a complete "What Matters Today" summary
   */
  async generateWhatMattersToday(userId = 'default') {
    try {
      const database = await getDatabaseAsync();

      // Get recent alerts
      const alertsResult = await database.query(`
        SELECT
          a.*,
          c.symbol,
          c.name as company_name
        FROM alerts a
        JOIN companies c ON a.company_id = c.id
        WHERE a.triggered_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
          AND a.is_dismissed = false
        ORDER BY a.priority DESC, a.triggered_at DESC
        LIMIT 50
      `);

      const alerts = alertsResult.rows;

      if (alerts.length === 0) {
        return {
          summary: 'No new alerts in the past 24 hours. Your watchlist and portfolio are stable.',
          topPriorities: [],
          suggestedActions: [],
          alertCount: 0,
          generated: true
        };
      }

      // Get context
      const context = await this.getContext(userId);

      // Generate summary
      const result = await this.summarize(alerts, context);

      return {
        ...result,
        alertCount: alerts.length,
        highPriorityCount: alerts.filter(a => a.priority >= 4).length,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[AlertAISummarizer] Error in generateWhatMattersToday:', error.message);
      return {
        summary: 'Unable to generate summary at this time.',
        topPriorities: [],
        suggestedActions: [],
        error: error.message,
        generated: false
      };
    }
  }
}

module.exports = { AlertAISummarizer };
