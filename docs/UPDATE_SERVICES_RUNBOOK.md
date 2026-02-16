# Update Services – Cloud Runbook

Use this runbook to validate and operate update services (Master Scheduler, Update Orchestrator) in staging or production (e.g. Railway with PostgreSQL).

## Pre-deploy validation (run locally before merging deploy branch)

1. **Scheduler list and status**  
   `node src/jobs/masterScheduler.js --list` and `node src/jobs/masterScheduler.js --status`  
   Expect: "Capital Allocation Update - Sunday 5:00 AM ET" in the list.

2. **Validation script**  
   `node scripts/validate-update-services.js --status`  
   Expect: checklist and full scheduler status (no exit 1).

3. **Capital export**  
   `node -e "const c=require('./src/api/routes/capital'); if(typeof c.runCapitalUpdate==='function') console.log('OK'); else process.exit(1);"`  
   Expect: "OK".

4. **Tests**  
   `npm test -- --testPathPattern=masterScheduler`  
   Expect: all tests pass, including "scheduled jobs include Capital Allocation Update".

## Prerequisites

- **Production (Railway):** `npm run start:production` starts both the API server and the Master Scheduler. No separate service is required.
- **START_SCHEDULER:** Do **not** set `START_SCHEDULER=false` in Railway unless the scheduler runs as a separate service (e.g. another Railway service or external cron). If it is set to `false`, no scheduled updates (prices, SEC, dividends, capital allocation, etc.) will run.
- `DATABASE_URL` (PostgreSQL) and, if using multiple instances, `REDIS_URL` set (scheduler uses Redis for distributed locks).
- API keys required by jobs (e.g. `ALPHA_VANTAGE_KEY`, `FMP_API_KEY`) set in the same env as the API.

## Validation in staging/production

### 1. Confirm scheduler process is running

- **Railway:** In the dashboard, open the service that runs `node src/jobs/masterScheduler.js`. Check that the deployment is active and logs show startup (e.g. "Master Scheduler Started", "Scheduled: Price Update ...").
- **Logs:** Look for lines like `Scheduled: Price Update (Weekdays 6:00 PM ET)` and `Scheduler heartbeat - all systems operational`.
- **Validation script (against Railway):** From your machine, run `BASE_URL=https://your-app.up.railway.app node scripts/validate-update-services.js --status` to print the checklist, hit `/health` and `/api/capital/update-status`, and run scheduler status (requires same env or run from a one-off that has DATABASE_URL).

### 2. Trigger one job manually

From a machine that can run Node against the same DB (or a one-off Railway run):

```bash
# From project root, with same DATABASE_URL and REDIS_URL as production
export DATABASE_URL="postgresql://..."
export REDIS_URL="redis://..."   # if used
node -e "
const MasterScheduler = require('./src/jobs/masterScheduler.js');
const s = new MasterScheduler();
s.runJob('Market Indicator Update (Weekly)', () => s.runMarketIndicatorUpdate())
  .then(() => { console.log('Done'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

Alternatively, run the full scheduler once with a single cron firing, or use a future admin endpoint that triggers a job by name.

### 3. Verify database updates

After a job run (e.g. Market Indicator Update):

- Connect to PostgreSQL and check that the expected tables were updated (e.g. `market_indicator_history` for market indicator job).
- Check application logs for the job name and "completed successfully" or duration.

### 4. Check Redis (if REDIS_URL is set)

- **Lock keys:** `job:lock:*` – should appear while a job runs and disappear after it finishes.
- **Status keys:** `job:status:<JobName>` – optional; some setups store last run status here with TTL.

Use Redis CLI or a dashboard to confirm keys are created/expired as expected and no stale lock remains.

### 5. If Update Orchestrator is enabled later

- Ensure Postgres migrations for `update_jobs`, `update_bundles`, `update_runs`, `update_queue`, `update_locks`, `update_settings` have been run.
- Trigger a single job via `POST /api/update-system/jobs/:key/run` (after the update-system API is made Postgres-compatible).
- Query `update_runs` in Postgres to verify the run record and status.

## Troubleshooting

| Symptom | Check |
|--------|--------|
| No updates in DB | Scheduler process running? Same DATABASE_URL as API? Logs for errors? |
| Duplicate job runs | REDIS_URL set and Redis reachable? Only one scheduler instance? |
| Job timeout | Increase job timeout in masterScheduler.js (JOB_TIMEOUTS) or external API/network. |
| Missing data for a job | Required env var (e.g. FMP_API_KEY) set in scheduler service? |

## Required env vars by job (summary)

- **Price / backfill:** Alpha Vantage or FMP (and/or Yahoo).
- **Sentiment:** Reddit/StockTwits if configured.
- **SEC / 13F:** No key; respect SEC rate limits.
- **Market indicators:** FRED API key if FRED series are used.
- **EU/UK XBRL / IPO:** No key; public APIs.
- **Dividend:** Python env + Yahoo (or configured provider).
- **Agent scan/execution:** Same as API (DB, auth, etc.).

Set these in the Railway (or other) service that runs the Master Scheduler.

## CI and migrations (deploy workflow)

- In `.github/workflows/deploy.yml`, the **Test** and **Run Migrations** jobs are currently disabled (`if: false`) to avoid billing/runner issues. As a result, pushes to the deploy branch do not run tests or migrations automatically.
- **Before or after deploy:** Run PostgreSQL migrations manually when you change schema, e.g. from a one-off Railway run or locally with production `DATABASE_URL`: `npm run db:migrate:postgres`.
- **Re-enabling:** When feasible, re-enable the test and migrate jobs in `deploy.yml` (remove or adjust the `if: false` conditions) so that broken code or missing migrations are caught before or during deploy.
