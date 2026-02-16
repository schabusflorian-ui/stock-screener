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
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { getDatabaseAsync, isUsingPostgres, dialect } = require('../lib/db');
const { configurePassport } = require('../auth/passport');
const { conditionalCsrf, csrfErrorHandler, csrfProtection } = require('../middleware/csrf');

// Import logger early for session store setup logging
const logger = require('../lib/logger');

// Initialize Sentry error tracking (must be early)
const sentry = require('../lib/sentry');
sentry.initSentry();

/**
 * Create session store based on environment
 * Production: Redis (required for horizontal scaling)
 * Development: SQLite (simpler local setup)
 */
function createSessionStore() {
  const dbUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  // Try Redis first (best for production cloud deployment with horizontal scaling)
  if (redisUrl) {
    try {
      const RedisStore = require('connect-redis').default;
      const Redis = require('ioredis');

      const redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      redisClient.on('error', (err) => {
        logger.error('[Session Store] Redis error:', err.message);
      });

      redisClient.on('connect', () => {
        logger.info('[Session Store] Connected to Redis');
      });

      return new RedisStore({
        client: redisClient,
        prefix: 'session:',
        ttl: 30 * 24 * 60 * 60, // 30 days in seconds
      });
    } catch (err) {
      logger.error('[Session Store] Failed to initialize Redis:', err.message);
      // Continue to PostgreSQL fallback if Redis fails
    }
  }

  // PostgreSQL session store (for Railway and other PostgreSQL deployments)
  if (dbUrl && dbUrl.includes('postgresql')) {
    try {
      const pgSession = require('connect-pg-simple')(session);
      const { Pool } = require('pg');

      const pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000
      });

      logger.info('[Session Store] Using PostgreSQL session store');
      return new pgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true,
        ttl: 8 * 60 * 60 // 8 hours in seconds
      });
    } catch (err) {
      logger.error('[Session Store] PostgreSQL initialization failed:', err.message);
      if (process.env.NODE_ENV === 'production') {
        throw new Error('PostgreSQL session store required but failed to initialize');
      }
    }
  }

  // Fallback to SQLite (development only)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production requires PostgreSQL or Redis session store');
  }

  logger.warn('[Session Store] Using SQLite (dev mode only)');
  return new SQLiteStore({
    client: database.getDatabase(),
    expired: {
      clear: true,
      intervalMs: 900000 // Clear expired sessions every 15 min
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway proxy - enables secure cookies to work behind HTTPS proxy
// Railway terminates SSL at edge, forwards HTTP internally with x-forwarded-proto header
app.set('trust proxy', 1);

// ============================================
// CRITICAL: Health check registered at ROOT LEVEL to bypass all middleware
// This MUST be the first route registered, before ANY middleware or configuration
// Railway's internal healthcheck cannot handle:
// - HTTPS redirects (healthcheck uses HTTP internally)
// - CORS checks (no Origin header)
// - Rate limiting
// - Session middleware
// ============================================
app.get('/health', (req, res) => {
  console.log('[Health Check] Request received from:', req.ip || req.connection.remoteAddress);
  res.status(200).send('OK');
  console.log('[Health Check] Response sent: 200 OK');
});

// Also keep /api/health for backward compatibility
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database is NOT set on app to prevent using stub proxy
// Routes must use: const database = await getDatabaseAsync() from '../../lib/db'
// See MIGRATION_AUDIT.md for details on why app.set('db') was removed

// Configure Passport (only if Google OAuth is configured; uses getDatabaseAsync internally)
let passport = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport = configurePassport();
}

// Middleware
// Security headers - comprehensive protection
const isProduction = process.env.NODE_ENV === 'production';
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // HSTS - enforce HTTPS for 1 year
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  // Content Security Policy - restrict script sources
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline for React
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com", "wss:", "https://prism-invest.up.railway.app", "https://*.railway.app"],
      fontSrc: ["'self'", "https:", "data:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Prevent MIME sniffing
  noSniff: true,
  // XSS filter
  xssFilter: true,
  // Don't expose powered-by header
  hidePoweredBy: true,
}));

// Sentry request handler (must be first after helmet)
app.use(sentry.getRequestHandler());

// Correlation ID for request tracing
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || require('crypto').randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

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
  ? [process.env.FRONTEND_URL.trim()] // Trim whitespace from env var (Railway may add trailing chars)
  : ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'];

