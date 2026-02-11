/**
 * AI Features API Routes
 *
 * Provides endpoints for:
 * - Daily briefings
 * - Document analysis
 * - Bull vs Bear debates
 * - Thesis challenges
 * - Streaming responses
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');

// Authentication and subscription middleware
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const { checkUsageLimit, requireFeature, attachSubscription } = require('../../middleware/subscription');

// Portfolio data provider for AI analysis
const portfolioDataProvider = require('../../services/ai/portfolio_data_provider');

// Configure file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.txt', '.html', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not allowed`));
        }
    }
});

// Check if AI services are enabled
const AI_ENABLED = !!(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_URL);

/**
 * Helper to call Python AI services via CLI runner
 */
function callPythonService(command, args = {}) {
    return new Promise((resolve, reject) => {
        const pythonPath = process.env.PYTHON_PATH || 'python3';
        const scriptPath = path.join(__dirname, '../../services/ai/cli_runner.py');

        const proc = spawn(pythonPath, [scriptPath, command, JSON.stringify(args)]);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdout);
                    if (result.error) {
                        reject(new Error(result.error));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    resolve({ result: stdout });
                }
            } else {
                reject(new Error(stderr || `Process exited with code ${code}`));
            }
        });
    });
}

/**
 * GET /api/ai/status
 * Check AI service status
 */
