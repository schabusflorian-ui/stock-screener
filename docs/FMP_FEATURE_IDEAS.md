# FMP API Feature Ideas

Based on exploring the Financial Modeling Prep API, here are potential features we could implement.

## API Limits
- **Free tier**: 250 calls/day
- **Starter**: 300 calls/day ($14/mo)
- **Professional**: Unlimited ($29/mo)

---

## High Priority Features (High Value, Unique Data)

### 1. Financial Health Scores
**Endpoint**: `/financial-scores`
**API Calls**: 1 per company

Add two powerful financial health indicators:

- **Altman Z-Score**: Bankruptcy prediction model
  - Z > 2.99: Safe zone
  - 1.81 < Z < 2.99: Grey zone
  - Z < 1.81: Distress zone

- **Piotroski F-Score**: Value investing score (0-9)
  - Score 8-9: Strong fundamentals
  - Score 0-2: Weak fundamentals

**Implementation**: Add to screening page as filters, show on company page as badges.

### 2. Revenue Segmentation
**Endpoints**:
- `/revenue-product-segmentation`
- `/revenue-geographic-segmentation`
**API Calls**: 2 per company

Show breakdown of:
- Revenue by product line (e.g., Apple: iPhone 52%, Services 24%, Mac 10%, etc.)
- Revenue by geography (e.g., Americas 42%, Europe 25%, China 19%, etc.)

**Implementation**: New visualization on company page showing pie charts and trends over time.

### 3. Earnings Calendar & Surprises
**Endpoints**:
- `/earnings-calendar` - Upcoming earnings dates
- `/earnings-surprises-bulk` - Historical beat/miss data
**API Calls**: 1-2 per query

Features:
- Calendar view of upcoming earnings
- Track earnings beats/misses history
- Alert when watchlist companies report

**Implementation**: New "Earnings" page, add earnings date to company page.

### 4. Insider Trading Activity
**Endpoints**:
- `/insider-trading/latest`
- `/insider-trading/statistics`
**API Calls**: 1-2 per query

Track:
- Recent insider buys/sells
- Aggregate insider sentiment
- Notable transactions (large purchases/sales)

**Implementation**: Add insider activity section to company page, create insider trading screener.

---

## Medium Priority Features

### 5. Stock Quote Data (Price, Market Cap)
**Endpoint**: `/quote`
**API Calls**: 1 per company

This would enable:
- All valuation metrics (P/E, P/B, P/S, EV/EBITDA)
- Market cap for screening
- Daily price change tracking

**Implementation**: Daily job to update prices for watchlist/top companies.

### 6. Analyst Estimates & Price Targets
**Endpoints**:
- `/analyst-estimates`
- `/price-target`
- `/analyst-stock-recommendations`
**API Calls**: 2-3 per company

Show:
- Consensus EPS/revenue estimates
- Price target (high, low, average)
- Buy/Hold/Sell ratings distribution

**Implementation**: Add "Analyst" section to company page.

### 7. Congressional & Senate Trading
**Endpoints**:
- `/senate-trades`
- `/house-trades`
**API Calls**: 1-2 per query

Track what politicians are buying/selling. This is unique data not easily found elsewhere.

**Implementation**: New "Political Trading" page showing recent trades.

### 8. DCF Valuation
**Endpoints**:
- `/discounted-cash-flow`
- `/advanced-dcf`
**API Calls**: 1 per company

Get FMP's intrinsic value calculation and compare to current price.

**Implementation**: Show "Fair Value" estimate on company page with margin of safety.

---

## Lower Priority (Nice to Have)

### 9. ETF Holdings
**Endpoint**: `/etf-holdings`
Show which ETFs hold a given stock and at what weight.

### 10. Sector Performance
**Endpoint**: `/sector-performance`
Real-time sector performance data for market overview page.

### 11. IPO Calendar
**Endpoint**: `/ipo-calendar`
Track upcoming IPOs.

### 12. Stock Splits & Dividends Calendar
**Endpoints**: `/stock-split-calendar`, `/dividends-calendar`
Track corporate actions.

### 13. Economic Calendar
**Endpoint**: `/economic-calendar`
Upcoming economic releases (GDP, jobs report, etc.)

---

## Implementation Strategy

Given the 250 calls/day limit, prioritize:

1. **One-time enrichment**: Run once to populate scores, segmentation
2. **Periodic updates**: Weekly update for analyst estimates, insider trading
3. **On-demand**: Fetch when user views a specific company

### Suggested Daily API Budget:
- Stock quotes (price update): 100 calls (top 100 stocks by volume)
- Validation/testing: 50 calls
- On-demand company views: 50 calls
- Buffer: 50 calls

---

## Quick Wins (Can Implement Now)

1. **Financial Scores** - Just add Altman Z and Piotroski to our metrics
2. **Validation** - Use FMP as second source of truth for metric accuracy
3. **Quote data** - Start populating market cap to enable valuation metrics

---

## Database Schema Additions Needed

```sql
-- Financial scores
ALTER TABLE calculated_metrics ADD COLUMN altman_z_score REAL;
ALTER TABLE calculated_metrics ADD COLUMN piotroski_score INTEGER;

-- Revenue segmentation (new table)
CREATE TABLE revenue_segments (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  fiscal_year INTEGER,
  segment_type TEXT, -- 'product' or 'geography'
  segment_name TEXT,
  revenue REAL,
  percentage REAL
);

-- Earnings calendar
CREATE TABLE earnings_events (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  date DATE,
  eps_estimated REAL,
  eps_actual REAL,
  revenue_estimated REAL,
  revenue_actual REAL,
  surprise_percent REAL
);

-- Insider trading
CREATE TABLE insider_trades (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  filing_date DATE,
  transaction_date DATE,
  insider_name TEXT,
  insider_title TEXT,
  transaction_type TEXT, -- 'buy', 'sell', 'option'
  shares INTEGER,
  price REAL,
  value REAL
);
```
