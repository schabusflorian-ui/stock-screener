// src/services/analystBridge.js
/**
 * Bridge between Node.js API and Python AI analyst service.
 *
 * Uses Python subprocess to communicate with the analyst service.
 * Falls back to mock responses when Python service is unavailable.
 */

const { spawn } = require('child_process');
const path = require('path');
const { getConversationStore } = require('./conversationStore');
const { getFactorContextProvider } = require('./ai/factorContextProvider');
const {
  getKnowledgeForQuery,
  formatKnowledgeForPrompt
} = require('./ai/analysts/knowledge');

// Get conversation store singleton
const conversationStore = getConversationStore();

// Get factor context provider for enriching analyst prompts
const factorContextProvider = getFactorContextProvider();

// Analyst definitions (mirrored from Python for quick access)
const ANALYSTS = {
  value: {
    id: 'value',
    name: 'Benjamin',
    title: 'Value Analyst',
    style: 'Value Investing',
    icon: '📊',
    color: '#2E7D32',
    description: 'Buffett-style deep value analysis focusing on intrinsic value, competitive moats, and margin of safety.',
    influences: ['Warren Buffett', 'Charlie Munger', 'Seth Klarman', 'Howard Marks'],
    strengths: ['Moat analysis', 'Intrinsic value estimation', 'Risk assessment', 'Capital allocation'],
    best_for: ['Finding undervalued stocks', 'Long-term investing', 'Quality at fair price'],
    greeting: "Hello, I'm Benjamin, your Value Investment Analyst. My approach is influenced by Warren Buffett and Charlie Munger. I believe in buying wonderful businesses at fair prices, with a strong margin of safety. What company would you like me to analyze?",
    suggested_questions: [
      "What's the margin of safety at current prices?",
      'Does this company have a durable competitive moat?',
      'Is management allocating capital effectively?',
      'What are the key risks to the investment thesis?',
      'Would Buffett buy this company?'
    ]
  },
  growth: {
    id: 'growth',
    name: 'Catherine',
    title: 'Growth Analyst',
    style: 'Growth Investing',
    icon: '🚀',
    color: '#1565C0',
    description: 'Fisher/Lynch style growth analysis focusing on revenue acceleration, market opportunity, and competitive positioning.',
    influences: ['Philip Fisher', 'Peter Lynch', 'Bill Gurley', 'Cathie Wood'],
    strengths: ['TAM analysis', 'Growth sustainability', 'Forward modeling', 'Competitive dynamics'],
    best_for: ['High-growth stocks', 'Tech companies', 'Disruptive innovators'],
    greeting: "Hi, I'm Catherine, your Growth Investment Analyst. I specialize in finding companies with exceptional growth potential. My philosophy is influenced by Philip Fisher and Peter Lynch. Which company's growth story should we analyze today?",
    suggested_questions: [
      'Is the growth sustainable or a temporary spike?',
      'How large is the addressable market opportunity?',
      "What's the path to profitability?",
      'How does it compare to other high-growth companies?',
      'What could accelerate or derail growth?'
    ]
  },
  contrarian: {
    id: 'contrarian',
    name: 'Diana',
    title: 'Contrarian Analyst',
    style: 'Contrarian Investing',
    icon: '🔄',
    color: '#F57C00',
    description: 'Marks/Burry style contrarian analysis focusing on sentiment extremes, value trap avoidance, and asymmetric opportunities.',
    influences: ['Howard Marks', 'Michael Burry', 'David Dreman', 'John Templeton'],
    strengths: ['Sentiment analysis', 'Value trap identification', 'Catalyst discovery', 'Asymmetric bets'],
    best_for: ['Beaten-down stocks', 'Turnaround situations', 'Out-of-favor sectors'],
    greeting: "Hello, I'm Diana, your Contrarian Investment Analyst. I specialize in finding opportunity where others see only risk. My approach is influenced by Howard Marks and Michael Burry. What beaten-down situation should we examine together?",
    suggested_questions: [
      'Is the pessimism overdone here?',
      'Is this a value trap or genuine opportunity?',
      'What catalyst could change sentiment?',
      "What's the risk/reward ratio?",
      'Are insiders buying or selling?'
    ]
  },
  quant: {
    id: 'quant',
    name: 'Marcus',
    title: 'Quantitative Analyst',
    style: 'Factor Investing',
    icon: '🔢',
    color: '#7B1FA2',
    description: 'Systematic factor-based analysis with data-driven scoring, technical signals, and risk-adjusted position sizing.',
    influences: ["James O'Shaughnessy", 'Cliff Asness', 'AQR', 'Two Sigma'],
    strengths: ['Factor scoring', 'Technical analysis', 'Risk metrics', 'Position sizing'],
    best_for: ['Screening stocks', 'Position sizing', 'Risk management', 'Systematic investing'],
    greeting: "Hello, I'm Marcus, your Quantitative Investment Analyst. I take a systematic, data-driven approach to investment analysis. Which stock should we run through the quantitative framework?",
    suggested_questions: [
      'What are the factor scores for this stock?',
      'How should I size this position?',
      "What's the technical setup?",
      'How does this compare to sector peers?',
      'Where should I set stop losses?'
    ]
  },
  tailrisk: {
    id: 'tailrisk',
    name: 'Nikolai',
    title: 'Tail Risk Analyst',
    style: 'Anti-Fragility Investing',
    icon: '⚡',
    color: '#7B1FA2',
    description: 'Taleb/Spitznagel style analysis focusing on black swan protection, convexity, and surviving extreme events.',
    influences: ['Nassim Taleb', 'Mark Spitznagel', 'Austrian Economics'],
    strengths: ['Tail risk analysis', 'Fragility assessment', 'Convexity evaluation', 'Survival analysis'],
    best_for: ['Risk assessment', 'Portfolio stress testing', 'Black swan preparation', 'Leverage decisions'],
    greeting: "Hello, I'm Nikolai, your Tail Risk & Anti-Fragility Analyst. I focus on what most analysts ignore: the extreme events that can make or break an investment. What investment should we stress-test for survival?",
    suggested_questions: [
      'Can this company survive a severe recession?',
      "What's the path to ruin here?",
      'Is this position convex or concave?',
      'Do insiders have skin in the game?',
      'Is this fragile to a black swan event?'
    ]
  },
  tech: {
    id: 'tech',
    name: 'Sophia',
    title: 'Technology Analyst',
    style: 'Disruption Investing',
    icon: '💻',
    color: '#00BCD4',
    description: 'a16z/ARK style analysis focusing on disruptive innovation, network effects, AI/robotics, and technology platforms.',
    influences: ['a16z', 'Benedict Evans', 'ARK Invest', 'Clayton Christensen'],
    strengths: ['Disruption analysis', 'Network effect evaluation', 'AI company assessment', 'Platform dynamics'],
    best_for: ['Tech stocks', 'AI companies', 'Platform businesses', 'Disruptive innovators'],
    greeting: "Hello, I'm Sophia, your Technology & Disruption Analyst. I specialize in understanding how technology transforms industries and creates investment opportunities. What technology investment should we analyze?",
    suggested_questions: [
      'Is this company a disruptor or being disrupted?',
      "What's the technology moat here?",
      'Can big tech easily replicate this?',
      'Where is this on the S-curve?',
      "What's the real TAM expansion story?"
    ]
  }
};

