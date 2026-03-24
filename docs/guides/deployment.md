# Deployment Guide

## Railway (Primary)

The application is configured for Railway with the following files:
- `nixpacks.toml` -- Build configuration (Node.js + Python)
- `railway.toml` -- Deployment settings (healthcheck, restart policy)
- `railway.json` -- Schema configuration
- `scripts/start-production.js` -- Production startup orchestrator

### Environment Variables

Set these in your Railway dashboard:

**Required:**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Railway provides this) |
| `SESSION_SECRET` | 32+ character random string |
| `ALPHA_VANTAGE_KEY` | Stock data API key |

**Recommended:**
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (enables AI features) |
| `FRED_API_KEY` | Federal Reserve economic data |
| `REDIS_URL` | Redis connection (Railway add-on) |
| `SENTRY_DSN` | Error tracking |

**Optional:**
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ADMIN_EMAILS` | Comma-separated admin email list |
| `APP_URL` | Public application URL |
| `LLM_DAILY_BUDGET` | AI spend limit per day (default: $10) |
| `LLM_MONTHLY_BUDGET` | AI spend limit per month (default: $50) |

### Production Startup

The `npm run start:production` command runs `scripts/start-production.js`, which:

1. Validates environment variables
2. Runs syntax check on server entry point
3. Executes pending database migrations
4. Starts outcome calculation backfill (background)
5. Starts the master scheduler (background)
6. Starts the Express API server (main process)
7. Handles graceful shutdown on SIGTERM/SIGINT

### Health Check

Railway monitors the `/health` endpoint. The healthcheck is configured in `railway.toml`:

```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

## Docker

### Build and Run

```bash
# Build
docker build -t investment-project .

# Run standalone
docker run -p 3000:3000 --env-file .env investment-project
```

### Docker Compose (Full Stack)

```bash
docker-compose up -d          # Start all services
docker-compose logs -f api    # Follow API logs
docker-compose down           # Stop all services
```

Services started by docker-compose:
- **api** -- Express server (port 3001)
- **postgres** -- PostgreSQL 15 (port 5432)
- **redis** -- Redis 7 (port 6379)
- **scheduler** -- Background job runner

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to main:

1. **Lint** -- ESLint and sync database usage checks
2. **Test** -- Jest tests with PostgreSQL service container
3. **Build** -- Backend and frontend build verification
4. **Docker** -- Dockerfile build check
5. **Security** -- `npm audit` and optional Snyk scan

## Generate a Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
