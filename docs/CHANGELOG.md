# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.1] - 2025-03-24

### Added
- Comprehensive project documentation: architecture overview, database schema reference, API endpoints guide, development guide with coding conventions, and deployment guide for Railway/Docker/CI
- LICENSE file (ISC)
- Prettier code formatting configuration (single quotes, trailing commas ES5, 100-char width)
- Husky pre-commit hooks with lint-staged for gradual code formatting on commit
- ESLint `no-console` rule set to warn (flags new `console.log` calls, allows `console.warn`/`console.error`)
- `.gitkeep` files for `data/` and `python/checkpoints/` to preserve directory structure for new clones

### Changed
- Repository restructured for professional sharing: root directory reduced from 65+ loose files to clean standard layout
- README rewritten from 16-line placeholder to comprehensive project overview with features, tech stack, setup instructions, architecture diagram, and API reference
- Documentation reorganized into `docs/architecture/`, `docs/guides/`, `docs/api/`, and `docs/legal/`
- `.gitignore` expanded with patterns for backup files (`*.bak`, `*.backup`, `*.js-f`), database files (`*.db`, `*.sqlite`), generated data outputs (`data/*.json`, `data/*.csv`), ML checkpoints (`python/checkpoints/`), benchmark results, and local IDE config (`.mcp.json`)
- `package.json` metadata updated with `author`, `repository`, `homepage`, and `bugs` fields

### Removed
- 22 stale root-level markdown files (phase completion reports, migration notes, deployment summaries)
- 20 one-time conversion scripts and ad-hoc test files from root directory
- 10 tracked backup files (`.bak`, `.backup`, `.js-f` variants)
- 64 outdated documentation files from `docs/` (implementation week reports, audit reports, status trackers)
- 46 data artifacts from `data/` directory (one-off scripts, generated JSON/CSV outputs)
- 14 ML model checkpoints from `python/checkpoints/` (binary `.pt` files, training configs)
- 6 timestamped benchmark result files from `python/benchmarks/results/`
- Debug and trace files from `src/` (`test-db-direct.js`, `test-init.js`, `trace-loading.js`, `debug-database.js`)
- `.mcp.json` removed from tracking (local dev tool config)

### Security
- All API keys and secrets scrubbed from entire git history using `git-filter-repo` (Alpha Vantage, Anthropic, FRED, Google OAuth credentials, session secrets)
- Files containing plaintext OAuth credentials removed (`OAUTH_SETUP_GUIDE.md`, `OAUTH_FIX_SUMMARY.md`)
- Production startup script blocks `ALLOW_DEV_AUTH` and `FORCE_HTTP1` environment variables in production

## [1.0.0] - 2025-03-20

### Added

#### Core Platform
- Full-stack investment research platform with Express 5 API (83 route modules, 105 service modules) and React 19 frontend (64 pages, 103 components)
- Dual-database architecture: PostgreSQL 15 for production with connection pooling, SQLite for zero-setup local development. Automatic SQL dialect translation via `src/lib/db.js`
- 138 sequential database migrations with automatic execution on production startup
- Layered middleware chain: Helmet security headers, CORS, gzip compression, Redis-backed rate limiting (100/30/10 req/min tiers), session management, CSRF protection, and role-based authentication

#### Stock Screening & Analysis
- Multi-factor stock screener with 50+ financial metrics (ROIC, FCF yield, P/E, debt ratios, growth rates, alpha calculations) supporting range filters, sector/region constraints, and historical lookback
- 12 built-in screen presets: Buffett Quality, Deep Value, Magic Formula, Fortress Balance Sheet, Cigar Butts, Compounders, Growth at Reasonable Price, Dividend Aristocrats, Quality + Momentum, Turnaround, Small-Cap Value, and Asymmetric Opportunity
- 7 macro-regime-aware screens that auto-adjust criteria based on yield curve, VIX, and credit spread signals
- Quantitative workbench: custom factor construction from metric formulas, walk-forward backtesting with information coefficient tracking, signal decay monitoring, and sector-relative scoring
- Multi-signal trading agent system with 9 signal categories (technical, sentiment, insider activity, fundamentals, alternative data, valuation, 13F super-investor holdings, earnings momentum, value quality) and user-adjustable weights

#### AI Integration
- Claude-powered AI analyst with structured PRISM reports (profitability, risk, intrinsic value, sustainability, management quality scorecards)
- Multi-turn analyst chat with company data injection and persistent conversation context
- Knowledge base RAG: 343 curated investor writings (Buffett shareholder letters 1977-2024, Howard Marks memos, Damodaran blog posts, a16z essays, Sequoia letters) for retrieval-augmented generation
- Budget-controlled AI spending with daily and monthly limits tracked per request in `llm_usage_tracking`
- Natural language query engine translating plain-English questions into database lookups and metric calculations

#### Data Pipeline
- Background scheduler orchestrating 16 data update bundles on configurable cron schedules with distributed locking, retry logic, and crash recovery
- Alpha Vantage integration for stock prices, fundamentals, and technical indicators
- FRED integration for 300+ macroeconomic indicators (GDP, CPI, unemployment, yield curves, consumer sentiment)
- SEC EDGAR integration for 10-K, 10-Q, 8-K filings and 13F institutional holdings via XBRL parser
- Capitol Trades scraper for congressional stock transactions with politician, party, and committee filtering
- FINRA short interest data, insider transaction filings (Forms 3, 4, 5), and institutional holding changes
- Historical price data import from 2009 for long-term backtesting
- Earnings calendar tracking with transcript ingestion, beat/miss streak analysis, and surprise percentages

#### Portfolio Management
- Multi-portfolio tracking with real-time P&L, performance attribution, alpha vs benchmark calculation, and sector allocation breakdowns
- Mean-variance portfolio optimization with configurable constraints (min/max weights, sector limits, target return/risk)
- DCF valuation model with adjustable growth rate, discount rate, and terminal multiple assumptions
- Watchlist system with configurable price alert thresholds

#### Frontend
- CSS Custom Properties design system with glassmorphism aesthetic and responsive layouts (mobile-first, breakpoints at 768px and 1024px)
- Macro regime dashboard displaying current market classification (Crisis, Late Cycle, Fear, Early Cycle, Neutral) with valuation gauges (Buffett Indicator, S&P P/E with historical bands, MSI Score)
- Interactive price charts with technical indicators, correlation heatmaps, sector factor exposure maps, and multi-metric comparison charts
- 12 React contexts for state management (auth, watchlist, preferences, NL query, notifications, and more)

#### ML Models
- LSTM neural network for price prediction
- XGBoost and LightGBM for factor scoring
- Temporal Fusion Transformer for multi-horizon forecasting
- PPO reinforcement learning agent for portfolio optimization

#### Infrastructure
- Railway deployment with Nixpacks (Node.js + Python), automatic health checks, and failure-triggered restarts
- Docker Compose configuration for local full-stack development (API, PostgreSQL 15, Redis 7, scheduler)
- GitHub Actions CI/CD: lint, test (with PostgreSQL service container), build verification, Docker build check, security audit
- Google OAuth 2.0 authentication with session persistence (Redis > PostgreSQL > SQLite cascading store)
- Subscription-based feature gating (free/pro/ultra tiers) with usage metering and resource limits
