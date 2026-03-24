# Architecture Overview

## System Design

The Investment Research Platform is a full-stack application composed of five cooperating subsystems:

1. **Express API Server** -- RESTful backend with 83 route modules, a layered middleware chain (Helmet, CORS, rate limiting, sessions, CSRF), and 105 service modules that encapsulate all business logic. Routes are intentionally thin -- they validate input, delegate to services, and format responses.

2. **React Frontend** -- Single-page application with 64 pages, 103 reusable UI components, and 12 React contexts for state management. The design system uses CSS Custom Properties for consistent theming without a CSS framework. Key pages include a macro-regime dashboard, multi-factor stock screener, quantitative workbench, AI analyst chat, and comprehensive company analysis views.

3. **Background Scheduler** -- Cron-based job system (`src/jobs/masterScheduler.js`) that orchestrates 16 data update bundles: prices, fundamentals, metrics, sentiment, alternative data, insiders, dividends, SEC filings, congressional trades, IPO pipeline, market indices, ETFs, European data, knowledge base, portfolio sync, and database maintenance. Each bundle runs on configurable intervals with retry logic and distributed locking.

4. **Python Services** -- Specialized data fetchers and ML models. The `python-services/` directory contains scrapers for congressional trading data (Capitol Trades), price feeds, fundamentals, dividends, and European market data. The `python/` directory contains ML models: LSTM for price prediction, XGBoost/LightGBM for factor scoring, a Temporal Fusion Transformer for multi-horizon forecasting, and a PPO reinforcement learning agent for portfolio optimization.

5. **Knowledge Base** -- A curated collection of 343 investor writings (Buffett shareholder letters 1977-2024, Howard Marks memos, Damodaran blog posts, a16z essays, Sequoia letters, and more) used by the AI analyst for retrieval-augmented generation. The AI references these works when generating analysis to ground recommendations in proven investment frameworks.

## Request Flow

```
Client Request
      │
      ▼
┌─────────────────────────────────────────────────────┐
│                   Express Server                     │
│                                                      │
│  Helmet ─▶ CORS ─▶ Rate Limiter ─▶ Session ─▶ CSRF │
│                                                      │
│         ┌────────────────────────────┐               │
│         │      Route Handler         │               │
│         │  (src/api/routes/*.js)     │               │
│         │  Input validation (Joi)    │               │
│         └────────────┬───────────────┘               │
│                      ▼                               │
│         ┌────────────────────────────┐               │
│         │      Service Layer         │               │
│         │  (src/services/*.js)       │               │
│         │  Business logic, caching   │               │
│         └────────────┬───────────────┘               │
│                      ▼                               │
│         ┌────────────────────────────┐               │
│         │   Database Abstraction     │               │
│         │      (src/lib/db.js)       │               │
│         │  SQL dialect translation   │               │
│         └────────────┬───────────────┘               │
└──────────────────────┼───────────────────────────────┘
                       ▼
              PostgreSQL / SQLite
```

### Middleware Chain

Each request passes through the following middleware in order:

1. **Helmet** -- Sets security headers (CSP, HSTS, X-Frame-Options, etc.)
2. **CORS** -- Configurable origin allowlist via `CORS_ORIGINS` env var
3. **Compression** -- gzip response compression
4. **Rate Limiter** -- Redis-backed distributed rate limiting with in-memory fallback. Default: 100 req/min globally, 10 req/min for auth endpoints, 30 req/min for heavy API operations. Returns `X-RateLimit-Remaining` and `Retry-After` headers.
5. **Session** -- Express sessions with a cascading store: Redis (preferred) > PostgreSQL > SQLite (fallback)
6. **CSRF** -- Token-based CSRF protection with httpOnly secure cookies. Exempts health checks, webhooks, and safe methods (GET, HEAD, OPTIONS).
7. **Authentication** -- Passport.js with Google OAuth 2.0 (production) or dev bypass (development). Supports `requireAuth`, `optionalAuth`, `requireAdmin`, and `requirePortfolioOwnership` middleware variants.

## Database Abstraction Layer

The system supports dual databases through `src/lib/db.js`, enabling zero-setup development with SQLite while running PostgreSQL in production:

- **Development**: SQLite via `better-sqlite3` (file at `./data/stocks.db`, auto-created)
- **Production**: PostgreSQL via `pg` with connection pooling (`DB_POOL_MIN`/`DB_POOL_MAX`)

The abstraction layer automatically converts SQL dialects at query time:

