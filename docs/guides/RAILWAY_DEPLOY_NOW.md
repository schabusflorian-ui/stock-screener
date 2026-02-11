# Deploy to Railway — Quick Steps

## Before you deploy

1. **Railway project**  
   Create a project at [railway.app](https://railway.app) (or use an existing one).

2. **Add PostgreSQL and Redis**  
   In the project: **New → Database → PostgreSQL** and **New → Database → Redis**.  
   Railway will set `DATABASE_URL` and `REDIS_URL` for the service that uses them.

3. **Required variables** (in Railway → your service → Variables):

   | Variable         | Example / how to get |
   |------------------|----------------------|
   | `DATABASE_URL`   | From PostgreSQL addon (Connect tab) |
   | `REDIS_URL`      | From Redis addon (Connect tab) |
   | `NODE_ENV`       | `production` |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `APP_URL`        | Your app URL, e.g. `https://your-app.up.railway.app` |

   Optional but recommended: `ALPHA_VANTAGE_KEY`, `ANTHROPIC_API_KEY`, `FMP_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL` (if frontend is on another domain).

4. **Migrations**  
   `scripts/start-production.js` runs Postgres migrations on startup. Ensure `DATABASE_URL` is set before the first deploy so migrations run against the correct DB.

---

## Option A: Deploy with Railway CLI

```bash
cd "/Users/florianschabus/Investment Project"
npm i -g @railway/cli
railway login
railway link    # select project + service (or create one)
railway up
```

After deploy, add a public domain: Railway → your service → Settings → Generate Domain.

---

## Option B: Deploy with GitHub Actions

1. **Secrets** (repo → Settings → Secrets and variables → Actions):
   - `RAILWAY_TOKEN` — Railway dashboard → Account → Tokens → Create.
   - `RAILWAY_SERVICE_STAGING` — Railway service ID (e.g. from service URL or `railway status`).
   - For production from branch `railway-deploy-clean`: `RAILWAY_SERVICE_PRODUCTION`.

2. **Push to trigger deploy:**
   - Staging: push to `main` (or run workflow with environment `staging`).
   - Production: push to `railway-deploy-clean` (or run workflow with environment `production`).

---

## After deploy

- **Health:**  
  `curl https://YOUR_DOMAIN.up.railway.app/api/health`
- **Logs:**  
  Railway dashboard → your service → Deployments → View logs, or `railway logs`.
- **DB:**  
  `railway connect postgres` (with CLI and project linked).

---

## Reference

- Full checklist: `docs/guides/DEPLOY_CHECKLIST.md`
- Detailed guide: `DEPLOYMENT_GUIDE.md`
- Config: `railway.toml`, `railway.json` (start: `npm run start:production`, health: `/api/health` in `railway.toml`)
