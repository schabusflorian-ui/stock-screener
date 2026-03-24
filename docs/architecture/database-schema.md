# Database Schema

## Overview

The database schema is managed through 138 sequential migration files in `src/database-migrations/`. Each migration exports an `up` function that receives the database abstraction layer and applies schema changes using PostgreSQL-compatible SQL (the abstraction layer auto-converts for SQLite in development).

Migrations run automatically on production startup via `scripts/start-production.js` and can be run manually:

```bash
npm run db:migrate          # Run all pending migrations
npm run db:migrate:status   # Show which migrations have been applied
```

The migration runner (`src/lib/migrationRunner.js`) tracks applied migrations in a `schema_migrations` table and ensures each migration runs exactly once, even across restarts or concurrent deployments.

## Core Tables

### Companies & Financial Data

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `companies` | Company master data -- one row per tracked company | `ticker`, `name`, `sector`, `industry`, `country`, `exchange`, `market_cap`, `is_active` |
| `financial_data` | Annual and quarterly financial statements from SEC filings and Alpha Vantage | `company_id`, `period_type` (annual/quarterly), `fiscal_year`, `fiscal_quarter`, `revenue`, `net_income`, `total_assets`, `total_debt`, `free_cash_flow`, `shares_outstanding` |
| `calculated_metrics` | Derived financial ratios computed from `financial_data` | `company_id`, `period`, `roic`, `roe`, `roa`, `gross_margin`, `operating_margin`, `net_margin`, `fcf_yield`, `pe_ratio`, `pb_ratio`, `ev_ebitda`, `debt_equity`, `current_ratio`, `piotroski_score`, `altman_z_score` |
| `price_history` | Historical daily OHLCV price data | `company_id`, `date`, `open`, `high`, `low`, `close`, `adjusted_close`, `volume` |
| `price_metrics` | Calculated price-derived metrics and technical indicators | `company_id`, `beta`, `alpha_1m`, `alpha_3m`, `alpha_ytd`, `alpha_1y`, `sma_50`, `sma_200`, `rsi_14`, `volatility` |
| `dividends` | Dividend history per company | `company_id`, `ex_date`, `payment_date`, `amount`, `frequency`, `yield` |
| `earnings_calendar` | Upcoming and historical earnings dates with beat/miss tracking | `company_id`, `earnings_date`, `estimate_eps`, `actual_eps`, `surprise_pct`, `beat_count` |
| `earnings_transcripts` | Full text of earnings call transcripts | `company_id`, `quarter`, `year`, `transcript_text`, `summary` |

### Portfolio Management

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `portfolios` | User portfolio definitions | `user_id`, `name`, `strategy`, `benchmark`, `created_at` |
| `portfolio_positions` | Current and historical holdings | `portfolio_id`, `company_id`, `shares`, `entry_price`, `entry_date`, `current_value`, `pnl`, `weight` |
| `watchlists` | User watchlists for tracking companies of interest | `user_id`, `name`, `created_at` |
| `watchlist_items` | Individual watchlist entries with alert thresholds | `watchlist_id`, `company_id`, `price_alert_above`, `price_alert_below`, `added_at` |
| `notes` | User research notes attached to companies | `user_id`, `company_id`, `content`, `thesis_type`, `created_at` |

### Alternative Data

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `congressional_trades` | US congressional stock transactions from Capitol Trades | `politician_name`, `party`, `chamber`, `company_id`, `transaction_type` (buy/sell), `amount_range`, `filing_date`, `transaction_date` |
| `insider_trades` | Corporate insider transactions from SEC Forms 3, 4, 5 | `company_id`, `insider_name`, `title`, `transaction_type`, `shares`, `price`, `filing_date` |
| `institutional_holders` | 13F institutional holdings from quarterly SEC filings | `company_id`, `institution_name`, `shares_held`, `value`, `change_pct`, `filing_quarter` |
| `short_interest` | FINRA short interest data | `company_id`, `short_shares`, `short_pct_float`, `days_to_cover`, `report_date` |

