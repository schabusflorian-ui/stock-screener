/**
 * LLM Handler for Claude API with Tool Calling
 *
 * This module handles:
 * - Claude API integration with tool calling (standard and streaming)
 * - Multi-turn tool execution loop
 * - Conversation history management
 * - Error handling and fallbacks
 * - Server-Sent Events (SSE) for streaming responses
 */

const Anthropic = require('@anthropic-ai/sdk');
const { TOOLS, INVESTMENT_ASSISTANT_PROMPT } = require('./tools');
const { ToolExecutor } = require('./tools/executors');
const { trackClaudeCall } = require('../costs');

// Configuration
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 5; // Prevent infinite loops
const LLM_TIMEOUT_MS = 15000; // 15 second timeout for LLM calls
const TOOL_TIMEOUT_MS = 10000; // 10 second timeout for individual tool execution

// SSE Event Types
const SSE_EVENTS = {
  TEXT_DELTA: 'text_delta',       // Incremental text content
  TOOL_START: 'tool_start',       // Tool execution starting
  TOOL_RESULT: 'tool_result',     // Tool execution complete
  METADATA: 'metadata',           // Response metadata (charts, symbols, etc.)
  DONE: 'done',                   // Stream complete
  ERROR: 'error'                  // Error occurred
};

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
   * Wrap a promise with a timeout
   * @param {Promise} promise - The promise to wrap
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} operationName - Name of operation for error message
   * @returns {Promise} - Resolves with result or rejects on timeout
   */
  withTimeout(promise, timeoutMs, operationName = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${operationName} timed out after ${timeoutMs / 1000}s. Please try again.`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Execute a tool with timeout protection
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Tool input parameters
   * @returns {Promise<Object>} - Tool result or timeout error
   */
  async executeToolWithTimeout(toolName, input) {
    try {
      return await this.withTimeout(
        this.toolExecutor.execute(toolName, input),
        TOOL_TIMEOUT_MS,
        `Tool '${toolName}'`
      );
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.error(`[LLMHandler] Tool ${toolName} timed out`);
        return { error: error.message, timeout: true };
      }
      throw error;
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
      // Store raw tool results to extract chart_data later
      const rawToolResults = [];

      // Initial API call with timeout and cost tracking
      let response = await this.withTimeout(
        trackClaudeCall(
          () => this.client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: INVESTMENT_ASSISTANT_PROMPT,
            tools: TOOLS,
            messages
          }),
          {
            jobKey: context.jobKey || 'nl_query',
            endpoint: '/v1/messages'
          }
        ),
        LLM_TIMEOUT_MS,
        'LLM request'
      );

      let iterations = 0;

      // Tool calling loop - keep calling until we get a final response
      while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        console.log(`[LLMHandler] Tool iteration ${iterations}`);

        // Extract tool calls from response
        const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

        // Execute all tool calls with timeout protection
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          console.log(`[LLMHandler] Executing tool: ${toolUse.name}`);

          const result = await this.executeToolWithTimeout(toolUse.name, toolUse.input);

          toolsUsed.push({
            name: toolUse.name,
            input: toolUse.input
          });

          // Store raw result for chart_data extraction
          rawToolResults.push({
            name: toolUse.name,
            input: toolUse.input,
            result: result
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

        // Get next response with timeout and cost tracking
        response = await this.withTimeout(
          trackClaudeCall(
            () => this.client.messages.create({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: INVESTMENT_ASSISTANT_PROMPT,
              tools: TOOLS,
              messages
            }),
            {
              jobKey: context.jobKey || 'nl_query',
              endpoint: '/v1/messages'
            }
          ),
          LLM_TIMEOUT_MS,
          'LLM request'
        );
      }

      // Extract final text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const responseText = textBlocks.map(block => block.text).join('\n');

      // Extract any structured data mentioned in response
      const structuredData = this.extractStructuredData(responseText, toolsUsed);

      // Extract chart data from tool results
      const chartData = this.extractChartData(rawToolResults);

      return {
        success: true,
        result: {
          type: 'llm_response',
          message: responseText,
          summary: this.generateSummary(responseText),
          data: structuredData,
          tools_used: toolsUsed.map(t => t.name),
          model: MODEL,
          // Include chart data from tool results
          chart_data: chartData.primary,
          analyst_chart_data: chartData.analyst,
          additional_charts: chartData.additional,
          price_comparison_chart: chartData.priceComparison,
          scatter_chart: chartData.scatter,
          heatmap_chart: chartData.heatmap,
          symbol: chartData.symbol
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
   * Process a query using Claude with streaming response
   * Yields SSE events for real-time UI updates
   *
   * @param {string} query - User's query
   * @param {Array} conversationHistory - Previous messages for context
   * @param {Object} context - Additional context (current symbol, etc.)
   * @param {Function} onEvent - Callback for SSE events: (eventType, data) => void
   * @returns {Promise<Object>} - Final response with message and metadata
   */
  async processQueryStreaming(query, conversationHistory = [], context = {}, onEvent) {
    if (!this.isAvailable()) {
      onEvent(SSE_EVENTS.ERROR, {
        error: 'LLM service not available. Please configure ANTHROPIC_API_KEY.'
      });
      return { success: false, error: 'LLM service not available', fallback: true };
    }

    console.log(`[LLMHandler] Processing streaming query: "${query.slice(0, 50)}..."`);

    try {
      // Build messages array from conversation history
      const messages = this.buildMessages(conversationHistory, query, context);

      // Track tools used for response metadata
      const toolsUsed = [];
      // Store raw tool results to extract chart_data later
      const rawToolResults = [];
      // Accumulate full response text
      let fullResponseText = '';

      let iterations = 0;
      let continueLoop = true;

      while (continueLoop && iterations < MAX_TOOL_ITERATIONS) {
        // Create streaming request with timeout protection
        let stream;
        let streamTimeout;

        try {
          // Create the stream with a timeout wrapper
          const streamPromise = this.client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: INVESTMENT_ASSISTANT_PROMPT,
            tools: TOOLS,
            messages
          });

          stream = await streamPromise;
        } catch (streamError) {
          console.error('[LLMHandler] Failed to create stream:', streamError);
          onEvent(SSE_EVENTS.ERROR, {
            error: 'Failed to connect to AI service. Please try again.'
          });
          return { success: false, error: streamError.message, fallback: true };
        }

        // Track content blocks for this iteration
        const contentBlocks = [];
        let currentTextBlock = '';
        const toolUseBlocks = [];
        let lastEventTime = Date.now();

        // Set up stream inactivity timeout (30 seconds without events)
        const STREAM_INACTIVITY_TIMEOUT = 30000;
        const checkStreamActivity = () => {
          if (Date.now() - lastEventTime > STREAM_INACTIVITY_TIMEOUT) {
            console.error('[LLMHandler] Stream inactivity timeout');
            stream.controller?.abort();
          }
        };
        streamTimeout = setInterval(checkStreamActivity, 5000);

        // Process the stream with error handling
        try {
          for await (const event of stream) {
            lastEventTime = Date.now(); // Reset timeout on each event
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'text') {
                currentTextBlock = '';
              } else if (event.content_block.type === 'tool_use') {
                toolUseBlocks.push({
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: ''
                });
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                const text = event.delta.text;
                currentTextBlock += text;
                fullResponseText += text;
                // Stream text to client immediately
                onEvent(SSE_EVENTS.TEXT_DELTA, { text });
              } else if (event.delta.type === 'input_json_delta') {
                // Accumulate tool input JSON
                if (toolUseBlocks.length > 0) {
                  toolUseBlocks[toolUseBlocks.length - 1].input += event.delta.partial_json;
                }
              }
            } else if (event.type === 'content_block_stop') {
              if (currentTextBlock) {
                contentBlocks.push({ type: 'text', text: currentTextBlock });
                currentTextBlock = '';
              }
            } else if (event.type === 'message_stop') {
              // Message complete
            }
          }
        } catch (streamError) {
          console.error('[LLMHandler] Stream processing error:', streamError);
          clearInterval(streamTimeout);
          onEvent(SSE_EVENTS.ERROR, {
            error: 'Stream interrupted. Please try again.',
            partial: fullResponseText.length > 0
          });
          // If we have partial content, return it
          if (fullResponseText.length > 0) {
            return {
              success: false,
              partial: true,
              result: {
                type: 'llm_response',
                message: fullResponseText,
                summary: this.generateSummary(fullResponseText),
                tools_used: toolsUsed.map(t => t.name)
              },
              error: streamError.message
            };
          }
          return { success: false, error: streamError.message, fallback: true };
        } finally {
          clearInterval(streamTimeout);
        }

        // Get final message to check stop reason
        const finalMessage = await stream.finalMessage();

        // Parse tool inputs and add to content blocks
        for (const toolBlock of toolUseBlocks) {
          try {
            toolBlock.input = JSON.parse(toolBlock.input || '{}');
          } catch (e) {
            toolBlock.input = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input
          });
        }

        // Check if we need to execute tools
        if (finalMessage.stop_reason === 'tool_use') {
          iterations++;
          console.log(`[LLMHandler] Streaming tool iteration ${iterations}`);

          // Execute tools
          const toolResults = [];
          const toolUses = contentBlocks.filter(b => b.type === 'tool_use');

          for (const toolUse of toolUses) {
            // Notify client that tool is executing
            onEvent(SSE_EVENTS.TOOL_START, {
              tool: toolUse.name,
              input: toolUse.input
            });

            console.log(`[LLMHandler] Executing tool: ${toolUse.name}`);
            const result = await this.executeToolWithTimeout(toolUse.name, toolUse.input);

            toolsUsed.push({
              name: toolUse.name,
              input: toolUse.input
            });

            rawToolResults.push({
              name: toolUse.name,
              input: toolUse.input,
              result: result
            });

            // Notify client of tool result (summary only, not full data)
            onEvent(SSE_EVENTS.TOOL_RESULT, {
              tool: toolUse.name,
              success: !result.error && !result.timeout,
              summary: result.summary || (result.error ? result.error : 'Data retrieved')
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
            content: contentBlocks
          });

          messages.push({
            role: 'user',
            content: toolResults
          });

          // Continue the loop for next iteration
          continueLoop = true;
        } else {
          // No more tool calls, we're done
          continueLoop = false;
        }
      }

      // Extract structured data and charts
      const structuredData = this.extractStructuredData(fullResponseText, toolsUsed);
      const chartData = this.extractChartData(rawToolResults);

      // Send metadata event
      onEvent(SSE_EVENTS.METADATA, {
        tools_used: toolsUsed.map(t => t.name),
        chart_data: chartData.primary,
        analyst_chart_data: chartData.analyst,
        additional_charts: chartData.additional,
        price_comparison_chart: chartData.priceComparison,
        scatter_chart: chartData.scatter,
        heatmap_chart: chartData.heatmap,
        symbol: chartData.symbol,
        data: structuredData
      });

      // Send done event
      onEvent(SSE_EVENTS.DONE, {
        model: MODEL,
        message: fullResponseText
      });

      return {
        success: true,
        result: {
          type: 'llm_response',
          message: fullResponseText,
          summary: this.generateSummary(fullResponseText),
          data: structuredData,
          tools_used: toolsUsed.map(t => t.name),
          model: MODEL,
          chart_data: chartData.primary,
          analyst_chart_data: chartData.analyst,
          additional_charts: chartData.additional,
          price_comparison_chart: chartData.priceComparison,
          scatter_chart: chartData.scatter,
          heatmap_chart: chartData.heatmap,
          symbol: chartData.symbol
        },
        intent: 'llm_processed',
        confidence: 'high'
      };

    } catch (error) {
      console.error('[LLMHandler] Streaming error:', error);

      const errorMessage = error.status === 429
        ? 'Rate limit exceeded. Please try again in a moment.'
        : error.status === 401
          ? 'Invalid API key. Please check configuration.'
          : `Failed to process query: ${error.message}`;

      onEvent(SSE_EVENTS.ERROR, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
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
    const contextSummary = [];

    // Add symbol context (from conversation or right-click Ask AI)
    const symbol = context.last_symbol || context.symbol;
    if (symbol) {
      contextSummary.push(`Currently discussing: ${symbol}`);
    }

    // Add right-click Ask AI context (metric, value, label)
    // This is data the user right-clicked on - we have this data available to analyze
    if (context.metric || context.label) {
      const metricName = context.label || context.metric;
      const elementType = context.contextType || context.type || 'element';

      if (context.value !== undefined && context.value !== null) {
        contextSummary.push(`User right-clicked on ${elementType}: ${metricName} with current value ${context.value}`);
      } else {
        contextSummary.push(`User right-clicked on ${elementType}: ${metricName}`);
      }

      // Add interpretation if available (pre-computed insight about the data)
      if (context.interpretation) {
        contextSummary.push(`Data insight: ${context.interpretation}`);
      }

      // Add chart statistics if available
      if (context.chartStats) {
        const stats = context.chartStats;
        if (stats.historicalAvg !== undefined) {
          contextSummary.push(`Historical average: ${stats.historicalAvg?.toFixed(1)}, Range: ${stats.min?.toFixed(1)} - ${stats.max?.toFixed(1)}`);
        }
        if (stats.trend) {
          contextSummary.push(`Recent trend: ${stats.trend}`);
        }
      }

      // Add range data if available (for charts)
      if (context.range) {
        contextSummary.push(`Data range: min=${context.range.min?.toFixed(2)}, max=${context.range.max?.toFixed(2)}, avg=${context.range.avg?.toFixed(2)}`);
      }

      // Add current value for charts
      if (context.currentValue !== undefined) {
        contextSummary.push(`Current/latest value: ${context.currentValue}`);
      }

      // Add embedded data object if available
      if (context.data && typeof context.data === 'object') {
        const dataStr = Object.entries(context.data)
          .filter(([_, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
          .join(', ');
        if (dataStr) {
          contextSummary.push(`Available data: ${dataStr}`);
        }
      }

      // Add visible metrics for table rows
      if (context.visibleMetrics && typeof context.visibleMetrics === 'object') {
        const metricsStr = Object.entries(context.visibleMetrics)
          .filter(([_, v]) => v !== undefined && v !== null && typeof v === 'number')
          .slice(0, 10) // Limit to 10 most important
          .map(([k, v]) => `${k}: ${v.toFixed ? v.toFixed(2) : v}`)
          .join(', ');
        if (metricsStr) {
          contextSummary.push(`Visible metrics: ${metricsStr}`);
        }
      }

      // Add assessment for valuation indicators
      if (context.assessment) {
        contextSummary.push(`Assessment: ${context.assessment}`);
      }

      // Add additional context data if available
      if (context.chartValue !== undefined) {
        contextSummary.push(`Chart shows latest value: ${context.chartValue}${context.unit || ''}`);
      }
      if (context.symbol) {
        contextSummary.push(`Related to symbol: ${context.symbol}`);
      }
      if (context.companyName) {
        contextSummary.push(`Company: ${context.companyName}`);
      }
      if (context.sector) {
        contextSummary.push(`Sector: ${context.sector}`);
      }
      if (context.companies && Array.isArray(context.companies)) {
        contextSummary.push(`Companies in view: ${context.companies.join(', ')}`);
      }
      if (context.symbols && Array.isArray(context.symbols)) {
        contextSummary.push(`Symbols: ${context.symbols.join(', ')}`);
      }
      if (context.isInverted !== undefined) {
        contextSummary.push(`Inverted: ${context.isInverted ? 'Yes' : 'No'}`);
      }
    }

    // Add context type if available (chart, metric, table_row, valuation_indicator, etc.)
    if (context.contextType && !context.metric && !context.label) {
      contextSummary.push(`Element type: ${context.contextType}`);
    }

    // Add page context if available
    if (context.page) {
      contextSummary.push(`Current page: ${context.page}`);
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
      const hasRightClickContext = context.metric || context.label;
      const hasDataAvailable = context.data || context.chartStats || context.range || context.visibleMetrics || context.interpretation;

      let contextNote;
      if (hasRightClickContext && hasDataAvailable) {
        contextNote = '[IMPORTANT: The user right-clicked on a specific UI element. You have ACTUAL DATA available above including values, statistics, and interpretations. Use this data to provide a detailed, data-driven answer. Do NOT say you cannot see the chart or need more information - the data is provided above. Analyze the specific values, trends, and context given.]';
      } else if (hasRightClickContext) {
        contextNote = '[Note: The user right-clicked on a UI element. Use the label and value information above to answer. If they ask about patterns or trends, explain what the current value means historically and in context.]';
      } else {
        contextNote = '[Note: If the user says things like "lower it", "change to", "adjust", etc., they are likely referring to parameters from the previous query. Use the context above to understand what the user is looking at.]';
      }

      messages.push({
        role: 'user',
        content: `[Conversation Context]\n${contextSummary.join('\n')}\n\n${contextNote}`
      });
      messages.push({
        role: 'assistant',
        content: hasDataAvailable
          ? 'I have access to the specific data you\'re viewing, including values, statistics, and trends. I\'ll provide analysis based on this information.'
          : 'I understand the context and will answer based on the information provided.'
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

  /**
   * Extract screening criteria from natural language query
   * Used for direct screening on the Screening page
   *
   * @param {string} query - Natural language query like "undervalued tech stocks"
   * @param {Object} context - Additional context
   * @returns {Object} - Structured screening criteria
   */
  async extractScreeningCriteria(query, context = {}) {
    if (!this.isAvailable()) {
      // Fall back to rule-based extraction
      return this.extractScreeningCriteriaFallback(query);
    }

    console.log(`[LLMHandler] Extracting screening criteria from: "${query}"`);

    const systemPrompt = `You are an expert at converting natural language investment queries into structured screening criteria.

Your task is to analyze the user's query and extract screening parameters that match our database schema.

AVAILABLE CRITERIA FIELDS:
- sectors: Array of sector names. Valid sectors: Technology, Healthcare, Financial Services, Consumer Cyclical, Consumer Defensive, Industrials, Energy, Basic Materials, Real Estate, Communication Services, Utilities
- industries: Array of industry names (be specific)
- regions: Array of regions. Valid: North America, Europe, Asia, Other
- countries: Array of country names
- minMarketCap, maxMarketCap: Market cap in billions (e.g., 10 = $10B)
- minPERatio, maxPERatio: P/E ratio bounds
- minPBRatio, maxPBRatio: Price-to-Book ratio bounds
- minDividendYield, maxDividendYield: Dividend yield as percentage (e.g., 3 = 3%)
- minROIC, maxROIC: Return on Invested Capital as percentage
- minROE, maxROE: Return on Equity as percentage
- minFCFYield, maxFCFYield: Free Cash Flow yield as percentage
- minProfitMargin, maxProfitMargin: Net profit margin as percentage
- minRevenueGrowth, maxRevenueGrowth: Revenue growth as percentage
- minDebtToEquity, maxDebtToEquity: Debt-to-Equity ratio (e.g., 0.5 = 50%)
- sortBy: Field to sort by (market_cap, pe_ratio, roic, roe, dividend_yield, revenue_growth, profit_margin, fcf_yield)
- sortOrder: ASC or DESC
- limit: Number of results (default 50)

COMMON PHRASE MAPPINGS:
- "undervalued" / "cheap" / "bargain" → maxPERatio: 15, maxPBRatio: 2
- "overvalued" / "expensive" → minPERatio: 30
- "quality" / "high quality" → minROIC: 15, minProfitMargin: 15
- "growth" / "high growth" → minRevenueGrowth: 15
- "dividend" / "income" / "yield" → minDividendYield: 2
- "high dividend" → minDividendYield: 4
- "low debt" / "conservative" → maxDebtToEquity: 0.5
- "large cap" / "blue chip" → minMarketCap: 50
- "mid cap" → minMarketCap: 10, maxMarketCap: 50
- "small cap" → maxMarketCap: 10
- "mega cap" → minMarketCap: 200
- "profitable" → minProfitMargin: 10
- "top 10" / "best" → sortOrder: DESC, limit: 10
- "top 20" → sortOrder: DESC, limit: 20
- "highest" → sortOrder: DESC
- "lowest" → sortOrder: ASC

RESPONSE FORMAT (JSON only, no markdown):
{
  "intent": "screen" | "other",
  "confidence": 0.0-1.0,
  "criteria": { /* matching fields from above */ },
  "interpretation": "Brief description of what was extracted",
  "naturalDescription": "Short title for this screen (3-5 words)"
}

If the query is NOT a screening request (e.g., "tell me about AAPL", "what is P/E ratio"), return:
{
  "intent": "other",
  "confidence": 0.9,
  "criteria": {},
  "interpretation": "This is not a screening query",
  "naturalDescription": null
}`;

    try {
      const response = await this.withTimeout(
        this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: query
            }
          ]
        }),
        LLM_TIMEOUT_MS,
        'Screening criteria extraction'
      );

      // Extract text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const responseText = textBlocks.map(block => block.text).join('');

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[LLMHandler] No JSON found in screening criteria response');
        return this.extractScreeningCriteriaFallback(query);
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        ...result,
        source: 'llm'
      };

    } catch (error) {
      console.error('[LLMHandler] Screening criteria extraction error:', error);
      // Fall back to rule-based
      return this.extractScreeningCriteriaFallback(query);
    }
  }

  /**
   * Rule-based fallback for screening criteria extraction
   */
  extractScreeningCriteriaFallback(query) {
    const queryLower = query.toLowerCase();
    const criteria = {};
    let confidence = 0.5;

    // Check if this looks like a screening query
    const screeningPatterns = /\b(show|find|screen|filter|list|give me|get me|looking for|search|top \d+|best|stocks?|companies)\b/i;
    if (!screeningPatterns.test(query)) {
      return {
        success: true,
        intent: 'other',
        confidence: 0.7,
        criteria: {},
        interpretation: 'This does not appear to be a screening query',
        naturalDescription: null,
        source: 'fallback'
      };
    }

    // Extract sectors
    const sectorMap = {
      'tech': 'Technology', 'technology': 'Technology',
      'healthcare': 'Healthcare', 'health': 'Healthcare', 'pharma': 'Healthcare', 'biotech': 'Healthcare',
      'financial': 'Financial Services', 'finance': 'Financial Services', 'bank': 'Financial Services',
      'consumer': 'Consumer Cyclical', 'retail': 'Consumer Cyclical',
      'industrial': 'Industrials', 'manufacturing': 'Industrials',
      'energy': 'Energy', 'oil': 'Energy', 'gas': 'Energy',
      'materials': 'Basic Materials', 'mining': 'Basic Materials',
      'real estate': 'Real Estate', 'reit': 'Real Estate',
      'utilities': 'Utilities', 'utility': 'Utilities',
      'telecom': 'Communication Services', 'communication': 'Communication Services', 'media': 'Communication Services'
    };

    for (const [keyword, sector] of Object.entries(sectorMap)) {
      if (queryLower.includes(keyword)) {
        criteria.sectors = criteria.sectors || [];
        if (!criteria.sectors.includes(sector)) {
          criteria.sectors.push(sector);
        }
        confidence += 0.1;
      }
    }

    // Valuation keywords
    if (/\b(undervalued|cheap|bargain|value)\b/.test(queryLower)) {
      criteria.maxPERatio = 15;
      criteria.maxPBRatio = 2;
      confidence += 0.15;
    }

    if (/\b(overvalued|expensive)\b/.test(queryLower)) {
      criteria.minPERatio = 30;
      confidence += 0.1;
    }

    // Quality keywords
    if (/\b(quality|high quality|excellent)\b/.test(queryLower)) {
      criteria.minROIC = 15;
      criteria.minProfitMargin = 15;
      confidence += 0.15;
    }

    // Growth keywords
    if (/\b(growth|growing|high growth|fast growing)\b/.test(queryLower)) {
      criteria.minRevenueGrowth = 15;
      confidence += 0.1;
    }

    // Dividend keywords
    if (/\b(dividend|income|yield)\b/.test(queryLower)) {
      criteria.minDividendYield = /\bhigh\s*(dividend|yield)\b/.test(queryLower) ? 4 : 2;
      confidence += 0.1;
    }

    // Debt keywords
    if (/\b(low debt|no debt|conservative|safe)\b/.test(queryLower)) {
      criteria.maxDebtToEquity = 0.5;
      confidence += 0.1;
    }

    // Market cap
    if (/\b(large cap|blue chip|mega)\b/.test(queryLower)) {
      criteria.minMarketCap = 50;
      confidence += 0.1;
    } else if (/\bmid cap\b/.test(queryLower)) {
      criteria.minMarketCap = 10;
      criteria.maxMarketCap = 50;
      confidence += 0.1;
    } else if (/\bsmall cap\b/.test(queryLower)) {
      criteria.maxMarketCap = 10;
      confidence += 0.1;
    }

    // Top N
    const topMatch = queryLower.match(/\btop\s*(\d+)\b/);
    if (topMatch) {
      criteria.limit = parseInt(topMatch[1]);
      criteria.sortOrder = 'DESC';
      confidence += 0.1;
    }

    // Sort by specific metrics
    if (/\b(by roic|highest roic)\b/.test(queryLower)) {
      criteria.sortBy = 'roic';
      criteria.sortOrder = 'DESC';
    } else if (/\b(by roe|highest roe)\b/.test(queryLower)) {
      criteria.sortBy = 'roe';
      criteria.sortOrder = 'DESC';
    } else if (/\b(by dividend|highest dividend)\b/.test(queryLower)) {
      criteria.sortBy = 'dividend_yield';
      criteria.sortOrder = 'DESC';
    } else if (/\b(by growth|fastest growing)\b/.test(queryLower)) {
      criteria.sortBy = 'revenue_growth';
      criteria.sortOrder = 'DESC';
    }

    // Build natural description
    const parts = [];
    if (criteria.sectors?.length) parts.push(criteria.sectors[0]);
    if (criteria.maxPERatio || criteria.maxPBRatio) parts.push('Undervalued');
    if (criteria.minROIC) parts.push('Quality');
    if (criteria.minRevenueGrowth) parts.push('Growth');
    if (criteria.minDividendYield) parts.push('Dividend');
    if (criteria.maxMarketCap && criteria.maxMarketCap <= 10) parts.push('Small Cap');
    if (criteria.minMarketCap && criteria.minMarketCap >= 50) parts.push('Large Cap');

    const naturalDescription = parts.length > 0 ? parts.join(' ') + ' Stocks' : 'Custom Screen';

    // Build interpretation
    const interpretationParts = [];
    if (criteria.sectors?.length) interpretationParts.push(`Sectors: ${criteria.sectors.join(', ')}`);
    if (criteria.maxPERatio) interpretationParts.push(`P/E < ${criteria.maxPERatio}`);
    if (criteria.maxPBRatio) interpretationParts.push(`P/B < ${criteria.maxPBRatio}`);
    if (criteria.minROIC) interpretationParts.push(`ROIC > ${criteria.minROIC}%`);
    if (criteria.minDividendYield) interpretationParts.push(`Yield > ${criteria.minDividendYield}%`);
    if (criteria.maxDebtToEquity) interpretationParts.push(`D/E < ${criteria.maxDebtToEquity}`);
    if (criteria.minRevenueGrowth) interpretationParts.push(`Growth > ${criteria.minRevenueGrowth}%`);
    if (criteria.limit) interpretationParts.push(`Top ${criteria.limit}`);

    return {
      success: true,
      intent: Object.keys(criteria).length > 0 ? 'screen' : 'other',
      confidence: Math.min(confidence, 0.85),
      criteria,
      interpretation: interpretationParts.join(', ') || 'General screen',
      naturalDescription: Object.keys(criteria).length > 0 ? naturalDescription : null,
      source: 'fallback'
    };
  }

  /**
   * Extract chart data from tool results for frontend rendering
   * Improved logic to handle multiple price charts and filter irrelevant results
   */
  extractChartData(rawToolResults) {
    const chartData = {
      primary: null,
      analyst: null,
      additional: [],
      symbol: null
    };

    // Collect all price history charts (there may be multiple for multi-stock queries)
    const priceCharts = [];
    // Track which symbols were explicitly requested
    const requestedSymbols = new Set();

    for (const toolResult of rawToolResults) {
      const result = toolResult.result;
      if (!result) continue;

      // Track requested symbols from tool inputs
      if (toolResult.input?.symbol) {
        requestedSymbols.add(toolResult.input.symbol.toUpperCase());
      }
      if (toolResult.input?.symbols) {
        toolResult.input.symbols.forEach(s => requestedSymbols.add(s.toUpperCase()));
      }

      // Extract symbol from result
      if (result.symbol && !chartData.symbol) {
        chartData.symbol = result.symbol;
      }

      // Collect price charts from get_price_history calls
      if (toolResult.name === 'get_price_history' && result.chart_data) {
        priceCharts.push({
          chart: result.chart_data,
          symbol: result.symbol
        });
      }

      // Extract chart_data from other tools (sentiment, comparison, financial metrics)
      console.log(`[extractChartData] Tool ${toolResult.name} has chart_data:`, !!result.chart_data, result.chart_data?.type);
      if (toolResult.name !== 'get_price_history' && result.chart_data) {
        if (!chartData.primary) {
          // First chart becomes primary
          chartData.primary = result.chart_data;
          console.log('[extractChartData] Set primary chart:', result.chart_data.type);
        } else {
          // Subsequent charts go to additional
          chartData.additional.push(result.chart_data);
        }
      }

      // Extract analyst_chart_data (pie chart for analyst ratings)
      if (result.analyst_chart_data && !chartData.analyst) {
        chartData.analyst = result.analyst_chart_data;
      }

      // Extract additional_charts (for comparisons with multiple charts)
      if (result.additional_charts && Array.isArray(result.additional_charts)) {
        chartData.additional = chartData.additional.concat(result.additional_charts);
      }

      // Extract price_comparison_chart (multi-series chart from compare_companies)
      console.log(`[extractChartData] Tool ${toolResult.name} - checking for price_comparison_chart:`, !!result.price_comparison_chart);
      if (result.price_comparison_chart && !chartData.priceComparison) {
        chartData.priceComparison = result.price_comparison_chart;
        console.log('[extractChartData] ✓ Found price_comparison_chart:', {
          type: result.price_comparison_chart.type,
          seriesCount: result.price_comparison_chart.series?.length
        });
      } else if (result.price_comparison_chart && chartData.priceComparison) {
        console.log('[extractChartData] ⚠ price_comparison_chart already set, skipping');
      }

      // Extract scatter_chart (risk vs return from compare_companies)
      if (result.scatter_chart && !chartData.scatter) {
        chartData.scatter = result.scatter_chart;
      }

      // Extract heatmap_chart (correlation matrix from compare_companies)
      if (result.heatmap_chart && !chartData.heatmap) {
        chartData.heatmap = result.heatmap_chart;
      }
    }

    // Handle price charts:
    // - If single price chart requested, use it as primary
    // - If multiple price charts, use first as primary, rest as additional
    if (priceCharts.length === 1) {
      chartData.primary = priceCharts[0].chart;
      chartData.symbol = priceCharts[0].symbol;
    } else if (priceCharts.length > 1) {
      // Multiple price charts - create a combined view or use them as additional
      chartData.primary = priceCharts[0].chart;
      chartData.symbol = priceCharts[0].symbol;
      // Add remaining price charts as additional
      for (let i = 1; i < priceCharts.length; i++) {
        chartData.additional.push(priceCharts[i].chart);
      }
    }

    // Debug: log final chartData before return
    console.log('[extractChartData] FINAL chartData:', {
      hasPrimary: !!chartData.primary,
      hasPriceComparison: !!chartData.priceComparison,
      hasScatter: !!chartData.scatter,
      hasHeatmap: !!chartData.heatmap,
      additionalCount: chartData.additional?.length
    });

    return chartData;
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
  getLLMHandler,
  SSE_EVENTS
};
