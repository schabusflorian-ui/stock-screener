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

      // Initial API call with timeout
      let response = await this.withTimeout(
        this.client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: INVESTMENT_ASSISTANT_PROMPT,
          tools: TOOLS,
          messages
        }),
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

        // Get next response with timeout
        response = await this.withTimeout(
          this.client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: INVESTMENT_ASSISTANT_PROMPT,
            tools: TOOLS,
            messages
          }),
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
        let toolUseBlocks = [];
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
      if (result.price_comparison_chart && !chartData.priceComparison) {
        chartData.priceComparison = result.price_comparison_chart;
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