### AI & Analytics

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ai_analyses` | AI-generated stock analyses (PRISM reports) | `company_id`, `analysis_type`, `content`, `scores` (JSON), `model_used`, `cost`, `created_at` |
| `recommendations` | Agent-generated buy/sell/hold recommendations with tracking | `company_id`, `action` (STRONG_BUY to STRONG_SELL), `confidence`, `signals` (JSON), `outcome_price`, `outcome_date` |
| `agents` | User-configured trading agent definitions | `user_id`, `name`, `strategy_type`, `signal_weights` (JSON), `risk_params` (JSON), `is_active` |
| `factors` | Custom factor definitions from the quantitative workbench | `user_id`, `name`, `formula`, `description`, `created_at` |
| `factor_values` | Calculated factor scores per company per period | `factor_id`, `company_id`, `score`, `percentile`, `period` |
| `backtest_results` | Strategy backtest outputs | `strategy_config` (JSON), `returns`, `sharpe`, `max_drawdown`, `cagr`, `period_start`, `period_end` |

### System

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts (linked to OAuth provider) | `email`, `name`, `provider`, `provider_id`, `is_admin`, `created_at` |
| `sessions` | Express session store (production uses Redis or PostgreSQL) | `sid`, `sess` (JSON), `expire` |
| `schema_migrations` | Tracks which migrations have been applied | `name`, `applied_at` |
| `update_queue` | Background job queue for the update orchestrator | `bundle_name`, `status`, `started_at`, `completed_at`, `error` |
| `update_locks` | Distributed locking for concurrent job execution | `lock_name`, `holder`, `acquired_at`, `expires_at` |
| `llm_usage_tracking` | AI API cost tracking per request | `model`, `input_tokens`, `output_tokens`, `cost_usd`, `endpoint`, `created_at` |
| `data_freshness` | Monitors data staleness for each update bundle | `source`, `last_updated`, `record_count`, `is_stale` |
| `notifications` | User notification queue (price alerts, earnings, etc.) | `user_id`, `type`, `title`, `message`, `is_read`, `created_at` |

## Dual Database Support

The application runs on both SQLite (development) and PostgreSQL (production). The database abstraction layer in `src/lib/db.js` handles all dialect conversion automatically so that service code only needs to write PostgreSQL-compatible SQL.

### Key Differences

| Feature | SQLite (Development) | PostgreSQL (Production) |
|---------|---------------------|------------------------|
| Connection | File-based (`./data/stocks.db`) | URL-based (`DATABASE_URL`) with connection pooling |
| Concurrency | Single writer, multiple readers | Full MVCC with row-level locking |
| JSON support | `json_extract()` | `jsonb` operators and indexing |
| Upsert | `INSERT OR REPLACE` | `ON CONFLICT DO UPDATE` |
| Date functions | `datetime()`, `strftime()` | `NOW()`, `DATE()`, `EXTRACT()` |
| Full-text search | FTS5 extension | `tsvector` + `GIN` indexes |
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` / `BIGSERIAL` |

### When to Use PostgreSQL Locally

While SQLite works for most development, use PostgreSQL locally (via Docker Compose) when:
- Testing migration scripts that use PostgreSQL-specific features
- Working on features that rely on JSONB queries or full-text search
- Running the PostgreSQL integration test suite (`npm run test:postgresql`)
- Profiling query performance with production-like data volumes

## Migration Naming Convention

Migrations follow the pattern `NNN-description.js` where NNN is a zero-padded sequence number:

```
000-postgres-base-schema.js      # Foundation: companies, financial_data, price_history, users
001-add-all-missing-tables.js    # Core additions: portfolios, watchlists, notes, dividends
002-040                          # Feature additions: quant lab, indices, historical intelligence,
                                 # congressional trades, insider data, factor tables, agent system,
                                 # earnings, sentiment, alternative data, notifications
041+                             # Ongoing schema evolution: new metrics, optimization indexes,
                                 # data quality columns, performance improvements
```
