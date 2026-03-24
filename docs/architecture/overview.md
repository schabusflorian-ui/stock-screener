# Architecture Overview

## System Design

The Investment Research Platform is a full-stack application with four main components:

1. **Express API Server** -- RESTful backend serving 83 route modules
2. **React Frontend** -- Single-page application with 103 components
3. **Background Scheduler** -- Automated data updates and maintenance jobs
4. **Python Services** -- Specialized data fetchers and web scrapers

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
│         └────────────┬───────────────┘               │
│                      ▼                               │
│         ┌────────────────────────────┐               │
│         │      Service Layer         │               │
│         │  (src/services/*.js)       │               │
│         └────────────┬───────────────┘               │
│                      ▼                               │
│         ┌────────────────────────────┐               │
│         │   Database Abstraction     │               │
│         │      (src/lib/db.js)       │               │
│         └────────────┬───────────────┘               │
└──────────────────────┼───────────────────────────────┘
                       ▼
              PostgreSQL / SQLite
```

## Database Abstraction Layer

The system supports dual databases through `src/lib/db.js`:

- **Development**: SQLite via `better-sqlite3` (zero setup, local file)
- **Production**: PostgreSQL via `pg` with connection pooling

The abstraction layer automatically converts SQL dialects:
- `INSERT OR IGNORE` becomes `ON CONFLICT DO NOTHING`
- `GROUP_CONCAT()` becomes `STRING_AGG()`
- `datetime('now')` becomes `NOW()`
- `?` placeholders become `$1, $2` numbered params

All database access must use the async pattern:

```javascript
const { getDatabaseAsync } = require('../lib/db');
const db = await getDatabaseAsync();
const result = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
```

## Service Layer

Business logic is organized into 105 service modules in `src/services/`:

| Service Group | Purpose |
|--------------|---------|
| `services/agent/` | AI agent orchestration and tool execution |
| `services/ai/` | LLM integration, prompt management, cost controls |
| `services/backtesting/` | Strategy backtesting engine |
| `services/factors/` | Custom factor construction and analysis |
| `services/portfolio/` | Portfolio calculations and optimization |
| `services/trading/` | Order abstraction and paper trading |
| `services/nl/` | Natural language query processing |
| `services/updates/` | Data update orchestration |

## External Data Sources

| Source | Purpose | Integration |
|--------|---------|-------------|
| Alpha Vantage | Stock prices, technical indicators | REST API (`src/services/alphaVantage*.js`) |
| FRED | Macroeconomic indicators | REST API (`src/services/historicalMarketIndicators.js`) |
| SEC EDGAR | Company filings | REST API + XBRL parser |
| Financial Modeling Prep | Earnings transcripts, validation | REST API |
| Congressional Data | Congressional stock trades | Python scraper (`python-services/`) |
| Yahoo Finance | Supplementary price data | `yahoo-finance2` npm package |

## Authentication

- **Production**: Google OAuth 2.0 via Passport.js
- **Development**: Optional dev auth bypass (`ALLOW_DEV_AUTH=true`)
- **Sessions**: Redis (preferred) > PostgreSQL > SQLite (fallback chain)
- **Authorization**: Role-based (user, admin) with portfolio ownership checks

## Background Jobs

The master scheduler (`src/jobs/masterScheduler.js`) manages:
- Price updates (configurable intervals)
- Dividend data refresh
- Earnings calendar updates
- SEC filing checks
- Knowledge base refresh
- Data quality monitoring

## AI Integration

Claude API integration via `@anthropic-ai/sdk` with:
- Daily and monthly budget controls (`LLM_DAILY_BUDGET`, `LLM_MONTHLY_BUDGET`)
- Optional local LLM fallback via Ollama for simple tasks
- Structured analysis frameworks for stock evaluation
- Cost tracking per request
