/**
 * Knowledge Base API Routes
 *
 * Provides REST API access to the investment knowledge base,
 * enabling retrieval of relevant wisdom for analysis.
 *
 * Routes:
 * - GET /api/knowledge/search - Search knowledge base
 * - GET /api/knowledge/stats - Get knowledge base statistics
 * - GET /api/knowledge/topics - List available topics
 * - POST /api/knowledge/retrieve - Retrieve for company analysis
 * - GET /api/knowledge/health - Health check
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

// Python script paths
const PYTHON_PATH = 'python3';
const SCRIPTS_DIR = path.join(__dirname, '../../../scripts');

/**
 * Execute a Python knowledge retrieval script
 */
async function executePythonScript(scriptName, args = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);

    // Convert args to JSON and pass via stdin
    const argsJson = JSON.stringify(args);

    const pythonProcess = spawn(PYTHON_PATH, ['-c', `
import sys
import json
sys.path.insert(0, '${path.join(__dirname, '../../..')}')

from src.services.ai import KnowledgeRetriever, VectorStore

args = json.loads('''${argsJson}''')
action = args.get('action', 'search')

retriever = KnowledgeRetriever(db_path='data/knowledge_vectors.db')

if action == 'search':
    results = retriever.retrieve(
        query=args.get('query', ''),
        top_k=args.get('top_k', 5),
        topics=args.get('topics'),
        min_similarity=args.get('min_similarity', 0.3)
    )
    # Clean up results for JSON serialization
    output = []
    for r in results:
        output.append({
            'id': r['id'],
            'content': r['content'],
            'similarity': r['similarity'],
            'metadata': r['metadata']
        })
    print(json.dumps({'results': output}))

elif action == 'stats':
    stats = retriever.get_stats()
    print(json.dumps(stats))

elif action == 'health':
    health = retriever.health_check()
    print(json.dumps(health))

elif action == 'topics':
    from src.services.ai import TopicTagger
    tagger = TopicTagger()
    topics = tagger.get_all_topics()
    print(json.dumps({'topics': topics}))

elif action == 'company':
    context = retriever.retrieve_for_company_analysis(
        company_data=args.get('company_data', {}),
        analysis_type=args.get('analysis_type', 'general')
    )
    print(json.dumps({'context': context}))

elif action == 'topic_retrieve':
    context = retriever.retrieve_for_topic(
        topic=args.get('topic', 'general'),
        top_k=args.get('top_k', 5)
    )
    print(json.dumps({'context': context}))

else:
    print(json.dumps({'error': f'Unknown action: {action}'}))
    `]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
}

/**
 * GET /api/knowledge/search
 *
 * Search the knowledge base for relevant investment wisdom.
 *
 * Query params:
 * - q (required): Search query
 * - top_k: Number of results (default: 5)
 * - topics: Comma-separated topic filter
 * - min_similarity: Minimum similarity threshold (default: 0.3)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, top_k = 5, topics, min_similarity = 0.3 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const topicList = topics ? topics.split(',').map(t => t.trim()) : null;

    const result = await executePythonScript('knowledge_api.py', {
      action: 'search',
      query: q,
      top_k: parseInt(top_k),
      topics: topicList,
      min_similarity: parseFloat(min_similarity)
    });

    res.json({
      query: q,
      result_count: result.results.length,
      results: result.results
    });

  } catch (error) {
    console.error('Knowledge search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/stats
 *
 * Get statistics about the knowledge base.
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await executePythonScript('knowledge_api.py', {
      action: 'stats'
    });

    res.json(stats);

  } catch (error) {
    console.error('Knowledge stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/topics
 *
 * Get list of available topics for filtering.
 */
