# Development Guide

## Local Setup

### Prerequisites

- **Node.js >= 18** -- the backend uses ES2022 features (`??=`, top-level await in scripts, `structuredClone`)
- **Python 3.x** -- optional, only needed for the Capitol Trades scraper, price/dividend fetchers, and ML model training
- **Redis** -- optional, enables distributed rate limiting and shared session storage. Without it, both fall back to in-memory stores that work fine for single-process development

No database installation is needed for development. The backend automatically creates a SQLite file at `./data/stocks.db` on first run, and the database abstraction layer handles all SQL dialect differences between SQLite and PostgreSQL transparently.

### 1. Install Dependencies

```bash
# Backend (Express API + background jobs)
npm install

# Frontend (React 19 SPA)
cd frontend && npm install && cd ..

# Python services (optional -- data scrapers and ML models)
cd python-services && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys. The minimum viable configuration requires only one key:

| Variable | Required | What it unlocks |
|----------|----------|-----------------|
| `ALPHA_VANTAGE_KEY` | Yes | Stock prices, company fundamentals, technical indicators. Free tier: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) |
| `ANTHROPIC_API_KEY` | Recommended | AI analyst (PRISM reports), multi-turn chat, agent signal scoring. Budget-controlled via `LLM_DAILY_BUDGET` (default $10) and `LLM_MONTHLY_BUDGET` (default $50) |
| `FRED_API_KEY` | Recommended | 300+ macroeconomic indicators (GDP, CPI, yield curves, VIX) for the macro dashboard. Free: [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `FMP_API_KEY` | Optional | Earnings call transcripts, financial validation. Free tier: 250 calls/day |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth login. Without these, set `ALLOW_DEV_AUTH=true` for dev bypass |

See `.env.example` for the full list of 30+ configuration options including rate limits, Redis, Sentry, CORS origins, and scheduler settings.

### 3. Start Development Servers

```bash
# Terminal 1: Backend API with hot reload (port 3000)
npm run dev

