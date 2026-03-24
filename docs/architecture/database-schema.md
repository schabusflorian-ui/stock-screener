# Database Schema

## Overview

The database schema is managed through 138 migration files in `src/database-migrations/`. Migrations run automatically on production startup and can be run manually with:

```bash
npm run db:migrate          # Run pending migrations
npm run db:migrate:status   # Show migration status
```

The migration runner (`src/lib/migrationRunner.js`) tracks applied migrations in a `schema_migrations` table.

## Core Tables

### Companies & Financial Data

| Table | Purpose |
|-------|---------|
| `companies` | Company master data (ticker, name, sector, exchange) |
| `financial_data` | Annual/quarterly financial statements |
| `price_history` | Historical daily price data |
| `price_metrics` | Calculated price metrics and technical indicators |
| `dividends` | Dividend history and yields |
| `earnings_calendar` | Upcoming and past earnings dates |
| `earnings_transcripts` | Earnings call transcript text |

### Portfolio Management

| Table | Purpose |
|-------|---------|
| `portfolios` | User portfolio definitions |
| `portfolio_positions` | Current holdings and allocations |
| `watchlists` | Stock watchlists |
| `watchlist_items` | Individual watchlist entries |
| `notes` | User notes on companies |

### Alternative Data

| Table | Purpose |
|-------|---------|
| `congressional_trades` | US congressional stock transactions |
| `insider_trades` | Corporate insider trading data |
| `institutional_holders` | 13F institutional holdings |

### AI & Analytics

| Table | Purpose |
|-------|---------|
| `ai_analyses` | AI-generated stock analyses |
| `recommendations` | Buy/sell recommendations |
| `factors` | Custom factor definitions |
| `factor_values` | Calculated factor scores |
| `backtest_results` | Strategy backtest outputs |

### System

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `sessions` | Express session store |
| `schema_migrations` | Migration tracking |
| `update_queue` | Background job queue |
| `llm_usage_tracking` | AI API cost tracking |
| `data_freshness` | Data staleness monitoring |

## Dual Database Support

The application runs on both SQLite (development) and PostgreSQL (production). The database abstraction layer in `src/lib/db.js` handles dialect conversion automatically. See [overview.md](overview.md) for details.

### Key Differences

| Feature | SQLite | PostgreSQL |
|---------|--------|-----------|
| Connection | File-based (`./data/stocks.db`) | URL-based (`DATABASE_URL`) |
| Concurrency | Single writer | Full MVCC |
| JSON | `json_extract()` | `jsonb` operators |
| Upsert | `INSERT OR REPLACE` | `ON CONFLICT DO UPDATE` |
| Date functions | `datetime()`, `strftime()` | `NOW()`, `DATE()` |

## Migration Naming Convention

Migrations follow the pattern: `NNN-description.js`

- `000-postgres-base-schema.js` -- Foundation schema
- `001-add-all-missing-tables.js` -- Core table additions
- `002-040` -- Feature-specific additions (historical intelligence, quant lab, indices, etc.)
