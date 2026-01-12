// src/config/index.js
// Centralized configuration with environment validation

const path = require('path');
const fs = require('fs');

// Load environment-specific .env file
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = `.env.${NODE_ENV}`;
const envPath = path.resolve(process.cwd(), envFile);

// Load base .env first, then environment-specific
require('dotenv').config();
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

/**
 * Configuration object with all application settings
 */
const config = {
  // Environment
  env: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  isTest: NODE_ENV === 'test',
  isStaging: NODE_ENV === 'staging',

  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  // Database
  database: {
    url: process.env.DATABASE_URL,
    path: process.env.DATABASE_PATH || './data/stocks.db',
    poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    ssl: process.env.DB_SSL !== 'false',
  },

  // Redis (for session store in production)
  redis: {
    url: process.env.REDIS_URL,
    enabled: !!process.env.REDIS_URL,
  },

  // Authentication
  auth: {
    sessionSecret: process.env.SESSION_SECRET,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean),
  },

  // External APIs
  apis: {
    alphaVantage: {
      apiKey: process.env.ALPHA_VANTAGE_KEY,
      enabled: !!process.env.ALPHA_VANTAGE_KEY,
    },
    companiesHouse: {
      apiKey: process.env.COMPANIES_HOUSE_API_KEY,
      enabled: !!process.env.COMPANIES_HOUSE_API_KEY,
    },
    openFigi: {
      apiKey: process.env.OPENFIGI_API_KEY,
      enabled: !!process.env.OPENFIGI_API_KEY,
    },
    fred: {
      apiKey: process.env.FRED_API_KEY,
      enabled: !!process.env.FRED_API_KEY,
    },
  },

  // AI/LLM
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    preferLocal: process.env.LLM_PREFER_LOCAL === 'true',
    dailyBudget: parseFloat(process.env.LLM_DAILY_BUDGET) || 10,
    monthlyBudget: parseFloat(process.env.LLM_MONTHLY_BUDGET) || 100,
    enabled: !!(process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_URL),
  },

  // Scheduler
  scheduler: {
    autoStart: process.env.AUTO_START_SCHEDULER !== 'false',
    timezone: process.env.SCHEDULER_TIMEZONE || 'America/New_York',
  },

  // Monitoring
  monitoring: {
    sentry: {
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    },
    logLevel: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug'),
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },

  // CORS
  cors: {
    origins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3001')
      .split(',')
      .map(o => o.trim()),
    credentials: true,
  },
};

/**
 * Required environment variables for each environment
 */
const requiredEnvVars = {
  production: [
    'DATABASE_URL',
    'SESSION_SECRET',
    'ALPHA_VANTAGE_KEY',
  ],
  staging: [
    'DATABASE_URL',
    'SESSION_SECRET',
  ],
  development: [],
  test: [],
};

/**
 * Validate configuration
 * @throws {Error} if required variables are missing in production
 */
function validateConfig() {
  const required = requiredEnvVars[NODE_ENV] || [];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables for ${NODE_ENV}: ${missing.join(', ')}`;
    if (config.isProduction || config.isStaging) {
      throw new Error(errorMsg);
    } else {
      console.warn(`⚠️  ${errorMsg}`);
    }
  }

  // Additional validations
  if (config.isProduction) {
    // Ensure session secret is strong enough
    if (config.auth.sessionSecret && config.auth.sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters in production');
    }

    // Warn about missing recommended configs
    if (!config.monitoring.sentry.enabled) {
      console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
    }

    if (!config.redis.enabled) {
      console.warn('⚠️  REDIS_URL not configured - using database session store');
    }
  }

  return true;
}

/**
 * Get a summary of enabled features
 */
function getFeatureSummary() {
  return {
    database: config.database.url ? 'PostgreSQL' : 'SQLite',
    auth: config.auth.google.enabled ? 'Google OAuth' : 'Disabled',
    ai: config.ai.enabled ? (config.ai.anthropicApiKey ? 'Claude' : 'Ollama') : 'Disabled',
    scheduler: config.scheduler.autoStart ? 'Enabled' : 'Disabled',
    sentry: config.monitoring.sentry.enabled ? 'Enabled' : 'Disabled',
    rateLimit: config.rateLimit.enabled ? 'Enabled' : 'Disabled',
    redis: config.redis.enabled ? 'Enabled' : 'Disabled',
  };
}

/**
 * Print configuration on startup (redacting secrets)
 */
function printConfig() {
  console.log('\n📋 Configuration:');
  console.log(`   Environment: ${config.env}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.database.url ? 'PostgreSQL' : 'SQLite'}`);

  const features = getFeatureSummary();
  console.log('\n🔧 Features:');
  Object.entries(features).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log('');
}

// Validate on load (but don't throw in development)
try {
  validateConfig();
} catch (err) {
  if (config.isProduction) {
    throw err;
  }
  console.error(err.message);
}

module.exports = {
  ...config,
  config,
  validateConfig,
  getFeatureSummary,
  printConfig,
};
