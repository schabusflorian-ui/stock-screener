// src/api/server.js
// Load .env and manually populate process.env (dotenv v17 has injection issues)
const dotenvResult = require('dotenv').config();
if (dotenvResult.parsed) {
  for (const [key, value] of Object.entries(dotenvResult.parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const db = require('../database');
const { configurePassport } = require('../auth/passport');

const app = express();
const PORT = process.env.PORT || 3000;

// Make database available to routes via req.app.get('db')
app.set('db', db.getDatabase());

// Configure Passport (only if Google OAuth is configured)
let passport = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport = configurePassport(db.getDatabase());
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Enable gzip compression for all responses > 1KB
// IMPORTANT: SSE (text/event-stream) must NOT be compressed to allow real-time streaming
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Skip compression for SSE streams - they need to stream in real-time
    if (req.path.includes('/stream') || res.getHeader('Content-Type')?.includes('text/event-stream')) {
      return false;
    }
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());

// Session configuration
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

app.use(session({
  store: new SQLiteStore({
    client: db.getDatabase(),
    expired: {
      clear: true,
      intervalMs: 900000 // Clear expired sessions every 15 min
    }
  }),
  secret: sessionSecret || 'dev-only-not-for-production-use',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  }
}));

// Initialize Passport (if configured)
if (passport) {
  app.use(passport.initialize());
  app.use(passport.session());
}

// Import routes
const authRouter = require('./routes/auth');
const companiesRouter = require('./routes/companies.js');
const metricsRouter = require('./routes/metrics');
const screeningRouter = require('./routes/screening');
const trendsRouter = require('./routes/trends');
const sectorsRouter = require('./routes/sectors');
const classificationsRouter = require('./routes/classifications');
const ipoRouter = require('./routes/ipo');
const updatesRouter = require('./routes/updates');
const insidersRouter = require('./routes/insiders');
const capitalRouter = require('./routes/capital');
const sentimentRouter = require('./routes/sentiment');
const validationRouter = require('./routes/validation');
const statsRouter = require('./routes/stats');
const pricesRouter = require('./routes/prices');
const dcfRouter = require('./routes/dcf');
const earningsRouter = require('./routes/earnings');
const priceUpdatesRouter = require('./routes/priceUpdates');
const fiscalRouter = require('./routes/fiscal');
const alertsRouter = require('./routes/alerts');
const indicesRouter = require('./routes/indices');
const dividendsRouter = require('./routes/dividends');
const investorsRouter = require('./routes/investors');
const portfoliosRouter = require('./routes/portfolios');
const simulateRouter = require('./routes/simulate');
const etfsRouter = require('./routes/etfs');
const knowledgeRouter = require('./routes/knowledge');
const analystRouter = require('./routes/analyst');
const aiRouter = require('./routes/ai');
const nlQueryRouter = require('./routes/nlQuery');
const secRefreshRouter = require('./routes/secRefresh');
const aiRatingsRouter = require('./routes/aiRatings');
const notesRouter = require('./routes/notes');
const thesesRouter = require('./routes/theses');
const historicalRouter = require('./routes/historical');
const factorsRouter = require('./routes/factors');
const updateSystemRouter = require('./routes/updateSystem');
const settingsRouter = require('./routes/settings');
const tradingRouter = require('./routes/trading');
const macroRouter = require('./routes/macro');
const agentRouter = require('./routes/agent');
const orchestratorRouter = require('./routes/orchestrator');
const attributionRouter = require('./routes/attribution');
const transcriptsRouter = require('./routes/transcripts');
const optimizationRouter = require('./routes/optimization');
const alternativeDataRouter = require('./routes/alternativeData');
const riskRouter = require('./routes/risk');
const signalsRouter = require('./routes/signals');
const recommendationsRouter = require('./routes/recommendations');
const executionRouter = require('./routes/execution');
const backtestingRouter = require('./routes/backtesting');
const adminRouter = require('./routes/admin');
const agentsRouter = require('./routes/agents');
const paperTradingRouter = require('./routes/paperTrading');
const xbrlRouter = require('./routes/xbrl');
const dataRouter = require('./routes/data');
const identifiersRouter = require('./routes/identifiers');
const strategiesRouter = require('./routes/strategies');
const congressionalRouter = require('./routes/congressional');
const onboardingRouter = require('./routes/onboarding');
const watchlistRouter = require('./routes/watchlist');
const notificationsRouter = require('./routes/notifications');
const analyticsRouter = require('./routes/analytics');
const feedbackRouter = require('./routes/feedback');
const helpRouter = require('./routes/help');

// Use routes
app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/screening', screeningRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/sectors', sectorsRouter);
app.use('/api/classifications', classificationsRouter);
app.use('/api/ipo', ipoRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/insiders', insidersRouter);
app.use('/api/capital', capitalRouter);
app.use('/api/sentiment', sentimentRouter);
app.use('/api/validation', validationRouter);
app.use('/api/stats', statsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/dcf', dcfRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/price-updates', priceUpdatesRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/indices', indicesRouter);
app.use('/api/dividends', dividendsRouter);
app.use('/api/investors', investorsRouter);
app.use('/api/portfolios', portfoliosRouter);
app.use('/api/simulate', simulateRouter);
app.use('/api/etfs', etfsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/analyst', analystRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ai-ratings', aiRatingsRouter);
app.use('/api/nl', nlQueryRouter);
app.use('/api/sec-refresh', secRefreshRouter);
app.use('/api/notes', notesRouter);
app.use('/api/theses', thesesRouter);
app.use('/api/historical', historicalRouter);
app.use('/api/factors', factorsRouter);
app.use('/api/update-system', updateSystemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/macro', macroRouter);
app.use('/api/agent', agentRouter);
app.use('/api/orchestrator', orchestratorRouter);
app.use('/api/attribution', attributionRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/optimization', optimizationRouter);
app.use('/api/alt-data', alternativeDataRouter);
app.use('/api/risk', riskRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/execution', executionRouter);
app.use('/api/backtesting', backtestingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/paper-trading', paperTradingRouter);
app.use('/api/xbrl', xbrlRouter);
app.use('/api/data', dataRouter);
app.use('/api/identifiers', identifiersRouter);
app.use('/api/strategies', strategiesRouter(db.getDatabase()));
app.use('/api/congressional', congressionalRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/help', helpRouter);

// Health check - basic endpoint for load balancers
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Detailed health check - includes service status
app.get('/api/health/detailed', (req, res) => {
  const { getAllCircuitStates } = require('../utils/circuitBreaker');
  const { getLLMHandler } = require('../services/nl/llmHandler');

  // Check LLM availability
  const llmHandler = getLLMHandler();
  const llmStatus = llmHandler.isAvailable() ? 'available' : 'unavailable';

  // Get circuit breaker states
  const circuitBreakers = getAllCircuitStates();

  // Check database
  let dbStatus = 'unknown';
  try {
    const database = db.getDatabase();
    database.prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  // Memory usage
  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbStatus,
      llm: llmStatus
    },
    circuitBreakers: circuitBreakers.map(cb => ({
      name: cb.name,
      state: cb.state,
      failures: cb.failures,
      isAvailable: cb.isAvailable
    })),
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
    }
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Stock Analysis API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      companies: '/api/companies',
      metrics: '/api/metrics',
      screening: '/api/screening',
      trends: '/api/trends',
      sectors: '/api/sectors',
      classifications: '/api/classifications',
      ipo: '/api/ipo',
      updates: '/api/updates',
      insiders: '/api/insiders',
      capital: '/api/capital',
      sentiment: '/api/sentiment',
      validation: '/api/validation',
      stats: '/api/stats',
      prices: '/api/prices',
      dcf: '/api/dcf',
      earnings: '/api/earnings',
      priceUpdates: '/api/price-updates',
      alerts: '/api/alerts',
      indices: '/api/indices',
      investors: '/api/investors',
      portfolios: '/api/portfolios',
      simulate: '/api/simulate',
      knowledge: '/api/knowledge',
      analyst: '/api/analyst',
      ai: '/api/ai',
      nl: '/api/nl',
      notes: '/api/notes',
      theses: '/api/theses',
      historical: '/api/historical',
      factors: '/api/factors',
      updateSystem: '/api/update-system',
      settings: '/api/settings',
      trading: '/api/trading',
      macro: '/api/macro',
      agent: '/api/agent',
      orchestrator: '/api/orchestrator',
      transcripts: '/api/transcripts',
      recommendations: '/api/recommendations',
      execution: '/api/execution',
      backtesting: '/api/backtesting',
      xbrl: '/api/xbrl',
      data: '/api/data',
      onboarding: '/api/onboarding',
      watchlist: '/api/watchlist',
      analytics: '/api/analytics',
      feedback: '/api/feedback',
      help: '/api/help',
      health: '/api/health'
    }
  });
});

// Import error handlers
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');

// 404 handler
app.use(notFoundHandler);

// Error handler (sanitizes errors in production)
app.use(errorHandler);

// Import logger
const logger = require('../lib/logger');

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`API Server running on http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);

  if (passport) {
    logger.info('Auth enabled (Google OAuth)');
  } else {
    logger.info('Auth disabled (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable)');
  }

  // Initialize Update Orchestrator if enabled
  try {
    const autoStartScheduler = process.env.AUTO_START_SCHEDULER !== 'false';
    if (autoStartScheduler) {
      const { getUpdateOrchestrator } = require('../services/updates/updateOrchestrator');
      const orchestrator = getUpdateOrchestrator(db.getDatabase());

      // Check if update_jobs table exists (migration has run)
      const tableExists = db.getDatabase().prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='update_jobs'
      `).get();

      if (tableExists) {
        orchestrator.start();
        logger.info('Update Scheduler started');
      } else {
        logger.warn('Update Scheduler: Migration not yet run. Run: node src/database-migrations/add-update-system.js');
      }
    } else {
      logger.info('Update Scheduler disabled (AUTO_START_SCHEDULER=false)');
    }
  } catch (err) {
    logger.error('Update Scheduler failed to start', err);
  }
});

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn(`Received ${signal} during shutdown, forcing exit`);
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Set a hard timeout for shutdown (30 seconds)
  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error('Error closing server:', err);
      } else {
        logger.info('Server closed, no longer accepting connections');
      }
    });

    // Stop update orchestrator if running
    try {
      const { getUpdateOrchestrator } = require('../services/updates/updateOrchestrator');
      const orchestrator = getUpdateOrchestrator(db.getDatabase());
      if (orchestrator.isRunning) {
        orchestrator.stop();
        logger.info('Update Scheduler stopped');
      }
    } catch (e) {
      // Orchestrator may not be initialized
    }

    // Close database connection
    try {
      const database = db.getDatabase();
      database.close();
      logger.info('Database connection closed');
    } catch (e) {
      logger.error('Error closing database:', e);
    }

    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

module.exports = app;