router.get('/status', async (req, res) => {
    try {
        // Try Python service first
        if (AI_ENABLED) {
            try {
                const status = await callPythonService('status');
                status.ai_enabled = true;
                return res.json(status);
            } catch (e) {
                console.warn('Python AI status check failed:', e.message);
            }
        }

        // Fallback to basic status
        const status = {
            ai_enabled: AI_ENABLED,
            ollama: false,
            claude: !!process.env.ANTHROPIC_API_KEY,
            services: {
                analyst: true,
                briefing: true,
                debate: true,
                document: true
            }
        };

        // Check Ollama availability
        try {
            const fetch = require('node-fetch');
            const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
            const response = await fetch(`${ollamaUrl}/api/tags`, { timeout: 2000 });
            status.ollama = response.ok;
        } catch (e) {
            status.ollama = false;
        }

        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/ai/briefing
 * Generate daily briefing for user
 * Requires: Pro tier, uses AI query quota
 */
router.post('/briefing', requireAuth, requireFeature('ai_research_agents'), checkUsageLimit('ai_queries_monthly'), async (req, res) => {
    try {
        const { portfolioData, marketData, newsData, userPreferences } = req.body;

        // Try Python service if enabled
        if (AI_ENABLED) {
            try {
                const result = await callPythonService('briefing:generate', {
                    portfolio_data: portfolioData || [],
                    market_data: marketData || {},
                    news_data: newsData || [],
                    user_preferences: userPreferences || {}
                });
                return res.json(result.briefing);
            } catch (e) {
                console.warn('Python briefing failed, using fallback:', e.message);
            }
        }

        // Fallback placeholder response
        const briefing = {
            date: new Date().toISOString().split('T')[0],
            headline: 'Daily Briefing - ' + new Date().toLocaleDateString(),
            sections: [
                {
                    title: 'Portfolio Summary',
                    content: 'Your portfolios are performing in line with the market today.',
                    priority: 'medium',
                    category: 'portfolio',
                    symbols: []
                },
                {
                    title: 'Market Context',
                    content: 'Markets are trading mixed with tech leading gains.',
                    priority: 'medium',
                    category: 'market',
                    symbols: ['SPY', 'QQQ']
                }
            ],
            generatedAt: new Date().toISOString(),
            modelUsed: 'fallback'
        };

        res.json(briefing);
    } catch (error) {
        console.error('Briefing error:', error);
        res.status(500).json({ error: 'Failed to generate briefing' });
    }
});

/**
 * GET /api/ai/alerts
 * Get portfolio alerts
 */
router.get('/alerts', async (req, res) => {
    try {
        const userId = req.user?.id || 1;
        const { portfolioIds } = req.query;

        // Placeholder alerts
        const alerts = [
            {
                id: 'alert_1',
                type: 'price_move',
                priority: 'high',
                symbol: 'NVDA',
                title: 'NVDA up 5.2% today',
                message: 'NVIDIA has moved significantly today on AI demand news.',
                createdAt: new Date().toISOString(),
                acknowledged: false
            }
        ];

        res.json(alerts);
    } catch (error) {
        console.error('Alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

/**
 * POST /api/ai/analyze-document
 * Analyze uploaded document (earnings transcript, 10-K, etc.)
 * Requires: Pro tier (filing_analyzer feature), uses AI query quota
 */
router.post('/analyze-document', requireAuth, requireFeature('filing_analyzer'), checkUsageLimit('ai_queries_monthly'), upload.single('document'), async (req, res) => {
    try {
        const { documentType, symbol, quarter } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No document uploaded' });
        }

        // Process based on document type
        const analysis = {
            documentType,
            symbol: symbol || 'Unknown',
            quarter: quarter || 'Unknown',
            fileInfo: {
                originalName: file.originalname,
                size: file.size,
                mimeType: file.mimetype
            },
            analysis: {
                summary: 'Document analysis would appear here.',
                keyPoints: [
                    'Key point 1 from the document',
                    'Key point 2 from the document',
                    'Key point 3 from the document'
                ],
                sentiment: 'neutral',
                implications: 'Investment implications would be analyzed here.'
            },
            analyzedAt: new Date().toISOString()
        };

        res.json(analysis);
    } catch (error) {
        console.error('Document analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze document' });
    }
});

/**
 * POST /api/ai/debate/bull-bear
 * Run bull vs bear debate
 * Requires: Pro tier (ai_research_agents feature), uses AI query quota
 */
router.post('/debate/bull-bear', requireAuth, requireFeature('ai_research_agents'), checkUsageLimit('ai_queries_monthly'), async (req, res) => {
    try {
        const { symbol, companyData, bullAnalyst, bearAnalyst } = req.body;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        // Try Python service if enabled
        if (AI_ENABLED) {
            try {
                const result = await callPythonService('debate:bull_bear', {
                    symbol,
                    company_data: companyData || {},
                    bull_analyst: bullAnalyst || 'growth',
                    bear_analyst: bearAnalyst || 'contrarian'
                });
                return res.json(result.debate);
            } catch (e) {
                console.warn('Python debate failed, using fallback:', e.message);
            }
        }

        // Fallback placeholder response
        const debate = {
            format: 'bull_bear',
            topic: `Investment case for ${symbol}`,
            symbol,
            contributions: [
                {
                    analystId: bullAnalyst || 'growth',
                    analystName: 'Catherine (Growth Analyst)',
                    position: 'bull',
                    content: `The bull case for ${symbol} centers on strong fundamentals and growth potential.`,
                    keyPoints: ['Strong growth trajectory', 'Market leadership']
                },
                {
                    analystId: bearAnalyst || 'contrarian',
                    analystName: 'Diana (Contrarian Analyst)',
                    position: 'bear',
                    content: `Investors should be cautious on ${symbol} due to valuation and competitive risks.`,
                    keyPoints: ['Valuation concerns', 'Competition risks']
                }
            ],
            synthesis: 'Both analysts raise valid points. The bull case focuses on growth while the bear case highlights valuation risks.',
            keyDisagreements: ['Valuation assessment', 'Growth sustainability'],
            areasOfAgreement: ['Strong market position', 'Quality management'],
            modelUsed: 'fallback'
        };

        res.json(debate);
    } catch (error) {
        console.error('Debate error:', error);
        res.status(500).json({ error: 'Failed to run debate' });
    }
});

/**
 * POST /api/ai/debate/round-table
 * Run multi-analyst round table
 * Requires: Pro tier (ai_research_agents feature), uses AI query quota
 */
router.post('/debate/round-table', requireAuth, requireFeature('ai_research_agents'), checkUsageLimit('ai_queries_monthly'), async (req, res) => {
    try {
        const { symbol, companyData, analysts } = req.body;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol required' });
        }

        const analystList = analysts || ['value', 'growth', 'contrarian'];

        // Try Python service if enabled
        if (AI_ENABLED) {
            try {
                const result = await callPythonService('debate:round_table', {
                    symbol,
                    company_data: companyData || {},
                    analysts: analystList
                });
                return res.json(result.debate);
            } catch (e) {
                console.warn('Python round table failed, using fallback:', e.message);
            }
        }

        // Fallback response
        const debate = {
            format: 'round_table',
            topic: `Multi-perspective analysis of ${symbol}`,
            symbol,
            contributions: analystList.map(a => ({
                analystId: a,
                analystName: a.charAt(0).toUpperCase() + a.slice(1) + ' Analyst',
                position: 'neutral',
                content: `From a ${a} perspective, this stock presents interesting characteristics.`,
                keyPoints: []
            })),
            synthesis: 'The round table reveals different perspectives on the stock.',
            keyDisagreements: [],
            areasOfAgreement: [],
            modelUsed: 'fallback'
        };

        res.json(debate);
    } catch (error) {
        console.error('Round table error:', error);
        res.status(500).json({ error: 'Failed to run round table' });
    }
});

/**
 * POST /api/ai/debate/challenge
 * Challenge an investment thesis
 */
router.post('/debate/challenge', async (req, res) => {
    try {
        const { thesis, symbol, companyData, challenger } = req.body;

        if (!thesis || !symbol) {
            return res.status(400).json({ error: 'Thesis and symbol required' });
        }

        // Try Python service if enabled
        if (AI_ENABLED) {
            try {
                const result = await callPythonService('debate:challenge', {
                    thesis,
                    symbol,
                    company_data: companyData || {},
                    challenger: challenger || 'contrarian'
                });
                return res.json(result.challenge);
            } catch (e) {
                console.warn('Python challenge failed, using fallback:', e.message);
            }
        }

        // Fallback response
        const challenge = {
            format: 'thesis_challenge',
            topic: `Thesis challenge for ${symbol}`,
            symbol,
            originalThesis: thesis,
            contributions: [
                {
                    analystId: challenger || 'contrarian',
                    analystName: 'Diana (Contrarian Analyst)',
                    position: 'challenger',
                    content: 'The thesis has several potential weaknesses that warrant investigation.',
                    keyPoints: [
                        'Key assumptions may not hold under stress',
                        'Risk factors may be underweighted',
                        'Competitive dynamics could shift'
                    ]
                }
            ],
            synthesis: 'The thesis challenge reveals areas that need further investigation.',
            keyDisagreements: [],
            areasOfAgreement: [],
            modelUsed: 'fallback'
        };

        res.json(challenge);
    } catch (error) {
        console.error('Challenge error:', error);
        res.status(500).json({ error: 'Failed to challenge thesis' });
    }
});

/**
 * GET /api/ai/stream/:sessionId
 * Stream analysis results (SSE)
 */
router.get('/stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Simulate streaming (in real implementation, this would stream from LLM)
    let count = 0;
    const interval = setInterval(() => {
        count++;
        if (count <= 10) {
            res.write(`data: ${JSON.stringify({
                type: 'token',
                data: `Token ${count} `,
                timestamp: new Date().toISOString()
            })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({
                type: 'complete',
                data: { message: 'Stream complete' }
            })}\n\n`);
            clearInterval(interval);
            res.end();
        }
    }, 100);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(interval);
    });
});

/**
 * POST /api/ai/usage
 * Get AI usage statistics
 */
router.get('/usage', async (req, res) => {
    try {
        const { period } = req.query; // 'daily', 'monthly', 'all'

        const usage = {
            period: period || 'daily',
            requests: 42,
            tokens: 15680,
            cost: 0.47,
            breakdown: {
                claude_sonnet: { requests: 12, tokens: 8500, cost: 0.35 },
                claude_haiku: { requests: 8, tokens: 3200, cost: 0.04 },
                ollama: { requests: 22, tokens: 3980, cost: 0.00 }
            },
            budget: {
                daily: { used: 0.47, limit: 10.00, remaining: 9.53 },
                monthly: { used: 14.32, limit: 100.00, remaining: 85.68 }
            }
        };

        res.json(usage);
    } catch (error) {
        console.error('Usage error:', error);
        res.status(500).json({ error: 'Failed to get usage stats' });
    }
});

/**
 * GET /api/ai/portfolio/:portfolioId/data
 * Get portfolio data formatted for AI analysis
 */
router.get('/portfolio/:portfolioId/data', async (req, res) => {
    try {
        const { portfolioId } = req.params;
        const data = await portfolioDataProvider.getPortfolioDataForAI(parseInt(portfolioId));

        if (!data) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Portfolio data error:', error);
        res.status(500).json({ error: 'Failed to get portfolio data' });
    }
});

/**
 * GET /api/ai/company/:companyId/data
 * Get company data formatted for AI analysis
 */
router.get('/company/:companyId/data', async (req, res) => {
    try {
        const { companyId } = req.params;
        const data = await portfolioDataProvider.getCompanyDataForAI(parseInt(companyId));

        if (!data) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json(data);
    } catch (error) {
        console.error('Company data error:', error);
        res.status(500).json({ error: 'Failed to get company data' });
    }
});

/**
 * GET /api/ai/market/data
 * Get market data for AI briefing
 */
router.get('/market/data', async (req, res) => {
    try {
        const data = await portfolioDataProvider.getMarketDataForBriefing();
        res.json(data);
    } catch (error) {
        console.error('Market data error:', error);
        res.status(500).json({ error: 'Failed to get market data' });
    }
});

/**
 * POST /api/ai/portfolio/:portfolioId/analyze
 * Analyze a portfolio with AI
 */
router.post('/portfolio/:portfolioId/analyze', async (req, res) => {
    try {
        const { portfolioId } = req.params;
        const { analystId, question } = req.body;

        // Get portfolio data
        const portfolioData = await portfolioDataProvider.getPortfolioDataForAI(parseInt(portfolioId));
        if (!portfolioData) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        // Try Python service if enabled
        if (AI_ENABLED) {
            try {
                const result = await callPythonService('analyst:analyze', {
                    analyst_id: analystId || 'value',
                    company_data: {
                        portfolio: portfolioData.portfolio,
                        values: portfolioData.values,
                        performance: portfolioData.performance,
                        positions: portfolioData.positions,
                        sectorAllocation: portfolioData.sectorAllocation
                    },
                    question: question || 'Please analyze this portfolio and provide your investment perspective.'
                });
                return res.json({
                    success: true,
                    analysis: result.analysis
                });
            } catch (e) {
                console.warn('Python portfolio analysis failed:', e.message);
            }
        }

        // Fallback response
        res.json({
            success: true,
            analysis: {
                content: `Portfolio "${portfolioData.portfolio.name}" analysis:\n\n` +
                    `Total Value: $${portfolioData.values.totalValue.toLocaleString()}\n` +
                    `Positions: ${portfolioData.positions.length}\n` +
                    `Unrealized P&L: $${portfolioData.performance.unrealizedPnl.toLocaleString()} (${portfolioData.performance.unrealizedPnlPct.toFixed(2)}%)\n\n` +
                    'This is a fallback response. Configure Claude API or Ollama for detailed AI analysis.',
                model: 'fallback',
                tokens: 0
            }
        });
    } catch (error) {
        console.error('Portfolio analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze portfolio' });
    }
});

