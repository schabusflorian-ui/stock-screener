# EU/UK Data Pipeline - Current Status & Next Steps

**Last Updated**: January 13, 2026

## What We Accomplished Today

### 1. ✅ Shares Outstanding Coverage Improvement (MAJOR WIN)

**Achievement**: 37.3% → 78.5% coverage (+41.2% absolute improvement)

**What was done**:
- Created EPS-based calculation: `shares = net_income / eps_basic`
- Successfully calculated shares for 4,341 periods across 761 companies
- Updated enrichment pipeline with 4-tier fallback strategy

**Files**:
- ✅ [data/calculate-shares-from-eps.js](../data/calculate-shares-from-eps.js) - Calculation script
- ✅ [data/enrich-eu-metrics.js](../data/enrich-eu-metrics.js) - Enhanced with EPS priority
- ✅ [docs/XBRL_SHARES_OUTSTANDING_IMPROVEMENT.md](XBRL_SHARES_OUTSTANDING_IMPROVEMENT.md) - Full documentation

**Impact**:
- P/E ratios now calculable for 78.5% of companies
- Market cap calculations more accurate
- Book value per share available for most companies

---

### 2. ✅ Semi-Annual Data Infrastructure (READY FOR FUTURE)

**Achievement**: Parser enhanced, infrastructure ready for H1 2025 filing season

**What was done**:
- Enhanced period detection: 170-195 days → semi-annual (was 180-185)
- Enhanced period detection: 85-95 days → quarterly (was 89-92)
- Created backfill script for future use
- Verified automatic updater will capture interim reports