| PostgreSQL (write this) | SQLite (auto-converted) |
|------------------------|------------------------|
| `ON CONFLICT DO NOTHING` | `INSERT OR IGNORE` |
| `STRING_AGG()` | `GROUP_CONCAT()` |
| `NOW()` | `datetime('now')` |
| `$1, $2, $3` placeholders | `?, ?, ?` |
| `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `BOOLEAN` | `INTEGER` (0/1) |

All database access must use the async pattern:

```javascript
const { getDatabaseAsync } = require('../lib/db');
const db = await getDatabaseAsync();
const result = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
```

Never use `getDatabaseSync()`, `db.prepare()`, or `.get()/.all()/.run()` -- these are SQLite-only APIs that will fail in production.

## Service Layer

Business logic is organized into 105 service modules in `src/services/`, grouped by domain:

| Service Group | Modules | Purpose |
|--------------|---------|---------|
| `services/agent/` | tradingAgent, agentService, signalOptimizer, riskManager, orchestrator, autoExecutor, recommendationTracker | Multi-signal trading agent engine with 9 signal categories, regime-adaptive weights, paper trading, and risk constraints |
| `services/ai/` | analystService, promptManager, costTracker | Claude API integration with structured analysis frameworks (PRISM reports), multi-turn conversations, and budget controls |
| `services/backtesting/` | factorBacktestEngine, portfolioBacktester | Historical strategy backtesting with walk-forward analysis, slippage modeling, and benchmark comparison |
| `services/factors/` | factorService, factorSignalGenerator, factorExposure, factorWalkForwardAdapter | Custom factor construction, IC calculation, signal decay tracking, and sector-relative scoring |
| `services/portfolio/` | portfolioService, portfolioOptimizer, attributionService | Portfolio CRUD, mean-variance optimization, performance attribution, and tax-aware returns |
| `services/signals/` | valueSignals, congressionalTradingSignals | Piotroski F-Score (0-9 financial quality), Altman Z-Score (bankruptcy risk), contrarian signals, congressional trade pattern detection |
| `services/alternativeData/` | finraShortInterest, quiverQuantitative, alternativeDataAggregator | FINRA short interest, options flow, institutional holding changes, aggregated alternative signal scoring |
| `services/updates/` | updateOrchestrator | Central coordinator for 16 scheduled data bundles with job dependency management, distributed locking, and automatic crash recovery |
| `services/nl/` | nlQueryService | Natural language query processing -- translates plain-English questions into database lookups and metric calculations |

## External Data Sources

| Source | Data | Integration | Update Frequency |
|--------|------|-------------|-----------------|
| Alpha Vantage | Stock prices, technical indicators, company fundamentals | REST API via `src/services/alphaVantage*.js` | Daily (prices), quarterly (fundamentals) |
| FRED | 300+ macroeconomic indicators (GDP, CPI, unemployment, yield curves) | REST API via `src/services/historicalMarketIndicators.js` | Daily |
| SEC EDGAR | 10-K, 10-Q, 8-K filings; 13F institutional holdings | REST API + XBRL parser | Quarterly (filings), on-demand (forms) |
| Yahoo Finance | Supplementary price data, company profiles | `yahoo-finance2` npm package | Daily |
| Capitol Trades | Congressional stock transactions | Python scraper (`python-services/`) | Daily |
| FINRA | Short interest data | Python scraper | Bi-weekly |
| Financial Modeling Prep | Earnings transcripts, financial validation | REST API | On earnings dates |

## Authentication & Authorization

- **Production**: Google OAuth 2.0 via Passport.js with session persistence
- **Development**: Optional auth bypass (`ALLOW_DEV_AUTH=true`) for local development without OAuth setup
- **Admin access**: Determined by `ADMIN_EMAILS` env var or `is_admin` database flag. Supports `X-Admin-Bypass` header when `ALLOW_ADMIN_BYPASS=true`.
- **Sessions**: Cascading store selection -- Redis (preferred for distributed environments) > PostgreSQL > SQLite (local fallback)
- **Authorization**: Role-based (user, admin) with portfolio ownership checks via `requirePortfolioOwnership` middleware

## Background Jobs

The master scheduler (`src/jobs/masterScheduler.js`) manages 16 data update bundles on configurable cron schedules:

| Bundle | Schedule | Description |
|--------|----------|-------------|
| Prices | Every 15 min (market hours) | Stock prices, volume, day change |
| Fundamentals | Weekly | 10-K/10-Q financials, quarterly data |
| Metrics | After fundamentals | Calculated ratios (ROIC, FCF yield, margins) |
| Sentiment | Every 4 hours | News + social sentiment aggregation |
| Alternative Data | Daily | Congressional trades, short interest, options flow |
| Insiders | Daily | Form 4 insider transactions |
| Dividends | Daily | Dividend announcements, ex-dates, yield calculations |
| SEC Filings | Daily | New 10-K, 10-Q, 8-K, 13F filings |
| Earnings | Daily | Earnings calendar, transcript ingestion |
| Market | Every 15 min | Index prices, market indicators |
| ETFs | Daily | ETF composition and flows |
| IPO Pipeline | Weekly | Upcoming IPO tracking |
| EU Data | Weekly | European company data enrichment |
| Knowledge | Monthly | Refresh investor writings and mental models |
| Portfolio Sync | Hourly | User portfolio position syncing |
| Maintenance | Weekly | Database optimization, stale data cleanup |

## AI Integration

Claude API integration via `@anthropic-ai/sdk` with:

- **Budget controls**: Configurable daily (`LLM_DAILY_BUDGET`, default $10) and monthly (`LLM_MONTHLY_BUDGET`, default $50) spend limits with per-request cost tracking in the `llm_usage_tracking` table
- **PRISM reports**: Structured analysis scorecards evaluating profitability, risk, intrinsic value, sustainability, and management
- **Multi-turn chat**: Persistent conversation context with company data injection
- **Knowledge base RAG**: Retrieval-augmented generation referencing curated investor writings
- **Agent signals**: AI-powered signal scoring for the trading agent pipeline
- **Optional Ollama fallback**: Local LLM for simple tasks to reduce API costs (`OLLAMA_URL`, `LLM_PREFER_LOCAL`)
