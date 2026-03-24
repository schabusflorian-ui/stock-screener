# Scripts

Operational and maintenance scripts for the Investment Research Platform. Most scripts are invoked via `npm run` commands (see `package.json`), but some are standalone utilities for specific tasks.

## Directory Layout

```
scripts/
├── analysis/           # Data analysis and reporting utilities
├── congressional/      # Congressional trading data fetch and processing
├── debug/              # Debugging helpers (connection testing, logging)
├── deploy/             # Deployment helpers (Railway, Docker)
├── helpers/            # Shared utility functions used by other scripts
├── import/             # Data import scripts (prices, fundamentals, ESMA)
├── migration/          # Database migration helpers and conversion tools
├── runners/            # Test and job runner wrappers
├── setup/              # Demo data seeding and initial configuration
├── testing/            # Test execution helpers
├── validation/         # Data integrity verification scripts
└── visual-audit/       # Frontend CSS design system compliance checker
```

## Key Operational Scripts

These are the scripts you'll use regularly:

| Script | npm command | Description |
|--------|------------|-------------|
| `start-production.js` | `npm run start:production` | Production startup orchestrator (env validation, migrations, scheduler, server) |
| `backup-db.sh` | `npm run db:backup` | PostgreSQL database backup via `pg_dump` |
| `railway-force-migrate.js` | `npm run db:migrate:railway` | Force-run migrations on Railway |
| `check-sync-db-usage.sh` | `npm run check:sync-db` | Scans codebase for deprecated sync database API usage |
| `migrate-to-postgres.js` | `npm run db:sync-data` | Migrate data from SQLite to PostgreSQL |
| `check-postgres-duplicates.js` | `npm run db:check-duplicates` | Find duplicate records after migration |
| `build_knowledge_base.py` | `npm run knowledge:refresh` | Build/refresh the AI knowledge base from investor writings |
| `init-db.sql` | -- | PostgreSQL initialization script (used by Docker Compose) |

## Setup & Demo Data

| Script | Description |
|--------|-------------|
| `setup-demo-agents.js` | Seed demo trading agents with sample configurations |
| `setup-demo-portfolios.js` | Create demo portfolios with sample positions |
| `seed-agent-history.js` | Generate historical agent recommendation data |
| `seed-ai-trading-data.js` | Seed AI trading signal data for development |

## Data Backfill Scripts

One-time or periodic scripts for populating historical data:

| Script | Description |
|--------|-------------|
| `backfill-agent-returns.js` | Calculate historical returns for agent recommendations |
| `backfill-ipo-ground-truth.js` | Populate IPO data from ground truth sources |
| `backfill-valuation-history.js` | Backfill historical valuation metrics |
| `backfillSentimentHistory.js` | Generate historical sentiment scores |
| `backfill_historical_13f.py` | Import historical 13F institutional holdings |
| `fetch-historical-fred.js` | Import historical FRED macroeconomic data |
| `fetch-historical-indices.py` | Import historical market index data |
| `generate-ttm-data.js` | Generate trailing-twelve-month financial data |
| `import_esma_backfill.js` | Import European Securities and Markets Authority data |
| `run-calculate-outcomes.js` | Calculate recommendation outcomes for Historical Intelligence |

## Calculation & Maintenance

| Script | Description |
|--------|-------------|
| `calculate-alpha.js` | Calculate stock alpha vs benchmarks |
| `calculate-market-metrics.js` | Compute market-wide aggregate metrics |
| `calculate-returns.js` | Calculate return series for companies |
| `calculate-ttm-metrics.js` | Compute trailing-twelve-month financial metrics |
| `calculate-valuation-ranges.js` | Generate historical valuation bands |
| `recalculate-metrics-with-valuations.js` | Recalculate financial metrics incorporating valuation data |
| `recalculate-peg-pegy.js` | Recalculate PEG and PEGY ratios |
| `flag-inactive-companies.js` | Mark delisted or inactive companies |
| `update-ticker-symbols.js` | Update changed ticker symbols |

## Data Quality

| Script | Description |
|--------|-------------|
| `deduplicate-financial-data.js` | Remove duplicate financial statement records |
| `fix-balance-sheet-equity.js` | Correct balance sheet equity calculations |
| `fix-pe-coverage.js` | Improve P/E ratio data coverage |
| `validate-balance-sheets.js` | Verify balance sheet accounting identities |
| `validate-with-fmp.js` | Cross-validate financial data against FMP |
