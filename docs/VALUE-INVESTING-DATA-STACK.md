# Value Investing Data Stack

## Philosophy

This data infrastructure is designed for **long-term value investing**, not day trading. We prioritize:

1. **Fundamental quality** over price momentum
2. **Business durability** over short-term catalysts
3. **Margin of safety** over precise timing
4. **Patient compounding** over frequent trading

Daily or weekly data refresh is sufficient. Real-time data adds complexity without value for our strategy.

---

## Current Data Stack Status

### Core Data (Fully Operational)

| Layer | Coverage | Refresh | Status |
|-------|----------|---------|--------|
| **Financial Statements** | 4,956 companies | Quarterly | ✅ Complete |
| **Daily Prices** | 13.65M records | Daily | ✅ Complete |
| **Insider Activity** | Form 4 filings | ~2 day lag | ✅ Complete |
| **Analyst Estimates** | Major stocks | Daily | ✅ Complete |
| **Sentiment** | Reddit/News | Hourly | ✅ Complete |
| **Macro/FRED** | 49 series | Daily/Weekly | ✅ NEW - Complete |

### Macro Data Now Available

```
Yield Curve:
  2Y Treasury:     3.45%
  10Y Treasury:    4.14%
  30Y Treasury:    4.81%
  2s10s Spread:    0.69% (not inverted - healthy)

Risk Indicators:
  VIX:             14.33 (low - complacency)
  HY Spread:       2.84% (tight - risk-on)
  Fed Funds:       3.64%
  Unemployment:    4.60%
```

---

## Value Investing Data Priorities

### Tier 1: Critical for Value Investing (Have It)

| Data | Why It Matters | Status |
|------|---------------|--------|
| **Balance Sheet** | Asset values, debt levels, book value | ✅ |
| **Income Statement** | Earnings power, margins, growth | ✅ |
| **Cash Flow** | FCF, capital allocation, quality of earnings | ✅ |
| **Insider Buying** | Management conviction, skin in the game | ✅ |
| **Macro Context** | Cycle awareness, valuation anchoring | ✅ NEW |

### Tier 2: Valuable Additions (Planned)

| Data | Why It Matters | Priority |
|------|---------------|----------|
| **Management Guidance** | Forward expectations, credibility tracking | High |
| **Conference Call Transcripts** | Qualitative insights, tone analysis | High |
| **Industry Comparisons** | Relative valuation, competitive position | Medium |
| **Historical Valuation Ranges** | Mean reversion targets | Medium |
| **Dividend History** | Payout trends, sustainability | ✅ Have it |

### Tier 3: Nice to Have (Low Priority)

| Data | Why It Matters | Priority |
|------|---------------|----------|
| Credit Ratings | Debt quality (mostly for financials) | Low |
| Options Data | Not needed for value investing | Skip |
| Real-time Quotes | Not needed for long-term | Skip |
| Tick Data | Not needed | Skip |

---

## Value Investing Signals

### What We Track

**1. Valuation Signals**
- P/E, P/B, P/FCF vs history and peers
- EV/EBITDA, earnings yield
- Margin of safety to intrinsic value (DCF)

**2. Quality Signals**
- ROIC, ROE trends
- Debt/equity, interest coverage
- FCF conversion, working capital efficiency

**3. Insider Signals**
- Cluster buying (multiple insiders)
- CEO/CFO purchases (highest signal)
- Net buy/sell ratio

**4. Macro Context** ✅ NEW
- Yield curve shape (recession indicator)
- Credit spreads (risk appetite)
- VIX level (fear/greed)
- Economic cycle phase

---

## How Macro Data Informs Value Investing

### Yield Curve Interpretation

```
Current: 2s10s = +0.69% (Normal)

Implications:
- No imminent recession signal
- Safe to buy cyclicals if cheap
- Long-duration assets less risky
```

| Spread | Interpretation | Action |
|--------|---------------|--------|
| > 1.5% | Steep curve, early cycle | Favor cyclicals |
| 0.5-1.5% | Normal | Business as usual |
| 0-0.5% | Flat, late cycle | Favor quality |
| < 0% | Inverted, recession ahead | Defensive, raise cash |

### VIX Interpretation

```
Current: VIX = 14.33 (Low)

Implications:
- Market complacent
- Options cheap for hedging
- Be patient for better prices
```

| VIX | Interpretation | Action |
|-----|---------------|--------|
| < 15 | Complacency | Patience, no rush |
| 15-20 | Normal | Regular investing |
| 20-25 | Elevated | Opportunities forming |
| 25-30 | Fear | Good buying opportunities |
| > 30 | Crisis | Aggressive buying if quality |