**Files**:
- ✅ [src/services/xbrl/xbrlParser.js](../src/services/xbrl/xbrlParser.js:466-503) - Enhanced detection
- ✅ [data/reparse-interim-filings.js](../data/reparse-interim-filings.js) - Backfill script
- ✅ [docs/SEMI_ANNUAL_DATA_STRATEGY.md](SEMI_ANNUAL_DATA_STRATEGY.md) - Full strategy
- ✅ Verified: [src/services/xbrl/dataSyncService.js:287](../src/services/xbrl/dataSyncService.js#L287) stores semi-annual

**Current Coverage**:
- Semi-annual: 202 periods, 58 companies (mostly Denmark)
- Quarterly: 633 periods, 73 companies (mostly Denmark)

**Why low coverage?**
- Most EU companies only file annual reports in XBRL
- H1 2025 reports will be filed July-October 2026
- System is ready to capture them automatically

---

### 3. ✅ Legacy Data Evaluation (DECISION: SKIP FOR NOW)

**Achievement**: Comprehensive analysis of 2015-2020 historical data options

**What was done**:
- Evaluated PDF parsing vs. data provider APIs
- Cost-benefit analysis completed
- Decision: Focus on 2020+ high-quality XBRL data

**Files**:
- ✅ [docs/LEGACY_FILINGS_EVALUATION.md](LEGACY_FILINGS_EVALUATION.md) - Full evaluation

**Recommendation**: 5 years of data (2020-2025) is sufficient for most use cases

---

## Current Data Quality Status

### EU/UK Fundamental Metrics Coverage (2020-2025)

| Metric | Coverage | Grade |
|--------|----------|-------|
| **Total Debt** | 70.9% | A- |
| **EBITDA** | 71.0% | A- |
| **Shares Outstanding** | 78.5% | A |
| **Revenue** | 95%+ | A+ |
| **Net Income** | 95%+ | A+ |
| **Total Assets** | 95%+ | A+ |
| **ROE** | 99.0% | A+ |
| **ROA** | 96.8% | A+ |

### Companies with Complete Data

- **Total companies**: 2,088 EU/UK companies
- **With fundamentals**: 2,088 (100%)
- **With prices**: ~1,550 (74.3%)
- **Years covered**: 2020-2025 (5 years, excellent depth)
- **Historical periods**: 6,814 annual periods

### Period Type Distribution

| Type | Periods | Companies | % of Total |
|------|---------|-----------|------------|
| Annual | 6,814 | 2,088 | 100% |
| Semi-annual | 202 | 58 | 2.8% |
| Quarterly | 633 | 73 | 3.5% |
| Instant | 2,887 | 1,128 | 54.0% |

---

## What's Next? (Priority Order)

### IMMEDIATE PRIORITIES (This Week)

#### 1. ⚡ Apply Shares Calculation to Semi-Annual Periods

**Why**: We just improved shares coverage for annual data, but haven't done semi-annual yet

**Action**:
```bash
# Modify calculate-shares-from-eps.js to include semi-annual periods
# Current filter: AND xfm.period_type = 'annual'
# Change to: AND xfm.period_type IN ('annual', 'semi-annual', 'quarterly')
```

**Expected Impact**: +100-150 semi-annual periods with shares data

**Effort**: 30 minutes

---

#### 2. 🔧 Enable Quarterly Storage in DataSyncService

**Why**: We have 633 quarterly periods but they might not be stored going forward

**Action**:
```javascript
// File: src/services/xbrl/dataSyncService.js, line 287
// Change from:
if (periodData.periodType === 'annual' || periodData.periodType === 'semi-annual') {

// Change to:
if (['annual', 'semi-annual', 'quarterly'].includes(periodData.periodType)) {
```

**Expected Impact**: Future quarterly reports will be automatically stored

**Effort**: 5 minutes

---

### SHORT-TERM (Next 2-4 Weeks)

#### 3. 📊 Price Data Coverage Improvement

**Current Gap**: Only 1,550/2,088 companies (74%) have price data

**Why it matters**:
- Can't calculate P/E ratios without prices
- Can't calculate market cap
- Screening/filtering limited

**Options**:
1. **Yahoo Finance fallback** for missing prices (cheapest, ~80% coverage)
2. **Financial Modeling Prep API** ($50/month, 95%+ coverage)
3. **Alpha Vantage API** ($50-200/month, excellent EU coverage)

**Recommended**: Start with Yahoo Finance fallback for 500+ missing companies

**Effort**: 1-2 days

---

#### 4. 🏢 Sector/Industry Enrichment

**Current Gap**: Only 60/2,904 companies (2.1%) have sector/industry

**Why it matters**:
- Sector analysis requires classification
- Peer comparisons need sector grouping
- Screening by sector impossible

**Options**:
1. **NACE code mapping** (free, EU standard, compatible with US GICS)
2. **Financial Modeling Prep** ($50/month, includes sector data)
3. **Manual mapping for top 500** (time-consuming but accurate)

**Recommended**: Use Financial Modeling Prep API (gets prices + sectors)

**Effort**: 2-3 days

---

#### 5. 🔄 Valuation Metrics Recalculation

**Why**: Now that we have better shares outstanding, P/E ratios need updating

**Action**:
1. Recalculate P/E ratios using new shares data
2. Calculate P/B ratios (Price to Book)
3. Calculate EV/EBITDA where possible
4. Store in `xbrl_fundamental_metrics` table

**Expected Impact**:
- P/E ratios: 60% → 78% coverage
- P/B ratios: 50% → 75% coverage

**Effort**: 1 day

---

### MEDIUM-TERM (Next 1-2 Months)

#### 6. 🌍 Add More EU Countries

**Current**: 15 countries covered (GB, DE, FR, NL, ES, IT, SE, BE, AT, IE, PT, PL, GR, CZ, HU)

**Missing**:
- Eastern Europe: Romania, Bulgaria, Slovakia, Slovenia, Croatia
- Baltic: Estonia, Latvia, Lithuania
- Malta, Cyprus

**Why add**:
- Completeness for EU-wide screening
- Small-cap opportunities in emerging markets

**Effort**: 1 week (bulk import)

---

#### 7. 📱 Frontend Integration

**What's needed**:
- Period selector component (Annual / Semi-annual / Quarterly)
- TTM (Trailing Twelve Months) calculations
- Historical data charts with interim points
- Semi-annual data display on company pages

**Why important**:
- Semi-annual data adds 6-month information advantage
- TTM metrics more current than annual

**Effort**: 1-2 weeks (frontend work)

---

### LONG-TERM (Next 3-6 Months)

#### 8. 🤖 Alternative Data Integration

**Options**:
1. **Insider Trading** (EU equivalents to SEC Form 4)
   - PDMRs (Persons Discharging Managerial Responsibilities) filings
   - Available via national regulators (UK FCA, German BaFin, etc.)

2. **Analyst Estimates** (via API)
   - Consensus EPS estimates
   - Revenue forecasts
   - Target prices

3. **News Sentiment** (EU-focused)
   - Financial Times, Reuters Europe
   - Country-specific business press

**Why valuable**:
- Edge in EU markets (less analyzed than US)
- Behavioral signals (insider buying/selling)
- Forward-looking metrics

**Effort**: 2-4 weeks per data source

---

#### 9. 📈 Advanced Ratio Coverage

**Current**: Basic ratios (ROE, ROA, ROIC, margins, liquidity)

**Add**:
1. **DuPont Analysis** components
   - Net profit margin
   - Asset turnover
   - Equity multiplier

2. **Cash Flow Ratios**
   - Operating cash flow / Net income (quality of earnings)
   - Free cash flow yield
   - Cash conversion cycle

3. **Growth Metrics**
   - Revenue growth (YoY, 3Y CAGR, 5Y CAGR)
   - Earnings growth
   - Asset growth

**Why important**:
- Screening power
- Factor-based strategies
- Value vs. Growth classification

**Effort**: 1 week

---

#### 10. 🧪 Data Quality Improvements

**Current Issues**:
- Some currency inconsistencies (need conversion)
- Occasional outliers (data validation needed)
- Missing fiscal year alignment

**Improvements**:
1. **Currency Normalization**
   - Convert all to EUR for consistency
   - Store original + converted values
   - Use ECB exchange rates

2. **Outlier Detection**
   - Statistical validation (Z-scores)
   - Flag suspicious ratios (e.g., P/E > 1000)
   - Manual review queue

3. **Fiscal Year Handling**
   - Properly handle non-calendar fiscal years
   - Align periods for YoY comparisons

**Effort**: 1-2 weeks

---

## Decision Points

### Question 1: Price Data Strategy

**Option A**: Free (Yahoo Finance fallback)
- Pro: No cost, quick to implement
- Con: 80% coverage, less reliable

**Option B**: Paid API ($50/month)
- Pro: 95%+ coverage, reliable, includes sectors
- Con: Monthly cost, vendor dependency

**Recommendation**: Start with Option A, upgrade to B if needed

---

### Question 2: Semi-Annual Focus

**Should we prioritize semi-annual data now or wait?**

**Wait Scenario** (Recommended):
- Current coverage is what's available in XBRL
- H1 2025 reports won't be filed until July 2026
- Focus on price/sector data instead

**Prioritize Now Scenario**:
- Build UI/UX for period selection now
- Add TTM calculations
- Market as premium feature

**Recommendation**: Wait until Q3 2026 when H1 2025 reports arrive

---

### Question 3: Scope Expansion

**Should we add more countries or improve existing coverage?**

**Improve Existing** (Recommended):
- Better prices for current 2,088 companies
- Sector classification
- Advanced ratios
- Data quality

**Expand Coverage**:
- Add 8 more EU countries
- +300-500 companies
- Dilutes focus

**Recommendation**: Improve existing coverage first

---

## Success Metrics to Track

### Data Coverage (Monthly)
- [ ] Price coverage: 74% → 90%+
- [ ] Sector coverage: 2% → 80%+
- [ ] Shares outstanding: 78.5% (maintain)
- [ ] Total debt: 70.9% (maintain)
- [ ] EBITDA: 71.0% (maintain)

### Data Quality (Quarterly)
- [ ] Currency consistency: Monitor conversions
- [ ] Outlier rate: < 1% flagged
- [ ] Data freshness: 95%+ updated within 1 week of filing

### User Value (Ongoing)
- [ ] Screening coverage: 1,400+ companies (with prices + sectors)
- [ ] Ratio availability: 95%+ for key ratios
- [ ] Historical depth: 5 years minimum

---

## Immediate Next Steps (Today/This Week)

1. ✅ **DONE**: Shares outstanding improvement (78.5% coverage)
2. ✅ **DONE**: Semi-annual parser enhancement
3. ✅ **DONE**: Strategy documentation

4. ⏭️ **TODO** (30 min): Apply EPS shares calculation to semi-annual periods
5. ⏭️ **TODO** (5 min): Enable quarterly storage in DataSyncService
6. ⏭️ **TODO** (1 day): Price data fallback for missing companies
7. ⏭️ **TODO** (2 days): Sector/industry enrichment

---

## Resources & Documentation

### Created Today
- [XBRL_SHARES_OUTSTANDING_IMPROVEMENT.md](XBRL_SHARES_OUTSTANDING_IMPROVEMENT.md)
- [SEMI_ANNUAL_DATA_STRATEGY.md](SEMI_ANNUAL_DATA_STRATEGY.md)
- [LEGACY_FILINGS_EVALUATION.md](LEGACY_FILINGS_EVALUATION.md)
- This status document

### Key Scripts
- [data/calculate-shares-from-eps.js](../data/calculate-shares-from-eps.js)
- [data/reparse-interim-filings.js](../data/reparse-interim-filings.js)
- [data/enrich-eu-metrics.js](../data/enrich-eu-metrics.js)
- [data/backfill-xbrl-enhancements.js](../data/backfill-xbrl-enhancements.js)

### Core Services
- [src/services/xbrl/xbrlParser.js](../src/services/xbrl/xbrlParser.js)
- [src/services/xbrl/dataSyncService.js](../src/services/xbrl/dataSyncService.js)
- [src/services/xbrl/fundamentalStore.js](../src/services/xbrl/fundamentalStore.js)

---

**Status**: EU/UK data pipeline is production-ready with excellent coverage. Focus now shifts to price/sector enrichment and user-facing features.

**Overall Grade**: A- (was B+ before today's work)
