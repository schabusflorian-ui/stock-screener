# Investment Research Platform

A full-stack investment research and portfolio management platform that combines fundamental analysis, quantitative factor models, AI-powered stock evaluation, and alternative data sources into a single integrated system. Built for investors who want institutional-grade analytics with the flexibility to define their own screening criteria, construct custom factors, and backtest strategies against historical data.

The platform ingests financial data from multiple providers (Alpha Vantage, FRED, SEC EDGAR, Yahoo Finance), enriches it with alternative signals (congressional trading disclosures, insider transactions, short interest), and surfaces it through an interactive React frontend with 50+ pages covering everything from macro regime dashboards to individual company deep-dives.

## Features

- **Multi-Factor Stock Screening** -- Screen the full US/EU equity universe across 50+ metrics (ROIC, FCF yield, P/E, debt ratios, growth rates, alpha vs S&P 500) with range filters, sector/region constraints, and historical lookback. Includes 12 built-in preset screens (Buffett, Magic Formula, Fortress Balance Sheet, Cigar Butts, Compounders, etc.) plus 7 macro-regime-aware screens that auto-adjust criteria based on current market conditions (yield curve, VIX, credit spreads).

- **AI Analyst** -- Claude-powered investment analysis engine with a multi-turn chat interface. The AI has access to company financials, price data, and a curated knowledge base of investor writings (Buffett shareholder letters, Howard Marks memos, Damodaran blog posts). It generates structured PRISM reports -- scorecards that evaluate companies across profitability, risk, intrinsic value, sustainability, and management quality.

- **Quantitative Workbench** -- Build custom factors from any combination of financial metrics using a visual formula editor, then backtest them with walk-forward analysis, information coefficient tracking, and signal decay monitoring. The factor lab supports single-factor and multi-factor strategies with monthly/quarterly/annual rebalancing, long-only or long-short construction, and sector-relative scoring.

- **AI Trading Agents** -- Configurable multi-signal agents that combine 9 signal categories (technical, sentiment, insider activity, fundamentals, alternative data, valuation, 13F super-investor holdings, earnings momentum, and value quality scores like Piotroski F-Score and Altman Z-Score) with user-adjustable weights. Agents support paper trading, regime-adaptive weight shifting, and automated execution with risk management constraints (position limits, VaR, drawdown protection).

- **Portfolio Management** -- Track multiple portfolios with real-time P&L, performance attribution, alpha calculation against benchmarks, and tax-aware return analysis. Supports DCA, DRIP, value averaging, and regime-based rebalancing strategies. Each portfolio has configurable alerts for price levels and metric thresholds.

- **Congressional & Alternative Data** -- Track US congressional stock transactions sourced from Capitol Trades, with filtering by representative, party, committee, and transaction size. Integrates FINRA short interest data, institutional 13F holdings, and insider transaction filings (Forms 3, 4, 5) to surface non-obvious signals that precede price moves.

- **Earnings & SEC Filings** -- Automated ingestion of earnings call transcripts, 10-K/10-Q filings via SEC EDGAR, and earnings calendar tracking with beat/miss streak analysis. Earnings momentum feeds directly into the trading agent signal pipeline.

- **Market Dashboard** -- Homepage displays macro regime classification (Crisis, Late Cycle, Fear, Early Cycle, Neutral), real-time index data (S&P 500, Nasdaq, Russell, Dow), valuation gauges (Buffett Indicator, S&P P/E with historical bands, MSI Score), and a portfolio summary hub.

- **Natural Language Queries** -- Ask questions about your portfolio, the market, or specific companies in plain English. The NL engine translates queries into database lookups, metric calculations, and screening filters.

- **Advanced Visualizations** -- Correlation heatmaps, sector factor exposure maps, multi-metric comparison charts, alpha vs benchmark overlays, variance analysis, and interactive price charts with technical indicators.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, CSS Custom Properties design system, Recharts |
| **Backend** | Node.js 18+, Express 5, Passport.js (OAuth) |
| **Database** | PostgreSQL 15 (production), SQLite (development) |
| **AI** | Anthropic Claude API with daily/monthly budget controls |
| **Data Sources** | Alpha Vantage, FRED, SEC EDGAR, Yahoo Finance, Capitol Trades, FINRA |
| **ML** | LSTM, XGBoost, Temporal Fusion Transformer, PPO reinforcement learning |
| **Python Services** | Web scrapers, data fetchers, NLP pipelines |
| **Infrastructure** | Docker Compose, Railway (PaaS), GitHub Actions CI/CD |

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3.x (for data scrapers and ML models)
- PostgreSQL 15 (production) or SQLite (development -- no setup needed)
- Redis (optional, recommended for production session storage and rate limiting)