# Terminal 2: React frontend with hot reload (port 3001)
cd frontend && npm start
```

The backend serves both the API (`/api/*`) and, in production, the built React frontend. During development, the React dev server proxies API requests to port 3000 so both servers can run independently with hot reload.

**Dev auth bypass**: With `ALLOW_DEV_AUTH=true` in your `.env`, all API requests are treated as an authenticated admin user. This skips OAuth setup entirely during local development. The bypass is automatically blocked on cloud platforms (Railway, Heroku, Fly, AWS, GCP, Azure) even if the env var is accidentally set.

### 4. Using Docker (Optional)

For a production-like environment with PostgreSQL 15 and Redis 7:

```bash
docker-compose up -d          # Start API, PostgreSQL, Redis, and scheduler
docker-compose logs -f api    # Follow API server logs
docker-compose down           # Stop all services
```

Docker Compose starts four services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `api` | Built from `Dockerfile` | 3001 | Express API server with built React frontend |
| `postgres` | `postgres:15-alpine` | 5432 | PostgreSQL with persistent named volume |
| `redis` | `redis:7-alpine` | 6379 | Session store, rate limiting, response cache (AOF persistence) |
| `scheduler` | Built from `Dockerfile` | -- | Background job runner (16 data bundles on cron schedules) |

The PostgreSQL container auto-creates the database from `scripts/init-db.sql` on first run. Health checks ensure the API server waits for both PostgreSQL and Redis to be ready before starting.

---

## Coding Conventions

### Database Access

All database access **must** use the async pattern. The database abstraction layer (`src/lib/db.js`) translates SQL between PostgreSQL and SQLite dialects at query time, so you write PostgreSQL-style SQL everywhere:

```javascript
const { getDatabaseAsync } = require('../lib/db');

async function getCompany(id) {
  const db = await getDatabaseAsync();
  const result = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
  return result.rows[0];
}
```

**Never use** `getDatabaseSync()`, `db.prepare()`, or `.get()/.all()/.run()` -- these are SQLite-only APIs that will fail in production. The linter and CI pipeline check for sync usage (`npm run check:sync-db`).

The abstraction layer handles these conversions automatically:

| You write (PostgreSQL) | Auto-converted to (SQLite) |
|------------------------|---------------------------|
| `$1, $2, $3` placeholders | `?, ?, ?` |
| `ON CONFLICT DO NOTHING` | `INSERT OR IGNORE` |
| `NOW()` | `datetime('now')` |
| `STRING_AGG(col, ',')` | `GROUP_CONCAT(col)` |
| `COALESCE(...)` | `IFNULL(...)` |
| `(col::jsonb)->>'key'` | `json_extract(col, '$.key')` |
| `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `BOOLEAN` | `INTEGER` (0/1) |

For cases where you need dialect-aware SQL generation (e.g., conditional types or date arithmetic), the `dialect` helper provides database-agnostic methods:

```javascript
const { dialect } = require('../lib/db');

// Date arithmetic that works on both databases
const sql = `SELECT * FROM prices WHERE date > ${dialect.dateSub('NOW()', '30 days')}`;

// Conditional types
const createTable = `CREATE TABLE foo (id ${dialect.autoIncrement}, data ${dialect.json})`;
```

### Route Handlers

Keep route handlers thin. They validate input, delegate to a service, and format the response. Business logic belongs in `src/services/`:

```javascript
// src/api/routes/companies.js -- thin route handler
router.get('/:id', async (req, res) => {
  const company = await companyService.getById(req.params.id);
  res.json({ data: company });
});

// src/services/companyService.js -- business logic, caching, database queries
```

All routes return consistent JSON structures:

```javascript
// Success: { data: ..., meta: { total, limit, offset } }
// Error:   { error: "message", code: "ERROR_CODE", details: [...] }
```

### Error Handling

Use the centralized error utilities from `src/middleware/errorHandler.js`. The `AppError` class carries structured error codes, HTTP status, and optional field-level details:

```javascript
const { errors } = require('../middleware/errorHandler');

// Structured errors with consistent codes
throw errors.notFound('Company not found');           // 404, NOT_FOUND
throw errors.badRequest('Invalid ticker symbol');     // 400, BAD_REQUEST
throw errors.unauthorized('Session expired');         // 401, UNAUTHORIZED
throw errors.forbidden('Admin access required');      // 403, FORBIDDEN
throw errors.rateLimit('Too many requests');          // 429, RATE_LIMITED
throw errors.validation([                             // 400, VALIDATION_ERROR
  { field: 'ticker', message: 'Required' },
  { field: 'period', message: 'Must be annual or quarterly' }
]);
```

In production, 5xx error messages are sanitized to `"An unexpected error occurred"` -- stack traces and internal details are never exposed to clients. Every error response includes a `correlationId` for request tracing.

### Input Validation

Use Joi schemas from `src/middleware/validation.js` for request validation. Common field validators are pre-built:

```javascript
const { validateBody, validateQuery, schemas } = require('../middleware/validation');

// Apply to routes
router.post('/', validateBody(schemas.createAgent), async (req, res) => { ... });
router.get('/', validateQuery(schemas.screeningQuery), async (req, res) => { ... });
```

Validation runs with `abortEarly: false` (reports all errors at once) and `stripUnknown: true` (silently removes unexpected fields).

### Logging

Use the structured logger (`src/lib/logger.js`) instead of `console.log`. The ESLint config warns on `console.log` usage:

```javascript
const logger = require('../lib/logger');

logger.info('Processing company', { ticker: 'AAPL' });
logger.warn('Rate limit approaching', { remaining: 5, endpoint: '/api/screening' });
logger.error('Database query failed', error, { query: sql, params });
```

### Frontend

See [docs/AGENTS.md](../AGENTS.md) for the complete frontend conventions. Key points:

- **Use the UI component library** from `frontend/src/components/ui/` -- Card, Button, Badge, Grid, Table, DataCard, PageHeader, Section, EmptyState, Typography, VirtualizedTable, and more. Never create ad-hoc styled containers.
- **Use CSS Custom Properties** from the design system for all values -- spacing (`var(--space-4)`), colors (`var(--text-primary)`, `var(--positive)`, `var(--negative)`), typography (`var(--text-sm)`), radii (`var(--radius-md)`), shadows (`var(--shadow-md)`). No hardcoded pixels, hex colors, or magic numbers.
- **No inline styles** -- use CSS classes with BEM-like naming (`.my-component`, `.my-component--variant`).
- **PropTypes required** on all components.
- **Glassmorphism** via `<Card variant="glass">` or `className="glass-card"` for the signature frosted-glass aesthetic.
- **Responsive**: mobile-first with breakpoints at 768px and 1024px.
- **CSS lint** before committing: `cd frontend && npm run lint:css` audits design system compliance.

---

## Testing

### Test Commands

```bash
npm test                          # Full Jest test suite
npm run test:watch                # Watch mode for TDD
npm run test:coverage             # Generate HTML + LCOV coverage report
npm run test:agent                # AI trading agent tests only
npm run test:updates              # Update orchestrator and bundle tests
npm run test:unified              # Unified strategy framework tests
npm run test:postgresql           # PostgreSQL integration tests (requires running PG)
npm run test:postgresql:verbose   # Verbose mode with DEBUG output
```

### Test Organization

```
tests/
├── api/                          # API route handler tests (mocked services)
├── services/                     # Service layer unit tests
├── middleware/                    # Middleware tests (auth, CSRF, rate limiting)
├── agent/                        # AI trading agent integration tests
├── integration/                  # Full integration tests (require database)
├── postgresql/                   # PostgreSQL-specific tests (dialect, migrations, concurrency)
├── unified-strategy/             # Strategy framework tests (signals, backtesting, execution)
└── setup.js                      # Global test setup (env vars, mocks, cleanup)
```

### Jest Configuration

Tests run with a 30-second timeout (some integration tests hit real databases). In CI, tests that require PostgreSQL or real database connections are excluded -- the CI pipeline spins up its own PostgreSQL service container and runs tests against it.

Coverage is collected for critical service modules: `agent/`, `trading/`, `backtesting/`, `factors/`, `updates/`, PRISM service, data fusion engine, and all API routes. Reports are generated in `text`, `lcov`, and `html` formats under `coverage/`.

### Frontend Tests

```bash
cd frontend
npm test                          # React component tests
npm run lint:css                  # CSS design system audit
```

---

## Database Migrations

### Overview

The schema is managed through 138+ sequential migration files in `src/database-migrations/`. Each migration exports an `up` function that receives the database abstraction layer and applies schema changes. The migration runner (`src/lib/migrationRunner.js`) tracks applied migrations in a `schema_migrations` table, ensuring each migration runs exactly once -- even across restarts or concurrent deployments.

### Creating a Migration

Add a new file following the naming convention `NNN-description.js`:

```javascript
// src/database-migrations/139-add-price-alerts.js
module.exports = {
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        company_id INTEGER NOT NULL REFERENCES companies(id),
        target_price DECIMAL(12, 2) NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
        is_triggered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id)
    `);
  }
};
```

Write PostgreSQL-compatible SQL -- the database abstraction layer auto-converts for SQLite in development. Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for idempotency.

### Running Migrations

```bash
npm run db:migrate          # Run all pending migrations
npm run db:migrate:status   # Show which migrations have been applied
npm run db:migrate:postgres # Run PostgreSQL-specific migrations directly
```

Migrations run automatically during production startup (`scripts/start-production.js`), so you never need to run them manually on Railway.

---

## Code Quality Tools

### Prettier

Code formatting is enforced via Prettier (`.prettierrc.json`): single quotes, trailing commas (ES5), 100-character line width, 2-space indentation, LF line endings.

```bash
npm run format              # Auto-format all backend source files
npm run format:check        # Check formatting without modifying (used in CI)
```

### ESLint

Linting uses `eslint:recommended` with project-specific rules (`.eslintrc.js`): `no-console` warns (allows `warn`/`error`), `eqeqeq` in smart mode, `prefer-const` and `no-var` enforced, async best practices (`require-await`, `no-async-promise-executor`).

```bash
npm run lint                # Check for lint issues
npm run lint:fix            # Auto-fix what's possible
```

### Pre-commit Hooks

Husky + lint-staged runs automatically on `git commit`. Staged `.js` files in `src/` are auto-formatted with Prettier and linted with ESLint. This means formatting happens gradually -- only files you touch get formatted, avoiding massive format-only diffs.

### Sync Database Usage Check

A custom check verifies that no code uses the deprecated synchronous database API:

```bash
npm run check:sync-db       # Fails if getDatabaseSync() or .prepare() found
npm run check:sync-db:warn  # Warns instead of failing (used in CI)
```

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start backend with hot reload (nodemon) |
| `npm test` | Run the full Jest test suite |
| `npm run test:coverage` | Run tests with HTML + LCOV coverage report |
| `npm run lint` | Check code style with ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Auto-format all source files with Prettier |
| `npm run db:migrate` | Run pending database migrations |
| `npm run db:migrate:status` | Show migration status |
| `npm run scheduler` | Start the master scheduler (16 data bundles) |
| `npm run price-update` | Trigger a one-off price update for all tracked companies |
| `npm run knowledge:refresh` | Refresh the AI knowledge base |
| `npm run health` | Check local server health (JSON) |
| `npm run health:detailed` | Detailed health report (DB, Redis, memory, CPU) |
| `npm run check:sync-db` | Verify no sync database usage exists |