// Auto-add Railway preview URLs in production if FRONTEND_URL not set
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  // Allow any *.up.railway.app domain for Railway deployments
  allowedOrigins.push(/https:\/\/.*\.up\.railway\.app$/);
}

app.use(cors({
  origin: function(origin, callback) {
    // In production, require origin header for browser requests
    // This prevents CSRF attacks from non-browser clients
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        // Reject requests without origin in production
        // Exception: Allow health checks and API calls with proper auth
        return callback(null, false);
      }
      // Allow in development for easier testing (curl, Postman, etc.)
      return callback(null, true);
    }

    // Check if origin matches allowed origins (strings or regexes)
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      return callback(null, origin);
    }

    console.warn('[CORS] Rejected origin:', origin, 'Allowed:', allowedOrigins);
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Bypass', 'X-Requested-With', 'Accept']
}));

// Request logging - JSON format in production for log aggregation
app.use(morgan(isProduction
  ? ':method :url :status :response-time ms - :res[content-length]'
  : 'dev'
));
app.use(cookieParser());

// Global rate limiting - protect against DDoS
const { createRateLimiter } = require('../middleware/rateLimiter');
app.use('/api/', createRateLimiter({
  windowMs: 60000,      // 1 minute window
  maxRequests: 200,     // 200 requests per minute per IP
  keyPrefix: 'global',
}));

// Raw body parser for Stripe webhooks (MUST be before express.json())
// This captures the raw body for signature verification
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' })); // Explicit size limit