/**
 * Execute Python analyst service command.
 */
async function executePython(command, args = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, 'ai');
    const script = `
import sys
import json
sys.path.insert(0, '${pythonPath}')

from analyst_service import get_analyst_service

service = get_analyst_service()
command = '${command}'
args = ${JSON.stringify(args)}

try:
    if command == 'list_analysts':
        result = service.get_analysts()
    elif command == 'get_analyst':
        result = service.get_analyst_info(args['analyst_id'])
    elif command == 'create_conversation':
        conv = service.create_conversation(
            args['analyst_id'],
            args.get('company_id'),
            args.get('company_symbol')
        )
        result = conv.to_dict()
    elif command == 'get_conversation':
        conv = service.get_conversation(args['conversation_id'])
        result = conv.to_dict() if conv else None
    elif command == 'chat':
        msg = service.chat(
            args['conversation_id'],
            args['message'],
            args.get('company_context')
        )
        result = {
            'id': msg.id,
            'role': msg.role,
            'content': msg.content,
            'timestamp': msg.timestamp,
            'metadata': msg.metadata
        }
    elif command == 'quick_analyze':
        response = service.quick_analyze(
            args['analyst_id'],
            args['company_data'],
            args.get('question')
        )
        result = {
            'content': response.content,
            'model': response.model,
            'tokens': response.tokens_used
        }
    else:
        result = {'error': f'Unknown command: {command}'}

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    const python = spawn('python3', ['-c', script]);
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
  });
}

/**
 * Execute Python command using cli_runner.py for more robust handling
 */
async function executePythonCli(command, args = {}) {
  return new Promise((resolve, reject) => {
    const cliRunnerPath = path.join(__dirname, 'ai', 'cli_runner.py');
    const python = spawn('python3', [cliRunnerPath, command, JSON.stringify(args)]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python CLI error:', stderr);
        reject(new Error(`Python CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python CLI output: ${stdout}`));
      }
    });
  });
}

/**
 * Stream tokens from Python chat_stream command
 * Yields objects with { type: 'token'|'done', content: string }
 * Uses explicit stream event handlers for reliability across Node versions
 */
async function* streamFromPython(conversationId, message, companyContext) {
  const cliRunnerPath = path.join(__dirname, 'ai', 'cli_runner.py');
  const args = JSON.stringify({
    conversation_id: conversationId,
    message: message,
    company_context: companyContext
  });

  const python = spawn('python3', [cliRunnerPath, 'analyst:chat_stream', args]);

  // Queue for incoming chunks and synchronization
  const chunks = [];
  let resolveNext = null;
  let finished = false;
  let processError = null;

  // Set up event handlers
  python.stdout.on('data', (chunk) => {
    chunks.push(chunk.toString());
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  python.stderr.on('data', (chunk) => {
    console.error('Python stderr:', chunk.toString());
  });

  python.on('close', (code) => {
    finished = true;
    if (code !== 0) {
      processError = new Error(`Python streaming exited with code ${code}`);
    }
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  python.on('error', (err) => {
    processError = err;
    finished = true;
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  let buffer = '';

  // Process chunks as they arrive
  while (!finished || chunks.length > 0) {
    // Wait for data if queue is empty and process hasn't finished
    if (chunks.length === 0 && !finished) {
      await new Promise(r => resolveNext = r);
    }

    // Process all available chunks
    while (chunks.length > 0) {
      buffer += chunks.shift();

      // Split on newlines and process complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            yield data;
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      yield data;
    } catch (e) {
      // Ignore final buffer parse errors
    }
  }

  // Throw if there was a process error
  if (processError) {
    throw processError;
  }
}

/**
 * Analyst Service - bridges Node.js API with Python service.
 */
class AnalystService {
  constructor() {
    // Enable Python when ANTHROPIC_API_KEY or OLLAMA_URL is set
    this.usePython = !!(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_URL);
    this.pythonAvailable = null; // null = unknown, true/false = tested
    this.lastPythonError = null;
  }

  /**
   * Check if Python service is actually working
   */
  async checkPythonService() {
    if (!this.usePython) {
      this.pythonAvailable = false;
      return false;
    }

    try {
      const result = await executePython('list_analysts');
      this.pythonAvailable = Array.isArray(result) && result.length > 0;
      return this.pythonAvailable;
    } catch (e) {
      this.lastPythonError = e.message;
      this.pythonAvailable = false;
      console.warn('Python analyst service not available:', e.message);
      return false;
    }
  }

  /**
   * Get service status for diagnostics
   */
  getServiceStatus() {
    return {
      llmConfigured: this.usePython,
      pythonAvailable: this.pythonAvailable,
      lastError: this.lastPythonError,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      hasOllama: !!process.env.OLLAMA_URL
    };
  }

  /**
   * List all available analysts.
   * Falls back to mock data if Python service fails.
   */
  async getAnalysts() {
    if (this.usePython) {
      try {
        return await executePython('list_analysts');
      } catch (e) {
        console.warn('Python list_analysts failed, using fallback:', e.message);
        this.pythonAvailable = false;
        this.lastPythonError = e.message;
      }
    }
    return Object.values(ANALYSTS);
  }

  /**
   * Get analyst details.
   * Falls back to mock data if Python service fails.
   */
  async getAnalystInfo(analystId) {
    if (this.usePython) {
      try {
        return await executePython('get_analyst', { analyst_id: analystId });
      } catch (e) {
        console.warn('Python get_analyst failed, using fallback:', e.message);
        this.pythonAvailable = false;
      }
    }

    if (!ANALYSTS[analystId]) {
      throw new Error(`Unknown analyst: ${analystId}`);
    }
    return ANALYSTS[analystId];
  }

  /**
   * Create a new conversation.
   */
  async createConversation(analystId, companyId = null, companySymbol = null) {
    if (!ANALYSTS[analystId]) {
      throw new Error(`Unknown analyst: ${analystId}`);
    }

    const id = this._generateId();
    const analyst = ANALYSTS[analystId];
    const title = companySymbol
      ? `${analyst.name} on ${companySymbol}`
      : `Chat with ${analyst.name}`;

    const conversation = conversationStore.createConversation(
      id,
      analystId,
      companyId,
      companySymbol,
      title
    );

    return conversation;
  }

  /**
   * Get existing conversation.
   */
  async getConversation(conversationId) {
    return conversationStore.getConversation(conversationId);
  }

  /**
   * List recent conversations.
   */
  async listConversations(options = {}) {
    const { analystId, companySymbol, limit = 50 } = options;

    if (analystId) {
      return conversationStore.listByAnalyst(analystId, limit);
    }
    if (companySymbol) {
      return conversationStore.listByCompany(companySymbol, limit);
    }
    return conversationStore.listConversations(limit);
  }

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId) {
    return conversationStore.deleteConversation(conversationId);
  }

  /**
   * Get conversation statistics.
   */
  async getConversationStats() {
    return conversationStore.getStats();
  }

  /**
   * Enrich company context with factor analysis data
   */
  async _enrichWithFactors(companyContext, analystId) {
    if (!companyContext?.company?.symbol) {
      return companyContext;
    }

    try {
      const factorContext = await factorContextProvider.getAnalystSpecificContext(
        companyContext.company.symbol,
        analystId
      );

      return {
        ...companyContext,
        factorAnalysis: factorContext
      };
    } catch (err) {
      console.error('Error enriching with factors:', err.message);
      return companyContext;
    }
  }

  /**
   * Enrich context with knowledge base content (quotes, frameworks, case studies)
   * @param {Object} context - Company context
   * @param {string} analystId - Analyst type
   * @param {string} userMessage - User's query
   * @returns {Object} Context enriched with knowledge base content
   */
  _enrichWithKnowledge(context, analystId, userMessage) {
    try {
      const knowledge = getKnowledgeForQuery(analystId, userMessage, {
        maxQuotes: 3,
        maxFrameworks: 2,
        maxCaseStudies: 1
      });

      const formattedKnowledge = formatKnowledgeForPrompt(knowledge);

      return {
        ...context,
        knowledgeBase: knowledge,
        knowledgePrompt: formattedKnowledge
      };
    } catch (err) {
      console.error('Error enriching with knowledge:', err.message);
      return context;
    }
  }

  /**
   * Send message and get streaming response.
   * Yields tokens one at a time for real-time display.
   */
  async *chatStream(conversationId, message, companyContext = null) {
    // Generate message ID for the response immediately (before any async work)
    const responseId = this._generateId();

    // Yield start event IMMEDIATELY to keep connection alive
    // This must be before any await to prevent client timeouts
    yield { type: 'start', id: responseId };

    const conv = conversationStore.getConversation(conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const analyst = ANALYSTS[conv.analyst_id];
    if (!analyst) {
      throw new Error(`Invalid analyst: ${conv.analyst_id}`);
    }

    // Enrich context with factor analysis
    let enrichedContext = await this._enrichWithFactors(companyContext, conv.analyst_id);

    // Enrich context with knowledge base content (quotes, frameworks, case studies)
    enrichedContext = this._enrichWithKnowledge(enrichedContext, conv.analyst_id, message);

    // Add analyst_id to context for Python service
    enrichedContext = { ...enrichedContext, analyst_id: conv.analyst_id };

    // Add user message
    const userMsg = {
      id: this._generateId(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    conversationStore.addMessage(conversationId, userMsg);

    let fullContent = '';

    // Try Python streaming if LLM is configured
    if (this.usePython) {
      try {
        // Use Python streaming
        for await (const data of streamFromPython(conversationId, message, enrichedContext)) {
          if (data.type === 'token') {
            fullContent += data.content;
            yield { type: 'token', content: data.content };
          } else if (data.type === 'done') {
            // Python has completed and saved the message
            fullContent = data.full_content || fullContent;
          }
        }

        // Create final message with real model info
        const assistantMsg = {
          id: responseId,
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
          metadata: { model: 'claude', streamed: true }
        };

        conversationStore.addMessage(conversationId, assistantMsg);
        yield { type: 'complete', message: assistantMsg };
        return;

      } catch (e) {
        console.warn('Python streaming failed, falling back to mock:', e.message);
        // Fall through to mock response
      }
    }

    // Fallback: Generate mock response and stream it word by word
    const mockResponse = await this._generateMockResponse(analyst, message, enrichedContext, conv);
    const words = mockResponse.content.split(/(\s+)/); // Keep whitespace

    for (const word of words) {
      fullContent += word;
      yield { type: 'token', content: word };
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Create final message
    const assistantMsg = {
      id: responseId,
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString(),
      metadata: mockResponse.metadata || { model: 'mock', tokens: 0 }
    };

    conversationStore.addMessage(conversationId, assistantMsg);

    // Emit complete event
    yield { type: 'complete', message: assistantMsg };
  }

  /**
   * Send message and get response.
   */
  async chat(conversationId, message, companyContext = null) {
    const conv = conversationStore.getConversation(conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const analyst = ANALYSTS[conv.analyst_id];
    if (!analyst) {
      throw new Error(`Invalid analyst: ${conv.analyst_id}`);
    }

    // Enrich context with factor analysis
    let enrichedContext = await this._enrichWithFactors(companyContext, conv.analyst_id);

    // Enrich context with knowledge base content (quotes, frameworks, case studies)
    enrichedContext = this._enrichWithKnowledge(enrichedContext, conv.analyst_id, message);

    // Add analyst_id to context for Python service
    enrichedContext = { ...enrichedContext, analyst_id: conv.analyst_id };

    // Add user message
    const userMsg = {
      id: this._generateId(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    conversationStore.addMessage(conversationId, userMsg);

    // Try Python service first
    if (this.usePython) {
      try {
        const response = await executePython('chat', {
          conversation_id: conversationId,
          message,
          company_context: enrichedContext
        });
        conversationStore.addMessage(conversationId, response);
        return response;
      } catch (e) {
        console.error('Python service error, falling back:', e.message);
      }
    }

    // Generate mock response
    const assistantMsg = await this._generateMockResponse(analyst, message, enrichedContext, conv);
    conversationStore.addMessage(conversationId, assistantMsg);

    return assistantMsg;
  }

  /**
   * Quick one-shot analysis without conversation.
   */
  async quickAnalyze(analystId, companyData, question = null) {
    if (this.usePython) {
      return executePython('quick_analyze', {
        analyst_id: analystId,
        company_data: companyData,
        question
      });
    }

    const analyst = ANALYSTS[analystId];
    if (!analyst) {
      throw new Error(`Unknown analyst: ${analystId}`);
    }

    // Mock response
    return {
      content: this._generateMockAnalysis(analyst, companyData, question),
      model: 'mock',
      tokens: 0
    };
  }

  /**
   * Generate mock response when Python service unavailable.
   */
  async _generateMockResponse(analyst, message, companyContext, conversation) {
    const symbol = companyContext?.company?.symbol || conversation.company_symbol || 'the company';

    // Simple keyword-based response generation
    let response = '';
    const lowerMessage = message.toLowerCase();

    if (conversation.messages.length <= 1) {
      // First message - provide greeting and initial analysis
      response = `Thank you for your question about ${symbol}.\n\n`;
      response += this._getAnalystPerspective(analyst, companyContext);
    } else if (lowerMessage.includes('valuation') || lowerMessage.includes('price') || lowerMessage.includes('value')) {
      response = this._getValuationResponse(analyst, companyContext);
    } else if (lowerMessage.includes('risk') || lowerMessage.includes('concern')) {
      response = this._getRiskResponse(analyst, companyContext);
    } else if (lowerMessage.includes('buy') || lowerMessage.includes('sell') || lowerMessage.includes('recommend')) {
      response = this._getRecommendationResponse(analyst, companyContext);
    } else if (lowerMessage.includes('moat') || lowerMessage.includes('advantage') || lowerMessage.includes('competitive')) {
      response = this._getCompetitiveResponse(analyst, companyContext);
    } else {
      response = this._getGeneralResponse(analyst, message, companyContext);
    }

    // Enrich mock response with knowledge base content
    response = this._enrichResponseWithKnowledge(response, companyContext?.knowledgeBase, analyst.id);

    return {
      id: this._generateId(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      metadata: { model: 'mock', tokens: 0 }
    };
  }

  /**
   * Enrich a mock response with relevant quotes and frameworks from the knowledge base
   */
  _enrichResponseWithKnowledge(response, knowledge, analystId) {
    if (!knowledge || (!knowledge.quotes?.length && !knowledge.frameworks?.length && !knowledge.caseStudies?.length)) {
      return response;
    }

    let enrichedResponse = response;

    // Add a relevant quote if available
    if (knowledge.quotes?.length > 0) {
      const topQuote = knowledge.quotes[0];
      const quoteText = `\n\n> "${topQuote.text}"\n> — ${topQuote.author}${topQuote.source ? ` (${topQuote.source})` : ''}\n`;
      enrichedResponse += quoteText;
    }

    // Reference a relevant framework if analyzing methodology
    if (knowledge.frameworks?.length > 0 && (response.includes('framework') || response.includes('analysis') || response.includes('evaluate'))) {
      const framework = knowledge.frameworks[0];
      if (framework && framework.steps?.length > 0) {
        enrichedResponse += `\n**My ${framework.name} approach:**\n`;
        framework.steps.slice(0, 3).forEach(step => {
          enrichedResponse += `${step}\n`;
        });
      }
    }

    // Reference a case study if discussing similar situations
    if (knowledge.caseStudies?.length > 0) {
      const caseStudy = knowledge.caseStudies[0];
      if (caseStudy && caseStudy.lessons?.length > 0) {
        enrichedResponse += `\n**Relevant precedent: ${caseStudy.title}**\n`;
        enrichedResponse += `Key lesson: ${caseStudy.lessons[0]}\n`;
      }
    }

    return enrichedResponse;
  }

  _getAnalystPerspective(analyst, context) {
    const symbol = context?.company?.symbol || 'This company';
    const pe = context?.metrics?.pe_ratio;
    const roe = context?.metrics?.roe;

    switch (analyst.id) {
      case 'value':
        // Use factor insights for value perspective
        const valueFactors = context?.factorAnalysis;
        if (valueFactors?.insights?.length > 0) {
          let valueText = `From a value investing perspective, I look at ${symbol} through the lens of intrinsic value and margin of safety.\n\n`;
          valueText += '**Factor-Based Assessment:**\n';
          valueFactors.insights.forEach(insight => {
            if (insight.narrative) {
              valueText += `- ${insight.narrative}\n`;
            }
          });
          valueText += `\n${pe ? `The current P/E of ${pe.toFixed(1)} ` : 'The valuation '}needs to be assessed against normalized earnings and the company's competitive position.\n\n`;
          valueText += 'Key questions I consider:\n';
          valueText += '- What is the sustainable earnings power?\n';
          valueText += '- Does the business have a durable competitive moat?\n';
          valueText += '- Is management allocating capital wisely?\n\n';
          valueText += 'What specific aspect would you like me to analyze in depth?';
          return valueText;
        }
        return `From a value investing perspective, I look at ${symbol} through the lens of intrinsic value and margin of safety.\n\n` +
          `${pe ? `The current P/E of ${pe.toFixed(1)} ` : 'The valuation '}needs to be assessed against normalized earnings and the company's competitive position.\n\n` +
          'Key questions I consider:\n' +
          '- What is the sustainable earnings power?\n' +
          '- Does the business have a durable competitive moat?\n' +
          '- Is management allocating capital wisely?\n\n' +
          'What specific aspect would you like me to analyze in depth?';

      case 'growth':
        return `Looking at ${symbol} from a growth perspective, I focus on the trajectory and sustainability of revenue growth.\n\n` +
          'Key growth metrics I evaluate:\n' +
          '- Revenue growth rate and acceleration\n' +
          '- Total addressable market opportunity\n' +
          '- Competitive positioning and market share gains\n\n' +
          `${roe ? `With an ROE of ${(roe * 100).toFixed(1)}%, I'd want to understand how effectively they're reinvesting.` : ''}\n\n` +
          'What growth dynamics would you like to explore?';

      case 'contrarian':
        return 'From a contrarian standpoint, I look for situations where the market may have overreacted.\n\n' +
          `For ${symbol}, key questions include:\n` +
          '- Is current sentiment excessively negative or positive?\n' +
          '- Are temporary issues being treated as permanent?\n' +
          '- What catalysts could change the narrative?\n\n' +
          'Would you like me to assess the sentiment dynamics or potential catalysts?';

      case 'quant':
        // Use real factor data if available
        const factorAnalysis = context?.factorAnalysis;
        if (factorAnalysis?.factors) {
          const f = factorAnalysis.rankings;
          const insights = factorAnalysis.insights || [];
          let factorText = `Taking a systematic approach to ${symbol}, here are the factor scores:\n\n`;
          factorText += '**Factor Profile:**\n';
          factorText += `- **Value**: ${f.valuePercentile}th percentile ${f.valuePercentile >= 70 ? '(Attractive)' : f.valuePercentile <= 30 ? '(Expensive)' : '(Neutral)'}\n`;
          factorText += `- **Quality**: ${f.qualityPercentile}th percentile ${f.qualityPercentile >= 70 ? '(Strong)' : f.qualityPercentile <= 30 ? '(Weak)' : '(Moderate)'}\n`;
          factorText += `- **Momentum**: ${f.momentumPercentile}th percentile ${f.momentumPercentile >= 70 ? '(Bullish)' : f.momentumPercentile <= 30 ? '(Bearish)' : '(Neutral)'}\n`;
          factorText += `- **Growth**: ${f.growthPercentile}th percentile ${f.growthPercentile >= 70 ? '(High)' : f.growthPercentile <= 30 ? '(Low)' : '(Moderate)'}\n`;
          factorText += `- **Composite Score**: ${factorAnalysis.factors.composite}\n\n`;

          // Add insights
          insights.forEach(insight => {
            if (insight.narrative) {
              factorText += `${insight.narrative}\n`;
            }
          });

          factorText += '\nWhich factors would you like me to analyze in more detail?';
          return factorText;
        }
        // Fallback to basic response if no factor data
        return `Taking a systematic approach to ${symbol}, I'll evaluate key factor scores.\n\n` +
          'Factor framework:\n' +
          `${pe ? `- **Value Factor**: P/E of ${pe.toFixed(1)} - ${pe < 15 ? 'Favorable' : pe < 25 ? 'Neutral' : 'Stretched'}` : '- Value Factor: Need valuation data'}\n` +
          `${roe ? `- **Quality Factor**: ROE of ${(roe * 100).toFixed(1)}% - ${roe > 0.15 ? 'Strong' : roe > 0.10 ? 'Moderate' : 'Weak'}` : '- Quality Factor: Need profitability data'}\n` +
          '- Momentum Factor: Analyzing price trends\n\n' +
          'Which factors would you like me to analyze in detail?';

      default:
        return `I'll analyze ${symbol} using my investment framework. What specific aspects would you like me to focus on?`;
    }
  }

  _getValuationResponse(analyst, context) {
    const symbol = context?.company?.symbol || 'The company';
    const pe = context?.metrics?.pe_ratio;
    const pb = context?.metrics?.pb_ratio;

    if (analyst.id === 'value') {
      return `## Valuation Analysis for ${symbol}\n\n` +
        `${pe ? `**P/E Ratio:** ${pe.toFixed(1)}x\n` : ''}` +
        `${pb ? `**P/B Ratio:** ${pb.toFixed(2)}x\n\n` : '\n'}` +
        'From a value perspective, I evaluate intrinsic value using multiple approaches:\n\n' +
        '1. **Discounted Cash Flow (DCF)**: Projecting owner earnings\n' +
        '2. **Earnings Power Value**: Sustainable earnings capacity\n' +
        '3. **Asset-Based Valuation**: For capital-intensive businesses\n\n' +
        'A true margin of safety requires the stock price to be at least 30% below estimated intrinsic value.\n\n' +
        'To provide a specific fair value estimate, I would need additional financial details. Would you like to provide more data?';
    }

    return '## Valuation Perspective\n\n' +
      `${pe ? `Current P/E: ${pe.toFixed(1)}x\n` : ''}` +
      `${pb ? `Current P/B: ${pb.toFixed(2)}x\n\n` : '\n'}` +
      `From my ${analyst.style} perspective, valuation must be considered alongside ` +
      `${analyst.id === 'growth' ? 'growth trajectory and market opportunity' :
        analyst.id === 'contrarian' ? 'sentiment and potential mean reversion' :
        'factor scores and relative metrics'}.\n\n` +
      'Would you like me to elaborate on the valuation framework?';
  }

  _getRiskResponse(analyst, context) {
    const symbol = context?.company?.symbol || 'This investment';

    if (analyst.id === 'value') {
      return `## Risk Assessment for ${symbol}\n\n` +
        'As a value investor, I focus on **permanent capital loss**, not volatility.\n\n' +
        'Key risks to evaluate:\n\n' +
        '1. **Business Risk**: Is the competitive position sustainable?\n' +
        '2. **Balance Sheet Risk**: Can they survive extended stress?\n' +
        '3. **Valuation Risk**: Is the current price reasonable?\n' +
        '4. **Disruption Risk**: Could technology/competition eliminate the business?\n\n' +
        'The margin of safety concept addresses estimation errors, but some risks cannot be hedged.\n\n' +
        'What specific risks would you like me to analyze?';
    }

    return '## Risk Analysis\n\n' +
      `From a ${analyst.style} perspective, key risks for ${symbol} include:\n\n` +
      `${analyst.id === 'growth' ?
        '- Growth deceleration risk\n- Competition intensifying\n- Path to profitability lengthening\n- Valuation compression' :
        analyst.id === 'contrarian' ?
        '- This could be a value trap (permanent decline)\n- Catalyst may not materialize\n- Sentiment could worsen further\n- Timing risk is significant' :
        '- Factor exposure may reverse\n- Volatility risk on position sizing\n- Correlation risk in market stress\n- Model risk on assumptions'}\n\n` +
      'Would you like me to quantify any of these risks?';
  }

  _getRecommendationResponse(analyst, context) {
    const symbol = context?.company?.symbol || 'This stock';

    return `## Investment Recommendation for ${symbol}\n\n` +
      '**Important Disclaimer**: This is educational analysis, not investment advice.\n\n' +
      `From my ${analyst.style} framework:\n\n` +
      'To provide a specific recommendation, I need to fully assess:\n' +
      `${analyst.id === 'value' ?
        '- Intrinsic value vs current price\n- Margin of safety\n- Business quality and moat\n- Management track record' :
        analyst.id === 'growth' ?
        '- Growth sustainability\n- TAM and market share trajectory\n- Path to profitability\n- Competitive dynamics' :
        analyst.id === 'contrarian' ?
        '- Sentiment extremes\n- Temporary vs permanent problems\n- Catalyst identification\n- Risk/reward asymmetry' :
        '- Factor scores across value, quality, momentum\n- Technical setup\n- Position sizing based on volatility\n- Risk-adjusted return potential'}\n\n` +
      'With complete data, I can provide a specific rating with price targets and conviction level.\n\n' +
      'What additional information can you provide?';
  }

  _getCompetitiveResponse(analyst, context) {
    const symbol = context?.company?.symbol || 'The company';

    return `## Competitive Analysis for ${symbol}\n\n` +
      `${analyst.id === 'value' ?
        '**Moat Assessment Framework**\n\n' +
        'A durable competitive advantage (moat) is essential for sustainable returns. Types of moats:\n\n' +
        '1. **Brand Power**: Customer loyalty and pricing power\n' +
        '2. **Network Effects**: Value increases with more users\n' +
        '3. **Switching Costs**: Customers locked in\n' +
        '4. **Cost Advantages**: Structural cost leadership\n' +
        '5. **Regulatory/Patents**: Legal barriers to entry\n\n' +
        'The key test: Could a well-funded competitor replicate this business with $10 billion?\n\n' :
        '**Competitive Positioning Analysis**\n\n' +
        `From a ${analyst.style} perspective, I evaluate:\n\n` +
        '- Market share trends\n' +
        '- Competitive dynamics and barriers\n' +
        '- Sustainable advantages\n' +
        '- Disruption potential\n\n'}` +
      `To assess ${symbol}'s competitive position specifically, I'd need details about their market, competitors, and strategic assets.\n\n` +
      'What aspects of competitive dynamics would you like to explore?';
  }

  _getGeneralResponse(analyst, message, context) {
    const symbol = context?.company?.symbol || 'the company';

    return `That's a thoughtful question about ${symbol}.\n\n` +
      `From my ${analyst.style} perspective, let me address this:\n\n` +
      `${message.length > 20 ?
        `You asked about "${message.substring(0, 50)}..." - ` : ''}` +
      'This touches on key aspects of my analytical framework.\n\n' +
      'To provide the most useful analysis, I\'d focus on:\n' +
      `${analyst.strengths.map(s => `- ${s}`).join('\n')}\n\n` +
      'Could you provide more specific details about what you\'d like me to analyze? ' +
      `For example, I'm particularly good at ${analyst.best_for[0]}.`;
  }

  _generateMockAnalysis(analyst, companyData, question) {
    const symbol = companyData?.company?.symbol || 'Unknown';

    return `## ${analyst.name}'s Analysis of ${symbol}\n\n` +
      `**Analyst:** ${analyst.name} (${analyst.title})\n` +
      `**Style:** ${analyst.style}\n\n` +
      '---\n\n' +
      'This is a mock response. For full AI-powered analysis, configure the Claude API.\n\n' +
      '### What I Would Analyze\n\n' +
      `${analyst.strengths.map(s => `- ${s}`).join('\n')}\n\n` +
      `${question ? `**Your Question:** ${question}\n\n` : ''}` +
      'To get detailed analysis, ensure the Python AI service is properly configured with an LLM backend.';
  }

  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = { AnalystService, ANALYSTS };
