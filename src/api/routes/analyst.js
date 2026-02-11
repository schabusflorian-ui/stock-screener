// src/api/routes/analyst.js
/**
 * API routes for AI investment analysts.
 *
 * Endpoints:
 * - GET /api/analyst/personas - List all analysts
 * - GET /api/analyst/personas/:id - Get analyst details
 * - GET /api/analyst/conversations - List all conversations
 * - POST /api/analyst/conversations - Create new conversation
 * - GET /api/analyst/conversations/:id - Get conversation
 * - DELETE /api/analyst/conversations/:id - Delete conversation
 * - POST /api/analyst/conversations/:id/messages - Send message
 * - POST /api/analyst/analyze - Quick one-shot analysis
 * - GET /api/analyst/stats - Get conversation statistics
 */

const express = require('express');
const router = express.Router();
const { AnalystService } = require('../../services/analystBridge');
const { requireAuth } = require('../../middleware/auth');
const { requireFeature, checkUsageLimit } = require('../../middleware/subscription');
const { asyncHandler } = require('../../middleware/errorHandler');

// Create service instance
const analystService = new AnalystService();

/**
 * GET /api/analyst/personas
 * List all available analysts
 */
router.get('/personas', requireAuth, asyncHandler(async (req, res) => {
  try {
    const analysts = await analystService.getAnalysts();
    res.json({
      success: true,
      analysts
    });
  } catch (error) {
    console.error('Error listing analysts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/analyst/personas/:id
 * Get specific analyst details
 */
router.get('/personas/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const analyst = await analystService.getAnalystInfo(req.params.id);
    res.json({
      success: true,
      analyst
    });
  } catch (error) {
    console.error('Error getting analyst:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/analyst/conversations
 * List all conversations with optional filters
 *
 * Query:
 * - analystId: string (optional) - Filter by analyst
 * - companySymbol: string (optional) - Filter by company
 * - limit: number (optional) - Max results (default 50)
 */
router.get('/conversations', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { analystId, companySymbol, limit } = req.query;
    const conversations = await analystService.listConversations({
      analystId,
      companySymbol,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      conversations,
      count: conversations.length
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * POST /api/analyst/conversations
 * Create a new conversation with an analyst
 *
 * Body:
 * - analystId: string (required) - The analyst ID
 * - companyId: number (optional) - Company ID for context
 * - companySymbol: string (optional) - Company symbol for context
 */
router.post('/conversations', requireAuth, requireFeature('ai_research_agents'), asyncHandler(async (req, res) => {
  try {
    let { analystId, companyId, companySymbol } = req.body;
    if (analystId === 'undefined' || analystId === 'null' || !analystId) analystId = 'value';
    if (typeof analystId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'analystId is required'
      });
    }

    const conversation = await analystService.createConversation(
      analystId,
      companyId,
      companySymbol
    );

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/analyst/conversations/:id
 * Get a conversation by ID
 */
router.get('/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const conversation = await analystService.getConversation(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * DELETE /api/analyst/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    await analystService.deleteConversation(req.params.id);
    res.json({
      success: true,
      message: 'Conversation deleted'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * POST /api/analyst/conversations/:id/messages/stream
 * Stream a message response using Server-Sent Events (SSE)
 *
 * Body:
 * - message: string (required) - The user's message
 * - companyContext: object (optional) - Company context data
 */
router.post('/conversations/:id/messages/stream', requireAuth, requireFeature('ai_research_agents'), asyncHandler(async (req, res) => {
  const { message, companyContext } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'message is required in request body'
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Prevent socket timeout during streaming
  if (res.socket) {
    res.socket.setKeepAlive(true);
    res.socket.setTimeout(0); // Disable timeout
  }
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }

  res.flushHeaders();

  // Send initial comment to establish connection
  res.write(': connected\n\n');

  const startTime = Date.now();
  console.log('[Analyst Stream] Starting stream for conversation:', req.params.id, 'at', startTime);

  // Handle client disconnect - use res.on('close') not req.on('close')
  // req.on('close') fires when the request body is fully read (immediately for POST)
  // res.on('close') fires when the response connection actually closes
  let isConnected = true;

  // Track if we closed the response ourselves vs client disconnect
  let responseEnded = false;

  res.on('close', () => {
    if (!responseEnded) {
      // Response closed before we called res.end() - client disconnected
      isConnected = false;
      console.log('[Analyst Stream] Client disconnected at +', Date.now() - startTime, 'ms');
    }
  });

  // Send initial "thinking" event immediately to keep connection alive
  res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);
  console.log('[Analyst Stream] Wrote thinking event at +', Date.now() - startTime, 'ms');

  // Create the stream generator
  console.log('[Analyst Stream] Creating stream generator at +', Date.now() - startTime, 'ms');
  const stream = analystService.chatStream(
    req.params.id,
    message.trim(),
    companyContext || null
  );
  const iterator = stream[Symbol.asyncIterator]();
  let eventCount = 0;

  // Use callback-based iteration to keep event loop active (like setInterval does)
  const processNext = () => {
    if (!isConnected) {
      console.log('[Analyst Stream] Client disconnected after', eventCount, 'events at +', Date.now() - startTime, 'ms');
      responseEnded = true;
      res.end();
      return;
    }

    iterator.next().then(({ value: event, done }) => {
      if (done) {
        console.log('[Analyst Stream] Stream complete, sent', eventCount, 'events at +', Date.now() - startTime, 'ms');
        if (isConnected) {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
        responseEnded = true;
        res.end();
        return;
      }

      console.log('[Analyst Stream] Got event:', event.type, 'at +', Date.now() - startTime, 'ms');
      eventCount++;
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      if (eventCount <= 3) {
        console.log('[Analyst Stream] Sent event:', event.type);
      }

      // Schedule next iteration - setImmediate keeps event loop active
      setImmediate(processNext);
    }).catch((error) => {
      console.error('[Analyst Stream] Error:', error.message);
      if (isConnected) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      }
      responseEnded = true;
      res.end();
    });
  };

  // Start processing
  processNext();
}));

/**
 * POST /api/analyst/conversations/:id/messages
 * Send a message in a conversation
 *
 * Body:
 * - message: string (required) - The user's message
 * - companyContext: object (optional) - Company data for context
 *   - company: { symbol, name, sector, industry, price, ... }
 *   - metrics: { pe_ratio, roe, revenue_growth, ... }
 *   - financials: { income: [], balance: [], cashflow: [] }
 *   - sentiment: { overall_score, news_sentiment, ... }
 *   - analyst_ratings: { consensus, target_price, ... }
 */
router.post('/conversations/:id/messages', requireAuth, requireFeature('ai_research_agents'), asyncHandler(async (req, res) => {
  try {
    const { message, companyContext } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message is required and must be a non-empty string'
      });
    }

    const response = await analystService.chat(
      req.params.id,
      message.trim(),
      companyContext
    );

    res.json({
      success: true,
      message: response
    });
  } catch (error) {
    console.error('Error sending message:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * POST /api/analyst/analyze
 * Quick one-shot analysis without conversation
 *
 * Body:
 * - analystId: string (required) - The analyst to use
 * - companyData: object (required) - Company data
 *   - company: { symbol, name, sector, ... }
 *   - metrics: { pe_ratio, roe, ... }
 * - question: string (optional) - Specific question to answer
 */
router.post('/analyze', requireAuth, requireFeature('ai_research_agents'), asyncHandler(async (req, res) => {
  try {
    const { analystId, companyData, question } = req.body;

    if (!analystId) {
      return res.status(400).json({
        success: false,
        error: 'analystId is required'
      });
    }

    if (!companyData) {
      return res.status(400).json({
        success: false,
        error: 'companyData is required'
      });
    }

    const analysis = await analystService.quickAnalyze(
      analystId,
      companyData,
      question
    );

    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Error analyzing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/analyst/stats
 * Get conversation statistics
 */
router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
  try {
    const stats = await analystService.getConversationStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * GET /api/analyst/health
 * Health check for analyst service with Python service connectivity test
 */
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const analysts = await analystService.getAnalysts();
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOllamaUrl = !!process.env.OLLAMA_URL;
    const usesRealLLM = hasAnthropicKey || hasOllamaUrl;

    // Test Python service if configured
    let pythonStatus = 'not_configured';
    let pythonDetails = null;

    if (usesRealLLM && analystService.checkPythonService) {
      try {
        const pythonAvailable = await analystService.checkPythonService();
        pythonStatus = pythonAvailable ? 'connected' : 'unavailable';
        pythonDetails = analystService.getServiceStatus ? analystService.getServiceStatus() : null;
      } catch (e) {
        pythonStatus = 'error';
        pythonDetails = { error: e.message };
      }
    }

    res.json({
      success: true,
      status: 'healthy',
      analysts_available: analysts.length,
      llm: {
        enabled: usesRealLLM,
        mode: usesRealLLM ? (pythonStatus === 'connected' ? 'llm' : 'mock_fallback') : 'mock',
        claude_configured: hasAnthropicKey,
        ollama_configured: hasOllamaUrl,
        python_service: pythonStatus,
        python_details: pythonDetails
      },
      capabilities: {
        streaming: true,
        conversations: true,
        real_analysis: pythonStatus === 'connected',
        mock_fallback: true
      },
      configuration_help: !usesRealLLM ? {
        message: 'For AI-powered analysis, configure one of the following:',
        options: [
          'Set ANTHROPIC_API_KEY environment variable for Claude',
          'Set OLLAMA_URL environment variable for local Ollama models'
        ]
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
}));

module.exports = router;