### Installation

```bash
# Clone the repository
git clone https://github.com/schabusflorian-ui/stock-screener.git
cd stock-screener

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment template and configure API keys
cp .env.example .env
```

### Configuration

Edit `.env` and add your API keys. At minimum you need Alpha Vantage for stock data; the other keys unlock additional features:

```bash
# Required -- stock prices, financials, technical indicators
ALPHA_VANTAGE_KEY=your_key          # Free: https://www.alphavantage.co/support/#api-key

# Recommended -- enables AI analysis and macro indicators
ANTHROPIC_API_KEY=your_key          # https://console.anthropic.com/
FRED_API_KEY=your_key               # Free: https://fred.stlouisfed.org/docs/api/api_key.html

# Optional -- enables OAuth login, earnings transcripts
GOOGLE_CLIENT_ID=your_id            # https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_SECRET=your_secret
FMP_API_KEY=your_key                # https://financialmodelingprep.com/
```

See [`.env.example`](.env.example) for the full list of 30+ configuration options including rate limits, LLM budgets, Redis, Sentry, and CORS settings.

### Running (Development)

```bash
# Start the backend with hot reload (port 3000)
npm run dev

# In a separate terminal, start the React frontend (port 3001)
cd frontend && npm start
```

The backend automatically creates a SQLite database at `./data/stocks.db` on first run -- no database setup required for development. The dev auth bypass (`ALLOW_DEV_AUTH=true` in `.env`) lets you skip OAuth configuration during local development.

### Running (Docker)

```bash
# Start the full stack: API server, PostgreSQL, Redis, background scheduler
docker-compose up

# Or build and run the API container standalone
npm run docker:build
npm run docker:run
```

## Project Structure

```
.
├── src/                        # Backend source code
│   ├── api/
│   │   ├── server.js           # Express app entry point
│   │   └── routes/             # 83 API route modules organized by domain
│   ├── services/               # Business logic layer (105 service modules)
│   │   ├── agent/              # Trading agent engine, signal optimizer, risk manager
│   │   ├── ai/                 # Claude integration, prompt management, cost tracking
│   │   ├── backtesting/        # Factor backtesting, walk-forward analysis
│   │   ├── factors/            # Custom factor construction, signal generation
│   │   ├── portfolio/          # Portfolio calculations, optimization, attribution
│   │   ├── signals/            # Value signals (Piotroski, Altman), congressional signals
│   │   ├── alternativeData/    # Short interest, options flow, 13F aggregation
│   │   ├── updates/            # Data update orchestration across 16 data bundles
│   │   └── ...                 # Screening, dividends, earnings, sentiment, NL query
│   ├── lib/                    # Core: database abstraction, logger, migration runner
│   ├── middleware/             # Auth, CSRF, rate limiting, validation, error handling
│   ├── jobs/                   # Cron-based schedulers (prices, dividends, SEC, knowledge)
│   ├── scrapers/               # Data scraping modules
│   ├── config/                 # Environment and feature configuration
│   └── database-migrations/    # 138 numbered migration files
├── frontend/                   # React 19 single-page application
│   └── src/
│       ├── components/         # 103 UI components (cards, charts, tables, forms)
│       ├── pages/              # 64 page components (dashboard, screener, company, etc.)
│       ├── hooks/              # Custom React hooks
│       ├── context/            # 12 React contexts (auth, watchlist, preferences, NL query)
│       └── services/           # API client layer
├── python/                     # ML models: LSTM, XGBoost, TFT, PPO RL agents
├── python-services/            # Data fetchers: prices, fundamentals, congressional, dividends
├── data/                       # Runtime data directory (SQLite DBs, auto-created)
├── scripts/                    # Operational scripts (migrations, deployment, data tools)
├── tests/                      # Jest test suite, PostgreSQL integration tests
├── docs/                       # Architecture, API reference, developer and deployment guides
└── knowledge_base/             # Curated investor writings (Buffett, Marks, Damodaran, etc.)
```

## API Overview

The backend serves 83 RESTful endpoints organized by domain. All return JSON and most require authentication (bypassed in dev mode with `ALLOW_DEV_AUTH=true`).

