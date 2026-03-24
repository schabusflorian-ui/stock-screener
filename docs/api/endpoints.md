# API Endpoints Reference

All endpoints are prefixed with `/api/` and return JSON responses. The API follows RESTful conventions: `GET` for reads, `POST` for creates/actions, `PUT` for updates, `DELETE` for removals.

## Authentication

Most endpoints require authentication. In development with `ALLOW_DEV_AUTH=true`, authentication is bypassed and requests are treated as an admin user. In production, Google OAuth 2.0 is used with session-based persistence.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/google` | Initiates Google OAuth 2.0 flow -- redirects to Google consent screen |
| GET | `/api/auth/google/callback` | OAuth callback -- exchanges authorization code for session token |
| POST | `/api/auth/logout` | Destroys the current session and clears session cookie |
| GET | `/api/auth/me` | Returns the authenticated user's profile, roles, and preferences |

## Core Data

### Companies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/companies` | List companies with pagination, search, sector/industry/country filters. Supports `?search=AAPL&sector=Technology&limit=50&offset=0` |
| GET | `/api/companies/:id` | Full company profile: master data, sector classification, exchange, market cap, and latest calculated metrics |
| GET | `/api/companies/:id/financials` | Annual and quarterly financial statements (income statement, balance sheet, cash flow). Supports `?period=annual&years=5` |
| GET | `/api/companies/:id/metrics` | Calculated financial metrics: ROIC, ROE, FCF yield, margins, valuation ratios, Piotroski F-Score, Altman Z-Score. Supports historical lookback |

### Prices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/prices/:ticker` | Current price data: last close, day change, volume, 52-week high/low, moving averages, RSI |
| GET | `/api/prices/:ticker/history` | Historical daily OHLCV data. Supports `?from=2020-01-01&to=2024-12-31` date range filtering |
| POST | `/api/price-updates/trigger` | Admin endpoint: triggers an immediate price refresh for all tracked companies or a specific ticker |

### Dividends

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dividends/:ticker` | Full dividend history: payment dates, amounts, frequency, ex-dates |
| GET | `/api/dividends/:ticker/yield` | Dividend yield analysis: current yield, trailing 12-month yield, payout ratio, growth rate, consecutive increase streak |

### Earnings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/earnings/calendar` | Upcoming earnings dates across all tracked companies. Supports `?days=30` for lookahead window |
| GET | `/api/earnings/:ticker` | Earnings history: EPS estimates vs actuals, surprise percentages, beat/miss streaks |
| GET | `/api/transcripts/:ticker` | Earnings call transcript text with AI-generated summaries. Supports `?quarter=Q3&year=2024` |

## Screening & Analysis

### Stock Screening

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/screening` | Multi-factor stock screener. Accepts 50+ metric filters (e.g., `?min_roic=15&max_pe=20&sector=Technology&region=US`), sorting (`?sort=roic&order=desc`), and pagination. Returns matching companies with all requested metrics |
| GET | `/api/screening/presets` | Returns the 12 built-in screen presets (Buffett, Value, Magic, Quality, Growth, Dividend, Fortress, Cigar Butts, Compounders, Flywheel, Forensic, Asymmetry) with their filter criteria |

### Factors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/factors` | List all custom factors defined by the authenticated user, with formulas and descriptions |
| POST | `/api/factors` | Create a new custom factor from a metric formula (e.g., `ROIC * 0.4 + FCF_YIELD * 0.3 + REVENUE_GROWTH * 0.3`) |
| GET | `/api/factors/:id/scores` | Factor scores for the entire stock universe, ranked by percentile. Supports sector-relative scoring |
| POST | `/api/factors/backtest` | Backtest a factor strategy: specify rebalancing frequency, long/short, number of holdings, and date range. Returns CAGR, Sharpe, max drawdown, and monthly return series |

### AI Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyst/analyze` | Generate a Claude-powered PRISM analysis for a company. Returns structured scores across profitability, risk, intrinsic value, sustainability, and management quality |
| GET | `/api/ai-ratings/:ticker` | Retrieve cached AI-generated ratings and analysis history for a company |
| POST | `/api/nl/query` | Natural language query endpoint. Accepts plain-English questions (e.g., "What are the top 5 stocks by ROIC in the tech sector?") and returns structured results |
| GET | `/api/recommendations` | List agent-generated buy/sell/hold recommendations with confidence scores, signal breakdowns, and outcome tracking |

### Valuation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dcf/:ticker` | Run a discounted cash flow valuation model. Accepts growth rate, discount rate, and terminal multiple assumptions. Returns intrinsic value estimate and margin of safety |
| GET | `/api/signals/:ticker` | Multi-signal score for a company: aggregated technical, fundamental, sentiment, insider, and alternative data signals with individual category breakdowns |

## Portfolio Management

