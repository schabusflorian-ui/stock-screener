/**
 * LLM Handler for Claude API with Tool Calling
 *
 * This module handles:
 * - Claude API integration with tool calling
 * - Multi-turn tool execution loop
 * - Conversation history management
 * - Error handling and fallbacks
 */

const Anthropic = require('@anthropic-ai/sdk');
const { TOOLS, INVESTMENT_ASSISTANT_PROMPT } = require('./tools');
const { ToolExecutor } = require('./tools/executors');

// Configuration
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5; // Prevent infinite loops

class LLMHandler {
  constructor() {
    this.client = null;
    this.toolExecutor = new ToolExecutor();
    this.initialized = false;

    this.initializeClient();
  }

  /**
   * Initialize the Anthropic client
   */
  initializeClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('[LLMHandler] ANTHROPIC_API_KEY not set - LLM features disabled');
      return;
    }

    try {
      this.client = new Anthropic({ apiKey });
      this.initialized = true;
      console.log('[LLMHandler] Initialized with Claude API');
    } catch (error) {
      console.error('[LLMHandler] Failed to initialize Anthropic client:', error.message);
    }
  }

  /**
   * Check if LLM handler is available
   */
  isAvailable() {
    return this.initialized && this.client !== null;
  }

  /**
   * Process a query using Claude with tool calling
   *
   * @param {string} query - User's query
   * @param {Array} conversationHistory - Previous messages for context
   * @param {Object} context - Additional context (current symbol, etc.)
   * @returns {Object} - Response with message and metadata
   */
  async processQuery(query, conversationHistory = [], context = {}) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'LLM service not available. Please configure ANTHROPIC_API_KEY.',
        fallback: true
      };
    }

    console.log(`[LLMHandler] Processing query: "${query.slice(0, 50)}..."`);

    try {
      // Build messages array from conversation history
      const messages = this.buildMessages(conversationHistory, query, context);

      // Track tools used for response metadata
      const toolsUsed = [];

      // Initial API call
      let response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: INVESTMENT_ASSISTANT_PROMPT,
        tools: TOOLS,
        messages
      });

      let iterations = 0;

      // Tool calling loop - keep calling until we get a final response
      while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        console.log(`[LLMHandler] Tool iteration ${iterations}`);

        // Extract tool calls from response
        const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

        // Execute all tool calls
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          console.log(`[LLMHandler] Executing tool: ${toolUse.name}`);

          const result = await this.toolExecutor.execute(toolUse.name, toolUse.input);

          toolsUsed.push({
            name: toolUse.name,
            input: toolUse.input
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }

        // Continue conversation with tool results
        messages.push({
          role: 'assistant',
          content: response.content
        });

        messages.push({
          role: 'user',
          content: toolResults
        });

        // Get next response
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: INVESTMENT_ASSISTANT_PROMPT,
          tools: TOOLS,
          messages
        });
      }

      // Extract final text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const responseText = textBlocks.map(block => block.text).join('\n');

      // Extract any structured data mentioned in response
      const structuredData = this.extractStructuredData(responseText, toolsUsed);

      return {
        success: true,
        result: {
          type: 'llm_response',
          message: responseText,
          summary: this.generateSummary(responseText),
          data: structuredData,
          tools_used: toolsUsed.map(t => t.name),
          model: MODEL
        },
        intent: 'llm_processed',
        confidence: 'high'
      };

    } catch (error) {
      console.error('[LLMHandler] Error processing query:', error);

      // Handle specific error types
      if (error.status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again in a moment.',
          fallback: true
        };
      }

      if (error.status === 401) {
        return {
          success: false,
          error: 'Invalid API key. Please check ANTHROPIC_API_KEY configuration.',
          fallback: true
        };
      }

      return {
        success: false,
        error: `Failed to process query: ${error.message}`,
        fallback: true
      };
    }
  }

  /**
   * Build messages array from conversation history
   */
  buildMessages(history, currentQuery, context) {
    const messages = [];

    // Build context summary for follow-up understanding
    let contextSummary = [];

    // Add symbol context
    if (context.last_symbol) {
      contextSummary.push(`Currently discussing: ${context.last_symbol}`);
    }

    // Track recent topics from history
    if (context.last_topic) {
      contextSummary.push(`Recent topic: ${context.last_topic}`);
    }

    // Track last screening parameters for follow-up refinements
    if (context.last_screen_params) {
      contextSummary.push(`Last screening filters: ${JSON.stringify(context.last_screen_params)}`);
    }

    // Track last calculation for follow-up questions
    if (context.last_calculation) {
      contextSummary.push(`Last calculation: ${context.last_calculation}`);
    }

    // If we have context, add it as a priming message
    if (contextSummary.length > 0) {
      messages.push({
        role: 'user',
        content: `[Conversation Context]\n${contextSummary.join('\n')}\n\n[Note: If the user says things like "lower it", "change to", "adjust", etc., they are likely referring to parameters from the previous query. Apply the modification to the most recent relevant context.]`
      });
      messages.push({
        role: 'assistant',
        content: `I understand the context. I'll interpret follow-up queries in relation to our previous discussion.`
      });
    }

    // Add conversation history (limited to last 10 exchanges for token efficiency)
    const recentHistory = history.slice(-20); // Last 10 exchanges = 20 messages
    for (const msg of recentHistory) {
      // Skip system messages or convert them appropriately
      if (msg.role === 'system') continue;

      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Detect if this is a follow-up refinement query
    const isRefinement = /\b(lower|higher|change|adjust|modify|increase|decrease|instead|rather|to \d+)\b/i.test(currentQuery);

    // Add current query with hint for refinements
    if (isRefinement && history.length > 0) {
      messages.push({
        role: 'user',
        content: `${currentQuery}\n\n[This appears to be a follow-up refinement. Please modify the parameters from my previous request accordingly.]`
      });
    } else {
      messages.push({
        role: 'user',
        content: currentQuery
      });
    }

    return messages;
  }

  /**
   * Generate a brief summary of the response
   */
  generateSummary(text) {
    if (!text) return '';

    // Take first sentence or first 150 chars
    const firstSentence = text.split(/[.!?]/)[0];
    if (firstSentence.length <= 150) {
      return firstSentence + '.';
    }
    return text.slice(0, 147) + '...';
  }

  /**
   * Extract structured data from response for frontend formatting
   */
  extractStructuredData(text, toolsUsed) {
    const data = {};

    // Check what tools were used to infer data type
    const toolNames = toolsUsed.map(t => t.name);

    if (toolNames.includes('lookup_company_metrics')) {
      data.type = 'company_metrics';
      // Extract symbol from tool input
      const lookupTool = toolsUsed.find(t => t.name === 'lookup_company_metrics');
      if (lookupTool?.input?.symbol) {
        data.symbol = lookupTool.input.symbol.toUpperCase();
      }
    }

    if (toolNames.includes('screen_stocks')) {
      data.type = 'screening_results';
    }

    if (toolNames.includes('get_sentiment')) {
      data.type = 'sentiment_analysis';
      const sentimentTool = toolsUsed.find(t => t.name === 'get_sentiment');
      if (sentimentTool?.input?.symbol) {
        data.symbol = sentimentTool.input.symbol.toUpperCase();
      }
    }

    if (toolNames.includes('get_investor_holdings')) {
      data.type = 'investor_holdings';
      const investorTool = toolsUsed.find(t => t.name === 'get_investor_holdings');
      if (investorTool?.input?.investor) {
        data.investor = investorTool.input.investor;
      }
    }

    if (toolNames.includes('compare_companies')) {
      data.type = 'comparison';
      const compareTool = toolsUsed.find(t => t.name === 'compare_companies');
      if (compareTool?.input?.symbols) {
        data.symbols = compareTool.input.symbols;
      }
    }

    if (toolNames.includes('calculate_metric')) {
      data.type = 'calculation';
      const calcTool = toolsUsed.find(t => t.name === 'calculate_metric');
      if (calcTool?.input) {
        data.symbol = calcTool.input.symbol?.toUpperCase();
        data.metric = calcTool.input.metric;
      }
    }

    // Extract numbers from text for display
    const numbers = text.match(/\$[\d,.]+[BMK]?|\d+\.?\d*%|\d+\.?\d*x/g);
    if (numbers && numbers.length > 0) {
      data.key_numbers = numbers.slice(0, 5);
    }

    return data;
  }
}

// Singleton instance
let instance = null;

function getLLMHandler() {
  if (!instance) {
    instance = new LLMHandler();
  }
  return instance;
}

module.exports = {
  LLMHandler,
  getLLMHandler
};