| Group | Path | Description |
|-------|------|-------------|
| **Companies** | `/api/companies` | Company master data, financial statements, calculated metrics |
| **Prices** | `/api/prices` | Current prices, historical OHLCV, price metrics |
| **Screening** | `/api/screening` | Multi-factor stock screening with presets and custom filters |
| **AI Analyst** | `/api/analyst` | Claude-powered analysis, PRISM reports, chat conversations |
| **Natural Language** | `/api/nl` | Plain-English queries translated to data lookups |
| **Factors** | `/api/factors` | Custom factor CRUD, scoring, backtesting |
| **Backtesting** | `/api/backtesting` | Strategy backtests with performance attribution |
| **Agents** | `/api/agents` | Trading agent configuration, execution, recommendations |
| **Portfolios** | `/api/portfolios` | Portfolio CRUD, performance, attribution, optimization |
| **Congressional** | `/api/congressional` | Congressional trading data and politician summaries |
| **Dividends** | `/api/dividends` | Dividend history, yield analysis, ex-date calendar |
| **Earnings** | `/api/earnings` | Earnings calendar, transcripts, beat/miss analysis |
| **Signals** | `/api/signals` | Multi-signal scores (technical, sentiment, value quality) |
| **Market Data** | `/api/indices`, `/api/macro` | Index prices, ETF data, FRED macro indicators |

See [docs/api/endpoints.md](docs/api/endpoints.md) for the complete endpoint reference with request/response formats.

## Development

### Testing

```bash
npm test                    # Run Jest test suite
npm run test:coverage       # Run with coverage report
npm run test:postgresql     # PostgreSQL-specific integration tests
npm run test:unified        # Unified strategy framework tests
npm run test:updates        # Data update service tests
```

### Code Quality

```bash
npm run lint                # ESLint check
npm run lint:fix            # Auto-fix lint issues
npm run format:check        # Prettier format check
npm run format              # Auto-format all source files
```

Pre-commit hooks (via Husky + lint-staged) automatically run Prettier and ESLint on staged files.

### Database

```bash
npm run db:migrate          # Run pending migrations (auto-runs on production startup)
npm run db:migrate:status   # Show which migrations have been applied
```

The database abstraction layer (`src/lib/db.js`) transparently converts SQL between SQLite and PostgreSQL dialects -- write PostgreSQL-style queries with `$1` placeholders and the layer handles the rest. See [docs/guides/development.md](docs/guides/development.md) for the full coding conventions.

### Background Jobs

```bash
npm run scheduler           # Start the master scheduler (prices, dividends, SEC, etc.)
npm run price-update        # Trigger a one-off price update for all tracked companies
npm run knowledge:refresh   # Refresh the AI knowledge base
```

## Deployment

The application is production-deployed on [Railway](https://railway.app) with automatic builds via Nixpacks (Node.js + Python). The production startup script (`scripts/start-production.js`) validates environment variables, runs pending migrations, starts the background scheduler, and launches the Express server with graceful shutdown handling.

```bash
npm run start:production    # Full production startup sequence
```

See [docs/guides/deployment.md](docs/guides/deployment.md) for Railway configuration, environment variables, Docker Compose setup, and CI/CD pipeline details.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   React UI  │────▶│  Express API │────▶│    Services      │
│  (64 pages) │     │  (83 routes) │     │  (105 modules)   │
└─────────────┘     └──────┬───────┘     └────────┬────────┘
                           │                       │
                    ┌──────┴───────┐        ┌──────┴────────┐
                    │  Middleware   │        │   Database    │
                    │ (auth, CSRF, │        │ (PostgreSQL / │
                    │  rate limit) │        │   SQLite)     │
                    └──────────────┘        └───────────────┘
                                                   ▲
                    ┌──────────────┐                │
                    │  Scheduler   │────────────────┘
                    │ (16 data     │
                    │  bundles)    │     ┌──────────────────┐
                    └──────────────┘     │  Python Services │
                                        │  (scrapers, ML   │
                    ┌──────────────┐     │   models)        │
                    │  Claude API  │     └──────────────────┘
                    │  (AI analyst │
                    │   + agents)  │     ┌──────────────────┐
                    └──────────────┘     │  Knowledge Base  │
                                        │  (investor       │
                                        │   writings, RAG) │
                                        └──────────────────┘
```

The database abstraction layer supports dual-database operation: SQLite for zero-setup local development and PostgreSQL for production with connection pooling, full MVCC concurrency, and JSONB support. The layer automatically translates SQL dialects, placeholder syntax, and date functions.

See [docs/architecture/overview.md](docs/architecture/overview.md) for the full architecture documentation including the middleware chain, service layer organization, data pipeline, and AI integration details.

## Contributing

1. Follow the coding conventions in [docs/AGENTS.md](docs/AGENTS.md) (covers frontend design system, backend patterns, database access rules)
2. Write tests for new features
3. Run `npm test` and `npm run lint` before committing (pre-commit hooks enforce formatting)
4. Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`)

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.