router.get('/topics', async (req, res) => {
  try {
    const result = await executePythonScript('knowledge_api.py', {
      action: 'topics'
    });

    res.json(result);

  } catch (error) {
    console.error('Knowledge topics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/retrieve
 *
 * Retrieve knowledge for company analysis.
 *
 * Body:
 * - company_data: Object with company metrics
 * - analysis_type: 'value', 'growth', 'contrarian', 'quant', 'general'
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { company_data, analysis_type = 'general' } = req.body;

    if (!company_data) {
      return res.status(400).json({ error: 'company_data is required' });
    }

    const result = await executePythonScript('knowledge_api.py', {
      action: 'company',
      company_data,
      analysis_type
    });

    res.json({
      analysis_type,
      context: result.context
    });

  } catch (error) {
    console.error('Knowledge retrieve error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/topic/:topic
 *
 * Retrieve knowledge about a specific topic.
 */
router.get('/topic/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const { top_k = 5 } = req.query;

    const result = await executePythonScript('knowledge_api.py', {
      action: 'topic_retrieve',
      topic,
      top_k: parseInt(top_k)
    });

    res.json({
      topic,
      context: result.context
    });

  } catch (error) {
    console.error('Knowledge topic retrieve error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/health
 *
 * Health check for the knowledge base.
 */
router.get('/health', async (req, res) => {
  try {
    const health = await executePythonScript('knowledge_api.py', {
      action: 'health'
    });

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================
// ADVANCED RAG ENDPOINTS
// ============================================

/**
 * GET /api/knowledge/graph/concept/:conceptId
 *
 * Get concept details and relationships from knowledge graph.
 */
router.get('/graph/concept/:conceptId', async (req, res) => {
  try {
    const { conceptId } = req.params;
    const { depth = 2 } = req.query;

    const result = await executePythonScript('knowledge_api.py', {
      action: 'graph_concept',
      concept_id: conceptId,
      depth: parseInt(depth)
    });

    res.json(result);

  } catch (error) {
    console.error('Knowledge graph error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/graph/author/:authorName
 *
 * Get concepts associated with a specific author.
 */
router.get('/graph/author/:authorName', async (req, res) => {
  try {
    const { authorName } = req.params;

    const result = await executePythonScript('knowledge_api.py', {
      action: 'graph_author',
      author: authorName
    });

    res.json(result);

  } catch (error) {
    console.error('Knowledge graph author error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/graph/connections
 *
 * Find connections between two concepts.
 */
router.get('/graph/connections', async (req, res) => {
  try {
    const { from, to, depth = 3 } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" and "to" parameters required' });
    }

    const result = await executePythonScript('knowledge_api.py', {
      action: 'graph_connections',
      concept_a: from,
      concept_b: to,
      depth: parseInt(depth)
    });

    res.json(result);

  } catch (error) {
    console.error('Knowledge graph connections error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/contextual
 *
 * Contextual retrieval with user/query context.
 */
router.post('/contextual', async (req, res) => {
  try {
    const {
      query,
      user_context,
      query_context,
      top_k = 5
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await executePythonScript('knowledge_api.py', {
      action: 'contextual_retrieve',
      query,
      user_context: user_context || {},
      query_context: query_context || {},
      top_k
    });

    res.json(result);

  } catch (error) {
    console.error('Contextual retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/hybrid/search
 *
 * Hybrid search combining semantic and keyword search.
 */
router.get('/hybrid/search', async (req, res) => {
  try {
    const {
      q,
      top_k = 10,
      semantic_weight = 0.7,
      keyword_weight = 0.3,
      authors,
      topics
    } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const result = await executePythonScript('knowledge_api.py', {
      action: 'hybrid_search',
      query: q,
      top_k: parseInt(top_k),
      semantic_weight: parseFloat(semantic_weight),
      keyword_weight: parseFloat(keyword_weight),
      authors: authors ? authors.split(',').map(a => a.trim()) : null,
      topics: topics ? topics.split(',').map(t => t.trim()) : null
    });

    res.json(result);

  } catch (error) {
    console.error('Hybrid search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/freshness
 *
 * Get freshness report for knowledge sources.
 */
router.get('/freshness', async (req, res) => {
  try {
    const result = await executePythonScript('knowledge_api.py', {
      action: 'freshness_check'
    });

    res.json(result);

  } catch (error) {
    console.error('Freshness check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/graph/explore/:topic
 *
 * Explore a topic using the knowledge graph.
 */
router.get('/graph/explore/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const { depth = 2 } = req.query;

    const result = await executePythonScript('knowledge_api.py', {
      action: 'explore_topic',
      topic,
      depth: parseInt(depth)
    });

    res.json(result);

  } catch (error) {
    console.error('Topic explore error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// KNOWLEDGE BASE UPDATE ENDPOINTS
// ============================================

/**
 * GET /api/knowledge/update/status
 *
 * Get status of the knowledge base for the updates page.
 */
router.get('/update/status', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const status = {
      database: null,
      sources: {},
      lastRefresh: null,
      history: []
    };

    // Check database
    const dbPath = path.join(__dirname, '../../../data/knowledge_vectors.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      status.database = {
        path: dbPath,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        modified: stats.mtime.toISOString()
      };
    }

    // Check knowledge_base directories
    const kbPath = path.join(__dirname, '../../../knowledge_base');
    if (fs.existsSync(kbPath)) {
      const categories = fs.readdirSync(kbPath);

      for (const category of categories) {
        const categoryPath = path.join(kbPath, category);
        if (fs.statSync(categoryPath).isDirectory()) {
          const subDirs = fs.readdirSync(categoryPath);
          for (const subDir of subDirs) {
            const subPath = path.join(categoryPath, subDir);
            if (fs.statSync(subPath).isDirectory()) {
              const files = fs.readdirSync(subPath).filter(f => f.endsWith('.txt'));
              status.sources[`${category}/${subDir}`] = files.length;
            }
          }
        }
      }
    }

    // Check refresh status file
    const statusFilePath = path.join(__dirname, '../../../data/knowledge_refresh_status.json');
    if (fs.existsSync(statusFilePath)) {
      try {
        const refreshStatus = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        status.lastRefresh = refreshStatus.lastRun;
        status.history = refreshStatus.history || [];
      } catch (e) {
        console.warn('Could not parse refresh status file:', e.message);
      }
    }

    // Get stats from Python
    try {
      const pythonStats = await executePythonScript('knowledge_api.py', { action: 'stats' });
      status.vectorStore = pythonStats;
    } catch (e) {
      status.vectorStore = { error: e.message };
    }

    res.json({ data: status });

  } catch (error) {
    console.error('Knowledge update status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/update/refresh
 *
 * Trigger a knowledge base refresh.
 *
 * Body:
 * - mode: 'full' | 'incremental' | 'rebuild'
 */
router.post('/update/refresh', async (req, res) => {
  try {
    const { mode = 'incremental' } = req.body || {};
    const { spawn } = require('child_process');
    const path = require('path');

    // Determine which script to run
    let args = [];
    const scriptPath = path.join(__dirname, '../../jobs/knowledgeBaseRefresh.js');

    switch (mode) {
      case 'full':
        // Full refresh - no additional args needed
        break;
      case 'incremental':
        args.push('--incremental');
        break;
      case 'rebuild':
        args.push('--rebuild');
        break;
      default:
        return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }

    // Start the refresh process in the background
    const child = spawn('node', [scriptPath, ...args], {
      cwd: path.join(__dirname, '../../..'),
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    res.json({
      message: `Knowledge base ${mode} refresh started`,
      mode,
      pid: child.pid
    });

  } catch (error) {
    console.error('Knowledge refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
