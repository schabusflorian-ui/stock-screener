# Deployment Checklist

Follow these steps when you're ready to deploy to production.

---

## Pre-Generated Secrets

Save these somewhere secure (password manager):

```
SESSION_SECRET=b1824df1ef47ff3fcef403b6ba98ea38073c8185083a3db89899caee2396afda
```

---

## Option A: Deploy to Railway (Recommended)

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended for CI/CD integration)

### Step 2: Install Railway CLI
```bash
npm i -g @railway/cli
```

### Step 3: Login and Create Project
```bash
railway login
railway init
```

### Step 4: Add PostgreSQL Database
```bash
railway add postgresql
```
This will automatically set `DATABASE_URL` in your project.

### Step 5: Add Redis (Optional but recommended)
```bash
railway add redis
```
This will automatically set `REDIS_URL`.

### Step 6: Set Environment Variables
In Railway dashboard (or CLI):
```bash
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=b1824df1ef47ff3fcef403b6ba98ea38073c8185083a3db89899caee2396afda
railway variables set ALPHA_VANTAGE_KEY=<your_key>
railway variables set ANTHROPIC_API_KEY=<your_key>
railway variables set FRONTEND_URL=https://your-app.railway.app
```

### Step 7: Deploy
```bash
railway up
```

### Step 8: Get Your URL
```bash
railway domain
```

### Step 9: Migrate Your Data (Optional)
If you want to transfer your SQLite data to PostgreSQL:
```bash
# Get the DATABASE_URL from Railway
railway variables

# Run migration locally
DATABASE_URL=<railway_database_url> npm run db:migrate:postgres
```

### Step 10: Populate Company Data (Compare page, screening, etc.)
The Compare page and many features require company data. If `/api/companies/BAC` returns 404, the companies table is empty.

**Option A – Sync from local SQLite (recommended):**
```bash
# Get DATABASE_URL from Railway
railway variables

# Sync data into existing Postgres tables (companies, daily_prices, etc.)
DATABASE_URL=postgresql://... npm run db:sync-data
# Or: DATABASE_URL=postgresql://... node scripts/migrate-to-postgres.js --data-only
```

Requires local SQLite at `./data/stocks.db` or `./database.sqlite` with company data. Uses column intersection so schema differences between SQLite and Postgres are handled.

**Option B – Full migration (fresh Postgres):**
```bash
DATABASE_URL=postgresql://... node scripts/migrate-to-postgres.js
```
Creates tables and migrates all data. Use when Postgres is empty.

---

## Option B: Deploy to Vercel + Supabase

### Step 1: Create Accounts
1. [Vercel](https://vercel.com) - Sign up with GitHub
2. [Supabase](https://supabase.com) - Create free account

### Step 2: Create Supabase Database
1. Create new project in Supabase
2. Go to Settings → Database
3. Copy the connection string (use "Connection pooling" URL)

### Step 3: Install Vercel CLI
```bash
npm i -g vercel
```

### Step 4: Deploy
```bash
vercel
```

### Step 5: Set Environment Variables
In Vercel dashboard:
- `DATABASE_URL` = Supabase connection string
- `SESSION_SECRET` = (use the pre-generated one above)
- `NODE_ENV` = production
- `ALPHA_VANTAGE_KEY` = your key
- etc.

---

## Environment Variables Reference

### Required
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection | Railway/Supabase provides this |
| `SESSION_SECRET` | Session encryption | Use pre-generated above |
| `ALPHA_VANTAGE_KEY` | Stock data API | Your existing key from .env |

### Recommended
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `REDIS_URL` | Session store | Railway provides this |
| `ANTHROPIC_API_KEY` | AI features | Your existing key from .env |
| `SENTRY_DSN` | Error tracking | Create free account at sentry.io |
| `FRONTEND_URL` | CORS config | Your deployed URL |

### Optional
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth login |
| `GOOGLE_CLIENT_SECRET` | OAuth login |
| `FRED_API_KEY` | Macro data |
| `COMPANIES_HOUSE_API_KEY` | UK company data |

---

## Post-Deployment Steps

### 1. Verify Health
```bash
curl https://your-app.railway.app/api/health
```

### 2. Check Detailed Health
```bash
curl https://your-app.railway.app/api/health/detailed
```

### 3. Set Up Sentry (Optional but recommended)
1. Create account at [sentry.io](https://sentry.io)
2. Create a Node.js project
3. Copy the DSN
4. Add `SENTRY_DSN` environment variable

### 4. Set Up Custom Domain (Optional)
In Railway dashboard:
1. Go to Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

---

## GitHub Actions CI/CD (Optional)

To enable automatic deployments on push to main:

### Add GitHub Secrets
Go to your repo → Settings → Secrets → Actions, add:
- `RAILWAY_TOKEN` - Get from Railway dashboard → Account → Tokens

### The workflows will:
- Run tests on every PR
- Auto-deploy to staging on merge to main
- Manual trigger for production deployment

---

## Estimated Costs

| Service | Free Tier | When You Pay |
|---------|-----------|--------------|
| Railway | $5/month credit | Usage above $5 |
| Supabase | 500MB database | Above limits |
| Vercel | Generous | Above limits |
| Sentry | 5k errors/month | Above limits |

**Typical monthly cost: $5-20 for hobby/small production use**

---

## Quick Reference Commands

```bash
# Check if server starts locally with production config
NODE_ENV=production npm start

# Run database migrations
npm run db:migrate

# Check migration status
npm run db:migrate:status

# Backup database (need DATABASE_URL set)
npm run db:backup

# Health check
npm run health
```

---

## Troubleshooting

### "Database connection failed"
- Check DATABASE_URL is set correctly
- For Railway: `railway variables` to see all vars
- Ensure SSL is enabled: `?sslmode=require` at end of URL

### "Session errors"
- Ensure SESSION_SECRET is set (min 32 chars)
- Check REDIS_URL if using Redis sessions

### "CORS errors"
- Set FRONTEND_URL to your actual frontend URL
- Add CORS_ORIGINS if multiple domains

---

## Files Created for Deployment

```
├── Dockerfile                 # Docker image build
├── docker-compose.yml         # Local full-stack testing
├── railway.json               # Railway config
├── railway.toml               # Railway config (alt)
├── .dockerignore              # Docker exclusions
├── .github/workflows/
│   ├── ci.yml                 # CI pipeline
│   └── deploy.yml             # Deploy pipeline
├── src/
│   ├── config/index.js        # Centralized config
│   ├── lib/
│   │   ├── db.js              # Database abstraction
│   │   ├── gracefulShutdown.js
│   │   ├── migrationRunner.js
│   │   └── sentry.js
│   └── middleware/
│       ├── healthCheck.js     # Health endpoints
│       └── rateLimiter.js     # Rate limiting
├── scripts/
│   ├── migrate-to-postgres.js # Data migration
│   ├── backup-db.sh           # DB backup
│   └── init-db.sql            # PostgreSQL schema
├── .env.example               # Env template
├── .env.production.example    # Production template
└── DEPLOYMENT.md              # Full documentation
```