// ============================================
// Notes AI Routes
// ============================================

/**
 * POST /api/ai/notes/summarize
 * Generate a summary of a research note
 */
router.post('/notes/summarize', async (req, res) => {
    try {
        const { content, title, maxLength } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Note content is required' });
        }

        if (AI_ENABLED) {
            try {
                const result = await callPythonService('notes:summarize', {
                    content,
                    title: title || '',
                    max_length: maxLength || 200
                });
                return res.json({ success: true, ...result });
            } catch (e) {
                console.warn('Notes summarize failed:', e.message);
            }
        }

        // Fallback: simple extraction
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const summary = sentences.slice(0, 3).join('. ') + '.';

        res.json({
            success: true,
            summary: summary || 'Summary not available without AI service.',
            model: 'fallback',
            tokens: 0,
            cost_usd: 0
        });
    } catch (error) {
        console.error('Note summarize error:', error);
        res.status(500).json({ error: 'Failed to summarize note' });
    }
});

/**
 * POST /api/ai/notes/extract-assumptions
 * Extract investment assumptions from note content
 */
router.post('/notes/extract-assumptions', async (req, res) => {
    try {
        const { content, thesisContext } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Note content is required' });
        }

        if (AI_ENABLED) {
            try {
                const result = await callPythonService('notes:extract_assumptions', {
                    content,
                    thesis_context: thesisContext || ''
                });
                return res.json({ success: true, ...result });
            } catch (e) {
                console.warn('Extract assumptions failed:', e.message);
            }
        }

        // Fallback
        res.json({
            success: true,
            result: 'Assumption extraction requires AI service. Please configure ANTHROPIC_API_KEY.',
            parsed: { assumptions: [], key_themes: [] },
            model: 'fallback',
            tokens: 0,
            cost_usd: 0
        });
    } catch (error) {
        console.error('Extract assumptions error:', error);
        res.status(500).json({ error: 'Failed to extract assumptions' });
    }
});

