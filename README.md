# Investment Research Platform

A full-stack stock analysis and portfolio management platform combining value investing metrics, AI-powered analysis, and alternative data sources.

## Features

- **Stock Screening** -- Multi-factor screening with 20+ value investing metrics (P/E, P/B, DCF, dividend yield, etc.)
- **AI Analyst** -- Claude-powered stock analysis using institutional-grade valuation frameworks
- **Portfolio Management** -- Track holdings, calculate returns, monitor allocation and risk
- **Congressional Trading** -- Track and analyze US congressional stock transactions
- **Earnings & SEC Filings** -- Automated earnings transcript ingestion and SEC filing parsing
- **Dividend Tracking** -- Dividend history, yield analysis, and ex-date monitoring
- **Quantitative Workbench** -- Custom factor construction, backtesting, and portfolio optimization
- **Natural Language Queries** -- Ask questions about your portfolio and the market in plain English
- **Real-Time Data** -- Automated price updates, market indicators, and macroeconomic data via FRED

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, CSS Custom Properties (design system) |
| **Backend** | Node.js 18+, Express 5 |
| **Database** | PostgreSQL 15 (production), SQLite (development) |
| **AI** | Anthropic Claude API with budget controls |
| **Data Sources** | Alpha Vantage, FRED, SEC EDGAR, Financial Modeling Prep |
| **Python Services** | Web scrapers, data fetchers, analytics pipelines |
| **Infrastructure** | Docker, Railway, GitHub Actions CI/CD |

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3.x (for data scrapers)
- PostgreSQL 15 (production) or SQLite (development -- no setup needed)
- Redis (optional, recommended for production sessions)

### Installation

```bash
# Clone the repository
git clone https://github.com/schabusflorian-ui/stock-screener.git
cd stock-screener

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment template
cp .env.example .env
```

### Configuration

Edit `.env` and add your API keys:

```bash
# Required
ALPHA_VANTAGE_KEY=your_key          # https://www.alphavantage.co/support/#api-key

# Recommended
ANTHROPIC_API_KEY=your_key          # https://console.anthropic.com/ (AI features)
FRED_API_KEY=your_key               # https://fred.stlouisfed.org/docs/api/api_key.html

# Optional
GOOGLE_CLIENT_ID=your_id            # Google OAuth (production auth)
GOOGLE_CLIENT_SECRET=your_secret
FMP_API_KEY=your_key                # https://financialmodelingprep.com/ (earnings)
```

See [`.env.example`](.env.example) for the full list of configuration options.

### Running (Development)

```bash
# Start the backend (port 3000)
npm run dev

# In a separate terminal, start the frontend (port 3001)
cd frontend && npm start
```

### Running (Docker)

```bash
# Start all services (API, PostgreSQL, Redis, Scheduler)
docker-compose up

# Or build and run standalone
npm run docker:build
npm run docker:run
```

## Project Structure

```
.
├── src/                        # Backend source code
│   ├── api/
│   │   ├── server.js           # Express app entry point
│   │   └── routes/             # 83 API route modules
│   ├── services/               # Business logic layer (105 services)
│   ├── lib/                    # Core utilities (db, logger, migrations)
│   ├── middleware/              # Express middleware (auth, rate limit, CSRF)
│   ├── jobs/                   # Background job schedulers
│   ├── scrapers/               # Data scraping modules
│   ├── config/                 # Configuration management
│   └── database-migrations/    # 138 database migrations
├── frontend/                   # React frontend
│   └── src/
│       ├── components/         # 103 reusable UI components
│       ├── pages/              # 64 page components
│       ├── hooks/              # Custom React hooks
│       ├── context/            # State management
│       └── services/           # API client layer
├── python-services/            # Python data fetchers and scrapers
├── scripts/                    # Operational and utility scripts
├── tests/                      # Test suite (Jest)
├── docs/                       # Documentation
│   ├── architecture/           # System design docs
│   ├── guides/                 # Developer and deployment guides
│   ├── api/                    # API reference
│   └── legal/                  # Legal policies
└── knowledge_base/             # Investment research reference data
```

## API Overview

The backend exposes 83 RESTful API endpoints organized by domain. Key endpoint groups:

| Group | Path | Description |
|-------|------|-------------|
| **Companies** | `/api/companies` | Company data, financials, metrics |
| **Prices** | `/api/prices` | Stock prices and historical data |
| **Portfolios** | `/api/portfolios` | Portfolio CRUD and performance |
| **Screening** | `/api/screening` | Multi-factor stock screening |
| **AI Analyst** | `/api/analyst` | AI-powered stock analysis |
| **Factors** | `/api/factors` | Custom factor analysis |
| **Congressional** | `/api/congressional` | Congressional trading data |
| **Backtesting** | `/api/backtesting` | Strategy backtesting |

See [docs/api/endpoints.md](docs/api/endpoints.md) for the complete API reference.

## Development

### Testing

```bash
npm test                    # Run Jest test suite
npm run test:coverage       # Run with coverage report
npm run test:postgresql     # PostgreSQL integration tests
npm run test:unified        # Unified strategy tests
```

### Linting

```bash
npm run lint                # ESLint check
npm run lint:fix            # Auto-fix lint issues
npm run format:check        # Prettier format check
```

### Database Migrations

```bash
npm run db:migrate          # Run pending migrations
npm run db:migrate:status   # Show migration status
```

### Background Jobs

```bash
npm run scheduler           # Start the master scheduler
npm run price-update        # Run a one-off price update
```

### Coding Conventions

See [docs/AGENTS.md](docs/AGENTS.md) for detailed coding conventions, including:
- Frontend: React components, CSS design system, PropTypes
- Backend: Async database access patterns, service layer architecture
- Database: PostgreSQL-compatible SQL with automatic SQLite dialect conversion

## Deployment

The application is configured for deployment on [Railway](https://railway.app):

```bash
# Production start (validates env, runs migrations, starts scheduler + API)
npm run start:production
```

See [docs/guides/deployment.md](docs/guides/deployment.md) for the full deployment guide including:
- Railway configuration
- Environment variable setup
- Docker deployment
- CI/CD pipeline

## Architecture

The system follows a layered architecture:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   React UI  │────▶│  Express API │────▶│    Services      │
│  (frontend) │     │  (83 routes) │     │  (business logic)│
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
                    │ (background  │
                    │   jobs)      │     ┌──────────────────┐
                    └──────────────┘     │  Python Services │
                                        │  (scrapers, data │
                    ┌──────────────┐     │   fetchers)      │
                    │  Claude API  │     └──────────────────┘
                    │  (AI analyst)│
                    └──────────────┘
```

See [docs/architecture/overview.md](docs/architecture/overview.md) for detailed architecture documentation.

## Contributing

1. Follow the coding conventions in [docs/AGENTS.md](docs/AGENTS.md)
2. Write tests for new features
3. Run `npm test` and `npm run lint` before committing
4. Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`)

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.
