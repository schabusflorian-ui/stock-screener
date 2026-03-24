# API Endpoints Reference

All endpoints are prefixed with `/api/` and return JSON responses.

## Authentication

Most endpoints require authentication. In development with `ALLOW_DEV_AUTH=true`, authentication is bypassed. In production, Google OAuth is used.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/google` | Initiate Google OAuth flow |
| GET | `/api/auth/google/callback` | OAuth callback |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Current user info |

## Core Data

### Companies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/companies` | List companies with filtering |
| GET | `/api/companies/:id` | Company details |
| GET | `/api/companies/:id/financials` | Financial statements |
| GET | `/api/companies/:id/metrics` | Key financial metrics |

### Prices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/prices/:ticker` | Current and historical prices |
| GET | `/api/prices/:ticker/history` | Price history |
| POST | `/api/price-updates/trigger` | Trigger price refresh |

### Dividends

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dividends/:ticker` | Dividend history |
| GET | `/api/dividends/:ticker/yield` | Yield analysis |

### Earnings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/earnings/calendar` | Upcoming earnings dates |
| GET | `/api/earnings/:ticker` | Earnings history |
| GET | `/api/transcripts/:ticker` | Earnings call transcripts |

## Screening & Analysis

### Stock Screening

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/screening` | Screen stocks with filters |
| GET | `/api/screening/presets` | Predefined screen presets |

### Factors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/factors` | List custom factors |
| POST | `/api/factors` | Create custom factor |
| GET | `/api/factors/:id/scores` | Factor scores for universe |
| POST | `/api/factors/backtest` | Backtest factor performance |

### AI Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyst/analyze` | AI stock analysis |
| GET | `/api/ai-ratings/:ticker` | AI-generated ratings |
| POST | `/api/nl/query` | Natural language query |
| GET | `/api/recommendations` | AI recommendations |

### Valuation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dcf/:ticker` | DCF valuation model |
| GET | `/api/signals/:ticker` | Trading signals |

## Portfolio Management

### Portfolios

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portfolios` | List user portfolios |
| POST | `/api/portfolios` | Create portfolio |
| GET | `/api/portfolios/:id` | Portfolio details |
| GET | `/api/portfolios/:id/performance` | Portfolio performance |
| GET | `/api/portfolios/:id/attribution` | Return attribution |

### Watchlist

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/watchlist` | Get watchlist |
| POST | `/api/watchlist` | Add to watchlist |
| DELETE | `/api/watchlist/:ticker` | Remove from watchlist |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes/:ticker` | Get notes for company |
| POST | `/api/notes` | Create note |
| PUT | `/api/notes/:id` | Update note |

## Alternative Data

### Congressional Trading

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/congressional` | Congressional trades |
| GET | `/api/congressional/summary` | Trade summary by politician |

### Insider Trading

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/insiders/:ticker` | Insider trades for company |

## Market Data

### Indices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/indices` | Market index data |
| GET | `/api/etfs` | ETF data |

### Macro

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/macro/indicators` | Macroeconomic indicators (FRED) |
| GET | `/api/macro/historical` | Historical macro data |

## Strategy & Backtesting

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/backtesting/run` | Run backtest |
| GET | `/api/backtesting/results` | Backtest results |
| GET | `/api/strategies` | List strategies |
| POST | `/api/optimization/run` | Portfolio optimization |

## System

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic health check (bypasses middleware) |
| GET | `/api/health` | API health check |
| GET | `/api/health/detailed` | Detailed system status |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List users (admin only) |
| GET | `/api/system/status` | System diagnostics |
| GET | `/api/cache/stats` | Cache statistics |

## Response Format

Successful responses:
```json
{
  "data": { ... }
}
```

Error responses:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

## Rate Limiting

- Global: 200 requests per minute per IP
- AI endpoints: Additional budget-based limits
- Configurable via `RATE_LIMIT_*` environment variables
