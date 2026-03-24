# Deployment Guide

## Railway (Primary Platform)

The application is production-deployed on [Railway](https://railway.app), a PaaS that auto-builds and deploys from GitHub pushes. Railway uses Nixpacks to detect the runtime (Node.js + Python) and builds the application in a single container with both ecosystems available.

### Build Configuration

The build is configured via `nixpacks.toml`:

```toml
[phases.setup]
aptPkgs = ["curl", "python3", "python3-pip", "postgresql-client"]

[phases.python_deps]
cmds = ["pip3 install requests beautifulsoup4 sentence-transformers psycopg2-binary",
        "pip3 install -r python-services/requirements.txt"]

[phases.build]
cmds = ["cd frontend && npm ci --legacy-peer-deps && CI=false npm run build"]

[start]
cmd = "npm run start:production"
```

The build installs Node.js and Python dependencies, then builds the React frontend into static files that the Express server serves in production. `CI=false` prevents React from treating warnings as build errors. `GENERATE_SOURCEMAP=false` and `NODE_OPTIONS=--max-old-space-size=4096` prevent OOM crashes during the React build on Railway's build containers.

### Deployment Settings

Railway's deployment behavior is configured in `railway.toml`:

```toml
[deploy]
startCommand = "npm run start:production"
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
numReplicas = 1
```

Railway monitors the `/health` endpoint after each deploy. If the health check fails within 60 seconds, the deploy is rolled back. On runtime crashes, Railway automatically restarts the container up to 3 times before marking it as failed.

### Environment Variables

Set these in the Railway dashboard (Settings > Variables):

**Required** -- the application will not start without these:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string. Railway auto-populates this when you add the PostgreSQL add-on. Must start with `postgres://` |
| `SESSION_SECRET` | Cryptographic secret for signing session cookies. Must be at least 32 characters. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALPHA_VANTAGE_KEY` | API key for stock prices, fundamentals, and technical indicators. Free tier available at [alphavantage.co](https://www.alphavantage.co/support/#api-key) |
| `NODE_ENV` | Set to `production`. Controls security hardening, error sanitization, and performance optimizations |
| `APP_URL` | The public URL of your Railway deployment (e.g., `https://your-app.up.railway.app`). Used for OAuth callback URLs and CORS origin configuration |

**Recommended** -- enables major features:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Enables Claude-powered AI analysis: PRISM reports, multi-turn analyst chat, agent signal scoring, and knowledge-base-augmented generation |
| `FRED_API_KEY` | Enables 300+ macroeconomic indicators (GDP, CPI, unemployment, yield curves, VIX) for the macro regime dashboard. Free at [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `REDIS_URL` | Redis connection string. Railway auto-populates when you add the Redis add-on. Enables distributed rate limiting, shared session storage across restarts, and response caching. Without Redis, these fall back to in-memory stores (adequate for single-replica deployments) |
| `FMP_API_KEY` | Enables earnings call transcript ingestion and financial data validation. Free tier: 250 API calls/day |
| `SENTRY_DSN` | Enables error tracking and performance monitoring via Sentry |

**Optional** -- additional features and configuration:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID for user authentication. Without OAuth, set `ADMIN_EMAILS` and use the admin bypass |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `ADMIN_EMAILS` | Comma-separated list of email addresses with admin access (e.g., `admin@example.com,dev@example.com`) |
| `CORS_ORIGINS` | Comma-separated allowed origins for CORS. Defaults to `APP_URL` if not set |
| `LLM_DAILY_BUDGET` | Maximum AI API spend per day in USD (default: `10`). Tracked in `llm_usage_tracking` table |
| `LLM_MONTHLY_BUDGET` | Maximum AI API spend per month in USD (default: `50`) |
| `DB_POOL_MIN` | Minimum PostgreSQL connection pool size (default: `2`) |
| `DB_POOL_MAX` | Maximum PostgreSQL connection pool size (default: `20`) |
| `RATE_LIMIT_MAX_REQUESTS` | Global rate limit per minute per IP (default: `100`) |
| `START_SCHEDULER` | Set to `false` to disable the background scheduler on startup. Useful for maintenance deploys |

**Blocked in production** -- the startup script exits with an error if these are set:

| Variable | Why it's blocked |
|----------|-----------------|
| `ALLOW_DEV_AUTH` | Dev auth bypass must never be active in production -- it grants admin access to all requests without authentication |
| `FORCE_HTTP1` | HTTP/2 should be used in production for performance |

### Production Startup Sequence

The `npm run start:production` command runs `scripts/start-production.js`, which executes a strict startup sequence:

1. **Environment validation** -- verifies `DATABASE_URL` is present and starts with `postgres`, `SESSION_SECRET` is at least 32 characters, and no blocked variables (`ALLOW_DEV_AUTH`, `FORCE_HTTP1`) are set. If `SESSION_SECRET` is missing, it auto-generates one with a prominent warning (sessions won't persist across redeploys).

2. **Syntax check** -- runs `node -c src/api/server.js` to catch parse errors before any real startup, avoiding cryptic runtime failures.

3. **Database migrations** -- runs all pending migrations against PostgreSQL synchronously. If any migration fails, the startup aborts with exit code 1, preventing the application from running against an inconsistent schema.

4. **Outcome backfill** -- spawns a background process to calculate historical recommendation outcomes (`scripts/run-calculate-outcomes.js`). This pre-populates the Historical Intelligence feature with return data. Non-fatal: the server starts regardless of whether this completes.

5. **Application start** -- spawns the master scheduler (`src/jobs/masterScheduler.js`) and the Express API server (`src/api/server.js`) as child processes. The scheduler manages 16 data update bundles on cron schedules (prices every 15 minutes during market hours, fundamentals weekly, sentiment every 4 hours, etc.).

6. **Graceful shutdown** -- listens for `SIGINT`, `SIGTERM`, and `SIGQUIT`. On any shutdown signal, it forwards the signal to both child processes (scheduler and API server) and waits for the API server to exit before terminating the parent process. This ensures in-flight requests complete and database connections are closed cleanly.

### Railway Add-ons

The application benefits from two Railway add-ons:

- **PostgreSQL** -- primary data store. Railway automatically sets `DATABASE_URL`. The connection pool defaults to 2-20 connections with 30-second idle timeout and 10-second connection timeout. SSL is enabled automatically in production.
- **Redis** -- shared session store, distributed rate limiter, and response cache. Railway automatically sets `REDIS_URL`. Without Redis, the application falls back to in-memory stores.

---

## Docker

### Standalone Build

```bash
# Build the Docker image
docker build -t investment-project .

# Run with environment variables from .env
docker run -p 3000:3000 --env-file .env investment-project
```

The Dockerfile is a multi-stage build: it installs Node.js and Python dependencies, builds the React frontend, and produces a production-ready image.

### Docker Compose (Full Stack)

Docker Compose starts the complete application stack with persistent storage:

```bash
docker-compose up -d          # Start all services in background
docker-compose logs -f api    # Follow API server logs
docker-compose logs -f        # Follow all service logs
docker-compose down           # Stop all services (data persists in named volumes)
docker-compose down -v        # Stop all services and delete data volumes
```

### Services

| Service | Image | Port | Health Check |
|---------|-------|------|-------------|
| `api` | Built from `Dockerfile` | `${PORT:-3001}` | `curl -f http://localhost:3001/api/health` every 30s |
| `postgres` | `postgres:15-alpine` | `${POSTGRES_PORT:-5432}` | `pg_isready -U postgres` every 10s |
| `redis` | `redis:7-alpine` | `${REDIS_PORT:-6379}` | `redis-cli ping` every 10s |
| `scheduler` | Built from `Dockerfile` | none | none (background worker) |

### Volumes

- `postgres_data` -- PostgreSQL data directory. Persists across `docker-compose down` (deleted only with `-v` flag)
- `redis_data` -- Redis AOF persistence. The `redis-server --appendonly yes` flag ensures data survives container restarts
- `./data:/app/data` -- Mounted on both `api` and `scheduler` for shared SQLite fallback access and backups

### Environment

Docker Compose pre-configures inter-service networking. The API server connects to PostgreSQL at `postgresql://postgres:postgres@postgres:5432/investment` and Redis at `redis://redis:6379` via Docker's internal DNS. You only need to provide external API keys:

```bash
# Copy .env.example and add your API keys
cp .env.example .env
# Edit .env: ALPHA_VANTAGE_KEY, ANTHROPIC_API_KEY, etc.
docker-compose up -d
```

---

## CI/CD Pipeline

GitHub Actions workflows are defined in `.github/workflows/`:

### Continuous Integration (`ci.yml`)

Runs on every push and pull request to `main` and `develop`. Uses Node.js 20.

| Job | What it does |
|-----|-------------|
| **lint** | Runs ESLint, Prettier format check, and sync database usage check. All steps use `continue-on-error: true` -- formatting violations warn but don't block merges (allowing gradual adoption) |
| **test** | Spins up a PostgreSQL 15 service container, runs the full Jest suite against it, and uploads coverage to Codecov in LCOV format |
| **build** | Installs dependencies and runs `npm run build` to verify both backend and React frontend compile without errors |
| **docker** | Builds the Docker image (without pushing) to verify the Dockerfile is valid. Uses GitHub Actions cache for layer reuse |
| **security** | Runs `npm audit --audit-level=high` to check for known vulnerabilities. Optionally runs Snyk if `SNYK_TOKEN` is configured |

### Deployment (`deploy.yml`)

Triggers on push to `main` or `railway-deploy-clean`, or manually via `workflow_dispatch` with environment selection (`staging` or `production`).

| Job | Trigger | What it does |
|-----|---------|-------------|
| **deploy-staging** | Push to `main` | Deploys to Railway staging environment. Optionally notifies Slack if `SLACK_WEBHOOK` is configured |
| **deploy-production** | Manual only | Requires explicit `workflow_dispatch` trigger. Deploys to Railway production after manual migration verification |
| **backup** | Manual (production deploys) | Runs `pg_dump` against the production database, compresses the output, and optionally uploads to S3 |

### Manual Migrations (`migrate.yml`)

Triggered only via `workflow_dispatch`. Accepts an `environment` input (`staging` or `production`). Runs `npm run db:migrate:postgres` using the `DATABASE_URL` from the selected GitHub environment's secrets. Use this when you need to run migrations independently of a deploy.

---

## Health Checks

The application exposes multiple health check endpoints at different levels of detail:

| Endpoint | Purpose | Authentication |
|----------|---------|---------------|
| `GET /health` | Liveness probe. Returns `{ status: "ok" }`. Bypasses all middleware (auth, CSRF, rate limiting). Used by Railway's healthcheck configuration |
| `GET /api/health` | API health check with database connectivity verification |
| `GET /api/health/detailed` | Full system report: database type and query latency, Redis connectivity and latency, memory usage (heap, RSS, external), CPU (cores, load averages), OS info, Node.js version. Requires authentication |
| `GET /health/ready` | Readiness probe. Runs `SELECT 1` against the database. Returns 503 if the database is unreachable |
| `GET /metrics` | Prometheus-compatible plaintext metrics: `process_uptime_seconds`, `process_memory_heap_bytes`, `process_memory_rss_bytes`, `nodejs_version_info` |

Quick health check from the command line:

```bash
npm run health              # Basic JSON health check
npm run health:detailed     # Full system status with DB, Redis, memory, CPU stats
```

---

## Monitoring

### Error Tracking

If `SENTRY_DSN` is configured, the application reports unhandled exceptions and unhandled promise rejections to Sentry with a configurable trace sample rate (default: 10% of transactions). All 5xx errors from the error handler middleware are captured automatically.

### AI Cost Tracking

Every Claude API call is logged to the `llm_usage_tracking` table with model name, input/output token counts, estimated cost in USD, and the endpoint that triggered it. The `LLM_DAILY_BUDGET` and `LLM_MONTHLY_BUDGET` environment variables set hard spend limits -- once reached, AI endpoints return 429 until the budget resets.

### Data Freshness

The `data_freshness` table tracks the last successful update for each of the 16 data bundles. The `GET /api/health/detailed` endpoint includes a data freshness summary, and the update orchestrator marks bundles as stale when they exceed their expected update interval.

---

## Troubleshooting

### Common Issues

**Server won't start on Railway:**
- Check the deploy logs for environment validation errors. The startup script provides specific error messages for missing or invalid variables.
- Verify `DATABASE_URL` is set (Railway should auto-populate it when you add the PostgreSQL add-on).
- Make sure `ALLOW_DEV_AUTH` is NOT set in production variables.

**Migrations fail:**
- Check if the PostgreSQL add-on is healthy in the Railway dashboard.
- Run `npm run db:migrate:status` locally with `DATABASE_URL` pointing to the production database to see which migrations have been applied.
- Individual migration files can be re-run safely -- they use `IF NOT EXISTS` guards.

**OAuth login not working:**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set correctly.
- The OAuth callback URL must match `APP_URL/api/auth/google/callback` exactly in the Google Cloud Console.
- In development, use `ALLOW_DEV_AUTH=true` to bypass OAuth entirely.

**AI features returning 429:**
- The LLM budget limit has been reached. Check current usage via `GET /api/health/detailed`.
- Increase `LLM_DAILY_BUDGET` or `LLM_MONTHLY_BUDGET` in environment variables, or wait for the budget to reset.

**Stale data / scheduler not running:**
- Check `GET /api/health/detailed` for data freshness per bundle.
- Verify `START_SCHEDULER` is not set to `false`.
- The scheduler logs to stdout -- check Railway logs or `docker-compose logs scheduler`.
