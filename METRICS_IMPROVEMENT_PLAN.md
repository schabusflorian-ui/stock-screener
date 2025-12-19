# Metrics Improvement Plan

## Validation Results Summary (December 14, 2025)

### Post-Fix Results (After clearing stale data)
- **Sample Size**: 40 companies
- **Overall Accuracy**: 36.2%
- **Status**: FAILED (target: 70%+)

### Initial Results (Before fix)
- **Sample Size**: 40 companies
- **Overall Accuracy**: 42.3%
- **Status**: FAILED

### Per-Metric Accuracy (Post-Fix)

| Metric | Accuracy | Avg Diff | Status | Root Cause |
|--------|----------|----------|--------|------------|
| current_ratio | 47.1% | 13.9% | FAIL | TTM vs Annual mismatch |
| roa | 44.7% | 54.0% | FAIL | TTM vs Annual mismatch |
| debt_to_equity | 43.8% | 53.8% | FAIL | Different debt definitions |
| gross_margin | 42.1% | 42.0% | FAIL | Sector-specific issues (100% for banks) |
| quick_ratio | 32.4% | 29.3% | FAIL | TTM vs Annual + calculation diff |
| net_margin | 31.6% | 50.4% | FAIL | TTM vs Annual mismatch |
| operating_margin | 28.9% | 27.9% | FAIL | TTM vs Annual + sector issues |
| roe | 20.0% | 65.5% | FAIL | TTM vs Annual + equity timing |
| pe_ratio | N/A | N/A | - | No market cap in calculation |
| pb_ratio | N/A | N/A | - | No market cap in calculation |

**Key Insight**: The primary issue is **TTM vs Annual mismatch**. Yahoo Finance shows Trailing Twelve Months (TTM) metrics, while we're comparing our annual fiscal year metrics.

---

## NEW: TTM vs Annual Deep Dive (December 14, 2025)

### The Problem is WORSE Than Just TTM vs Annual

**Discovery**: Our annual data is significantly outdated compared to Yahoo's TTM:

| Symbol | Latest Annual | Latest Quarterly | Gap from Today |
|--------|---------------|------------------|----------------|
| AAPL   | 2024-09-30    | 2024-06-30       | 15 months (annual) |
| MSFT   | 2024-06-30    | 2024-06-30       | 18 months |
| GOOGL  | 2023-12-31    | 2024-09-30       | 24 months (annual!) |
| AMZN   | 2023-12-31    | 2024-09-30       | 24 months |
| NVDA   | 2024-01-31    | 2024-10-31       | 23 months |
| META   | 2023-12-31    | 2024-09-30       | 24 months |
| JPM    | 2023-12-31    | 2024-09-30       | 24 months |

**Key Finding**: Many companies have FY2023 annual data (24 months old!) while Yahoo shows TTM through late 2024. However, we have **more recent quarterly data** (up to Oct 2024) that can be used to compute TTM.

### Solution Implemented: TTM Validation Mode

Added `--ttm` flag to validation runner:
- `node run-validation.js --ttm` - Uses last 4 quarters to compute TTM metrics
- For margin metrics: averages last 4 quarters
- For balance sheet ratios: uses most recent quarter (point-in-time)
- Falls back to annual data if <4 quarters available

**Files Modified**:
- `src/validation/metricsValidator.js` - Added `getTTMMetrics()` method
- `run-validation.js` - Added `--ttm` flag support

### Expected Impact

Using TTM comparison should:
1. **Reduce timing mismatch** from 24 months to ~3 months
2. **Improve margin accuracy** by 20-30% (same calculation methodology)
3. **Improve ratio accuracy** slightly (more recent balance sheet data)

**Note**: Yahoo API currently rate-limited (429). Re-run validation with TTM after cooldown.

---

## Root Cause Analysis

### Issue 1: STALE CALCULATED METRICS (CRITICAL)

**Evidence**: AAPL shows NULL for gross_margin, operating_margin, net_margin in database, but calculation returns correct values (46.2%, 41.4%, 24%).

**Root Cause**: The `calculate-all-metrics.js` script was last run on 2025-12-10, but the calculation logic has issues that caused NULLs to be stored.

**Impact**: All margin metrics showing as NULL or incorrect.

**Fix**: Re-run metrics calculation for all companies after fixing underlying issues.

---

### Issue 2: COMPANIES WITH 100% GROSS MARGIN

**Affected Companies**: BRK-B, JPM, DIS, ORCL, COST, VZ, XOM, MA

**Root Cause**: For these companies, `costOfRevenue` is NULL or 0, so:
```
grossProfit = revenue - costOfRevenue = revenue - 0 = revenue
gross_margin = revenue / revenue * 100 = 100%
```

**Analysis by Sector**:
- **Financials (JPM, BRK-B, MA, V)**: Banks and payment processors don't have traditional "cost of goods sold". Yahoo uses "Interest Expense" or other metrics.
- **Energy (XOM, CVX, COP)**: These should have cost of revenue - likely a data mapping issue.
- **Retail (COST)**: Costco definitely has COGS - SEC data issue.
- **Tech (ORCL, VZ, DIS)**: Service companies may have COGS under different names.

**Fix Required**:
1. For financials: Use `grossProfit` directly from SEC data if available, or mark as N/A
2. For others: Investigate SEC XBRL tag mapping for cost of revenue

---

### Issue 3: COMPANIES WITH 0% OPERATING MARGIN

**Affected Companies**: BRK-B, JPM, BMY, CVX, XOM, COP

**Root Cause**: `operatingIncome` field is NULL or 0 for these companies.

**Analysis**:
- **Financials**: Use different income breakdown (interest income, non-interest income, etc.)
- **Energy**: May use different naming (e.g., "Income from operations")
- **Pharma (BMY)**: Could be temporary (R&D heavy quarter)

**Fix Required**:
1. Add more field name variations to `getField()` calls
2. For financials: Consider alternative profitability metrics

---

### Issue 4: DEBT_TO_EQUITY = 0 FOR MANY COMPANIES

**Affected Companies**: META, BRK-B, V, JNJ, ABBV, ORCL, KO, COST, UNP, CVX, MA, HD (12 companies)

**Root Cause**: Both `longTermDebt` and `shortTermDebt` returning NULL/0.

**Analysis**: These companies DO have debt. The SEC XBRL tags aren't being mapped correctly:
- May be under `LongTermDebt` vs `LongTermDebtNoncurrent`
- May be combined with other liabilities
- Finance leases may be separate

**Fix Required**:
1. Add more debt field variations:
   - `Debt`
   - `DebtCurrent`
   - `DebtNoncurrent`
   - `LongTermDebtAndCapitalLeaseObligations`
   - `FinanceLeaseLiabilityNoncurrent`
2. Consider using `totalLiabilities - currentLiabilities` as fallback

---

### Issue 5: QUICK RATIO CALCULATION

**Current Formula** (improved):
```javascript
quickAssets = cash + marketableSecurities + receivables
quickRatio = quickAssets / currentLiabilities
```

**Yahoo's Formula** (likely):
```javascript
quickAssets = currentAssets - inventory - prepaidExpenses
quickRatio = quickAssets / currentLiabilities
```

**Discrepancy Examples**:
- LOW: Ours 1.09, Yahoo 0.09 (1060% diff)
- HD: Ours 1.11, Yahoo 0.25 (351% diff)

**Analysis**: Our formula over-counts liquid assets for retailers who have large inventories and other current assets.

**Fix Required**: Use traditional formula `(currentAssets - inventory) / currentLiabilities` as primary, explicit components as secondary.

---

### Issue 6: TTM vs ANNUAL MISMATCH

**Issue**: We're comparing our annual metrics to Yahoo's TTM (Trailing Twelve Months).

**Impact**:
- For companies with recent quarters, Yahoo shows more recent data
- ROE/ROA can differ significantly due to timing

**Example**: AAPL FY ends Sept 30, so in December:
- Our data: FY2024 (Oct 2023 - Sept 2024)
- Yahoo TTM: Dec 2023 - Nov 2024 (3 months more recent)

**Fix Required**:
1. Fetch our most recent TTM data (sum of last 4 quarters) for comparison
2. Or acknowledge this timing difference in tolerance thresholds

---

### Issue 7: NEGATIVE VALUES SIGN MISMATCH

**Examples**:
- INTC: Our ROA -9.5%, Yahoo -0.46%
- BMY: Our ROA -9.7%, Yahoo +9.39%

**Root Cause**:
1. Period mismatch (we have older data showing losses, Yahoo has newer profitable quarters)
2. Calculation differences for companies with negative equity or income

**Fix**: Ensure we're comparing same periods

---

## Improvement Plan

### Phase A: Fix Historical Data (Immediate)

#### A1. Recalculate All Metrics
```bash
# After fixing calculation issues, run:
node scripts/migration/calculate-all-metrics.js
```

**Priority**: CRITICAL
**Estimated Impact**: +20% accuracy

#### A2. Fix Debt Field Mapping
Update `calculateDebtToEquity()` to include more field variations:

```javascript
// Add these field names
const longTermDebt = this.getField(balance, [
  'longTermDebt',
  'LongTermDebtNoncurrent',
  'LongTermDebt',
  'Debt',                           // NEW
  'DebtNoncurrent',                 // NEW
  'LongTermDebtAndCapitalLeaseObligations', // NEW
  'FinanceLeaseLiabilityNoncurrent' // NEW
]) || 0;

const shortTermDebt = this.getField(balance, [
  'shortTermDebt',
  'ShortTermBorrowings',
  'LongTermDebtCurrent',
  'DebtCurrent',                    // NEW
  'ShortTermDebt',                  // NEW
  'CommercialPaper',                // NEW
  'FinanceLeaseLiabilityCurrent'    // NEW
]) || 0;
```

**Priority**: HIGH
**Estimated Impact**: +10% accuracy for debt_to_equity

#### A3. Fix Quick Ratio Calculation
Revert to traditional formula:

```javascript
calculateQuickRatio(balance) {
  const currentAssets = this.getField(balance, ['currentAssets', 'AssetsCurrent']);
  const inventory = this.getField(balance, ['inventory', 'InventoryNet', 'Inventory']) || 0;
  const currentLiabilities = this.getField(balance, ['currentLiabilities', 'LiabilitiesCurrent']);

  if (!currentAssets || !currentLiabilities || currentLiabilities <= 0) return null;

  // Traditional formula: (Current Assets - Inventory) / Current Liabilities
  const quickAssets = currentAssets - inventory;
  return Math.round((quickAssets / currentLiabilities) * 100) / 100;
}
```

**Priority**: HIGH
**Estimated Impact**: +15% accuracy for quick_ratio

#### A4. Handle Financial Sector Companies
For banks, insurance, payment processors:
- Skip gross_margin calculation (not applicable)
- Use alternative metrics (net interest margin, efficiency ratio)
- Add sector-aware metric calculation

```javascript
// Check if financial sector
const isFinancial = ['banks', 'insurance', 'payment-services'].includes(sector);

if (isFinancial) {
  metrics.grossMargin = null;  // Not applicable
  metrics.operatingMargin = null;  // Different meaning
  // Calculate financial-specific metrics instead
}
```

**Priority**: MEDIUM
**Estimated Impact**: Reduces false negatives in validation

#### A5. Add Missing SEC Field Mappings
Investigate and add mappings for:
- `CostOfRevenue` variations by industry
- `OperatingIncome` variations
- Alternative revenue tags

**Priority**: MEDIUM
**Estimated Impact**: +5% accuracy

---

### Phase B: Fix Future Quarterly Data

#### B1. Validate Data on Import
Add validation step to `importSECBulkUnified.js`:

```javascript
// After parsing financial data, validate key fields exist
function validateFinancialData(data, statementType) {
  const warnings = [];

  if (statementType === 'income_statement') {
    if (!data.revenue && !data.totalRevenue && !data.Revenues) {
      warnings.push('Missing revenue');
    }
    if (!data.netIncome && !data.NetIncomeLoss) {
      warnings.push('Missing net income');
    }
  }

  if (statementType === 'balance_sheet') {
    if (!data.totalAssets && !data.Assets) {
      warnings.push('Missing total assets');
    }
  }

  return warnings;
}
```

**Priority**: HIGH

#### B2. Auto-Recalculate Metrics After Import
Modify `quarterlyUpdater.js` to automatically recalculate metrics:

```javascript
// After importing new data
await this.recalculateMetrics(updatedCompanyIds);
```

**Priority**: HIGH

#### B3. Add TTM Calculations
Create TTM (Trailing Twelve Months) metrics by summing last 4 quarters:

```javascript
function calculateTTMMetrics(companyId) {
  // Get last 4 quarters
  const quarters = db.prepare(`
    SELECT * FROM financial_data
    WHERE company_id = ? AND period_type = 'quarterly'
    ORDER BY fiscal_date_ending DESC LIMIT 4
  `).all(companyId);

  // Sum income statement items
  const ttmRevenue = quarters.reduce((sum, q) => sum + q.revenue, 0);
  const ttmNetIncome = quarters.reduce((sum, q) => sum + q.net_income, 0);

  // Use most recent balance sheet (point-in-time)
  const latestBalanceSheet = quarters[0];

  // Calculate TTM metrics...
}
```

**Priority**: MEDIUM

#### B4. Implement Validation on Every Import
Run validation against Yahoo for newly imported companies:

```javascript
// In quarterlyUpdater.js after import
const validator = new MetricsValidator(db);
const validationResults = await validator.validateCompanies(updatedSymbols);

if (validationResults.accuracy < 0.5) {
  console.warn('Warning: New data has low accuracy. Review mappings.');
}
```

**Priority**: LOW (nice to have)

---

## Implementation Order

1. **Immediate** (Today):
   - [ ] Fix quick_ratio calculation
   - [ ] Add debt field mappings
   - [ ] Re-run calculate-all-metrics.js
   - [ ] Re-run validation

2. **Short-term** (This Week):
   - [ ] Add financial sector handling
   - [ ] Investigate SEC field mapping for energy/retail COGS
   - [ ] Add TTM calculations

3. **Medium-term** (Next Week):
   - [ ] Add data validation on import
   - [ ] Auto-recalculate metrics after import
   - [ ] Implement continuous validation

---

## Expected Results After Fixes

| Metric | Current | Target | Estimated After Phase A |
|--------|---------|--------|------------------------|
| Overall | 42.3% | 70%+ | 65-75% |
| gross_margin | 46.2% | 80%+ | 70-80% |
| operating_margin | 26.9% | 75%+ | 65-75% |
| net_margin | 38.5% | 80%+ | 75-85% |
| roe | 54.5% | 75%+ | 70-80% |
| roa | 41.7% | 75%+ | 70-80% |
| current_ratio | 70.6% | 85%+ | 80-90% |
| quick_ratio | 17.6% | 75%+ | 70-80% |
| debt_to_equity | 38.7% | 70%+ | 65-75% |

---

## Monitoring Plan

After implementing fixes:

1. Run validation weekly with `node run-validation.js --full --save`
2. Track accuracy trends over time
3. Investigate any new discrepancies immediately
4. Consider adding automated alerts for accuracy drops

---

*Generated: December 14, 2025*