### Credit Spreads

```
Current: HY Spread = 2.84% (Tight)

Implications:
- Credit markets healthy
- Risk appetite high
- No distress opportunities
```

| HY Spread | Interpretation | Action |
|-----------|---------------|--------|
| < 3.5% | Tight, risk-on | No distress opps |
| 3.5-5% | Normal | Selective credit |
| 5-7% | Widening | Distress emerging |
| > 7% | Stress | Special situations |

---

## Automated Value Screens

### Enhanced Screens with Macro Context

**Deep Value + Safe Macro**
```sql
-- Only when yield curve is not inverted
SELECT c.symbol, c.name,
       cm.pe_ratio, cm.pb_ratio, cm.fcf_yield,
       cm.roic, cm.debt_to_equity
FROM companies c
JOIN calculated_metrics cm ON c.id = cm.company_id
WHERE cm.pe_ratio < 12
  AND cm.fcf_yield > 0.08
  AND cm.debt_to_equity < 0.5
  AND (SELECT is_inverted_2s10s FROM yield_curve ORDER BY curve_date DESC LIMIT 1) = 0
ORDER BY cm.fcf_yield DESC;
```

**Quality at Reasonable Price + Low Vol**
```sql
-- Only when VIX < 20 (calm markets)
SELECT c.symbol, c.name,
       cm.roic, cm.roe, cm.pe_ratio, cm.peg_ratio
FROM companies c
JOIN calculated_metrics cm ON c.id = cm.company_id
WHERE cm.roic > 0.15
  AND cm.pe_ratio < 25
  AND cm.revenue_growth_yoy > 0.05
  AND (SELECT value FROM economic_indicators WHERE series_id = 'VIXCLS' ORDER BY observation_date DESC LIMIT 1) < 20
ORDER BY cm.roic DESC;
```

**Recession-Resistant Value**
```sql
-- When curve is flat/inverted, favor defensive
SELECT c.symbol, c.name, c.sector,
       cm.fcf_yield, cm.dividend_yield, cm.debt_to_equity
FROM companies c
JOIN calculated_metrics cm ON c.id = cm.company_id
WHERE c.sector IN ('Consumer Staples', 'Healthcare', 'Utilities')
  AND cm.fcf_yield > 0.05
  AND cm.dividend_yield > 0.02
  AND cm.debt_to_equity < 1.0
ORDER BY cm.fcf_yield DESC;
```

---

## Data Refresh Schedule (Value Investing)

| Data Type | Frequency | Why |
|-----------|-----------|-----|
| Prices | Daily (EOD) | Track positions, calculate returns |
| Financials | Quarterly | When companies report |
| FRED Macro | Weekly | Economic context |
| Insider Activity | Daily | Timely signal |
| Sentiment | Daily | Secondary signal |
| Analyst Estimates | Weekly | Rarely changes |

**Cron Schedule:**
```bash
# Daily at market close (5 PM ET)
0 17 * * 1-5 /path/to/update-prices.sh

# Weekly on Sunday
0 6 * * 0 /path/to/update-macro.sh
0 7 * * 0 /path/to/update-analysts.sh

# Quarterly (15th of Feb, May, Aug, Nov)
0 8 15 2,5,8,11 * /path/to/recalculate-metrics.sh
```

---

## Next Enhancements for Value Investing

### Priority 1: Conference Call Analysis
- Scrape transcripts from Seeking Alpha (free)
- NLP for tone changes, guidance language
- Track management credibility over time

### Priority 2: Historical Valuation Context
- Store valuation metrics history
- Calculate percentile vs 5-year range
- Alert when valuation extreme (cheap or expensive)

### Priority 3: Peer Comparison
- Group by industry
- Rank on quality and value metrics
- Identify best-in-class at reasonable prices

### Priority 4: Capital Allocation Scoring
- Track buyback effectiveness
- Dividend growth consistency
- M&A track record
- Capex ROI estimation

---

## Summary

For long-term value investing, we now have:

✅ **Complete fundamental data** (10-K, 10-Q, balance sheets, cash flows)
✅ **Quality metrics** (ROIC, ROE, margins, FCF yield)
✅ **Valuation metrics** (P/E, P/B, EV/EBITDA, DCF)
✅ **Insider signals** (Form 4 with CEO/CFO identification)
✅ **Macro context** (yield curve, VIX, credit spreads) - NEW
✅ **Sentiment overlay** (as secondary indicator)

This is more than sufficient for disciplined value investing. The key now is:
1. Building better screens that combine these signals
2. Tracking investment theses over time
3. Journaling decisions and outcomes for learning
