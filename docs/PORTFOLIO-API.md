# Portfolio Platform API Documentation

This document describes the complete API for the Portfolio Management Platform, built by three agents:
- **Agent 1**: Core Portfolio Engine (portfolios, positions, trading, orders, alerts)
- **Agent 2**: Analytics & Simulation (performance metrics, backtesting, Monte Carlo, stress testing)
- **Agent 3**: Famous Investors & Frontend (13F parsing, investor tracking, cloning, React components)

Base URL: `http://localhost:3000/api`

---

## Agent 1: Portfolio Management

### Portfolios

#### List All Portfolios
```
GET /portfolios
```
Returns all non-archived portfolios with summary data.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "portfolios": [
    {
      "id": 1,
      "name": "My Portfolio",
      "portfolio_type": "manual",
      "current_cash": 25000,
      "current_value": 127758.15,
      "positions_count": 4
    }
  ]
}
```

#### Get Portfolio Summaries
```
GET /portfolios/summaries
```
Returns condensed summaries for all portfolios (ideal for dashboard).

#### Create Portfolio
```
POST /portfolios
```
**Body:**
```json
{
  "name": "My New Portfolio",
  "description": "Investment portfolio",
  "portfolioType": "manual",
  "initialCash": 100000,
  "currency": "USD",
  "benchmarkIndexId": 1
}
```

#### Get Portfolio Details
```
GET /portfolios/:id
```
Returns full portfolio summary including positions, performance, and orders.

#### Update Portfolio
```
PUT /portfolios/:id
```

#### Delete Portfolio
```
DELETE /portfolios/:id
```

---

### Trading

#### Execute Trade
```
POST /portfolios/:id/trade
```
**Body:**
```json
{
  "companyId": 1,
  "side": "buy",
  "shares": 100,
  "pricePerShare": 150.00,
  "lotMethod": "fifo",
  "notes": "Adding to position"
}
```

**Lot Methods:** `fifo`, `lifo`, `hifo`, `specific`

#### Validate Trade
```
POST /portfolios/:id/validate-trade
```
Preview a trade before execution.

#### Deposit Cash
```
POST /portfolios/:id/deposit
```
**Body:** `{ "amount": 10000 }`

#### Withdraw Cash
```
POST /portfolios/:id/withdraw
```
**Body:** `{ "amount": 5000 }`

---

### Positions

#### Get Positions
```
GET /portfolios/:id/positions
```
Returns all current positions with P&L calculations.

#### Get Lots
```
GET /portfolios/:id/positions/:companyId/lots
```
Returns individual tax lots for a position.

---

### Transactions

#### Get Transactions
```
GET /portfolios/:id/transactions?limit=50&offset=0&type=buy
```

**Transaction Types:** `buy`, `sell`, `dividend`, `deposit`, `withdraw`, `split`, `fee`

---

### Standing Orders

#### List Orders
```
GET /portfolios/:id/orders?status=active
```

#### Create Order
```
POST /portfolios/:id/orders
```
**Body:**
```json
{
  "companyId": 1,
  "orderType": "stop_loss",
  "triggerPrice": 140.00,
  "shares": 50,
  "expiresAt": "2024-12-31"
}
```

**Order Types:** `stop_loss`, `take_profit`, `limit_buy`, `limit_sell`, `trailing_stop`

#### Cancel Order
```
DELETE /portfolios/:id/orders/:orderId
```

---

### Portfolio Alerts

#### Get Alerts
```
GET /portfolios/:id/alerts
```

#### Get All Unread Alerts
```
GET /portfolios/alerts?limit=20
```

#### Mark Alert as Read
```
POST /portfolios/:id/alerts/:alertId/read
```

#### Dismiss Alert
```
POST /portfolios/:id/alerts/:alertId/dismiss
```

#### Get/Update Alert Settings
```
GET /portfolios/:id/alert-settings
PUT /portfolios/:id/alert-settings
```

**Alert Types:**
- `drawdown_threshold` - Portfolio drops X% from high
- `position_concentration` - Single position exceeds X% of portfolio
- `daily_gain` / `daily_loss` - Portfolio moves X% in a day
- `new_high` - Portfolio reaches all-time high
- `cash_low` - Cash balance below threshold

---

### Snapshots

#### Take Snapshot
```
POST /portfolios/:id/snapshots
```

#### Get Snapshots
```
GET /portfolios/:id/snapshots?limit=30
```

#### Take All Snapshots
```
POST /portfolios/snapshots/create-all
```

---

## Agent 2: Analytics & Simulation

### Performance Metrics

#### Get Portfolio Performance
```
GET /simulate/portfolios/:id/performance?period=1y
```

**Periods:** `1m`, `3m`, `6m`, `1y`, `3y`, `5y`, `ytd`, `all`

**Response includes:**
- Total value, cash balance, positions value
- Unrealized P&L (absolute and %)
- Period returns (1m, 3m, 6m, 1y, YTD)
- Today's change

#### Get Allocation Breakdown
```
GET /simulate/portfolios/:id/allocation
```

Returns breakdown by:
- Position (with weights and P&L)
- Sector
- Market cap
- Concentration metrics (HHI, top 5 weight)

#### Get Risk Metrics
```
GET /simulate/portfolios/:id/risk
```

#### Get Correlation Matrix
```
GET /simulate/portfolios/:id/correlation
```

#### Get Diversification Score
```
GET /simulate/portfolios/:id/diversification
```

---

### Backtesting

#### Run Backtest
```
POST /simulate/backtest
```
**Body:**
```json
{
  "allocations": [
    { "symbol": "AAPL", "weight": 0.5 },
    { "symbol": "MSFT", "weight": 0.5 }
  ],
  "startDate": "2020-01-01",
  "endDate": "2024-01-01",
  "initialValue": 100000,
  "rebalanceFrequency": "quarterly",
  "reinvestDividends": true,
  "benchmarkIndexId": 1
}
```

**Rebalance Frequencies:** `daily`, `weekly`, `monthly`, `quarterly`, `annually`, `never`

**Response includes:**
- Final value, total return %, CAGR
- Volatility, Sharpe ratio, Sortino ratio
- Max drawdown with dates
- Alpha, beta, tracking error
- Annual returns breakdown
- Value series for charting
- Drawdown series

#### List Saved Backtests
```
GET /simulate/backtests
```

#### Get Backtest Result
```
GET /simulate/backtest/:id
```

---

### Monte Carlo Simulation

#### Run Monte Carlo
```
POST /simulate/monte-carlo
```
**Body:**
```json
{
  "portfolioId": 1,
  "simulationCount": 10000,
  "timeHorizonYears": 30,
  "returnModel": "historical",
  "initialValue": 500000,
  "annualContribution": 50000,
  "annualWithdrawal": 0,
  "inflationRate": 0.025
}
```

**Return Models:** `historical`, `parametric`, `forecasted`

**Response includes:**
- Percentile outcomes (5th, 25th, 50th, 75th, 95th)
- Success probability (not running out of money)
- Distribution statistics
- Confidence intervals

#### List Monte Carlo Simulations
```
GET /simulate/monte-carlo
```

---

### Position Sizing

#### Calculate Position Size
```
POST /simulate/position-size
```
**Body:**
```json
{
  "method": "fixed_risk",
  "portfolioValue": 100000,
  "entryPrice": 150,
  "stopLossPrice": 140,
  "maxRiskPct": 2
}
```

**Methods:**
- `fixed_risk` - Risk a fixed percentage per trade
- `kelly` - Kelly Criterion for optimal sizing
- `equal_weight` - Equal weight across positions
- `volatility_based` - Size based on position volatility
- `percent_of_portfolio` - Simple percentage allocation

---

### Stress Testing

#### Get Stress Test Scenarios
```
GET /simulate/stress-test/scenarios
```

Returns predefined historical scenarios:
- 2008 Financial Crisis
- COVID Crash 2020
- Dot-Com Bust
- Black Monday 1987
- 2022 Bear Market
- And more...

#### Run Stress Test
```
POST /simulate/stress-test
```
**Body:**
```json
{
  "portfolioId": 1,
  "scenarioId": "financial_crisis_2008"
}
```

---

### Rebalancing

#### Get Rebalance Templates
```
GET /simulate/rebalance-templates
```

Returns common allocation templates:
- 60/40 stocks/bonds
- All-weather portfolio
- S&P 500 mirror
- And more...

#### Calculate Rebalance
```
POST /simulate/rebalance
```

---

### Risk/Reward Analysis

#### Analyze Risk/Reward
```
POST /simulate/risk-reward
```
**Body:**
```json
{
  "entryPrice": 100,
  "stopLossPrice": 90,
  "takeProfitPrice": 120
}
```

---

### API Methods Reference

#### Get Available Methods
```
GET /simulate/methods
```
Returns documentation for all simulation methods and their parameters.

---

## Agent 3: Famous Investors & 13F

### Investors

#### List All Investors
```
GET /investors
```

**Response:**
```json
{
  "success": true,
  "count": 16,
  "investors": [
    {
      "id": 1,
      "name": "Warren Buffett",
      "fund_name": "Berkshire Hathaway",
      "cik": "0001067983",
      "investment_style": "value",
      "description": "The legendary value investor...",
      "latest_portfolio_value": 352000000000,
      "latest_positions_count": 45
    }
  ]
}
```

#### Get Investor Details
```
GET /investors/:id
```

#### Get Investor Holdings
```
GET /investors/:id/holdings?limit=100&sortBy=market_value&sortOrder=DESC
```

Returns current quarter holdings with:
- Security name, CUSIP, shares
- Market value, weight in portfolio
- Voting authority breakdown

#### Get Holding Changes
```
GET /investors/:id/changes
```

Returns changes from latest filing:
- New positions
- Increased positions
- Decreased positions
- Sold positions (exited)

#### Get Holdings History
```
GET /investors/:id/history?periods=4
```

Track positions over multiple quarters.

#### Get Investor Stats
```
GET /investors/:id/stats
```

Analytics including:
- Sector allocation
- Top positions
- Turnover rate
- Average holding period

---

### Investor Discovery

#### Get Most Owned Stocks
```
GET /investors/most-owned?limit=20
```

Stocks owned by the most famous investors.

#### Get Recent Activity
```
GET /investors/activity?limit=50
```

Recent buys/sells across all tracked investors.

#### Get Investors by Stock
```
GET /investors/by-stock/:symbol
```

Which famous investors own a specific stock.

---

### Portfolio Cloning

#### Clone Preview
```
GET /investors/:id/clone-preview?amount=50000&minWeight=1&maxPositions=20
```

Preview how a cloned portfolio would look.

#### Clone to Portfolio
```
POST /investors/:id/clone
```
**Body:**
```json
{
  "portfolioName": "Buffett Clone",
  "initialValue": 50000,
  "minWeight": 1,
  "maxPositions": 20
}
```

Creates a new portfolio mimicking the investor's holdings.

---

### 13F Data Management

#### Fetch 13F for Investor
```
POST /investors/:id/fetch-13f
```

Manually trigger SEC 13F fetch for an investor.

#### Fetch All 13Fs
```
POST /investors/fetch-all-13f
```

Trigger 13F fetch for all active investors.

---

## Background Jobs

The platform includes several automated background jobs:

### Order Executor
- **Schedule:** Weekdays at 6:30 PM ET
- **Function:** Executes triggered orders (stop loss, take profit, etc.)
- **File:** `src/jobs/orderExecutor.js`

### Snapshot Creator
- **Schedule:** Weekdays at 7:00 PM ET
- **Function:** Creates daily portfolio snapshots
- **File:** `src/jobs/snapshotCreator.js`

### Portfolio Monitor
- **Schedule:** Weekdays at 6:35 PM ET
- **Function:** Checks alert conditions
- **File:** `src/jobs/portfolioMonitor.js`

### 13F Fetcher
- **Schedule:** 15th of Feb, May, Aug, Nov + weekly Sunday check
- **Function:** Updates investor holdings from SEC filings
- **File:** `src/jobs/investor13FRefresh.js`

---

## Frontend API Services

The frontend uses these API service modules in `frontend/src/services/api.js`:

```javascript
import {
  portfoliosAPI,    // Portfolio CRUD, trading, orders
  simulateAPI,      // Performance, backtesting, Monte Carlo
  investorsAPI      // Famous investors, 13F data, cloning
} from './services/api';
```

### Example Usage

```javascript
// Create portfolio
const portfolio = await portfoliosAPI.create({
  name: 'My Portfolio',
  initialCash: 100000
});

// Execute trade
await portfoliosAPI.trade(portfolioId, {
  companyId: 1,
  side: 'buy',
  shares: 100,
  pricePerShare: 150
});

// Get performance metrics
const performance = await simulateAPI.getPerformance(portfolioId, '1y');

// Run backtest
const backtest = await simulateAPI.runBacktest({
  allocations: [{ symbol: 'AAPL', weight: 0.6 }, { symbol: 'MSFT', weight: 0.4 }],
  startDate: '2020-01-01',
  endDate: '2024-01-01',
  initialValue: 100000
});

// Get famous investors
const investors = await investorsAPI.getAll();

// Clone investor portfolio
await investorsAPI.clone(investorId, {
  portfolioName: 'Buffett Clone',
  initialValue: 50000
});
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Server Error

---

## Testing

Run the integration test suite:

```bash
./scripts/test-portfolio-platform.sh
```

This tests all 33 endpoints across all three agent domains.
