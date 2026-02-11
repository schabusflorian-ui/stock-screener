# Update Services – Cloud Runbook

Use this runbook to validate and operate update services (Master Scheduler, Update Orchestrator) in staging or production (e.g. Railway with PostgreSQL).

## Prerequisites

- **Production (Railway):** `npm run start:production` starts both the API server and the Master Scheduler. No separate service is required. Set `START_SCHEDULER=false` only if you run the scheduler as a separate Railway service.
- `DATABASE_URL` (PostgreSQL) and, if using multiple instances, `REDIS_URL` set (scheduler uses Redis for distributed locks).
- API keys required by jobs (e.g. `ALPHA_VANTAGE_KEY`, `FMP_API_KEY`) set in the same env as the API.

## Validation in staging/production

### 1. Confirm scheduler process is running

- **Railway:** In the dashboard, open the service that runs `node src/jobs/masterScheduler.js`. Check that the deployment is active and logs show startup (e.g. "Master Scheduler Started", "Scheduled: Price Update ...").
- **Logs:** Look for lines like `Scheduled: Price Update (Weekdays 6:00 PM ET)` and `Scheduler heartbeat - all systems operational`.

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