/**
 * POST /api/ai/notes/challenge-thesis
 * Generate challenges for an investment thesis
 */
router.post('/notes/challenge-thesis', async (req, res) => {
    try {
        const { thesisSummary, assumptions, companyData } = req.body;

        if (!thesisSummary) {
            return res.status(400).json({ error: 'Thesis summary is required' });
        }

        if (AI_ENABLED) {
            try {
                const result = await callPythonService('notes:challenge_thesis', {
                    thesis_summary: thesisSummary,
                    assumptions: assumptions || [],
                    company_data: companyData
                });
                return res.json({ success: true, ...result });
            } catch (e) {
                console.warn('Challenge thesis failed:', e.message);
            }
        }

        // Fallback
        res.json({
            success: true,
            challenges: 'Thesis challenges require AI service. Please configure ANTHROPIC_API_KEY.',
            model: 'fallback',
            tokens: 0,
            cost_usd: 0
        });
    } catch (error) {
        console.error('Challenge thesis error:', error);
        res.status(500).json({ error: 'Failed to challenge thesis' });
    }
});

/**
 * POST /api/ai/notes/extract-insights
 * Extract key insights from a note
 */
router.post('/notes/extract-insights', async (req, res) => {
    try {
        const { content, noteType } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Note content is required' });
        }

        if (AI_ENABLED) {
            try {
                const result = await callPythonService('notes:extract_insights', {
                    content,
                    note_type: noteType || 'research'
                });
                return res.json({ success: true, ...result });
            } catch (e) {
                console.warn('Extract insights failed:', e.message);
            }
        }

        // Fallback
        res.json({
            success: true,
            result: 'Insight extraction requires AI service. Please configure ANTHROPIC_API_KEY.',
            parsed: { key_insights: [], action_items: [], follow_up_questions: [] },
            model: 'fallback',
            tokens: 0,
            cost_usd: 0
        });
    } catch (error) {
        console.error('Extract insights error:', error);
        res.status(500).json({ error: 'Failed to extract insights' });
    }
});

