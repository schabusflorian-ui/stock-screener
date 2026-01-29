# Agent 1: Data Requirements for Hedge Fund Trading System

## Overview

Agent 2 (Trading Logic & Orchestration) has implemented hedge fund-grade trading infrastructure. This document specifies the data Agent 1 needs to fetch/calculate to fully power these capabilities.

---

## Priority 1: Market Regime Data (Critical)

The regime detection system needs accurate, timely market indicators.

### Required Data Sources

```javascript
// Market Regime Indicators needed in market_sentiment table
{
  // VIX - CRITICAL for volatility regime
  indicator_type: 'vix',
  indicator_value: 14.95,  // Current VIX level
  indicator_label: 'Low',   // Low/Normal/Elevated/High/Extreme

  // CNN Fear & Greed Index
  indicator_type: 'cnn_fear_greed',
  indicator_value: 44,     // 0-100 scale
  indicator_label: 'Fear', // Extreme Fear/Fear/Neutral/Greed/Extreme Greed

  // Market Breadth - NEW NEEDED
  indicator_type: 'market_breadth',
  indicator_value: 62,     // % of stocks above 50-day MA
  indicator_label: 'Neutral',

  // Advance/Decline Ratio - NEW NEEDED
  indicator_type: 'advance_decline',
  indicator_value: 1.4,    // Ratio of advancing to declining stocks
  indicator_label: 'Bullish',

  // Put/Call Ratio - NEW NEEDED
  indicator_type: 'put_call_ratio',
  indicator_value: 0.85,   // Options market sentiment
  indicator_label: 'Neutral',

  // Credit Spreads - NEW NEEDED
  indicator_type: 'high_yield_spread',
  indicator_value: 3.5,    // HY - Treasury spread in %
  indicator_label: 'Normal',
}
```

### API Sources
- VIX: CBOE or Yahoo Finance (^VIX)
- Fear & Greed: CNN API or scrape
- Breadth: Calculate from price data or use Finviz
- Put/Call: CBOE
- Credit Spreads: FRED API (BAMLH0A0HYM2)

---

## Priority 2: Signal Quality Data (High)

For signal IC (Information Coefficient) calculation and signal decay tracking.

### Required: Forward Returns Tracking

Agent 2 calculates signal predictive power by comparing recommendations to forward returns.

```sql
-- Ensure daily_prices is updated daily for all tracked companies
-- Agent 2 needs: 5-day, 10-day, 20-day forward returns from signal date

-- Verify prices are current
SELECT c.symbol, MAX(dp.date) as last_price_date
FROM companies c
LEFT JOIN daily_prices dp ON c.id = dp.company_id
GROUP BY c.id
HAVING last_price_date < date('now', '-2 days');
```

### Required: Signal Timestamps

Ensure all signal sources have accurate timestamps:
- `combined_sentiment.calculated_at`
- `insider_activity_summary.last_updated`
- `analyst_estimates.last_updated`
- `price_metrics.calculated_at`

---

## Priority 3: Factor Data for Optimization (High)

HRP and Efficient Frontier need return data.

### Required: Historical Returns

```sql
-- Need at least 252 days of returns for:
-- 1. Covariance matrix calculation
-- 2. VaR estimation
-- 3. Efficient frontier optimization

-- Verify adequate history
SELECT c.symbol, COUNT(*) as price_days
FROM companies c
JOIN daily_prices dp ON c.id = dp.company_id
WHERE dp.date >= date('now', '-365 days')
GROUP BY c.id
HAVING price_days < 200;
```

### Required: Sector/Industry Classification

For sector-based risk parity and constraint optimization:
- Ensure `companies.sector` is populated
- Ensure `companies.industry` is populated
- Use GICS classification if possible

---

## Priority 4: Transaction Cost Inputs (Medium)

### Required: Liquidity Data

```javascript
// For each company, calculate/store:
{
  avg_daily_volume_30d: 15000000,  // Shares traded
  avg_daily_value_30d: 450000000,  // Dollar volume
  bid_ask_spread_bps: 5,           // Typical spread in basis points
  volatility_30d: 0.25,            // 30-day annualized volatility
}
```

### API Sources
- Volume: Already in daily_prices
- Spread: IEX Cloud or calculate from OHLC
- Volatility: Calculate from returns

### Suggested Table Addition

```sql
CREATE TABLE IF NOT EXISTS liquidity_metrics (
  company_id INTEGER PRIMARY KEY,
  avg_volume_30d REAL,
  avg_value_30d REAL,
  bid_ask_spread_bps REAL,
  volatility_30d REAL,
  amihud_illiquidity REAL,  -- Price impact per $ traded
  turnover_ratio REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

---

## Priority 5: Benchmark Data (Medium)

### Required: Index Prices

For alpha calculation and benchmark comparison:
- S&P 500 (SPY or ^GSPC)
- Nasdaq (QQQ or ^IXIC)
- Russell 2000 (IWM or ^RUT)
- Sector ETFs for factor attribution

```sql
-- Verify benchmark data is current
SELECT mi.name, MAX(mip.date) as last_date
FROM market_indices mi
LEFT JOIN market_index_prices mip ON mi.id = mip.index_id
GROUP BY mi.id;
```

---

## Priority 6: Economic Indicators (Lower)

For macro regime detection enhancement:

### Suggested Data
- 10Y Treasury Yield (for risk-free rate in optimization)
- Unemployment Claims
- ISM Manufacturing PMI
- GDP Growth Rate

### API Sources
- FRED API for all economic data

---

## Data Refresh Schedule

| Data Type | Frequency | Priority |
|-----------|-----------|----------|
| VIX, Fear/Greed | Every 15 min during market hours | Critical |
| Daily Prices | End of day | Critical |
| Market Breadth | Daily | High |
| Sentiment Data | Every 4 hours | High |
| Insider Activity | Daily | Medium |
| Analyst Estimates | Weekly | Medium |
| Liquidity Metrics | Daily | Medium |
| Economic Indicators | Weekly | Lower |

---

## Validation Queries

Run these to verify data readiness:

```sql
-- 1. Check regime data freshness
SELECT indicator_type, MAX(fetched_at) as last_fetch
FROM market_sentiment
GROUP BY indicator_type;

-- 2. Check price data coverage
SELECT
  COUNT(DISTINCT company_id) as companies_with_prices,
  MIN(date) as earliest,
  MAX(date) as latest
FROM daily_prices;

-- 3. Check signal data availability
SELECT
  (SELECT COUNT(*) FROM combined_sentiment WHERE calculated_at >= date('now', '-1 day')) as fresh_sentiment,
  (SELECT COUNT(*) FROM insider_activity_summary WHERE last_updated >= date('now', '-7 days')) as fresh_insider,
  (SELECT COUNT(*) FROM analyst_estimates) as analyst_coverage;

-- 4. Check for missing sectors
SELECT COUNT(*) as missing_sectors
FROM companies
WHERE sector IS NULL OR sector = '';
```

---

## Summary for Agent 1

**Immediate Actions Needed:**
1. Add market breadth indicator (% above 50-day MA)
2. Add put/call ratio to market_sentiment
3. Verify daily price updates are running
4. Calculate and store 30-day volatility per stock

**Short-term Actions:**
5. Create liquidity_metrics table and populate
6. Add credit spread monitoring
7. Ensure sector classification is complete

**The trading logic is ready** - these data improvements will unlock the full hedge fund capability.