// Default cache headers for API responses
app.use('/api/', (req, res, next) => {
  // Only cache GET requests
  if (req.method === 'GET') {
    // Default: cache for 5 minutes, allow stale while revalidating
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  } else {
    // Don't cache mutations
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Session configuration
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

app.use(session({
  store: createSessionStore(),
  secret: sessionSecret || 'dev-only-not-for-production-use',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    // SECURITY: 8 hours in production, 30 days in development
    maxAge: process.env.NODE_ENV === 'production'
      ? 8 * 60 * 60 * 1000   // 8 hours for production (reduced attack window)
      : 30 * 24 * 60 * 60 * 1000, // 30 days for development convenience
    // SameSite 'none' allows cross-domain cookies (required when frontend/backend are on different Railway domains)
    // Must be 'none' with secure:true for Railway deployment where frontend and backend are separate services
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// HTTPS redirect in production (Railway/Heroku set x-forwarded-proto)
// IMPORTANT: This MUST come AFTER session middleware so session cookies are set before redirect
if (isProduction) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Initialize Passport (if configured)
if (passport) {
  app.use(passport.initialize());
  app.use(passport.session());
}

// Bridge: attach real DB to app for routes that use req.app.get('db')
// Required because app.set('db') was removed - routes get undefined otherwise
app.use(async (req, res, next) => {
  try {
    const database = await getDatabaseAsync();
    app.set('db', database);
    next();
  } catch (err) {
    next(err);
  }
});

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
const capitalRouter = require('./routes/capital'); // FIXED: Now uses lazy initialization and getDatabaseAsync()
const sentimentRouter = require('./routes/sentiment'); // FIXED: Now uses lazy initialization and getDatabaseAsync()
const validationRouter = require('./routes/validation');
const statsRouter = require('./routes/stats');
const pricesRouter = require('./routes/prices');
const dcfRouter = require('./routes/dcf'); // FIXED: Now uses getDatabaseAsync() throughout
const earningsRouter = require('./routes/earnings'); // FIXED: Now uses lazy initialization
const priceUpdatesRouter = require('./routes/priceUpdates');
const fiscalRouter = require('./routes/fiscal'); // FIXED: Now uses lazy initialization
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
const xbrlRouter = require('./routes/xbrl'); // FIXED: Now uses lazy initialization
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
const unifiedStrategyRouter = require('./routes/unifiedStrategy');
const featuresRouter = require('./routes/features');
const mlopsRouter = require('./routes/mlops');
const ensembleRouter = require('./routes/ensemble');
const rlRouter = require('./routes/rl');
const explainabilityRouter = require('./routes/explainability');
const gdprRouter = require('./routes/gdpr');
const taxRouter = require('./routes/tax');
const tcaRouter = require('./routes/tca');
const prismRouter = require('./routes/prism'); // FIXED: Now uses getDatabaseAsync() pattern
const batchRouter = require('./routes/batch');
const subscriptionRouter = require('./routes/subscription');
const systemRouter = require('./routes/system'); // PHASE 2: System health and monitoring
const diagnosticRouter = require('./routes/diagnostic'); // Diagnostic endpoints for troubleshooting

// CSRF Protection - apply to all state-changing requests
// Skip in development for easier testing, enable in production
if (process.env.NODE_ENV === 'production') {
  app.use(conditionalCsrf);
  app.use(csrfErrorHandler);
}

// CSRF Token endpoint - frontend fetches this to get a token
// Must run csrfProtection so req.csrfToken() exists (conditionalCsrf skips GET)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    return res.json({ success: true, csrfToken: 'dev-mode-no-csrf' });
  }
  res.json({ success: true, csrfToken: req.csrfToken() });
});

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
app.use('/api/capital', capitalRouter); // FIXED: Now uses lazy initialization and getDatabaseAsync()
app.use('/api/sentiment', sentimentRouter); // FIXED: Now uses lazy initialization and getDatabaseAsync()
app.use('/api/validation', validationRouter);
app.use('/api/stats', statsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/dcf', dcfRouter); // FIXED: Now uses getDatabaseAsync() throughout
app.use('/api/earnings', earningsRouter); // FIXED: Now uses lazy initialization
app.use('/api/price-updates', priceUpdatesRouter);
app.use('/api/fiscal', fiscalRouter); // FIXED: Now uses lazy initialization
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
app.use('/api/xbrl', xbrlRouter); // FIXED: Now uses lazy initialization
app.use('/api/data', dataRouter);
app.use('/api/identifiers', identifiersRouter);
const strategiesRouterReady = require('../lib/db').getDatabaseAsync().then(database =>
  strategiesRouter(database)
);
app.use('/api/strategies', (req, res, next) => {
  strategiesRouterReady.then(router => router(req, res, next)).catch(next);
});
app.use('/api/congressional', congressionalRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/help', helpRouter);
app.use('/api/unified-strategies', unifiedStrategyRouter);
app.use('/api/features', featuresRouter);
app.use('/api/mlops', mlopsRouter);
app.use('/api/ensemble', ensembleRouter);
app.use('/api/rl', rlRouter);
app.use('/api/explainability', explainabilityRouter);
app.use('/api/gdpr', gdprRouter);
app.use('/api/tax', taxRouter);
app.use('/api/tca', tcaRouter);
app.use('/api/prism', prismRouter); // FIXED: Re-enabled after async conversion
app.use('/api/batch', batchRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/system', systemRouter); // PHASE 2: Enhanced system health endpoints
app.use('/api/diagnostic', diagnosticRouter); // Diagnostic endpoints for troubleshooting

// Note: Basic /api/health endpoint is registered early (before middleware) to ensure
// Railway's healthcheck can reach it without being blocked by HTTPS redirects, CORS, etc.

// Detailed health check - includes service status
app.get('/api/health/detailed', async (req, res) => {
  const { registry } = require('../utils/circuitBreaker');
  const { getLLMHandler } = require('../services/nl/llmHandler');
  const { getCacheStats } = require('../middleware/apiOptimization');
  const { unifiedCache } = require('../lib/redisCache');
  const config = require('../config');

  // Check LLM availability
  const llmHandler = getLLMHandler();
  const llmStatus = llmHandler.isAvailable() ? 'available' : 'unavailable';

  // Get circuit breaker states
  const circuitBreakers = registry.getAll();

  // Check database
  let dbStatus = 'unknown';
  const dbType = isUsingPostgres() ? 'postgres' : 'sqlite';
  try {
    const dbClient = await getDatabaseAsync();
    await dbClient.query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }

  // Check Redis status
  let redisStatus = 'not_configured';
  if (process.env.REDIS_URL) {
    try {
      const cacheBackend = unifiedCache.getBackend();
      redisStatus = cacheBackend === 'redis' ? 'connected' : 'fallback_memory';
    } catch (e) {
      redisStatus = 'error';
    }
  }

  // Get cache statistics
  let cacheStats = {};
  try {
    cacheStats = await getCacheStats();
  } catch (e) {
    cacheStats = { error: e.message };
  }

  // Memory usage
  const memUsage = process.memoryUsage();

  // Storage info
  const storageMode = config.storage?.isEphemeral ? 'ephemeral' : 'persistent';
  const stateStorage = config.storage?.useDbForState ? 'database' : 'filesystem';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    protocol: req.isHttp2 ? 'HTTP/2' : `HTTP/${req.httpVersion}`,
    services: {
      database: dbStatus,
      databaseType: dbType,
      redis: redisStatus,
      llm: llmStatus,
      cache: cacheStats.unified?.backend || 'memory'
    },
    storage: {
      mode: storageMode,
      stateStorage: stateStorage,
      dataDir: config.storage?.dataDir || 'default'
    },
    cache: cacheStats,
    circuitBreakers: Object.entries(circuitBreakers).map(([name, cb]) => ({
      name,
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

// Root route removed - frontend middleware serves React app at /
// API documentation available at /api/health or individual endpoints

// ============================================
// FRONTEND SERVING (Production)
// ============================================

// Serve static files from React build
const frontendBuildPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendBuildPath));

// SPA fallback: Serve React index.html for non-API GET/HEAD requests BEFORE 404 handler
// This enables client-side routing (React Router) for routes like /capital, /portfolio, etc.
// Must come before notFoundHandler so direct navigation/refresh to /capital returns HTML, not JSON 404
// HEAD is included so prefetches, crawlers, and service workers get 200 instead of 404
app.use((req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      next(err);
    }
  });
});

// Import error handlers
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');

// 404 handler - catches unmatched API routes and other requests
app.use(notFoundHandler);

// Sentry error handler (captures errors to Sentry before main handler)
app.use(sentry.getErrorHandler());

// Error handler (sanitizes errors in production)
app.use(errorHandler);

// Import HTTP/2 server support
const { createServer, getServerInfo, http2InfoMiddleware } = require('../lib/http2Server');

// Add HTTP/2 info middleware
app.use(http2InfoMiddleware);

// Create server (HTTP/2 with SSL if available, otherwise HTTP/1.1)
const server = createServer(app);
const serverInfo = getServerInfo(server);

// Start server
// Bind to 0.0.0.0 to accept connections from outside the container (required for Docker/Railway)
const HOST = '0.0.0.0';
server.listen(PORT, HOST, async () => {
  const protocol = serverInfo.protocol === 'HTTP/2' ? 'https' : 'http';
  logger.info(`API Server running on ${protocol}://${HOST}:${PORT} (${serverInfo.protocol})`);
  logger.info(`Health check: ${protocol}://localhost:${PORT}/health (bypasses middleware)`);

  if (passport) {
    logger.info('Auth enabled (Google OAuth)');
  } else {
    logger.info('Auth disabled (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable)');
  }

  // Initialize Update Orchestrator if enabled (async DB; works with SQLite and Postgres)
  (async () => {
    try {
      const autoStartScheduler = process.env.AUTO_START_SCHEDULER !== 'false';
      if (!autoStartScheduler) {
        logger.info('Update Scheduler disabled (AUTO_START_SCHEDULER=false)');
        return;
      }

      const database = await getDatabaseAsync();
      const tableExistsSql = dialect.tableExistsQuery('update_jobs');
      const tableResult = await database.query(tableExistsSql);
      const exists = isUsingPostgres()
        ? tableResult.rows[0]?.exists
        : !!tableResult.rows[0];

      if (exists) {
        const { getUpdateOrchestrator } = require('../services/updates/updateOrchestrator');
        const orchestrator = getUpdateOrchestrator();
        await orchestrator.start();
        logger.info('Update Scheduler started');
      } else {
        logger.warn('Update Scheduler: Migration not yet run. Run: node src/database-migrations/add-update-system.js');
      }
    } catch (err) {
      logger.error('Update Scheduler failed to start', err);
    }
  })();
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
      const orchestrator = getUpdateOrchestrator();
      if (orchestrator.isRunning) {
        await orchestrator.stop();
        logger.info('Update Scheduler stopped');
      }
    } catch (e) {
      // Orchestrator may not be initialized
    }

    // Close database connection
    try {
      const dbClient = await getDatabaseAsync();
      if (dbClient && typeof dbClient.close === 'function') {
        await dbClient.close();
      }
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
