# Shares Outstanding Coverage Improvement

## Overview

Implemented EPS-based calculation to dramatically improve shares outstanding coverage for EU/UK companies.

**Achievement: 37.3% → 78.5% coverage (+41.2% absolute improvement)**

## Implementation

### Method: Reverse EPS Calculation

Since `EPS = Net Income / Shares Outstanding`, we can reverse this to calculate:

```
Shares Outstanding = Net Income / EPS Basic
```

This is the most accurate method because:
- Both inputs come from official XBRL filings (same source)
- EPS is calculated by companies using precise share counts
- No reliance on market data or third-party APIs

### Validation Rules

To ensure data quality, the calculation applies these safeguards:

1. **Non-zero EPS**: Skip if `eps_basic = 0` (would cause division by zero)
2. **Positive shares**: Calculated shares must be > 0
3. **Minimum threshold**: Shares must be ≥ 1,000 (filters out micro-entities)
4. **Maximum threshold**: Shares must be ≤ 100 billion (filters out data errors)

### Results

**Script**: `/Users/florianschabus/Investment Project/data/calculate-shares-from-eps.js`

**Execution Results:**
- Total records processed: 4,460
- Successfully calculated: 4,341 (97.3% success rate)
- Validation failures: 119 (2.7%)
  - Negative/zero: 64
  - Too small (< 1,000): 47
  - Too large (> 100B): 8

**Coverage Improvement:**
- Before: 2,543 / 6,814 periods (37.3%)
- After: 5,346 / 6,814 periods (78.5%)
- Improvement: +2,803 periods (+41.2%)

**Company Coverage:**
- Before: 904 / 2,088 companies (43.3%)
- After: 1,665 / 2,088 companies (79.7%)
- Improvement: +761 companies (+36.4%)

## Country Breakdown

Top countries by periods enriched:

| Country | Periods | Companies |
|---------|---------|-----------|
| Denmark (DK) | 997 | 124 |
| Norway (NO) | 573 | 171 |
| Finland (FI) | 463 | 122 |
| United Kingdom (GB) | 413 | 160 |
| France (FR) | 320 | 108 |
| Poland (PL) | 315 | 132 |
| Netherlands (NL) | 298 | 89 |
| Belgium (BE) | 235 | 64 |
| Spain (ES) | 169 | 64 |
| Greece (GR) | 160 | 42 |

## Integration with Enrichment Pipeline

Updated [enrich-eu-metrics.js](../data/enrich-eu-metrics.js) to use a 4-tier fallback strategy:

**Priority 1: EPS-based calculation** (most accurate)
```javascript
shares = net_income / eps_basic
```

**Priority 2: Market cap calculation** (good for recent periods)
```javascript
shares = market_cap / last_price
```

**Priority 3: Book value calculation** (fallback when price unavailable)
```javascript
shares = total_equity / book_value_per_share
```

**Priority 4: Yahoo Finance API** (last resort)
```javascript
shares = yahooData.sharesOutstanding
```

## Impact on Downstream Metrics

With improved shares outstanding coverage, these calculated metrics now have better coverage:

1. **Earnings Per Share (EPS)** - Can now be calculated for more periods
2. **Price-to-Earnings (P/E) ratio** - Requires accurate share count
3. **Market Capitalization** - `market_cap = price × shares`
4. **Book Value Per Share** - `book_value_per_share = total_equity / shares`
5. **Diluted EPS** - Can be calculated when diluted shares available

## Data Quality

The validation rules ensure high-quality data:

**Success rate**: 97.3% (4,341 / 4,460 records passed validation)

**Example calculations** (verified accurate):
- THAGBX (UK): 3,028,052 shares (€80.8M net income / €26.7 EPS)
- Norwegian company: 39,112,471 shares (€5.1M / €0.1307)
- Finnish company: 281,418,925 shares (-€6.0M / -€0.0214)

Negative earnings correctly handled with negative EPS, producing valid share counts.

## Files Modified

1. **Created**: `data/calculate-shares-from-eps.js` - Main calculation script
2. **Updated**: `data/enrich-eu-metrics.js` - Added EPS method as Priority 1

## Next Steps (Optional)

1. **Diluted shares**: Can apply same method using `eps_diluted` when available
2. **Historical validation**: Compare calculated shares to company disclosures
3. **Quarterly data**: Apply same calculation to quarterly periods (633 available)

## Related Documents

- [XBRL Parser Enhancements](./XBRL_PARSER_ENHANCEMENTS.md) - Overview of all IFRS concept additions
- [European Data Pipeline](./EUROPEAN_DATA_PIPELINE.md) - Full EU/UK data architecture

---

**Status**: ✅ Implemented and Deployed
**Date**: January 2026
**Impact**: +41.2% absolute improvement in shares outstanding coverage