### Portfolios

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolios` | List all portfolios for the authenticated user with summary metrics (total value, day change, total return) |
| POST | `/api/portfolios` | Create a new portfolio with name, strategy type, benchmark, and initial positions |
| GET | `/api/portfolios/:id` | Portfolio detail: positions, weights, P&L per holding, sector allocation breakdown |
| GET | `/api/portfolios/:id/performance` | Portfolio performance: time-weighted return, alpha vs benchmark, Sharpe ratio, max drawdown, monthly return series |
| GET | `/api/portfolios/:id/attribution` | Return attribution: decomposes performance into stock selection, sector allocation, and interaction effects |

### Watchlist

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/watchlist` | Get the user's watchlist with current prices, day changes, and key metrics for each company |
| POST | `/api/watchlist` | Add a company to the watchlist with optional price alert thresholds |
| DELETE | `/api/watchlist/:ticker` | Remove a company from the watchlist |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/:ticker` | Get all research notes for a company, ordered by creation date |
| POST | `/api/notes` | Create a new research note attached to a company with optional thesis classification (bull/bear/neutral) |
| PUT | `/api/notes/:id` | Update an existing research note |

## Alternative Data

### Congressional Trading

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/congressional` | Congressional stock trades with filtering by politician, party, chamber, transaction type, date range, and minimum amount. Returns transaction details including filing delays |
| GET | `/api/congressional/summary` | Aggregated trading summary by politician: total trades, buy/sell ratio, top sectors, estimated portfolio value |

### Insider Trading

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/insiders/:ticker` | Insider transactions for a company: officer/director buys and sells from SEC Forms 3, 4, 5 with transaction sizes and filing dates |

## Market Data

### Indices & ETFs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/indices` | Major market index data: S&P 500, Nasdaq, Russell 2000, Dow Jones with current values, day change, and YTD performance |
| GET | `/api/etfs` | ETF data: price, volume, expense ratio, holdings count |

### Macro Indicators

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/macro/indicators` | Current macroeconomic indicators from FRED: GDP growth, CPI, unemployment rate, 10Y yield, VIX, yield curve spread, consumer sentiment |
| GET | `/api/macro/historical` | Historical macro time series. Supports `?indicator=GDP&from=2010-01-01` for specific indicators |

## Strategy & Backtesting

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/backtesting/run` | Run a portfolio strategy backtest: specify entry/exit rules, position sizing, rebalancing frequency, and date range. Returns CAGR, Sharpe, Sortino, max drawdown, and equity curve |
| GET | `/api/backtesting/results` | Retrieve saved backtest results for the authenticated user |
| GET | `/api/strategies` | List available strategy templates (DCA, DRIP, Value Averaging, Regime-Based, Unified Signals) |
| POST | `/api/optimization/run` | Run mean-variance portfolio optimization: specify target return or risk level, constraints (min/max weights, sector limits), and return the efficient frontier and optimal allocation |

## Trading Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List the user's configured trading agents with strategy type, signal weights, and active status |
| POST | `/api/agents` | Create a new trading agent with custom signal weights across 9 categories and risk parameters |
| GET | `/api/agents/:id` | Agent detail: configuration, recent recommendations, performance tracking |
| POST | `/api/agents/:id/run` | Execute the agent for a given stock universe: generates signals, rankings, and recommendations |

## System

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check (bypasses all middleware). Returns `{ status: "ok" }`. Used by Railway's healthcheck probe |
| GET | `/api/health` | API health check with database connectivity verification |
| GET | `/api/health/detailed` | Detailed system status: database connection pool stats, Redis connectivity, scheduler status, data freshness per bundle, LLM budget remaining |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users with roles and last active dates (admin only) |
| GET | `/api/system/status` | System diagnostics: memory usage, uptime, active connections, job queue depth |
| GET | `/api/cache/stats` | Cache statistics: hit/miss rates, memory usage, key counts |

## Response Format

All endpoints return consistent JSON structures:

**Successful responses:**
```json
{
  "data": { ... },
  "meta": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

**Error responses:**
```json
{
  "error": "Human-readable error message",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "ticker", "message": "Required" }
  ]
}
```

**HTTP status codes:**
- `200` -- Success
- `201` -- Created
- `400` -- Bad request (validation error)
- `401` -- Unauthorized (not authenticated)
- `403` -- Forbidden (insufficient permissions)
- `404` -- Not found
- `429` -- Rate limited (check `Retry-After` header)
- `500` -- Internal server error

## Rate Limiting

- **Global**: 100 requests per minute per IP (configurable via `RATE_LIMIT_MAX_REQUESTS`)
- **Auth endpoints**: 10 requests per minute (brute-force protection)
- **Heavy API endpoints**: 30 requests per minute (backtesting, optimization, AI analysis)
- **AI endpoints**: Additional budget-based limits (`LLM_DAILY_BUDGET`, `LLM_MONTHLY_BUDGET`)
- All rate-limited responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers
