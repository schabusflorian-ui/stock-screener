# Semi-Annual/Interim Data Strategy for EU/UK Companies

## Current State Analysis

### Coverage Summary

**Period Type Distribution:**
| Period Type | Periods | Companies | Coverage |
|-------------|---------|-----------|----------|
| Annual | 6,814 | 2,088 | 100% (baseline) |
| Quarterly | 633 | 73 | 3.5% |
| Semi-annual | 202 | 58 | 2.8% |
| Monthly | 3 | 2 | 0.1% |
| Instant | 2,887 | 1,128 | 54.0% |
| Other | 25 | 20 | 1.0% |

### Semi-Annual Coverage by Country

| Country | Companies | Periods | Years Covered |
|---------|-----------|---------|---------------|
| 🇩🇰 Denmark | 54 | 195 | 6 years |
| 🇫🇮 Finland | 2 | 2 | 2 years |
| 🇬🇧 UK | 1 | 2 | 2 years |
| 🇫🇷 France | 1 | 3 | 3 years |

### Data Quality for Semi-Annual Periods

| Metric | Coverage | Percentage |
|--------|----------|------------|
| Revenue | 149/202 | 73.8% |
| Net Income | 200/202 | 99.0% |
| Total Assets | 177/202 | 87.6% |
| Total Debt | 110/202 | 54.5% |
| EBITDA | 102/202 | 50.5% |
| Shares Outstanding | 150/202 | 74.3% |

**Key Insight**: Semi-annual data quality is slightly lower than annual (which has 70-95% coverage), but still usable.

## Why Semi-Annual Data Matters

### User Value

1. **Better Trend Analysis**
   - 2 data points per year vs. 1
   - Earlier detection of financial deterioration
   - Seasonal business patterns visible

2. **More Timely Information**
   - H1 2025 results available ~July 2025
   - Annual 2025 results available ~March 2026
   - **6-month information advantage**

3. **Competitive Feature**
   - Most free tools only show annual data
   - Bloomberg/FactSet standard: quarterly + semi-annual

4. **Better Valuation Accuracy**
   - TTM (Trailing Twelve Months) metrics
   - More current P/E ratios
   - LTM (Last Twelve Months) EV/EBITDA

### Regulatory Context

**EU/UK Interim Reporting Requirements:**

1. **Listed Companies (Main Market)**
   - **Required**: Semi-annual financial reports (H1)
   - **Format**: IFRS, audited or reviewed
   - **Timing**: Within 3 months of H1 end (usually July 31 → by October 31)

2. **AIM/Growth Markets**
   - **Required**: Semi-annual reports (less stringent)
   - **Format**: Company's accounting policies
   - **Timing**: Within 3 months

3. **Country Variations**
   - **Denmark**: Often includes quarterly reports (explains 54/58 companies)
   - **Germany/Netherlands**: Semi-annual standard
   - **UK (LSE)**: Semi-annual required, quarterly optional
   - **France (Euronext)**: Semi-annual required

## Problem: Low Semi-Annual Coverage

### Why We Have Low Coverage

1. **Data Already Exists in filings.xbrl.org**
   - Our bulk importer fetches ALL filings (no period type filter)
   - Parser correctly detects semi-annual periods (180-185 days)
   - **Hypothesis**: Companies may file interim reports in different formats

2. **Filing Format Variations**
   - Some companies file semi-annual in same XBRL doc as annual
   - Some file separate "interim report" documents
   - Some use national reporting systems (not captured by filings.xbrl.org)

3. **Parser Expectations**
   - Parser expects clean period start/end dates
   - Interim reports may use different context structures
   - May need relaxed period detection (e.g., 170-190 days vs. 180-185)

## Strategy: Improve Semi-Annual Coverage

### Phase 1: Diagnostic Analysis (Week 1)

**Goal**: Understand why coverage is low

#### 1.1 Sample Filing Analysis
- Pick 10 large-cap companies from UK, Germany, France, Netherlands
- Manually check: Do they have H1 2024 reports on their IR pages?
- Check: Are these reports in filings.xbrl.org?
- Check: Did our parser extract data from them?

#### 1.2 Parser Period Detection Audit
- Review `_determinePeriodType()` in xbrlParser.js (lines 470-489)
- Current range: 180-185 days (very strict)
- **Recommendation**: Expand to 170-190 days
- **Reason**: Interim periods vary (e.g., Jan 1 - Jun 30 = 181 days, but Jan 1 - Jul 31 = 212 days)

#### 1.3 Database Audit
- Query xbrl_filings for period_start/period_end combos
- Identify filings with 170-200 day periods classified as "other"
- Re-parse these with relaxed period detection

### Phase 2: Parser Enhancement (Week 2)

**File**: `src/services/xbrl/xbrlParser.js`

#### 2.1 Expand Semi-Annual Period Detection

**Current Code (lines 483-484):**
```javascript
if (days >= 180 && days <= 185) return 'semi-annual';
```

**Proposed Change:**
```javascript
// Semi-annual: 170-195 days (5.5-6.5 months)
// Covers: Jan-Jun (181), Jan-Jul (212), variations with leap years
if (days >= 170 && days <= 195) return 'semi-annual';
```

**Rationale**:
- Jan 1 - Jun 30 = 181 days ✓
- Jan 1 - Jul 31 = 212 days (some companies) ✗ (currently misclassified)
- Feb 1 - Jul 31 = 181 days ✓
- Fiscal half-years may not align with calendar

#### 2.2 Add Interim Report Detection

Some companies label their filings as "interim" or "half-year" in metadata. Check document_type or entity_name for these keywords.

**Add to parser:**
```javascript
// Check for explicit interim/half-year indicators
if (periodData.documentType) {
  const docType = periodData.documentType.toLowerCase();
  if (docType.includes('interim') || docType.includes('half') ||
      docType.includes('semi') || docType.includes('h1') ||
      docType.includes('h2')) {
    return 'semi-annual';
  }
}
```

#### 2.3 TTM (Trailing Twelve Months) Periods

Some filings report "last 12 months" ending at H1 (e.g., Jul 2024 - Jun 2025). These are useful for TTM metrics.

**Add detection:**
```javascript
// TTM reporting (12 months ending mid-year)
if (days >= 360 && days <= 370 && !isYearEnd(period.endDate)) {
  return 'ttm';  // New period type
}
```

### Phase 3: Backfill Existing Filings (Week 2-3)

**Script**: `data/reparse-interim-filings.js`

#### 3.1 Identify Misclassified Filings

```sql
SELECT
  xf.id,
  xf.identifier_id,
  xf.period_start,
  xf.period_end,
  julianday(xf.period_end) - julianday(xf.period_start) as days,
  xf.entity_name
FROM xbrl_filings xf
JOIN company_identifiers ci ON xf.identifier_id = ci.id
JOIN companies c ON ci.company_id = c.id
WHERE c.country NOT IN ('US', 'CA')
  AND xf.parsed = 1
  AND julianday(xf.period_end) - julianday(xf.period_start) BETWEEN 170 AND 195
  AND NOT EXISTS (
    SELECT 1 FROM xbrl_fundamental_metrics xfm
    WHERE xfm.identifier_id = xf.identifier_id
      AND xfm.period_end = xf.period_end
      AND xfm.period_type = 'semi-annual'
  );
```

**Expected**: 500-1,500 filings (rough estimate)

#### 3.2 Re-Parse with Enhanced Parser

- Re-fetch xBRL-JSON from `json_url`
- Parse with enhanced period detection
- Store metrics with correct `period_type = 'semi-annual'`

#### 3.3 Apply EPS-Based Shares Calculation

- Run [calculate-shares-from-eps.js](../data/calculate-shares-from-eps.js) for semi-annual periods
- Expected: +70-80% shares outstanding coverage

### Phase 4: Systematic Semi-Annual Fetching (Week 4)

**Goal**: Ensure all future interim reports are captured

#### 4.1 Update Bulk Importer Strategy

Currently we fetch by country without filtering. This is correct - we want ALL filings.

**No changes needed** - filings.xbrl.org already returns interim reports.

#### 4.2 Add Scheduled Semi-Annual Refresh

Most companies file H1 reports between July-October.

**Add to masterScheduler.js:**
```javascript
// Semi-annual filing season: August-October
schedule.scheduleJob('0 2 * 8-10 *', async () => {
  console.log('Running semi-annual filings refresh');
  await xbrlBulkImporter.refreshRecentFilings({
    countries: EU_UK_COUNTRIES.map(c => c.code),
    lookbackMonths: 6,  // Last 6 months
    prioritizePeriodTypes: ['semi-annual', 'quarterly']
  });
});
```

### Phase 5: UI/UX Enhancement (Week 5)

#### 5.1 Period Selector Component

Add ability to view semi-annual data in:
- Company page financial statements
- Screening table
- Compare page

**Component**: `frontend/src/components/PeriodSelector.js`
```jsx
<select onChange={handlePeriodChange}>
  <option value="annual">Annual</option>
  <option value="semi-annual">Semi-Annual</option>
  <option value="quarterly">Quarterly (Denmark)</option>
  <option value="ttm">Trailing 12 Months</option>
</select>
```

#### 5.2 TTM Metrics Calculation

**Most valuable metric**: TTM = more current than last annual report

**Example**: LVMH in September 2025
- Last annual: December 2024 (9 months old)
- H1 2025: June 2025 (3 months old)
- **TTM**: H2 2024 + H1 2025 (current!)

**Implementation**:
```javascript
function calculateTTM(annualMetrics, semiAnnualMetrics) {
  // TTM Revenue = Last H2 + Latest H1
  const lastAnnual = annualMetrics[0];
  const lastH1 = semiAnnualMetrics[0];
  const previousH1 = semiAnnualMetrics[1];

  if (!lastAnnual || !lastH1 || !previousH1) return null;

  // H2 = Annual - H1 (from previous year)
  const impliedH2 = lastAnnual.revenue - previousH1.revenue;

  return {
    revenue: impliedH2 + lastH1.revenue,
    netIncome: impliedH2NetIncome + lastH1.netIncome,
    // ... other metrics
  };
}
```

## Expected Results

### Coverage Targets

**After Phase 2-3 (Parser + Backfill):**
- Semi-annual periods: 202 → 800-1,200 (+297-494%)
- Companies with semi-annual: 58 → 400-600 (+590-934%)
- Country coverage: 4 countries → 15+ countries

**After Phase 4 (Systematic Fetching):**
- Ongoing: 60-70% of EU/UK companies with semi-annual data
- Quarterly (Denmark): 73 → 100+ companies
- TTM metrics: Available for 50%+ of companies

### User Impact

1. **More Current Data**
   - Average data age: 9 months → 3-6 months
   - TTM metrics: Real-time view of financial health

2. **Better Trend Visibility**
   - 2x more data points per company per year
   - Seasonal patterns visible (especially retail, tourism)

3. **Competitive Advantage**
   - Free tools: Annual only
   - Paid tools ($50-100/month): Quarterly/Semi-annual
   - **Your app**: Free + Semi-annual + TTM

## Implementation Priority

### Must-Have (Weeks 1-3)
1. ✅ Parser enhancement (expand period detection to 170-195 days)
2. ✅ Backfill script (re-parse existing filings)
3. ✅ EPS-based shares calculation for semi-annual periods

### Nice-to-Have (Weeks 4-5)
4. ⚠️ Scheduled semi-annual refresh
5. ⚠️ UI period selector
6. ⚠️ TTM metrics calculation

### Future Enhancements
7. 🔮 Quarterly data expansion beyond Denmark
8. 🔮 Interim report alerts (when new H1 filed)
9. 🔮 YoY/QoQ growth calculations

## Technical Considerations

### Database Schema

**No changes needed** - `xbrl_fundamental_metrics.period_type` already supports 'semi-annual'

### API Endpoints

**Add to** `src/api/routes/data.js`:
```javascript
// GET /api/companies/:id/metrics?periodType=semi-annual
router.get('/companies/:id/metrics', async (req, res) => {
  const { periodType = 'annual' } = req.query;
  // ... fetch metrics filtered by period_type
});
```

### Frontend Data Fetching

**Update** `frontend/src/services/api.js`:
```javascript
export const getCompanyMetrics = async (companyId, periodType = 'annual') => {
  const response = await fetch(
    `/api/companies/${companyId}/metrics?periodType=${periodType}`
  );
  return response.json();
};
```

## Risk Mitigation

### Risks

1. **Low Availability**: Not all companies file semi-annual reports in XBRL
   - **Mitigation**: Target countries with high compliance (DK, DE, NL, FR, GB)
   - **Fallback**: Show "Annual data only" badge for companies without interim

2. **Data Quality**: Semi-annual reports may be unaudited
   - **Mitigation**: Show disclaimer "Interim results (unaudited)" on UI
   - **Validation**: Compare H1+H2 sum to annual (should match within 5%)

3. **Parser Complexity**: Expanded period detection may misclassify
   - **Mitigation**: Add validation tests (9-month periods should NOT be semi-annual)
   - **Monitoring**: Log period type changes in backfill script

4. **User Confusion**: Semi-annual vs. H1 vs. H2
   - **Mitigation**: Clear labels "H1 2025 (Jan-Jun)" vs. "H2 2025 (Jul-Dec)"
   - **Education**: Tooltip explaining interim reports

## Success Metrics

**KPIs to Track:**

1. **Coverage**:
   - \# of companies with ≥1 semi-annual period
   - \# of semi-annual periods per company (target: 4-6 for last 3 years)

2. **Data Quality**:
   - \% semi-annual periods with complete metrics (target: 80%+)
   - \% validation pass rate (H1+H2 ≈ Annual)

3. **User Engagement**:
   - \% users who view semi-annual data (vs. annual only)
   - Time-to-insight improvement (faster trend spotting)

4. **Data Freshness**:
   - Average age of most recent financials (target: <6 months)

---

## Next Steps

1. **Immediate**: Expand parser period detection (170-195 days)
2. **This Week**: Create backfill script for misclassified filings
3. **Next Week**: Run backfill, verify results
4. **Week 3**: Update enrichment pipeline for semi-annual periods
5. **Week 4-5**: UI enhancements (period selector, TTM metrics)

---

**Status**: Strategy Document
**Date**: January 2026
**Priority**: High (semi-annual data is competitive differentiator)
**Estimated Effort**: 3-5 weeks
**Expected Impact**: +600-1,000 semi-annual periods, +400-600 companies
