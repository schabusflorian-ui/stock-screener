# Deployment Guide

This document covers deploying the Investment Project to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Railway)](#quick-start-railway)
3. [Database Migration](#database-migration)
4. [Docker Deployment](#docker-deployment)
5. [Environment Configuration](#environment-configuration)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Monitoring & Health Checks](#monitoring--health-checks)
8. [Database Backups](#database-backups)
9. [Production Checklist](#production-checklist)

---

## Prerequisites

- Node.js 18+ or 20+
- PostgreSQL 15+ (for production)
- Redis (optional, for sessions)
- Docker (optional, for containerized deployment)

---

## Quick Start (Railway)

The fastest way to deploy to production:

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login to Railway
railway login

# 3. Create a new project
railway init

# 4. Add PostgreSQL database
railway add postgresql

# 5. Add Redis (optional)
railway add redis

# 6. Set environment variables
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
railway variables set ALPHA_VANTAGE_KEY=your_key
railway variables set ANTHROPIC_API_KEY=your_key

# 7. Deploy
railway up

# 8. Get your public URL
railway domain
```

---

## Database Migration

### SQLite → PostgreSQL Migration

When moving from development (SQLite) to production (PostgreSQL):

```bash
# 1. Ensure DATABASE_URL points to your PostgreSQL instance
export DATABASE_URL=postgresql://user:password@host:5432/dbname

# 2. Run the migration script
npm run db:migrate:postgres
```

The migration script will:
- Create all tables in PostgreSQL
- Transfer data from SQLite
- Reset auto-increment sequences

### Running Schema Migrations

For ongoing schema changes:

```bash
# Check migration status
npm run db:migrate:status

# Run pending migrations
npm run db:migrate
```

---

## Docker Deployment

### Build and Run Locally

```bash
# Build image
npm run docker:build

# Run with environment file
npm run docker:run
```

### Docker Compose (Full Stack)

Start PostgreSQL, Redis, and the application:

```bash
# Start all services
npm run docker:compose:up

# View logs
npm run docker:compose:logs

# Stop all services
npm run docker:compose:down
```

### Docker Compose Configuration

The `docker-compose.yml` includes:
- **api**: Main application server
- **postgres**: PostgreSQL database
- **redis**: Redis for sessions/caching
- **scheduler**: Background job processor

---

## Environment Configuration

### Required Variables (Production)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 32+ character secret for sessions |
| `ALPHA_VANTAGE_KEY` | Stock data API key |

### Recommended Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection for sessions |
| `SENTRY_DSN` | Error tracking |
| `ANTHROPIC_API_KEY` | AI analysis features |

### Generate Secrets

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment Files

- `.env` - Local development
- `.env.production` - Production settings
- `.env.example` - Template with all options

---

## CI/CD Pipeline

### GitHub Actions Workflows

Two workflows are configured:

1. **CI (`ci.yml`)** - Runs on every PR
   - Linting
   - Unit tests
   - Build verification
   - Docker build test
   - Security audit

2. **Deploy (`deploy.yml`)** - Runs on merge to main
   - Runs tests
   - Deploys to staging
   - (Manual trigger) Deploys to production

### Setting Up CI/CD

1. **Add GitHub Secrets:**
   ```
   RAILWAY_TOKEN       - Railway API token
   DATABASE_URL        - Production database URL
   SENTRY_DSN          - Sentry DSN (optional)
   SLACK_WEBHOOK       - Slack notifications (optional)
   ```

2. **Configure Environments:**
   - Go to Settings → Environments
   - Create `staging` and `production` environments
   - Add environment-specific secrets

---

## Monitoring & Health Checks

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/health` | Basic health (load balancers) |
| `/api/health/live` | Liveness probe (K8s) |
| `/api/health/ready` | Readiness probe (K8s) |
| `/api/health/detailed` | Full system status |
| `/metrics` | Prometheus metrics |

### Check Health

```bash
# Basic health
npm run health

# Detailed health
npm run health:detailed
```

### Sentry Error Tracking

1. Create account at [sentry.io](https://sentry.io)
2. Create a Node.js project
3. Add `SENTRY_DSN` to environment variables

---

## Database Backups

### Manual Backup

```bash
# Set DATABASE_URL
export DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Run backup
npm run db:backup
```

### Backup to S3

```bash
export DATABASE_URL=postgresql://...
export S3_BUCKET=your-backup-bucket
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret

npm run db:backup
```

### Automated Backups (GitHub Actions)

The deploy workflow includes automatic backups before production deployments.

---

## Production Checklist

### Security

- [ ] `SESSION_SECRET` is a secure random string (32+ chars)
- [ ] All API keys are set as environment variables
- [ ] HTTPS is enforced
- [ ] CORS is configured for your domain
- [ ] Rate limiting is enabled

### Database

- [ ] PostgreSQL is configured (not SQLite)
- [ ] Connection pooling is enabled
- [ ] Automated backups are configured
- [ ] SSL is enabled for database connections

### Monitoring

- [ ] Sentry is configured for error tracking
- [ ] Health check endpoint is accessible
- [ ] Uptime monitoring is configured
- [ ] Log aggregation is set up

### Performance

- [ ] Gzip compression is enabled
- [ ] Static assets are served from CDN
- [ ] Database indexes are in place
- [ ] Caching is configured

### Operations

- [ ] CI/CD pipeline is working
- [ ] Rollback procedure is documented
- [ ] On-call alerts are configured
- [ ] Staging environment mirrors production

---

## Troubleshooting

### Common Issues

**Database connection errors:**
```bash
# Check DATABASE_URL format
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

**Session issues:**
```bash
# Ensure SESSION_SECRET is set
echo $SESSION_SECRET
```

**Port conflicts:**
```bash
# Check if port 3000 is in use
lsof -i :3000
```

### Logs

```bash
# Docker logs
docker-compose logs -f api

# Railway logs
railway logs
```

### Support

For issues, open a GitHub issue or check the documentation.