/**
 * POST /api/ai/notes/suggest-tags
 * Suggest tags for a note based on content
 */
router.post('/notes/suggest-tags', async (req, res) => {
    try {
        const { content, existingTags } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Note content is required' });
        }

        if (AI_ENABLED) {
            try {
                const result = await callPythonService('notes:suggest_tags', {
                    content,
                    existing_tags: existingTags || []
                });
                return res.json({ success: true, ...result });
            } catch (e) {
                console.warn('Suggest tags failed:', e.message);
            }
        }

        // Fallback - simple keyword extraction
        const keywords = content.toLowerCase()
            .match(/\b(?:growth|value|dividend|earnings|revenue|margin|moat|competitive|risk|catalyst|management|valuation)\b/g) || [];
        const uniqueTags = [...new Set(keywords)];

        res.json({
            success: true,
            result: JSON.stringify({ suggested_tags: uniqueTags, new_tags: [], reasoning: 'Simple keyword extraction' }),
            parsed: { suggested_tags: uniqueTags, new_tags: [], reasoning: 'Simple keyword extraction' },
            model: 'fallback',
            tokens: 0,
            cost_usd: 0
        });
    } catch (error) {
        console.error('Suggest tags error:', error);
        res.status(500).json({ error: 'Failed to suggest tags' });
    }
});

module.exports = router;
